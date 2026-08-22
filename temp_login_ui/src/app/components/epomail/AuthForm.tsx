import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2, AlertCircle } from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";
import { cameraState } from "./cameraStore";

interface AuthFormProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
  onSwitch: () => void;
  sysConfig?: any;
}

type Status = "idle" | "warping" | "success";

function FloatingField({
  id,
  type,
  label,
  icon,
  value,
  onChange,
  onKeyFeedback,
  trailing,
  hasError,
}: {
  id: string;
  type: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onKeyFeedback?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  trailing?: React.ReactNode;
  hasError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 transition-colors duration-300"
        style={{ color: hasError ? "#eab308" : active ? "var(--epo-cyan-glow)" : "var(--epo-muted)" }}
      >
        {icon}
      </div>

      <label
        htmlFor={id}
        className="epomail-display pointer-events-none absolute left-8 transition-all duration-300"
        style={{
          top: active ? "-2px" : "50%",
          transform: active ? "translateY(0)" : "translateY(-50%)",
          fontSize: active ? "11px" : "15px",
          letterSpacing: "0.04em",
          color: hasError ? "#eab308" : active ? "var(--epo-cyan-glow)" : "var(--epo-muted)",
        }}
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyFeedback}
        autoComplete={type === "password" ? "current-password" : "email"}
        className="w-full bg-transparent pl-8 pr-8 pt-5 pb-2 text-[15px] outline-none transition-colors duration-300"
        style={{ color: hasError ? "#fef08a" : "var(--epo-ink)" }}
      />

      {trailing && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          {trailing}
        </div>
      )}

      {/* Base underline */}
      <div
        className="absolute bottom-0 left-0 h-px w-full transition-colors duration-300"
        style={{ background: hasError ? "rgba(234,179,8,0.3)" : "rgba(139,147,196,0.25)" }}
      />
      {/* Glowing underline */}
      <div
        className="absolute bottom-0 left-0 h-[2px] transition-all duration-300"
        style={{
          width: hasError || focused ? "100%" : "0%",
          background: hasError
            ? "linear-gradient(90deg, #eab308, #facc15)"
            : "linear-gradient(90deg, var(--epo-purple-glow), var(--epo-cyan-glow))",
          boxShadow: hasError
            ? "0 0 15px rgba(234,179,8,0.6)"
            : focused
            ? "0 0 12px rgba(103,232,249,0.7)"
            : "none",
        }}
      />
    </div>
  );
}

export function AuthForm({ canvasRef, onSwitch, sysConfig }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isZh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh');
  const userLang = isZh ? 'zh' : 'en';
  const rawI18n = sysConfig?.authI18n || {};
  const i18n = (rawI18n.zh || rawI18n.en) ? (rawI18n[userLang] || {}) : rawI18n;

  useEffect(() => {
    if (errorMsg) {
      const duration = Number(i18n.alertDuration) || 4000;
      const timer = setTimeout(() => setErrorMsg(""), duration);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, i18n.alertDuration]);

  useEffect(() => {
    if (successMsg) {
      const duration = Number(i18n.alertDuration) || 4000;
      const timer = setTimeout(() => setSuccessMsg(""), duration);
      return () => clearTimeout(timer);
    }
  }, [successMsg, i18n.alertDuration]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("warping");
    setErrorMsg("");
    canvasRef.current?.warp(); // Interactive Hook 3 — warp trigger
    
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    .then(async (res) => {
      const data = await res.json();
      if (data.code === 200) {
        setStatus("connected");
        setSuccessMsg(i18n.loginSuccess || (isZh ? "成功连结节点" : "Node Link Established"));
        canvasRef.current?.pulseGlow();
        setTimeout(() => {
          localStorage.setItem('token', data.data?.token || data.token);
          window.location.href = '/inbox';
        }, 1200);
      } else {
        setStatus("idle");
        setErrorMsg(i18n.invalidCredentials || data.message || (isZh ? "填写的坐标不存在" : "Specified coordinates do not exist"));
        
        cameraState.authErrorOpacity = 1; // Trigger global yellow warning HUD
        cameraState.shakeIntensity = 20; // Reusing shake from existing knockback logic
        
        // Original error visual effects
        canvasRef.current?.burst({
          strength: 3,
          color: "#eab308", // Yellow burst
        });
      }
    })
    .catch((err) => {
      setStatus("idle");
      setErrorMsg((isZh ? '连结错误: ' : 'Link error: ') + (err.message || err));
    });
  };

  const getPositionStyle = () => {
    const p = i18n.alertPosition || 'top-right';
    const offset = Number(i18n.alertOffset) || 40;
    const style: React.CSSProperties = { position: 'absolute' };
    if (p === 'top-left') {
      style.top = `${offset}px`;
      style.left = `${offset}px`;
    } else if (p === 'bottom-left') {
      style.bottom = `${offset}px`;
      style.left = `${offset}px`;
    } else if (p === 'bottom-right') {
      style.bottom = `${offset}px`;
      style.right = `${offset}px`;
    } else {
      style.top = `${offset}px`;
      style.right = `${offset}px`;
    }
    return style;
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col gap-7 pt-4">
      {/* Toast Notification Container */}
      {typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={getPositionStyle()}
              >
                <div className="flex items-center gap-3 rounded-lg bg-yellow-950/40 border border-yellow-500/40 px-6 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                  <AlertCircle size={18} className="text-yellow-400" />
                  <span className="text-sm sm:text-base font-medium tracking-wide text-yellow-300/90">{errorMsg}</span>
                </div>
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={getPositionStyle()}
              >
                <div className="flex items-center gap-3 rounded-lg bg-green-950/40 border border-green-500/40 px-6 py-3 backdrop-blur-md shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                  <Check size={18} className="text-green-400" />
                  <span className="text-sm sm:text-base font-medium tracking-wide text-green-300/90">{successMsg}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}

      <FloatingField
        id="epo-email"
        type="email"
        label={i18n.emailLabel || "EMAIL"}
        icon={<Mail size={16} strokeWidth={1.8} />}
        value={email}
        onChange={setEmail}
        hasError={!!errorMsg}
        onKeyFeedback={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          canvasRef.current?.burst({
            x: rect.left + rect.width * (0.3 + Math.random() * 0.4),
            y: rect.top + rect.height / 2,
          });
        }}
      />

      <FloatingField
        id="epo-password"
        type={showPassword ? "text" : "password"}
        label={i18n.passwordLabel || "PASSWORD"}
        icon={<Lock size={16} strokeWidth={1.8} />}
        value={password}
        onChange={setPassword}
        hasError={!!errorMsg}
        // Interactive Hook 2 — every keystroke triggers a nova burst.
        onKeyFeedback={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          canvasRef.current?.burst({
            strength: 1.4,
            x: rect.left + rect.width * (0.3 + Math.random() * 0.4),
            y: rect.top + rect.height / 2,
          });
        }}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="p-1 transition-colors"
            style={{ color: "var(--epo-muted)" }}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />

      <div className="flex items-center justify-between">
        <label
          className="flex cursor-pointer items-center gap-2 text-[13px]"
          style={{ color: "var(--epo-muted)" }}
        >
          <input type="checkbox" className="accent-[var(--epo-purple-glow)]" />
          {i18n.stayInOrbit || "Stay in orbit"}
        </label>
        <a
          href="#"
          className="text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)]"
          style={{ color: "var(--epo-muted)" }}
        >
          {i18n.forgotPassword || "Forgot password?"}
        </a>
      </div>

      {/* Warp / activation button (Interactive Hook 3) */}
      <motion.button
        type="submit"
        whileTap={{ scale: 0.96 }}
        disabled={status !== "idle"}
        className="epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white"
        style={{
          background: "var(--epo-brand-gradient)",
          boxShadow:
            "0 8px 30px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {/* Sheen sweep during warp */}
        <AnimatePresence>
          {status === "warping" && (
            <motion.span
              className="absolute inset-0"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
              }}
            />
          )}
        </AnimatePresence>

        <span className="relative flex items-center gap-2">
          {status === "idle" && (
            <>
              {i18n.initiateLogin || "Initiate Login"} <ArrowRight size={17} />
            </>
          )}
          {status === "warping" && (
            <>
              <Loader2 size={17} className="animate-spin" /> {i18n.warping || "Warping…"}
            </>
          )}
          {status === "success" && (
            <>
              <Check size={17} /> {i18n.connected || "Connected"}
            </>
          )}
        </span>
      </motion.button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{ background: "rgba(139,147,196,0.2)" }}
        />
        <span className="text-[12px]" style={{ color: "var(--epo-muted)" }}>
          {i18n.orContinueWith || "or continue with"}
        </span>
        <div
          className="h-px flex-1"
          style={{ background: "rgba(139,147,196,0.2)" }}
        />
      </div>

      {/* SSO glass chips */}
      <div className="grid grid-cols-2 gap-3">
        {["Google", "GitHub"].map((provider) => (
          <button
            key={provider}
            type="button"
            className="epomail-display flex h-11 items-center justify-center gap-2 rounded-xl border text-[13px] transition-colors"
            style={{
              borderColor: "rgba(139,147,196,0.25)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--epo-ink)",
            }}
          >
            {provider}
          </button>
        ))}
      </div>

      <p className="text-center text-[13px]" style={{ color: "var(--epo-muted)" }}>
        {i18n.newToCanvas || "New to the canvas?"}{" "}
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); onSwitch(); }}
          className="transition-colors hover:text-[var(--epo-cyan-glow)]"
          style={{ color: "var(--epo-purple-glow)" }}
        >
          {i18n.exploreNode || (isZh ? "探索节点" : "Explore Node")}
        </a>
      </p>
    </form>
  );
}
