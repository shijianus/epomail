<template>
  <!-- Warp-speed space trail: contained region, pointer-events-none, z-1 -->
  <div
    class="space-trail-container pointer-events-none"
    aria-hidden="true"
  >
    <canvas ref="trailCanvas" class="space-trail-canvas" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const trailCanvas = ref(null);
let raf = null;

onMounted(() => {
  const canvas = trailCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // respect accessibility

  // ─── Canvas size tied to container ───────────────────────────────────────
  let W = 0, H = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);

  // ─── Color palette ─────────────────────────────────────────────────────
  const COLORS = [
    [168, 85, 247],   // purple
    [99,  102, 241],  // indigo
    [103, 232, 249],  // cyan
    [226, 232, 255],  // star-white
  ];

  // ─── Warp stars ────────────────────────────────────────────────────────
  // Each star flies from a "vanishing point" near the center-right of the
  // contained canvas outward to create a warp-tunnel feel.
  const STAR_COUNT = 120;
  const VX = W * 0.52; // vanishing point X (roughly center-right)
  const VY = H * 0.48; // vanishing point Y

  function makeWarpStar() {
    const angle  = Math.random() * Math.PI * 2;
    const seed   = Math.random() * 0.1 + 0.001; // small initial dist from VP
    const speed  = Math.random() * 3.2 + 0.9;
    const col    = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { angle, dist: seed, maxDist: Math.random() * 0.55 + 0.55, speed, col };
  }

  let warpStars = Array.from({ length: STAR_COUNT }, makeWarpStar);
  // Scatter initial distances so they don't all start at 0
  warpStars.forEach(s => { s.dist = Math.random() * s.maxDist; });

  // ─── Meteors ────────────────────────────────────────────────────────────
  const MAX_METEORS = 5;
  const meteors = [];

  function spawnMeteor() {
    if (meteors.length >= MAX_METEORS) return;
    // Entry from top or left edge
    const fromLeft = Math.random() < 0.5;
    const mx = fromLeft ? 0 : Math.random() * W;
    const my = fromLeft ? Math.random() * H * 0.6 : 0;
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5; // ~45° diagonal
    const speed = Math.random() * 3.5 + 2.5;
    const length = Math.random() * 90 + 60;
    const col = COLORS[Math.floor(Math.random() * 3)]; // purple/indigo/cyan
    meteors.push({ x: mx, y: my, angle, speed, length, alpha: 1, col, age: 0 });
  }

  // Stagger initial meteor spawns
  for (let i = 0; i < 2; i++) spawnMeteor();

  // ─── Asteroid debris ────────────────────────────────────────────────────
  const DEBRIS_COUNT = 18;
  function makeDebris() {
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r:  Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.4 + 0.15,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.8 + 0.3,
    };
  }
  const debris = Array.from({ length: DEBRIS_COUNT }, makeDebris);

  // ─── Render loop ────────────────────────────────────────────────────────
  const start = performance.now();
  let lastMeteorSpawn = 0;

  const render = (now) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);

    // Fade trail (deep space background for contained area)
    ctx.fillStyle = 'rgba(5, 6, 15, 0.18)';
    ctx.fillRect(0, 0, W, H);

    const vx = W * 0.52;
    const vy = H * 0.48;

    // ── Warp stars ─────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    for (const s of warpStars) {
      // Grow dist from vanishing point
      s.dist += s.speed * 0.004;

      const normDist = s.dist / s.maxDist; // 0→1
      const r = normDist * Math.min(W, H) * 0.72; // actual radius from VP

      const x = vx + Math.cos(s.angle) * r;
      const y = vy + Math.sin(s.angle) * r;

      // Streak length grows with speed (deeper into warp)
      const streakLen = normDist * normDist * 28 + 1;
      const prevX = x - Math.cos(s.angle) * streakLen;
      const prevY = y - Math.sin(s.angle) * streakLen;

      const a = Math.min(normDist * normDist * 0.9, 0.85);
      const [cr, cg, cb] = s.col;

      const grad = ctx.createLinearGradient(prevX, prevY, x, y);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},${a})`);

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = normDist * 1.6 + 0.4;
      ctx.stroke();

      // Reset star when it exits the canvas
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10 || s.dist >= s.maxDist) {
        Object.assign(s, makeWarpStar());
        s.dist = 0;
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── Meteors ────────────────────────────────────────────────────────
    if (now - lastMeteorSpawn > 1800 + Math.random() * 2200) {
      spawnMeteor();
      lastMeteorSpawn = now;
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x   += Math.cos(m.angle) * m.speed;
      m.y   += Math.sin(m.angle) * m.speed;
      m.age += 1;

      // Fade out near edge
      const edgeDist = Math.min(m.x, m.y, W - m.x, H - m.y);
      m.alpha = Math.min(1, edgeDist / 60);

      // Head of meteor
      const tailX = m.x - Math.cos(m.angle) * m.length;
      const tailY = m.y - Math.sin(m.angle) * m.length;

      ctx.globalCompositeOperation = 'lighter';
      const [mr, mg, mb] = m.col;
      const mGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      mGrad.addColorStop(0, `rgba(${mr},${mg},${mb},0)`);
      mGrad.addColorStop(0.7, `rgba(${mr},${mg},${mb},${m.alpha * 0.55})`);
      mGrad.addColorStop(1,   `rgba(255,255,255,${m.alpha * 0.95})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = mGrad;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Glow head dot
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${m.alpha * 0.95})`;
      ctx.fill();

      // Remove if out of bounds
      if (m.x > W + m.length || m.y > H + m.length || m.x < -m.length || m.y < -m.length) {
        meteors.splice(i, 1);
      }
    }

    // ── Floating debris (tiny drifting particles) ─────────────────────
    for (const d of debris) {
      d.x += d.vx;
      d.y += d.vy;
      // Wrap around canvas edges
      if (d.x < 0) d.x = W;
      if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H;
      if (d.y > H) d.y = 0;

      const pulse = d.alpha * (0.7 + Math.sin(t * d.speed + d.phase) * 0.3);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 255, ${pulse})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(render);
  };

  raf = requestAnimationFrame(render);

  onUnmounted(() => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  });
});
</script>

<style scoped>
.space-trail-container {
  position: absolute;
  /* Bottom-left quadrant — local, contained visual area */
  left: 0;
  bottom: 0;
  width: 52vw;
  height: 58vh;
  z-index: 2; /* above main canvas bg (z-index 1), below form wrapper (z-10) */
  overflow: hidden;
  /* Vignette mask — fades edges so it blends seamlessly */
  -webkit-mask-image:
    radial-gradient(ellipse 85% 85% at 20% 80%, black 0%, transparent 100%);
  mask-image:
    radial-gradient(ellipse 85% 85% at 20% 80%, black 0%, transparent 100%);
}

.space-trail-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

@media (max-width: 767px) {
  .space-trail-container {
    width: 100vw;
    height: 45vh;
    -webkit-mask-image:
      radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, transparent 100%);
    mask-image:
      radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, transparent 100%);
  }
}
</style>
