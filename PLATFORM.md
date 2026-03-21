# broomva.tech Platform — Public/Private Split

Following the Supabase model: the runtime is open-source, the management
plane is private.

## What lives where

### broomva.tech (public)

| Path | Purpose |
|------|---------|
| `apps/chat` | AI chat application (Next.js) |
| `packages/cli` | CLI tooling |
| `packages/*` (future) | Shared UI, utilities, configs |
| `turbo.json` | Build pipeline |
| Root configs | Biome, TypeScript, Bun workspace |

### broomva-platform (private)

| Path (overlayed into workspace) | Purpose |
|---------------------------------|---------|
| `apps/console` | Multi-tenant admin console |
| `packages/billing` | Stripe integration, usage metering |
| `packages/tenant` | Tenant provisioning, isolation, routing |
| `packages/deploy` | Edge deployment orchestration |
| `packages/conformance` | Policy enforcement, audit logging |

## Local development setup

### Option A: Submodule (recommended for CI)

```bash
# From broomva.tech root
git submodule add git@github.com:broomva/broomva-platform.git .platform
./scripts/platform-setup.sh
```

The setup script detects the submodule and symlinks its contents into the
workspace tree.

### Option B: Sibling directory (recommended for local dev)

```bash
# Clone both repos side by side
cd ~/broomva
git clone git@github.com:broomva/broomva.tech.git
git clone git@github.com:broomva/broomva-platform.git

# Run setup from the public repo
cd broomva.tech
./scripts/platform-setup.sh
```

The script detects `../broomva-platform` and creates symlinks.

## How the overlay works

1. `broomva.tech/.gitignore` excludes the private paths (`apps/console/`,
   `packages/billing/`, etc.) so they never leak into the public repo.
2. `platform-setup.sh` symlinks them from whichever source it finds
   (submodule `.platform/` or sibling `../broomva-platform/`).
3. Bun workspace globs (`apps/*`, `packages/*`) pick them up automatically.
4. Turborepo discovers all workspace packages — no turbo.json changes needed.

## Verifying the setup

```bash
./scripts/platform-setup.sh   # Idempotent — safe to re-run
bun install                    # Resolves cross-workspace deps
turbo build                    # Builds everything that exists
```

If the private repo is absent, the public repo works standalone with no
errors. The private packages simply do not exist in the workspace.
