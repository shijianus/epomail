import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
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
  HelpCircle,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import type { CanvasHandle } from "./CanvasBackground";
import { cameraState } from "./cameraStore";
import { createT, resolveAuthLang } from "../../i18n/authLocale";

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
export type TwoFAMethod = "totp" | "backup_code" | "passkey";

// Client-side environment and fingerprint browser signature collector
function collectSecPayload() {
  if (typeof window === "undefined") return {};

  const webdriver = Boolean(navigator.webdriver);
  const win = window as any;
  const hasAutomationGlobals = Boolean(
    win._phantom ||
    win.__nightmare ||
    win.callPhantom ||
    win.domAutomation ||
    win.domAutomationController ||
    win.__webdriver_evaluate ||
    win.__selenium_evaluate ||
    win.__fxdriver_evaluate
  );

  let hasCdcProps = false;
  try {
    for (const key in window) {
      if (key.includes('$cdc_') || key.includes('cdc_')) {
        hasCdcProps = true;
        break;
      }
    }
  } catch (_) {}

  const hasFpBrowserGlobals = Boolean(
    win.__adspower ||
    win.__adspower_client ||
    win._v8 ||
    win.bitBrowser ||
    win.dolphin ||
    win.gologin ||
    win.__hubstudio ||
    win.undetectable
  );

  let canvasTampered = false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f00';
      ctx.fillRect(0, 0, 8, 8);
      const data1 = canvas.toDataURL();
      const data2 = canvas.toDataURL();
      if (data1 !== data2) canvasTampered = true;
    }
    if (HTMLCanvasElement.prototype.toDataURL.toString().indexOf('[native code]') === -1) {
      canvasTampered = true;
    }
  } catch (_) {}

  let audioTampered = false;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass && AudioContextClass.prototype.createOscillator.toString().indexOf('[native code]') === -1) {
      audioTampered = true;
    }
  } catch (_) {}

  let screenAnomalies = false;
  try {
    if (window.outerWidth === window.innerWidth && window.outerHeight === window.innerHeight && window.outerWidth > 0) {
      screenAnomalies = true;
    }
  } catch (_) {}

  let touchPointsMismatch = false;
  try {
    if (navigator.maxTouchPoints > 0 && !('ontouchstart' in window) && !/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      touchPointsMismatch = true;
    }
  } catch (_) {}

  let localSessionCount = 0;
  try {
    const raw = localStorage.getItem('epo_sessions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) localSessionCount = parsed.length;
    }
  } catch (_) {}

  return {
    webdriver,
    hasAutomationGlobals,
    hasCdcProps,
    hasFpBrowserGlobals,
    canvasTampered,
    audioTampered,
    screenAnomalies,
    touchPointsMismatch,
    localSessionCount,
    ts: Date.now()
  };
}

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

function generateSessionHash(): string {
  const bytes = new Uint8Array(16);
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function AuthForm({ canvasRef, onSwitch, sysConfig }: AuthFormProps) {
  const [stage, setStage] = useState<Stage>("password");
  const [challengeSessionHash, setChallengeSessionHash] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");
  const [totpDigits, setTotpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [backupCode, setBackupCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [hasTotp, setHasTotp] = useState(true);
  const [hasBackupCodes, setHasBackupCodes] = useState(true);
  const [active2FAMethod, setActive2FAMethod] = useState<TwoFAMethod>("totp");
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [stepUpActive, setStepUpActive] = useState(false);
  const [verifiedFactors, setVerifiedFactors] = useState<string[]>([]);
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
  const rawI18n = sysConfig?.authI18n || {};
  // 管理后台 authI18n 仍具最高优先级；嵌套结构按当前语言取子字典并回退 en/zh
  const i18n = (rawI18n.zh || rawI18n.en ? rawI18n[lang] || rawI18n.en || rawI18n.zh : rawI18n) as Record<string, string>;
  const tr = (key: string, dictKey?: string) => i18n[key] || t(dictKey || key);

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

  const updateChallengeUrl = (methodType: string, hash: string, replace: boolean = false) => {
    if (typeof window === "undefined" || !hash) return;
    const targetPath = `/login/challenge/${methodType}_${hash}`;
    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState({ sessionHash: hash, method: methodType }, '', targetPath);
      } else {
        window.history.pushState({ sessionHash: hash, method: methodType }, '', targetPath);
      }
    }
  };

  // URL 路由精确同步与跨环境复制自动回退机制
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleRouteSync = () => {
      const pathname = window.location.pathname;
      const challengeMatch = pathname.match(/\/login\/challenge\/(totp|passkey|backup|select|session)_([A-Za-z0-9_-]+)/);

      if (challengeMatch) {
        const urlMethodPrefix = challengeMatch[1];
        const urlHash = challengeMatch[2];
        let storedSession: any = null;
        try {
          const raw = sessionStorage.getItem('epo_2fa_challenge_session');
          if (raw) storedSession = JSON.parse(raw);
        } catch (_) {}

        // 严格环境与会话有效性核验：
        // 1. 本标签页 sessionStorage 必须存在会话
        // 2. sessionHash 必须与 URL 中的 hash 严格一致
        // 3. 时间窗口在 10 分钟内
        // 若在不同环境直接复制粘贴链接打开，因无当前标签页 sessionStorage，自动安全回退至 /login/
        const isValid = storedSession &&
          storedSession.sessionHash === urlHash &&
          (Date.now() - (storedSession.createdAt || 0) < 10 * 60 * 1000);

        if (!isValid) {
          window.history.replaceState(null, '', '/login/' + window.location.search);
          sessionStorage.removeItem('epo_2fa_challenge_session');
          setStage("password");
          setChallengeSessionHash("");
        } else {
          // 当前标签页内正常刷新（F5）或会话内有效跳转：完整恢复 2FA 状态与因子
          setChallengeSessionHash(urlHash);
          setTempToken(storedSession.tempToken || "");
          setMfaEmail(storedSession.email || "");
          setHasPasskeys(Boolean(storedSession.hasPasskeys));
          setPasskeysList(storedSession.passkeysList || []);
          setPasskeyChallenge(storedSession.passkeyChallenge || "");
          setHasTotp(Boolean(storedSession.hasTotp ?? true));
          setHasBackupCodes(Boolean(storedSession.hasBackupCodes ?? true));
          setStepUpActive(Boolean(storedSession.stepUpRequired));
          setStage("totp");

          if (urlMethodPrefix === 'select') {
            setShowMethodSelector(true);
          } else {
            setShowMethodSelector(false);
            if (urlMethodPrefix === 'passkey') {
              setActive2FAMethod('passkey');
              setIsBackupCode(false);
            } else if (urlMethodPrefix === 'backup') {
              setActive2FAMethod('backup_code');
              setIsBackupCode(true);
            } else {
              setActive2FAMethod('totp');
              setIsBackupCode(false);
            }
          }
        }
      } else {
        if (stage === "password") {
          sessionStorage.removeItem('epo_2fa_challenge_session');
        }
      }
    };

    handleRouteSync();
    window.addEventListener('popstate', handleRouteSync);
    return () => window.removeEventListener('popstate', handleRouteSync);
  }, []);

  // 挂载时检测登录凭证失效提示及自动回填上次登录邮箱
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const isExpired = searchParams.get("reason") === "expired" || searchParams.get("expired") === "true";
      const storedMsg = sessionStorage.getItem("auth_expired_msg");

      if (isExpired || storedMsg) {
        const msg = storedMsg || (t('sessionExpired'));
        setErrorMsg(msg);
        sessionStorage.removeItem("auth_expired_msg");
        cameraState.authErrorOpacity = 1;
      }

      const isAddAccount = searchParams.get("action") === "addAccount" || searchParams.get("addAccount") === "true" || searchParams.get("addAccount") === "1";
      const urlEmail = searchParams.get("email");
      const storedEmail = localStorage.getItem("loginEmail");
      if (urlEmail) {
        setEmail(urlEmail);
      } else if (storedEmail && !isAddAccount) {
        setEmail(storedEmail);
      }
    }
  }, [lang]);

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

  // Focus first OTP input when switching to TOTP method
  useEffect(() => {
    if (stage === "totp" && active2FAMethod === "totp" && !showMethodSelector) {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [stage, active2FAMethod, showMethodSelector]);

  const mapErrorMessage = (rawMsg: string) => {
    if (!rawMsg) return t('verifyFailed');
    if (rawMsg === "totpSessionExpired" || rawMsg.includes("过期")) {
      return t('totpSessionExpired');
    }
    if (rawMsg === "totpTooManyAttempts" || rawMsg.includes("过多")) {
      return t('tooManyAttempts');
    }
    if (rawMsg === "totpCodeInvalid" || rawMsg.includes("验证码错误")) {
      return t('invalidCode');
    }
    if (rawMsg === "backupCodeInvalid" || rawMsg.includes("备用代码")) {
      return t('backupCodeInvalid');
    }
    if (rawMsg === "totpCodeReplay" || rawMsg.includes("已使用")) {
      return t('codeReused');
    }
    if (rawMsg === "accountLocked" || rawMsg.includes("锁定")) {
      return t('accountLocked');
    }
    // 服务端已按 Accept-Language 本地化；万一仍收到裸协议键（camelCase、无空格），
    // 兜底为通用文案，绝不把 "IncorrectPwd" 这类内部键名直接抛给用户。
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(rawMsg) && /[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(rawMsg)) {
      return t('opFailed');
    }
    return rawMsg;
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("warping");
    setErrorMsg("");
    canvasRef.current?.warp();

    const secPayload = collectSecPayload();

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, secPayload })
    })
    .then(async (res) => {
      const data = await res.json();
      if (data.code === 200) {
        // Check if 2FA is required
        if (data.data?.mfaRequired || data.mfaRequired) {
          const tToken = data.data?.tempToken || data.tempToken;
          const targetEmail = data.data?.email || data.email || email;
          const pks = data.data?.passkeys || data.passkeys || [];
          const hasPk = Boolean(data.data?.hasPasskeys || (pks && pks.length > 0));
          const hasT = Boolean(data.data?.hasTotp ?? true);
          const hasBc = Boolean(data.data?.hasBackupCodes ?? true);
          const pkChallenge = data.data?.passkeyChallenge || data.passkeyChallenge || '';
          const isStepUp = Boolean(data.data?.stepUpRequired || data.stepUpRequired);
          const rScore = Number(data.data?.riskScore || data.riskScore || 0);

          const newHash = generateSessionHash();
          setChallengeSessionHash(newHash);

          setTempToken(tToken);
          setMfaEmail(targetEmail);
          setHasPasskeys(hasPk);
          setPasskeysList(pks);
          setPasskeyChallenge(pkChallenge);
          setHasTotp(hasT);
          setHasBackupCodes(hasBc);

          setStage("totp");
          setStatus("idle");
          setTotpDigits(["", "", "", "", "", ""]);
          setBackupCode("");
          setIsBackupCode(false);
          setShowHelp(false);
          setErrorMsg("");
          setStepUpActive(isStepUp);
          setVerifiedFactors([]);
          setShowMethodSelector(false);

          let initialMethod: TwoFAMethod = "totp";
          if (hasPk) {
            initialMethod = "passkey";
          } else if (hasT) {
            initialMethod = "totp";
          } else {
            initialMethod = "backup_code";
          }
          setActive2FAMethod(initialMethod);

          // 保存当前标签页的独立 2FA 会话数据（不同环境复制粘贴链接打开无此数据将自动回退）
          const sessionData = {
            sessionHash: newHash,
            tempToken: tToken,
            email: targetEmail,
            hasPasskeys: hasPk,
            passkeysList: pks,
            passkeyChallenge: pkChallenge,
            hasTotp: hasT,
            hasBackupCodes: hasBc,
            createdAt: Date.now(),
            stepUpRequired: isStepUp,
            riskScore: rScore
          };
          try {
            sessionStorage.setItem('epo_2fa_challenge_session', JSON.stringify(sessionData));
          } catch (_) {}

          // 更新 URL 为普遍规律前缀 + base64url sha 会话标识
          const urlMethod = initialMethod === 'backup_code' ? 'backup' : initialMethod;
          updateChallengeUrl(urlMethod, newHash);

          // 连续性星际巡航平滑降速与高能青光脉冲
          cameraState.vzTarget = 1.35;
          canvasRef.current?.pulse({ color: "cyan", strength: 2.2 });
          return;
        }

        // Direct Login Success
        saveLoginSessionAndRedirect(data, false);
      } else {
        setStatus("idle");
        const mappedError = mapErrorMessage(data.message || data.msg);
        setErrorMsg(mappedError || tr('invalidCredentials'));

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
      setErrorMsg((t('linkErrorPrefix')) + (err.message || err));
    });
  };

  const saveLoginSessionAndRedirect = (data: any, isTotp: boolean = false) => {
    const token = data.data?.token || data.token;
    const activeEmail = data.data?.email || (email.includes('@') ? email.trim().toLowerCase() : '');

    const searchParams = new URLSearchParams(window.location.search);
    const isAddAccount = searchParams.get("action") === "addAccount" || searchParams.get("addAccount") === "true" || searchParams.get("addAccount") === "1";

    let targetU = 0;
    let sessions: Array<{ u: number; token: string; email: string; name?: string }> = [];
    try {
      const raw = localStorage.getItem('epo_sessions');
      if (raw) sessions = JSON.parse(raw);
    } catch (_) {}

    if (isAddAccount) {
      const existingToken = localStorage.getItem('token');
      const existingEmail = localStorage.getItem('loginEmail');
      if (sessions.length === 0 && existingToken && existingEmail) {
        sessions.push({ u: 0, token: existingToken, email: existingEmail });
      }

      const existingIdx = sessions.findIndex(s => s.email && s.email.toLowerCase() === activeEmail.toLowerCase());
      if (existingIdx >= 0) {
        sessions[existingIdx].token = token;
        targetU = sessions[existingIdx].u;
      } else {
        const uParam = searchParams.get("u");
        if (uParam !== null && !isNaN(parseInt(uParam, 10))) {
          targetU = parseInt(uParam, 10);
        } else {
          const maxU = sessions.reduce((max, s) => Math.max(max, s.u), -1);
          targetU = maxU + 1;
        }
        sessions.push({
          u: targetU,
          token: token,
          email: activeEmail,
          name: data.data?.name || data.data?.nickname || activeEmail
        });
      }
    } else {
      targetU = 0;
      sessions = [{
        u: 0,
        token: token,
        email: activeEmail,
        name: data.data?.name || data.data?.nickname || activeEmail
      }];
    }

    try {
      localStorage.setItem('epo_sessions', JSON.stringify(sessions));
    } catch (_) {}

    if (token) {
      localStorage.setItem('token', token);
    }
    if (activeEmail) {
      localStorage.setItem('loginEmail', activeEmail);
    }

    syncLangToMainApp();
    try {
      sessionStorage.removeItem('epo_2fa_challenge_session');
    } catch (_) {}
    setStatus("success");
    cameraState.authSuccessOpacity = 1;

    let finalMsg = isTotp ? t('totpSuccess') : (i18n.loginSuccess || data.message || data.msg);
    if (!finalMsg || finalMsg.toLowerCase() === 'success') {
      finalMsg = t('loginSuccess');
    }
    setSuccessMsg(finalMsg);

    if (isTotp) {
      canvasRef.current?.pulse({ strength: 2.2, color: "cyan" });
      canvasRef.current?.burst({ strength: 2.5, color: "cyan" });
    } else {
      canvasRef.current?.pulse({ strength: 2 });
      canvasRef.current?.burst({ strength: 2 });
    }

    setTimeout(() => {
      window.location.href = `/mail/u/${targetU}/#inbox`;
    }, 800);
  };

  const handleLoginSuccess = (data: any) => {
    saveLoginSessionAndRedirect(data, true);
  };

  const getFactorName = (f: string) => {
    if (f === 'passkey') return t('methodPasskeyTitle');
    if (f === 'totp') return t('methodTotpTitle');
    if (f === 'backup_code') return t('methodBackupTitle');
    return f;
  };

  const triggerTotpSubmit = (overrideCode?: string, overrideIsBackup?: boolean) => {
    if (status !== "idle") return;

    const currentIsBackup = overrideIsBackup !== undefined ? overrideIsBackup : isBackupCode;
    const code = overrideCode !== undefined 
      ? overrideCode.trim() 
      : (currentIsBackup ? backupCode.trim() : totpDigits.join("").trim());

    if (!code) {
      setErrorMsg(t('enterCode'));
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
        if (data.data?.stepUpRequired && data.data?.step === 2) {
          setStatus("idle");
          setStepUpActive(true);
          if (data.data.tempToken) setTempToken(data.data.tempToken);
          const factorJustVerified = data.data.verifiedFactor || (currentIsBackup ? 'backup_code' : 'totp');
          setVerifiedFactors(prev => Array.from(new Set([...prev, factorJustVerified])));
          setHasTotp(Boolean(data.data.hasTotp));
          setHasPasskeys(Boolean(data.data.hasPasskeys));
          setHasBackupCodes(Boolean(data.data.hasBackupCodes));
          if (data.data.passkeyChallenge) setPasskeyChallenge(data.data.passkeyChallenge);
          if (data.data.passkeys) setPasskeysList(data.data.passkeys);

          setTotpDigits(["", "", "", "", "", ""]);
          setBackupCode("");

          const remaining = data.data.remainingFactors || [];
          if (remaining.includes('passkey')) {
            setActive2FAMethod('passkey');
            setIsBackupCode(false);
          } else if (remaining.includes('backup_code')) {
            setActive2FAMethod('backup_code');
            setIsBackupCode(true);
          } else if (remaining.includes('totp')) {
            setActive2FAMethod('totp');
            setIsBackupCode(false);
          }

          setSuccessMsg("");
          setErrorMsg(data.data.message || t('stepUpDesc'));
          canvasRef.current?.pulse({ color: "cyan", strength: 2.2 });
          return;
        }
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
      setErrorMsg((t('verifyErrorPrefix')) + (err.message || err));
    });
  };

  const handleTotpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerTotpSubmit();
  };

  const handlePasskeyLogin = async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !passkeyChallenge) {
      setErrorMsg(t('passkeyUnsupported'));
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
        if (data.data?.stepUpRequired && data.data?.step === 2) {
          setStatus("idle");
          setStepUpActive(true);
          if (data.data.tempToken) setTempToken(data.data.tempToken);
          setVerifiedFactors(prev => Array.from(new Set([...prev, 'passkey'])));
          setHasTotp(Boolean(data.data.hasTotp));
          setHasPasskeys(Boolean(data.data.hasPasskeys));
          setHasBackupCodes(Boolean(data.data.hasBackupCodes));
          if (data.data.passkeyChallenge) setPasskeyChallenge(data.data.passkeyChallenge);
          if (data.data.passkeys) setPasskeysList(data.data.passkeys);

          setTotpDigits(["", "", "", "", "", ""]);
          setBackupCode("");

          const remaining = data.data.remainingFactors || [];
          if (remaining.includes('totp')) {
            setActive2FAMethod('totp');
            setIsBackupCode(false);
          } else if (remaining.includes('backup_code')) {
            setActive2FAMethod('backup_code');
            setIsBackupCode(true);
          }

          setSuccessMsg("");
          setErrorMsg(data.data.message || t('stepUpDesc'));
          canvasRef.current?.pulse({ color: "cyan", strength: 2.2 });
          return;
        }
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
      if (err.name === 'NotAllowedError') {
        setErrorMsg(t('passkeyCancelledOrNotAllowed'));
      } else {
        setErrorMsg(err.message || (t('securityKeyFailed')));
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
                role="alert"
                aria-live="assertive"
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
        className="relative flex-1 flex flex-col justify-between"
      >
        <AnimatePresence mode="wait">
          {stage === "password" ? (
            /* =========================================================================
               STAGE 1: PASSWORD LOGIN FORM
               ========================================================================= */
            <motion.form
              key="password-form"
              initial={reduceMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, filter: "blur(4px)" }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handlePasswordSubmit}
              className="flex-1 flex flex-col justify-between gap-6 pt-1"
            >
              <div className="flex flex-col gap-6">
                <FloatingField
                  id="epo-email"
                  type="email"
                  label={tr('emailLabel')}
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
                  label={tr('passwordLabel')}
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
                      aria-label={showPassword ? (t('hidePassword')) : (t('showPassword'))}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />

                <div className="flex items-center justify-between">
                  <label
                    className="flex cursor-pointer select-none items-center gap-2 text-[13px]"
                    style={{ color: "var(--epo-muted)" }}
                  >
                    <input
                      type="checkbox"
                      checked={stayInOrbit}
                      onChange={(e) => setStayInOrbit(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#67e8f9]"
                      style={
                        stayInOrbit
                          ? {
                              background: "var(--epo-brand-gradient)",
                              borderColor: "transparent",
                              boxShadow: "0 0 12px rgba(124,58,237,0.45)",
                            }
                          : {
                              borderColor: "rgba(139,147,196,0.45)",
                              background: "rgba(255,255,255,0.04)",
                            }
                      }
                    >
                      {stayInOrbit && <Check size={11} strokeWidth={3.5} color="#fff" />}
                    </span>
                    {tr('stayInOrbit')}
                  </label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setErrorMsg(tr('forgotPasswordHint'));
                    }}
                    className="text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)]"
                    style={{ color: "var(--epo-muted)" }}
                  >
                    {tr('forgotPassword')}
                  </a>
                </div>

                <motion.button
                  type="submit"
                  whileHover={submitHover}
                  whileTap={{ scale: 0.96 }}
                  disabled={status !== "idle"}
                  className="epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67e8f9] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e22] disabled:cursor-not-allowed disabled:opacity-60"
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
                        {tr('initiateLogin')} <ArrowRight size={17} />
                      </>
                    )}
                    {status === "warping" && (
                      <>
                        <Loader2 size={17} className="animate-spin" /> {tr('warping')}
                      </>
                    )}
                    {status === "success" && (
                      <>
                        <Check size={17} /> {tr('connected')}
                      </>
                    )}
                  </span>
                </motion.button>
              </div>

              <div className="mt-auto pt-3 flex flex-col gap-3">
                {sysConfig?.oauthLoginEnabled ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
                      <span className="text-[12px]" style={{ color: "var(--epo-muted)" }}>
                        {tr('orContinueWith')}
                      </span>
                      <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {["Google", "GitHub"].map((provider) => (
                        <motion.button
                          key={provider}
                          type="button"
                          onClick={() => setErrorMsg(tr('oauthComingSoon'))}
                          whileHover={reduceMotion ? { opacity: 1 } : { opacity: 1, y: -1.5 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="epomail-display flex h-11 items-center justify-center gap-2 rounded-xl border text-[13px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67e8f9]"
                          style={{
                            borderColor: "rgba(139,147,196,0.25)",
                            background: "rgba(255,255,255,0.04)",
                            color: "var(--epo-ink)",
                            opacity: 0.82,
                          }}
                        >
                          {provider}
                          <span
                            className="rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider"
                            style={{ borderColor: "rgba(139,147,196,0.35)", color: "var(--epo-muted)" }}
                          >
                            {t('oauthSoon')}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="text-center text-[13px]" style={{ color: "var(--epo-muted)" }}>
                  {tr('newToCanvas')}{" "}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onSwitch(); }}
                    className="transition-colors hover:text-[var(--epo-cyan-glow)]"
                    style={{ color: "var(--epo-purple-glow)" }}
                  >
                    {tr('exploreNode')}
                  </a>
                </p>
              </div>
            </motion.form>
          ) : (
            /* =========================================================================
               STAGE 2: TWO-FACTOR AUTHENTICATION (TOTP / BACKUP CODE / PASSKEY)
               ========================================================================= */
            <motion.form
              key="totp-form"
              initial={reduceMotion ? false : { opacity: 0, y: 14, filter: "blur(4px)" }}
              animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(4px)" }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleTotpSubmit}
              className="flex-1 flex flex-col justify-between gap-5 pt-1"
            >
              {showMethodSelector ? (
                /* =====================================================================
                   SUB-VIEW: CHOOSE ANOTHER WAY (METHOD SELECTOR)
                   ===================================================================== */
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex flex-col gap-4">
                    {/* Back button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMethodSelector(false);
                        setErrorMsg("");
                        if (challengeSessionHash) {
                          const methodPrefix = active2FAMethod === 'backup_code' ? 'backup' : active2FAMethod;
                          updateChallengeUrl(methodPrefix, challengeSessionHash);
                        }
                      }}
                      className="flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer self-start"
                      style={{ color: "var(--epo-muted)" }}
                    >
                      <ArrowLeft size={15} /> {t('backToVerification')}
                    </button>

                    <div className="flex flex-col gap-1">
                      <h2 className="text-[17px] font-semibold text-[var(--epo-ink)] tracking-wide">
                        {t('chooseAuthMethod')}
                      </h2>
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--epo-muted)" }}>
                        {t('chooseAuthMethodDesc')}
                      </p>
                    </div>

                    {/* Adaptive Step-Up Alert in selector view */}
                    {stepUpActive && (
                      <div className="rounded-xl border border-yellow-500/40 bg-yellow-950/20 p-3 text-[12px] leading-relaxed backdrop-blur-sm shadow-[0_0_15px_rgba(234,179,8,0.15)] flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-yellow-400 font-medium">
                          <ShieldAlert size={16} className="shrink-0" />
                          <span>{t('stepUpBadge')}</span>
                        </div>
                        <p className="text-yellow-200/80 text-[11px]">
                          {t('stepUpDesc')}
                        </p>
                        {verifiedFactors.length > 0 && (
                          <div className="text-[10px] text-green-300 bg-green-950/40 border border-green-500/30 rounded px-2 py-0.5 self-start">
                            {t('stepUpFactorPassed').replace('{factor}', verifiedFactors.map(getFactorName).join(', '))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Method options list */}
                    <div className="flex flex-col gap-2.5 mt-1">
                      {/* 1. Passkey Option */}
                      {hasPasskeys && (
                        <button
                          type="button"
                          disabled={verifiedFactors.includes('passkey')}
                          onClick={() => {
                            if (verifiedFactors.includes('passkey')) return;
                            setActive2FAMethod('passkey');
                            setIsBackupCode(false);
                            setShowMethodSelector(false);
                            setErrorMsg("");
                            if (challengeSessionHash) {
                              updateChallengeUrl('passkey', challengeSessionHash);
                            }
                            setTimeout(() => {
                              handlePasskeyLogin();
                            }, 120);
                          }}
                          className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                            verifiedFactors.includes('passkey')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'passkey'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <KeyRound size={18} />
                            </div>
                            <div>
                              <div className="text-[13px] font-semibold text-[var(--epo-ink)]">
                                {t('methodPasskeyTitle')}
                              </div>
                              <div className="text-[11px] leading-tight text-[var(--epo-muted)] line-clamp-1 mt-0.5">
                                {t('methodPasskeyDesc')}
                              </div>
                              {verifiedFactors.includes('passkey') && (
                                <span className="text-[10px] text-yellow-400 mt-1 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-[var(--epo-muted)] shrink-0 ml-2" />
                        </button>
                      )}

                      {/* 2. TOTP Option */}
                      {hasTotp && (
                        <button
                          type="button"
                          disabled={verifiedFactors.includes('totp')}
                          onClick={() => {
                            if (verifiedFactors.includes('totp')) return;
                            setActive2FAMethod('totp');
                            setIsBackupCode(false);
                            setShowMethodSelector(false);
                            setErrorMsg("");
                            if (challengeSessionHash) {
                              updateChallengeUrl('totp', challengeSessionHash);
                            }
                          }}
                          className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                            verifiedFactors.includes('totp')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'totp'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <Smartphone size={18} />
                            </div>
                            <div>
                              <div className="text-[13px] font-semibold text-[var(--epo-ink)]">
                                {t('methodTotpTitle')}
                              </div>
                              <div className="text-[11px] leading-tight text-[var(--epo-muted)] line-clamp-1 mt-0.5">
                                {t('methodTotpDesc')}
                              </div>
                              {verifiedFactors.includes('totp') && (
                                <span className="text-[10px] text-yellow-400 mt-1 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-[var(--epo-muted)] shrink-0 ml-2" />
                        </button>
                      )}

                      {/* 3. Backup Code Option */}
                      {hasBackupCodes && (
                        <button
                          type="button"
                          disabled={verifiedFactors.includes('backup_code')}
                          onClick={() => {
                            if (verifiedFactors.includes('backup_code')) return;
                            setActive2FAMethod('backup_code');
                            setIsBackupCode(true);
                            setShowMethodSelector(false);
                            setErrorMsg("");
                            if (challengeSessionHash) {
                              updateChallengeUrl('backup', challengeSessionHash);
                            }
                          }}
                          className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                            verifiedFactors.includes('backup_code')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'backup_code'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <ShieldCheck size={18} />
                            </div>
                            <div>
                              <div className="text-[13px] font-semibold text-[var(--epo-ink)]">
                                {t('methodBackupTitle')}
                              </div>
                              <div className="text-[11px] leading-tight text-[var(--epo-muted)] line-clamp-1 mt-0.5">
                                {t('methodBackupDesc')}
                              </div>
                              {verifiedFactors.includes('backup_code') && (
                                <span className="text-[10px] text-yellow-400 mt-1 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-[var(--epo-muted)] shrink-0 ml-2" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* =====================================================================
                   SUB-VIEW: ACTIVE METHOD VERIFICATION
                   ===================================================================== */
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex flex-col gap-4">
                    {/* Back button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (stepUpActive) {
                          setShowMethodSelector(true);
                          setErrorMsg("");
                          setShowHelp(false);
                          if (challengeSessionHash) {
                            updateChallengeUrl('select', challengeSessionHash);
                          }
                        } else {
                          try {
                            sessionStorage.removeItem('epo_2fa_challenge_session');
                          } catch (_) {}
                          window.history.pushState(null, '', '/login/' + window.location.search);
                          setStage("password");
                          setChallengeSessionHash("");
                          setStatus("idle");
                          setErrorMsg("");
                          setShowHelp(false);
                        }
                      }}
                      className="flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer self-start"
                      style={{ color: "var(--epo-muted)" }}
                    >
                      <ArrowLeft size={15} /> {stepUpActive ? t('chooseAuthMethod') : t('backToPassword')}
                    </button>

                  {/* Adaptive Step-Up Alert banner */}
                  {stepUpActive && (
                    <div className="rounded-xl border border-yellow-500/40 bg-yellow-950/20 p-3 text-[12px] leading-relaxed backdrop-blur-sm shadow-[0_0_15px_rgba(234,179,8,0.15)] flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-yellow-400 font-medium">
                        <ShieldAlert size={16} className="shrink-0" />
                        <span>{t('stepUpBadge')}</span>
                      </div>
                      <p className="text-yellow-200/80 text-[11px]">
                        {t('stepUpDesc')}
                      </p>
                      {verifiedFactors.length > 0 && (
                        <div className="text-[10px] text-green-300 bg-green-950/40 border border-green-500/30 rounded px-2 py-0.5 self-start">
                          {t('stepUpFactorPassed').replace('{factor}', verifiedFactors.map(getFactorName).join(', '))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2FA Header card banner */}
                  <div className="flex flex-col items-center text-center gap-2 rounded-2xl p-4 border border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] backdrop-blur-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                      {active2FAMethod === 'passkey' ? (
                        <KeyRound size={20} />
                      ) : active2FAMethod === 'backup_code' ? (
                        <ShieldCheck size={20} />
                      ) : (
                        <Smartphone size={20} />
                      )}
                    </div>
                    <h2 className="text-[16px] font-semibold text-[var(--epo-ink)] tracking-wide">
                      {active2FAMethod === 'passkey'
                        ? t('methodPasskeyTitle')
                        : active2FAMethod === 'backup_code'
                        ? t('backupCodeTitle')
                        : t('totpTitle')}
                    </h2>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--epo-muted)" }}>
                      {active2FAMethod === 'passkey'
                        ? t('methodPasskeyDesc')
                        : active2FAMethod === 'backup_code'
                        ? t('backupCodeHint')
                        : t('totpHint')}
                    </p>
                    {mfaEmail && (
                      <div className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[rgba(103,232,249,0.1)] text-[var(--epo-cyan-glow)] border border-[rgba(103,232,249,0.25)]">
                        {mfaEmail}
                      </div>
                    )}
                  </div>

                  {/* Active Method Input UI */}
                  {active2FAMethod === 'passkey' ? (
                    <div className="flex flex-col gap-3 py-2">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePasskeyLogin}
                        disabled={status !== "idle"}
                        className="group relative flex w-full h-13 items-center justify-center gap-2.5 rounded-xl border border-indigo-500/50 bg-gradient-to-r from-indigo-500/25 via-purple-500/20 to-cyan-500/25 p-3.5 text-[14px] font-semibold text-white shadow-[0_0_25px_rgba(99,102,241,0.35)] transition-all hover:border-cyan-400 hover:shadow-[0_0_35px_rgba(103,232,249,0.5)] cursor-pointer"
                      >
                        <KeyRound size={18} className="text-cyan-400 transition-transform group-hover:rotate-12" />
                        <span>{t('passkeyVerify')}</span>
                      </motion.button>
                      <p className="text-center text-[11px] leading-relaxed" style={{ color: "var(--epo-muted)" }}>
                        {t('methodPasskeyDesc')}
                      </p>
                    </div>
                  ) : active2FAMethod === 'totp' ? (
                    <AnimatePresence mode="wait">
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
                                ? (t('totpRefreshing').replace('{s}', String(secondsLeftInPeriod)))
                                : (t('totpPeriod').replace('{s}', String(secondsLeftInPeriod)))}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowHelp(!showHelp)}
                            className="flex items-center gap-1 hover:text-[var(--epo-cyan-glow)] transition-colors cursor-pointer"
                          >
                            <HelpCircle size={12} />
                            <span>{t('havingTrouble')}</span>
                          </button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
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
                        label={t('backupCodeLabel')}
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
                        {t('backupCodeNote')}
                      </p>
                    </motion.div>
                  )}

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
                          {t('troubleshootTitle')}
                        </p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>{t('troubleshoot1')}</li>
                          <li>{t('troubleshoot2')}</li>
                          <li>{t('troubleshoot3')}</li>
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit Verification Button (For OTP and Backup Code) */}
                  {active2FAMethod !== 'passkey' && (
                    <motion.button
                      type="submit"
                      whileHover={submitHover}
                      whileTap={{ scale: 0.96 }}
                      disabled={status !== "idle"}
                      className="epomail-display relative mt-1 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] tracking-wide text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67e8f9] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e22] disabled:cursor-not-allowed disabled:opacity-60"
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
                            {t('verifyProceed')} <ArrowRight size={17} />
                          </>
                        )}
                        {status === "warping" && (
                          <>
                            <Loader2 size={17} className="animate-spin" /> {t('verifying')}
                          </>
                        )}
                        {status === "success" && (
                          <>
                            <Check size={17} /> {t('verified')}
                          </>
                        )}
                      </span>
                    </motion.button>
                  )}

                  </div>

                  {/* Multi-factor "Try another way" selection trigger */}
                  <div className="mt-auto pt-3 flex flex-col gap-2">
                    {[hasPasskeys, hasTotp, hasBackupCodes].filter(Boolean).length > 1 && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMethodSelector(true);
                            setErrorMsg("");
                            if (challengeSessionHash) {
                              updateChallengeUrl('select', challengeSessionHash);
                            }
                          }}
                          className="flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer"
                          style={{ color: "var(--epo-purple-glow)" }}
                        >
                          <Smartphone size={14} /> {t('tryAnotherWay')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
