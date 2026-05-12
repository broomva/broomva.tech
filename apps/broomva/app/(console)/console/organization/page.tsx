"use client";

import {
  Building2,
  Crown,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planDisplayName: string;
  creditsMonthly: number;
  creditsRemaining: number;
  memberCount: number;
  role: string;
  createdAt: string;
}

interface Member {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  joinedAt: string;
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["Community models only", "50 credits/month"],
  pro: [
    "All AI models",
    "Console dashboard",
    "API keys (1)",
    "Deep research",
    "5,000 credits/month",
  ],
  team: [
    "All AI models",
    "Console dashboard",
    "API keys (10)",
    "Deep research",
    "Priority model queue",
    "Shared workspace",
    "20,000 credits/month",
  ],
  enterprise: [
    "Everything in Team",
    "Managed Life instance",
    "Custom domain",
    "SLA guarantees",
    "Custom credits",
  ],
};

const ROLE_ICONS: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: Users,
  viewer: Users,
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrganizationPage() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Create org form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviting, setInviting] = useState(false);

  // Selected org (first one by default)
  const selectedOrg = orgs[0] ?? null;

  // ── Fetch organizations ──────────────────────────────────────────────

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/organization", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load organizations");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setOrgs(data.organizations ?? []);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch members for selected org ───────────────────────────────────

  const fetchMembers = useCallback(async (orgId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(
        `/api/organization/members?organizationId=${orgId}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setMembers([]);
        return;
      }
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (selectedOrg) {
      fetchMembers(selectedOrg.id);
    }
  }, [selectedOrg?.id, fetchMembers]);

  // ── Create organization ──────────────────────────────────────────────

  const handleCreate = async () => {
    setActionError(null);
    setActionSuccess(null);

    const slug = newSlug.toLowerCase().trim();

    if (!newName.trim()) {
      setActionError("Organization name is required");
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setActionError(
        "Slug must be 3-32 characters, lowercase alphanumeric and hyphens only",
      );
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), slug }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to create organization");
        return;
      }

      setActionSuccess("Organization created successfully");
      setNewName("");
      setNewSlug("");
      setShowCreateForm(false);
      await fetchOrgs();
    } catch {
      setActionError("Network error while creating organization");
    } finally {
      setCreating(false);
    }
  };

  // ── Invite member ────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!selectedOrg) return;
    setActionError(null);
    setActionSuccess(null);

    if (!inviteEmail.trim()) {
      setActionError("Email address is required");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/organization/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to add member");
        return;
      }

      setActionSuccess(`Member added as ${inviteRole}`);
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteForm(false);
      await fetchMembers(selectedOrg.id);
      await fetchOrgs();
    } catch {
      setActionError("Network error while inviting member");
    } finally {
      setInviting(false);
    }
  };

  // ── Remove member ────────────────────────────────────────────────────

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrg) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/organization/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrg.id, userId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to remove member");
        return;
      }

      setActionSuccess("Member removed");
      await fetchMembers(selectedOrg.id);
      await fetchOrgs();
    } catch {
      setActionError("Network error while removing member");
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  const isOwnerOrAdmin =
    selectedOrg?.role === "owner" || selectedOrg?.role === "admin";

  const isFree = selectedOrg?.plan === "free";

  // Auto-derive slug from name
  const handleNameChange = (value: string) => {
    setNewName(value);
    if (!newSlug || newSlug === slugify(newName)) {
      setNewSlug(slugify(value));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass-card text-center text-text-secondary">
          {error}
        </div>
      </div>
    );
  }

  // ── No organization: show create form ────────────────────────────────

  if (orgs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Organization</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create an organization to manage your team and billing.
          </p>
        </div>

        <div className="glass-card space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-medium text-text-primary">
            <Building2 className="size-5" />
            Create your organization
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Organization Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Company"
                className="glass-input w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Slug
              </label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) =>
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="my-company"
                className="glass-input w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
              <p className="mt-1 text-xs text-text-muted">
                Lowercase letters, numbers, and hyphens. 3-32 characters.
              </p>
            </div>
          </div>

          {actionError && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {actionError}
            </div>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="glass-button inline-flex items-center gap-2"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create Organization
          </button>
        </div>
      </div>
    );
  }

  // ── Has organization: show management dashboard ──────────────────────

  const features = PLAN_FEATURES[selectedOrg.plan] ?? PLAN_FEATURES.free;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Organization</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your organization, members, and plan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchOrgs();
            if (selectedOrg) fetchMembers(selectedOrg.id);
          }}
          className="glass-button"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Status messages */}
      {actionError && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400">
          {actionSuccess}
        </div>
      )}

      {/* Organization Info */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <Building2 className="size-4" />
          Organization
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Name</span>
            <span className="font-medium text-text-primary">
              {selectedOrg.name}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Slug</span>
            <span className="font-mono text-text-primary">
              {selectedOrg.slug}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Plan</span>
            <span className="glass-badge">{selectedOrg.planDisplayName}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Members</span>
            <span className="font-mono text-text-primary">
              {selectedOrg.memberCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Your Role</span>
            <span className="glass-badge capitalize">{selectedOrg.role}</span>
          </div>
        </div>
      </section>

      {/* Plan Details */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <Zap className="size-4" />
          Plan Details
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Current Tier</span>
            <span className="font-medium text-text-primary">
              {selectedOrg.planDisplayName}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Credits Remaining</span>
            <span className="font-mono text-text-primary">
              {selectedOrg.creditsRemaining} / {selectedOrg.creditsMonthly}
            </span>
          </div>
          <div>
            <span className="mb-2 block text-text-secondary">
              Features Included
            </span>
            <ul className="space-y-1">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-text-primary"
                >
                  <span className="size-1.5 rounded-full bg-green-400" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upgrade CTA */}
        {isFree && (
          <div className="mt-6 rounded-md border border-[var(--ag-accent)]/30 bg-[var(--ag-accent)]/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">
                  Unlock more with Pro
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Get access to all AI models, console, API keys, and 5,000
                  monthly credits.
                </p>
              </div>
              <a
                href="/pricing"
                className="glass-button inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Zap className="size-4" />
                Upgrade
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="glass-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <Users className="size-4" />
            Members
          </h2>
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowInviteForm(!showInviteForm);
                setActionError(null);
                setActionSuccess(null);
              }}
              className="glass-button inline-flex items-center gap-1.5 text-xs"
            >
              <UserPlus className="size-3.5" />
              Add Member
            </button>
          )}
        </div>

        {/* Invite form */}
        {showInviteForm && isOwnerOrAdmin && (
          <div className="mb-4 space-y-3 rounded-md border border-[var(--ag-border-subtle)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                onClick={handleInvite}
                disabled={inviting}
                className="glass-button inline-flex items-center gap-1.5 text-xs"
              >
                {inviting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserPlus className="size-3.5" />
                )}
                Add
              </button>
            </div>
          </div>
        )}

        {membersLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-text-muted" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-center text-sm text-text-secondary">
            No members found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ag-border-subtle)] text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-4">User</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Joined</th>
                  {isOwnerOrAdmin && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ag-border-subtle)]">
                {members.map((member) => {
                  const RoleIcon = ROLE_ICONS[member.role] ?? Users;
                  return (
                    <tr key={member.memberId}>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {member.image ? (
                            <img
                              src={member.image}
                              alt={member.name}
                              className="size-6 rounded-full"
                            />
                          ) : (
                            <div className="flex size-6 items-center justify-center rounded-full bg-[var(--ag-border-subtle)] text-xs text-text-muted">
                              {member.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <span className="text-text-primary">
                            {member.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-text-secondary">
                        {member.email}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="glass-badge inline-flex items-center gap-1 capitalize">
                          <RoleIcon className="size-3" />
                          {member.role}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-text-muted">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      {isOwnerOrAdmin && (
                        <td className="py-2.5 text-right">
                          {member.role !== "owner" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.userId)}
                              className="rounded p-1 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                              title="Remove member"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create another org */}
      {!showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="glass-button inline-flex items-center gap-2 text-xs text-text-muted"
        >
          <Plus className="size-3.5" />
          Create another organization
        </button>
      )}

      {showCreateForm && (
        <section className="glass-card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <Building2 className="size-4" />
            New Organization
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Company"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Slug
              </label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) =>
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="my-company"
                className="w-full rounded-md border border-[var(--ag-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--ag-accent)]"
              />
              <p className="mt-1 text-xs text-text-muted">
                Lowercase letters, numbers, and hyphens. 3-32 characters.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="glass-button inline-flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setNewSlug("");
              }}
              className="glass-button text-text-muted"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
