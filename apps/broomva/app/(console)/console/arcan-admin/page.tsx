"use client";

/**
 * Arcan Admin Portal — BRO-228
 *
 * Enterprise tenant admin self-service for:
 *  1. Capability Policy — per-role Arcan capability matrix
 *  2. Custom Skills     — TOML skill manifest upload and assignment
 *  3. MCP Servers       — private MCP server registration (enterprise-only)
 *  4. Usage & Audit     — per-user event consumption and admin audit log
 *
 * Access: only owner / admin org members. Non-enterprise tabs show upgrade CTAs.
 */

import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgInfo {
  id: string;
  name: string;
  plan: string;
  role: string;
}

interface ArcanRole {
  id: string;
  roleName: string;
  allowCapabilities: string[];
  maxEventsPerTurn: number;
}

interface CustomSkill {
  id: string;
  name: string;
  manifestToml: string;
  assignedRoles: string[];
  enabled: boolean;
  updatedAt: string;
}

interface McpServer {
  id: string;
  name: string;
  assignedRoles: string[];
  enabled: boolean;
  createdAt: string;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-[var(--ag-border-subtle)] px-1.5 py-0.5 font-mono text-xs text-text-secondary">
      {label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Shield; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
      <Icon className="size-4" />
      {title}
    </h2>
  );
}

function EnterpriseBadge({ plan }: { plan: string }) {
  if (plan === "enterprise") return null;
  return (
    <div className="rounded-md border border-[var(--ag-accent)]/30 bg-[var(--ag-accent)]/5 p-4 text-sm">
      <p className="font-medium text-text-primary">Enterprise plan required</p>
      <p className="mt-1 text-xs text-text-secondary">
        Upgrade to Enterprise to unlock custom MCP server registration and
        dedicated Life instance management.
      </p>
      <a href="/pricing" className="glass-button mt-3 inline-flex items-center gap-2 text-xs">
        <Zap className="size-3.5" /> Upgrade
      </a>
    </div>
  );
}

// ─── Tab: Capability Policy ───────────────────────────────────────────────────

function CapabilityPolicyTab({ org }: { org: OrgInfo }) {
  const [roles, setRoles] = useState<ArcanRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleName, setRoleName] = useState("member");
  const [caps, setCaps] = useState("");
  const [maxEvents, setMaxEvents] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/arcan-roles?organizationId=${org.id}`);
      const data = await res.json();
      setRoles(data.roles ?? []);
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null); setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/arcan-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          roleName,
          allowCapabilities: caps.split(",").map((c) => c.trim()).filter(Boolean),
          maxEventsPerTurn: maxEvents,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Save failed");
      } else {
        setSuccess("Policy saved");
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    await fetch("/api/tenant/arcan-roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: org.id, roleName: name }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="glass-card">
        <SectionHeader icon={Shield} title="Role Capability Matrix" />
        <p className="mb-4 text-xs text-text-secondary">
          Define which Arcan capability strings are granted to each org role.
          Leave empty to inherit tier defaults. Use <Tag label="*" /> for full
          access or comma-separated strings like{" "}
          <Tag label="exec:cmd:ls,fs:read:**" />.
        </p>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
            >
              {["owner", "admin", "member", "viewer"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              type="text"
              value={caps}
              onChange={(e) => setCaps(e.target.value)}
              placeholder="*, exec:cmd:ls, fs:read:**"
              className="flex-1 rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
            />
            <input
              type="number"
              value={maxEvents}
              onChange={(e) => setMaxEvents(Number(e.target.value))}
              min={1}
              max={200}
              className="w-24 rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              title="Max events/turn"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="glass-button inline-flex items-center gap-1.5 text-xs"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Save
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-green-400">{success}</p>}
        </div>
      </div>

      <div className="glass-card">
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader icon={Shield} title="Configured Roles" />
          <button type="button" onClick={load} className="glass-button p-1.5">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-text-muted" />
        ) : roles.length === 0 ? (
          <p className="text-sm text-text-secondary">No overrides — tier defaults apply.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ag-border-subtle)] text-left text-xs uppercase tracking-wider text-text-muted">
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Capabilities</th>
                <th className="pb-2 pr-4">Max Events/Turn</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ag-border-subtle)]">
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4 font-medium capitalize text-text-primary">{r.roleName}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {r.allowCapabilities.map((c) => <Tag key={c} label={c} />)}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-text-secondary">{r.maxEventsPerTurn}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r.roleName)}
                      className="rounded p-1 text-text-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Custom Skills ───────────────────────────────────────────────────────

function CustomSkillsTab({ org }: { org: OrgInfo }) {
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [toml, setToml] = useState("");
  const [roles, setRoles] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/custom-skills?organizationId=${org.id}`);
      const data = await res.json();
      setSkills(data.skills ?? []);
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !toml.trim()) {
      setError("Name and manifest TOML are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/custom-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          name: name.trim(),
          manifestToml: toml,
          assignedRoles: roles.split(",").map((r) => r.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Save failed");
      } else {
        setShowForm(false);
        setName(""); setToml(""); setRoles("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (skill: CustomSkill) => {
    await fetch("/api/tenant/custom-skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: org.id,
        skillId: skill.id,
        enabled: !skill.enabled,
      }),
    });
    await load();
  };

  const handleDelete = async (skillId: string) => {
    await fetch("/api/tenant/custom-skills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: org.id, skillId }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="glass-card">
        <div className="mb-4 flex items-center justify-between">
          <SectionHeader icon={BookOpen} title="Custom Skills" />
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="glass-button inline-flex items-center gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            Upload Skill
          </button>
        </div>

        {showForm && (
          <div className="mb-4 space-y-3 rounded-md border border-[var(--ag-border-subtle)] p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Skill Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-custom-skill"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Manifest TOML
              </label>
              <textarea
                value={toml}
                onChange={(e) => setToml(e.target.value)}
                rows={8}
                placeholder={'[skill]\nname = "my-skill"\ndescription = "..."\n\n[skill.metadata]\ntrigger = "when user asks about X"'}
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Assigned Roles (comma-separated, empty = all)
              </label>
              <input
                type="text"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="admin, member"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="glass-button inline-flex items-center gap-1.5 text-xs"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Save Skill
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); }}
                className="glass-button text-xs text-text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <Loader2 className="size-5 animate-spin text-text-muted" />
        ) : skills.length === 0 ? (
          <p className="text-sm text-text-secondary">No custom skills uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="rounded-md border border-[var(--ag-border-subtle)] p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{skill.name}</span>
                    <span className={`glass-badge text-xs ${skill.enabled ? "text-green-400" : "text-text-muted"}`}>
                      {skill.enabled ? "active" : "disabled"}
                    </span>
                    {skill.assignedRoles.map((r) => (
                      <Tag key={r} label={r} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(skill)}
                      className="rounded p-1 text-text-muted hover:text-text-primary"
                      title={skill.enabled ? "Disable" : "Enable"}
                    >
                      {skill.enabled
                        ? <ToggleRight className="size-4 text-green-400" />
                        : <ToggleLeft className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}
                      className="rounded p-1 text-text-muted hover:text-text-primary"
                    >
                      {expanded === skill.id
                        ? <ChevronUp className="size-4" />
                        : <ChevronDown className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(skill.id)}
                      className="rounded p-1 text-text-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {expanded === skill.id && (
                  <pre className="mt-3 overflow-x-auto rounded bg-[var(--ag-bg-subtle)] p-3 font-mono text-xs text-text-secondary">
                    {skill.manifestToml}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: MCP Servers ─────────────────────────────────────────────────────────

function McpServersTab({ org }: { org: OrgInfo }) {
  const isEnterprise = org.plan === "enterprise";
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [roles, setRoles] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isEnterprise) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/mcp-servers?organizationId=${org.id}`);
      const data = await res.json();
      setServers(data.servers ?? []);
    } finally {
      setLoading(false);
    }
  }, [org.id, isEnterprise]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          name: name.trim(),
          url: url.trim(),
          bearerToken: token.trim() || undefined,
          assignedRoles: roles.split(",").map((r) => r.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Save failed");
      } else {
        setShowForm(false);
        setName(""); setUrl(""); setToken(""); setRoles("");
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (server: McpServer) => {
    await fetch("/api/tenant/mcp-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: org.id,
        serverId: server.id,
        enabled: !server.enabled,
      }),
    });
    await load();
  };

  const handleDelete = async (serverId: string) => {
    await fetch("/api/tenant/mcp-servers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: org.id, serverId }),
    });
    await load();
  };

  if (!isEnterprise) return <EnterpriseBadge plan={org.plan} />;

  return (
    <div className="glass-card space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader icon={Server} title="Private MCP Servers" />
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="glass-button inline-flex items-center gap-1.5 text-xs"
        >
          <Plus className="size-3.5" /> Register Server
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-md border border-[var(--ag-border-subtle)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Server Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="internal-crm"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">Server URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mcp.internal.company.com"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Bearer Token <span className="text-text-muted">(encrypted at rest)</span>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Assigned Roles (empty = all)
              </label>
              <input
                type="text"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="admin, member"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="glass-button inline-flex items-center gap-1.5 text-xs"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Register
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="glass-button text-xs text-text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Loader2 className="size-5 animate-spin text-text-muted" />
      ) : servers.length === 0 ? (
        <p className="text-sm text-text-secondary">No private MCP servers registered.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--ag-border-subtle)] text-left text-xs uppercase tracking-wider text-text-muted">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Roles</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ag-border-subtle)]">
            {servers.map((s) => (
              <tr key={s.id}>
                <td className="py-2.5 pr-4 font-mono text-text-primary">{s.name}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {s.assignedRoles.length === 0
                      ? <Tag label="all roles" />
                      : s.assignedRoles.map((r) => <Tag key={r} label={r} />)}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={`glass-badge text-xs ${s.enabled ? "text-green-400" : "text-text-muted"}`}>
                    {s.enabled ? "active" : "disabled"}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(s)}
                      className="rounded p-1 text-text-muted hover:text-text-primary"
                    >
                      {s.enabled
                        ? <ToggleRight className="size-4 text-green-400" />
                        : <ToggleLeft className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      className="rounded p-1 text-text-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Tab: Usage & Audit ───────────────────────────────────────────────────────

function UsageAuditTab({ org }: { org: OrgInfo }) {
  const [usageData, setUsageData] = useState<{
    totalEvents: number;
    periodStart: string | null;
    creditsRemaining: number;
    creditsMonthly: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organization?includeUsage=true`);
      const data = await res.json();
      const o = data.organizations?.find((x: { id: string }) => x.id === org.id);
      if (o) {
        setUsageData({
          totalEvents: 0, // Lago event counts fetched separately
          periodStart: o.billingPeriodStart ?? null,
          creditsRemaining: o.creditsRemaining,
          creditsMonthly: o.creditsMonthly,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="glass-card">
        <SectionHeader icon={Database} title="Credit & Usage Summary" />
        {loading ? (
          <Loader2 className="size-5 animate-spin text-text-muted" />
        ) : usageData ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
              <span className="text-text-secondary">Credits Remaining</span>
              <span className="font-mono text-text-primary">
                {usageData.creditsRemaining} / {usageData.creditsMonthly}
              </span>
            </div>
            {usageData.periodStart && (
              <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
                <span className="text-text-secondary">Period Start</span>
                <span className="font-mono text-text-primary">
                  {new Date(usageData.periodStart).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Plan</span>
              <span className="glass-badge capitalize">{org.plan}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Could not load usage data.</p>
        )}
      </div>

      <div className="glass-card">
        <SectionHeader icon={Shield} title="Audit Log" />
        <p className="text-sm text-text-secondary">
          Admin actions (role changes, skill uploads, MCP server registrations)
          are recorded in the platform audit log. Full log export is available
          via{" "}
          <a href="/console/lago" className="underline hover:text-text-primary">
            the Lago console
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "policy" | "skills" | "mcp" | "usage";

const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: "policy", label: "Capability Policy", icon: Shield },
  { id: "skills", label: "Custom Skills", icon: BookOpen },
  { id: "mcp", label: "MCP Servers", icon: Server },
  { id: "usage", label: "Usage & Audit", icon: Database },
];

export default function ArcanAdminPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("policy");
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/organization");
      const data = await res.json();
      const first = data.organizations?.[0];
      if (!first) {
        setAccessError("No organization found.");
        setLoading(false);
        return;
      }
      if (first.role !== "owner" && first.role !== "admin") {
        setAccessError("Access restricted to tenant admins.");
        setLoading(false);
        return;
      }
      setOrg({ id: first.id, name: first.name, plan: first.plan, role: first.role });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (accessError || !org) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="glass-card text-center text-text-secondary">
          {accessError ?? "Organization not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Arcan Admin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {org.name} · <span className="capitalize">{org.plan}</span> plan ·{" "}
            <span className="capitalize">{org.role}</span>
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--ag-border-subtle)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === id
                ? "border-[var(--ag-accent)] text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "policy" && <CapabilityPolicyTab org={org} />}
      {tab === "skills" && <CustomSkillsTab org={org} />}
      {tab === "mcp" && <McpServersTab org={org} />}
      {tab === "usage" && <UsageAuditTab org={org} />}
    </div>
  );
}
