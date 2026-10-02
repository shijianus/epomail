import { useEffect, useMemo } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { CanvasHandle } from "./CanvasBackground";
import { createTr, resolveAuthLang } from "../../i18n/authLocale";

import { AuthForm } from "./AuthForm";

interface LoginCardProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
  onSwitch: () => void;
  sysConfig?: any;
}

export function LoginCard({ canvasRef, onSwitch, sysConfig }: LoginCardProps) {
  // 尊重系统「减少动态效果」偏好：关闭 3D 视差与入场位移/模糊
  const reduceMotion = !!useReducedMotion();
  const lang = useMemo(() => resolveAuthLang(), []);
  const tr = useMemo(() => createTr(sysConfig?.authI18n, lang), [sysConfig, lang]);
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
    if (reduceMotion) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py, reduceMotion]);

  const isAddAccount = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('action') === 'addAccount' ||
    new URLSearchParams(window.location.search).get('addAccount') === 'true' ||
    new URLSearchParams(window.location.search).get('addAccount') === '1'
  );

  return (
    <div
      className="relative z-10 flex min-h-full items-center justify-center px-5 py-10"
      style={{ perspective: 1200 }}
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 24, filter: "blur(12px)" }}
        animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          x: reduceMotion ? 0 : translateX,
          y: reduceMotion ? 0 : translateY,
          transformStyle: "preserve-3d",
        }}
        className="relative w-full max-w-[480px] sm:w-[480px]"
      >
        {/* Acrylic prism block */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 sm:p-10 h-[620px] sm:h-[670px] min-h-[620px] sm:min-h-[670px] max-h-[620px] sm:max-h-[670px] flex flex-col justify-between box-border"
          style={{
            background:
              "linear-gradient(145deg, rgba(16,20,46,0.72), rgba(8,10,26,0.56))",
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
                "radial-gradient(circle, rgba(255,255,255,0.05), transparent 78%)",
            }}
          />

          <div className="relative flex-1 flex flex-col justify-between">
            {/* Optional back button when adding account */}
            {isAddAccount && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.length > 1) {
                      window.history.back();
                    } else {
                      window.location.href = '/mail/u/0/#inbox';
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                  <span>{tr('backToAccount')}</span>
                </button>
              </div>
            )}

            {/* Brand header */}
            <div className="mb-6 sm:mb-7 flex flex-col items-center text-center">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
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
                {sysConfig?.title || "EpoMail"}
              </h1>
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--epo-muted)" }}
              >
                {isAddAccount ? tr('addAccountSubtitle') : tr('loginSubtitle')}
              </p>
            </div>

            <AuthForm canvasRef={canvasRef} onSwitch={onSwitch} sysConfig={sysConfig} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
