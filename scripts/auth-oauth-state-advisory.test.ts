import { expect, test } from "bun:test";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
	agentAuthPluginPath,
	app,
	loadLocalAuthOptions,
} from "./local-auth-config";

// GHSA-965c-763c-88jm (OAuth state accepted as a Magic Link token) needs a
// server running magicLink() together with social or Generic OAuth sign-in.
// GHSA-r4xp-prcw-77qf needs a server running oauthProxy(). The local server is
// upgraded past both; the remaining Better Auth 1.4.18 copy belongs to Neon
// Auth's client adapters. These tests tie the baseline's conditional record to
// the installed code and the actual local configuration.

const appDir = fileURLToPath(app);
const AFFECTED = /\b(magicLink|oauthProxy|genericOAuth|socialProviders)\b/;
const CLIENT_SUBPATHS = new Set([
	"better-auth/client",
	"better-auth/client/plugins",
	"better-auth/cookies",
	"better-auth/react",
	"better-auth/types",
]);

async function packageVersion(dir: string): Promise<string> {
	const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
	return pkg.version;
}

function bareImports(source: string): string[] {
	const specifiers = [
		...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g),
	].map((match) => match[1]);
	return [...new Set(specifiers)];
}

// Walks relative imports from a package entry and returns every bare
// specifier the entry can load at runtime.
async function runtimeImports(entry: string): Promise<Set<string>> {
	const seen = new Set<string>();
	const bare = new Set<string>();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		for (const specifier of bareImports(await readFile(file, "utf8"))) {
			if (specifier.startsWith(".")) queue.push(join(dirname(file), specifier));
			else bare.add(specifier);
		}
	}
	return bare;
}

async function sourceFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (["node_modules", ".next", "public"].includes(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
		else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) out.push(path);
	}
	return out;
}

test("every in-process Better Auth server copy is past the fixed release", async () => {
	const local = await realpath(join(appDir, "node_modules/better-auth"));
	const plugin = await realpath(fileURLToPath(agentAuthPluginPath));
	const peer = await realpath(join(plugin, "../../../../better-auth"));
	expect(peer).toBe(local);
	expect(Bun.semver.satisfies(await packageVersion(local), ">=1.7.7")).toBe(true);
});

test("the local server enables none of the affected plugins or sign-in methods", async () => {
	const configured = await loadLocalAuthOptions();
	expect(configured.plugins.map((plugin) => plugin.id)).toEqual(["agent-auth"]);
	for (const key of ["socialProviders", "genericOAuth"]) {
		expect(configured[key]).toBeUndefined();
	}
	const implementation = await readFile(agentAuthPluginPath, "utf8");
	expect(implementation).not.toMatch(AFFECTED);
});

test("only lib/agent-auth.ts constructs a Better Auth server in the app", async () => {
	const users: string[] = [];
	for (const file of await sourceFiles(appDir)) {
		const imports = bareImports(await readFile(file, "utf8")).filter(
			(specifier) =>
				specifier === "better-auth" ||
				specifier.startsWith("better-auth/") ||
				specifier.startsWith("@better-auth/"),
		);
		if (imports.length > 0) users.push(`${relative(appDir, file)}: ${imports.sort().join(", ")}`);
	}
	expect(users.sort()).toEqual([
		"app/api/auth/agent-protocol/[...path]/route.ts: better-auth/next-js",
		"lib/agent-auth.ts: @better-auth/agent-auth, better-auth, better-auth/adapters/drizzle",
	]);
});

test("Neon Auth loads only client-side Better Auth 1.4.x modules in-process", async () => {
	const neon = await realpath(join(appDir, "node_modules/@neondatabase/auth"));
	const neonBetterAuth = join(neon, "../../better-auth");
	expect(Bun.semver.satisfies(await packageVersion(neonBetterAuth), "<1.7.7")).toBe(true);

	const appImports = new Set<string>();
	for (const file of await sourceFiles(appDir)) {
		for (const specifier of bareImports(await readFile(file, "utf8"))) {
			if (specifier.startsWith("@neondatabase/auth")) appImports.add(specifier);
		}
	}
	expect([...appImports].sort()).toEqual([
		"@neondatabase/auth/next",
		"@neondatabase/auth/next/server",
	]);

	for (const entry of ["dist/next/index.mjs", "dist/next/server/index.mjs"]) {
		const loaded = [...(await runtimeImports(join(neon, entry)))];
		const betterAuth = loaded.filter(
			(specifier) =>
				specifier === "better-auth" ||
				specifier.startsWith("better-auth/") ||
				specifier.startsWith("@better-auth/"),
		);
		expect(betterAuth.length).toBeGreaterThan(0);
		for (const specifier of betterAuth) expect([...CLIENT_SUBPATHS]).toContain(specifier);
		expect(loaded.filter((s) => /auth-ui|@daveyplate/.test(s))).toEqual([]);
	}

	const route = await readFile(join(appDir, "app/api/auth/[...path]/route.ts"), "utf8");
	expect(route).toContain("auth.handler()");
	expect(route).toContain('from "@/lib/auth"');
});
