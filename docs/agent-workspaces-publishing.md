# Agent workspaces publishing

The canonical source is [broomva/agent-workspaces](https://github.com/broomva/agent-workspaces).
This site carries a generated, immutable release under
`apps/broomva/public/agent-workspaces/v<version>/`. Do not edit those files here.
The deck opens as its own HTML document, with its fonts, controls, themes, guide,
and scene hashes preserved. It does not inherit the site's React layout.

## Publish an update

1. Review and tag the source repository, then run its documented build to export
   the live deck and both PDFs from that same source commit.
2. Update `apps/broomva/lib/agent-workspaces.ts` to the new version and base path.
3. Import the reviewed build with
   `bun scripts/sync-agent-workspaces.ts --from /path/to/agent-workspaces/dist`.
   The importer validates every checksum and records the source commit and manifest
   digest in `apps/broomva/lib/agent-workspaces-release.json`.
4. Run `bun scripts/sync-agent-workspaces.ts --check`, the proxy tests, and the site
   checks. Open the landing page and follow its deck, guide, PDF, and resource links
   in an anonymous browser session.
5. Open a site PR containing the new release and pin. After deployment, verify the
   same public URLs without a login, including the deck's local font requests.

Committed artifacts keep production builds independent of GitHub availability.
Older version directories remain valid for links shared from past releases.
The stable `/agent-workspaces/deck/` entry point redirects to the current version;
query parameters and the browser's scene fragment survive the redirect.

The landing page is indexed in the sitemap and linked from `/links`. Its manifest
is public so a reader can verify the PDFs and deck against the source release.
