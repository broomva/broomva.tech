import { env } from "@/lib/env";

/**
 * Returns the base URL for the application.
 * Priority: APP_URL > VERCEL_URL > localhost
 */
export function getBaseUrl(): string {
  console.log("env.APP_URL", env.APP_URL);
  console.log("env.VERCEL_URL", env.VERCEL_URL);
  if (env.APP_URL) {
    return env.APP_URL;
  }
  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
