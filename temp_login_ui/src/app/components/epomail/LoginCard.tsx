import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { CanvasHandle } from "./CanvasBackground";

import { AuthForm } from "./AuthForm";

interface LoginCardProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
}

export function LoginCard({ canvasRef }: LoginCardProps) {
  // Cursor parallax — card floats opposite to the pointer.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 18 });
  const sy = useSpring(py, { stiffness: 60, damping: 18 });
  const rotateY = useTransform(sx, [-1, 1], [8, -8]);
  const rotateX = useTransform(sy, [-1, 1], [-8, 8]);
  const translateX = useTransform(sx, [-1, 1], [10, -10]);
  const translateY = useTransform(sy, [-1, 1], [8, -8]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py]);

  return (
    <div
      className="relative z-10 flex min-h-full items-center justify-center px-5 py-10"
      style={{ perspective: 1200 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          rotateX,
          rotateY,
          x: translateX,
          y: translateY,
          transformStyle: "preserve-3d",
        }}
        className="relative w-full max-w-[420px]"
      >
        {/* Acrylic prism block */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 sm:p-10"
          style={{
            background:
              "linear-gradient(145deg, rgba(20,24,54,0.55), rgba(10,12,30,0.35))",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          {/* Gradient edge (masked border) */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              padding: "1px",
              background:
                "linear-gradient(145deg, rgba(168,85,247,0.9), rgba(99,102,241,0.7) 35%, rgba(103,232,249,0.5) 60%, rgba(255,255,255,0.05) 85%)",
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
          {/* Bevel highlight streaks */}
          <div
            className="pointer-events-none absolute -left-1/3 -top-1/3 h-2/3 w-2/3 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)",
            }}
          />

          <div className="relative">
            {/* Brand header */}
            <div className="mb-8 flex flex-col items-center text-center">
              <img
                src="/logo.svg"
                alt="EpoMail Logo"
                className="h-16 w-16"
                style={{
                  filter:
                    "drop-shadow(0 0 14px rgba(99,102,241,0.45)) drop-shadow(0 6px 18px rgba(124,58,237,0.35))",
                }}
              />
              <h1
                className="epomail-display mt-4"
                style={{
                  fontSize: "26px",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  background:
                    "linear-gradient(90deg, var(--epo-ink), var(--epo-indigo-glow) 60%, var(--epo-cyan-glow))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                EpoMail
              </h1>
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--epo-muted)" }}
              >
                Step into the canvas. Your signals await.
              </p>
            </div>

            <AuthForm canvasRef={canvasRef} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
