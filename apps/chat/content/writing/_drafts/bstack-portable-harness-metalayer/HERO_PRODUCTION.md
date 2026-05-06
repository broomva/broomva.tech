# bstack post — cinematic hero production notes

## What ships

| File | Path | Size | Purpose |
|---|---|---|---|
| `hero-cinematic.mp4` | `public/video/writing/bstack-portable-harness-metalayer/` | ~280 KB | Inline hero video (1280×720, H.264, yuv420p, autoplay/loop/muted) |
| `hero-cinematic.webm` | `public/video/writing/bstack-portable-harness-metalayer/` | ~464 KB | VP9 alternative (currently unused; available for future `<source>` upgrade) |
| `hero-cinematic-poster.png` | `public/images/writing/bstack-portable-harness-metalayer/` | ~514 KB | Video poster + frontmatter `image:` (OG/social card) |
| `hero-cinematic.gif` | `public/images/writing/bstack-portable-harness-metalayer/` | ~1.5 MB | Cross-platform sharing fallback (X/LinkedIn/Telegram preview) |

## Composition

8-second seamless loop at 30 fps, 1920×1080 source rendered down to 1280×720 for inline use.

### Phase windows (loop progress 0 → 1)

| Range | Phase | What's on screen |
|---|---|---|
| 0.00 – 0.10 | Seed | Pure black with subtle radial bg, single amber point at center intensifying |
| 0.10 – 0.30 | Field emergence | 28 particle nodes fade in with layer-staggered timing (inner first) |
| 0.30 – 0.55 | Pulse cascade | Connections light up amber as a pulse traverses 26 graph edges |
| 0.45 – 0.75 | Wordmark reveal | "bstack" (serif, 180px) blur-clears in over 4.5s, "the body around the brain" follows |
| 0.75 – 0.95 | Hold | Constellation glows steady, wordmark visible |
| 0.95 – 1.00 | Dim to black | Particles + wordmark fade, returns to seed-only state for clean loop |

### Cinematic devices

- **Cinemascope letterbox** — top/bottom black bars at 12% of frame height
- **Camera drift** — slow circular translate (±12px X, ±8px Y) + 1.04× breathing scale via `Math.sin(t * 2π)`
- **Vignette** — radial-gradient dark edges, intensity modulated through phases
- **Film grain** — SVG `feTurbulence` overlay at 6% opacity with `mixBlendMode: overlay`, seed advances every 3 frames
- **Layered fade-in** — particles stagger by their `layer` attribute (core → ring → scatter)
- **Pulse physics** — narrow gaussian window centered at each connection's `phase`, traverses 0 → 1 over the cascade window
- **Type animation** — blur-clearing reveal (16px → 0), translateY (12 → 0), no opacity-only fade

### Color grade

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0a0e1a` | Inner radial background |
| `bgDeep` | `#04060d` | Frame fill, letterbox bars |
| `accent` | `#f5a623` | Pulse, wordmark glow |
| `accentSoft` | `#ffd089` | Seed point, subtitle |
| `node` | `#9bb4d4` | Particle base color |
| `nodeBright` | `#dde9ff` | Wordmark fill |

## Reproducing

1. Source files are mirrored at `remotion/` next to this doc:
   - `BstackCinematicHero.tsx` — composition
   - `Root.tsx` — registers the composition (8s × 30fps × 1920×1080)
   - `package.json` — Remotion 4.0.260 + React 18

2. From a fresh Remotion project:
   ```bash
   bun install
   bunx remotion render src/index.ts BstackCinematicHero out/hero.mp4 \
     --codec=h264 --crf=18 --pixel-format=yuv420p
   bunx remotion still src/index.ts BstackCinematicHero out/poster.png \
     --frame=195
   ```

3. Re-encode to web-optimized formats:
   ```bash
   # 720p MP4 for inline
   ffmpeg -i out/hero.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 22 \
     -preset slow -pix_fmt yuv420p -movflags +faststart hero-cinematic.mp4

   # WebM VP9
   ffmpeg -i out/hero.mp4 -c:v libvpx-vp9 -crf 33 hero-cinematic.webm

   # GIF for sharing
   ffmpeg -i out/hero.mp4 -vf "fps=15,scale=720:-2:flags=lanczos,split[s0][s1];\
     [s0]palettegen=max_colors=128:stats_mode=diff[p];\
     [s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
     -loop 0 hero-cinematic.gif
   ```

## Why these choices

- **Abstract over literal** — the 28-node constellation doesn't tie to any specific primitive count, so the visual remains accurate as the contract evolves (P12, P13, …).
- **Cinematic over flashy** — slow movements, blur reveals, letterbox bars, film grain. The post argues the substrate is load-bearing; the hero treats it with weight.
- **Seamless loop** — start and end frames near-identical (single amber seed at center), no jarring cut on `<video loop>`.
- **MP4 lead, GIF fallback** — modern browsers all play autoplay-muted-loop MP4 inline; GIF is for X/LinkedIn cards and chat clients.
