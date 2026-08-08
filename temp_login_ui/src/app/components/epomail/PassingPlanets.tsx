import { useEffect, useRef, useState } from "react";

type PlanetType = "ice" | "gas" | "dark" | "nebula";

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
}

export function PassingPlanets({ onShake }: { onShake: (strength: number) => void }) {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastShakeRef = useRef<number>(0);

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();
    let nextSpawn = performance.now() + 1000 + Math.random() * 2000;

    const types: PlanetType[] = ["ice", "gas", "dark", "nebula"];
    const fov = 1000;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt to avoid huge jumps
      lastTime = now;

      let shook = false;
      let shakeStrength = 0;
      let listChanged = false;

      // Update physics
      for (let i = planetsRef.current.length - 1; i >= 0; i--) {
        const p = planetsRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z -= p.vz * dt;

        if (p.z < 200 && p.z > 0 && !shook) {
          // Trigger shake if it's massive and close
          if (p.baseSize > 150) {
            shakeStrength = Math.max(shakeStrength, (200 - p.z) / 200 * (p.baseSize / 100));
            shook = true;
          }
        }

        if (p.z < -100) {
          planetsRef.current.splice(i, 1);
          listChanged = true;
        } else {
          // Update DOM directly for smooth 60FPS without React renders
          const el = elementsRef.current.get(p.id);
          if (el) {
            const scale = Math.max(0.01, fov / Math.max(1, p.z));
            const sx = p.x * scale;
            const sy = p.y * scale;
            const size = p.baseSize * scale;
            const opacity = Math.min(1, (2500 - p.z) / 500);

            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.transform = `translate3d(calc(-50% + ${sx}px), calc(-50% + ${sy}px), 0)`;
            el.style.opacity = opacity.toString();
            el.style.zIndex = p.z < 500 ? "50" : "1";
          }
        }
      }

      if (shook && now - lastShakeRef.current > 3000 && shakeStrength > 0.5) {
        onShake(shakeStrength);
        lastShakeRef.current = now;
      }

      // Spawn logic
      if (now > nextSpawn && planetsRef.current.length < 2) {
        const p: Planet = {
          id: Math.random().toString(36).substring(2, 9),
          type: types[Math.floor(Math.random() * types.length)],
          x: (Math.random() - 0.5) * 3000,
          y: (Math.random() - 0.5) * 2000,
          z: 2500,
          vx: (Math.random() - 0.5) * 80,
          vy: (Math.random() - 0.5) * 80,
          vz: Math.random() * 250 + 150, // fast approach
          baseSize: Math.random() * 300 + 100, // random massive sizes
          seed: Math.random(),
        };
        planetsRef.current.push(p);
        listChanged = true;
        nextSpawn = now + 4000 + Math.random() * 8000;
      }

      if (listChanged) {
        setPlanets([...planetsRef.current]);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onShake]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {planets.map((p) => {
        let bg = "";
        let shadow = "";
        let border = "";

        if (p.type === "gas") {
          bg = "radial-gradient(circle at 30% 30%, rgba(168,85,247,0.85), rgba(99,102,241,0.6) 40%, rgba(5,6,15,0.95) 80%)";
          shadow = "inset 20px 20px 60px rgba(103,232,249,0.3), inset -30px -30px 80px rgba(0,0,0,0.9), 0 0 60px rgba(168,85,247,0.2)";
        } else if (p.type === "ice") {
          bg = "radial-gradient(circle at 35% 25%, rgba(103,232,249,0.9), rgba(14,165,233,0.7) 50%, rgba(5,6,15,0.95) 85%)";
          shadow = "inset 15px 15px 50px rgba(255,255,255,0.5), inset -40px -40px 100px rgba(0,0,0,0.9), 0 0 50px rgba(103,232,249,0.3)";
        } else if (p.type === "dark") {
          bg = "radial-gradient(circle at 50% 50%, rgba(5,6,15,1) 30%, rgba(0,0,0,1) 80%)";
          shadow = "inset 0 0 40px rgba(0,0,0,1), 0 0 100px rgba(168,85,247,0.7), 0 0 180px rgba(99,102,241,0.5)";
          border = "2px solid rgba(168,85,247,0.6)";
        } else {
          bg = "radial-gradient(circle at 40% 40%, rgba(244,114,182,0.7), rgba(124,58,237,0.5) 60%, rgba(5,6,15,0.9) 90%)";
          shadow = "inset 10px 10px 40px rgba(244,114,182,0.4), inset -20px -20px 60px rgba(0,0,0,0.9), 0 0 40px rgba(244,114,182,0.2)";
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
              opacity: 0, // start invisible, JS takes over
            }}
          >
            {/* Dark Anomaly Accretion Disk */}
            {p.type === "dark" && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `rotateX(75deg) rotateY(${p.seed * 45}deg) scale(2.4)`,
                  border: "2px solid rgba(103,232,249,0.5)",
                  boxShadow: "0 0 40px rgba(103,232,249,0.8), inset 0 0 25px rgba(103,232,249,0.5)",
                  borderRadius: "50%",
                }}
              />
            )}
            
            {/* Ice World Rings */}
            {p.type === "ice" && p.seed > 0.5 && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `rotateX(80deg) rotateY(${-p.seed * 30}deg) scale(2.1)`,
                  border: "8px solid rgba(255,255,255,0.1)",
                  borderTopColor: "rgba(103,232,249,0.6)",
                  borderBottomColor: "rgba(103,232,249,0.2)",
                  boxShadow: "0 0 20px rgba(103,232,249,0.4)",
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
