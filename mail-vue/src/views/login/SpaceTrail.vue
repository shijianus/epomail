<template>
  <!-- Warp-speed space trail: contained region, pointer-events-none, z-2 -->
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
let ro = null;

onMounted(() => {
  const canvas = trailCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

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
    // Rebuild particles on resize
    initParticles();
  };

  ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  resize();

  // ─── Color palette ─────────────────────────────────────────────────────
  const COLORS = [
    [168, 85, 247],   // purple
    [99,  102, 241],  // indigo
    [103, 232, 249],  // cyan
    [226, 232, 255],  // star-white
  ];

  // ─── Warp stars (high-speed, radiate from vanishing point) ────────────
  const STAR_COUNT = 180;

  // Warp stars array
  let warpStars = [];

  function makeWarpStar() {
    const angle  = Math.random() * Math.PI * 2;
    const seed   = Math.random() * 0.05;
    const speed  = Math.random() * 15.0 + 8.0; // Extremely high speed warp
    const col    = COLORS[Math.floor(Math.random() * COLORS.length)];
    const maxDist = Math.random() * 0.6 + 0.55;
    return { angle, dist: seed, maxDist, speed, col };
  }

  // ─── Comet / shooting star ─────────────────────────────────────────────
  const MAX_COMETS = 4;
  let comets = [];

  function makeComet() {
    // Spawn from top/left edges
    const fromTop = Math.random() < 0.5;
    const x = fromTop ? Math.random() * W * 0.7 : -50;
    const y = fromTop ? -50 : Math.random() * H * 0.5;
    const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.4;
    const speed = Math.random() * 12.0 + 8.0; // High speed comets
    const tailLength = Math.random() * 250 + 150; // Much longer tails
    const col = COLORS[Math.floor(Math.random() * 3)];
    const width = Math.random() * 2.5 + 1.5; // Thicker comets
    // Extra: comet has a glowing head + multi-segment tail
    return {
      x, y, angle, speed, tailLength, col, width,
      alpha: 0, // fade in
      age: 0,
    };
  }

  // ─── Asteroid / debris fragments (tumbling rocks) ──────────────────────
  const ASTEROID_COUNT = 12;
  let asteroids = [];

  function makeAsteroid() {
    // Random polygon points for an irregular rock shape
    const sides = Math.floor(Math.random() * 4) + 5; // 5-8 sides
    const r = Math.random() * 4 + 2.5;
    const points = Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      const dr = r * (0.7 + Math.random() * 0.5);
      return [Math.cos(a) * dr, Math.sin(a) * dr];
    });
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 2.5,
      vy: (Math.random() - 0.5) * 2.5,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.15, // fast tumble speed
      alpha: Math.random() * 0.35 + 0.12,
      points,
      r,
    };
  }

  // ─── Energy ring pulses (occasional flash rings) ──────────────────────
  let rings = [];

  function spawnRing() {
    const vx = W * 0.3 + Math.random() * W * 0.3;
    const vy = H * 0.3 + Math.random() * H * 0.5;
    const col = COLORS[Math.floor(Math.random() * 3)];
    rings.push({ x: vx, y: vy, r: 0, maxR: Math.random() * 80 + 50, alpha: 0.55, col });
  }

  // ─── Particle dust (tiny fast-moving specks) ──────────────────────────
  const DUST_COUNT = 60;
  let dust = [];

  function makeDust() {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.8 + 0.8;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Math.random() * 0.9 + 0.2,
      alpha: Math.random() * 0.4 + 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.8 + 0.3,
    };
  }

  // ─── Nebula wisps (soft drifting color clouds) ─────────────────────────
  const WISP_COUNT = 5;
  let wisps = [];

  function makeWisp() {
    const col = COLORS[Math.floor(Math.random() * 3)];
    return {
      x: Math.random() * W * 0.8,
      y: Math.random() * H * 0.8,
      rx: Math.random() * 70 + 40,
      ry: Math.random() * 40 + 20,
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.003,
      alpha: Math.random() * 0.07 + 0.02,
      col,
      driftX: (Math.random() - 0.5) * 0.12,
      driftY: (Math.random() - 0.5) * 0.12,
    };
  }

  function initParticles() {
    warpStars = Array.from({ length: STAR_COUNT }, makeWarpStar);
    warpStars.forEach(s => { s.dist = Math.random() * s.maxDist; });

    comets = [];
    for (let i = 0; i < 1; i++) comets.push(makeComet());

    asteroids = Array.from({ length: ASTEROID_COUNT }, makeAsteroid);
    dust = Array.from({ length: DUST_COUNT }, makeDust);
    wisps = Array.from({ length: WISP_COUNT }, makeWisp);
    rings = [];
  }

  initParticles();

  // ─── Render loop ────────────────────────────────────────────────────────
  const start = performance.now();
  let lastCometSpawn = 0;
  let lastRingSpawn = 0;

  const render = (now) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);

    // Semi-transparent fade overlay for motion trails
    ctx.fillStyle = 'rgba(5, 6, 15, 0.22)';
    ctx.fillRect(0, 0, W, H);

    const vx = W * 0.48;
    const vy = H * 0.52;

    // ── 1. Nebula wisps (background atmosphere) ────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    for (const w of wisps) {
      w.x += w.driftX;
      w.y += w.driftY;
      w.rot += w.rotSpeed;

      // Wrap
      if (w.x < -w.rx) w.x = W + w.rx;
      if (w.x > W + w.rx) w.x = -w.rx;
      if (w.y < -w.ry) w.y = H + w.ry;
      if (w.y > H + w.ry) w.y = -w.ry;

      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rot);

      const [wr, wg, wb] = w.col;
      const wGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, w.rx);
      wGrad.addColorStop(0, `rgba(${wr},${wg},${wb},${w.alpha})`);
      wGrad.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);

      ctx.scale(1, w.ry / w.rx);
      ctx.beginPath();
      ctx.arc(0, 0, w.rx, 0, Math.PI * 2);
      ctx.fillStyle = wGrad;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 2. Warp stars (high-speed streaks radiating outward) ──────────
    ctx.globalCompositeOperation = 'lighter';
    for (const s of warpStars) {
      s.dist += s.speed * 0.005;

      const normDist = s.dist / s.maxDist;
      const r = normDist * Math.min(W, H) * 0.78;

      const x = vx + Math.cos(s.angle) * r;
      const y = vy + Math.sin(s.angle) * r;

      // Much longer streak for extreme warp effect
      const streakLen = normDist * normDist * 200 + 10;
      const prevX = x - Math.cos(s.angle) * streakLen;
      const prevY = y - Math.sin(s.angle) * streakLen;

      const a = Math.min(normDist * normDist * 1.5, 1.0);
      const [cr, cg, cb] = s.col;

      const grad = ctx.createLinearGradient(prevX, prevY, x, y);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
      grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},${a * 0.4})`);
      grad.addColorStop(1, `rgba(255,255,255,${a})`); // White hot tip

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = normDist * 4.0 + 0.8;
      ctx.lineCap = "round";
      ctx.stroke();

      // Reset star when exits canvas
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20 || s.dist >= s.maxDist) {
        Object.assign(s, makeWarpStar());
        s.dist = 0;
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 3. Energy rings ───────────────────────────────────────────────
    if (now - lastRingSpawn > 3500 + Math.random() * 3000) {
      spawnRing();
      lastRingSpawn = now;
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.r += 1.5;
      ring.alpha -= 0.008;

      if (ring.alpha <= 0) {
        rings.splice(i, 1);
        continue;
      }

      const [rr, rg, rb] = ring.col;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rr},${rg},${rb},${ring.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 4. Comets / shooting stars ───────────────────────────────────
    if (now - lastCometSpawn > 2200 + Math.random() * 3000) {
      if (comets.length < MAX_COMETS) {
        comets.push(makeComet());
        lastCometSpawn = now;
      } else {
        lastCometSpawn = now;
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = comets.length - 1; i >= 0; i--) {
      const m = comets[i];
      m.x += Math.cos(m.angle) * m.speed;
      m.y += Math.sin(m.angle) * m.speed;
      m.age++;

      // Fade in fast, fade out near edges
      m.alpha = Math.min(1, m.age / 15);
      const edgeDist = Math.min(m.x, m.y, W - m.x, H - m.y);
      if (edgeDist < 80) {
        m.alpha = Math.min(m.alpha, edgeDist / 80);
      }

      const tailX = m.x - Math.cos(m.angle) * m.tailLength;
      const tailY = m.y - Math.sin(m.angle) * m.tailLength;

      const [mr, mg, mb] = m.col;

      // Multi-layer comet tail for glowing effect
      // Outer glow (wide)
      const outerGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      outerGrad.addColorStop(0, `rgba(${mr},${mg},${mb},0)`);
      outerGrad.addColorStop(0.7, `rgba(${mr},${mg},${mb},${m.alpha * 0.18})`);
      outerGrad.addColorStop(1, `rgba(${mr},${mg},${mb},${m.alpha * 0.35})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = outerGrad;
      ctx.lineWidth = m.width * 6;
      ctx.stroke();

      // Core streak (thin, bright)
      const coreGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      coreGrad.addColorStop(0, `rgba(${mr},${mg},${mb},0)`);
      coreGrad.addColorStop(0.6, `rgba(${mr},${mg},${mb},${m.alpha * 0.65})`);
      coreGrad.addColorStop(1, `rgba(255,255,255,${m.alpha * 0.95})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = coreGrad;
      ctx.lineWidth = m.width;
      ctx.stroke();

      // Glowing head
      const headGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
      headGrad.addColorStop(0, `rgba(255,255,255,${m.alpha * 0.9})`);
      headGrad.addColorStop(0.4, `rgba(${mr},${mg},${mb},${m.alpha * 0.5})`);
      headGrad.addColorStop(1, `rgba(${mr},${mg},${mb},0)`);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = headGrad;
      ctx.fill();

      // Remove if out of bounds
      if (m.x > W + m.tailLength || m.y > H + m.tailLength || m.x < -m.tailLength || m.y < -m.tailLength) {
        comets.splice(i, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 5. Tumbling asteroid fragments ────────────────────────────────
    for (const a of asteroids) {
      a.x += a.vx;
      a.y += a.vy;
      a.rot += a.rotSpeed;

      // Wrap
      const margin = a.r + 5;
      if (a.x < -margin) a.x = W + margin;
      if (a.x > W + margin) a.x = -margin;
      if (a.y < -margin) a.y = H + margin;
      if (a.y > H + margin) a.y = -margin;

      // Draw irregular polygon (tumbling rock)
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);

      ctx.beginPath();
      ctx.moveTo(a.points[0][0], a.points[0][1]);
      for (let k = 1; k < a.points.length; k++) {
        ctx.lineTo(a.points[k][0], a.points[k][1]);
      }
      ctx.closePath();

      // High speed motion trail for asteroid
      ctx.shadowColor = `rgba(180, 200, 255, ${a.alpha})`;
      ctx.shadowBlur = 10;
      // Rock fill: dim gray-blue
      ctx.fillStyle = `rgba(130, 150, 200, ${a.alpha * 0.7})`;
      ctx.fill();
      // Rock edge: slightly lighter
      ctx.strokeStyle = `rgba(180, 200, 255, ${a.alpha * 0.9})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      ctx.restore();
    }

    // ── 6. Fast dust particles ────────────────────────────────────────
    for (const d of dust) {
      d.x += d.vx;
      d.y += d.vy;

      // Wrap
      if (d.x < 0) d.x = W;
      if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H;
      if (d.y > H) d.y = 0;

      const pulse = d.alpha * (0.6 + Math.sin(t * d.speed + d.phase) * 0.4);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 215, 255, ${pulse})`;
      ctx.fill();
    }

    raf = requestAnimationFrame(render);
  };

  raf = requestAnimationFrame(render);

  onUnmounted(() => {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
  });
});
</script>

<style scoped>
.space-trail-container {
  position: absolute;
  /* Bottom-left quadrant — local, contained visual area */
  left: 0;
  bottom: 0;
  width: 56vw;
  height: 62vh;
  z-index: 2; /* above main canvas bg (z-index 1), below form wrapper (z-10) */
  overflow: hidden;
  /* Vignette mask — fades edges so it blends seamlessly */
  -webkit-mask-image:
    radial-gradient(ellipse 88% 88% at 18% 82%, black 0%, transparent 100%);
  mask-image:
    radial-gradient(ellipse 88% 88% at 18% 82%, black 0%, transparent 100%);
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
    height: 50vh;
    -webkit-mask-image:
      radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, transparent 100%);
    mask-image:
      radial-gradient(ellipse 90% 80% at 50% 100%, black 0%, transparent 100%);
  }
}
</style>
