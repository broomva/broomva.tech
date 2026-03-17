import { config } from "dotenv";
import { vi } from "vitest";

config({
  path: ".env.local",
});

vi.mock("server-only", () => {
  return {
    // mock server-only module
  };
});
