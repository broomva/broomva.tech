import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporary: string[] = [];
afterEach(async () => {
	await Promise.all(
		temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "aw-import-test-"));
	temporary.push(root);
	await mkdir(path.join(root, "scripts"));
	await mkdir(path.join(root, "apps/broomva/lib"), { recursive: true });
	await cp(
		path.join(import.meta.dir, "sync-agent-workspaces.ts"),
		path.join(root, "scripts/sync-agent-workspaces.ts"),
	);
	await cp(
		path.join(import.meta.dir, "../apps/broomva/lib/agent-workspaces.ts"),
		path.join(root, "apps/broomva/lib/agent-workspaces.ts"),
	);
	const dist = path.join(root, "dist");
	const entries = [
		"deck/index.html",
		"deck/narration/river.mp3",
		"deck/narration/CREDITS.md",
		"NOTICE",
		"LICENSE",
		"LICENSE-CONTENT",
		"ATTRIBUTION.md",
		"deck/preview.webp",
		"downloads/agent-workspaces-slides.pdf",
		"downloads/agent-workspaces-guide.pdf",
		"script.md",
		"resources.md",
	];
	const files: Record<string, string> = {};
	for (const name of entries) {
		const destination = path.join(dist, name);
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, name);
		files[name] = createHash("sha256").update(name).digest("hex");
	}
	const manifest = { version: "1.1.0", sourceCommit: "a".repeat(40), files };
	const writeManifest = () =>
		writeFile(path.join(dist, "release.json"), JSON.stringify(manifest));
	await writeManifest();
	const run = (...args: string[]) => {
		const result = Bun.spawnSync(
			[process.execPath, "scripts/sync-agent-workspaces.ts", ...args],
			{ cwd: root },
		);
		return {
			status: result.exitCode,
			output: new TextDecoder().decode(result.stderr),
		};
	};
	return { root, dist, manifest, writeManifest, run };
}

test("imports a verified bundle and detects subsequent artifact tampering", async () => {
	const f = await fixture();
	expect(f.run("--from", f.dist).status).toBe(0);
	expect(f.run("--check").status).toBe(0);
	const target = path.join(
		f.root,
		"apps/broomva/public/agent-workspaces/v1.1.0/deck/index.html",
	);
	await writeFile(target, "modified after review");
	const result = f.run("--check");
	expect(result.status).not.toBe(0);
	expect(result.output).toContain("Checksum mismatch");
});

test("rejects a traversal entry before copying any files", async () => {
	const f = await fixture();
	f.manifest.files["../outside.txt"] = "a".repeat(64);
	await f.writeManifest();
	const result = f.run("--from", f.dist);
	expect(result.status).not.toBe(0);
	expect(result.output).toContain("Invalid release entry");
	expect(
		await Bun.file(
			path.join(f.root, "apps/broomva/lib/agent-workspaces-release.json"),
		).exists(),
	).toBe(false);
});

test("refuses different bytes for an existing version and retains the original", async () => {
	const f = await fixture();
	expect(f.run("--from", f.dist).status).toBe(0);
	await writeFile(path.join(f.dist, "resources.md"), "replacement");
	f.manifest.files["resources.md"] = createHash("sha256")
		.update("replacement")
		.digest("hex");
	await f.writeManifest();
	const result = f.run("--from", f.dist);
	expect(result.status).not.toBe(0);
	expect(result.output).toContain(
		"Release already exists with different bytes",
	);
	expect(
		await readFile(
			path.join(
				f.root,
				"apps/broomva/public/agent-workspaces/v1.1.0/resources.md",
			),
			"utf8",
		),
	).toBe("resources.md");
});


test("refuses each missing narration or legal artifact before any write", async () => {
	for (const name of [
		"deck/narration/river.mp3",
		"deck/narration/CREDITS.md",
		"NOTICE",
		"LICENSE",
		"LICENSE-CONTENT",
		"ATTRIBUTION.md",
	]) {
		const f = await fixture();
		delete f.manifest.files[name];
		await f.writeManifest();
		const result = f.run("--from", f.dist);
		expect(result.status).not.toBe(0);
		expect(result.output).toContain(`Missing release artifact: ${name}`);
		expect(await Bun.file(path.join(f.root, "apps/broomva/lib/agent-workspaces-release.json")).exists()).toBe(false);
	}
});
