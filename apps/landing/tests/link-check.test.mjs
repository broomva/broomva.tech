import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

describe("link checker", () => {
	it("passes for internal links", () => {
		const result = spawnSync("node", ["scripts/check-links.mjs"], {
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});
});
