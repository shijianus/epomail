import { useEffect, useRef, useState } from "react";
import { cameraState } from "./cameraStore";

type PlanetType = "ice" | "gas" | "dark" | "nebula";
type FlightPhase = "frontal" | "lateral" | "chase";

function getBellCurve(min: number, max: number): number {
  const u = (Math.random() + Math.random() + Math.random()) / 3;
  return min + u * (max - min);
}

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
  phase: FlightPhase;
  isHit: boolean;
  hitType: "dead-center" | "edge" | "pass-through" | "none";
  hasCollided: boolean;
}

export function PassingPlanets() {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // State Machine for cinematic trajectory phases
  const flightPhaseRef = useRef<FlightPhase>("frontal");
  const phasePlanetsSpawned = useRef<number>(0);

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

      for (let i = planetsRef.current.length - 1; i >= 0; i--) {
        const p = planetsRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        
        const effectiveApproachSpeed = p.vz + 1500 * (cameraState.vz - 1);
        p.z -= effectiveApproachSpeed * dt;

        const radius = p.baseSize / 2; 
        
        // Only check collisions if it's meant to hit and Z is near the camera
        if (p.isHit && !p.hasCollided && p.z < radius * 1.5 && p.z > -radius * 1.5) {
          const distXY = Math.hypot(p.x, p.y);
          // Safety check (our spawn math guarantees it, but just in case)
          if (distXY < radius * 1.2) {
            p.hasCollided = true;
            
            if (p.hitType === "pass-through") {
              cameraState.overlayOpacity = 1;
              if (p.type === 'gas') cameraState.overlayColor = "rgba(168,85,247,0.95)";
              else if (p.type === 'ice') cameraState.overlayColor = "rgba(103,232,249,0.95)";
              else if (p.type === 'dark') cameraState.overlayColor = "rgba(0,0,0,1)";
              else cameraState.overlayColor = "rgba(244,114,182,0.95)";
            } else if (p.hitType === "dead-center") {
              if (p.phase === "frontal") {
                cameraState.vz = -4.0; // Knock-back
                cameraState.shakeIntensity = 80;
                p.vz = -5000;
              } else if (p.phase === "chase" || (p.phase === "lateral" && p.vz < -1000)) {
                // Hit perfectly from behind
                cameraState.vz = 4.0; // Knocked FORWARD
                cameraState.shakeIntensity = 60;
                p.vz = 5000; // Bounce backwards relative to camera
              }
            } else if (p.hitType === "edge") {
              const angle = Math.atan2(p.y, p.x);
              if (p.phase === "lateral" && Math.abs(p.vz) < 500) {
                // Pure lateral collision
                cameraState.panVelX = -Math.cos(angle) * 4000; 
                cameraState.panVelY = -Math.sin(angle) * 4000;
                cameraState.shakeIntensity = 50;
                p.vx *= -0.8; p.vy *= -0.8; p.vz = -3000; 
              } else {
                // Frontal or Chase edge scrape
                cameraState.panVelX = -Math.cos(angle) * 2500; 
                cameraState.panVelY = -Math.sin(angle) * 2500;
                cameraState.shakeIntensity = 40;
                p.vz = p.phase === "frontal" ? -2000 : 2000; 
                p.vx += Math.cos(angle) * 3000; 
                p.vy += Math.sin(angle) * 3000;
              }
            }
            
            // EXACT PHASE TRANSITION PROBABILITIES AS REQUESTED
            const shiftRoll = Math.random();
            let nextPhase = p.phase;
            
            if (p.phase === "frontal") {
               // 65% stay, 25% lateral, 10% chase
               if (shiftRoll < 0.65) nextPhase = "frontal";
               else if (shiftRoll < 0.90) nextPhase = "lateral";
               else nextPhase = "chase";
            } else if (p.phase === "lateral") {
               // 55% stay, 35% frontal, 10% chase
               if (shiftRoll < 0.55) nextPhase = "lateral";
               else if (shiftRoll < 0.90) nextPhase = "frontal";
               else nextPhase = "chase";
            } else if (p.phase === "chase") {
               // 60% stay, 39% lateral, 1% frontal
               if (shiftRoll < 0.60) nextPhase = "chase";
               else if (shiftRoll < 0.99) nextPhase = "lateral";
               else {
                 nextPhase = "frontal";
                 // Special Camera Spin (15% chance when Chase -> Frontal)
                 if (Math.random() < 0.15) {
                    cameraState.panVelX = 15000 * (Math.random() > 0.5 ? 1 : -1);
                    cameraState.panVelY = 15000 * (Math.random() > 0.5 ? 1 : -1);
                 }
               }
            }
            
            flightPhaseRef.current = nextPhase;
            phasePlanetsSpawned.current = 0;
          }
        }

        if (p.z < -1000 || p.z > 35000 || Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000) { 
          // Destroy if way behind, bounced too far away, or flew off laterally
          planetsRef.current.splice(i, 1);
          listChanged = true;
          if (planetsRef.current.length === 0) {
            nextSpawn = now + getBellCurve(3000, 10000);
          }
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

      // Spawn logic: strictly one planet at a time!
      if (now > nextSpawn && planetsRef.current.length === 0) {
        let phase = flightPhaseRef.current;
        
        phasePlanetsSpawned.current++;

        const baseSize = Math.random() * 800 + 400; // Planets are massive
        const radius = baseSize / 2;
        
        let spawnX = 0, spawnY = 0, spawnZ = 0;
        let vx = 0, vy = 0, vz = 0;
        let targetX = 0, targetY = 0;

        // GLOBAL RULE: 10% hit, 90% miss!
        const isHit = Math.random() < 0.10;
        let hitType: Planet["hitType"] = "none";

        if (isHit) {
          if (phase === "frontal") {
            const hasDeadCenter = planetsRef.current.some(p => p.hitType === "dead-center" || p.hitType === "pass-through");
            // 5% dead-center (prevented if one is already active), 95% edge
            if (!hasDeadCenter && Math.random() < 0.05) {
              hitType = Math.random() < 0.20 ? "pass-through" : "dead-center"; // 1% pass-through, 4% dead-center
            } else {
              hitType = "edge";
            }
          } else if (phase === "chase") {
            hitType = Math.random() < 0.10 ? "dead-center" : "edge"; // 10% back hit, 90% side scrape
          } else if (phase === "lateral") {
            hitType = Math.random() < 0.01 ? "dead-center" : "edge"; // 1% back hit, 99% side hit
          }
        }

        if (phase === "frontal") {
          spawnZ = 25000;
          vz = Math.random() * 2000 + 2500;
          
          if (isHit) {
            if (hitType === "dead-center" || hitType === "pass-through") {
              // Frontal hit: lands ON the screen, but can be randomly placed
              const r = Math.random() * (radius * 0.7);
              const angle = Math.random() * Math.PI * 2;
              targetX = Math.cos(angle) * r;
              targetY = Math.sin(angle) * r;
            } else { 
              // Edge hit: 50% Left/Right, 50% Top/Bottom
              const isHorizontal = Math.random() < 0.5;
              const edgeDist = radius * 0.9 + Math.random() * (radius * 0.25);
              if (isHorizontal) {
                targetX = (Math.random() < 0.5 ? 1 : -1) * edgeDist;
                targetY = (Math.random() - 0.5) * radius * 0.8;
              } else {
                targetX = (Math.random() - 0.5) * radius * 0.8;
                targetY = (Math.random() < 0.5 ? 1 : -1) * edgeDist;
              }
            }
          } else { 
            // Miss: 50% Left/Right, 50% Top/Bottom
            const isHorizontal = Math.random() < 0.5;
            const missDistX = radius * 1.3 + 800 + Math.random() * 2500;
            const missDistY = radius * 1.3 + 400 + Math.random() * 2500;
            if (isHorizontal) {
              targetX = (Math.random() < 0.5 ? 1 : -1) * missDistX;
              targetY = (Math.random() - 0.5) * missDistY;
            } else {
              targetX = (Math.random() - 0.5) * missDistX;
              targetY = (Math.random() < 0.5 ? 1 : -1) * missDistY;
            }
          }
          
          // Spawn completely randomly in the deep background and calculate velocity to hit the target
          const T = spawnZ / vz;
          spawnX = (Math.random() - 0.5) * 16000; 
          spawnY = (Math.random() - 0.5) * 10000;
          vx = (targetX - spawnX) / T;
          vy = (targetY - spawnY) / T;

        } else if (phase === "chase") {
          spawnZ = -1500;
          vz = -3000 - Math.random() * 1500; 
          
          if (isHit) {
            if (hitType === "dead-center") {
              const r = Math.random() * (radius * 0.7);
              const angle = Math.random() * Math.PI * 2;
              targetX = Math.cos(angle) * r;
              targetY = Math.sin(angle) * r;
            } else { 
              // Edge scrape from behind
              const isHorizontal = Math.random() < 0.5;
              const edgeDist = radius * 0.9 + Math.random() * (radius * 0.25);
              if (isHorizontal) {
                targetX = (Math.random() < 0.5 ? 1 : -1) * edgeDist;
                targetY = (Math.random() - 0.5) * radius * 0.8;
              } else {
                targetX = (Math.random() - 0.5) * radius * 0.8;
                targetY = (Math.random() < 0.5 ? 1 : -1) * edgeDist;
              }
            }
          } else { 
            // Miss from behind
            const isHorizontal = Math.random() < 0.5;
            const missDistX = radius * 1.3 + 800 + Math.random() * 2000;
            const missDistY = radius * 1.3 + 400 + Math.random() * 2000;
            if (isHorizontal) {
              targetX = (Math.random() < 0.5 ? 1 : -1) * missDistX;
              targetY = (Math.random() - 0.5) * missDistY;
            } else {
              targetX = (Math.random() - 0.5) * missDistX;
              targetY = (Math.random() < 0.5 ? 1 : -1) * missDistY;
            }
          }
          
          const T = Math.abs(spawnZ / vz);
          spawnX = (Math.random() - 0.5) * 4000; 
          spawnY = (Math.random() - 0.5) * 3000;
          vx = (targetX - spawnX) / T;
          vy = (targetY - spawnY) / T;

        } else if (phase === "lateral") {
          if (isHit && hitType === "dead-center") {
            // 1% back hit in lateral phase! Spawns behind us.
            spawnZ = -1500;
            vz = -3000 - Math.random() * 1500; 
            targetX = (Math.random() - 0.5) * radius * 0.3;
            targetY = (Math.random() - 0.5) * radius * 0.3;
            const T = Math.abs(spawnZ / vz);
            vx = (Math.random() - 0.5) * 100;
            vy = (Math.random() - 0.5) * 100;
            spawnX = targetX - vx * T;
            spawnY = targetY - vy * T;
          } else {
            // Normal lateral side spawn
            spawnZ = 200 + Math.random() * 300; 
            const side = Math.floor(Math.random() * 4); 
            
            if (side === 0) { spawnX = 3000; spawnY = (Math.random() - 0.5) * 500; vx = -3500 - Math.random() * 1000; vy = 0; }
            else if (side === 1) { spawnX = -3000; spawnY = (Math.random() - 0.5) * 500; vx = 3500 + Math.random() * 1000; vy = 0; }
            else if (side === 2) { spawnX = (Math.random() - 0.5) * 500; spawnY = 2000; vx = 0; vy = -3500 - Math.random() * 1000; }
            else { spawnX = (Math.random() - 0.5) * 500; spawnY = -2000; vx = 0; vy = 3500 + Math.random() * 1000; }
            
            if (isHit) {
              // Aim at camera
              if (side === 0 || side === 1) spawnY = (Math.random() - 0.5) * radius * 0.5;
              else spawnX = (Math.random() - 0.5) * radius * 0.5;
            } else {
              // Pure flyby (Miss intentionally)
              if (side === 0 || side === 1) spawnY = (Math.random() < 0.5 ? 1 : -1) * (radius + 500 + Math.random() * 1000);
              else spawnX = (Math.random() < 0.5 ? 1 : -1) * (radius + 500 + Math.random() * 1000);
            }
            vz = (Math.random() - 0.5) * 100; 
          }
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
          phase,
          isHit,
          hitType,
          hasCollided: false,
        };
        
        planetsRef.current.push(p);
        listChanged = true;
        
        // Prevent another spawn until this planet finishes and sets the next timer
        nextSpawn = Infinity;
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
