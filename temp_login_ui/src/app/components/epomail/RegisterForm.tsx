import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, Loader2, AlertCircle, KeyRound, ChevronDown } from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";
import { cameraState } from "./cameraStore";

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

  const isZh = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh");
  const userLang = isZh ? "zh" : "en";
  const rawI18n = effectiveConfig?.authI18n || {};
  const i18n = rawI18n.zh || rawI18n.en ? rawI18n[userLang] || {} : rawI18n;

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
        (isZh ? "当前未开放注册通道，请联系管理员开启" : "Registration is currently disabled");
      setErrorMsg(closedMsg);
      cameraState.authErrorOpacity = 1;
      cameraState.shakeIntensity = 20;
      return;
    }

    let cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg(isZh ? "请输入邮箱地址" : "Please enter an email address");
      cameraState.authErrorOpacity = 1;
      return;
    }

    // If no domain was typed in the input and a domain is available, auto-attach it
    if (!cleanEmail.includes("@")) {
      if (selectedDomain) {
        cleanEmail = `${cleanEmail}${selectedDomain.startsWith("@") ? selectedDomain : "@" + selectedDomain}`;
      } else {
        setErrorMsg(isZh ? "请输入包含域名的完整邮箱 (如 user@domain.com)" : "Please enter a full email with domain");
        cameraState.authErrorOpacity = 1;
        return;
      }
    }

    if (!password) {
      setErrorMsg(isZh ? "请输入密码" : "Please enter a password");
      cameraState.authErrorOpacity = 1;
      return;
    }

    if (password.length < 6) {
      setErrorMsg(isZh ? "密码长度不能少于 6 位" : "Password must be at least 6 characters");
      cameraState.authErrorOpacity = 1;
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg(i18n.passwordMismatch || (isZh ? "两次输入的密码不一致" : "Passwords do not match"));
      cameraState.authErrorOpacity = 1;
      canvasRef.current?.burst({ strength: 2, color: "#eab308" });
      return;
    }

    if (isRegKeyRequired && !code.trim()) {
      setErrorMsg(isZh ? "请输入注册邀请码" : "Please enter the registration code");
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
            finalMsg = isZh ? "节点创建成功，正在前往登录..." : "Node Successfully Created, redirecting to login...";
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
          if (rawErrMsg === "regDisabled") friendlyMsg = isZh ? "注册功能已关闭" : "Registration is disabled";
          else if (rawErrMsg === "emptyRegKey") friendlyMsg = isZh ? "注册邀请码不能为空" : "Registration code is required";
          else if (rawErrMsg === "notExistRegKey") friendlyMsg = isZh ? "注册码不存在或已失效" : "Registration code not found";
          else if (rawErrMsg === "noRegKeyTotal" || rawErrMsg === "noRegKeyCount") friendlyMsg = isZh ? "注册码使用次数已耗尽" : "Registration code uses exhausted";
          else if (rawErrMsg === "regKeyExpire") friendlyMsg = isZh ? "注册码已过期" : "Registration code expired";
          else if (rawErrMsg === "isRegAccount") friendlyMsg = isZh ? "该邮箱已被注册，请直接登录" : "This email is already registered";
          else if (rawErrMsg === "isDelAccount" || rawErrMsg === "isDelUser") friendlyMsg = isZh ? "该邮箱已被注销" : "This account has been deleted";
          else if (rawErrMsg === "notEmailDomain") friendlyMsg = isZh ? "不支持该邮箱域名后缀" : "Email domain not supported";
          else if (rawErrMsg === "notEmail") friendlyMsg = isZh ? "邮箱格式不正确" : "Invalid email format";
          else if (rawErrMsg === "pwdMinLength") friendlyMsg = isZh ? "密码至少六位" : "Password must be at least 6 characters";
          else if (rawErrMsg === "pwdLengthLimit") friendlyMsg = isZh ? "密码长度超出限制" : "Password length exceeded";
          else if (rawErrMsg === "banEmailPrefix") friendlyMsg = isZh ? "邮箱名包含非法字符" : "Email prefix contains prohibited characters";
          else if (rawErrMsg === "minEmailPrefix") friendlyMsg = isZh ? "邮箱名长度不足" : "Email prefix too short";
          else if (!friendlyMsg) friendlyMsg = isZh ? "注册失败，请检查输入" : "Registration failed";

          setErrorMsg(friendlyMsg);
          cameraState.authErrorOpacity = 1;
          cameraState.shakeIntensity = 20;
          canvasRef.current?.burst({ strength: 3, color: "#eab308" });
        }
      })
      .catch((err) => {
        setStatus("idle");
        setErrorMsg((isZh ? "网络或服务连接异常: " : "Network or service error: ") + (err.message || err));
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
            <span>{isZh ? "未开放公开注册通道" : "REGISTRATION CHANNEL CLOSED"}</span>
          </div>
          <p className="mt-1 text-[12px] text-red-300/80 leading-relaxed">
            {effectiveConfig?.noLandingNodes || (isZh ? "当前节点暂未开放自主着陆注册，请联系管理员开启" : "Registration is currently closed by the administrator.")}
          </p>
        </div>
      )}

      {/* Email Field with domain selector */}
      <FloatingField
        id="epo-email"
        type="text"
        disabled={isRegisterClosed}
        label={i18n.emailLabel || (isZh ? "邮箱地址" : "EMAIL ADDRESS")}
        placeholder={domainOptions.length > 0 ? (isZh ? "用户名" : "username") : (isZh ? "邮箱地址 (user@domain.com)" : "user@domain.com")}
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
        label={i18n.passwordLabel || (isZh ? "设置登录密码" : "PASSWORD")}
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
            aria-label={showPassword ? (isZh ? "隐藏密码" : "Hide password") : (isZh ? "显示密码" : "Show password")}
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
        label={i18n.confirmPasswordLabel || (isZh ? "确认登录密码" : "CONFIRM PASSWORD")}
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
              ? i18n.codeLabel || (isZh ? "注册邀请码 (必填)" : "REGISTRATION CODE (Required)")
              : i18n.codeLabelOptional || (isZh ? "注册邀请码 (选填)" : "REGISTRATION CODE (Optional)")
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
        whileTap={{ scale: isRegisterClosed ? 1 : 0.96 }}
        disabled={status !== "idle" || isRegisterClosed}
        className={`epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white ${
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
              <AlertCircle size={17} /> {i18n.regClosed || (isZh ? "注册通道已关闭" : "Registration Closed")}
            </>
          ) : status === "idle" ? (
            <>
              {i18n.initiateRegister || (isZh ? "创建并连接节点" : "Initiate Registration")} <ArrowRight size={17} />
            </>
          ) : status === "warping" ? (
            <>
              <Loader2 size={17} className="animate-spin" /> {i18n.warping || (isZh ? "连接跃迁中…" : "Warping…")}
            </>
          ) : (
            <>
              <Check size={17} /> {i18n.connected || (isZh ? "注册成功" : "Connected")}
            </>
          )}
        </span>
      </motion.button>

      {/* Switch to login link */}
      <p className="text-center text-[13px] mt-1" style={{ color: "var(--epo-muted)" }}>
        {i18n.alreadyHaveNode || (isZh ? "已有节点坐标？" : "Already have a node?")}{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSwitch();
          }}
          className="transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer font-medium"
          style={{ color: "var(--epo-purple-glow)" }}
        >
          {i18n.loginHere || (isZh ? "返回登录" : "Login here")}
        </a>
      </p>
    </form>
  );
}
