import type {
	ContextResponse,
	PromptDetail,
	PromptSummary,
	SkillDetail,
	SkillsResponse,
} from "../types/api.js";
import { resolveToken } from "./auth-store.js";
import { DEFAULT_API_BASE } from "./constants.js";
import { ApiError, AuthRequiredError } from "./errors.js";

export interface ApiClientOptions {
	apiBase?: string;
	token?: string;
}

export class ApiClient {
	private base: string;
	private flagToken?: string;

	constructor(opts: ApiClientOptions = {}) {
		this.base = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
		this.flagToken = opts.token;
	}

	private headers(requireAuth = false): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		const tokenInfo = resolveToken(this.flagToken);
		if (tokenInfo) {
			h.Authorization = `Bearer ${tokenInfo.token}`;
		} else if (requireAuth) {
			throw new AuthRequiredError();
		}
		return h;
	}

	private async request<T>(
		method: string,
		path: string,
		opts: {
			body?: unknown;
			auth?: boolean;
			params?: Record<string, string>;
		} = {},
	): Promise<T> {
		const url = new URL(`${this.base}${path}`);
		if (opts.params) {
			for (const [k, v] of Object.entries(opts.params)) {
				if (v) url.searchParams.set(k, v);
			}
		}

		const res = await fetch(url.toString(), {
			method,
			headers: this.headers(opts.auth ?? false),
			body: opts.body ? JSON.stringify(opts.body) : undefined,
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ApiError(res.status, res.statusText, body);
		}

		return res.json() as Promise<T>;
	}

	// --- Prompts ---

	async listPrompts(filters?: {
		category?: string;
		tag?: string;
		model?: string;
		mine?: boolean;
	}): Promise<PromptSummary[]> {
		const params: Record<string, string> = {};
		if (filters?.category) params.category = filters.category;
		if (filters?.tag) params.tag = filters.tag;
		if (filters?.model) params.model = filters.model;

		if (filters?.mine) {
			return this.request<PromptSummary[]>("GET", "/api/prompts/user", {
				auth: true,
			});
		}
		return this.request<PromptSummary[]>("GET", "/api/prompts", { params });
	}

	async getPrompt(slug: string): Promise<PromptDetail> {
		return this.request<PromptDetail>(
			"GET",
			`/api/prompts/${encodeURIComponent(slug)}`,
			{
				params: { format: "full" },
			},
		);
	}

	async createPrompt(data: {
		title: string;
		content: string;
		summary?: string;
		category?: string;
		model?: string;
		version?: string;
		tags?: string[];
		variables?: { name: string; description: string; default?: string }[];
		links?: { label: string; url: string }[];
		visibility?: "public" | "private";
	}): Promise<PromptDetail> {
		return this.request<PromptDetail>("POST", "/api/prompts", {
			body: data,
			auth: true,
		});
	}

	async updatePrompt(
		slug: string,
		data: Partial<{
			title: string;
			content: string;
			summary: string;
			category: string;
			model: string;
			version: string;
			tags: string[];
			variables: { name: string; description: string; default?: string }[];
			links: { label: string; url: string }[];
			visibility: "public" | "private";
		}>,
	): Promise<PromptDetail> {
		return this.request<PromptDetail>(
			"PUT",
			`/api/prompts/${encodeURIComponent(slug)}`,
			{
				body: data,
				auth: true,
			},
		);
	}

	async deletePrompt(slug: string): Promise<void> {
		await this.request<unknown>(
			"DELETE",
			`/api/prompts/${encodeURIComponent(slug)}`,
			{
				auth: true,
			},
		);
	}

	// --- Skills ---

	async listSkills(layer?: string): Promise<SkillsResponse> {
		const params: Record<string, string> = {};
		if (layer) params.layer = layer;
		return this.request<SkillsResponse>("GET", "/api/skills", { params });
	}

	async getSkill(slug: string): Promise<SkillDetail> {
		return this.request<SkillDetail>(
			"GET",
			`/api/skills/${encodeURIComponent(slug)}`,
		);
	}

	// --- Context ---

	async getContext(): Promise<ContextResponse> {
		return this.request<ContextResponse>("GET", "/api/context");
	}

	// --- Auth validation ---

	async validateToken(): Promise<{ valid: boolean; email?: string }> {
		try {
			await this.request<unknown>("GET", "/api/prompts/user", { auth: true });
			return { valid: true };
		} catch (e) {
			if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
				return { valid: false };
			}
			throw e;
		}
	}
}
