import type { SymphonyIssue, SymphonyState } from "../types/daemon.js";

export class SymphonyHttpClient {
	private baseUrl: string;
	private token: string | null;

	constructor(baseUrl: string, token: string | null = null) {
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.token = token;
	}

	updateToken(token: string | null): void {
		this.token = token;
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.token) {
			h.Authorization = `Bearer ${this.token}`;
		}
		return h;
	}

	private async request<T>(method: string, path: string): Promise<T | null> {
		try {
			const res = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: this.headers(),
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) return null;
			return (await res.json()) as T;
		} catch {
			return null;
		}
	}

	async isRunning(): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/healthz`, {
				signal: AbortSignal.timeout(5_000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async getState(): Promise<SymphonyState | null> {
		return this.request<SymphonyState>("GET", "/api/v1/state");
	}

	async getIssue(id: string): Promise<SymphonyIssue | null> {
		return this.request<SymphonyIssue>("GET", `/api/v1/issues/${id}`);
	}

	async refresh(): Promise<boolean> {
		const result = await this.request<{ ok: boolean }>(
			"POST",
			"/api/v1/refresh",
		);
		return result?.ok ?? false;
	}

	async getMetrics(): Promise<Record<string, unknown> | null> {
		return this.request<Record<string, unknown>>("GET", "/api/v1/metrics");
	}
}
