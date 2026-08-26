import { expect, test } from "@playwright/test";

const OPTIONAL_ANALYTICS_PATTERN =
  /(?:t\.broomva\.tech|posthog|va\.vercel-scripts\.com|vercel-insights\.com|\/_vercel\/(?:insights|speed-insights))/i;

test("optional browser analytics remain silent until acceptance and after withdrawal", async ({
  page,
}) => {
  await page.route("https://posthog.invalid/**", (route) => route.abort());
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (OPTIONAL_ANALYTICS_PATTERN.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics preferences" }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  expect(analyticsRequests).toEqual([]);

  await page.getByRole("button", { name: "Essential only" }).click();
  await page.waitForTimeout(1000);
  expect(analyticsRequests).toEqual([]);

  await page.getByRole("button", { name: "Cookie choices" }).click();
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect
    .poll(() => analyticsRequests.length, { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Cookie choices" }).click();
  analyticsRequests.length = 0;
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Essential only" }).click(),
  ]);

  await page.waitForTimeout(1500);
  expect(analyticsRequests).toEqual([]);
});

test("withdrawal fails closed when consent storage cannot be updated", async ({
  page,
}) => {
  await page.route("https://posthog.invalid/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await page.getByRole("button", { name: "Cookie choices" }).click();

  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });

  let navigated = false;
  page.once("framenavigated", () => {
    navigated = true;
  });
  await page.getByRole("button", { name: "Essential only" }).click();
  await page.waitForTimeout(500);

  expect(navigated).toBe(false);
  await expect(
    page.getByRole("region", { name: "Analytics preferences" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "browser blocked saving it",
  );
});

test("a stale accepted cookie cannot override a local withdrawal", async ({
  page,
}) => {
  await page.route("https://posthog.invalid/**", (route) => route.abort());
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (OPTIONAL_ANALYTICS_PATTERN.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await page.getByRole("button", { name: "Cookie choices" }).click();

  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    if (!descriptor?.get || !descriptor.set) throw new Error("cookie API missing");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => descriptor.get?.call(document) ?? "",
      set: (value: string) => {
        if (value.includes("%22essential%22")) {
          throw new DOMException("blocked", "SecurityError");
        }
        descriptor.set?.call(document, value);
      },
    });
  });

  analyticsRequests.length = 0;
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "Essential only" }).click(),
  ]);
  await page.waitForTimeout(1500);

  expect(analyticsRequests).toEqual([]);
});
