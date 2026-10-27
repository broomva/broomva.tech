import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
	agentAuthPluginPath,
	app,
	loadLocalAuthOptions,
} from "./local-auth-config";

// GHSA-q84f-53jg-9ppm applies only to Better Auth's opt-in deviceAuthorization
// plugin. Keep the baseline's non-applicability claim tied to the actual config.

test("the local Better Auth server configures agent-auth, not deviceAuthorization", async () => {
	const implementation = await readFile(agentAuthPluginPath, "utf8");
	expect(implementation).not.toMatch(/\bdeviceAuthorization\b/);
	const configured = await loadLocalAuthOptions();
	expect(configured.plugins.map((plugin) => plugin.id)).toEqual(["agent-auth"]);
});

test("the main auth entry remains the hosted Neon proxy", async () => {
	const source = await readFile(new URL("lib/auth.ts", app), "utf8");
	expect(source).toContain('from "@neondatabase/auth/next/server"');
	expect(source).toContain("createNeonAuth({");
	expect(source).not.toMatch(/\bbetterAuth\s*\(|\bdeviceAuthorization\b/);
});
