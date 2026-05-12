import { config } from "@/lib/config";

const _isProductionEnvironment = process.env.NODE_ENV === "production";

const _isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const BLOB_FILE_PREFIX = `${config.appPrefix}/files/`;

export const ANONYMOUS_SESSION_COOKIES_KEY = "anonymous-session";
