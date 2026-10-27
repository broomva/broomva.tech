# Agent workspaces publishing

The canonical source is [broomva/agent-workspaces](https://github.com/broomva/agent-workspaces).
This site carries a generated, immutable release under
`apps/broomva/public/agent-workspaces/v<version>/`. Do not edit those files here.
The deck opens as its own HTML document, with its fonts, controls, themes, guide,
and scene hashes preserved. It does not inherit the site's React layout.

## Publish an update

1. Review and tag the source repository, then run its documented build to export
   the live deck and both PDFs from that same source commit.
2. Update `version` in `apps/broomva/lib/agent-workspaces.ts`; the importer's release
   directory and the site's base path both derive from it. Add the literal
   `!public/agent-workspaces/v<version>` exclusion to `files.includes` in
   `apps/broomva/biome.jsonc` so lint skips the immutable bundle.
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

## Narrated edition (v1.1.0)

The landing page's primary action opens `/agent-workspaces/deck/?play`. It presents a Play control; browsers require a user gesture before audio starts. The self-contained deck bundles River / Eleven v4 audio, generated captions and cue points for its 37 scenes and 103 reveals. Audio time controls navigation and reveal timing, including after pause, seek, rate changes and background-tab return.

The narration is a 22:59 adaptation, while the live talk includes demonstrations and discussion. Audio and its credit notice live under `deck/narration/` in the immutable release; the existing same-origin media policy applies. Verify an anonymous HTTP 206 byte-range response for `deck/narration/river.mp3` after deploy, then test a cold mid-deck link such as `?play#scene=16&beat=1`. A host that cannot seek must pause with a recovery message rather than play mismatched audio.

The importer requires the audio, its credits and the root attribution/license notices, validates their hashes before writes and keeps v1.0.0 untouched. Source browser tests cover the player; the website checks the generated payload, stable redirect, framing and public access.
