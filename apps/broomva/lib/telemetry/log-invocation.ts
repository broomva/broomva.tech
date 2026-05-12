import "server-only";
import { createHash } from "node:crypto";
import { createPromptInvocation } from "@/lib/db/queries";
import { hashIp } from "./ip-hash";
import { getClientIP } from "@/lib/utils/rate-limit";
import type { PromptInvocation } from "@/lib/db/schema";

type ResolvedAuth = {
  userId: string;
  email: string;
  agentId?: string;
};

type InvocationInput = {
  id?: string;
  prompt_slug: string;
  prompt_version: string;
  source: "web" | "cli" | "skill" | "api";
  caller?: string;
  session_id?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

type LogOptions = {
  request: Request;
  input: InvocationInput;
  auth: ResolvedAuth | null;
  rawVars?: boolean;
};

function hashVar(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function logInvocation(opts: LogOptions): Promise<PromptInvocation> {
  const { request, input, auth, rawVars } = opts;
  if (!input.prompt_slug || !input.prompt_version || !input.source) {
    throw new TypeError(
      "logInvocation: prompt_slug, prompt_version, and source are required",
    );
  }

  const ip = getClientIP(request as Request & { ip?: string });
  const clientIpHash = ip ? hashIp(ip) : null;

  const variables = input.variables
    ? Object.fromEntries(
        Object.entries(input.variables).map(([k, v]) => [
          k,
          rawVars ? v : hashVar(v),
        ]),
      )
    : null;

  return createPromptInvocation({
    id: input.id,
    promptSlug: input.prompt_slug,
    promptVersion: input.prompt_version,
    source: input.source,
    caller: input.caller ?? null,
    userId: auth?.userId ?? null,
    agentId: auth?.agentId ?? null,
    sessionId: input.session_id ?? null,
    clientIpHash,
    variables,
    status: input.source === "web" ? "completed" : "pulled",
    completedAt: input.source === "web" ? new Date() : null,
    metadata: input.metadata ?? null,
  });
}
