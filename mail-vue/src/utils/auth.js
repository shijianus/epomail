import i18n from "@/i18n/index.js";
import { clearCurrentSession, isLocalSessionEnded } from '@/utils/device-privacy.js';
import { getTabIdentity, isSameTabIdentity, tabSession } from '@/utils/tab-session.js';

let isLoggingOut = false;
let pendingClosure = 0;
let deferredMessage;

// A deletion request disables the server session before cleanup finishes.
// Defer polling 401 redirects until the UI can show the actual deletion result.
export function deferForcedLogout() {
  pendingClosure++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pendingClosure--;
    if (!pendingClosure && deferredMessage !== undefined) {
      const deferred = deferredMessage;
      deferredMessage = undefined;
      if (!isLocalSessionEnded()) forceLogoutToLogin(deferred.message, deferred.session);
    }
  };
}

/** Clear the current sign-in and sensitive caches; keep local drafts. */
export function clearAuthStorage(options = {}) {
  return clearCurrentSession({ preserveEmail: true, ...options });
}

/**
 * 统一被动/强制退出至登录界面
 * @param {string} [message] 退出原因提示信息
 */
export function forceLogoutToLogin(message, session = getTabIdentity()) {
  if (!session || !isSameTabIdentity(session, tabSession.current())) return false;
  if (isLocalSessionEnded()) return false;
  if (pendingClosure) { deferredMessage = { message: message || '', session }; return false; }
  if (isLoggingOut) return false;
  isLoggingOut = true;

  clearAuthStorage({ preserveEmail: true, session });

  const expiredMsg = message || i18n.global.t('authExpired');

  try {
    sessionStorage.setItem('auth_expired_msg', expiredMsg);
  } catch (_) {}

  // 立即通过 replace 硬重定向到独立的登录应用，避免停留在当前组件或陷入 SPA 路由守卫死循环
  const targetUrl = '/login/?reason=expired';

  // 使用微延迟确保消息已写入 storage，并打断任何未结束的微任务
  setTimeout(() => {
    if (window.location.pathname !== '/login/' && !window.location.pathname.startsWith('/login')) {
      window.location.replace(targetUrl);
    }
  }, 50);
}
