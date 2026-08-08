import { useEffect, useRef, useState } from "react";
import { cameraState } from "./cameraStore";

type PlanetType = "ice" | "gas" | "dark" | "nebula";
type Destiny = "miss" | "glance" | "knock-back" | "pass-through";

interface Planet {
  id: string;
  type: PlanetType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseSize: number;
  seed: number;
  destiny: Destiny;
  hasCollided: boolean;
}

export function PassingPlanets() {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();
    let nextSpawn = performance.now() + 1000 + Math.random() * 2000;

    const types: PlanetType[] = ["ice", "gas", "dark", "nebula"];
    const fov = 1000;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      let listChanged = false;

      // Update physics
      for (let i = planetsRef.current.length - 1; i >= 0; i--) {
        const p = planetsRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        
        // Dynamic Z approach based on camera's global velocity
        // 1500 represents the base "warp speed" of the camera through space.
        const effectiveApproachSpeed = p.vz + 1500 * (cameraState.vz - 1);
        p.z -= effectiveApproachSpeed * dt;

        // Collision logic
        const radius = p.baseSize;
        if (p.z < radius && p.z > -radius && !p.hasCollided) {
          const distXY = Math.hypot(p.x, p.y);
          if (distXY < radius * 1.2) {
            p.hasCollided = true;
            
            if (p.destiny === "knock-back") {
              cameraState.vz = -2.5; // violently knocked backward
              cameraState.shakeIntensity = 60;
            } else if (p.destiny === "pass-through") {
              cameraState.overlayOpacity = 1;
              if (p.type === 'gas') cameraState.overlayColor = "rgba(168,85,247,0.9)";
              else if (p.type === 'ice') cameraState.overlayColor = "rgba(103,232,249,0.9)";
              else if (p.type === 'dark') cameraState.overlayColor = "rgba(0,0,0,1)";
              else cameraState.overlayColor = "rgba(244,114,182,0.9)";
            } else if (p.destiny === "glance") {
              const angle = Math.atan2(p.y, p.x);
              cameraState.panVelX = -Math.cos(angle) * 3000; // violent lateral pan
              cameraState.panVelY = -Math.sin(angle) * 3000;
              cameraState.shakeIntensity = 30;
            }
          }
        }

        if (p.z < -200 || p.z > 5000) { // destroy if way behind or bounced too far away
          planetsRef.current.splice(i, 1);
          listChanged = true;
        } else {
          // Update DOM
          const el = elementsRef.current.get(p.id);
          if (el) {
            const scale = Math.max(0.01, fov / Math.max(1, p.z));
            const sx = p.x * scale;
            const sy = p.y * scale;
            const size = p.baseSize * scale;
            // Opacity fades in from far away, but stays solid if we are inside it
            const opacity = p.z < 100 ? 1 : Math.min(1, (2500 - p.z) / 500);

            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.transform = `translate3d(calc(-50% + ${sx}px), calc(-50% + ${sy}px), 0)`;
            el.style.opacity = opacity.toString();
            el.style.zIndex = p.z < 500 ? "50" : "1";
          }
        }
      }

      // Spawn logic
      if (now > nextSpawn && planetsRef.current.length < 2) {
        const roll = Math.random();
        let destiny: Destiny = "miss";
        if (roll < 0.01) destiny = "pass-through";
        else if (roll < 0.05) destiny = "knock-back";
        else if (roll < 0.20) destiny = "glance";

        const baseSize = Math.random() * 300 + 150;
        const radius = baseSize;
        let targetX = 0, targetY = 0;

        if (destiny === "pass-through" || destiny === "knock-back") {
          targetX = (Math.random() - 0.5) * radius * 0.4;
          targetY = (Math.random() - 0.5) * radius * 0.4;
        } else if (destiny === "glance") {
          const angle = Math.random() * Math.PI * 2;
          targetX = Math.cos(angle) * radius * 0.8;
          targetY = Math.sin(angle) * radius * 0.8;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const missDist = radius + 400 + Math.random() * 1500;
          targetX = Math.cos(angle) * missDist;
          targetY = Math.sin(angle) * missDist;
        }

        const vz = Math.random() * 250 + 150;
        const vx = (Math.random() - 0.5) * 80;
        const vy = (Math.random() - 0.5) * 80;

        // Back-calculate spawn position so it perfectly hits the target at Z=0
        const T = 2500 / vz;
        const spawnX = targetX - vx * T;
        const spawnY = targetY - vy * T;

        const p: Planet = {
          id: Math.random().toString(36).substring(2, 9),
          type: types[Math.floor(Math.random() * types.length)],
          x: spawnX,
          y: spawnY,
          z: 2500,
          vx,
          vy,
          vz,
          baseSize,
          seed: Math.random(),
          destiny,
          hasCollided: false,
        };
        
        planetsRef.current.push(p);
        listChanged = true;
        
        // If a cinematic event just spawned, give the user some breathing room before the next one
        const delay = destiny !== "miss" ? 6000 : 2000;
        nextSpawn = now + delay + Math.random() * 4000;
      }

      if (listChanged) {
        setPlanets([...planetsRef.current]);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ perspective: '1000px' }}>
      {planets.map((p) => {
        let bg = "";
        let shadow = "";
        let border = "";

        if (p.type === "gas") {
          bg = "radial-gradient(circle at 30% 30%, rgba(168,85,247,0.9), rgba(99,102,241,0.7) 45%, rgba(5,6,15,0.98) 85%)";
          shadow = "inset 20px 20px 80px rgba(103,232,249,0.4), inset -40px -40px 100px rgba(0,0,0,0.9), 0 0 80px rgba(168,85,247,0.2)";
        } else if (p.type === "ice") {
          bg = "radial-gradient(circle at 35% 25%, rgba(103,232,249,0.95), rgba(14,165,233,0.8) 50%, rgba(5,6,15,0.98) 85%)";
          shadow = "inset 15px 15px 60px rgba(255,255,255,0.6), inset -40px -40px 120px rgba(0,0,0,0.95), 0 0 60px rgba(103,232,249,0.3)";
        } else if (p.type === "dark") {
          bg = "radial-gradient(circle at 50% 50%, rgba(5,6,15,1) 40%, rgba(0,0,0,1) 85%)";
          shadow = "inset 0 0 50px rgba(0,0,0,1), 0 0 120px rgba(168,85,247,0.8), 0 0 200px rgba(99,102,241,0.6)";
          border = "2px solid rgba(168,85,247,0.7)";
        } else {
          bg = "radial-gradient(circle at 40% 40%, rgba(244,114,182,0.8), rgba(124,58,237,0.6) 65%, rgba(5,6,15,0.95) 90%)";
          shadow = "inset 10px 10px 50px rgba(244,114,182,0.5), inset -30px -30px 80px rgba(0,0,0,0.95), 0 0 50px rgba(244,114,182,0.2)";
        }

        return (
          <div
            key={p.id}
            ref={(el) => {
              if (el) elementsRef.current.set(p.id, el);
              else elementsRef.current.delete(p.id);
            }}
            className="absolute rounded-full left-1/2 top-1/2 will-change-transform"
            style={{
              background: bg,
              boxShadow: shadow,
              border: border,
              opacity: 0, 
            }}
          >
            {p.type === "dark" && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `rotateX(75deg) rotateY(${p.seed * 45}deg) scale(2.4)`,
                  border: "2px solid rgba(103,232,249,0.6)",
                  boxShadow: "0 0 60px rgba(103,232,249,0.9), inset 0 0 30px rgba(103,232,249,0.6)",
                  borderRadius: "50%",
                }}
              />
            )}
            
            {p.type === "ice" && p.seed > 0.5 && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `rotateX(80deg) rotateY(${-p.seed * 30}deg) scale(2.2)`,
                  border: "10px solid rgba(255,255,255,0.15)",
                  borderTopColor: "rgba(103,232,249,0.7)",
                  borderBottomColor: "rgba(103,232,249,0.3)",
                  boxShadow: "0 0 30px rgba(103,232,249,0.5)",
                  borderRadius: "50%",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
