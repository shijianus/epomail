# EpoMail — Fused Logo + Full-Screen Loading Animation

## Context
EpoMail has two competing logo explorations: V1 (cyber/glass rings, neon gradient, glow filters) and V2 (organic cloud-curve envelope with a negative-space V-flap and a 10:10 time-seal clock). Neither alone reads as "Epoch + Email" at premium quality. We want one synthesized mark, then a Google-Workspace-grade full-screen loader where the logo itself is the only moving element — no text, no dots, no spinner.

The current `src/App.tsx` is an unrelated dot-grid demo and will be replaced as the loader host.

## Design direction
- **Silhouette (from V2):** the cloud-curve envelope path (`M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z`) on a 400×400 viewBox. No rounded-rect app-icon plate — the mark floats directly on the dark field so it doesn't read as a boxy AI-slop icon.
- **Negative space (from V2):** `<mask>` cutting the V-shaped flap fold, the two side crease strokes, and the centered clock seal at `(200,270) r=26` with hands at 10:10.
- **Lighting (from V1):** neon gradient `#00F5D4 → #0072FF → #5B24FF`, a `radialGradient` glass sheen highlight at ~35%/30%, a specular top arc stroke at `rgba(255,255,255,0.55)`, `feGaussianBlur`+`feMerge` glow, and 4–6 small orbiting accent particles (cyan/indigo/magenta) instead of V1's full crossing ellipses — keeps it minimal at loader scale.

## Files
1. **`src/components/EpoMailMark.tsx`** (new) — default-exported standalone SVG component. Props: `className`. All gradient/mask/filter ids namespaced (`epoMark*`) so it is safely reusable. Uses `pathLength`-friendly strokes and stable class hooks (`.epo-envelope`, `.epo-seal`, `.epo-hands`, `.epo-arc`, `.epo-particles`, `.epo-glow`) that the CSS animation targets.
2. **`src/components/LoadingScreen.tsx`** (new) — default export; `min-h-screen w-full grid place-items-center bg-[#0B0F19]` wrapper containing only the mark at a fluid size (`w-[min(46vmin,300px)]`). Zero text nodes, zero secondary indicators. Adds `motion-reduce` handling by CSS.
3. **`src/index.css`** — append the keyframes and animation rules after `@import 'tailwindcss';` (import stays first). Animate only `transform`, `opacity`, `stroke-dashoffset`, and gradient-stop `stop-color` for GPU-friendly 60fps:
   - `epo-draw`: one-shot stroke-draw entry of the mask creases + seal ring (`stroke-dasharray`/`stroke-dashoffset`, ~1.1s `cubic-bezier(.65,0,.35,1)`).
   - `epo-rise`: mark fades/scales in from `.94` with a slight y-offset, same easing.
   - `epo-breathe`: infinite 3.2s ease-in-out gentle scale `1 → 1.035` on the seal plus glow-opacity pulse.
   - `epo-hands`: continuous slow rotation of the minute hand (and 12× slower hour hand) about `200 270` via `transform-box: fill-box`/`transform-origin`, so "time passing" is the loading signal.
   - `epo-hue`: 6s infinite cycling of the gradient stop colors across the cyan/indigo/purple triad.
   - `epo-orbit`: staggered particle drift/opacity, `animation-delay` per particle.
   - `@media (prefers-reduced-motion: reduce)`: keep the static mark, drop rotation/breathe/orbit.
4. **`src/App.tsx`** — replace dot-grid demo with `return <LoadingScreen />`.

Deliverables in chat: the standalone `<svg>` source and a self-contained copy-pasteable HTML+CSS version of the loader, mirroring the React implementation.

## Verification
- Dev server is already running on `$PORT`; check the preview renders a centered glowing envelope-clock on `#0B0F19` with no text or dots, entry draw plays once, then breathing/hand-rotation/gradient cycling loops seamlessly.
- Confirm no layout shift or scrollbar (full-viewport, `overflow-hidden`).
- Toggle reduced motion to confirm the static fallback.
