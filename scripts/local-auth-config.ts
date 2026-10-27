import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Evaluates apps/broomva/lib/agent-auth.ts with the real installed agent-auth
// plugin factory, stubbing only the database and Better Auth construction, so
// advisory applicability tests inspect the options the server actually builds.
export const app = new URL("../apps/broomva/", import.meta.url);
export const agentAuthPluginPath = new URL(
  "node_modules/@better-auth/agent-auth/dist/index.js",
  app,
);

export type LocalAuthOptions = Record<string, unknown> & {
  plugins: { id: string }[];
};

export async function loadLocalAuthOptions(): Promise<LocalAuthOptions> {
  const source = await readFile(new URL("lib/agent-auth.ts", app), "utf8");
  const { agentAuth } = await import(agentAuthPluginPath.href);
  const compiled = new Bun.Transpiler({ loader: "ts" })
    .transformSync(source)
    .replace(/^import\s[\s\S]*?;\s*$/gm, "")
    .replace(/^export\s+/gm, "");
  let configured: LocalAuthOptions | undefined;
  vm.runInNewContext(compiled, {
    process: { env: {} },
    db: {},
    agentAuth,
    drizzleAdapter: () => ({}),
    betterAuth: (options: LocalAuthOptions) => {
      configured = options;
      return {};
    },
  });
  if (!configured) throw new Error("lib/agent-auth.ts did not call betterAuth().");
  return configured;
}
