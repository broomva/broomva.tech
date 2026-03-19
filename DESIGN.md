# Design System: Arcan Glass

**Project ID:** broomva-tech

## 1. Visual Theme & Atmosphere

A **deep-space observatory** aesthetic — dark, immersive, and precision-engineered. The design language evokes looking through frosted glass panels into a command center where AI and Web3 technologies converge. Surfaces feel layered and translucent, floating above an ink-dark void with subtle blue-purple undertones. The atmosphere is **technically sophisticated yet approachable**, balancing dense information displays with generous whitespace and breathing room.

**Key characteristics:**
- **Dark-first**: Near-black backgrounds with a subtle 275-hue blue-purple tint, never pure black
- **Glass morphism**: Every elevated surface uses backdrop-blur with translucent backgrounds, creating depth through layered transparency
- **Dual-brand glow**: Two signature luminous accents — a vivid AI Blue and an electric Web3 Green — used sparingly as beacons of interactivity and status
- **Perceptually uniform color**: All colors defined in OKLCH for consistent lightness perception across the palette
- **Wide-gamut aware**: Enhanced chroma on P3 displays for richer brand colors
- **Reduced-motion respectful**: All animation gracefully degrades to instant transitions

## 2. Color Palette & Roles

### Primary Foundation

- **Abyssal Indigo** (`oklch(0.12 0.02 275)` / `#12121a`) — Deepest background layer, the void behind all content. Used for `<body>` and page-level backgrounds
- **Midnight Navy** (`oklch(0.15 0.04 245)` / `#001f3f`) — Secondary dark surface for sidebars, navigation rails, and recessed panels
- **Twilight Slate** (`oklch(0.17 0.03 275)` / `#1a1a2e`) — Primary card and container surface. The default "paper" of the design system
- **Dusk Plum** (`oklch(0.22 0.03 275)` / `#232340`) — Elevated surfaces: popovers, dropdowns, floating panels, and modals
- **Nebula Ash** (`oklch(0.26 0.03 275)` / `#2a2a4a`) — Hover states and interactive surface highlights

### Accent & Interactive

- **Resonant AI Blue** (`oklch(0.62 0.12 265)` / `#7B8FCC`) — Primary brand color. Used exclusively for primary CTAs, active navigation links, focus rings, and interactive element accents. Enhanced to `oklch(0.62 0.14 265)` on P3 displays for subtle extra depth
- **Phosphor Web3 Green** (`oklch(0.72 0.19 155)` / `#00cc66`) — Secondary brand accent. Used for success states, secondary CTAs, blockchain/web3-related indicators, and complementary highlights. Enhanced to `oklch(0.72 0.22 155)` on P3 displays

### Typography & Text Hierarchy

- **Pure Snow** (`oklch(0.98 0 0)` / `#ffffff`) — Primary text. Headings, body copy, and all critical readable content
- **Lavender Haze** (`oklch(0.70 0.02 275)` / `#a0a0b8`) — Secondary text. Descriptions, supporting labels, and less prominent information
- **Pewter Fog** (`oklch(0.50 0.02 275)` / `#6b6b80`) — Muted text. Placeholders, timestamps, metadata, and tertiary information
- **Shadow Mauve** (`oklch(0.38 0.02 275)` / `#4a4a5c`) — Disabled text. Inactive controls and unavailable options

### Functional States

- **Signal Green** (`oklch(0.72 0.19 155)`) — Success confirmations, completed states, positive indicators (shares value with Web3 Green)
- **Amber Flare** (`oklch(0.87 0.18 85)`) — Warnings, caution states, pending actions
- **Cinnabar Red** (`oklch(0.58 0.24 27)`) — Errors, destructive actions, critical alerts
- **Cerulean Pulse** (`oklch(0.62 0.12 265)`) — Informational states, tooltips, help indicators (shares value with AI Blue)

### Borders

- **Whisper Edge** (`oklch(0.30 0.02 275 / 0.40)`) — Subtle borders for glass containers, cards, and dividers
- **Slate Divide** (`oklch(0.40 0.02 275 / 0.50)`) — Default borders for inputs, form elements, and standard separators
- **Iron Frame** (`oklch(0.50 0.02 275 / 0.60)`) — Strong borders for emphasis, selected states, and interactive containers
- **Focus Beacon** (`oklch(0.62 0.12 265)`) — Focus-visible outlines, keyboard navigation indicator (matches AI Blue)

### Charts & Data Visualization

1. Resonant AI Blue (`oklch(0.62 0.12 265)`)
2. Phosphor Web3 Green (`oklch(0.72 0.19 155)`)
3. Orchid Magenta (`oklch(0.65 0.22 330)`)
4. Amber Flare (`oklch(0.87 0.18 85)`)
5. Burnt Sienna (`oklch(0.60 0.20 30)`)

### Light Mode Adaptations

In light mode, lightness values invert while maintaining the same 275-hue undertone:
- Backgrounds shift to near-white (`0.96–1.0` lightness) with minimal chroma
- Text darkens to near-black with blue-purple tint
- Glass opacity increases (`0.60–0.90` vs dark mode's `0.40–0.80`) for legibility on bright backgrounds
- Shadows soften dramatically (`0.05–0.18` opacity vs dark mode's `0.30–0.55`)
- Brand colors remain unchanged across modes

## 3. Typography Rules

### Font Families

- **Headings**: CalSans SemiBold (local) — a confident, geometric semi-bold display face with clean terminals. Warm and modern without being playful. Falls back to Poppins, then system sans-serif
- **Body**: Geist (Google Fonts) — a precise, neo-grotesque sans-serif optimized for screen readability. Neutral enough for long-form, distinctive enough for UI labels. Falls back to -apple-system, BlinkMacSystemFont, system-ui
- **Monospace**: Geist Mono (Google Fonts) — the monospaced companion to Geist, used for code blocks, terminal output, and technical values. Falls back to SF Mono, Fira Code, JetBrains Mono

### Weight & Size Hierarchy

| Role | Font | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| Display Headlines (H1–H2) | CalSans | 600 (SemiBold) | 1.2 | Tight leading for impact |
| Section Headers (H3–H6) | CalSans | 600 (SemiBold) | 1.2 | Same face, scaled down |
| Body Text | Geist | 400 (Regular) | 1.5 | Comfortable reading rhythm |
| UI Labels & Buttons | Geist | 500 (Medium) | — | Slightly bolder for scannability |
| Code & Technical | Geist Mono | 400 (Regular) | 1.5 | Matches body line height |
| Badges & Micro-text | Geist | 500 (Medium) | — | 0.625rem, uppercase, 0.2em letter-spacing |

### Rendering

- `text-rendering: optimizeLegibility` for crisp glyph shaping
- `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` for consistent subpixel rendering
- `text-wrap: balance` utility available for headline wrapping

## 4. Component Stylings

### Glass Foundation

All elevated components share a glass morphism foundation with three intensity tiers:

| Tier | Opacity | Blur | Saturation | Use Case |
|------|---------|------|------------|----------|
| Subtle | 40% | 8px | 1.1 | Badges, light overlays |
| Medium | 60% | 16px | 1.2 | Cards, buttons, standard surfaces |
| Heavy | 80% | 24px | 1.3 | Navigation, modals, critical panels |

Each glass surface includes a subtle top-down gradient highlight (`white 5% → 2% → transparent`) that simulates light catching the glass edge.

### Buttons

- **Shape**: Subtly rounded corners (8px `--ag-radius-md`), not pill-shaped
- **Glass button (default)**: Translucent elevated background, 1px default border, 0.875rem text at medium weight. On hover: surface lightens, border strengthens, lifts 1px with a whisper shadow
- **Primary (AI Blue)**: 85% opaque AI Blue background with a 50% opacity luminous border. White text. On hover: intensifies to 95% opacity with a blue glow halo (`0 0 20px` spread)
- **Accent (Web3 Green)**: 85% opaque Web3 Green with luminous green border. Dark text for contrast. On hover: green glow halo
- **Standard variants** (shadcn/ui): default, destructive, outline, secondary, ghost, link — all mapped to Arcan Glass tokens
- **Sizes**: Default (h-9), Small (h-8), Large (h-10), Icon (square aspect ratios)
- **Disabled**: 50% opacity, no pointer events
- **Transition**: 150ms ease on all properties

### Cards & Containers

- **Glass Card**: Medium glass tier, 1px subtle border, medium shadow (`0 4px 8px`), 12px rounded corners (glass radius), 1.25rem internal padding
- **Hover behavior**: Lifts 2px (`translateY(-2px)`), shadow deepens to large, border gains a faint AI Blue tint (`0.30` opacity)
- **Glass highlight**: Top-edge gradient pseudo-element for dimension
- **Transition**: 250ms ease on transform, shadow, and border-color

### Navigation

- **Glass Nav**: Heavy glass tier applied to navigation bars, anchored with a bottom subtle border
- **Background**: Dark surface at 80% opacity with 24px blur and 1.3 saturation boost
- **Shadow**: Small shadow beneath for grounding
- **Highlight**: Full-width top gradient for light simulation

### Inputs & Forms

- **Border**: Default border color (`--ag-border-default`), transitions to focus beacon on focus
- **Background**: Elevated surface at 30% opacity in dark mode
- **Focus state**: 3px ring in AI Blue at 50% opacity, border shifts to ring color
- **Placeholder**: Muted foreground color
- **Corner style**: Matched to component context (typically `--ag-radius-md`)
- **Mobile**: Minimum 16px font size to prevent iOS zoom

### Badges

- **Glass Badge**: Lightest glass tier (40% opacity, 4px blur)
- **Shape**: Fully rounded (pill, `9999px` radius)
- **Typography**: 0.625rem, uppercase, 0.2em letter-spacing, medium weight
- **Color**: Secondary text on subtle border

### Scrollbars

- **Width**: 8px (both axes)
- **Track**: Transparent
- **Thumb**: Strong border color with full rounding, lightens to muted text on hover

## 5. Layout Principles

### Spacing System

- **Base unit**: 0.25rem (4px) — all spacing derives from this multiplier
- **Component padding**: Cards use 1.25rem (20px). Buttons use 0.5rem vertical, 1rem horizontal
- **Consistent gaps**: `gap-2` (8px) as the default internal spacing rhythm

### Responsive Behavior

- **Dark-first, mode-switchable**: `next-themes` manages HTML class toggling between `.dark` and `.light`
- **Toast breakpoint**: Custom 600px breakpoint for mobile toast positioning
- **Mobile-first**: 16px minimum font size on inputs to prevent iOS Safari zoom
- **Reduced motion**: All animations collapse to `0.01ms` duration; hover transforms become `none`
- **Container queries**: Used for card header layout adaptation (`@container/card-header`)

### Visual Balance

- **Min-width reset**: All elements receive `min-w-0` to prevent flex/grid overflow
- **Text balance**: Utility class available for balanced headline wrapping
- **Overflow handling**: Custom scrollbar styling maintains the glass aesthetic even in scroll regions

### Animations

- **Fast interactions** (150ms): Button hovers, link color changes, focus transitions
- **Normal transitions** (250ms): Card hover lifts, border changes, surface shifts
- **Slow reveals** (350ms): Panel expansions, content reveals
- **Morphing** (500ms, cubic-bezier): Glass element shape and size transformations
- **Ambient glow** (1500ms, ease-in-out): Pulsing glow effects for loading and attention states
- **Glass reveal**: 500ms cubic-bezier entry animation with opacity, blur, and subtle scale+translate

### Accessibility

- **Focus-visible**: 2px solid AI Blue outline with 2px offset on all interactive elements
- **High contrast fallback**: Hex color values provided via `@supports not (color: oklch())` for browsers without OKLCH support
- **Reduced motion**: Comprehensive `prefers-reduced-motion` media query disabling all animation and transform
- **Selection color**: AI Blue at 30% opacity for text selection highlighting

## 6. Design System Notes for Stitch Generation

### Language Templates

When prompting for Arcan Glass screens, frame requests as:

> "Design a [component/page] with the Arcan Glass aesthetic — dark translucent surfaces with 275-hue blue-purple undertone, AI Blue (#7B8FCC) primary accents, glass-morphism cards with backdrop blur, CalSans headings over Geist body text."

### Color Reference Format

Always reference colors as: **Descriptive Name** + OKLCH value + hex fallback. Example:
> "Use Resonant AI Blue (`oklch(0.62 0.12 265)` / `#7B8FCC`) for primary interactive elements."

### Component Prompt Examples

- **Glass card**: "A translucent card with 60% opacity, 16px backdrop blur, subtle top-edge highlight gradient, 12px rounded corners, lifting 2px on hover with deepening shadow."
- **Primary button**: "An AI Blue button at 85% opacity with a luminous border, white text, growing to 95% opacity with a blue glow halo on hover."
- **Navigation bar**: "A heavy glass nav with 80% dark surface opacity, 24px blur, subtle bottom border, fixed at top."

### Iteration Guidance

- Preserve the **275-hue** blue-purple undertone across all neutral surfaces — never use pure gray
- Glass effects should always include the **three properties**: translucent background (via `color-mix`), `backdrop-filter: blur()`, and a subtle border
- Ensure **AI Blue and Web3 Green** are the only saturated colors outside of semantic states
- Maintain the **OKLCH color space** for all new color definitions to ensure perceptual uniformity
- Test in both dark and light modes — light mode inverts lightness while keeping hue and chroma
