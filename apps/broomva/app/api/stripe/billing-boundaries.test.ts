import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationById: vi.fn(),
  hasOrganizationRole: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  wrapperOptions: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/with-auth", () => ({
  withAuthAndValidation: (
    _schema: unknown,
    handler: (request: Request, context: unknown) => Promise<Response>,
    options?: unknown,
  ) => {
    mocks.wrapperOptions.push(options);
    return async (request: Request) =>
      handler(request, {
        userId: "user-1",
        email: "user@example.com",
        session: { user: { id: "user-1", email: "user@example.com" } },
        body: await request.json(),
      });
  },
}));
vi.mock("@/lib/db/organization", () => ({
  getOrganizationById: mocks.getOrganizationById,
  hasOrganizationRole: mocks.hasOrganizationRole,
}));
vi.mock("@/lib/stripe", () => ({
  PLAN_TIERS: { pro: { priceId: "price_pro" } },
  getStripe: () => ({
    checkout: { sessions: { create: mocks.checkoutCreate } },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  }),
}));
vi.mock("@/lib/db/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/analytics/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/analytics/events", () => ({
  EVENT_CHECKOUT_STARTED: "checkout_started",
  EVENT_PLAN_SELECTED: "plan_selected",
}));

import { POST as checkout } from "./checkout/route";
import { POST as portal } from "./portal/route";

function request(path: string, body: Record<string, string>) {
  return new Request(`https://broomva.tech${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("billing route boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("SELF_SERVICE_CHECKOUT_ENABLED", "true");
    mocks.getOrganizationById.mockResolvedValue({
      id: "org-1",
      stripeCustomerId: "cus_1",
    });
    mocks.hasOrganizationRole.mockResolvedValue(true);
    mocks.checkoutCreate.mockResolvedValue({
      id: "cs_1",
      url: "https://stripe.test/checkout",
    });
    mocks.portalCreate.mockResolvedValue({ url: "https://stripe.test/portal" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps self-service Checkout off unless explicitly enabled", async () => {
    vi.stubEnv("SELF_SERVICE_CHECKOUT_ENABLED", "false");

    const response = await checkout(
      request("/api/stripe/checkout", { plan: "pro", organizationId: "org-1" }),
    );

    expect(response.status).toBe(503);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("requires owner/admin and sends the configured Stripe disclosures", async () => {
    mocks.hasOrganizationRole.mockResolvedValueOnce(false);
    const denied = await checkout(
      request("/api/stripe/checkout", { plan: "pro", organizationId: "org-1" }),
    );
    expect(denied.status).toBe(403);

    const allowed = await checkout(
      request("/api/stripe/checkout", { plan: "pro", organizationId: "org-1" }),
    );
    expect(allowed.status).toBe(200);
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        consent_collection: { terms_of_service: "required" },
        mode: "subscription",
      }),
    );
  });

  it("keeps cancellation portal access open but owner/admin-only", async () => {
    mocks.hasOrganizationRole.mockResolvedValueOnce(false);
    const denied = await portal(
      request("/api/stripe/portal", { organizationId: "org-1" }),
    );
    expect(denied.status).toBe(403);

    const allowed = await portal(
      request("/api/stripe/portal", { organizationId: "org-1" }),
    );
    expect(allowed.status).toBe(200);
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "http://localhost:3001/console/billing",
    });
    expect(mocks.wrapperOptions).toContainEqual({
      requireLegalAcceptance: false,
    });
  });
});
