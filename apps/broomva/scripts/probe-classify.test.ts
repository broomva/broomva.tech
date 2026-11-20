import { describe, expect, it } from "vitest";
import { classifyProbe } from "./probe-classify.mjs";

const media = (s: number) => s === 200 || s === 206 || s === 302;
const base = { location: "", mitigated: null, expectedStatus: media, kind: "audio" };

describe("classifyProbe", () => {
  it("passes a served asset and a blob redirect", () => {
    expect(classifyProbe({ ...base, status: 200 }).outcome).toBe("pass");
    expect(
      classifyProbe({
        ...base,
        status: 302,
        location: "https://api.lago.arcan.la/blob/x",
      }).outcome,
    ).toBe("pass");
  });

  it("fails a redirect to /login even when the edge also mitigated", () => {
    expect(
      classifyProbe({ ...base, status: 307, location: "/login?next=/a" })
        .outcome,
    ).toBe("fail");
    expect(
      classifyProbe({
        ...base,
        status: 307,
        location: "/login",
        mitigated: "challenge",
      }).outcome,
    ).toBe("fail");
  });

  it("fails app-level errors", () => {
    expect(classifyProbe({ ...base, status: 404 }).outcome).toBe("fail");
    expect(classifyProbe({ ...base, status: 500 }).outcome).toBe("fail");
    // A 429 the app itself returned (no edge header) is still a failure.
    expect(classifyProbe({ ...base, status: 429 }).outcome).toBe("fail");
  });

  it("marks an edge challenge or a paused account inconclusive", () => {
    const challenged = classifyProbe({
      ...base,
      status: 429,
      mitigated: "challenge",
    });
    expect(challenged.outcome).toBe("inconclusive");
    expect(challenged.reason).toContain("challenge");
    expect(
      classifyProbe({ ...base, status: 403, mitigated: "deny" }).outcome,
    ).toBe("inconclusive");
    expect(classifyProbe({ ...base, status: 402 }).outcome).toBe(
      "inconclusive",
    );
  });
});
