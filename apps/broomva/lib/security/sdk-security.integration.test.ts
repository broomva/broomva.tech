import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import FirecrawlApp from "@mendable/firecrawl-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const require = createRequire(import.meta.url);
const baseRequire = createRequire(require.resolve("@base-org/account"));
const cdpRoot = dirname(baseRequire.resolve("@coinbase/cdp-sdk"));

describe("reviewed Zod 4 SDK adapters", () => {
  it("initializes and calls an authenticated MCP tool over HTTP with Zod 4 validation", async () => {
    const server = createServer(async (req, res) => {
      if (req.headers.authorization !== "Bearer test-mcp") {
        res.writeHead(401).end();
        return;
      }
      const mcp = new McpServer({ name: "security-test", version: "1.0.0" });
      mcp.registerTool(
        "echo",
        { inputSchema: { text: z.string().max(20) } },
        async ({ text }) => ({ content: [{ type: "text", text }] }),
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcp.connect(transport);
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await transport.handleRequest(req, res);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = new URL(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,
    );
    const client = new Client({ name: "test", version: "1.0.0" });
    try {
      expect((await fetch(url, { method: "POST" })).status).toBe(401);
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: { headers: { authorization: "Bearer test-mcp" } },
        }),
      );
      expect(
        (await client.callTool({ name: "echo", arguments: { text: "hello" } }))
          .content,
      ).toEqual([{ type: "text", text: "hello" }]);
      expect(
        (
          await client.callTool({
            name: "echo",
            arguments: { text: "x".repeat(21) },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("preserves Coinbase ESM/CJS typed-data records, ABI and policy validation", async () => {
    const esm = await import(
      pathToFileURL(join(cdpRoot, "../_esm/policies/evmSchema.js")).href
    );
    const cjs = baseRequire(join(cdpRoot, "policies/evmSchema.js"));
    const valid = {
      type: "evmTypedDataField",
      types: {
        types: { Order: [{ name: "price", type: "uint256" }] },
        primaryType: "Order",
      },
      conditions: [{ path: "price", value: "10", operator: "<=" }],
    };
    for (const schemas of [esm, cjs]) {
      expect(schemas.SignEvmTypedDataFieldCriterionSchema.parse(valid)).toEqual(
        valid,
      );
      expect(
        schemas.SignEvmTypedDataFieldCriterionSchema.safeParse({
          ...valid,
          types: { ...valid.types, types: { Order: [{ name: 1 }] } },
        }).success,
      ).toBe(false);
      expect(
        schemas.EvmAddressCriterionSchema.safeParse({
          type: "evmAddress",
          addresses: ["not-an-address"],
          operator: "in",
        }).success,
      ).toBe(false);
    }
    const cdpRequire = createRequire(baseRequire.resolve("@coinbase/cdp-sdk"));
    const { Abi } = cdpRequire("abitype/zod");
    expect(
      Abi.safeParse([
        {
          type: "function",
          name: "balanceOf",
          inputs: [],
          outputs: [],
          stateMutability: "view",
        },
      ]).success,
    ).toBe(true);
    expect(
      Abi.safeParse([{ type: "function", inputs: [{ type: "invalid" }] }])
        .success,
    ).toBe(false);
    const { CreatePolicyBodySchema } = baseRequire(
      join(cdpRoot, "policies/types.js"),
    );
    expect(
      CreatePolicyBodySchema.safeParse({ scope: "invalid", rules: [] }).success,
    ).toBe(false);
    // Load both public entry points: catches schema construction failures on import.
    expect(baseRequire("@coinbase/cdp-sdk").CdpClient).toBeTypeOf("function");
    expect(
      (await import(pathToFileURL(join(cdpRoot, "../_esm/index.js")).href))
        .CdpClient,
    ).toBeTypeOf("function");
  });

  it("rejects oversized constrained collections before walking elements", () => {
    let parsed = 0;
    const element = z.string().refine(() => {
      parsed += 1;
      return true;
    });
    expect(
      z.array(element).max(2).safeParse(Array(1000).fill("x")).success,
    ).toBe(false);
    expect(parsed).toBe(0);
    expect(
      z
        .set(element)
        .max(2)
        .safeParse(new Set(["a", "b", "c"])).success,
    ).toBe(false);
    expect(
      z
        .map(element, element)
        .max(2)
        .safeParse(
          new Map([
            ["a", "b"],
            ["c", "d"],
            ["e", "f"],
          ]),
        ).success,
    ).toBe(false);
    expect(parsed).toBe(0);
  });

  it("preserves Firecrawl search/scrape and asynchronous extract over real HTTP with Zod 4 JSON schema", async () => {
    const requests: {
      path: string;
      body: Record<string, unknown>;
      auth?: string;
    }[] = [];
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {};
      requests.push({
        path: req.url ?? "",
        body,
        auth: req.headers.authorization,
      });
      res.setHeader("content-type", "application/json");
      const data =
        req.url === "/v1/extract"
          ? { success: true, id: "job" }
          : req.url === "/v1/extract/job"
            ? {
                success: true,
                status: "completed",
                data: { title: "Extracted" },
              }
            : req.url === "/v1/search"
              ? {
                  success: true,
                  data: [
                    {
                      title: "Found",
                      url: "https://example.test",
                      markdown: "text",
                    },
                  ],
                }
              : {
                  success: true,
                  data: { markdown: "text", metadata: { title: "Page" } },
                };
      res.end(JSON.stringify(data));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const schema = z.object({ title: z.string() });
      // Both published module formats must use the patched converter.
      const constructors = [
        FirecrawlApp,
        require("@mendable/firecrawl-js").default,
      ];
      for (const Constructor of constructors) {
        const client = new Constructor({ apiKey: "test-key", apiUrl });
        expect(
          (await client.scrapeUrl("https://example.test")).metadata?.title,
        ).toBe("Page");
        expect((await client.search("test", { limit: 2 })).data[0].title).toBe(
          "Found",
        );
        expect(
          (await client.extract(["https://example.test"], { schema })).data
            ?.title,
        ).toBe("Extracted");
      }
      const extracts = requests.filter(
        (request) => request.path === "/v1/extract",
      );
      expect(extracts).toHaveLength(2);
      for (const request of extracts) {
        expect(request.body.schema).toMatchObject({
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
        });
        expect(request.auth).toBe("Bearer test-key");
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves Sandbox create, streamed command completion and stop with its supported Zod 4 API", async () => {
    const session = {
      id: "session-test",
      memory: 2048,
      vcpus: 1,
      region: "iad1",
      runtime: "python3.13",
      timeout: 60000,
      status: "running",
      requestedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      cwd: "/vercel/sandbox",
    };
    const sandbox = {
      name: "test",
      persistent: false,
      createdAt: 1,
      updatedAt: 1,
      currentSessionId: session.id,
      status: "running",
    };
    const command = {
      id: "cmd-test",
      name: "python",
      args: ["-c", "print(1)"],
      cwd: session.cwd,
      sessionId: session.id,
      exitCode: null,
      startedAt: 1,
    };
    const requests: string[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer test-token",
      );
      if (url.pathname.endsWith("/cmd")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          command: "python",
          args: command.args,
          wait: true,
        });
        return new Response(
          `${JSON.stringify({ command })}\n${JSON.stringify({ command: { ...command, exitCode: 0 } })}\n`,
          { headers: { "content-type": "application/x-ndjson" } },
        );
      }
      return Response.json(
        url.pathname.endsWith("/stop")
          ? {
              session: { ...session, status: "stopped" },
              sandbox: { ...sandbox, status: "stopped" },
            }
          : { session, sandbox, routes: [] },
      );
    };
    const client = await Sandbox.create({
      token: "test-token",
      teamId: "team-test",
      projectId: "project-test",
      runtime: "python3.13",
      fetch: mockFetch,
    });
    const result = await client.runCommand({
      cmd: "python",
      args: command.args,
    });
    expect(result.exitCode).toBe(0);
    await client.stop();
    expect(requests).toEqual([
      "/api/v2/sandboxes",
      "/api/v2/sandboxes/sessions/session-test/cmd",
      "/api/v2/sandboxes/sessions/session-test/stop",
    ]);
  });
});
