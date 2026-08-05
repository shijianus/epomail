import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2 } from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";

interface AuthFormProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
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
}: {
  id: string;
  type: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onKeyFeedback?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"
        style={{ color: active ? "var(--epo-cyan-glow)" : "var(--epo-muted)" }}
      >
        {icon}
      </div>

      <label
        htmlFor={id}
        className="epomail-display pointer-events-none absolute left-8 transition-all duration-200"
        style={{
          top: active ? "-2px" : "50%",
          transform: active ? "translateY(0)" : "translateY(-50%)",
          fontSize: active ? "11px" : "15px",
          letterSpacing: "0.04em",
          color: active ? "var(--epo-cyan-glow)" : "var(--epo-muted)",
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
        className="w-full bg-transparent pl-8 pr-8 pt-5 pb-2 text-[15px] outline-none"
        style={{ color: "var(--epo-ink)" }}
      />

      {trailing && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          {trailing}
        </div>
      )}

      {/* Base underline */}
      <div
        className="absolute bottom-0 left-0 h-px w-full"
        style={{ background: "rgba(139,147,196,0.25)" }}
      />
      {/* Glowing underline */}
      <div
        className="absolute bottom-0 left-0 h-[2px] transition-all duration-300"
        style={{
          width: focused ? "100%" : "0%",
          background:
            "linear-gradient(90deg, var(--epo-purple-glow), var(--epo-cyan-glow))",
          boxShadow: focused
            ? "0 0 12px rgba(103,232,249,0.7)"
            : "none",
        }}
      />
    </div>
  );
}

export function AuthForm({ canvasRef }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("warping");
    canvasRef.current?.warp(); // Interactive Hook 3 — warp trigger
    
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    .then(async (res) => {
      const data = await res.json();
      if (data.code === 200) {
        setStatus("success");
        localStorage.setItem('token', data.data?.token || data.token);
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setStatus("idle");
        alert(data.msg || 'Login failed');
      }
    })
    .catch(() => {
      setStatus("idle");
      alert('Login error');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7">
      <FloatingField
        id="epo-email"
        type="email"
        label="EMAIL"
        icon={<Mail size={16} strokeWidth={1.8} />}
        value={email}
        onChange={setEmail}
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
        label="PASSWORD"
        icon={<Lock size={16} strokeWidth={1.8} />}
        value={password}
        onChange={setPassword}
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
          Stay in orbit
        </label>
        <a
          href="#"
          className="text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)]"
          style={{ color: "var(--epo-muted)" }}
        >
          Forgot password?
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
              Initiate Login <ArrowRight size={17} />
            </>
          )}
          {status === "warping" && (
            <>
              <Loader2 size={17} className="animate-spin" /> Warping…
            </>
          )}
          {status === "success" && (
            <>
              <Check size={17} /> Connected
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
          or continue with
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
        New to the canvas?{" "}
        <a
          href="#"
          className="transition-colors hover:text-[var(--epo-cyan-glow)]"
          style={{ color: "var(--epo-purple-glow)" }}
        >
          Create a node
        </a>
      </p>
    </form>
  );
}
