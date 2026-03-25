import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from "dotenv";

config({
  path: ".env.local",
});

/* Use process.env.PORT by default and fallback to port 3000 */
const PORT = process.env.PORT || 3000;

/**
 * Set webServer.url and use.baseURL with the location of the WebServer.
 * When TEST_BASE_URL is set (e.g. https://broomva.tech for production runs)
 * we skip the local dev server entirely.
 */
const TEST_BASE_URL = process.env.TEST_BASE_URL;
const baseURL = TEST_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure global timeout for each test */
  timeout: 60 * 1000, // 60 seconds
  expect: {
    timeout: 60 * 1000,
  },

  /* Configure projects */
  projects: [
    {
      name: "setup:auth",
      testMatch: /auth.setup.ts/,
    },
    {
      name: "setup:reasoning",
      testMatch: /reasoning.setup.ts/,
      dependencies: ["setup:auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/session.json",
      },
    },
    {
      name: "chat",
      testMatch: /chat.test.ts/,
      dependencies: ["setup:auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/session.json",
      },
    },
    {
      name: "reasoning",
      testMatch: /reasoning.test.ts/,
      dependencies: ["setup:reasoning"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.reasoning/session.json",
      },
    },
    {
      name: "artifacts",
      testMatch: /artifacts.test.ts/,
      dependencies: ["setup:auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/session.json",
      },
    },
    {
      name: "onboarding",
      testMatch: /onboarding.test.ts/,
      dependencies: ["setup:auth"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tier-routing",
      testMatch: /tier-routing.test.ts/,
      dependencies: ["setup:auth"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  /* Skip webServer when testing against a remote URL (TEST_BASE_URL is set) */
  ...(TEST_BASE_URL
    ? {}
    : {
        webServer: {
          command: "bun dev",
          url: baseURL,
          timeout: 120 * 1000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
