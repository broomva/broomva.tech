/** Import a reviewed local release bundle, or verify the committed snapshot.
 * bun scripts/sync-agent-workspaces.ts --from /path/to/agent-workspaces/dist
 * bun scripts/sync-agent-workspaces.ts --check
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentWorkspaces } from "../apps/broomva/lib/agent-workspaces";

const root = path.resolve(import.meta.dir, "..");
const target = path.join(root, "apps/broomva/public", agentWorkspaces.base);
const pinPath = path.join(
	root,
	"apps/broomva/lib/agent-workspaces-release.json",
);
const args = process.argv.slice(2);
const from = args.indexOf("--from");
const check = args.length === 1 && args[0] === "--check";
if (!check && (from !== 0 || args.length !== 2 || !args[1])) {
	throw new Error("Use --check or --from /path/to/reviewed/dist");
}
const source = check ? target : path.resolve(args[1]);
const digest = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
const manifestBytes = await readFile(path.join(source, "release.json"));
const manifest = JSON.parse(manifestBytes.toString());
if (
	manifest.version !== agentWorkspaces.version ||
	!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
) {
	throw new Error("Release version or source commit is invalid");
}
if (
	!manifest.files ||
	Array.isArray(manifest.files) ||
	typeof manifest.files !== "object"
) {
	throw new Error("Release must enumerate its files and SHA-256 hashes");
}
const allowed =
	/^(?:deck\/(?:index\.html|preview\.webp|fonts\/[A-Za-z0-9_.-]+)|downloads\/agent-workspaces-(?:slides|guide)\.pdf|script\.md|resources\.md)$/;
const names = Object.keys(manifest.files);
const required = [
	"deck/index.html",
	"deck/preview.webp",
	"downloads/agent-workspaces-slides.pdf",
	"downloads/agent-workspaces-guide.pdf",
	"script.md",
	"resources.md",
];
for (const file of required) {
	if (!names.includes(file))
		throw new Error(`Missing release artifact: ${file}`);
}
const verified = new Map<string, Buffer>();
for (const name of names) {
	const expected = manifest.files[name];
	if (!allowed.test(name) || !/^[a-f0-9]{64}$/.test(expected)) {
		throw new Error(`Invalid release entry: ${name}`);
	}
	const bytes = await readFile(path.join(source, name));
	if (digest(bytes) !== expected) throw new Error(`Checksum mismatch: ${name}`);
	verified.set(name, bytes);
}
const pin = {
	repository: agentWorkspaces.repository,
	tag: `v${manifest.version}`,
	sourceCommit: manifest.sourceCommit,
	manifestSha256: digest(manifestBytes),
};
if (check) {
	const committed = JSON.parse(await readFile(pinPath, "utf8"));
	if (JSON.stringify(committed) !== JSON.stringify(pin))
		throw new Error("Release does not match its committed source pin");
	const actual = (
		await readdir(target, { recursive: true, withFileTypes: true })
	)
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path.relative(target, path.join(entry.parentPath, entry.name)),
		);
	const declared = new Set([...names, "release.json"]);
	if (actual.some((name) => !declared.has(name)))
		throw new Error("Undeclared file in release directory");
} else {
	// Validate every file before writing anything. Existing releases are immutable.
	for (const [name, bytes] of [
		...verified,
		["release.json", manifestBytes] as const,
	]) {
		const destination = path.join(target, name);
		try {
			const previous = await readFile(destination);
			if (!previous.equals(bytes))
				throw new Error(
					`Release already exists with different bytes: ${name}. Publish a new version.`,
				);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	for (const [name, bytes] of [
		...verified,
		["release.json", manifestBytes] as const,
	]) {
		const destination = path.join(target, name);
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, bytes);
	}
	await writeFile(pinPath, `${JSON.stringify(pin, null, 2)}\n`);
}
console.log(
	`${check ? "Verified" : "Imported"} Agent workspaces ${manifest.version}: ${names.length} files at ${manifest.sourceCommit}`,
);
