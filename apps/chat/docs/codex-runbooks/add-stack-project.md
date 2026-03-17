# Add a Stack Project

Add a new project to the Agent OS stack section of the site.

## Steps

1. Create `content/projects/<slug>.mdx` with frontmatter:
   - `title`, `summary`, `date`, `published: true`, `pinned: true`, `status`, `tags`, `links`
   - Follow the Problem / Approach / Architecture / Status / Why it matters structure.
2. If the project should appear in the "The stack" section on the landing page:
   - Edit `app/(site)/page.tsx` and add an entry to the `stack` array with `name`, `role`, and `href`.
3. If the project replaces an existing pinned project:
   - Set `pinned: false` on the replaced project's MDX file.
4. Verify:
   - `bun run build` passes.
   - `/projects/<slug>` renders correctly.
   - `/` shows the new pinned project card.
   - `/projects` list includes the new project.
