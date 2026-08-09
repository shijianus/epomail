import { useRef, useEffect } from "react";
import { CanvasBackground } from "./components/epomail/CanvasBackground";
import type { CanvasHandle } from "./components/epomail/CanvasBackground";
import { LoginCard } from "./components/epomail/LoginCard";
import { PassingPlanets } from "./components/epomail/PassingPlanets";
import { cameraState, updateCameraPhysics } from "./components/epomail/cameraStore";

export default function App() {
  const canvasRef = useRef<CanvasHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update global camera physics
      updateCameraPhysics(dt);

      // Apply overlay
      if (overlayRef.current) {
        overlayRef.current.style.opacity = cameraState.overlayOpacity.toString();
        overlayRef.current.style.background = cameraState.overlayColor;
        overlayRef.current.style.pointerEvents = cameraState.overlayOpacity > 0 ? "auto" : "none";
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div
        className="epomail relative size-full min-h-screen overflow-hidden"
        style={{ background: "var(--epo-void)" }}
      >
        <CanvasBackground ref={canvasRef} />
        <PassingPlanets />
        <div className="relative h-full min-h-screen">
          <LoginCard canvasRef={canvasRef} />
        </div>
      </div>
      
      {/* Pass-through overlay effect */}
      <div 
        ref={overlayRef}
        className="fixed inset-0 z-50 transition-colors duration-0"
        style={{ opacity: 0, pointerEvents: 'none', willChange: 'opacity, background-color', transform: 'translateZ(0)' }}
      />
    </>
  );
}
