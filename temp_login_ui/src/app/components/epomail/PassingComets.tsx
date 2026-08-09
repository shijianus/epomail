import { useEffect, useRef } from "react";
import { cameraState } from "./cameraStore";

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  age: number; // in seconds
}

interface Comet {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  baseSize: number;
  trail: TrailPoint[];
  active: boolean; // if false, the head is gone, but trail might still be fading
  maxTrailAge: number;
}

export function PassingComets() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cometsRef = useRef<Comet[]>([]);
  const lastTriggerCount = useRef(cameraState.cometTriggerCount);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let lastTime = performance.now();
    const fov = 1000;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Check for spawn triggers (Dispatched by PassingPlanets.tsx during interval)
      if (cameraState.cometTriggerCount > lastTriggerCount.current) {
        lastTriggerCount.current = cameraState.cometTriggerCount;
        
        // Spawn a comet!
        // "从左右的后方进入摄像头" -> spawn behind camera (z < 0) at extreme X edges
        // We use X = 350~550 so that when it crosses z=0 (max scale 3.5), px is > 1225 (off-screen)
        const side = Math.random() < 0.5 ? -1 : 1; 
        const spawnX = side * (400 + Math.random() * 250); 
        const spawnY = (Math.random() - 0.5) * 400; 
        const spawnZ = -300; 

        // Very high forward velocity, inward curving velocity
        const vx = -side * (120 + Math.random() * 100); 
        const vy = (0 - spawnY) * 0.15; // gently moves towards vertical center
        const vz = 2500 + Math.random() * 1500; 

        // Acceleration pulls it further in a beautiful curve
        const ax = -side * (40 + Math.random() * 40);
        const ay = (Math.random() - 0.5) * 20;
        
        const baseSize = 25 + Math.random() * 15; // 25-40px physical base size

        cometsRef.current.push({
          id: Math.random(),
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          vx, vy, vz, ax, ay, baseSize,
          trail: [],
          active: true,
          maxTrailAge: 5 + Math.random() * 5 // "尾痕留存5~10s"
        });
      }

      // Update and Draw
      for (let i = cometsRef.current.length - 1; i >= 0; i--) {
        const c = cometsRef.current[i];
        
        if (c.active) {
          // Physics
          c.vx += c.ax * dt;
          c.vy += c.ay * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          
          // Apply camera physics for dramatic speed variation
          const effectiveApproachSpeed = c.vz + 1500 * (cameraState.vz - 1);
          c.z += effectiveApproachSpeed * dt;

          // Record trail in 3D
          c.trail.unshift({ x: c.x, y: c.y, z: c.z, age: 0 });

          // Disappear in the far distance
          if (c.z > 35000 || Math.abs(c.x) > 10000) {
            c.active = false;
          }
        }

        // Process Trail
        const pathProjected = [];
        let previousValidPoint = null;

        for (let j = c.trail.length - 1; j >= 0; j--) {
          const tp = c.trail[j];
          tp.age += dt;
          
          if (tp.age > c.maxTrailAge) {
            c.trail.splice(j, 1);
            continue;
          }
          
          if (tp.z <= 0) continue; // Don't project points behind camera to avoid perspective flip

          const scale = Math.min(3.5, fov / tp.z);
          const px = tp.x * scale + canvas.width / 2 + (cameraState.panX + cameraState.shakeX);
          const py = tp.y * scale + canvas.height / 2 + (cameraState.panY + cameraState.shakeY);
          
          // Optimization: Skip points that are too close in 2D space to reduce segment count
          if (previousValidPoint) {
            const dx = px - previousValidPoint.px;
            const dy = py - previousValidPoint.py;
            if (dx * dx + dy * dy < 4) { // less than 2px distance
              continue;
            }
          }
          
          const point = { px, py, age: tp.age, scale };
          pathProjected.unshift(point); // Unshift to maintain order (oldest to newest for drawing)
          previousValidPoint = point;
        }

        if (!c.active && c.trail.length === 0) {
          cometsRef.current.splice(i, 1);
          continue;
        }

        // Draw Trail (Segment by Segment for opacity fading)
        if (pathProjected.length > 1) {
          // Pass 1: Blue Glow Scatter (Thick, low opacity)
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          
          for (let j = 0; j < pathProjected.length - 1; j++) {
            const p1 = pathProjected[j];
            const p2 = pathProjected[j+1];
            
            // Fade out over maxTrailAge
            const opacity = Math.max(0, 1 - (p1.age / c.maxTrailAge));
            // Power curve for smoother, more lingering tail
            const fade = Math.pow(opacity, 1.2);
            const size = c.baseSize * p1.scale;

            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            
            // "蓝色边缘化散射"
            ctx.strokeStyle = `rgba(103, 232, 249, ${fade * 0.4})`;
            ctx.lineWidth = size * 5;
            ctx.stroke();
          }

          // Pass 2: White Core Base (Thin, high opacity)
          for (let j = 0; j < pathProjected.length - 1; j++) {
            const p1 = pathProjected[j];
            const p2 = pathProjected[j+1];
            const opacity = Math.max(0, 1 - (p1.age / c.maxTrailAge));
            const fade = Math.pow(opacity, 1.2);
            const size = c.baseSize * p1.scale;

            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            
            // "白色打底"
            ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.8})`;
            ctx.lineWidth = size * 1.5;
            ctx.stroke();
          }
        }

        // Draw Head (Bright White Core + Halo)
        if (c.active && c.z > 0) {
          const scale = Math.min(3.5, fov / c.z);
          const px = c.x * scale + canvas.width / 2 + (cameraState.panX + cameraState.shakeX);
          const py = c.y * scale + canvas.height / 2 + (cameraState.panY + cameraState.shakeY);
          const size = c.baseSize * scale;

          // Outer blue halo
          ctx.beginPath();
          ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.8)';
          ctx.fill();

          // Inner bright white core
          ctx.beginPath();
          ctx.arc(px, py, size * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 1)';
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 pointer-events-none z-20 will-change-transform"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
