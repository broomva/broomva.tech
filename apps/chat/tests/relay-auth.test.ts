/**
 * Relay auth flow tests — validates proper JWT Bearer auth on /api/relay/* routes.
 *
 * Tests the full proper auth flow (device auth → Life JWT → relay access)
 * rather than the RELAY_API_KEY bypass.
 *
 * Run:
 *   TEST_BASE_URL=https://broomva.tech bunx playwright test tests/relay-auth.test.ts
 *
 * For CI with a real AUTH_SECRET and test user token:
 *   TEST_BASE_URL=https://broomva.tech RELAY_TEST_TOKEN=<life-jwt> bunx playwright test tests/relay-auth.test.ts
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.TEST_BASE_URL ?? "";
const RELAY_TEST_TOKEN = process.env.RELAY_TEST_TOKEN ?? "";

function url(path: string) {
  return BASE_URL ? `${BASE_URL}${path}` : path;
}

// ---------------------------------------------------------------------------
// Unauthenticated access — must be rejected
// ---------------------------------------------------------------------------
test.describe("relay auth — unauthenticated", () => {
  test("GET /api/relay/nodes returns 401 without credentials", async ({ request }) => {
    const res = await request.get(url("/api/relay/nodes"));
    expect(res.status()).toBe(401);
  });

  test("POST /api/relay/connect returns 401 without credentials", async ({ request }) => {
    const res = await request.post(url("/api/relay/connect"), {
      data: { name: "test", hostname: "test", capabilities: [] },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/relay/poll returns 401 without credentials", async ({ request }) => {
    const res = await request.get(url("/api/relay/poll"), {
      params: { nodeId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });

  test("Invalid Bearer token returns 401", async ({ request }) => {
    const res = await request.get(url("/api/relay/nodes"), {
      headers: { Authorization: "Bearer not-a-valid-jwt" },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Device code flow endpoints — must be publicly accessible
// ---------------------------------------------------------------------------
test.describe("relay auth — device code flow reachability", () => {
  test("POST /api/auth/device/code returns 200 with device_code", async ({ request }) => {
    const res = await request.post(url("/api/auth/device/code"), {
      data: { client_id: "broomva-cli", scope: "" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("device_code");
    expect(body).toHaveProperty("user_code");
    expect(body).toHaveProperty("verification_uri_complete");
    expect(body).toHaveProperty("interval");
    expect(body.interval).toBeGreaterThanOrEqual(5);
  });

  test("POST /api/auth/device/token returns authorization_pending for fresh code", async ({ request }) => {
    // First get a device code
    const codeRes = await request.post(url("/api/auth/device/code"), {
      data: { client_id: "broomva-cli", scope: "" },
    });
    const { device_code } = await codeRes.json();

    // Poll immediately — should be pending (user hasn't approved yet)
    const tokenRes = await request.post(url("/api/auth/device/token"), {
      data: {
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
    });
    expect(tokenRes.status()).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBe("authorization_pending");
  });
});

// ---------------------------------------------------------------------------
// JWT Bearer auth — valid Life JWT must grant access
// ---------------------------------------------------------------------------
test.describe("relay auth — Life JWT Bearer", () => {
  test.skip(!RELAY_TEST_TOKEN, "requires RELAY_TEST_TOKEN env var (a valid Life JWT)");

  test("GET /api/relay/nodes returns 200 with valid Life JWT", async ({ request }) => {
    const res = await request.get(url("/api/relay/nodes"), {
      headers: { Authorization: `Bearer ${RELAY_TEST_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("nodes");
    expect(Array.isArray(body.nodes)).toBe(true);
  });

  test("POST /api/relay/connect returns 201 with valid Life JWT", async ({ request }) => {
    const res = await request.post(url("/api/relay/connect"), {
      headers: { Authorization: `Bearer ${RELAY_TEST_TOKEN}` },
      data: {
        name: `ci-test-${Date.now()}`,
        hostname: "ci-runner",
        capabilities: ["claude-code"],
      },
    });
    // 201 (new) or 200 (reconnect)
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("nodeId");
    expect(body.status).toMatch(/registered|reconnected/);
  });
});
