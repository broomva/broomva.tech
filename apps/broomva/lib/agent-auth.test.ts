import { describe, expect, it, vi } from "vitest";

// Same shape as production: a Drizzle client built without a schema. postgres()
// connects lazily, and none of the endpoints below touch the database.
vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  return { db: drizzle(postgres("postgres://agent-auth-test@127.0.0.1:1/none")) };
});

const { agentAuthInstance } = await import("@/lib/agent-auth");

const BASE = "https://broomva.tech/api/auth/agent-protocol";

function call(path: string, init?: RequestInit) {
  return agentAuthInstance.handler(new Request(`${BASE}${path}`, init));
}

describe("agent-auth Better Auth server", () => {
  it("serves discovery and capability endpoints without a database schema", async () => {
    const ok = await call("/ok");
    expect(ok.status).toBe(200);

    const discovery = await call("/agent-configuration");
    expect(discovery.status).toBe(200);
    const body = await discovery.json();
    expect(body.provider_name).toBe("Broomva Platform");
    expect(body.approval_methods).toEqual(["device_authorization"]);

    const capabilities = await call("/capability/list");
    expect(capabilities.status).toBe(200);
    expect((await capabilities.json()).capabilities).toHaveLength(10);
  });

  it("returns no session for anonymous requests", async () => {
    const session = await call("/agent/session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
  });

  it("exposes no magic-link or social sign-in on this server", async () => {
    const json = { "content-type": "application/json" };
    const magicLink = await call("/sign-in/magic-link", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "someone@example.com" }),
    });
    expect(magicLink.status).toBe(404);

    const social = await call("/sign-in/social", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ provider: "github" }),
    });
    expect(social.status).toBe(404);
    expect((await social.json()).code).toBe("PROVIDER_NOT_FOUND");
  });
});
