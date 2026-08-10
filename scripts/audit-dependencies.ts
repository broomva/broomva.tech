import { createHash } from "node:crypto";

export type Severity = "critical" | "high" | "moderate";
export type Advisory = { severity: string; title: string; url: string };
export type DependencyException = {
  package: string;
  owner: string;
  topologySha256: string;
  rationale: string;
  advisories: string[];
};
export type Baseline = {
  reviewBy: string;
  exceptions: DependencyException[];
};

export function assertReviewDate(reviewBy: string, now = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) {
    throw new Error(
      "Dependency baseline reviewBy must be an ISO date (YYYY-MM-DD).",
    );
  }
  const deadline = new Date(`${reviewBy}T23:59:59Z`);
  if (
    Number.isNaN(deadline.getTime()) ||
    deadline.toISOString().slice(0, 10) !== reviewBy ||
    deadline < now
  ) {
    throw new Error(`Dependency baseline is invalid or expired: ${reviewBy}.`);
  }
}

export function assertAuditProcess(
  exitCode: number,
  signalCode: string | null,
): void {
  if (signalCode || ![0, 1].includes(exitCode)) {
    throw new Error(
      `Dependency audit process failed abnormally (exit ${exitCode}).`,
    );
  }
}

export function assertExceptionShape(exception: DependencyException): void {
  if (
    !exception.package ||
    !exception.owner ||
    exception.rationale.trim().length < 40 ||
    !/^[a-f0-9]{64}$/.test(exception.topologySha256) ||
    !Array.isArray(exception.advisories) ||
    exception.advisories.length === 0
  ) {
    throw new Error(
      `Malformed dependency exception for ${exception.package || "unknown"}.`,
    );
  }
}

export function dependencyTopologyHash(output: string): string {
  const normalized = output
    .split(String.fromCharCode(27))
    .map((chunk, index) =>
      index === 0 ? chunk : chunk.replace(/^\[[0-9;]*[mK]/, ""),
    )
    .join("");
  return createHash("sha256").update(normalized).digest("hex");
}

export function collectAdvisories(report: Record<string, Advisory[]>): {
  current: Set<string>;
  counts: Record<Severity, number>;
} {
  const current = new Set<string>();
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
  };
  for (const [packageName, advisories] of Object.entries(report)) {
    for (const advisory of advisories) {
      if (advisory.severity === "low") continue;
      if (!["critical", "high", "moderate"].includes(advisory.severity)) {
        throw new Error(
          `Unknown dependency advisory severity for ${packageName}: ${advisory.severity}`,
        );
      }
      const severity = advisory.severity as Severity;
      counts[severity] += 1;
      current.add(`${packageName}|${severity}|${advisory.url}`);
    }
  }
  return { current, counts };
}

export function assertExactPolicy(
  current: Set<string>,
  allowed: Set<string>,
): void {
  const unreviewed = [...current].filter((key) => !allowed.has(key));
  const stale = [...allowed].filter((key) => !current.has(key));
  if (unreviewed.length > 0) {
    throw new Error(
      `Unreviewed dependency advisories:\n${unreviewed.join("\n")}`,
    );
  }
  if (stale.length > 0) {
    throw new Error(
      `Stale dependency exceptions must be removed:\n${stale.join("\n")}`,
    );
  }
}

async function main(): Promise<void> {
  const baseline = (await Bun.file(
    new URL("./dependency-audit-baseline.json", import.meta.url),
  ).json()) as Baseline;
  assertReviewDate(baseline.reviewBy);
  if (!Array.isArray(baseline.exceptions)) {
    throw new Error("Dependency baseline exceptions must be an array.");
  }

  const audit = Bun.spawnSync(["bun", "audit", "--json"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  assertAuditProcess(audit.exitCode, audit.signalCode);

  let report: Record<string, Advisory[]>;
  try {
    report = JSON.parse(audit.stdout.toString()) as Record<string, Advisory[]>;
  } catch {
    throw new Error("Dependency audit did not return valid JSON.");
  }
  const { current, counts } = collectAdvisories(report);

  const allowed = new Set<string>();
  for (const exception of baseline.exceptions) {
    assertExceptionShape(exception);
    const why = Bun.spawnSync(["bun", "why", exception.package], {
      stdout: "pipe",
      stderr: "inherit",
    });
    if (why.exitCode !== 0 || why.signalCode) {
      throw new Error(
        `Could not resolve dependency topology for ${exception.package}.`,
      );
    }
    if (
      dependencyTopologyHash(why.stdout.toString()) !== exception.topologySha256
    ) {
      throw new Error(
        `Dependency topology changed for ${exception.package}; review its exception.`,
      );
    }

    for (const advisory of exception.advisories) {
      if (!/^(critical|high|moderate)\|https:\/\//.test(advisory)) {
        throw new Error(
          `Malformed advisory exception for ${exception.package}: ${advisory}`,
        );
      }
      const key = `${exception.package}|${advisory}`;
      if (allowed.has(key))
        throw new Error(`Duplicate dependency exception: ${key}`);
      allowed.add(key);
    }
  }

  assertExactPolicy(current, allowed);
  console.log(
    `Dependency audit: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate; exact topology baseline matched through ${baseline.reviewBy}.`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
