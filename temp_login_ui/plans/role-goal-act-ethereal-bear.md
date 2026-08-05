# EpoMail — Login Screen (Epocanvas Mail)

## Context
Building the login screen for a new product, **Epocanvas Mail (EpoMail)**, targeting Gen Z with a "Premium Modern / Subtle Tech" aesthetic — sleek, dark-mode-leaning, glassmorphic, with fluid motion and high-contrast neon accents. The brand DNA must fuse three ideas: **EPO** (time/digital coordinates), **MAIL** (a futuristic data node, *not* a paper envelope), and **CANVAS** (an infinite, interactive digital sandbox, not a flat image).

The current `src/app/App.tsx` is an empty template. Everything needed is already installed: React 18, Tailwind v4, `motion` (12.x), `lucide-react`. No `@make-kits` design system exists — this project uses shadcn-style components under `src/app/components/ui/`, but for this bespoke, highly-visual screen we will build custom components using Tailwind + Motion + a raw HTML canvas (per environment guidance: use HTML canvas directly, never `konva`).

**Confirmed creative decisions:**
- Background = **Hybrid**: deep fluid aurora gradient + a kinetic dot-grid overlay.
- Login card = **Acrylic prism**: a sharp, beveled frosted-glass block suspended in the canvas.

## Design foundation

### Palette (define once as CSS tokens in `src/styles/theme.css`, scoped to a `.epomail` wrapper or added under `:root`)
- `--epo-void: #05060f` (near-black midnight base)
- `--epo-deep: #0a1030` (midnight blue)
- `--epo-purple: #7c3aed` / glow `#a855f7`
- `--epo-cyan: #22d3ee` / glow `#67e8f9`
- `--epo-ink: #e8ecff` (primary text), `--epo-muted: #8b93c4`
- Accent gradient: purple → cyan for CTAs, focus glows, and prism edges.

### Typography
- Display/wordmark: a modern geometric sans (e.g. **Space Grotesk** or **Sora**) imported at the **top of `src/styles/fonts.css`** only.
- Body/inputs: **Inter** (or system stack) for legibility.
- Do NOT use Tailwind font-size/weight utilities per project rules; rely on theme.css base styles and set sizes via the tokens/CSS where custom sizing is truly needed.

## Component architecture (all new files under `src/app/components/epomail/`)

1. **`App.tsx`** (edit existing) — mounts the `LoginScreen`, applies dark background + full-viewport layout. Adds the `.epomail` theme scope.

2. **`CanvasBackground.tsx`** — the "Infinite Canvas" (Canvas + Epo DNA). Layered:
   - **Aurora layer**: 2–3 large blurred radial-gradient blobs (midnight blue, neon purple, cyan) animated with Motion (`motion.div`) on slow, offset loops for a fluid, undulating gradient. CSS `filter: blur()` + `mix-blend`.
   - **Dot-grid layer**: a raw `<canvas>` filling the viewport, drawing a perspective dot-grid/mesh. `requestAnimationFrame` loop with subtle undulation (sine displacement per dot over time) to feel 3D/kinetic and represent "time passage" (Epo).
   - **Cursor reactivity (Interactive Hook 1)**: track pointer position; dots within a radius get a *magnetic pull* toward the cursor + brightness boost. Throttled via the rAF loop (no per-mousemove React state).
   - **Ripple/pulse API (Interactive Hooks 2 & 3)**: expose an imperative handle (via `useImperativeHandle` + `forwardRef`, or a shared event emitter/ref) so the form can trigger neon ripples on the canvas — one on each keystroke (small pulse at a data-node position) and a large "warp" burst on login submit.

3. **`LoginCard.tsx`** — the "Mail" node, an **acrylic prism**:
   - Centered, floating, ultra-thin frosted block: `backdrop-blur-xl`, semi-transparent dark fill, a **gradient (purple→cyan) 1px border** via masked border technique, and **beveled edge highlights** (top-left light streak, bottom-right shadow) to read as faceted acrylic.
   - Subtle parallax/tilt: card translates a few px opposite to cursor (Motion `useSpring`) so it feels suspended in the canvas.
   - Contents: EpoMail wordmark + a small **data-node glyph** (custom SVG / lucide combo — a node/orbit motif, explicitly NOT an envelope), tagline, the form.

4. **`AuthForm.tsx`** — the form (frontend-only, mocked):
   - Email + password fields as **borderless floating inputs with glowing underlines** (works inside the prism): transparent bg, bottom border that ignites purple→cyan on focus, floating labels.
   - Password field: on each keystroke, call the canvas ripple API → neon light pulse on the canvas (Hook 2).
   - **"Login" button = warp activation (Hook 3)**: on click, Motion sequence — button compresses, emits a gradient shockwave, label morphs to a loading/warp state, and triggers the large canvas warp burst; then shows a mocked success (e.g. brief confetti-free glow + toast via `sonner`, or inline success state). No real auth — stubbed with a timeout.
   - Secondary affordances: "Forgot password?" link, a divider, and one or two SSO buttons (Google / GitHub via lucide icons) styled as glass chips. "New here? Create account" link.

5. **`useCanvasPulse` (optional hook)** — small shared ref/emitter so `AuthForm` can fire pulses at `CanvasBackground` without prop-drilling render state.

## Motion & interaction details
- Use `motion/react` (import `{ motion }`), never call it "Framer Motion".
- Entrance: card + fields stagger in (fade + slight rise + blur-to-sharp) on mount.
- Aurora blobs: infinite eased loops, offset phases.
- Respect `prefers-reduced-motion`: reduce canvas animation to a static grid + still aurora.

## Performance / correctness notes
- Canvas sizing on `resize` with `devicePixelRatio` scaling for crisp dots.
- Cursor + keystroke reactivity handled inside the rAF loop / canvas, avoiding high-frequency React re-renders.
- Clean up rAF and event listeners on unmount.

## Files to create / modify
- `src/app/App.tsx` (edit) — mount screen, dark full-bleed layout, `.epomail` scope.
- `src/styles/fonts.css` (edit) — font import(s) at top.
- `src/styles/theme.css` (edit) — add EpoMail color tokens.
- `src/app/components/epomail/CanvasBackground.tsx` (new)
- `src/app/components/epomail/LoginCard.tsx` (new)
- `src/app/components/epomail/AuthForm.tsx` (new)
- `src/app/components/epomail/NodeGlyph.tsx` (new, custom SVG mark)
- (optional) `src/app/components/epomail/useCanvasPulse.ts` (new)

## Verification
- The Vite dev server is already running — do NOT start it or point the user at localhost; use the Figma Make preview surface.
- Manual checks in preview:
  1. Aurora gradient shifts fluidly; dot-grid undulates and dots pull toward the cursor as it moves.
  2. Typing in the password field emits neon pulses on the canvas.
  3. Clicking **Login** triggers the warp burst + button activation sequence, then a mocked success state.
  4. Card reads as a beveled acrylic prism (blur, gradient edge, subtle tilt) and stays legible/centered.
  5. Responsive: card scales/stacks cleanly on mobile widths; background still performs.
  6. `prefers-reduced-motion` falls back to static visuals.
- Classification: **PureFrontend** — all auth is mocked; no Supabase/backend needed.
