import { and, desc, eq, sql } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { swapitFact } from "@/lib/db/schema";
import { commonsStats, listApprovedSince } from "@/lib/db/swapit-facts";

export const metadata = {
  title: "Swapit Commons — household toxics knowledge",
  description:
    "The anonymized, crowd-sourced knowledge commons behind the swapit skill: products, hazards, and safer alternatives. Private inventory never appears here.",
};

const KIND_LABEL: Record<string, string> = {
  product: "Products",
  item_class_hazard: "Hazard edges",
  alternative: "Alternatives",
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default async function SwapitCommonsPage() {
  const stats = await commonsStats();
  const facts = await listApprovedSince(null, 1);

  const byKind: Record<string, typeof facts> = {
    product: [],
    item_class_hazard: [],
    alternative: [],
  };
  for (const f of facts) {
    byKind[f.kind]?.push(f);
  }

  // most-flagged item-classes (approved hazard-edge facts grouped by item_class)
  const flagged = await db
    .select({
      itemClass: sql<string>`${swapitFact.payload}->>'item_class'`,
      count: sql<number>`count(*)::int`,
    })
    .from(swapitFact)
    .where(
      and(
        eq(swapitFact.status, "approved"),
        eq(swapitFact.kind, "item_class_hazard"),
      ),
    )
    .groupBy(sql`${swapitFact.payload}->>'item_class'`)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const empty = stats.factsTotal === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-bold text-3xl tracking-tight">🧪 Swapit Commons</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The anonymized, crowd-sourced knowledge behind the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">swapit</code>{" "}
          skill — products, hazards, and safer alternatives that every
          contributor enriches. Your private household inventory is never sent
          here; only generic, corroborated facts.
        </p>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Approved facts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="font-bold text-3xl"
              style={{ color: "var(--ag-ai-blue)" }}
            >
              {stats.factsApproved}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total contributed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-3xl">{stats.factsTotal}</div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              By kind
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <Badge key={k} variant="secondary">
                {label}: {byKind[k]?.length ?? 0}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </section>

      {empty ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="mb-3">
              No community facts yet — be the first to contribute.
            </p>
            <pre className="mx-auto inline-block rounded-md bg-muted px-4 py-3 text-left text-sm">
              {`npx skills add broomva/skills --skill swapit
swapit sync --configure --broomva
swapit contribute product --name "..." --class <id> --hazard <id>
swapit sync`}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {flagged.length > 0 && (
            <section>
              <h2 className="mb-4 border-b pb-2 font-semibold text-xl">
                Most-flagged item-classes
              </h2>
              <div className="space-y-2">
                {flagged.map((row) => {
                  const max = flagged[0]?.count || 1;
                  return (
                    <div
                      key={row.itemClass}
                      className="flex items-center gap-3"
                    >
                      <div className="w-48 truncate text-sm">
                        {row.itemClass}
                      </div>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((row.count / max) * 100)}%`,
                            backgroundColor: "var(--ag-warning)",
                          }}
                        />
                      </div>
                      <div className="w-8 text-right text-muted-foreground text-sm">
                        {row.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {Object.entries(KIND_LABEL).map(([kind, label]) => {
            const items = byKind[kind] ?? [];
            if (items.length === 0) {
              return null;
            }
            return (
              <section key={kind}>
                <h2 className="mb-4 border-b pb-2 font-semibold text-xl">
                  {label}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.slice(0, 24).map((f) => {
                    const p = f.payload as Record<string, unknown>;
                    const title =
                      asString(p.product_name) ||
                      asString(p.name) ||
                      asString(p.item_class) ||
                      f.id;
                    const sub =
                      kind === "product"
                        ? asString(p.item_class)
                        : kind === "item_class_hazard"
                          ? `${asString(p.item_class)} → ${asString(p.hazard_id)}`
                          : `replaces ${(p.replaces as string[] | undefined)?.join(", ") ?? ""}`;
                    return (
                      <Card key={f.id}>
                        <CardContent className="flex items-start justify-between gap-3 py-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{title}</div>
                            <div className="truncate text-muted-foreground text-sm">
                              {sub}
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            ×{f.corroborationCount}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-12 border-t pt-6 text-muted-foreground text-sm">
        Facts are served once a 2nd independent contributor corroborates them.
        Powered by the{" "}
        <code className="rounded bg-muted px-1 py-0.5">swapit</code> skill ·{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          npx skills add broomva/skills --skill swapit
        </code>
      </footer>
    </div>
  );
}
