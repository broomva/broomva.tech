import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createHttp2Server } from "node:http2";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { describe, expect, it } from "vitest";
import { createServerClient } from "./client.js";
import { Events } from "./gen/life/v1/events_connect.js";
import { Identity } from "./gen/life/v1/identity_connect.js";

// Resolve the actual Undici 5 dependency used by ConnectRPC, not Bun's fetch
// or the application's direct Undici 7. This exercises the scoped Busboy 3 swap.
const require = createRequire(import.meta.url);
const connectRequire = createRequire(
	require.resolve("@connectrpc/connect-node"),
);
const undiciRequire = createRequire(connectRequire.resolve("undici"));
const undici = connectRequire("undici") as {
	fetch: typeof fetch;
	Response: typeof Response;
};

describe("patched transport compatibility", () => {
	it("uses Busboy 3.2.2 and parses fragmented HTTP multipart with files and duplicate fields", async () => {
		expect(undiciRequire("@fastify/busboy/package.json").version).toBe("3.2.2");
		const body = [
			"--boundary\r\nContent-Disposition: form-data; name=tag\r\n\r\none\r\n",
			"--boundary\r\nContent-Disposition: form-data; name=tag\r\n\r\ntwo\r\n",
		];
		body.push(
			'--boundary\r\nContent-Disposition: form-data; name=file; filename="a.txt"\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n',
			"--boundary--\r\n",
		);
		const server = createServer((_req, res) => {
			res.setHeader("content-type", "multipart/form-data; boundary=boundary");
			const bytes = Buffer.from(body.join(""));
			for (let i = 0; i < bytes.length; i += 7)
				res.write(bytes.subarray(i, i + 7));
			res.end();
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		try {
			const response = await undici.fetch(
				`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
			);
			const form = await response.formData();
			expect(form.getAll("tag")).toEqual(["one", "two"]);
			const file = form.get("file") as File;
			expect(file.name).toBe("a.txt");
			expect(await file.text()).toBe("hello");
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	it("handles inherited multipart header names and rejects truncated bodies", async () => {
		for (const name of ["__proto__", "constructor"]) {
			const response = new undici.Response(
				`--b\r\n${name}: value\r\nContent-Disposition: form-data; name=x\r\n\r\nok\r\n--b--\r\n`,
				{ headers: { "content-type": "multipart/form-data; boundary=b" } },
			);
			expect((await response.formData()).get("x")).toBe("ok");
		}
		await expect(
			new undici.Response("--b\r\n", {
				headers: { "content-type": "multipart/form-data; boundary=b" },
			}).formData(),
		).rejects.toThrow();
	});

	it("preserves real HTTP/2 gRPC unary and streaming calls with fresh bearer tokens", async () => {
		const tokens: string[] = [];
		const server = createHttp2Server(
			connectNodeAdapter({
				routes(router) {
					router.service(Identity, {
						me(_request, context) {
							tokens.push(context.requestHeader.get("authorization") ?? "");
							return { userId: "test-user", displayName: "Test" };
						},
					});
					router.service(Events, {
						async *read(_request, context) {
							tokens.push(context.requestHeader.get("authorization") ?? "");
							yield { sequence: 1n, kind: "first" };
							yield { sequence: 2n, kind: "second" };
						},
					});
				},
			}),
		);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		try {
			let counter = 0;
			const client = createServerClient({
				baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
				getToken: async () => `token-${++counter}`,
			});
			expect((await client.identity.me({})).userId).toBe("test-user");
			const events = [];
			for await (const event of client.events.read({})) events.push(event.kind);
			expect(events).toEqual(["first", "second"]);
			expect(tokens).toEqual(["Bearer token-1", "Bearer token-2"]);
		} finally {
			server.close();
		}
	});
});
