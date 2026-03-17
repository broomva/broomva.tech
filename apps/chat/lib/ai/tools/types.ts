import type { Session } from "@/lib/auth";

type SessionUser = NonNullable<Session["user"]>;

// Minimal session slice for tools - derived from Better Auth Session to avoid drift
export type ToolSession = {
  user?: Pick<SessionUser, "id">;
};
