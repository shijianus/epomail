import { useEffect, useRef } from "react";

const PURPLE: [number, number, number] = [168, 85, 247];
const INDIGO: [number, number, number] = [99, 102, 241];
const CYAN: [number, number, number] = [103, 232, 249];

interface WarpStar {
  x: number;
  y: number;
  z: number;
  speed: number;
  col: [number, number, number];
  angle: number;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  col: [number, number, number];
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  pts: number[];
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export function SpaceTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let W = 0;
    let H = 0;
    let dpr = 1;

    let warpStars: WarpStar[] = [];
    let comets: Comet[] = [];
    let asteroids: Asteroid[] = [];
    let dusts: Dust[] = [];

    const initEntities = () => {
      // 180 warp stars
      warpStars = Array.from({ length: 180 }, () => {
        const angle = Math.random() * Math.PI * 2;
        return {
          x: (Math.random() - 0.5) * W,
          y: (Math.random() - 0.5) * H,
          z: Math.random() * 1000 + 100,
          speed: Math.random() * 15 + 2,
          col: Math.random() > 0.5 ? CYAN : INDIGO,
          angle,
        };
      });

      // 4 comets
      comets = Array.from({ length: 4 }, spawnComet);

      // 12 asteroids
      asteroids = Array.from({ length: 12 }, () => spawnAsteroid(true));

      // 60 dust particles
      dusts = Array.from({ length: 60 }, spawnDust);
    };

    const spawnComet = (): Comet => {
      const isHorizontal = Math.random() > 0.5;
      const vx = isHorizontal ? (Math.random() * 25 + 15) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() - 0.5) * 10;
      const vy = !isHorizontal ? (Math.random() * 25 + 15) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() - 0.5) * 10;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx,
        vy,
        life: 0,
        maxLife: Math.random() * 40 + 20,
        size: Math.random() * 3 + 2,
        col: Math.random() > 0.5 ? PURPLE : CYAN,
      };
    };

    const spawnAsteroid = (initial = false): Asteroid => {
      const pts = Array.from({ length: 7 }, () => Math.random() * 0.4 + 0.6);
      return {
        x: initial ? Math.random() * W : (Math.random() > 0.5 ? -50 : W + 50),
        y: initial ? Math.random() * H : Math.random() * H,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.15,
        size: Math.random() * 15 + 5,
        pts,
      };
    };

    const spawnDust = (): Dust => {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 0,
        maxLife: Math.random() * 30 + 10,
      };
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = width;
        H = height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        initEntities();
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    let raf = 0;

    const render = () => {
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(5, 6, 15, 0.22)';
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';

      const cx = W * 0.48;
      const cy = H * 0.52;

      // Render Warp Stars
      for (const s of warpStars) {
        s.z -= s.speed;
        if (s.z <= 0) {
          s.z = 1000;
          s.x = (Math.random() - 0.5) * W;
          s.y = (Math.random() - 0.5) * H;
        }

        const scale = 1000 / s.z;
        const x = cx + s.x * scale;
        const y = cy + s.y * scale;

        const dist = Math.hypot(x - cx, y - cy);
        const maxDist = Math.hypot(W, H);
        const normDist = Math.min(dist / maxDist, 1);

        const streakLen = normDist * normDist * 200 + 10;
        const prevX = x - Math.cos(s.angle) * streakLen;
        const prevY = y - Math.sin(s.angle) * streakLen;

        const a = Math.min(normDist * normDist * 1.5, 1.0);
        const [cr, cg, cb] = s.col;

        const grad = ctx.createLinearGradient(prevX, prevY, x, y);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},${a * 0.4})`);
        grad.addColorStop(1, `rgba(255,255,255,${a})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(scale * 1.5, 0.5);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Render Comets
      for (let i = 0; i < comets.length; i++) {
        const c = comets[i];
        c.x += c.vx;
        c.y += c.vy;
        c.life++;

        if (c.life > c.maxLife || c.x < -100 || c.x > W + 100 || c.y < -100 || c.y > H + 100) {
          comets[i] = spawnComet();
          continue;
        }

        const progress = c.life / c.maxLife;
        const fade = Math.sin(progress * Math.PI);
        const [cr, cg, cb] = c.col;

        const tailX = c.x - c.vx * 4;
        const tailY = c.y - c.vy * 4;

        const grad = ctx.createLinearGradient(tailX, tailY, c.x, c.y);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        grad.addColorStop(0.8, `rgba(${cr},${cg},${cb},${fade * 0.8})`);
        grad.addColorStop(1, `rgba(255,255,255,${fade})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = c.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${fade * 0.3})`;
        ctx.arc(c.x, c.y, c.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // Render Asteroids
      ctx.strokeStyle = 'rgba(103,232,249,0.15)';
      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i];
        a.x += a.vx;
        a.y += a.vy;
        a.rot += a.vRot;

        if (a.x < -100 || a.x > W + 100 || a.y < -100 || a.y > H + 100) {
          asteroids[i] = spawnAsteroid();
          continue;
        }

        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.beginPath();
        for (let j = 0; j < a.pts.length; j++) {
          const angle = (j / a.pts.length) * Math.PI * 2;
          const r = a.size * a.pts[j];
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 12, 30, 0.4)';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Render Dust
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < dusts.length; i++) {
        const d = dusts[i];
        d.x += d.vx;
        d.y += d.vy;
        d.life++;

        if (d.life > d.maxLife || d.x < 0 || d.x > W || d.y < 0 || d.y > H) {
          dusts[i] = spawnDust();
          continue;
        }

        const fade = Math.sin((d.life / d.maxLife) * Math.PI);
        ctx.globalAlpha = fade * 0.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      className="absolute left-0 bottom-0 pointer-events-none z-[2] overflow-hidden"
      style={{
        width: "56vw",
        height: "62vh",
        WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 18% 82%, black 0%, transparent 100%)",
        maskImage: "radial-gradient(ellipse 88% 88% at 18% 82%, black 0%, transparent 100%)",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
