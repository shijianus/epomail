import { useRef, useEffect, useState, useMemo } from "react";
import { CanvasBackground } from "./components/epomail/CanvasBackground";
import type { CanvasHandle } from "./components/epomail/CanvasBackground";
import { LoginCard } from "./components/epomail/LoginCard";
import { RegisterCard } from "./components/epomail/RegisterCard";
import { PassingPlanets } from "./components/epomail/PassingPlanets";
import { cameraState, updateCameraPhysics } from "./components/epomail/cameraStore";
import { ErrorBoundary } from "./components/ErrorBoundary";

// 站点配置整页只需拉取一次，登录/注册视图切换不再重复请求
let sysConfigPromise: Promise<any> | null = null;
function loadSysConfig(): Promise<any> {
  if (!sysConfigPromise) {
    sysConfigPromise = fetch('/api/setting/websiteConfig')
      .then(r => r.json())
      .then(data => (data.code === 200 ? data.data : null))
      .catch(e => {
        sysConfigPromise = null;
        console.error(e);
        return null;
      });
  }
  return sysConfigPromise;
}

export default function App() {
  const [view, setView] = useState<'login' | 'register'>('login');
  const [sysConfig, setSysConfig] = useState<any>(null);
  const canvasRef = useRef<CanvasHandle | null>(null);
  const authErrorRef = useRef<HTMLDivElement>(null);
  const authSuccessRef = useRef<HTMLDivElement>(null);
  // 尊重系统「减少动态效果」：跳过行星飞掠等装饰动画（星空画布内部已自行适配）
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    loadSysConfig().then(setSysConfig);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const isRegister = window.location.search.includes('view=register');
      setView(isRegister ? 'register' : 'login');
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState(); // initial load
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSwitchView = (newView: 'login' | 'register') => {
    setView(newView);
    if (newView === 'register') {
      window.history.pushState(null, '', '/login/?view=register');
    } else {
      window.history.pushState(null, '', '/login/');
    }
  };

  useEffect(() => {
    let raf: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update global camera physics
      updateCameraPhysics(dt);

      if (authErrorRef.current) {
        // Suppress yellow if green is active
        const effectiveErrorOpacity = cameraState.authSuccessOpacity > 0 ? 0 : cameraState.authErrorOpacity;
        authErrorRef.current.style.opacity = effectiveErrorOpacity.toString();
      }

      if (authSuccessRef.current) {
        authSuccessRef.current.style.opacity = cameraState.authSuccessOpacity.toString();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div
        className="epomail relative size-full min-h-screen overflow-hidden"
        style={{ background: "var(--epo-void)" }}
      >
        <CanvasBackground ref={canvasRef} />
        {!reduceMotion && <PassingPlanets />}
        <div className="relative h-full min-h-screen">
          <ErrorBoundary onReset={() => handleSwitchView('login')}>
            {view === 'login' ? (
              <LoginCard canvasRef={canvasRef} sysConfig={sysConfig} onSwitch={() => handleSwitchView('register')} />
            ) : (
              <RegisterCard canvasRef={canvasRef} sysConfig={sysConfig} onSwitch={() => handleSwitchView('login')} />
            )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Yellow Warning HUD on Login Error */}
      <div
        ref={authErrorRef}
        className="fixed inset-0 z-[55] pointer-events-none overflow-hidden transition-opacity duration-300"
        style={{
          opacity: 0,
          willChange: 'opacity',
          transform: 'translateZ(0)',
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(234, 179, 8, 0.05) 100%)',
          boxShadow: 'inset 0 0 100px rgba(234, 179, 8, 0.2)'
        }}
      >
        <div className="absolute top-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-t-4 border-l-4 border-yellow-500/50 m-4 sm:m-6" />
        <div className="absolute top-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-t-4 border-r-4 border-yellow-500/50 m-4 sm:m-6" />
        <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-b-4 border-l-4 border-yellow-500/50 m-4 sm:m-6" />
        <div className="absolute bottom-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-b-4 border-r-4 border-yellow-500/50 m-4 sm:m-6" />
      </div>

      {/* Green Success HUD on Login Success */}
      <div
        ref={authSuccessRef}
        className="fixed inset-0 z-[55] pointer-events-none overflow-hidden transition-opacity duration-300"
        style={{
          opacity: 0,
          willChange: 'opacity',
          transform: 'translateZ(0)',
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(34, 197, 94, 0.05) 100%)',
          boxShadow: 'inset 0 0 100px rgba(34, 197, 94, 0.2)'
        }}
      >
        <div className="absolute top-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-t-4 border-l-4 border-green-500/50 m-4 sm:m-6" />
        <div className="absolute top-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-t-4 border-r-4 border-green-500/50 m-4 sm:m-6" />
        <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-b-4 border-l-4 border-green-500/50 m-4 sm:m-6" />
        <div className="absolute bottom-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-b-4 border-r-4 border-green-500/50 m-4 sm:m-6" />
      </div>
    </>
  );
}
