/**
 * Lago API client — typed TypeScript client for the Lago REST API.
 *
 * Server-side only. Uses LAGO_URL env var for the base URL.
 * Authenticates via Bearer JWT signed with AUTH_SECRET.
 */

import { signLifeJWT } from "@/lib/ai/vault/jwt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LagoSession {
  session_id: string;
  name: string;
  model: string;
  created_at: number;
  branches: string[];
}

export interface LagoManifestEntry {
  path: string;
  blob_hash: string;
  size_bytes: number;
  content_type: string | null;
  updated_at: number;
}

export interface LagoSnapshot {
  name: string;
  branch: string;
  seq: number;
  created_at: number;
}

export interface LagoDiffEntry {
  Added?: { path: string; entry: LagoManifestEntry };
  Removed?: { path: string; entry: LagoManifestEntry };
  Modified?: { path: string; old: LagoManifestEntry; new: LagoManifestEntry };
}

export interface LagoHealth {
  status: string;
  service: string;
  version: string;
  uptime_seconds: number;
  subsystems: {
    journal: string;
    blob_store: string;
    auth: string;
    policy: { active: boolean; rules: number; roles: number };
  };
  telemetry: { sdk: string; otlp_configured: boolean };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LagoClient {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}

  // -- helpers --------------------------------------------------------------

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`;
    }
    if (contentType) {
      h["Content-Type"] = contentType;
    }
    return h;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers(
          init?.body && typeof init.body === "string"
            ? "application/json"
            : undefined,
        ),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Lago ${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`,
      );
    }

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return res.json() as Promise<T>;
    }
    return res.text() as unknown as T;
  }

  // -- Sessions -------------------------------------------------------------

  async listSessions(): Promise<LagoSession[]> {
    return this.request<LagoSession[]>("/v1/sessions");
  }

  async getSession(id: string): Promise<LagoSession> {
    return this.request<LagoSession>(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  async createSession(
    name: string,
  ): Promise<{ session_id: string; branch_id: string }> {
    return this.request<{ session_id: string; branch_id: string }>(
      "/v1/sessions",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
  }

  // -- Files ----------------------------------------------------------------

  async getManifest(
    sessionId: string,
    branch?: string,
  ): Promise<LagoManifestEntry[]> {
    const q = branch ? `?branch=${encodeURIComponent(branch)}` : "";
    const data = await this.request<{ entries: LagoManifestEntry[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/manifest${q}`,
    );
    return data.entries;
  }

  async readFile(sessionId: string, path: string): Promise<string> {
    const encodedPath = encodeURIComponent(
      path.startsWith("/") ? path : `/${path}`,
    );
    return this.request<string>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/files/${encodedPath}`,
    );
  }

  async writeFile(
    sessionId: string,
    path: string,
    content: string,
  ): Promise<{ path: string; blob_hash: string; size_bytes: number }> {
    const encodedPath = encodeURIComponent(
      path.startsWith("/") ? path : `/${path}`,
    );
    return this.request<{
      path: string;
      blob_hash: string;
      size_bytes: number;
    }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/files/${encodedPath}`,
      {
        method: "PUT",
        body: content,
        headers: { "Content-Type": "text/plain" },
      },
    );
  }

  async deleteFile(sessionId: string, path: string): Promise<void> {
    const encodedPath = encodeURIComponent(
      path.startsWith("/") ? path : `/${path}`,
    );
    await this.request<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/files/${encodedPath}`,
      { method: "DELETE" },
    );
  }

  // -- Blobs ----------------------------------------------------------------

  getBlobUrl(hash: string): string {
    return `${this.baseUrl}/v1/blobs/${encodeURIComponent(hash)}`;
  }

  // -- Snapshots ------------------------------------------------------------

  async listSnapshots(
    sessionId: string,
    branch?: string,
  ): Promise<LagoSnapshot[]> {
    const q = branch ? `?branch=${encodeURIComponent(branch)}` : "";
    return this.request<LagoSnapshot[]>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshots${q}`,
    );
  }

  async createSnapshot(
    sessionId: string,
    name: string,
    branch?: string,
  ): Promise<LagoSnapshot> {
    return this.request<LagoSnapshot>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshots`,
      {
        method: "POST",
        body: JSON.stringify({ name, branch }),
      },
    );
  }

  async getSnapshotManifest(
    sessionId: string,
    name: string,
    branch?: string,
  ): Promise<{ snapshot: string; entries: LagoManifestEntry[] }> {
    const q = branch ? `?branch=${encodeURIComponent(branch)}` : "";
    return this.request<{ snapshot: string; entries: LagoManifestEntry[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshots/${encodeURIComponent(name)}${q}`,
    );
  }

  // -- Diff -----------------------------------------------------------------

  async getDiff(
    sessionId: string,
    from: string,
    to?: string,
  ): Promise<LagoDiffEntry[]> {
    const params = new URLSearchParams({ from });
    if (to) params.set("to", to);
    return this.request<LagoDiffEntry[]>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/diff?${params.toString()}`,
    );
  }

  // -- Health ---------------------------------------------------------------

  async getHealth(): Promise<LagoHealth> {
    return this.request<LagoHealth>("/healthz");
  }

  async getReadiness(): Promise<{ ready: boolean }> {
    return this.request<{ ready: boolean }>("/readyz");
  }

  async getMetrics(): Promise<string> {
    return this.request<string>("/metrics");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a server-side LagoClient.
 *
 * Reads `LAGO_URL` from the environment. If `userId` and `email` are
 * provided, signs a JWT via AUTH_SECRET so the client is authenticated.
 */
export async function createLagoClient(
  userId?: string,
  email?: string,
): Promise<LagoClient> {
  const baseUrl = process.env.LAGO_URL;
  if (!baseUrl) {
    throw new Error("LAGO_URL environment variable is not set");
  }

  let token: string | undefined;
  if (userId && email) {
    token = await signLifeJWT({ id: userId, email });
  }

  return new LagoClient(baseUrl, token);
}
