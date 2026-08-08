import { useRef } from "react";
import { CanvasBackground } from "./components/epomail/CanvasBackground";
import type { CanvasHandle } from "./components/epomail/CanvasBackground";
import { LoginCard } from "./components/epomail/LoginCard";
import { SpaceTrail } from "./components/epomail/SpaceTrail";

export default function App() {
  const canvasRef = useRef<CanvasHandle | null>(null);

  return (
    <div
      className="epomail relative size-full min-h-screen overflow-hidden"
      style={{ background: "var(--epo-void)" }}
    >
      <CanvasBackground ref={canvasRef} />
      <SpaceTrail />
      <div className="relative h-full min-h-screen">
        <LoginCard canvasRef={canvasRef} />
      </div>
    </div>
  );
}
