import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const contentKinds = ["notes", "projects", "writing"];

function isIsoDate(value) {
	const timestamp = new Date(value).getTime();
	return !Number.isNaN(timestamp);
}

describe("content files", () => {
	for (const kind of contentKinds) {
		it(`${kind} has at least one published file`, async () => {
			const dir = path.join(ROOT, "content", kind);
			const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".mdx"));
			assert.ok(files.length > 0, `expected at least one .mdx file in content/${kind}`);
		});

		it(`${kind} files include valid frontmatter`, async () => {
			const dir = path.join(ROOT, "content", kind);
			const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".mdx"));

			for (const file of files) {
				const raw = await fs.readFile(path.join(dir, file), "utf8");
				const parsed = matter(raw);
				const data = parsed.data;
				const normalizedDate = data.date instanceof Date ? data.date.toISOString() : data.date;

				assert.equal(typeof data.title, "string", `${kind}/${file} missing title`);
				assert.equal(typeof data.summary, "string", `${kind}/${file} missing summary`);
				assert.equal(typeof normalizedDate, "string", `${kind}/${file} missing date`);
				assert.ok(isIsoDate(normalizedDate), `${kind}/${file} has invalid date`);

				if (kind === "projects" && Array.isArray(data.links)) {
					for (const link of data.links) {
						assert.equal(typeof link.label, "string", `${kind}/${file} has invalid link label`);
						assert.equal(typeof link.url, "string", `${kind}/${file} has invalid link url`);
						assert.ok(
							link.url.startsWith("https://"),
							`${kind}/${file} project links should be https URLs`,
						);
					}
				}
			}
		});
	}
});
