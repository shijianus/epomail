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
  ShieldAlert,
  ExternalLink
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

function GoogleIcon({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" fill="none">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function AppleIcon({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.87c.62-.75 1.04-1.8 0.92-2.87-.9.04-1.99.6-2.63 1.35-.56.65-.96 1.72-.83 2.76.99.08 2.01-.52 2.54-1.24z" />
    </svg>
  );
}

function SsoIcon({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="12" cy="10" r="2" />
      <path d="M12 12v3" />
    </svg>
  );
}

interface OAuthProviderItem {
  key: string;
  name: string;
  icon: React.ReactNode;
  configured: boolean;
}

function getOAuthProviderList(sysConfig?: any): OAuthProviderItem[] {
  // If master switch "第三方快捷登录" is disabled, return empty list immediately
  if (!sysConfig?.oauthLoginEnabled) {
    return [];
  }

  const customProviders = sysConfig?.oauthProviders;
  let parsed: Record<string, any> = {};
  if (typeof customProviders === 'string') {
    try { parsed = JSON.parse(customProviders); } catch (_) {}
  } else if (customProviders && typeof customProviders === 'object') {
    parsed = customProviders;
  }

  const allSupportedMeta: { key: string; name: string; icon: React.ReactNode }[] = [
    {
      key: 'google',
      name: 'Google',
      icon: <GoogleIcon className="w-4 h-4 shrink-0" />
    },
    {
      key: 'github',
      name: 'GitHub',
      icon: <GithubIcon className="w-4 h-4 shrink-0 text-white" />
    },
    {
      key: 'microsoft',
      name: 'Microsoft',
      icon: <MicrosoftIcon className="w-4 h-4 shrink-0" />
    },
    {
      key: 'apple',
      name: 'Apple',
      icon: <AppleIcon className="w-4 h-4 shrink-0 text-white" />
    },
    {
      key: 'custom',
      name: (parsed.custom && parsed.custom.name) || 'Custom SSO',
      icon: <SsoIcon className="w-4 h-4 shrink-0 text-[#67e8f9]" />
    }
  ];

  const result: OAuthProviderItem[] = [];

  for (const meta of allSupportedMeta) {
    const cfg = parsed[meta.key];
    if (!cfg) continue;

    // Rule 3: Provider must be explicitly opened ("启用此提供商" 开启)
    const isEnabled = cfg.enabled === 1 || cfg.enabled === true;
    if (!isEnabled) {
      // Disabled in backend settings -> completely hidden, do NOT render in grid
      continue;
    }

    // Rule 1 & 2: Check if credentials (Client ID and Client Secret) are configured
    const hasClientId = Boolean(cfg.clientId && typeof cfg.clientId === 'string' && cfg.clientId.trim() !== '');
    const isConfigured = Boolean(
      cfg.configured === 1 ||
      cfg.configured === true ||
      (cfg.configured !== 0 && hasClientId)
    );

    result.push({
      key: meta.key,
      name: meta.key === 'custom' && cfg.name ? cfg.name : meta.name,
      icon: meta.icon,
      configured: isConfigured
    });
  }

  return result;
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

function getOrGenerateDeviceTag(): string {
  if (typeof window === "undefined") return "";
  try {
    let tag = localStorage.getItem("epo_device_tag");
    if (!tag) {
      const bytes = new Uint8Array(24);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 24; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      tag = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem("epo_device_tag", tag);
    }
    return tag;
  } catch (_) {
    return "";
  }
}

function getStoredTrustedDeviceToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("epo_trusted_device_token") || "";
  } catch (_) {
    return "";
  }
}

function setStoredTrustedDeviceToken(token?: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem("epo_trusted_device_token", token);
    } else {
      localStorage.removeItem("epo_trusted_device_token");
    }
  } catch (_) {}
}

function getInitialChallengeState() {
  if (typeof window === "undefined") {
    return {
      stage: "password" as Stage,
      activeMethod: "totp" as TwoFAMethod,
      showSelector: false,
      hash: "",
      storedSession: null as any,
    };
  }
  const pathname = window.location.pathname;
  const match = pathname.match(/\/login\/challenge\/(totp|passkey|backup|select|session)_([A-Za-z0-9_-]+)/);
  if (!match) {
    return {
      stage: "password" as Stage,
      activeMethod: "totp" as TwoFAMethod,
      showSelector: false,
      hash: "",
      storedSession: null as any,
    };
  }

  const methodPrefix = match[1];
  const urlHash = match[2];

  let storedSession: any = null;
  try {
    const raw = sessionStorage.getItem('epo_2fa_challenge_session');
    if (raw) storedSession = JSON.parse(raw);
  } catch (_) {}

  let activeMethod: TwoFAMethod = "totp";
  let showSelector = false;
  if (methodPrefix === "select") {
    showSelector = true;
  } else if (methodPrefix === "passkey") {
    activeMethod = "passkey";
  } else if (methodPrefix === "backup") {
    activeMethod = "backup_code";
  } else {
    activeMethod = "totp";
  }

  return {
    stage: "totp" as Stage,
    activeMethod,
    showSelector,
    hash: urlHash,
    storedSession,
  };
}

export function AuthForm({ canvasRef, onSwitch, sysConfig }: AuthFormProps) {
  const initial = useMemo(() => getInitialChallengeState(), []);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [challengeSessionHash, setChallengeSessionHash] = useState<string>(initial.hash);
  const [email, setEmail] = useState(initial.storedSession?.email || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tempToken, setTempToken] = useState(initial.storedSession?.tempToken || "");
  const [mfaEmail, setMfaEmail] = useState(initial.storedSession?.email || "");
  const [totpDigits, setTotpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [backupCode, setBackupCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(initial.activeMethod === "backup_code");
  const [hasPasskeys, setHasPasskeys] = useState(Boolean(initial.storedSession?.hasPasskeys));
  const [hasTotp, setHasTotp] = useState(Boolean(initial.storedSession?.hasTotp ?? true));
  const [hasBackupCodes, setHasBackupCodes] = useState(Boolean(initial.storedSession?.hasBackupCodes ?? true));
  const [active2FAMethod, setActive2FAMethod] = useState<TwoFAMethod>(initial.activeMethod);
  const [showMethodSelector, setShowMethodSelector] = useState(initial.showSelector);
  const [stepUpActive, setStepUpActive] = useState(Boolean(initial.storedSession?.stepUpRequired));
  const [verifiedFactors, setVerifiedFactors] = useState<string[]>([]);
  const [passkeyChallenge, setPasskeyChallenge] = useState(initial.storedSession?.passkeyChallenge || "");
  const [passkeysList, setPasskeysList] = useState<any[]>(initial.storedSession?.passkeysList || []);
  const [otpShake, setOtpShake] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [secondsLeftInPeriod, setSecondsLeftInPeriod] = useState(30);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [stayInOrbit, setStayInOrbit] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const lang = useMemo(() => resolveAuthLang(), []);
  const getAppealUrl = (targetEmail?: string) => {
    let langCode = 'zh';
    if (lang === 'zh-Hant') langCode = 'zh-tw';
    else if (lang === 'en') langCode = 'en';
    else if (lang === 'es') langCode = 'es';
    else if (lang === 'fr') langCode = 'fr';
    else if (lang === 'nl') langCode = 'nl';
    const base = 'https://docs.epocanvas.com/epomail/appeal/';
    const params = new URLSearchParams();
    params.set('type', 'password');
    params.set('lang', langCode);
    if (targetEmail) params.set('email', targetEmail);
    return `${base}?${params.toString()}`;
  };
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

  const oauthProviderList = useMemo(() => getOAuthProviderList(sysConfig), [sysConfig]);

  // 处理 OAuth 重定向回跳与授权令牌提取 (如 /login?oauth_token=xxx 或 /login?error=xxx)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const oauthErr = params.get('error');

    if (oauthToken) {
      window.history.replaceState({}, '', window.location.pathname);
      setStatus("warping");
      fetch('/api/user/info', {
        headers: { token: oauthToken }
      })
        .then(r => (r.ok ? r.json() : null))
        .then(res => {
          const uInfo = (res && res.data) || {};
          const activeEmail = uInfo.email || uInfo.name || 'oauth_user';

          let sessions: any[] = [];
          try {
            const raw = localStorage.getItem('epo_sessions');
            if (raw) sessions = JSON.parse(raw) || [];
          } catch (_) {}

          const idx = sessions.findIndex(s => s.email === activeEmail);
          if (idx >= 0) {
            sessions[idx].token = oauthToken;
            sessions[idx].name = uInfo.name || uInfo.nickname || activeEmail;
          } else {
            sessions.push({
              u: sessions.length,
              token: oauthToken,
              email: activeEmail,
              name: uInfo.name || uInfo.nickname || activeEmail
            });
          }

          try {
            localStorage.setItem('epo_sessions', JSON.stringify(sessions));
            localStorage.setItem('token', oauthToken);
            localStorage.setItem('loginEmail', activeEmail);
          } catch (_) {}
          syncLangToMainApp();

          setStatus("success");
          cameraState.authSuccessOpacity = 1;
          setSuccessMsg(t('loginSuccess'));
          canvasRef.current?.pulse({ strength: 2.2, color: "cyan" });
          canvasRef.current?.burst({ strength: 2.5, color: "cyan" });

          setTimeout(() => {
            window.location.href = '/mail/u/0/#inbox';
          }, 600);
        })
        .catch(err => {
          setStatus("idle");
          setErrorMsg(err?.message || tr('opFailed'));
        });
    } else if (oauthErr) {
      setErrorMsg(oauthErr === 'missing_code' ? tr('opFailed') : decodeURIComponent(oauthErr));
    }
  }, [t, tr, canvasRef]);

  const handleOAuthProviderClick = async (provider: OAuthProviderItem) => {
    if (!provider.configured) {
      setErrorMsg(t('oauthNotConfigured') || tr('oauthComingSoon'));
      return;
    }
    setErrorMsg("");
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectUri = `${origin}/api/oauth/callback/${provider.key}`;
      const res = await fetch(`/api/oauth/authorize/${provider.key}?redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json().catch(() => null);
      if (data && data.code === 200 && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setErrorMsg((data && data.message) || tr('oauthComingSoon'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || tr('oauthComingSoon'));
    }
  };

  const renderOAuthButton = (provider: OAuthProviderItem, extraClass: string = "", isHero: boolean = false) => {
    const isConfigured = Boolean(provider.configured);

    return (
      <motion.button
        key={provider.key}
        type="button"
        disabled={!isConfigured}
        aria-disabled={!isConfigured}
        title={isConfigured ? provider.name : `${provider.name} (${t('oauthSoon') || '未配置'})`}
        onClick={(e) => {
          if (!isConfigured) {
            e.preventDefault();
            e.stopPropagation();
            setErrorMsg(t('oauthNotConfigured') || tr('oauthComingSoon'));
            return;
          }
          handleOAuthProviderClick(provider);
        }}
        whileHover={isConfigured ? (reduceMotion ? { opacity: 1 } : { opacity: 1, y: -1.5, borderColor: "rgba(103,232,249,0.55)", background: "rgba(255,255,255,0.08)" }) : {}}
        whileTap={isConfigured ? { scale: 0.98 } : {}}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={`epomail-display flex ${isHero ? 'h-11 w-full' : ''} items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 rounded-xl border text-[12px] sm:text-[13px] ${
          isConfigured
            ? 'transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67e8f9]'
            : 'cursor-not-allowed select-none opacity-40 grayscale'
        } ${extraClass}`}
        style={{
          borderColor: isConfigured ? "rgba(139,147,196,0.28)" : "rgba(139,147,196,0.12)",
          background: isConfigured ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
          color: isConfigured ? "var(--epo-ink)" : "var(--epo-muted)",
          opacity: isConfigured ? 0.95 : 0.40,
        }}
      >
        <span className={isConfigured ? "shrink-0" : "shrink-0 grayscale opacity-60"}>{provider.icon}</span>
        <span className="truncate font-medium">{provider.name}</span>
        {!isConfigured && (
          <span
            className="rounded-full border px-1 sm:px-1.5 py-px text-[8.5px] sm:text-[9px] uppercase tracking-wider shrink-0"
            style={{ borderColor: "rgba(139,147,196,0.25)", color: "var(--epo-muted)", background: "rgba(255,255,255,0.02)" }}
          >
            {t('oauthSoon')}
          </span>
        )}
      </motion.button>
    );
  };

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

  // URL 路由精确同步（严格保持当前 URL，绝不触发跳转，支持浏览器前进/后退）
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

        setChallengeSessionHash(urlHash);
        setStage("totp");

        if (storedSession && storedSession.sessionHash === urlHash) {
          setTempToken(storedSession.tempToken || "");
          setMfaEmail(storedSession.email || "");
          setHasPasskeys(Boolean(storedSession.hasPasskeys));
          setPasskeysList(storedSession.passkeysList || []);
          setPasskeyChallenge(storedSession.passkeyChallenge || "");
          setHasTotp(Boolean(storedSession.hasTotp ?? true));
          setHasBackupCodes(Boolean(storedSession.hasBackupCodes ?? true));
          setStepUpActive(Boolean(storedSession.stepUpRequired));
        }

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
      } else {
        setStage("password");
        setShowMethodSelector(false);
      }
    };

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
    const deviceTag = getOrGenerateDeviceTag();
    const trustedDeviceToken = getStoredTrustedDeviceToken();

    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, secPayload, deviceTag, trustedDeviceToken })
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
    const trustTok = data.data?.trustedDeviceToken || data.trustedDeviceToken;
    if (trustTok) {
      setStoredTrustedDeviceToken(trustTok);
    }
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
        isBackupCode: currentIsBackup,
        rememberDevice: Boolean(rememberDevice),
        deviceTag: getOrGenerateDeviceTag()
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
          signature,
          rememberDevice: Boolean(rememberDevice),
          deviceTag: getOrGenerateDeviceTag()
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

      {/* Forgot Password / External Appeal Portal Modal */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showForgotModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[rgba(139,147,196,0.35)] bg-[#0c1024]/95 p-6 shadow-2xl backdrop-blur-xl text-left"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/25 border border-indigo-400/35 text-cyan-300">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white tracking-wide">
                      {tr('forgotPasswordModalTitle')}
                    </h3>
                    <p className="text-[12px] text-cyan-300/80">epomail-docs</p>
                  </div>
                </div>

                <p className="text-[13px] leading-relaxed text-[#c7d2fe] mb-4">
                  {tr('forgotPasswordModalDesc')}
                </p>

                {email && (
                  <div className="mb-5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/5 px-3 py-2 text-[12px] flex items-center justify-between">
                    <span className="text-[var(--epo-muted)]">{tr('forgotPasswordModalTarget')}</span>
                    <code className="text-cyan-300 font-mono font-medium">{email}</code>
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  <a
                    href={getAppealUrl(email)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium text-white transition-all duration-200 hover:brightness-110 cursor-pointer shadow-lg"
                    style={{
                      background: "var(--epo-brand-gradient)",
                      boxShadow: "0 4px 20px rgba(79,70,229,0.4)"
                    }}
                    onClick={() => setShowForgotModal(false)}
                  >
                    <span>{tr('forgotPasswordModalGo')}</span>
                    <ExternalLink size={15} />
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex h-10 w-full items-center justify-center rounded-xl border border-[rgba(255,255,255,0.12)] bg-transparent text-[13px] text-[var(--epo-muted)] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {tr('forgotPasswordModalClose')}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <motion.div
        layout
        transition={{
          layout: { type: "spring", stiffness: 320, damping: 30 },
        }}
        className="relative flex flex-col justify-center w-full"
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
              className={`flex flex-col justify-center ${oauthProviderList.length > 0 ? 'gap-3 sm:gap-3.5' : 'gap-5 sm:gap-5.5'} w-full`}
            >
              <div className={`flex flex-col ${oauthProviderList.length > 0 ? 'gap-3 sm:gap-3.5' : 'gap-4 sm:gap-4.5'}`}>
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
                    href={getAppealUrl(email)}
                    onClick={(e) => {
                      e.preventDefault();
                      setShowForgotModal(true);
                    }}
                    className="text-[13px] transition-colors hover:text-[var(--epo-cyan-glow)] cursor-pointer"
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

              <div className={`${oauthProviderList.length > 0 ? 'pt-1' : 'pt-2'} flex flex-col gap-2`}>
                {sysConfig?.oauthLoginEnabled && oauthProviderList.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
                      <span className="text-[11.5px] sm:text-[12px] uppercase tracking-wider font-medium" style={{ color: "var(--epo-muted)" }}>
                        {tr('orContinueWith')}
                      </span>
                      <div className="h-px flex-1" style={{ background: "rgba(139,147,196,0.2)" }} />
                    </div>

                    {/* Case 1: 1 Provider (Full-width Hero Capsule) */}
                    {oauthProviderList.length === 1 && renderOAuthButton(oauthProviderList[0], "", true)}

                    {/* Case 2: 2 Providers (1:1 Symmetric Twin Columns) */}
                    {oauthProviderList.length === 2 && (
                      <div className="grid grid-cols-2 gap-2.5 w-full">
                        {oauthProviderList.map((provider) => renderOAuthButton(provider, "h-11"))}
                      </div>
                    )}

                    {/* Case 3: 3 Providers (Desktop 3-Column / Mobile 1-Top + 2-Bottom) */}
                    {oauthProviderList.length === 3 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 w-full">
                        {oauthProviderList.map((provider, idx) =>
                          renderOAuthButton(provider, `h-11 ${idx === 0 ? 'col-span-2 sm:col-span-1' : 'col-span-1'}`)
                        )}
                      </div>
                    )}

                    {/* Case 4: 4 Providers (2x2 Matrix) */}
                    {oauthProviderList.length === 4 && (
                      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 w-full">
                        {oauthProviderList.map((provider) => renderOAuthButton(provider, "h-11"))}
                      </div>
                    )}

                    {/* Case 5+: 5+ Providers (Desktop 3-Top + 2-Bottom Symmetric Grid / Mobile 2+2+1 Compact) */}
                    {oauthProviderList.length >= 5 && (
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 sm:gap-2 w-full">
                        {oauthProviderList.map((provider, idx) => {
                          const desktopSpan = idx < 3 ? 'sm:col-span-2' : 'sm:col-span-3';
                          const mobileSpan = oauthProviderList.length % 2 === 1 && idx === oauthProviderList.length - 1 ? 'col-span-2' : 'col-span-1';
                          return renderOAuthButton(provider, `h-10 sm:h-11 ${mobileSpan} ${desktopSpan}`);
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                <p className="text-center text-[12.5px] sm:text-[13px]" style={{ color: "var(--epo-muted)" }}>
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
              className="flex flex-col justify-center gap-4 sm:gap-4.5 w-full"
            >
              {showMethodSelector ? (
                /* =====================================================================
                   SUB-VIEW: CHOOSE ANOTHER WAY (METHOD SELECTOR)
                   ===================================================================== */
                <div className="flex flex-col justify-center gap-3.5 sm:gap-4 w-full">
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
                    <div className="flex flex-col gap-3 mt-1.5">
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
                            const hash = challengeSessionHash || generateSessionHash();
                            if (!challengeSessionHash) setChallengeSessionHash(hash);
                            updateChallengeUrl('passkey', hash);
                            setTimeout(() => {
                              handlePasskeyLogin();
                            }, 120);
                          }}
                          className={`flex items-center justify-between p-3.5 px-4 rounded-2xl border text-left transition-all ${
                            verifiedFactors.includes('passkey')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'passkey'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <KeyRound size={18} />
                            </div>
                            <div>
                              <div className="text-[14px] font-semibold text-[var(--epo-ink)] leading-snug">
                                {t('methodPasskeyTitle')}
                              </div>
                              <div className="text-[12px] leading-snug text-[var(--epo-muted)] mt-0.5">
                                {t('methodPasskeyDesc')}
                              </div>
                              {verifiedFactors.includes('passkey') && (
                                <span className="text-[10px] text-yellow-400 mt-0.5 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-[var(--epo-muted)] shrink-0 ml-2" />
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
                            const hash = challengeSessionHash || generateSessionHash();
                            if (!challengeSessionHash) setChallengeSessionHash(hash);
                            updateChallengeUrl('totp', hash);
                          }}
                          className={`flex items-center justify-between p-3.5 px-4 rounded-2xl border text-left transition-all ${
                            verifiedFactors.includes('totp')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'totp'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <Smartphone size={18} />
                            </div>
                            <div>
                              <div className="text-[14px] font-semibold text-[var(--epo-ink)] leading-snug">
                                {t('methodTotpTitle')}
                              </div>
                              <div className="text-[12px] leading-snug text-[var(--epo-muted)] mt-0.5">
                                {t('methodTotpDesc')}
                              </div>
                              {verifiedFactors.includes('totp') && (
                                <span className="text-[10px] text-yellow-400 mt-0.5 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-[var(--epo-muted)] shrink-0 ml-2" />
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
                            const hash = challengeSessionHash || generateSessionHash();
                            if (!challengeSessionHash) setChallengeSessionHash(hash);
                            updateChallengeUrl('backup', hash);
                          }}
                          className={`flex items-center justify-between p-3.5 px-4 rounded-2xl border text-left transition-all ${
                            verifiedFactors.includes('backup_code')
                              ? 'opacity-40 cursor-not-allowed border-[rgba(139,147,196,0.15)] bg-[rgba(255,255,255,0.01)]'
                              : active2FAMethod === 'backup_code'
                              ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer'
                              : 'border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] hover:border-indigo-400/40 hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                              <ShieldCheck size={18} />
                            </div>
                            <div>
                              <div className="text-[14px] font-semibold text-[var(--epo-ink)] leading-snug">
                                {t('methodBackupTitle')}
                              </div>
                              <div className="text-[12px] leading-snug text-[var(--epo-muted)] mt-0.5">
                                {t('methodBackupDesc')}
                              </div>
                              {verifiedFactors.includes('backup_code') && (
                                <span className="text-[10px] text-yellow-400 mt-0.5 inline-block">
                                  {t('factorAlreadyUsed')}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-[var(--epo-muted)] shrink-0 ml-2" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* =====================================================================
                   SUB-VIEW: ACTIVE METHOD VERIFICATION
                   ===================================================================== */
                <div className="flex flex-col justify-center gap-3.5 sm:gap-4 w-full">
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
                    <div className="rounded-xl border border-yellow-500/40 bg-yellow-950/20 p-2.5 text-[12px] leading-relaxed backdrop-blur-sm shadow-[0_0_15px_rgba(234,179,8,0.15)] flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-yellow-400 font-medium text-[12px]">
                        <ShieldAlert size={15} className="shrink-0" />
                        <span>{t('stepUpBadge')}</span>
                      </div>
                      <p className="text-yellow-200/80 text-[11px] leading-snug">
                        {t('stepUpDesc')}
                      </p>
                      {verifiedFactors.length > 0 && (
                        <div className="text-[10px] text-green-300 bg-green-950/40 border border-green-500/30 rounded px-2 py-0.5 self-start">
                          {t('stepUpFactorPassed').replace('{factor}', verifiedFactors.map(getFactorName).join(', '))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2FA Header banner (Adaptive: Compact in Step-Up mode, full centered otherwise) */}
                  {stepUpActive ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] backdrop-blur-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                          {active2FAMethod === 'passkey' ? (
                            <KeyRound size={16} />
                          ) : active2FAMethod === 'backup_code' ? (
                            <ShieldCheck size={16} />
                          ) : (
                            <Smartphone size={16} />
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--epo-ink)] leading-tight truncate">
                            {active2FAMethod === 'passkey'
                              ? t('methodPasskeyTitle')
                              : active2FAMethod === 'backup_code'
                              ? t('backupCodeTitle')
                              : t('totpTitle')}
                          </div>
                          <div className="text-[11px] text-[var(--epo-muted)] leading-tight truncate mt-0.5">
                            {active2FAMethod === 'passkey'
                              ? t('methodPasskeyDesc')
                              : active2FAMethod === 'backup_code'
                              ? t('backupCodeHint')
                              : t('totpHint')}
                          </div>
                        </div>
                      </div>
                      {mfaEmail && (
                        <div className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[rgba(103,232,249,0.1)] text-[var(--epo-cyan-glow)] border border-[rgba(103,232,249,0.25)] shrink-0 ml-2">
                          {mfaEmail}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 2FA Header card banner (Full centered) */
                    <div className="flex flex-col items-center text-center gap-2 rounded-2xl p-4 border border-[rgba(139,147,196,0.2)] bg-[rgba(255,255,255,0.03)] backdrop-blur-sm">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
                        {active2FAMethod === 'passkey' ? (
                          <KeyRound size={22} />
                        ) : active2FAMethod === 'backup_code' ? (
                          <ShieldCheck size={22} />
                        ) : (
                          <Smartphone size={22} />
                        )}
                      </div>
                      <h2 className="text-[16px] font-semibold text-[var(--epo-ink)] tracking-wide">
                        {active2FAMethod === 'passkey'
                          ? t('methodPasskeyTitle')
                          : active2FAMethod === 'backup_code'
                          ? t('backupCodeTitle')
                          : t('totpTitle')}
                      </h2>
                      <p className="text-[12px] leading-relaxed max-w-[320px]" style={{ color: "var(--epo-muted)" }}>
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
                  )}

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
                      <div className="flex items-center justify-center px-0.5">
                        <label
                          className="group inline-flex items-center gap-2 cursor-pointer select-none text-[12px] transition-colors focus-visible:outline-none"
                          onClick={() => setRememberDevice((prev) => !prev)}
                        >
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all duration-200 ${
                              rememberDevice
                                ? "bg-gradient-to-br from-cyan-400 to-indigo-500 border-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.4)]"
                                : "bg-[rgba(255,255,255,0.04)] border-[rgba(139,147,196,0.3)] group-hover:border-[var(--epo-cyan-glow)]"
                            }`}
                          >
                            {rememberDevice && (
                              <Check size={11} strokeWidth={3} className="text-[#0b0e22]" />
                            )}
                          </div>
                          <span
                            className="text-[12px] tracking-wide transition-colors group-hover:text-[var(--epo-ink)]"
                            style={{ color: rememberDevice ? "var(--epo-ink)" : "var(--epo-muted)" }}
                          >
                            {t('rememberDevice')}
                          </span>
                        </label>
                      </div>
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
                          <div
                            className="relative inline-flex items-center"
                            onMouseEnter={() => setShowHelp(true)}
                            onMouseLeave={() => setShowHelp(false)}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setShowHelp((prev) => !prev);
                              }}
                              className="flex items-center gap-1 hover:text-[var(--epo-cyan-glow)] transition-colors cursor-pointer group focus-visible:outline-none"
                              aria-label={t('havingTrouble')}
                            >
                              <span>{t('havingTrouble')}</span>
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold group-hover:border-[var(--epo-cyan-glow)] group-hover:text-[var(--epo-cyan-glow)] group-hover:bg-cyan-500/10 transition-colors shadow-[0_0_8px_rgba(99,102,241,0.25)]">
                                ?
                              </span>
                            </button>

                            {/* Floating Hover Tooltip: 悬停的"?"解释说明而非下拉菜单 */}
                            <AnimatePresence>
                              {showHelp && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                                  transition={{ duration: 0.16, ease: "easeOut" }}
                                  className="pointer-events-none absolute right-0 bottom-full mb-2 w-64 z-50 rounded-2xl border border-[rgba(139,147,196,0.3)] bg-[rgba(15,18,37,0.96)] p-3 text-[11px] leading-relaxed backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(99,102,241,0.2)] text-left"
                                  style={{ color: "var(--epo-muted)" }}
                                >
                                  <div className="flex items-center gap-1.5 font-semibold text-[var(--epo-ink)] mb-1.5">
                                    <HelpCircle size={13} className="text-[var(--epo-cyan-glow)] shrink-0" />
                                    <span>{t('troubleshootTitle')}</span>
                                  </div>
                                  <ul className="list-disc pl-4 space-y-1 text-[11px] leading-snug">
                                    <li>{t('troubleshoot1')}</li>
                                    <li>{t('troubleshoot2')}</li>
                                    <li>{t('troubleshoot3')}</li>
                                  </ul>
                                  {/* Pointer arrow pointing down to the trigger */}
                                  <div className="absolute right-3 -bottom-1 h-2 w-2 rotate-45 border-r border-b border-[rgba(139,147,196,0.3)] bg-[rgba(15,18,37,0.96)]" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
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

                  {/* Remember Device Checkbox: "以后本设备登录不再验证" */}
                  {active2FAMethod !== 'passkey' && (
                    <div className="flex items-center justify-start px-0.5 pt-0.5">
                      <label
                        className="group inline-flex items-center gap-2 cursor-pointer select-none text-[12px] transition-colors focus-visible:outline-none"
                        onClick={() => setRememberDevice((prev) => !prev)}
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all duration-200 ${
                            rememberDevice
                              ? "bg-gradient-to-br from-cyan-400 to-indigo-500 border-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.4)]"
                              : "bg-[rgba(255,255,255,0.04)] border-[rgba(139,147,196,0.3)] group-hover:border-[var(--epo-cyan-glow)]"
                          }`}
                        >
                          {rememberDevice && (
                            <Check size={11} strokeWidth={3} className="text-[#0b0e22]" />
                          )}
                        </div>
                        <span
                          className="text-[12px] tracking-wide transition-colors group-hover:text-[var(--epo-ink)]"
                          style={{ color: rememberDevice ? "var(--epo-ink)" : "var(--epo-muted)" }}
                        >
                          {t('rememberDevice')}
                        </span>
                      </label>
                    </div>
                  )}

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
                  <div className="pt-2 flex flex-col gap-2">
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
