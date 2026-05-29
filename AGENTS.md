# broomva.tech — Agent Guidelines

## Learned User Preferences

- When reporting a fix, provide evidence (reproduce in browser, check network/API) before claiming success
- Use desaturated/muted blues and Apple-like liquid glass aesthetics — reject saturated "electric" accents as too loud
- Follow `DESIGN.md` token semantics strictly: web3-green is for success/web3 meaning only, not generic hovers; accent surfaces should read as subtle glass lift
- Vary article layouts with editorial rhythm — mix hero-width, side-by-side, and centered blocks; avoid uniformly full-width or uniformly shrunken figures
- Keep navigation split: header for site/content routes, bottom dock for product routes; `/console` is a product route and must show dock Home
- User supplies DOM paths + component names to anchor feedback — fix against those selectors and React components
- Landing "stack" cards must link to correct distinct pages with real project names, never generic placeholders or duplicate targets
- Skills install commands (`npx skills add ...`) must use real GitHub slugs and copy to clipboard on click with `cursor-pointer` affordance
- Hero canvas/background must read edge-to-edge behind the fixed header with no visible "cut" band
- OG/Twitter images must use absolute URLs and cover listing routes (`/`, `/writing`, etc.), not only slug pages
- Prefer SSR-first resolution over client-side flash — resolve session/user data server-side to avoid layout shift; pass minimal props (e.g. `userName` string) across RSC boundaries
- When installing shadcn blocks (e.g. `sidebar-07`), match the reference source exactly — do not strip components, merge structures, or improvise the layout shell

## Learned Workspace Facts

- Primary app surface is `apps/chat` (Next.js App Router, Bun, Turborepo, Tailwind, Biome)
- Animation uses `motion/react` (Motion v12+), never import `framer-motion` as the package name
- Arcan Glass variables live in `globals.css` (`--ag-ai-blue`, `--ag-web3-green`); changing AI blue affects site-wide link color via `a { color: var(--ag-ai-blue) }`
- Three route-group layouts: `(site)` for marketing/writing, `(chat)` for the AI chat, `(console)` for the Agent OS dashboard — each has its own sidebar and layout shell
- `(chat)` uses `AppSidebar` (chat history, new-chat button, search); `(console)` uses `ConsoleSidebar` (shadcn sidebar-07 pattern); never share a single sidebar component across both
- Writing content lives in `apps/chat/content/writing/`; remark pipeline uses `remark-html` with `sanitize: false` and `remark-gfm` for tables
- Writing thumbnails driven by optional `image` in post frontmatter via `ContentFrontmatter`/`ContentSummary`; media assets at `public/images/writing/{slug}/`
- Global audio uses a single `<audio>` element in root `app/layout.tsx` via `AudioPlaybackProvider`; persistence via `audio-playback` cookie + `/api/audio-playback` REST endpoint for authenticated sync
- tRPC hooks only exist in the chat subtree — site routes use REST/fetch for the same server capabilities
- React StrictMode double-runs effects in dev; fire-on-mount patterns (auto-submit, ChatSync cleanup) must account for cleanup order
- Multiple markdown renderers exist: Streamdown for chat, remark pipeline for site content — different feature sets for GFM, highlighting, sanitization
- Bottom dock (`TopNav`) must be placed **inside** `SidebarProvider` in layouts that use it, not outside — placing it outside breaks the sidebar flex layout
