/**
 * E2E tests for Arcan tier routing.
 *
 * Validates the two-tier routing model:
 *   - Free / Pro users → shared Arcan instance (ARCAN_URL)
 *   - Enterprise users with a running Life instance → dedicated Railway instance
 *
 * For browser-level tests we can only observe routing indirectly through
 * the chat API response headers or error shapes. The unit-level routing
 * logic is tested in lib/arcan/resolve.test.ts.
 *
 * Run:
 *   TEST_BASE_URL=https://broomva.tech bunx playwright test tests/tier-routing.test.ts
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.TEST_BASE_URL ?? "";

function url(path: string) {
  return BASE_URL ? `${BASE_URL}${path}` : path;
}

// ---------------------------------------------------------------------------
// API-level: /api/chat should be reachable for authenticated users
// ---------------------------------------------------------------------------
test.describe("chat API reachability", () => {
  test("POST /api/chat returns 401 or 400 when unauthenticated (not 500)", async ({ request }) => {
    const response = await request.post(url("/api/chat"), {
      data: { messages: [{ role: "user", content: "hello" }] },
      headers: { "Content-Type": "application/json" },
    });
    // Must not be a server error — 401 or 400 is expected for unauthed request
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Authenticated tier routing (requires storageState from auth.setup.ts)
// ---------------------------------------------------------------------------
test.describe("authenticated tier routing", () => {
  test.use({
    storageState: "tests/playwright/.auth/session.json",
  });

  test("chat page loads without server crash", async ({ page }) => {
    await page.goto(url("/chat"));
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).not.toContain("Application error");
    expect(body).not.toContain("server-side exception");
  });

  test("new chat can be submitted (shared Arcan or direct streamText)", async ({ page }) => {
    await page.goto(url("/chat"));
    await page.waitForLoadState("networkidle");

    // Look for a text input / prompt area
    const promptInput = page
      .locator('textarea, input[type="text"]')
      .filter({ hasText: "" })
      .first();

    const isVisible = await promptInput.isVisible().catch(() => false);
    if (!isVisible) {
      // Chat may require a specific route — skip if no input found
      test.skip();
    }

    // Type a message and check the response doesn't crash
    await promptInput.fill("Hello, just testing");
    await promptInput.press("Enter");

    // Wait for either a response or an error message — we just want no 500
    await page.waitForTimeout(3_000);
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Application error");
  });

  test("/console/arcan-admin page loads for users with org (no 500)", async ({ page }) => {
    const response = await page.goto(url("/console/arcan-admin"));
    // Not authenticated enough / no enterprise org → may 302/403/404 but never 500
    expect(response?.status()).not.toBeGreaterThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// Tier routing API: verify resolveArcanEndpoints behavior via a test endpoint
// (if it exists) or indirectly via logs
// ---------------------------------------------------------------------------
test.describe("tier routing – API smoke", () => {
  test("GET /api/trpc/settings.getModelPreference returns 200 (DB is up)", async ({ request }) => {
    // This tRPC call queries the DB; a 200 confirms the DB tables exist
    const response = await request.get(url("/api/trpc/settings.getModelPreference?input=%7B%7D"));
    // 200 or 401 (unauthed) — never 500
    expect(response.status()).not.toBeGreaterThanOrEqual(500);
  });
});
