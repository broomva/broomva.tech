import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEARCH_DIRS = ["app", "content", "docs"];
const FILE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".md", ".mdx"]);
const CONTENT_KINDS = ["notes", "projects", "writing"];
const CHECK_EXTERNAL = process.argv.includes("--external");
const REQUEST_HEADERS = {
	"user-agent": "Mozilla/5.0 (compatible; broomva.tech-link-checker/1.0)",
};

function isHttpUrl(value) {
	return value.startsWith("http://") || value.startsWith("https://");
}

function isLocalDevUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function isSkippable(value) {
	return (
		value.startsWith("mailto:") ||
		value.startsWith("tel:") ||
		value.startsWith("javascript:") ||
		value.startsWith("data:") ||
		value.startsWith("#")
	);
}

async function walkFiles(dir) {
	const full = path.join(ROOT, dir);
	const entries = await fs.readdir(full, { withFileTypes: true });

	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolute = path.join(full, entry.name);
			if (entry.isDirectory()) {
				return walkAbsoluteFiles(absolute);
			}
			return [absolute];
		}),
	);

	return nested.flat();
}

async function walkAbsoluteFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolute = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				return walkAbsoluteFiles(absolute);
			}
			return [absolute];
		}),
	);

	return nested.flat();
}

function extractLinks(text) {
	const links = [];
	const jsxHrefRegex = /href\s*=\s*(["'`])([^"'`]+)\1/g;
	const markdownRegex = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]+")?\)/g;
	const rawUrlRegex = /https?:\/\/[^\s"'`<>)]+/g;

	for (const match of text.matchAll(jsxHrefRegex)) {
		links.push(match[2]);
	}

	for (const match of text.matchAll(markdownRegex)) {
		links.push(match[1]);
	}

	for (const match of text.matchAll(rawUrlRegex)) {
		links.push(match[0].replace(/[.,;]+$/, ""));
	}

	return links;
}

function normalizeInternalPath(value) {
	const [pathWithoutHash] = value.split("#");
	const [pathWithoutQuery] = pathWithoutHash.split("?");
	if (!pathWithoutQuery || pathWithoutQuery === "") {
		return "/";
	}

	const normalized = pathWithoutQuery.endsWith("/") && pathWithoutQuery !== "/"
		? pathWithoutQuery.slice(0, -1)
		: pathWithoutQuery;

	return normalized;
}

async function fileExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function getKnownInternalPaths() {
	const known = new Set(["/", "/contact", "/start-here", "/projects", "/writing", "/notes", "/now"]);

	for (const kind of CONTENT_KINDS) {
		const dir = path.join(ROOT, "content", kind);
		let files = [];
		try {
			files = await fs.readdir(dir);
		} catch {
			files = [];
		}

		for (const file of files) {
			const slug = file.replace(/\.(md|mdx)$/, "");
			known.add(`/${kind}/${slug}`);
		}
	}

	return known;
}

async function validateRelativePath(sourceFile, link) {
	const sourceDir = path.dirname(sourceFile);
	const [withoutHash] = link.split("#");
	const [withoutQuery] = withoutHash.split("?");
	const resolved = path.resolve(sourceDir, withoutQuery);
	if (await fileExists(resolved)) return true;
	if (await fileExists(`${resolved}.md`)) return true;
	if (await fileExists(`${resolved}.mdx`)) return true;
	if (await fileExists(path.join(resolved, "index.md"))) return true;
	if (await fileExists(path.join(resolved, "index.mdx"))) return true;
	return false;
}

function withTimeout(url, timeoutMs) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	return { signal: controller.signal, cancel: () => clearTimeout(timeout), url };
}

async function checkExternalUrl(url) {
	const target = withTimeout(url, 12000);
	try {
		const head = await fetch(target.url, {
			method: "HEAD",
			redirect: "follow",
			signal: target.signal,
			headers: REQUEST_HEADERS,
		});
		target.cancel();

		if (head.status < 400 || (url.includes("linkedin.com") && head.status === 999)) {
			return { ok: true, status: head.status };
		}

		const getTarget = withTimeout(url, 12000);
		const get = await fetch(getTarget.url, {
			method: "GET",
			redirect: "follow",
			signal: getTarget.signal,
			headers: REQUEST_HEADERS,
		});
		getTarget.cancel();
		if (get.status < 400 || (url.includes("linkedin.com") && get.status === 999)) {
			return { ok: true, status: get.status };
		}
		return { ok: false, status: get.status };
	} catch (error) {
		target.cancel();
		return {
			ok: false,
			status: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function main() {
	const files = (
		await Promise.all(
			SEARCH_DIRS.map(async (dir) => {
				const absoluteDir = path.join(ROOT, dir);
				try {
					await fs.access(absoluteDir);
					return walkFiles(dir);
				} catch {
					return [];
				}
			}),
		)
	).flat();

	const textFiles = files.filter((file) => FILE_EXTENSIONS.has(path.extname(file)));
	const knownInternalPaths = await getKnownInternalPaths();
	const issues = [];
	const externalLinks = new Set();
	let scannedLinks = 0;

	for (const file of textFiles) {
		const text = await fs.readFile(file, "utf8");
		const links = extractLinks(text);

		for (const link of links) {
			scannedLinks += 1;
			if (!link || isSkippable(link)) {
				continue;
			}

			if (isHttpUrl(link)) {
				if (!isLocalDevUrl(link)) {
					externalLinks.add(link);
				}
				continue;
			}

			if (link.startsWith("/")) {
				const normalized = normalizeInternalPath(link);
				if (!knownInternalPaths.has(normalized)) {
					issues.push({
						type: "internal",
						file,
						link,
						reason: `Unknown route: ${normalized}`,
					});
				}
				continue;
			}

			const validRelative = await validateRelativePath(file, link);
			if (!validRelative) {
				issues.push({
					type: "relative",
					file,
					link,
					reason: "Relative file path does not exist",
				});
			}
		}
	}

	if (CHECK_EXTERNAL) {
		for (const url of externalLinks) {
			const result = await checkExternalUrl(url);
			if (!result.ok) {
				issues.push({
					type: "external",
					file: "(multiple)",
					link: url,
					reason: result.error ? `Request failed: ${result.error}` : `Unexpected status: ${result.status}`,
				});
			}
		}
	}

	if (issues.length > 0) {
		console.error(`Link check failed with ${issues.length} issue(s).`);
		for (const issue of issues) {
			const relativeFile = issue.file === "(multiple)" ? issue.file : path.relative(ROOT, issue.file);
			console.error(`- [${issue.type}] ${relativeFile} -> ${issue.link} (${issue.reason})`);
		}
		process.exit(1);
	}

	console.log(
		`Link check passed. Scanned ${textFiles.length} files, ${scannedLinks} links, and ${externalLinks.size} external URL(s). External checks: ${CHECK_EXTERNAL ? "enabled" : "disabled"}.`,
	);
}

main().catch((error) => {
	console.error("Link check crashed.");
	console.error(error);
	process.exit(1);
});
