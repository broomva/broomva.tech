import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// GHSA-q84f-53jg-9ppm applies only to Better Auth's opt-in deviceAuthorization
// plugin. Keep the baseline's non-applicability claim tied to the actual config.
const app = new URL("../apps/broomva/", import.meta.url);

test("the local Better Auth server configures agent-auth, not deviceAuthorization", async () => {
	const source = await readFile(new URL("lib/agent-auth.ts", app), "utf8");
	const pluginPath = new URL("node_modules/@better-auth/agent-auth/dist/index.js", app);
	const implementation = await readFile(pluginPath, "utf8");
	expect(implementation).not.toMatch(/\bdeviceAuthorization\b/);
	const { agentAuth } = await import(pluginPath.href);
	const compiled = new Bun.Transpiler({ loader: "ts" })
		.transformSync(source)
		.replace(/^import\s[\s\S]*?;\s*$/gm, "")
		.replace(/^export\s+/gm, "");
	let configured: { plugins: { id: string }[] } | undefined;
	vm.runInNewContext(compiled, {
		process: { env: {} },
		db: {},
		agentAuth,
		drizzleAdapter: () => ({}),
		betterAuth: (options: { plugins: { id: string }[] }) => {
			configured = options;
			return {};
		},
	});
	expect(configured?.plugins.map((plugin) => plugin.id)).toEqual(["agent-auth"]);
});

test("the main auth entry remains the hosted Neon proxy", async () => {
	const source = await readFile(new URL("lib/auth.ts", app), "utf8");
	expect(source).toContain('from "@neondatabase/auth/next/server"');
	expect(source).toContain("createNeonAuth({");
	expect(source).not.toMatch(/\bbetterAuth\s*\(|\bdeviceAuthorization\b/);
});
