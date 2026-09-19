import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Smartphone,
  HelpCircle
} from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";
import { cameraState } from "./cameraStore";

// 登录成功后把语言偏好同步给主应用（仅当主应用尚无语言设置时写入，避免覆盖用户既有选择）
function syncLangToMainApp() {
  try {
    const raw = localStorage.getItem('setting');
    const setting = raw ? JSON.parse(raw) : null;
    if (setting && setting.lang) return;
    const nav = ((typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase();
    const lang = /^(zh-tw|zh-hk|zh-mo|zh-hant)/.test(nav) ? 'zh-Hant'
      : nav.startsWith('zh') ? 'zh'
      : nav.startsWith('fr') ? 'fr'
      : nav.startsWith('es') ? 'es'
      : nav.startsWith('nl') ? 'nl'
      : 'en';
    localStorage.setItem('setting', JSON.stringify({ ...(setting || {}), lang }));
  } catch { /* 主应用设置不可解析时不干预 */ }
}

interface AuthFormProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
  onSwitch: () => void;
  sysConfig?: any;
}

type Stage = "password" | "totp";
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
        autoComplete={type === "password" ? "current-password" : type === "email" ? "email" : "off"}
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
  const [stage, setStage] = useState<Stage>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");
  const [totpDigits, setTotpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [backupCode, setBackupCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [passkeyChallenge, setPasskeyChallenge] = useState("");
  const [passkeysList, setPasskeysList] = useState<any[]>([]);
  const [otpShake, setOtpShake] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [secondsLeftInPeriod, setSecondsLeftInPeriod] = useState(30);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [stayInOrbit, setStayInOrbit] = useState(false);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isZh = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh');
  const userLang = isZh ? 'zh' : 'en';
  const rawI18n = sysConfig?.authI18n || {};
  const i18n = (rawI18n.zh || rawI18n.en) ? (rawI18n[userLang] || {}) : rawI18n;

  // 30s TOTP period countdown
  useEffect(() => {
    if (stage !== "totp") return;
    const updatePeriod = () => {
      const elapsed = Math.floor(Date.now() / 1000) % 30;
      setSecondsLeftInPeriod(30 - elapsed);
    };
    updatePeriod();
    const timer = setInterval(updatePeriod, 1000);
    return () => clearInterval(timer);
  }, [stage]);

  // 挂载时检测登录凭证失效提示及自动回填上次登录邮箱
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const isExpired = searchParams.get("reason") === "expired" || searchParams.get("expired") === "true";
      const storedMsg = sessionStorage.getItem("auth_expired_msg");

      if (isExpired || storedMsg) {
        const msg = storedMsg || (isZh ? "登录凭证已过期，请重新登录" : "Session expired, please log in again");
        setErrorMsg(msg);
        sessionStorage.removeItem("auth_expired_msg");
        cameraState.authErrorOpacity = 1;
      }

      const urlEmail = searchParams.get("email");
      const storedEmail = localStorage.getItem("loginEmail");
      if (urlEmail) {
        setEmail(urlEmail);
      } else if (storedEmail) {
        setEmail(storedEmail);
      }
    }
  }, [isZh]);

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

  // Focus first OTP input when switching to TOTP stage
  useEffect(() => {
    if (stage === "totp" && !isBackupCode) {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [stage, isBackupCode]);

  const mapErrorMessage = (rawMsg: string) => {
    if (!rawMsg) return isZh ? "验证失败" : "Verification failed";
    if (rawMsg === "totpSessionExpired" || rawMsg.includes("过期")) {
      return isZh ? "两步验证会话已过期，请重新登录" : "2FA session expired, please log in again";
    }
    if (rawMsg === "totpTooManyAttempts" || rawMsg.includes("过多")) {
      return isZh ? "尝试次数过多，请重新登录" : "Too many attempts, please log in again";
    }
    if (rawMsg === "totpCodeInvalid" || rawMsg.includes("验证码错误")) {
      return isZh ? "验证码错误，请重新输入" : "Invalid verification code, please try again";
    }
    if (rawMsg === "backupCodeInvalid" || rawMsg.includes("备用代码")) {
      return isZh ? "备用代码无效或已被使用" : "Invalid or already used backup code";
    }
    if (rawMsg === "totpCodeReplay" || rawMsg.includes("已使用")) {
      return isZh ? "验证码已被使用，请等待 30 秒后输入新码" : "Code already used, please wait for next code";
    }
    if (rawMsg === "accountLocked" || rawMsg.includes("锁定")) {
      return isZh ? "连续错误次数过多，账号已锁定 12 小时" : "Account locked for 12 hours due to too many failed attempts";
    }
    return rawMsg;
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("warping");
    setErrorMsg("");
    canvasRef.current?.warp();

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    .then(async (res) => {
      const data = await res.json();
      if (data.code === 200) {
        // Check if 2FA is required
        if (data.data?.mfaRequired || data.mfaRequired) {
          setTempToken(data.data?.tempToken || data.tempToken);
          setMfaEmail(data.data?.email || data.email || email);
          const pks = data.data?.passkeys || data.passkeys || [];
          const hasPk = Boolean(data.data?.hasPasskeys || (pks && pks.length > 0));
          setHasPasskeys(hasPk);
          setPasskeysList(pks);
          setPasskeyChallenge(data.data?.passkeyChallenge || data.passkeyChallenge || '');
          setStage("totp");
          setStatus("idle");
          setTotpDigits(["", "", "", "", "", ""]);
          setBackupCode("");
          setIsBackupCode(false);
          setShowHelp(false);
          setErrorMsg("");
          // 连续性星际巡航平滑降速与高能青光脉冲
          cameraState.vzTarget = 1.35;
          canvasRef.current?.pulse({ color: "cyan", strength: 2.2 });
          return;
        }

        // Direct Login Success
        const token = data.data?.token || data.token;
        if (token) {
          localStorage.setItem('token', token);
        }
        const activeEmail = data.data?.email || (email.includes('@') ? email.trim().toLowerCase() : '');
        if (activeEmail && stayInOrbit) {
          localStorage.setItem('loginEmail', activeEmail);
        }
        if (activeEmail && !stayInOrbit) {
          localStorage.removeItem('loginEmail');
        }
        syncLangToMainApp();
        setStatus("success");
        cameraState.authSuccessOpacity = 1;
        let finalMsg = i18n.loginSuccess || data.message || data.msg;
        if (!finalMsg || finalMsg.toLowerCase() === 'success') {
          finalMsg = isZh ? "成功连结节点" : "Node Link Established";
        }
        setSuccessMsg(finalMsg);
        canvasRef.current?.pulse({ strength: 2 });
        canvasRef.current?.burst({ strength: 2 });
        setTimeout(() => {
          window.location.href = '/inbox';
        }, 800);
      } else {
        setStatus("idle");
        const mappedError = mapErrorMessage(data.message || data.msg);
        setErrorMsg(mappedError || i18n.invalidCredentials || (isZh ? "填写的坐标不存在" : "Specified coordinates do not exist"));

        cameraState.authErrorOpacity = 1;
        cameraState.shakeIntensity = 20;

        canvasRef.current?.burst({
          strength: 3,
          color: "#eab308",
        });
      }
    })
    .catch((err) => {
      setStatus("idle");
      setErrorMsg((isZh ? '连结错误: ' : 'Link error: ') + (err.message || err));
    });
  };

  const handleLoginSuccess = (data: any) => {
    const token = data.data?.token || data.token;
    if (token) {
      localStorage.setItem('token', token);
    }
    const activeEmail = data.data?.email || (email.includes('@') ? email.trim().toLowerCase() : '');
    if (activeEmail && stayInOrbit) {
      localStorage.setItem('loginEmail', activeEmail);
    }
    if (activeEmail && !stayInOrbit) {
      localStorage.removeItem('loginEmail');
    }
    syncLangToMainApp();
    setStatus("success");
    cameraState.authSuccessOpacity = 1;
    setSuccessMsg(isZh ? "两步验证成功，正在进入…" : "2FA Verified, entering…");
    canvasRef.current?.pulse({ strength: 2.2, color: "cyan" });
    canvasRef.current?.burst({ strength: 2.5, color: "cyan" });
    setTimeout(() => {
      window.location.href = '/inbox';
    }, 800);
  };

  const triggerTotpSubmit = (overrideCode?: string, overrideIsBackup?: boolean) => {
    if (status !== "idle") return;

    const currentIsBackup = overrideIsBackup !== undefined ? overrideIsBackup : isBackupCode;
    const code = overrideCode !== undefined 
      ? overrideCode.trim() 
      : (currentIsBackup ? backupCode.trim() : totpDigits.join("").trim());

    if (!code) {
      setErrorMsg(isZh ? "请输入验证码" : "Please enter verification code");
      return;
    }

    setStatus("warping");
    setErrorMsg("");
    canvasRef.current?.warp();

    fetch('/api/login/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempToken,
        code,
        isBackupCode: currentIsBackup
      })
    })
    .then(async (res) => {
      const data = await res.json();
      if (data.code === 200) {
        handleLoginSuccess(data);
      } else {
        setStatus("idle");
        const errorText = mapErrorMessage(data.message || data.msg);
        setErrorMsg(errorText);

        // 空间物理联动：抖动 + 错误光斑 + 粒子消散
        setOtpShake(true);
        cameraState.authErrorOpacity = 1;
        cameraState.shakeIntensity = 18;
        canvasRef.current?.burst({
          strength: 2.2,
          color: "purple",
        });

        // 抖动 380ms 结束后自动清空并重聚第 1 格（非备用码模式）
        setTimeout(() => {
          setOtpShake(false);
          if (!currentIsBackup) {
            setTotpDigits(["", "", "", "", "", ""]);
            otpInputRefs.current[0]?.focus();
          }
        }, 380);
      }
    })
    .catch((err) => {
      setStatus("idle");
      setErrorMsg((isZh ? '验证错误: ' : 'Verification error: ') + (err.message || err));
    });
  };

  const handleTotpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerTotpSubmit();
  };

  const handlePasskeyLogin = async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !passkeyChallenge) {
      setErrorMsg(isZh ? "当前环境暂不支持通行密钥" : "Passkeys not supported in this browser");
      return;
    }

    try {
      setStatus("warping");
      setErrorMsg("");
      canvasRef.current?.warp();

      const rawChallenge = atob(passkeyChallenge.replace(/-/g, '+').replace(/_/g, '/'));
      const challengeBytes = new Uint8Array(rawChallenge.length);
      for (let i = 0; i < rawChallenge.length; i++) {
        challengeBytes[i] = rawChallenge.charCodeAt(i);
      }

      const allowCredentials = (passkeysList || []).map((pk: any) => {
        const rawId = atob(pk.id.replace(/-/g, '+').replace(/_/g, '/'));
        const idBytes = new Uint8Array(rawId.length);
        for (let i = 0; i < rawId.length; i++) {
          idBytes[i] = rawId.charCodeAt(i);
        }
        return {
          id: idBytes,
          type: 'public-key' as const
        };
      });

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          timeout: 60000,
          userVerification: 'preferred',
          allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined
        }
      }) as any;

      if (!credential) {
        setStatus("idle");
        return;
      }

      const bufferToBase64 = (buf: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };

      const clientDataJSON = bufferToBase64(credential.response.clientDataJSON);
      const authenticatorData = bufferToBase64(credential.response.authenticatorData);
      const signature = bufferToBase64(credential.response.signature);

      const res = await fetch('/api/login/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken,
          isPasskey: true,
          credentialId: credential.id,
          clientDataJSON,
          authenticatorData,
          signature
        })
      });
      const data = await res.json();
      if (data.code === 200) {
        handleLoginSuccess(data);
      } else {
        setStatus("idle");
        setErrorMsg(mapErrorMessage(data.message || data.msg));
        cameraState.authErrorOpacity = 1;
        cameraState.shakeIntensity = 18;
        canvasRef.current?.burst({ color: "purple", strength: 2.2 });
      }
    } catch (err: any) {
      setStatus("idle");
      if (err.name !== 'NotAllowedError') {
        setErrorMsg(err.message || (isZh ? "安全密钥验证失败" : "Security key verification failed"));
      }
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const updated = [...totpDigits];
      updated[index] = "";
      setTotpDigits(updated);
      return;
    }

    // Handle multi-character paste or typed string
    if (clean.length > 1) {
      const digits = clean.slice(0, 6).split("");
      const updated = [...totpDigits];
      digits.forEach((d, i) => {
        if (i < 6) updated[i] = d;
      });
      setTotpDigits(updated);
      if (digits.length === 6) {
        setTimeout(() => {
          triggerTotpSubmit(digits.join(""), false);
        }, 120);
      } else {
        const nextFocus = Math.min(digits.length, 5);
        otpInputRefs.current[nextFocus]?.focus();
      }
      return;
    }

    const updated = [...totpDigits];
    updated[index] = clean[0];
    setTotpDigits(updated);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // 满 6 位自动提交（延迟 120ms 允许用户感知最后一格点亮）
    if (updated.every(d => d.length === 1)) {
      setTimeout(() => {
        triggerTotpSubmit(updated.join(""), false);
      }, 120);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !totpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    const colors: ("purple" | "indigo" | "cyan")[] = ["purple", "purple", "indigo", "indigo", "cyan", "cyan"];
    const rect = e.currentTarget.getBoundingClientRect();
    canvasRef.current?.burst({
      strength: 1.0 + index * 0.25,
      color: colors[Math.min(index, 5)],
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const digits = pasted.split("");
      const updated = [...totpDigits];
      digits.forEach((d, i) => {
        if (i < 6) updated[i] = d;
      });
      setTotpDigits(updated);
      if (digits.length === 6) {
        setTimeout(() => {
          triggerTotpSubmit(digits.join(""), false);
        }, 120);
      } else {
        const nextFocus = Math.min(digits.length, 5);
        otpInputRefs.current[nextFocus]?.focus();
      }
    }
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
    <div className="relative">
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
                  <AlertCircle size={18} className="text-yellow-400 shrink-0" />
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
                  <Check size={18} className="text-green-400 shrink-0" />
                  <span className="text-sm sm:text-base font-medium tracking-wide text-green-300/90">{successMsg}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}

      <motion.div
        layout
        transition={{
          layout: { type: "spring", stiffness: 320, damping: 30 },
        }}
        className="relative"
      >
        <AnimatePresence mode="wait">
          {stage === "password" ? (
            /* =========================================================================
               STAGE 1: PASSWORD LOGIN FORM
               ========================================================================= */
            <motion.form
              key="password-form"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handlePasswordSubmit}
              className="flex flex-col gap-7 pt-4"
            >
              <FloatingField
                id="epo-email"
                type="email"
                label={i18n.emailLabel || (isZh ? "邮箱地址" : "EMAIL")}
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
                label={i18n.passwordLabel || (isZh ? "登录密码" : "PASSWORD")}
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
                    className="p-1 transition-colors"
                    style={{ color: "var(--epo-muted)" }}
                    aria-label={showPassword ? (isZh ? "隐藏密码" : "Hide password") : (isZh ? "显示密码" : "Show password")}
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
                  <input type="checkbox" checked={stayInOrbit} onChange={(e) => setStayInOrbit(e.target.checked)} className="accent-[var(--epo-purple-glow)]" />
                  {i18n.stayInOrbit || (isZh ? "保持轨道连接" : "Stay in orbit")}
                </label>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setErrorMsg(i18n.forgotPasswordHint || (isZh ? "请联系站长在管理后台为你重置密码" : "Please contact the site administrator to reset your password."));
                  }}
                  className="text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)]"
                  style={{ color: "var(--epo-muted)" }}
                >
                  {i18n.forgotPassword || (isZh ? "忘记密码？" : "Forgot password?")}
                </a>
              </div>

              <motion.button
                type="submit"
                whileTap={{ scale: 0.96 }}
                disabled={status !== "idle"}
                className="epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white cursor-pointer"
                style={{
                  background: "var(--epo-brand-gradient)",
                  boxShadow:
                    "0 8px 30px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
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
                      {i18n.initiateLogin || (isZh ? "登录" : "Initiate Login")} <ArrowRight size={17} />
                    </>
                  )}
                  {status === "warping" && (
                    <>
                      <Loader2 size={17} className="animate-spin" /> {i18n.warping || (isZh ? "验证中…" : "Warping…")}
                    </>
                  )}
                  {status === "success" && (
                    <>
                      <Check size={17} /> {i18n.connected || (isZh ? "已连接" : "Connected")}
                    </>
                  )}
                </span>
              </motion.button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
                <span className="text-[12px]" style={{ color: "var(--epo-muted)" }}>
                  {i18n.orContinueWith || (isZh ? "或通过以下方式继续" : "or continue with")}
                </span>
                <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {["Google", "GitHub"].map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setErrorMsg(i18n.oauthComingSoon || (isZh ? "第三方登录尚未开放，敬请期待" : "Third-party sign-in is coming soon."))}
                    className="epomail-display flex h-11 items-center justify-center gap-2 rounded-xl border text-[13px] transition-colors cursor-pointer"
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
                {i18n.newToCanvas || (isZh ? "还没有接入画布？" : "New to the canvas?")}{" "}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onSwitch(); }}
                  className="transition-colors hover:text-[var(--epo-cyan-glow)]"
                  style={{ color: "var(--epo-purple-glow)" }}
                >
                  {i18n.exploreNode || (isZh ? "探索节点" : "Explore Node")}
                </a>
              </p>
            </motion.form>
          ) : (
            /* =========================================================================
               STAGE 2: TWO-FACTOR AUTHENTICATION (TOTP / BACKUP CODE / PASSKEY)
               ========================================================================= */
            <motion.form
              key="totp-form"
              initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 14, filter: "blur(4px)" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleTotpSubmit}
              className="flex flex-col gap-5 pt-1"
            >
              {/* Back button */}
              <button
                type="button"
                onClick={() => {
                  setStage("password");
                  setStatus("idle");
                  setErrorMsg("");
                  setShowHelp(false);
                }}
                className="flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer self-start"
                style={{ color: "var(--epo-muted)" }}
              >
                <ArrowLeft size={15} /> {isZh ? "返回重新输入密码" : "Back to password login"}
              </button>

              {/* Optional Passkey Quick Unlock Button */}
              {hasPasskeys && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handlePasskeyLogin}
                  disabled={status !== "idle"}
                  className="group relative flex w-full items-center justify-center gap-2.5 rounded-xl border border-indigo-500/35 bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-cyan-500/15 p-3 text-[13px] font-medium text-indigo-200 transition-all hover:border-cyan-400/50 hover:text-white hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] cursor-pointer"
                >
                  <KeyRound size={16} className="text-cyan-400 transition-transform group-hover:rotate-12" />
                  <span>{isZh ? "使用通行密钥 (Passkey / 指纹) 一键验证" : "Verify with Passkey / Security Key"}</span>
                </motion.button>
              )}

              {/* 2FA Header card banner */}
              <div className="flex flex-col items-center text-center gap-2 rounded-2xl p-4 border border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  {isBackupCode ? <KeyRound size={20} /> : <ShieldCheck size={20} />}
                </div>
                <h2 className="text-[16px] font-semibold text-[var(--epo-ink)] tracking-wide">
                  {isBackupCode
                    ? (isZh ? "使用备用代码验证" : "Backup Code Verification")
                    : (isZh ? "两步身份验证 (2FA)" : "Two-Factor Authentication")}
                </h2>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--epo-muted)" }}>
                  {isBackupCode
                    ? (isZh ? "请输入启用 2FA 时保存的 8 位应急备用代码" : "Enter one of your 8-character recovery backup codes")
                    : (isZh ? "请输入身份验证器 App 生成的 6 位动态验证码" : "Enter the 6-digit code from your authenticator app")}
                </p>
                {mfaEmail && (
                  <div className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[rgba(103,232,249,0.1)] text-[var(--epo-cyan-glow)] border border-[rgba(103,232,249,0.25)]">
                    {mfaEmail}
                  </div>
                )}
              </div>

              {/* Input Segment with 3D Flip Transition */}
              <AnimatePresence mode="wait">
                {!isBackupCode ? (
                  /* 6-box Segmented OTP Input */
                  <motion.div
                    key="otp-segment"
                    initial={{ opacity: 0, rotateX: -12, scale: 0.98 }}
                    animate={{
                      opacity: 1,
                      rotateX: 0,
                      scale: 1,
                      x: otpShake ? [-8, 8, -6, 6, -3, 3, 0] : 0,
                    }}
                    exit={{ opacity: 0, rotateX: 12, scale: 0.98 }}
                    transition={{
                      duration: 0.28,
                      ease: "easeOut",
                      x: { duration: 0.38, ease: "easeInOut" }
                    }}
                    className="flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      {totpDigits.map((digit, idx) => (
                        <div key={idx} className="flex items-center">
                          {idx === 3 && (
                            <span className="mx-1 text-[var(--epo-muted)] opacity-40 font-mono text-sm select-none">
                              -
                            </span>
                          )}
                          <input
                            ref={(el) => (otpInputRefs.current[idx] = el)}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            autoComplete={idx === 0 ? "one-time-code" : "off"}
                            value={digit}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                            onPaste={handleOtpPaste}
                            className="w-10 h-12 sm:w-11 sm:h-13 flex items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] border text-center text-xl font-bold transition-all outline-none"
                            style={{
                              borderColor: errorMsg
                                ? "rgba(234,179,8,0.6)"
                                : digit
                                ? "var(--epo-cyan-glow)"
                                : idx === 0 && !digit
                                ? "rgba(103,232,249,0.4)"
                                : "rgba(139,147,196,0.25)",
                              color: errorMsg ? "#fef08a" : "var(--epo-ink)",
                              boxShadow: digit
                                ? "0 0 14px rgba(103,232,249,0.35)"
                                : idx === 0 && !digit
                                ? "0 0 8px rgba(103,232,249,0.15)"
                                : "none",
                              backgroundColor: errorMsg
                                ? "rgba(234,179,8,0.05)"
                                : "rgba(255,255,255,0.04)",
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* 30s Period indicator and help toggle */}
                    <div className="flex items-center justify-between px-1 text-[11px]" style={{ color: "var(--epo-muted)" }}>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                          <svg className="h-full w-full -rotate-90" viewBox="0 0 20 20">
                            <circle
                              cx="10"
                              cy="10"
                              r="8"
                              fill="none"
                              stroke="rgba(139,147,196,0.2)"
                              strokeWidth="2.5"
                            />
                            <circle
                              cx="10"
                              cy="10"
                              r="8"
                              fill="none"
                              stroke={secondsLeftInPeriod <= 5 ? "#eab308" : "var(--epo-cyan-glow)"}
                              strokeWidth="2.5"
                              strokeDasharray="50.26"
                              strokeDashoffset={50.26 * (1 - secondsLeftInPeriod / 30)}
                              className="transition-all duration-1000 ease-linear"
                            />
                          </svg>
                        </div>
                        <span>
                          {secondsLeftInPeriod <= 5
                            ? (isZh ? `口令即将刷新 (${secondsLeftInPeriod}s)` : `Refreshing soon (${secondsLeftInPeriod}s)`)
                            : (isZh ? `动态口令周期 (${secondsLeftInPeriod}s)` : `Code period (${secondsLeftInPeriod}s)`)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className="flex items-center gap-1 hover:text-[var(--epo-cyan-glow)] transition-colors cursor-pointer"
                      >
                        <HelpCircle size={12} />
                        <span>{isZh ? "无法验证？" : "Having trouble?"}</span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  /* Backup Code Input with 3D Flip */
                  <motion.div
                    key="backup-segment"
                    initial={{ opacity: 0, rotateX: 12, scale: 0.98 }}
                    animate={{
                      opacity: 1,
                      rotateX: 0,
                      scale: 1,
                      x: otpShake ? [-8, 8, -6, 6, -3, 3, 0] : 0,
                    }}
                    exit={{ opacity: 0, rotateX: -12, scale: 0.98 }}
                    transition={{
                      duration: 0.28,
                      ease: "easeOut",
                      x: { duration: 0.38, ease: "easeInOut" }
                    }}
                    className="flex flex-col gap-2.5"
                  >
                    <FloatingField
                      id="epo-backup-code"
                      type="text"
                      label={isZh ? "备用代码 (XXXX-XXXX)" : "RECOVERY CODE (XXXX-XXXX)"}
                      icon={<KeyRound size={16} strokeWidth={1.8} />}
                      value={backupCode}
                      onChange={(val) => {
                        let cleaned = val.toUpperCase().replace(/[^0-9A-Z]/g, '');
                        if (cleaned.length > 4) {
                          cleaned = cleaned.slice(0, 4) + '-' + cleaned.slice(4, 8);
                        }
                        setBackupCode(cleaned.slice(0, 9));
                      }}
                      hasError={!!errorMsg}
                      onKeyFeedback={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        canvasRef.current?.burst({
                          strength: 1.2,
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2,
                        });
                      }}
                    />
                    <p className="text-center text-[11px]" style={{ color: "var(--epo-muted)" }}>
                      {isZh ? "每组备用代码仅可使用一次，核销后自动作废" : "Single-use recovery code. Inactivated immediately after login."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Troubleshooting Drawer Card */}
              <AnimatePresence>
                {showHelp && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden rounded-xl border border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] p-3 text-[11px] leading-relaxed backdrop-blur-sm"
                    style={{ color: "var(--epo-muted)" }}
                  >
                    <p className="font-medium text-[var(--epo-ink)] mb-1">
                      {isZh ? "两步验证排查建议：" : "2FA Troubleshooting:"}
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>{isZh ? "请确认手机时间已开启「自动同步」，与标准网络时间一致（时钟偏差是验证失败的主要原因）。" : "Ensure phone time is set to 'Automatic' and matches standard network time."}</li>
                      <li>{isZh ? "若验证器应用丢失，可切换为「应急备用代码」紧急登录。" : "If authenticator is lost, switch to Backup Code below to recover access."}</li>
                      <li>{isZh ? "如无可用代码，请联系系统管理员申请两步验证重置。" : "Contact your administrator to request a 2FA reset if locked out."}</li>
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toggle between OTP and Backup Code */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsBackupCode(!isBackupCode);
                    setErrorMsg("");
                    setTotpDigits(["", "", "", "", "", ""]);
                    setBackupCode("");
                  }}
                  className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer"
                  style={{ color: "var(--epo-purple-glow)" }}
                >
                  {isBackupCode ? (
                    <>
                      <Smartphone size={14} /> {isZh ? "使用验证器动态验证码" : "Use Authenticator Code"}
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} /> {isZh ? "使用应急备用代码登录" : "Use a Backup Code instead"}
                    </>
                  )}
                </button>
              </div>

              {/* Submit Verification Button */}
              <motion.button
                type="submit"
                whileTap={{ scale: 0.96 }}
                disabled={status !== "idle"}
                className="epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white cursor-pointer"
                style={{
                  background: "var(--epo-brand-gradient)",
                  boxShadow:
                    "0 8px 30px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
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
                      {isZh ? "验证并进入系统" : "Verify & Proceed"} <ArrowRight size={17} />
                    </>
                  )}
                  {status === "warping" && (
                    <>
                      <Loader2 size={17} className="animate-spin" /> {isZh ? "验证中…" : "Verifying…"}
                    </>
                  )}
                  {status === "success" && (
                    <>
                      <Check size={17} /> {isZh ? "验证成功" : "Verified"}
                    </>
                  )}
                </span>
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
