/**
 * Auth setup for Playwright tests.
 *
 * Logs in as the test user and saves browser storage state so other
 * test projects can reuse the session without re-logging in.
 *
 * Usage: configure in playwright.config.ts as a dependency for tests
 * that need an authenticated session.
 */
import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const AUTH_FILE = path.join(__dirname, "playwright/.auth/session.json");

const BASE_URL = process.env.TEST_BASE_URL ?? "https://broomva.tech";
const TEST_EMAIL = process.env.TEST_EMAIL ?? "claude-test@broomva.tech";
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "";

setup("authenticate", async ({ page }) => {
  if (!TEST_PASSWORD) {
    console.warn(
      "[auth.setup] TEST_PASSWORD not set — skipping auth, tests requiring session will fail",
    );
    // Write an empty state so dependent tests at least load
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");

  // Fill credentials
  const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();
  const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]')).first();

  await emailInput.fill(TEST_EMAIL);
  await passwordInput.fill(TEST_PASSWORD);

  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  await page.waitForURL(/\/(chat|onboarding)/, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
