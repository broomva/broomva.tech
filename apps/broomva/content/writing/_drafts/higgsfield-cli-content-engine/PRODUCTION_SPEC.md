# Production spec — multimedia for `higgsfield-cli-content-engine.mdx`

**Status:** queued for May 7 (Higgsfield Starter plan renews)
**Owner:** broomva via the daily /loop cron
**Linear:** (filed when this spec lands)
**Account:** `carlosdavidescobar@gmail.com`, Starter plan

This spec is fully scripted. When credits are available, every command below runs verbatim — no creative re-planning needed. The post is about the Higgsfield CLI integration; the multimedia must be Higgsfield-native, following the cinematic doctrine the post describes.

---

## Pre-flight check

```bash
# 1. Verify auth + balance
~/.local/bin/higgsfield account status
# expect: starter plan, ≥ 50 credits

# 2. If balance < 50, abort and notify user — multimedia plan needs ~32-50 credits minimum
```

If account check passes, proceed sequentially through asset 1 → 2 → optional 3.

---

## Asset 1 — Hero image (Villeneuve aesthetic)

**Concept:** the "30 models converging into one CLI" metaphor rendered as architectural space — vast geometric interior, multiple light streams flowing into a single central column. Cinematic editorial. The hero of the post.

**Model:** `text2image_soul_v2` (cost: **12 credits**)

**Prompt (verbatim — do not edit):**

```
A vast geometric architectural interior, cathedral-scale, with thirty distinct beams of cool blue-white light flowing downward from above and converging into a single warm amber column at the center of the frame. Vast negative space surrounds the convergence point. Diffused atmospheric haze with visible volumetric beams. Muted earth tones with deep shadows on the side walls. Slow push-in composition, contemplative scale, IMAX wide angle, cinematic anamorphic, Denis Villeneuve aesthetic — Blade Runner 2049 + Arrival visual language. The thirty beams represent thirty agentic AI models. The single amber column represents one consolidated CLI. Photorealistic render, 8K detail, no text, no characters.
```

**CLI:**

```bash
~/.local/bin/higgsfield generate create text2image_soul_v2 \
  --wait \
  --prompt "A vast geometric architectural interior, cathedral-scale, with thirty distinct beams of cool blue-white light flowing downward from above and converging into a single warm amber column at the center of the frame. Vast negative space surrounds the convergence point. Diffused atmospheric haze with visible volumetric beams. Muted earth tones with deep shadows on the side walls. Slow push-in composition, contemplative scale, IMAX wide angle, cinematic anamorphic, Denis Villeneuve aesthetic — Blade Runner 2049 + Arrival visual language. The thirty beams represent thirty agentic AI models. The single amber column represents one consolidated CLI. Photorealistic render, 8K detail, no text, no characters."
```

**Save to:** `apps/chat/public/images/writing/higgsfield-cli-content-engine/hero-villeneuve-convergence.png`

**Use in MDX:** at the top of the post, between frontmatter and `# Higgsfield CLI in the Content Engine`. Markdown:

```markdown
![Cathedral-scale architectural interior with thirty cool blue beams converging into a single warm amber column — Villeneuve aesthetic visualizing thirty AI models consolidating into one CLI](/images/writing/higgsfield-cli-content-engine/hero-villeneuve-convergence.png)
```

---

## Asset 2 — Workflow diagram image (Fincher aesthetic)

**Concept:** the cinema → Higgsfield workflow rendered as a clinical, desaturated technical diagram. Visual reinforcement for the "every node is a single CLI invocation" claim. Goes between the **What changed** section and the **CLI vs MCP** section, captioned as the architectural before/after.

**Model:** `soul_cinematic` (cost: **12 credits**) — best for desaturated technical/clinical aesthetic

**Prompt (verbatim — do not edit):**

```
A schematic technical diagram in the visual style of a David Fincher production design board: dark slate background, low-key sodium-vapor lighting from above, desaturated blue-green tones with cold amber accents on critical elements. Six geometric nodes arranged in a vertical chain — Concept (small empty rectangle), Camera Style (angular wireframe shape), Start Frame (a single illuminated rectangular plate), Soul ID Lock (a small circular ring node), Motion (an elongated horizontal capsule), Post-Production (a final rectangular frame). Each node is connected to the next by a single thin amber line indicating data flow. To the left of the chain, the words "ONE CLI" appear as architectural-stencil text in cool blue-grey, with thirty parallel hair-thin lines flowing into the chain from above. Clinical precision, locked tripod composition, overhead shot. Slight grain. No human figures. Highly geometric, schematic, intentional.
```

**CLI:**

```bash
~/.local/bin/higgsfield generate create soul_cinematic \
  --wait \
  --prompt "A schematic technical diagram in the visual style of a David Fincher production design board: dark slate background, low-key sodium-vapor lighting from above, desaturated blue-green tones with cold amber accents on critical elements. Six geometric nodes arranged in a vertical chain — Concept (small empty rectangle), Camera Style (angular wireframe shape), Start Frame (a single illuminated rectangular plate), Soul ID Lock (a small circular ring node), Motion (an elongated horizontal capsule), Post-Production (a final rectangular frame). Each node is connected to the next by a single thin amber line indicating data flow. To the left of the chain, the words 'ONE CLI' appear as architectural-stencil text in cool blue-grey, with thirty parallel hair-thin lines flowing into the chain from above. Clinical precision, locked tripod composition, overhead shot. Slight grain. No human figures. Highly geometric, schematic, intentional."
```

**Save to:** `apps/chat/public/images/writing/higgsfield-cli-content-engine/workflow-fincher-diagram.png`

**Use in MDX:** insert between the "## The cinema → Higgsfield workflow" heading and the workflow code block. Caption:

```markdown
![Schematic Fincher-style production design board showing the six-node cinema → Higgsfield workflow with thirty thin lines representing thirty consolidated models flowing into one CLI](/images/writing/higgsfield-cli-content-engine/workflow-fincher-diagram.png)
```

---

## Asset 3 (optional, defer if credits low) — Hero video clip (Veo 3.1 Lite)

**Concept:** a short 4-6 second loop of the Villeneuve hero image with a slow push-in motion, embedded as a hero video on the post. Validates the start-frame-first doctrine end-to-end (image generated first, motion synthesis from the image as keyframe).

**Pre-flight cost check before running:**

```bash
~/.local/bin/higgsfield generate cost veo3_1_lite --prompt "test" --image <hero_upload_id>
# If cost > 30 credits, skip this asset; the post stands without video
```

**Model:** `veo3_1_lite` (cost: TBD until checked)

**Workflow:** Asset 1 must complete first; capture its `upload_id` from the `generate create` output.

**Prompt:**

```
Slow push-in shot, 4-second cinematic clip. The camera moves slowly toward the central amber column where thirty cool blue beams converge. Subtle volumetric haze drifts. The amber light pulses gently, almost imperceptibly. Distant ambient hum suggested through atmospheric reverb. Locked composition, no panning, no other movement. Photorealistic, cinematic anamorphic, Villeneuve aesthetic.
```

**CLI:**

```bash
~/.local/bin/higgsfield generate create veo3_1_lite \
  --wait \
  --image <upload_id_from_asset_1> \
  --prompt "Slow push-in shot, 4-second cinematic clip. The camera moves slowly toward the central amber column where thirty cool blue beams converge. Subtle volumetric haze drifts. The amber light pulses gently, almost imperceptibly. Distant ambient hum suggested through atmospheric reverb. Locked composition, no panning, no other movement. Photorealistic, cinematic anamorphic, Villeneuve aesthetic."
```

**Save to:** `apps/chat/public/video/writing/higgsfield-cli-content-engine/hero-loop.mp4` (create the directory; it doesn't exist yet)

**Use in MDX:** replace the hero image at the top with an HTML5 video element using the hero image as poster:

```mdx
<video
  src="/video/writing/higgsfield-cli-content-engine/hero-loop.mp4"
  poster="/images/writing/higgsfield-cli-content-engine/hero-villeneuve-convergence.png"
  autoPlay
  loop
  muted
  playsInline
  className="w-full rounded-lg"
/>
```

---

## Post-asset MDX update

After all assets are saved, edit `apps/chat/content/writing/higgsfield-cli-content-engine.mdx`:

1. Add hero (image or video per asset 3 outcome) immediately after frontmatter, before the `# Higgsfield CLI in the Content Engine` heading.
2. Insert workflow diagram before the workflow code block.
3. Optionally update frontmatter `summary` to mention "with Villeneuve-aesthetic hero rendered via Higgsfield Soul V2."
4. Run `cd /Users/broomva/broomva/broomva.tech/apps/chat && bun lint` to check the MDX still parses.

---

## Commit + push

```bash
cd /Users/broomva/broomva/broomva.tech
git add apps/chat/content/writing/higgsfield-cli-content-engine.mdx \
        apps/chat/public/images/writing/higgsfield-cli-content-engine/ \
        apps/chat/public/video/writing/higgsfield-cli-content-engine/ 2>/dev/null

git commit -m "$(cat <<'EOF'
feat(writing): add Villeneuve-aesthetic hero + Fincher workflow diagram to higgsfield-cli post

Multimedia generated end-to-end via Higgsfield CLI, following the
cinematic doctrine described in the post:

- Hero: Soul V2, Villeneuve aesthetic — vast architectural interior
  with thirty cool blue beams converging into one amber column,
  visualizing the "30 models → 1 CLI" consolidation thesis.
- Workflow diagram: Soul Cinematic, Fincher production-design aesthetic
  — desaturated technical schematic showing the six-node cinema →
  Higgsfield pipeline.
- (If credits permitted: hero video loop via Veo 3.1 Lite, image-to-video
  start-frame-first.)

This validates the integration end-to-end: every asset on this post
about the Higgsfield CLI integration is itself a Higgsfield CLI generation,
auth'd once, scripted from a single shell pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin main
```

---

## Total cost estimate

| Asset | Model | Cost | Required? |
|-------|-------|------|-----------|
| Hero image | `text2image_soul_v2` | 12 credits | **Yes** |
| Workflow diagram | `soul_cinematic` | 12 credits | Yes (post is much better with it) |
| Hero video | `veo3_1_lite` | TBD (~50?) | No (defer if budget tight) |

**Minimum spend:** 24 credits for both images.
**With video:** likely 70-100 credits total.

After May 7 plan renewal, abort if balance < 24 credits and report; otherwise proceed mechanically.

---

## Failure modes to watch

1. **Generation produces text artifacts** — the prompts say "no text" but Soul models sometimes ignore that. If text appears in the output, regenerate once with the prompt prefixed by `(no readable text or labels in the image)`. If still failing, accept and move on.
2. **Hero composition off-center** — Villeneuve prompts sometimes produce off-axis compositions. Acceptable as long as the convergence point is visible. Don't burn extra credits on aesthetic re-rolls; the post is about the integration, not the image.
3. **Video cost exceeds 50 credits** — skip video, ship images only. The post stands without it.
4. **Auth lapsed** — if `account status` returns "Not authenticated" on May 7, the user needs to re-run `higgsfield auth login` before this can proceed.
