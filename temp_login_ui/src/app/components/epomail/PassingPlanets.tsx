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
        const radius = p.baseSize / 2; // Real physical radius
        
        // Z-axis check: Is it crossing the camera plane?
        if (p.z < radius * 1.5 && p.z > -radius * 1.5 && !p.hasCollided) {
          const distXY = Math.hypot(p.x, p.y);
          if (distXY < radius * 1.1) {
            p.hasCollided = true;
            
            if (p.destiny === "knock-back") {
              cameraState.vz = -4.0; // Violently knocked backward
              cameraState.shakeIntensity = 80;
              p.vz = -5000; // Planet bounces away!
            } else if (p.destiny === "pass-through") {
              cameraState.overlayOpacity = 1;
              if (p.type === 'gas') cameraState.overlayColor = "rgba(168,85,247,0.95)";
              else if (p.type === 'ice') cameraState.overlayColor = "rgba(103,232,249,0.95)";
              else if (p.type === 'dark') cameraState.overlayColor = "rgba(0,0,0,1)";
              else cameraState.overlayColor = "rgba(244,114,182,0.95)";
            } else if (p.destiny === "glance") {
              // Violent lateral pan
              const angle = Math.atan2(p.y, p.x);
              cameraState.panVelX = -Math.cos(angle) * 4000; 
              cameraState.panVelY = -Math.sin(angle) * 4000;
              cameraState.shakeIntensity = 50;
              
              // Planet bounces off
              p.vx *= -0.8;
              p.vy *= -0.8;
              p.vz = -3000; // Knocked away
            }
          }
        }

        if (p.z < -1000 || p.z > 35000 || Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000) { 
          // Destroy if way behind, bounced too far away, or flew off laterally
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
            // Opacity fades in from VERY far away, but stays solid if we are inside it
            // It fades out if Z gets too small (behind camera) or > 25000
            let opacity = 1;
            if (p.z > 15000) opacity = Math.max(0, (25000 - p.z) / 10000);
            if (p.z < 0) opacity = Math.max(0, (500 + p.z) / 500);

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

        const baseSize = Math.random() * 800 + 400; // Planets are massive
        const radius = baseSize / 2;
        
        let spawnX = 0, spawnY = 0, spawnZ = 0;
        let vx = 0, vy = 0, vz = 0;

        if (destiny === "glance") {
          // SIDE-HIT: Spawns exactly at the sides, very close, moving rapidly inward
          spawnZ = 200 + Math.random() * 300; 
          const side = Math.floor(Math.random() * 4); // 0=right, 1=left, 2=bottom, 3=top
          
          if (side === 0) { spawnX = 3000; spawnY = (Math.random() - 0.5) * 500; vx = -3500 - Math.random() * 1000; vy = 0; }
          else if (side === 1) { spawnX = -3000; spawnY = (Math.random() - 0.5) * 500; vx = 3500 + Math.random() * 1000; vy = 0; }
          else if (side === 2) { spawnX = (Math.random() - 0.5) * 500; spawnY = 2000; vx = 0; vy = -3500 - Math.random() * 1000; }
          else { spawnX = (Math.random() - 0.5) * 500; spawnY = -2000; vx = 0; vy = 3500 + Math.random() * 1000; }
          
          vz = (Math.random() - 0.5) * 100; // minimal Z movement
          
        } else {
          // FRONTAL (Miss, Pass-through, Knock-back)
          spawnZ = 25000; // True dot in the distance
          vz = Math.random() * 2000 + 2500; // Extremely fast approach (takes ~6-8s to reach)
          
          let targetX = 0, targetY = 0;
          if (destiny === "pass-through" || destiny === "knock-back") {
            targetX = (Math.random() - 0.5) * radius * 0.3; // Dead center
            targetY = (Math.random() - 0.5) * radius * 0.3;
          } else {
            // Miss
            const angle = Math.random() * Math.PI * 2;
            const missDist = radius + 800 + Math.random() * 2000; // Safely far away from center
            targetX = Math.cos(angle) * missDist;
            targetY = Math.sin(angle) * missDist;
          }

          // Back-calculate spawn X/Y so it hits the target exactly at Z=0
          const T = spawnZ / vz;
          vx = (Math.random() - 0.5) * 100; // Small lateral drift
          vy = (Math.random() - 0.5) * 100;
          spawnX = targetX - vx * T;
          spawnY = targetY - vy * T;
        }

        const p: Planet = {
          id: Math.random().toString(36).substring(2, 9),
          type: types[Math.floor(Math.random() * types.length)],
          x: spawnX,
          y: spawnY,
          z: spawnZ,
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
