<!-- brief -->
# Broomva Commercial Visual Design Brief

**Status:** Final — assets produced 2026-05-12
**Date:** 2026-05-11
**Scope:** Commercial visual asset family for broomva.tech (hero still, paid-social still, 10s video)
**Supersedes:** Previous 4-treatment commercial pack from earlier 2026-05-11 (Conceptual / Editorial / Cinematic / Photographic — outputs in `/tmp/broomva-shoot/`). That direction read as generic Linear/Vercel SaaS marketing and missed broomva's actual classical-cybernetic worldview.
**Assets:** `docs/superpowers/specs/2026-05-11-broomva-commercial-visual-assets/` — see `CONTACT-SHEET.png` for a 3-up preview.

---

## Direction: Anima Toroidalis

The asset family is built around a single image: a living toroidal field — the Anima — as substrate for the broomva agent OS. Classical cybernetic aesthetics (control-system diagrams, feedback loops, phase portraits) rendered in warm cream and deep maroon against a dark field.

### Asset Family

| Asset | Dimensions | Format | Notes |
|-------|-----------|--------|-------|
| Hero still | 2560×1440 | PNG | Type composited via SVG |
| Social still | 1440×1440 | PNG | Type composited via SVG |
| 10s video | 1920×1080 | MP4 H264+AAC | Type overlay fades in at t=8s |

### Design Tokens

- Background: near-black `#0E0B06`
- Cream: `#FBF5E9`
- Maroon accent: `#8B1A1A`
- Body font: Helvetica Neue / Inter (system fallback)
- Display font: Didot / GT Sectra (system fallback)

### Production Notes

- Substrate generated via Higgsfield Seedream 4.5 (toroidal field, no text)
- Type composited in Python/Pillow from SVG templates in `svg/`
- Video motion via Kling 2.6 (3 candidates, `kling-final.mp4` selected, then type-overlaid to `video.mp4`)
- First video frame (`video/video-frame0.png`) shows depopulated substrate — deliberate contrast with closing type-present frame

### Implementation Plan

`docs/superpowers/plans/2026-05-11-broomva-commercial-visual-production.md`
