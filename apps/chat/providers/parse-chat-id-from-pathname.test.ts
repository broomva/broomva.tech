import { describe, expect, it } from "vitest";
import { parseChatIdFromPathname } from "./parse-chat-id-from-pathname";

describe("parseChatIdFromPathname", () => {
  describe("shared routes (/share/:id)", () => {
    it("returns chat for /share/:id", () => {
      expect(parseChatIdFromPathname("/share/abc-123")).toEqual({
        type: "chat",
        id: "abc-123",
      });
    });

    it("handles share with complex id", () => {
      expect(parseChatIdFromPathname("/share/abc-123-def-456")).toEqual({
        type: "chat",
        id: "abc-123-def-456",
      });
    });
  });

  describe("project routes (/project/:projectId...)", () => {
    it("returns provisional for /project/:projectId (no chat)", () => {
      expect(parseChatIdFromPathname("/project/proj-123")).toEqual({
        type: "provisional",
        id: null,
      });
    });

    it("returns chat for /project/:projectId/chat/:chatId", () => {
      expect(
        parseChatIdFromPathname("/project/proj-123/chat/chat-456")
      ).toEqual({
        type: "chat",
        id: "chat-456",
      });
    });
  });

  describe("chat routes (/chat/:id)", () => {
    it("returns chat for /chat/:id", () => {
      expect(parseChatIdFromPathname("/chat/chat-789")).toEqual({
        type: "chat",
        id: "chat-789",
      });
    });
  });

  describe("root and fallback", () => {
    it("returns provisional for /", () => {
      expect(parseChatIdFromPathname("/")).toEqual({
        type: "provisional",
        id: null,
      });
    });

    it("returns provisional for null pathname", () => {
      expect(parseChatIdFromPathname(null)).toEqual({
        type: "provisional",
        id: null,
      });
    });

    it("returns provisional for unknown routes", () => {
      expect(parseChatIdFromPathname("/settings")).toEqual({
        type: "provisional",
        id: null,
      });
    });
  });
});
