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

      // Check for spawn triggers
      if (cameraState.cometTriggerCount > lastTriggerCount.current) {
        lastTriggerCount.current = cameraState.cometTriggerCount;
        
        // Spawn a comet!
        // "从摄像头后方迅速向前曲线移动" -> spawn behind camera (z < 0)
        const side = Math.random() < 0.5 ? -1 : 1; // Left or Right
        cometsRef.current.push({
          id: Math.random(),
          x: side * (1000 + Math.random() * 2000), // Far left or right
          y: (Math.random() - 0.5) * 2000,
          z: -200, // Behind the camera
          vx: -side * (1000 + Math.random() * 1000), // Curve inwards towards center
          vy: (Math.random() - 0.5) * 1000,
          vz: 4000 + Math.random() * 2000, // Very fast forward (4-6k units per sec)
          ax: (Math.random() - 0.5) * 500, // Acceleration for curved path
          ay: (Math.random() - 0.5) * 500,
          baseSize: Math.random() * 3 + 3, // 3-6px base size (bright core)
          trail: [],
          active: true
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
          if (c.z > 40000 || c.x > 15000 || c.x < -15000) {
            c.active = false;
          }
        }

        // Process Trail
        const maxTrailAge = 5 + Math.random() * 5; // 5-10s lingering
        
        const pathProjected = [];
        for (let j = c.trail.length - 1; j >= 0; j--) {
          const tp = c.trail[j];
          tp.age += dt;
          if (tp.age > maxTrailAge) {
            c.trail.splice(j, 1);
            continue;
          }
          
          if (tp.z < 10) continue; // Don't draw points behind the camera plane

          const scale = fov / tp.z;
          const px = tp.x * scale + canvas.width / 2 + (cameraState.panX + cameraState.shakeX);
          const py = tp.y * scale + canvas.height / 2 + (cameraState.panY + cameraState.shakeY);
          
          pathProjected.unshift({ px, py, age: tp.age, scale }); // Unshift to maintain order (oldest to newest for drawing)
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
            
            // Age goes from 0 (head) to maxTrailAge (tail)
            const opacity = Math.max(0, 1 - (p1.age / maxTrailAge));
            const fade = Math.pow(opacity, 1.5);
            const size = c.baseSize * p1.scale;

            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            
            // Blue scatter
            ctx.strokeStyle = `rgba(103, 232, 249, ${fade * 0.4})`;
            ctx.lineWidth = size * 6;
            ctx.stroke();
          }

          // Pass 2: White Core Base (Thin, high opacity)
          for (let j = 0; j < pathProjected.length - 1; j++) {
            const p1 = pathProjected[j];
            const p2 = pathProjected[j+1];
            const opacity = Math.max(0, 1 - (p1.age / maxTrailAge));
            const fade = Math.pow(opacity, 1.5);
            const size = c.baseSize * p1.scale;

            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.9})`;
            ctx.lineWidth = size * 1.5;
            ctx.stroke();
          }
        }

        // Draw Head (Bright White Core)
        if (c.active && c.z > 10) {
          const scale = fov / c.z;
          const px = c.x * scale + canvas.width / 2 + (cameraState.panX + cameraState.shakeX);
          const py = c.y * scale + canvas.height / 2 + (cameraState.panY + cameraState.shakeY);
          const size = c.baseSize * scale;

          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
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
