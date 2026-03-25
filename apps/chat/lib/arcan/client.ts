/**
 * Arcan Client — typed HTTP client for the Arcan agent runtime.
 *
 * Handles session lifecycle, agent runs, event streaming (Vercel AI SDK v6),
 * approval resolution, and file access via Lago.
 *
 * Auth: Life JWT (HS256, shared AUTH_SECRET with Railway services).
 */

import "server-only";

import { SignJWT } from "jose";
import type { ArcanPolicySet } from "./execute";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArcanSessionManifest {
  session_id: string;
  owner: string;
  created_at: string;
  workspace_root: string;
  model_routing: Record<string, unknown>;
  policy: ArcanPolicySet;
}

export interface ArcanRunResponse {
  session_id: string;
  mode: string;
  state: AgentStateVector;
  events_emitted: number;
  last_sequence: number;
}

export interface AgentStateVector {
  progress: number;
  uncertainty: number;
  risk_level: string;
  budget: BudgetState;
  error_streak: number;
  context_pressure: number;
  side_effect_pressure: number;
  human_dependency: number;
}

export interface BudgetState {
  tokens_remaining: number;
  time_remaining_ms: number;
  cost_remaining_usd: number;
  tool_calls_remaining: number;
  error_budget_remaining: number;
}

export interface CreateSessionOptions {
  sessionId?: string;
  owner?: string;
  policy?: ArcanPolicySet;
  modelRouting?: Record<string, unknown>;
}

export interface RunOptions {
  objective: string;
  branch?: string;
  proposedTool?: {
    tool_name: string;
    input: Record<string, unknown>;
    requested_capabilities?: string[];
  };
}

export interface StreamOptions {
  branch?: string;
  cursor?: number;
  replayLimit?: number;
  /** Unique ID for this assistant message — used as `messageId` in the Vercel
   *  AI SDK v6 `start` frame. Pass a fresh UUID per chat turn so React has a
   *  unique key for each assistant message within the same session. */
  messageId?: string;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class ArcanClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  /**
   * Create an ArcanClient authenticated for a given user.
   *
   * Signs a minimal HS256 JWT with only the claims arcand validates:
   * sub, email, exp, iat. No iss/aud — arcand clears those requirements.
   */
  static async forUser(
    arcanUrl: string,
    user: { id: string; email: string }
  ): Promise<ArcanClient> {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET is required for Arcan JWT signing");
    }
    const token = await new SignJWT({ sub: user.id, email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(secret));
    return new ArcanClient(arcanUrl, token);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async fetch<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ArcanError(
        `Arcan ${init?.method ?? "GET"} ${path}: ${res.status}`,
        res.status,
        body
      );
    }
    return res.json() as Promise<T>;
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  async createSession(
    opts: CreateSessionOptions = {}
  ): Promise<ArcanSessionManifest> {
    return this.fetch<ArcanSessionManifest>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        session_id: opts.sessionId,
        owner: opts.owner,
        policy: opts.policy,
        model_routing: opts.modelRouting,
      }),
    });
  }

  async getSession(sessionId: string): Promise<ArcanSessionManifest | null> {
    try {
      return await this.fetch<ArcanSessionManifest>(
        `/sessions/${sessionId}/state`
      );
    } catch (e) {
      if (e instanceof ArcanError && e.status === 404) return null;
      throw e;
    }
  }

  // ─── Runs ───────────────────────────────────────────────────────────

  async run(
    sessionId: string,
    opts: RunOptions
  ): Promise<ArcanRunResponse> {
    return this.fetch<ArcanRunResponse>(`/sessions/${sessionId}/runs`, {
      method: "POST",
      body: JSON.stringify({
        objective: opts.objective,
        branch: opts.branch,
        proposed_tool: opts.proposedTool,
      }),
    });
  }

  // ─── Event Streaming ────────────────────────────────────────────────

  /**
   * Returns a ReadableStream of SSE bytes in Vercel AI SDK v6 format.
   * Pipe this directly to the Response body — the client's useChat
   * consumes it natively.
   */
  async streamEvents(
    sessionId: string,
    opts: StreamOptions = {},
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> {
    const params = new URLSearchParams({
      format: "vercel_ai_sdk_v6",
    });
    if (opts.branch) params.set("branch", opts.branch);
    if (opts.cursor != null) params.set("cursor", String(opts.cursor));
    if (opts.replayLimit != null)
      params.set("replay_limit", String(opts.replayLimit));
    if (opts.messageId) params.set("message_id", opts.messageId);

    const url = `${this.baseUrl}/sessions/${sessionId}/events/stream?${params}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "text/event-stream",
      },
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ArcanError(`Arcan stream: ${res.status}`, res.status, body);
    }

    if (!res.body) {
      throw new ArcanError("Arcan stream: no body", 500, "");
    }

    return res.body;
  }

  // ─── Identity upgrade (BRO-227) ─────────────────────────────────────

  async upgradeIdentity(
    sessionId: string,
    userId: string,
    identityToken?: string
  ): Promise<{ session_id: string; new_owner: string; tier: string; capabilities_count: number }> {
    return this.fetch(`/sessions/${sessionId}/identity`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId, identity_token: identityToken }),
    });
  }

  // ─── Approvals ──────────────────────────────────────────────────────

  async resolveApproval(
    sessionId: string,
    approvalId: string,
    approved: boolean,
    actor?: string
  ): Promise<void> {
    await this.fetch(`/sessions/${sessionId}/approvals/${approvalId}`, {
      method: "POST",
      body: JSON.stringify({ approved, actor }),
    });
  }

  // ─── Files (via Lago) ──────────────────────────────────────────────

  /**
   * Read a file from the session workspace (Lago blob store).
   * Returns the raw Response so callers can stream or read as needed.
   */
  async readFile(
    sessionId: string,
    path: string
  ): Promise<Response> {
    const url = `${this.baseUrl}/sessions/${sessionId}/files/${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new ArcanError(
        `Arcan file read: ${res.status}`,
        res.status,
        await res.text().catch(() => "")
      );
    }
    return res;
  }

  // ─── Health ─────────────────────────────────────────────────────────

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class ArcanError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "ArcanError";
  }
}
