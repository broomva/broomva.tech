import { describe, expect, it } from "vitest";
import { staticTokenProvider } from "./auth.js";
import { createBrowserClient, createServerClient } from "./client.js";

describe("createBrowserClient", () => {
  it("returns clients for all four life.v1 services", () => {
    const client = createBrowserClient({
      proxyBaseUrl: "https://example.test/api/life-proxy",
      wsBaseUrl: "wss://example.test",
      getToken: staticTokenProvider("test-jwt"),
    });
    expect(client.agent).toBeDefined();
    expect(client.events).toBeDefined();
    expect(client.identity).toBeDefined();
    expect(client.wallet).toBeDefined();
  });
});

describe("createServerClient", () => {
  it("returns clients for all four life.v1 services", () => {
    const client = createServerClient({
      baseUrl: "http://lifed.internal:8081",
      getToken: staticTokenProvider("test-jwt"),
    });
    expect(client.agent).toBeDefined();
    expect(client.events).toBeDefined();
    expect(client.identity).toBeDefined();
    expect(client.wallet).toBeDefined();
  });
});
