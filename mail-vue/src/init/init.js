import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUiStore} from "@/store/ui.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";
import {clearAuthStorage} from "@/utils/auth.js";
import { tabSession, updateCurrentIdentity, getCurrentLoginEmail } from '@/utils/tab-session.js';
import { resolveUiLocale } from '@/utils/ui-locale.js';

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();
    const uiStore = useUiStore();

    uiStore.initTheme();

    const tabIdentity = tabSession.current();
    const token = tabIdentity?.token || '';
    if (!settingStore.lang) {
        settingStore.lang = resolveUiLocale('', navigator.language);
    } else {
        settingStore.lang = resolveUiLocale(settingStore.lang, navigator.language);
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;
    let transientFailure = false;
    let authRejected = false;

    try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 10000));

        if (token) {
            const userPromise = Promise.race([loginUserInfo(), timeoutPromise]).catch(e => {
                console.error('loginUserInfo error:', e);
                if (e?.code === 401 || e?.code === 403 || e?.response?.status === 401 || e?.response?.status === 403) authRejected = true;
                else transientFailure = true;
                return null;
            });

            const settingPromise = Promise.race([websiteConfig(), timeoutPromise]).catch(e => {
                console.error('websiteConfig failed:', e);
                return null;
            });

            const [s, user] = await Promise.all([settingPromise, userPromise]);
            setting = s && s.__timeout ? null : s;
            if (user && user.__timeout) transientFailure = true;

            if (setting) {
                settingStore.settings = setting;
                settingStore.domainList = setting.domainList;
                document.title = setting.title;
                if (setting.multiAccountEnabled !== undefined && setting.multiAccountEnabled !== null) {
                    localStorage.setItem('multiAccountEnabled', String(setting.multiAccountEnabled));
                }
            }

            if (user) {
                const identity = updateCurrentIdentity({
                    userId: user.userId,
                    email: tabIdentity.email || user.email,
                    name: user.name || user.nickname || user.email,
                    avatarUrl: user.avatarUrl || '',
                    roleName: user.role?.name || '',
                }, tabIdentity);
                if (!identity) {
                    clearAuthStorage({ session: tabIdentity });
                    return;
                }
                const storedLoginEmail = getCurrentLoginEmail();
                if (storedLoginEmail && user.accounts && user.accounts.length) {
                    const matchedAcc = user.accounts.find(a => a.email && a.email.toLowerCase() === storedLoginEmail.toLowerCase());
                    if (matchedAcc) {
                        user.account = matchedAcc;
                        user.email = matchedAcc.email;
                    }
                }
                accountStore.currentAccountId = user.account?.accountId || 0;
                accountStore.currentAccount = user.account || {};
                userStore.applyUserInfo(user);

                // Update this tab's registry row; never select a row by numeric slot alone.
                updateCurrentIdentity({
                    email: user.email || storedLoginEmail,
                    accountEmail: user.email || storedLoginEmail,
                    name: user.name || user.nickname || storedLoginEmail,
                    avatarUrl: user.avatarUrl || '',
                    roleName: user.role?.name || '',
                }, identity);

                const routers = permsToRouter(user.permKeys);
                routers.forEach(routerData => {
                    router.addRoute('layout', routerData);
                });
            } else if (transientFailure && !authRejected) {
                // A timeout/5xx/network failure is not proof that the session was
                // revoked. Keep the stored identity and let the user retry instead
                // of discarding an unsaved draft or forcing a re-login.
                console.warn('Session preserved because the backend is temporarily unavailable');
                return;
            } else {
                // Token 存在但无法获取用户信息，说明 token 已过期或已被销毁，执行清理并强制退回到登录页
                uiStore.resetToDefaults();
                clearAuthStorage({ preserveEmail: true, session: tabIdentity });
                try {
                    sessionStorage.setItem('auth_expired_msg', i18n.global.t('authExpiredMsg'));
                } catch (_) {}

                const pathname = window.location.pathname;
                const isOauth = pathname.startsWith('/oauth');
                const isPublicProfile = pathname !== '/' && !['inbox', 'all', 'sent', 'drafts', 'starred', 'snoozed', 'spam', 'trash', 'message', 'settings', 'manage', 'admin', 'system-setting', 'sys-setting', 'all-users', 'role', 'roles', 'invite-code', 'reg-key', 'analysis', 'login'].some(p => pathname.toLowerCase().startsWith('/' + p));

                if (!isOauth && !isPublicProfile) {
                    if (pathname !== '/login/' && !pathname.startsWith('/login')) {
                        window.location.replace(`/login/?reason=expired&u=${tabIdentity.u}`);
                    }
                    return;
                }
            }

        } else {
            uiStore.resetToDefaults();
            setting = await Promise.race([websiteConfig(), timeoutPromise]).catch(e => {
                console.error('websiteConfig failed:', e);
                return null;
            });
            if (setting) {
                settingStore.settings = setting;
                settingStore.domainList = setting.domainList;
                document.title = setting.title;
                if (setting.multiAccountEnabled !== undefined && setting.multiAccountEnabled !== null) {
                    localStorage.setItem('multiAccountEnabled', String(setting.multiAccountEnabled));
                }
            }
        }
    } catch (e) {
        console.error('init() unexpected error:', e);
    }
}
