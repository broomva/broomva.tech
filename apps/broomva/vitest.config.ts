import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // `.arcan/` contains sibling skill test suites (gstack, skill-llm-eval,
    // etc.) that have their own test runners and node_modules; they must
    // not be scanned by the chat app's vitest. Same for `playwright-report/`
    // and other test-adjacent generated directories.
    exclude: [
      "node_modules",
      ".next",
      ".arcan/**",
      "tests/**",
      "playwright-report/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
