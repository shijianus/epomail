import i18n from "@/i18n/index.js";

let isLoggingOut = false;

/**
 * 清除所有本地身份凭证（保留 loginEmail 便于在登录页回填）
 */
export function clearAuthStorage(options = {}) {
  const { preserveEmail = true } = options;
  const savedEmail = preserveEmail ? localStorage.getItem('loginEmail') : null;

  localStorage.removeItem('token');
  localStorage.removeItem('ui');
  if (!preserveEmail) {
    localStorage.removeItem('loginEmail');
  } else if (savedEmail) {
    localStorage.setItem('loginEmail', savedEmail);
  }
}

/**
 * 统一被动/强制退出至登录界面
 * @param {string} [message] 退出原因提示信息
 */
export function forceLogoutToLogin(message) {
  if (isLoggingOut) return;
  isLoggingOut = true;

  clearAuthStorage({ preserveEmail: true });

  const expiredMsg = message || (i18n?.global?.t ? i18n.global.t('authExpired') : '') || '登录凭证已过期，请重新登录';

  try {
    sessionStorage.setItem('auth_expired_msg', expiredMsg);
  } catch (_) {}

  // 立即通过 replace 硬重定向到独立的登录应用，避免停留在当前组件或陷入 SPA 路由守卫死循环
  const targetUrl = '/login/?reason=expired';

  // 使用微延迟确保消息已写入 storage，并打断任何未结束的微任务
  setTimeout(() => {
    if (window.location.pathname !== '/login/' && !window.location.pathname.startsWith('/login')) {
      window.location.replace(targetUrl);
    } else {
      window.location.replace('/login/?reason=expired');
    }
  }, 50);
}
