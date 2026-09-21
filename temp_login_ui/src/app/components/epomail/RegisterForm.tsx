import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2, AlertCircle, KeyRound, ChevronDown } from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";
import { cameraState } from "./cameraStore";
import { createT, resolveAuthLang } from "../../i18n/authLocale";

interface RegisterFormProps {
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
  trailingWidth,
  hasError,
  placeholder,
  disabled,
}: {
  id: string;
  type: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onKeyFeedback?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  trailing?: React.ReactNode;
  trailingWidth?: string;
  hasError?: boolean;
  placeholder?: string;
  disabled?: boolean;
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
        disabled={disabled}
        placeholder={active ? placeholder : ""}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyFeedback}
        autoComplete={type === "password" ? "new-password" : "email"}
        className="w-full bg-transparent pl-8 pt-5 pb-2 text-[15px] outline-none transition-colors duration-300 placeholder:text-slate-600 disabled:opacity-50"
        style={{
          color: hasError ? "#fef08a" : "var(--epo-ink)",
          paddingRight: trailing ? (trailingWidth || "2.5rem") : "2rem",
        }}
      />

      {trailing && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">
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

export function RegisterForm({ canvasRef, onSwitch, sysConfig: propsSysConfig }: RegisterFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [sysConfig, setSysConfig] = useState<any>(propsSysConfig || null);

  // Sync propsSysConfig whenever parent updates
  useEffect(() => {
    if (propsSysConfig) {
      setSysConfig(propsSysConfig);
    }
  }, [propsSysConfig]);

  // Always fetch fresh websiteConfig on mount to ensure real-time synchronization
  useEffect(() => {
    fetch("/api/setting/websiteConfig")
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 200 && data.data) {
          setSysConfig(data.data);
        }
      })
      .catch((err) => console.error("Failed to fetch fresh websiteConfig:", err));
  }, []);

  // Detect invite code from URL parameters (?code=... or ?regKey=... or ?invite=...)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get("code") || params.get("regKey") || params.get("invite");
      if (codeFromUrl) {
        setCode(codeFromUrl);
      }
    }
  }, []);

  const effectiveConfig = sysConfig || propsSysConfig || {};

  const lang = useMemo(() => resolveAuthLang(), []);
  const t = useMemo(() => createT(lang), [lang]);
  const reduceMotion = !!useReducedMotion();
  // 主提交按钮的 hover 抬升反馈；reduced-motion 下只保留亮度变化，不做位移
  const submitHover = reduceMotion
    ? { filter: "brightness(1.12)", transition: { duration: 0.18, ease: "easeOut" as const } }
    : {
        y: -1.5,
        filter: "brightness(1.12)",
        boxShadow: "0 14px 40px rgba(79,70,229,0.62), inset 0 1px 0 rgba(255,255,255,0.32)",
        transition: { duration: 0.18, ease: "easeOut" as const },
      };
  const rawI18n = effectiveConfig?.authI18n || {};
  const i18n = (rawI18n.zh || rawI18n.en ? rawI18n[lang] || rawI18n.en || rawI18n.zh : rawI18n) as Record<string, string>;
  const tr = (key: string, dictKey?: string) => i18n[key] || t(dictKey || key);

  // Backend specification:
  // register: 0 = OPEN (开启注册), 1 = CLOSE (关闭注册)
  const isRegisterClosed = Number(effectiveConfig?.register) === 1;

  // regKey: 0 = OPEN/REQUIRED (必填注册码), 1 = CLOSE/DISABLED (关闭注册码), 2 = OPTIONAL (选填注册码)
  const isRegKeyRequired = effectiveConfig?.regKey === 0;
  const isRegKeyOptional = effectiveConfig?.regKey === 2;
  const showCodeField = isRegKeyRequired || isRegKeyOptional || effectiveConfig?.regKey === undefined;

  // Domain selection support
  const domainOptions: string[] = Array.isArray(effectiveConfig?.domainList) ? effectiveConfig.domainList : [];
  const [selectedDomain, setSelectedDomain] = useState<string>("");

  useEffect(() => {
    if (domainOptions.length > 0 && (!selectedDomain || !domainOptions.includes(selectedDomain))) {
      setSelectedDomain(domainOptions[0]);
    }
  }, [domainOptions, selectedDomain]);

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

    if (isRegisterClosed) {
      const closedMsg =
        i18n.noNewNodes ||
        effectiveConfig?.noLandingNodes ||
        (t('regClosedNotice'));
      setErrorMsg(closedMsg);
      cameraState.authErrorOpacity = 1;
      cameraState.shakeIntensity = 20;
      return;
    }

    let cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg(t('enterEmail'));
      cameraState.authErrorOpacity = 1;
      return;
    }

    // If no domain was typed in the input and a domain is available, auto-attach it
    if (!cleanEmail.includes("@")) {
      if (selectedDomain) {
        cleanEmail = `${cleanEmail}${selectedDomain.startsWith("@") ? selectedDomain : "@" + selectedDomain}`;
      } else {
        setErrorMsg(t('enterFullEmail'));
        cameraState.authErrorOpacity = 1;
        return;
      }
    }

    if (!password) {
      setErrorMsg(t('enterPassword'));
      cameraState.authErrorOpacity = 1;
      return;
    }

    if (password.length < 6) {
      setErrorMsg(t('passwordTooShort'));
      cameraState.authErrorOpacity = 1;
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg(tr('passwordMismatch'));
      cameraState.authErrorOpacity = 1;
      canvasRef.current?.burst({ strength: 2, color: "#eab308" });
      return;
    }

    if (isRegKeyRequired && !code.trim()) {
      setErrorMsg(t('enterRegCode'));
      cameraState.authErrorOpacity = 1;
      cameraState.shakeIntensity = 15;
      return;
    }

    setStatus("warping");
    setErrorMsg("");
    canvasRef.current?.warp();

    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        password,
        code: code.trim() || undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (data.code === 200) {
          setStatus("success");
          if (data.data?.token) {
            localStorage.setItem("token", data.data.token);
          }
          cameraState.authSuccessOpacity = 1;

          let finalMsg = i18n.registerSuccess || data.message || data.msg;
          if (!finalMsg || finalMsg.toLowerCase() === "success") {
            finalMsg = t('registerSuccess');
          }
          setSuccessMsg(finalMsg);

          canvasRef.current?.burst({
            strength: 2,
            color: "#22c55e",
          });

          setTimeout(() => {
            onSwitch();
          }, 1500);
        } else {
          setStatus("idle");
          const rawErrMsg = data.message || data.msg || "";
          let friendlyMsg = rawErrMsg;

          // Map backend translation keys
          if (rawErrMsg === "regDisabled") friendlyMsg = t('regDisabled');
          else if (rawErrMsg === "emptyRegKey") friendlyMsg = t('emptyRegKey');
          else if (rawErrMsg === "notExistRegKey") friendlyMsg = t('notExistRegKey');
          else if (rawErrMsg === "noRegKeyTotal" || rawErrMsg === "noRegKeyCount") friendlyMsg = t('noRegKeyTotal');
          else if (rawErrMsg === "regKeyExpire") friendlyMsg = t('regKeyExpire');
          else if (rawErrMsg === "isRegAccount") friendlyMsg = t('isRegAccount');
          else if (rawErrMsg === "isDelAccount" || rawErrMsg === "isDelUser") friendlyMsg = t('isDelAccount');
          else if (rawErrMsg === "notEmailDomain") friendlyMsg = t('notEmailDomain');
          else if (rawErrMsg === "notEmail") friendlyMsg = t('invalidEmailFormat');
          else if (rawErrMsg === "pwdMinLength") friendlyMsg = t('passwordMinSix');
          else if (rawErrMsg === "pwdLengthLimit") friendlyMsg = t('passwordTooLong');
          else if (rawErrMsg === "banEmailPrefix") friendlyMsg = t('emailIllegalChars');
          else if (rawErrMsg === "minEmailPrefix") friendlyMsg = t('emailTooShort');
          else if (!friendlyMsg) friendlyMsg = t('registerFailed');

          // 服务端已按 Accept-Language 本地化；万一仍收到裸协议键（camelCase、无空格），
          // 兜底为通用文案，绝不把内部键名直接抛给用户。
          if (/^[A-Za-z][A-Za-z0-9_]*$/.test(friendlyMsg) && /[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(friendlyMsg)) {
            friendlyMsg = t('registerFailedCheck');
          }

          setErrorMsg(friendlyMsg);
          cameraState.authErrorOpacity = 1;
          cameraState.shakeIntensity = 20;
          canvasRef.current?.burst({ strength: 3, color: "#eab308" });
        }
      })
      .catch((err) => {
        setStatus("idle");
        setErrorMsg(t('networkErrorPrefix') + (err.message || err));
      });
  };

  const getPositionStyle = () => {
    const p = i18n.alertPosition || "top-right";
    const offset = Number(i18n.alertOffset) || 40;
    const style: React.CSSProperties = { position: "absolute" };
    if (p === "top-left") {
      style.top = `${offset}px`;
      style.left = `${offset}px`;
    } else if (p === "bottom-left") {
      style.bottom = `${offset}px`;
      style.left = `${offset}px`;
    } else if (p === "bottom-right") {
      style.bottom = `${offset}px`;
      style.right = `${offset}px`;
    } else {
      style.top = `${offset}px`;
      style.right = `${offset}px`;
    }
    return style;
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col gap-6 pt-2">
      {/* Toast Notification Container */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  key="error"
                  role="alert"
                  aria-live="assertive"
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

      {/* Closed registration prompt if disabled by admin */}
      {isRegisterClosed && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-center backdrop-blur-sm shadow-inner">
          <div className="flex items-center justify-center gap-2 text-xs font-mono font-semibold text-red-400 uppercase tracking-wider">
            <AlertCircle size={15} />
            <span>{t('regChannelClosed')}</span>
          </div>
          <p className="mt-1 text-[12px] text-red-300/80 leading-relaxed">
            {effectiveConfig?.noLandingNodes || (t('regClosedDesc'))}
          </p>
        </div>
      )}

      {/* Email Field with domain selector */}
      <FloatingField
        id="epo-email"
        type="text"
        disabled={isRegisterClosed}
        label={tr('emailLabel', 'regEmailLabel')}
        placeholder={domainOptions.length > 0 ? (t('usernameLabel')) : (t('emailPlaceholderFull'))}
        icon={<Mail size={16} strokeWidth={1.8} />}
        value={email}
        onChange={setEmail}
        hasError={!!errorMsg}
        trailingWidth={domainOptions.length > 1 ? "8.5rem" : domainOptions.length === 1 ? "7.5rem" : "2.5rem"}
        trailing={
          domainOptions.length > 1 ? (
            <div className="relative flex items-center mr-1">
              <select
                value={selectedDomain}
                disabled={isRegisterClosed}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="appearance-none bg-[#141836]/90 text-[12px] font-mono text-indigo-200 border border-indigo-500/30 rounded-lg pl-2.5 pr-6 py-1 outline-none cursor-pointer hover:border-indigo-400 focus:border-cyan-400 transition-colors shadow-inner"
              >
                {domainOptions.map((dom) => (
                  <option key={dom} value={dom} className="bg-[#0b0e24] text-white">
                    {dom}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-1.5 text-indigo-400" />
            </div>
          ) : domainOptions.length === 1 ? (
            <div className="flex items-center px-2.5 py-1 mr-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-indigo-300 select-none">
              <span>{domainOptions[0]}</span>
            </div>
          ) : undefined
        }
        onKeyFeedback={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          canvasRef.current?.burst({
            x: rect.left + rect.width * (0.3 + Math.random() * 0.4),
            y: rect.top + rect.height / 2,
          });
        }}
      />

      {/* Password Field */}
      <FloatingField
        id="epo-password"
        type={showPassword ? "text" : "password"}
        disabled={isRegisterClosed}
        label={tr('passwordLabel', 'regPasswordLabel')}
        icon={<Lock size={16} strokeWidth={1.8} />}
        value={password}
        onChange={setPassword}
        hasError={!!errorMsg}
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
            className="p-1 transition-colors hover:text-white"
            style={{ color: "var(--epo-muted)" }}
            aria-label={showPassword ? (t('hidePassword')) : (t('showPassword'))}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />

      {/* Confirm Password Field */}
      <FloatingField
        id="epo-confirm-password"
        type={showPassword ? "text" : "password"}
        disabled={isRegisterClosed}
        label={tr('confirmPasswordLabel')}
        icon={<Lock size={16} strokeWidth={1.8} />}
        value={confirmPassword}
        onChange={setConfirmPassword}
        hasError={!!errorMsg}
      />

      {/* Registration Code (Invite Key) Field */}
      {showCodeField && (
        <FloatingField
          id="epo-code"
          type="text"
          disabled={isRegisterClosed}
          label={
            isRegKeyRequired
              ? tr('codeLabel')
              : tr('codeLabelOptional')
          }
          icon={<KeyRound size={16} strokeWidth={1.8} />}
          value={code}
          onChange={setCode}
          hasError={!!errorMsg}
        />
      )}

      {/* Action / Submit Button */}
      <motion.button
        type="submit"
        whileHover={isRegisterClosed ? undefined : submitHover}
        whileTap={{ scale: isRegisterClosed ? 1 : 0.96 }}
        disabled={status !== "idle" || isRegisterClosed}
        className={`epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67e8f9] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e22] ${
          isRegisterClosed ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        }`}
        style={{
          background: isRegisterClosed ? "rgba(55, 65, 81, 0.6)" : "var(--epo-brand-gradient)",
          boxShadow: isRegisterClosed ? "none" : "0 8px 30px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
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
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
              }}
            />
          )}
        </AnimatePresence>

        <span className="relative flex items-center gap-2 font-medium">
          {isRegisterClosed ? (
            <>
              <AlertCircle size={17} /> {tr('regClosed')}
            </>
          ) : status === "idle" ? (
            <>
              {tr('initiateRegister')} <ArrowRight size={17} />
            </>
          ) : status === "warping" ? (
            <>
              <Loader2 size={17} className="animate-spin" /> {tr('warping', 'warpingReg')}
            </>
          ) : (
            <>
              <Check size={17} /> {tr('connected', 'connectedReg')}
            </>
          )}
        </span>
      </motion.button>

      {/* Switch to login link */}
      <p className="text-center text-[13px] mt-1" style={{ color: "var(--epo-muted)" }}>
        {tr('alreadyHaveNode')}{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSwitch();
          }}
          className="transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer font-medium"
          style={{ color: "var(--epo-purple-glow)" }}
        >
          {tr('loginHere')}
        </a>
      </p>
    </form>
  );
}
