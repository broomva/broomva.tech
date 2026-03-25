import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock server-only and the DB before importing resolve
vi.mock("server-only", () => ({}));

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

// Chain builder helpers
const buildSelectChain = (result: unknown[]) => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  return chain;
};

const buildUpdateChain = () => ({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  organizationMember: { organizationId: "organizationId", userId: "userId" },
  organizationLifeInstance: {
    id: "id",
    organizationId: "organizationId",
    arcanUrl: "arcanUrl",
    lagoUrl: "lagoUrl",
    status: "status",
  },
}));

import { db } from "@/lib/db/client";

describe("resolveArcanEndpoints", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns dedicated endpoint when org has a running instance", async () => {
    const mockChain = buildSelectChain([
      {
        id: "inst-1",
        orgId: "org-1",
        arcanUrl: "https://arcan.railway.app",
        lagoUrl: "https://lago.railway.app",
        status: "running",
      },
    ]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    delete process.env.ARCAN_URL;

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).not.toBeNull();
    expect(result.dedicated!.arcanUrl).toBe("https://arcan.railway.app");
    expect(result.dedicated!.isDedicated).toBe(true);
    expect(result.dedicated!.orgId).toBe("org-1");
    expect(result.shared).toBeNull();
  });

  it("returns dedicated endpoint when instance is degraded (fallback allowed)", async () => {
    const mockChain = buildSelectChain([
      {
        id: "inst-1",
        orgId: "org-1",
        arcanUrl: "https://arcan.railway.app",
        lagoUrl: null,
        status: "degraded",
      },
    ]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    delete process.env.ARCAN_URL;

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).not.toBeNull();
    expect(result.dedicated!.arcanUrl).toBe("https://arcan.railway.app");
    expect(result.dedicated!.isDedicated).toBe(true);
  });

  it("returns null dedicated when instance is provisioning", async () => {
    const mockChain = buildSelectChain([
      {
        id: "inst-1",
        orgId: "org-1",
        arcanUrl: "https://arcan.railway.app",
        lagoUrl: null,
        status: "provisioning",
      },
    ]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    process.env.ARCAN_URL = "https://shared-arcan.example.com";

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).toBeNull();
    expect(result.shared).not.toBeNull();
    expect(result.shared!.isDedicated).toBe(false);
  });

  it("returns null dedicated when org has no life instance", async () => {
    const mockChain = buildSelectChain([]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    process.env.ARCAN_URL = "https://shared-arcan.example.com";

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).toBeNull();
    expect(result.shared!.arcanUrl).toBe("https://shared-arcan.example.com");
    expect(result.shared!.orgId).toBeNull();
  });

  it("returns null for both when no instance and no ARCAN_URL", async () => {
    const mockChain = buildSelectChain([]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    delete process.env.ARCAN_URL;

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).toBeNull();
    expect(result.shared).toBeNull();
  });

  it("returns shared when DB throws (graceful degradation)", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });
    process.env.ARCAN_URL = "https://shared-arcan.example.com";

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.dedicated).toBeNull();
    expect(result.shared!.arcanUrl).toBe("https://shared-arcan.example.com");
  });

  it("shared endpoint has lagoUrl from LAGO_URL env", async () => {
    const mockChain = buildSelectChain([]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    process.env.ARCAN_URL = "https://shared-arcan.example.com";
    process.env.LAGO_URL = "https://shared-lago.example.com";

    const { resolveArcanEndpoints } = await import("./resolve");
    const result = await resolveArcanEndpoints("user-1");

    expect(result.shared!.lagoUrl).toBe("https://shared-lago.example.com");
  });
});

describe("resolveArcanUrl (deprecated wrapper)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns dedicated arcanUrl when available", async () => {
    const mockChain = buildSelectChain([
      { id: "i1", orgId: "org-1", arcanUrl: "https://dedicated.example.com", lagoUrl: null, status: "running" },
    ]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);

    const { resolveArcanUrl } = await import("./resolve");
    const result = await resolveArcanUrl("user-1");

    expect(result!.arcanUrl).toBe("https://dedicated.example.com");
  });

  it("returns null when nothing is configured", async () => {
    const mockChain = buildSelectChain([]);
    vi.mocked(db.select).mockReturnValue(mockChain as any);
    delete process.env.ARCAN_URL;

    const { resolveArcanUrl } = await import("./resolve");
    const result = await resolveArcanUrl("user-1");

    expect(result).toBeNull();
  });
});

describe("markInstanceDegraded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.update to set status=degraded", async () => {
    const mockUpdateChain = buildUpdateChain();
    vi.mocked(db.update).mockReturnValue(mockUpdateChain as any);

    const { markInstanceDegraded } = await import("./resolve");
    await expect(markInstanceDegraded("org-1")).resolves.toBeUndefined();
    expect(db.update).toHaveBeenCalled();
  });

  it("is non-fatal when DB update throws", async () => {
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("DB write failed");
    });

    const { markInstanceDegraded } = await import("./resolve");
    // Should not throw
    await expect(markInstanceDegraded("org-1")).resolves.toBeUndefined();
  });
});
