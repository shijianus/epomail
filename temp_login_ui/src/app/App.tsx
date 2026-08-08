import { useRef, useState, useEffect } from "react";
import { CanvasBackground } from "./components/epomail/CanvasBackground";
import type { CanvasHandle } from "./components/epomail/CanvasBackground";
import { LoginCard } from "./components/epomail/LoginCard";
import { PassingPlanets } from "./components/epomail/PassingPlanets";

export default function App() {
  const canvasRef = useRef<CanvasHandle | null>(null);
  const [shakeIntensity, setShakeIntensity] = useState(0);

  useEffect(() => {
    if (shakeIntensity > 0) {
      const timer = setTimeout(() => setShakeIntensity(0), 800);
      return () => clearTimeout(timer);
    }
  }, [shakeIntensity]);

  const onShake = (strength: number) => {
    setShakeIntensity(strength);
  };

  return (
    <>
      {shakeIntensity > 0 && (
        <style>{`
          @keyframes screenShake {
            0% { transform: translate(0, 0) rotate(0deg); }
            20% { transform: translate(-${shakeIntensity * 8}px, ${shakeIntensity * 4}px) rotate(-${shakeIntensity * 1}deg); }
            40% { transform: translate(${shakeIntensity * 6}px, -${shakeIntensity * 6}px) rotate(${shakeIntensity * 1}deg); }
            60% { transform: translate(-${shakeIntensity * 4}px, ${shakeIntensity * 8}px) rotate(0deg); }
            80% { transform: translate(${shakeIntensity * 4}px, -${shakeIntensity * 4}px) rotate(-${shakeIntensity * 0.5}deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
          .shake-active {
            animation: screenShake 0.6s cubic-bezier(.36,.07,.19,.97) both;
          }
        `}</style>
      )}
      <div
        className={`epomail relative size-full min-h-screen overflow-hidden ${shakeIntensity > 0 ? 'shake-active' : ''}`}
        style={{ background: "var(--epo-void)" }}
      >
        <CanvasBackground ref={canvasRef} />
        <PassingPlanets onShake={onShake} />
        <div className="relative h-full min-h-screen">
          <LoginCard canvasRef={canvasRef} />
        </div>
      </div>
    </>
  );
}
