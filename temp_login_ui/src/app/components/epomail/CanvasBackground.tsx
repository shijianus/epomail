import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Imperative API exposed to the login form so keystrokes / submit can
 * inject visual feedback into the canvas without triggering React re-renders.
 */
export interface CanvasHandle {
  /** Small neon ripple — used on password keystrokes. */
  pulse: (opts?: { color?: "purple" | "cyan" | "indigo"; strength?: number }) => void;
  /** Explosive nova burst — used on every keystroke. */
  burst: (opts?: {
    color?: "purple" | "cyan" | "indigo";
    strength?: number;
    x?: number;
    y?: number;
  }) => void;
  /** Large activation shockwave — used on the "warp" login trigger. */
  warp: () => void;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: [number, number, number];
  strength: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
}

const PURPLE: [number, number, number] = [168, 85, 247];
const INDIGO: [number, number, number] = [99, 102, 241];
const CYAN: [number, number, number] = [103, 232, 249];

function pickColor(c?: "purple" | "cyan" | "indigo"): [number, number, number] {
  if (c === "cyan") return CYAN;
  if (c === "indigo") return INDIGO;
  if (c === "purple") return PURPLE;
  // Random along the harmonious triad.
  const r = Math.random();
  return r < 0.34 ? PURPLE : r < 0.67 ? INDIGO : CYAN;
}

export const CanvasBackground = forwardRef<CanvasHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const sizeRef = useRef({ w: 0, h: 0 });

  useImperativeHandle(ref, () => ({
    pulse: (opts) => {
      const { w, h } = sizeRef.current;
      if (!w) return;
      ripplesRef.current.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.35,
        y: h / 2 + (Math.random() - 0.5) * 120,
        radius: 0,
        maxRadius: 140,
        life: 1,
        color: pickColor(opts?.color),
        strength: opts?.strength ?? 0.6,
      });
    },
    burst: (opts) => {
      const { w, h } = sizeRef.current;
      if (!w) return;
      const x = opts?.x ?? w / 2 + (Math.random() - 0.5) * w * 0.45;
      const y = opts?.y ?? h / 2 + (Math.random() - 0.5) * 180;
      const color = pickColor(opts?.color);
      // Nova burst — staggered concentric shockwaves for a tactile "firework".
      for (let i = 0; i < 3; i++) {
        ripplesRef.current.push({
          x,
          y,
          radius: i * -18,
          maxRadius: 220 + Math.random() * 90,
          life: 1.4,
          color,
          strength: (opts?.strength ?? 1.25) * (1 - i * 0.22),
        });
      }
    },
    warp: () => {
      const { w, h } = sizeRef.current;
      if (!w) return;
      const x = w / 2;
      const y = h / 2;
      ripplesRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: Math.max(w, h) * 1.15,
        life: 1,
        color: CYAN,
        strength: 1.5,
      });
      ripplesRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: Math.max(w, h) * 0.85,
        life: 1,
        color: PURPLE,
        strength: 1.2,
      });
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const spacing = 36;
    let cols = 0;
    let rows = 0;
    let stars: Star[] = [];

    const buildStars = () => {
      const count = Math.round((width * height) / 9000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.3,
        base: Math.random() * 0.5 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 1.4 + 0.4,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / spacing) + 2;
      rows = Math.ceil(height / spacing) + 2;
      buildStars();
    };
    resize();

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };
    const onPointerLeave = () => {
      pointerRef.current.active = false;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);

    // Flowing aurora blobs — the autonomous environmental animation.
    const auroraBlobs = [
      { color: PURPLE, cx: 0.28, cy: 0.3, rad: 0.55, ax: 0.14, ay: 0.1, sx: 0.11, sy: 0.07, ph: 0 },
      { color: INDIGO, cx: 0.6, cy: 0.35, rad: 0.5, ax: 0.16, ay: 0.12, sx: 0.09, sy: 0.13, ph: 1.7 },
      { color: CYAN, cx: 0.72, cy: 0.68, rad: 0.48, ax: 0.13, ay: 0.11, sx: 0.14, sy: 0.08, ph: 3.1 },
      { color: INDIGO, cx: 0.35, cy: 0.75, rad: 0.44, ax: 0.12, ay: 0.14, sx: 0.1, sy: 0.12, ph: 4.5 },
    ];

    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      // 1. Deep-space base wash.
      const base = ctx.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#05060f");
      base.addColorStop(0.5, "#080a1f");
      base.addColorStop(1, "#05060f");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      // 2. Autonomous flowing aurora (additive glow).
      ctx.globalCompositeOperation = "lighter";
      for (const b of auroraBlobs) {
        const drift = reduceMotion ? 0 : 1;
        const cx = (b.cx + Math.sin(t * b.sx + b.ph) * b.ax * drift) * width;
        const cy = (b.cy + Math.cos(t * b.sy + b.ph) * b.ay * drift) * height;
        const rad =
          b.rad *
          Math.max(width, height) *
          (1 + (reduceMotion ? 0 : Math.sin(t * 0.12 + b.ph) * 0.12));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const [r, gr, bl] = b.color;
        g.addColorStop(0, `rgba(${r},${gr},${bl},0.22)`);
        g.addColorStop(0.45, `rgba(${r},${gr},${bl},0.08)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalCompositeOperation = "source-over";

      // 3. Twinkling deep-space starscape.
      for (const s of stars) {
        const tw = reduceMotion
          ? s.base
          : s.base + Math.sin(t * s.speed + s.phase) * 0.35;
        const a = Math.max(0, Math.min(1, tw));
        ctx.fillStyle = `rgba(226,232,255,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Kinetic dot-grid — Brownian "data dust" + cursor pull + ripples.
      const pointer = pointerRef.current;
      const pullRadius = 160;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const baseX = i * spacing;
          const baseY = j * spacing;

          // Layered chaotic Brownian drift (visible when fully idle).
          const brownian = reduceMotion
            ? 0
            : Math.sin(t * 0.9 + i * 1.3 + j * 0.7) * 4 +
              Math.cos(t * 1.25 + j * 1.4 - i * 0.5) * 4;
          const wave = reduceMotion
            ? 0
            : Math.sin(t * 0.6 + i * 0.35 + j * 0.25) * 4 +
              Math.cos(t * 0.42 + i * 0.2 - j * 0.3) * 4;

          let x = baseX + wave + brownian;
          let y = baseY + wave * 0.6 + brownian * 0.8;
          let size = 1;
          let alpha = 0.26;

          if (pointer.active) {
            const dx = pointer.x - baseX;
            const dy = pointer.y - baseY;
            const dist = Math.hypot(dx, dy);
            if (dist < pullRadius) {
              const force = (1 - dist / pullRadius) ** 2;
              x += dx * force * 0.35;
              y += dy * force * 0.35;
              size += force * 2.4;
              alpha += force * 0.65;
            }
          }

          let rr = 0;
          let rg = 0;
          let rb = 0;
          let rippleAlpha = 0;
          for (const ripple of ripplesRef.current) {
            const dist = Math.hypot(ripple.x - baseX, ripple.y - baseY);
            const band = Math.abs(dist - ripple.radius);
            if (band < 28) {
              const influence = (1 - band / 28) * ripple.life * ripple.strength;
              rippleAlpha += influence;
              rr += ripple.color[0] * influence;
              rg += ripple.color[1] * influence;
              rb += ripple.color[2] * influence;
            }
          }

          if (rippleAlpha > 0.01) {
            const k = Math.min(rippleAlpha, 1);
            size += k * 2.6;
            const cr = Math.round(rr / rippleAlpha);
            const cg = Math.round(rg / rippleAlpha);
            const cb = Math.round(rb / rippleAlpha);
            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${Math.min(
              alpha + k * 0.7,
              1
            )})`;
          } else {
            ctx.fillStyle = `rgba(139, 147, 196, ${Math.min(alpha, 1)})`;
          }

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Advance ripples.
      ripplesRef.current = ripplesRef.current.filter((r) => {
        r.radius += 9 + r.maxRadius * 0.014;
        r.life = Math.max(0, 1 - r.radius / r.maxRadius);
        return r.life > 0.01;
      });

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* All autonomous motion (aurora + starscape + dust) is rendered here. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Macro-scale astronomical element: distant planet silhouette,
          recolored to blend with the violet→indigo→cyan harmony. */}
      <div
        className="absolute rounded-full"
        style={{
          width: "70vw",
          height: "70vw",
          right: "-28vw",
          bottom: "-34vw",
          background:
            "radial-gradient(circle at 34% 30%, rgba(99,102,241,0.14) 0%, rgba(124,58,237,0.06) 42%, rgba(5,6,15,0) 70%)",
          boxShadow:
            "inset 22px 30px 90px rgba(103,232,249,0.14), inset -40px -50px 120px rgba(5,6,15,0.85)",
          border: "1px solid rgba(103,232,249,0.08)",
        }}
      />
      {/* Solar flare — a single grand arc of light. */}
      <div
        className="absolute"
        style={{
          width: "220vw",
          height: "2px",
          top: "42%",
          left: "-60vw",
          background:
            "linear-gradient(90deg, transparent, rgba(124,58,237,0.18), rgba(99,102,241,0.32), rgba(103,232,249,0.18), transparent)",
          transform: "rotate(22deg)",
          filter: "blur(4px)",
        }}
      />

      {/* Vignette for depth. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, transparent 42%, rgba(5,6,15,0.82) 100%)",
        }}
      />
    </div>
  );
});

CanvasBackground.displayName = "CanvasBackground";
