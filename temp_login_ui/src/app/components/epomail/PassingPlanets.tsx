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
  baseHue: number;
  spinSpeed: number;
  axialTilt: number;
  spinOffset: number;
}

export function PassingPlanets() {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // State Machine for cinematic trajectory phases
  const flightPhaseRef = useRef<FlightPhase>("frontal");
  const phasePlanetsSpawned = useRef<number>(0);
  const hueHistoryRef = useRef<number[]>([]);

  function generateDistinctHue(): number {
    let hue = 0;
    let attempts = 0;
    while (attempts < 20) {
      hue = Math.floor(Math.random() * 360);
      const isTooClose = hueHistoryRef.current.some(h => Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) < 45);
      if (!isTooClose) break;
      attempts++;
    }
    return hue;
  }

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();
    let nextSpawn = performance.now() + 1000 + Math.random() * 2000;

    const types: PlanetType[] = ["ice", "gas", "dark", "nebula", "earth", "saturn"];
    const fov = 1000;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (containerRef.current) {
        containerRef.current.style.transform = `translate3d(${cameraState.panX + cameraState.shakeX}px, ${cameraState.panY + cameraState.shakeY}px, 0)`;
      }

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
                cameraState.shakeIntensity = 180; // Massive collision
                p.vz = -5000;
              } else if (p.phase === "chase" || (p.phase === "lateral" && p.vz < -1000)) {
                // Hit perfectly from behind
                cameraState.vz = 4.0; // Knocked FORWARD
                cameraState.shakeIntensity = 140; // Powerful hit from behind
                p.vz = 5000; // Bounce backwards relative to camera
              }
            } else if (p.hitType === "edge") {
              const angle = Math.atan2(p.y, p.x);
              if (p.phase === "lateral" && Math.abs(p.vz) < 500) {
                // Pure lateral collision
                cameraState.panVelX = -Math.cos(angle) * 4000; 
                cameraState.panVelY = -Math.sin(angle) * 4000;
                cameraState.shakeIntensity = 120; // Hard scrape
                p.vx *= -0.8; p.vy *= -0.8; p.vz = -3000; 
              } else {
                // Frontal or Chase edge scrape
                cameraState.panVelX = -Math.cos(angle) * 2500; 
                cameraState.panVelY = -Math.sin(angle) * 2500;
                cameraState.shakeIntensity = 90; // Light scrape
                p.vz = p.phase === "frontal" ? -2000 : 2000; 
                p.vx += Math.cos(angle) * 3000; 
                p.vy += Math.sin(angle) * 3000;
              }
            }
            
            // PROBABILITIES: Lateral + Chase <= 10%
            const shiftRoll = Math.random();
            let nextPhase = p.phase;
            
            if (p.phase === "frontal") {
               // 90% stay, 8% lateral, 2% chase
               if (shiftRoll < 0.90) nextPhase = "frontal";
               else if (shiftRoll < 0.98) nextPhase = "lateral";
               else nextPhase = "chase";
            } else if (p.phase === "lateral") {
               // 90% stay, 9% frontal, 1% chase
               if (shiftRoll < 0.90) nextPhase = "lateral";
               else if (shiftRoll < 0.99) nextPhase = "frontal";
               else nextPhase = "chase";
            } else if (p.phase === "chase") {
               // 90% stay, 9% lateral, 1% frontal
               if (shiftRoll < 0.90) nextPhase = "chase";
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
            // Planet travel time is ~5-8 seconds. To make the perceived gap 3-10s,
            // we set the actual wait timer to 0-3s.
            nextSpawn = now + getBellCurve(0, 3000);
          }
        } else {
          // Update DOM
          const el = elementsRef.current.get(p.id);
          if (el) {
            // Separate position scale from size scale to ensure smooth trajectory divergence 
            // without causing GPU fill-rate stutter from infinitely growing radial gradients.
            const posScale = fov / Math.max(1, p.z);
            const sizeScale = Math.max(0.01, Math.min(4.0, posScale));
            const sx = p.x * posScale;
            const sy = p.y * posScale;
            const size = p.baseSize * sizeScale;
            
            let opacity = 1;
            if (p.z > 15000) opacity = Math.max(0, (25000 - p.z) / 10000);
            
            // Allow planets to remain partially visible during pass-through so the collision effect is seen
            if (p.z < 800 && p.z > 0) opacity *= Math.max(0.4, (p.z) / 800); 
            if (p.z <= 0) opacity *= 0.4; // Maintain visibility while behind camera for dramatic effect

            // Removed display: none toggle which caused massive layout reflow stutters.
            // Opacity and pointer-events-none handle invisibility efficiently.

            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.transform = `translate3d(calc(-50% + ${sx}px), calc(-50% + ${sy}px), 0)`;
            
            p.spinOffset = (p.spinOffset || 0) + p.spinSpeed * dt;
            // Wrap seamlessly at 33.3333% (one full tile of the 300% width texture)
            p.spinOffset = p.spinOffset % (100 / 3);
            el.style.setProperty('--spin-offset', `${p.spinOffset}%`);
            
            el.style.setProperty('--p-opacity', opacity.toString());
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
        
        const type = types[Math.floor(Math.random() * types.length)];
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

        const h = generateDistinctHue();
        hueHistoryRef.current.unshift(h);
        if (hueHistoryRef.current.length > 5) hueHistoryRef.current.pop();

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
          baseHue: h,
          spinSpeed: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 15 + 10), // 10 to 25% per second (Highly noticeable)
          axialTilt: (Math.random() - 0.5) * 60, // -30 to 30 degrees
          spinOffset: 0,
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

function getPlanetStyles(p: Planet) {
  if ((p as any)._cachedStyles) return (p as any)._cachedStyles;

  let surfaceBg = "";
  let atmosphereShadow = "";
  let rings: React.CSSProperties[] = [];
  let outerGlow = "";
  let outerBorder = "none";
  
  const h = p.baseHue;
  const h2 = (h + 120) % 360;
  const h3 = (h + 240) % 360;
  
  // Deterministic PRNG
  let seedVal = Math.floor(p.seed * 2147483647);
  if (seedVal === 0) seedVal = 1; 
  const rand = () => {
    seedVal = (seedVal * 16807) % 2147483647;
    return (seedVal - 1) / 2147483646;
  };
  rand(); rand(); rand(); // Mix initial

  const complexity = rand();

  if (p.type === "gas") {
    let storms = [];
    const numStorms = Math.floor(rand() * 12) + 6;
    for (let i = 0; i < numStorms; i++) {
      const x = rand() * 100;
      const y = rand() * 100;
      const r = rand() * 3 + 1.5;
      const hueChoice = rand() > 0.6 ? h2 : (rand() > 0.5 ? h + 20 : h - 20);
      storms.push(`radial-gradient(ellipse at ${x}% ${y}%, hsla(${hueChoice}, 70%, 40%, 0.85) 0%, transparent ${r}%)`);
    }

    let currentPct = 0;
    const bandColors = [
      `hsla(${h}, 60%, 35%, 1)`,
      `hsla(${h2}, 50%, 45%, 1)`,
      `hsla(${h3}, 70%, 25%, 1)`,
      `hsla(${h + 15}, 65%, 40%, 1)`,
      `hsla(${h2 - 15}, 70%, 20%, 1)`,
      `hsla(${h3 + 10}, 50%, 50%, 1)`
    ];
    let bandStops = [];
    while (currentPct < 25) { 
      let color = bandColors[Math.floor(rand() * bandColors.length)];
      let width = rand() * 2 + 0.5; 
      bandStops.push(`${color} ${currentPct}%`);
      currentPct += width;
      bandStops.push(`${color} ${currentPct}%`);
      currentPct += rand() * 0.3; // gap
    }
    // Vertical bands so they slide horizontally across the planet perfectly
    const bands = `repeating-linear-gradient(90deg, ${bandStops.join(', ')})`;

    surfaceBg = [...storms, bands].join(', ');
    atmosphereShadow = `
      radial-gradient(circle at 30% 30%, hsla(${h}, 50%, 100%, 0.4) 0%, transparent 45%), 
      radial-gradient(circle at 75% 75%, transparent 35%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.7) 100%)
    `;
    outerGlow = `0 0 50px hsla(${h}, 80%, 60%, 0.4)`;
    
    const ringType = rand();
    if (ringType > 0.3) {
      if (ringType > 0.8) {
        rings.push({ transform: `rotateX(75deg) rotateY(${rand() * 180}deg) scale(2.2)`, border: `6px solid hsla(${h}, 70%, 60%, 0.8)`, borderRadius: "50%" });
        rings.push({ transform: `rotateX(-75deg) rotateY(${rand() * 180}deg) scale(2.5)`, border: `12px solid hsla(${h2}, 70%, 50%, 0.6)`, borderRadius: "50%" });
      } else if (ringType > 0.5) {
        const rot = rand() * 40 - 20;
        rings.push({ transform: `rotateX(75deg) rotateY(${rot}deg) scale(1.8)`, border: `25px solid hsla(${h}, 60%, 50%, 0.9)`, borderRadius: "50%" });
        rings.push({ transform: `rotateX(75deg) rotateY(${rot}deg) scale(2.5)`, border: `4px solid hsla(${h2}, 80%, 70%, 0.5)`, borderRadius: "50%" });
      } else {
        rings.push({
          transform: `rotateX(75deg) rotateY(${rand() * 40 - 20}deg) scale(2.4)`,
          background: `radial-gradient(circle at center, transparent 38%, hsla(${h}, 70%, 60%, 0.95) 40%, hsla(${h2}, 60%, 50%, 0.8) 50%, hsla(${h3}, 50%, 40%, 0.4) 65%, transparent 68%)`,
          borderRadius: "50%"
        });
      }
    }
  } else if (p.type === "earth") {
    // Classic Earth-like Terrestrial Blue Planet
    let clouds = [];
    const numClouds = Math.floor(rand() * 15) + 10;
    for (let i = 0; i < numClouds; i++) {
      const x = rand() * 100;
      const y = rand() * 100;
      const rx = rand() * 15 + 8;
      const ry = rand() * 6 + 2; 
      clouds.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.4) 40%, transparent 100%)`);
    }

    let continents = [];
    const numContinents = Math.floor(rand() * 12) + 6;
    for (let i = 0; i < numContinents; i++) {
      const x = rand() * 100;
      const y = rand() * 100;
      const rx = rand() * 12 + 6;
      const ry = rand() * 10 + 4;
      // Green/Brown organic patches for landmass
      const isDesert = rand() > 0.7;
      const color = isDesert ? 'hsla(45, 40%, 50%, 0.9)' : 'hsla(110, 30%, 40%, 0.9)';
      const colorEdge = isDesert ? 'hsla(30, 40%, 40%, 0.6)' : 'hsla(130, 30%, 30%, 0.6)';
      continents.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, ${color} 0%, ${colorEdge} 60%, transparent 100%)`);
    }

    // Deep Ocean Base
    const baseOcean = `hsla(210, 80%, 25%, 1)`;
    surfaceBg = [...clouds, ...continents, baseOcean].join(', ');

    atmosphereShadow = `
      radial-gradient(circle at 30% 30%, hsla(210, 50%, 100%, 0.4) 0%, transparent 45%), 
      radial-gradient(circle at 75% 75%, transparent 35%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.7) 100%)
    `;
    outerGlow = `0 0 50px hsla(210, 80%, 60%, 0.4)`;
    // Earth usually has no rings, keep empty.
  } else if (p.type === "saturn") {
    // Classic Saturn-like Gas Giant
    let currentPct = 0;
    const saturnColors = [
      `hsla(40, 40%, 65%, 1)`,   // Pale yellow
      `hsla(30, 30%, 55%, 1)`,   // Tan
      `hsla(20, 35%, 45%, 1)`,   // Brown/Orange
      `hsla(45, 50%, 75%, 1)`,   // Bright cream
      `hsla(25, 20%, 40%, 1)`    // Dark tan
    ];
    let bandStops = [];
    while (currentPct < 25) { 
      let color = saturnColors[Math.floor(rand() * saturnColors.length)];
      let width = rand() * 1.5 + 0.2; // very tight, smooth bands
      bandStops.push(`${color} ${currentPct}%`);
      currentPct += width;
      bandStops.push(`${color} ${currentPct}%`);
    }
    surfaceBg = `repeating-linear-gradient(90deg, ${bandStops.join(', ')})`;

    atmosphereShadow = `
      radial-gradient(circle at 30% 30%, hsla(40, 50%, 100%, 0.3) 0%, transparent 45%), 
      radial-gradient(circle at 75% 75%, transparent 35%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.8) 100%)
    `;
    outerGlow = `0 0 60px hsla(40, 60%, 50%, 0.3)`;
    
    // Iconic massive Saturn rings (A, B rings, Cassini division)
    const tilt = (rand() > 0.5 ? 1 : -1) * (70 + rand() * 10); // 70 to 80 degrees tilt
    const ringRot = rand() * 40 - 20;
    rings.push({
      transform: `rotateX(${tilt}deg) rotateY(${ringRot}deg) scale(2.6)`,
      background: `
        radial-gradient(circle at center, 
        transparent 38%, 
        hsla(35, 40%, 55%, 0.95) 40%, 
        hsla(40, 50%, 65%, 0.85) 46%, 
        transparent 47.5%, /* Cassini Division */
        hsla(30, 30%, 50%, 0.8) 49%, 
        hsla(25, 20%, 40%, 0.4) 62%, 
        transparent 65%)
      `,
      borderRadius: "50%"
    });
  } else if (p.type === "ice") {
    if (complexity < 0.25) {
      // Pure Minimalist Ice Planet
      surfaceBg = `
        radial-gradient(ellipse at 30% 60%, hsla(${h2}, 30%, 80%, 0.4) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, hsla(${h3}, 20%, 90%, 0.3) 0%, transparent 60%),
        hsla(${h}, 50%, 70%, 1)
      `;
    } else {
      // Organic Blobby Ice (No straight cracks)
      let blobs = [];
      const numBlobs = Math.floor(rand() * 20) + 15;
      for (let i = 0; i < numBlobs; i++) {
        const x = rand() * 100;
        const y = rand() * 100;
        const rx = rand() * 15 + 3;
        const ry = rand() * 6 + 2; 
        const c = rand() > 0.6 ? h2 : h;
        blobs.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, hsla(${c}, 40%, 95%, 0.8) 0%, hsla(${h3}, 30%, 80%, 0.3) 60%, transparent 100%)`);
      }
      const baseIce = `hsla(${h}, 50%, 65%, 1)`;
      surfaceBg = [...blobs, baseIce].join(', ');
    }

    atmosphereShadow = `
      radial-gradient(circle at 30% 30%, hsla(${h}, 50%, 95%, 0.5) 0%, transparent 45%), 
      radial-gradient(circle at 75% 75%, transparent 35%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.8) 100%)
    `;
    outerGlow = `0 0 40px hsla(${h}, 80%, 60%, 0.4)`;
    
    if (rand() > 0.5) {
      rings.push({
        transform: `rotateX(78deg) rotateY(${-rand() * 40}deg) scale(2.4)`,
        border: `${Math.floor(rand() * 12 + 2)}px solid hsla(${h}, 50%, 90%, 0.7)`,
        boxShadow: `0 0 30px hsla(${h2}, 80%, 60%, 0.8), inset 0 0 15px hsla(${h3}, 80%, 80%, 0.9)`,
        borderRadius: "50%"
      });
    }
  } else if (p.type === "dark") {
    if (complexity < 0.2) {
      // Pure Void Planet
      surfaceBg = `
        radial-gradient(ellipse at 50% 50%, hsla(${h}, 50%, 15%, 0.6) 0%, transparent 60%),
        hsla(${h3}, 10%, 5%, 1)
      `;
    } else {
      let flares = [];
      const numFlares = Math.floor(rand() * 8) + 5;
      for (let i = 0; i < numFlares; i++) {
        const x = rand() * 100; 
        const y = rand() * 100;
        const rx = rand() * 20 + 5;
        const ry = rand() * 10 + 3;
        const c = rand() > 0.5 ? h2 : h3;
        flares.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, hsla(${c}, 100%, 50%, 0.7) 0%, transparent 100%)`);
      }
      
      let conicStops = [];
      let currentAngle = 0;
      while(currentAngle < 100) {
         const isFlare = rand() > 0.5;
         const step = rand() * 8 + 3;
         if (isFlare) {
            const c = rand() > 0.5 ? h : h2;
            conicStops.push(`hsla(${c}, 100%, ${rand()*40 + 50}%, ${rand()*0.6 + 0.4}) ${currentAngle}%`);
         } else {
            conicStops.push(`hsla(${h}, 100%, 50%, 0) ${currentAngle}%`);
         }
         currentAngle += step;
      }
      conicStops.push(`hsla(${h}, 100%, 50%, 0) 100%`);
      
      const accretion = `conic-gradient(from ${rand() * 360}deg at 50% 50%, ${conicStops.join(", ")})`;
      const baseDark = `hsla(${h}, 10%, 8%, 1)`;
      surfaceBg = [...flares, accretion, baseDark].join(', ');
    }

    atmosphereShadow = `
      radial-gradient(circle at 40% 40%, hsla(${h}, 50%, 80%, 0.3) 0%, transparent 40%),
      radial-gradient(circle at 70% 70%, transparent 40%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.9) 100%)
    `;
    outerGlow = `0 0 60px hsla(${h}, 80%, 50%, 0.9), 0 0 120px hsla(${h2}, 80%, 40%, 0.6)`;
    outerBorder = `2px solid hsla(${h}, 80%, 50%, 0.8)`;
    
    const ringRot = rand() * 180;
    rings.push({
      transform: `rotateX(70deg) rotateY(${ringRot}deg) scale(2.8)`,
      border: `4px solid hsla(${h3}, 80%, 60%, 0.9)`,
      boxShadow: `0 0 80px hsla(${h}, 80%, 60%, 1), inset 0 0 40px hsla(${h2}, 80%, 60%, 0.8)`,
      borderRadius: "50%"
    });
    if (rand() > 0.5) {
      rings.push({
        transform: `rotateX(70deg) rotateY(${ringRot}deg) scale(3.2)`,
        border: `1px solid hsla(${h}, 90%, 70%, 0.5)`,
        boxShadow: `0 0 20px hsla(${h}, 90%, 70%, 0.5)`,
        borderRadius: "50%"
      });
    }
  } else {
    if (complexity < 0.25) {
      // Pure Obsidian/Magma Planet
      surfaceBg = `
        radial-gradient(ellipse at 40% 60%, hsla(${h}, 100%, 30%, 0.4) 0%, transparent 60%),
        hsla(${h3}, 100%, 8%, 1)
      `;
    } else {
      // Organic Magma Lakes (No straight rivers)
      let lakes = [];
      const numLakes = Math.floor(rand() * 15) + 8;
      for (let i = 0; i < numLakes; i++) {
        const x = rand() * 100;
        const y = rand() * 100;
        const rx = rand() * 18 + 4;
        const ry = rand() * 8 + 2;
        const bright = rand() > 0.5 ? 65 : 45;
        const c = rand() > 0.5 ? h2 : h;
        lakes.push(`radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, hsla(${c}, 100%, ${bright}%, 0.95) 0%, hsla(${h3}, 100%, 25%, 0.6) 50%, transparent 100%)`);
      }
      const baseMagma = `hsla(${h3}, 100%, 10%, 1)`;
      surfaceBg = [...lakes, baseMagma].join(', ');
    }
    
    atmosphereShadow = `
      radial-gradient(circle at 35% 35%, hsla(${h}, 50%, 80%, 0.3) 0%, transparent 40%),
      radial-gradient(circle at 70% 70%, transparent 40%, rgba(0,0,0,0.95) 75%, rgba(0,0,0,1) 100%),
      radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.9) 100%)
    `;
    outerGlow = `0 0 50px hsla(${h2}, 80%, 60%, 0.5)`;
  }

  const styles = { surfaceBg, atmosphereShadow, rings, outerGlow, outerBorder };
  (p as any)._cachedStyles = styles;
  return styles;
}

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden will-change-transform" style={{ perspective: '1000px' }}>
      {planets.map((p) => {
        const styles = getPlanetStyles(p);

        return (
          <div
            key={p.id}
            ref={(el) => {
              if (el) elementsRef.current.set(p.id, el);
              else elementsRef.current.delete(p.id);
            }}
            className="absolute rounded-full left-1/2 top-1/2 will-change-transform"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Sphere Volume Container */}
            <div 
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{
                boxShadow: styles.outerGlow,
                border: styles.outerBorder,
                opacity: 'var(--p-opacity, 0)',
                transform: 'translateZ(0)' // Anchor for 3D intersection
              }}
            >
              {/* Spinning 3D Texture Layer */}
              <div 
                className="absolute" 
                style={{ 
                  width: '300%', height: '300%', left: '-100%', top: '-100%',
                  background: styles.surfaceBg, 
                  backgroundSize: '33.333333% 33.333333%',
                  backgroundRepeat: 'repeat',
                  transform: `rotate(${p.axialTilt}deg) translateX(var(--spin-offset, 0%))`
                }} 
              />
              {/* Stationary Atmosphere / 3D Shading Layer */}
              <div 
                className="absolute inset-0" 
                style={{ background: styles.atmosphereShadow }} 
              />
            </div>

            {/* Complete 360-Degree Ring Layers (Preserve-3D Occlusion) */}
            {styles.rings.map((rStyles, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full"
                style={{
                  ...rStyles,
                  opacity: 'var(--p-opacity, 0)'
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
