# Anima Toroidalis — Asset Pack

Production output for `docs/superpowers/specs/2026-05-11-broomva-commercial-visual-design.md`.
Implementation plan: `docs/superpowers/plans/2026-05-11-broomva-commercial-visual-production.md`

## Layout

- `substrate/` — raw AI-generated substrate (Seedream 4.5 or fallback), no type. `locked.png` is the canonical 2560×1440; `locked-square.png` is the 1440×1440 center crop used as the social starting point.
- `hero/` — final 16:9 hero composites with type. `hero.png` is canonical (== `hero-v04.png`).
- `social/` — final 1:1 social composites with type. `social.png` is canonical (== `social-v02.png`).
- `video/` — Kling 2.6 base motion + ffmpeg-composited final. `video.mp4` is canonical (1920×1080, 10s, H264+AAC). `kling-final.mp4` is the pre-overlay base; `overlay.png` is the transparent type bed; `cinema-preflight.json` records that Cinematic Studio Video 3.0 was Pro-plan-gated and Kling became sole video.
- `svg/` — SVG templates (Cardo + GFS Didot + STIX Two via system fonts, base64-embedded substrate to work around `rsvg-convert`'s cross-directory restriction). `hero-plate.svg`, `social-plate.svg`, `video-overlay.svg`.
- `CONTACT-SHEET.png` — three-up preview (hero | social | video opening frame).

## Known limitations (carry into v2)

The asset pack ships with three caveats documented at production time. Anyone iterating off this pack should be aware:

1. **Substrate sanguine red is not isolated to the throat.** The brief's Section 3 specifies sanguine red `#A82A1F` at exactly three places: throat constriction, plate header `PLATE I.`, and the L3 row of the stability table. The SVG type layer honors this discipline cleanly. The AI-generated substrate, however, applied sanguine across the entire minor-axis mesh (the perpendicular hatching family) rather than only at the throat. This was Phase 1 concern #1, accepted after four Seedream iterations and a Nano Banana Pro fallback path that produced worse register. The composited hero/social/video still read as scholarly anatomical plates because the type layer's three correct red placements anchor the eye to the canonical locations — but a strict reading of the brief sees the substrate red as a violation. v2 work: re-roll substrate with a tighter prompt that explicitly suppresses red on anything except the throat, or use a Pro-plan model with finer color discipline.

2. **Substrate weight hierarchy is inverted.** The brief specifies the major-axis flow as the primary stroke (thicker) and the minor-axis as secondary (thinner). In `locked.png` the minor-axis hatching reads heavier than the major-axis curves — opposite ordering. This is the second Phase 1 concern. It does not break the scholarly register but is sub-spec.

3. **Video type overlay is static, not progressively animated.** The brief's Section 4 specifies a beat-by-beat timeline: λ₀ stabilizes at 0:02, λ₁ at 0:04, etc., with the type appearing in sequence. The delivered `video.mp4` instead burns the entire type overlay as a single PNG that fades in over the last 2 seconds. This was the documented v1 simplification — full progressive animation requires motion-graphics tooling (After Effects, or animated SVG → MP4) beyond the Phase 4 ffmpeg approach. v2 work: produce the progressive type animation when there is a budget for the motion-graphics pass.

## Deliverable dimensions

- Hero: 2560×1440 (Seedream 4.5's native ceiling; brief minimum was ≥2688×1512 — shortfall is a model limitation, not a compositing error)
- Social: 1440×1440 (brief minimum was ≥1520×1520; same model-ceiling caveat)
- Video: 1920×1080, 10.04s, H264+AAC, 9.1 MB

Both stills satisfy every major ad-platform minimum at their delivered resolutions.
