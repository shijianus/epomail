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
  const warningRef = useRef<HTMLDivElement>(null);

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
      
      // Apply warning border
      if (warningRef.current) {
        warningRef.current.style.opacity = cameraState.warningOpacity.toString();
        warningRef.current.style.visibility = cameraState.warningOpacity > 0 ? "visible" : "hidden";
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
      
      {/* Sci-Fi Red Warning HUD on collision */}
      <div 
        ref={warningRef}
        className="fixed inset-0 z-[60] pointer-events-none overflow-hidden"
        style={{ 
          opacity: 0, 
          visibility: 'hidden',
          willChange: 'opacity, visibility', 
          transform: 'translateZ(0)',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(220, 38, 38, 0.25) 100%)',
          boxShadow: 'inset 0 0 120px rgba(220, 38, 38, 0.6)'
        }}
      >
        {/* Diagonal caution stripes on top & bottom edge */}
        <div 
          className="absolute top-0 left-0 right-0 h-3 sm:h-4 opacity-80"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(220,38,38,0.9), rgba(220,38,38,0.9) 15px, transparent 15px, transparent 30px)' }}
        />
        <div 
          className="absolute bottom-0 left-0 right-0 h-3 sm:h-4 opacity-80"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(220,38,38,0.9), rgba(220,38,38,0.9) 15px, transparent 15px, transparent 30px)' }}
        />

        {/* Corner Brackets */}
        <div className="absolute top-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-t-8 border-l-8 border-red-600/90 m-6 sm:m-8" />
        <div className="absolute top-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-t-8 border-r-8 border-red-600/90 m-6 sm:m-8" />
        <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-b-8 border-l-8 border-red-600/90 m-6 sm:m-8" />
        <div className="absolute bottom-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-b-8 border-r-8 border-red-600/90 m-6 sm:m-8" />

        {/* HUD Data Top Left */}
        <div className="absolute top-12 left-12 sm:top-16 sm:left-20 text-red-500 font-mono text-[10px] sm:text-sm font-bold tracking-[0.2em] uppercase leading-relaxed drop-shadow-md">
          <span className="animate-pulse">SYS.WARN // 0xDEAD</span><br/>
          IMPACT DETECTED<br/>
          CRITICAL AVOIDANCE
        </div>

        {/* HUD Data Bottom Right */}
        <div className="absolute bottom-12 right-12 sm:bottom-16 sm:right-20 text-red-500 font-mono text-[10px] sm:text-sm font-bold tracking-[0.2em] text-right uppercase leading-relaxed drop-shadow-md">
          HULL INTEGRITY COMPROMISED<br/>
          AUTO-REPAIR: <span className="animate-pulse">ENGAGED</span>
        </div>

        {/* Center Warning Banner */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-90">
           <div className="flex items-center gap-4 sm:gap-6 border-y-2 border-red-500/80 py-2 px-8 sm:py-3 sm:px-12 bg-red-950/70">
             <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 animate-ping rounded-full" />
             <div className="text-red-500 font-mono text-lg sm:text-3xl font-black tracking-[0.4em] sm:tracking-[0.5em] uppercase">
               WARNING
             </div>
             <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 animate-ping rounded-full" />
           </div>
        </div>
      </div>
    </>
  );
}
