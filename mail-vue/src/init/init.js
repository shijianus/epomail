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

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();
    const uiStore = useUiStore();

    uiStore.initTheme();

    let token = localStorage.getItem('token');
    if (typeof window !== 'undefined') {
        const urlMatch = window.location.pathname.match(/\/mail\/u\/(\d+)/);
        const currentU = urlMatch ? parseInt(urlMatch[1], 10) : 0;
        try {
            const rawSessions = localStorage.getItem('epo_sessions');
            let sessions = rawSessions ? JSON.parse(rawSessions) : [];
            const targetSession = sessions.find(s => s.u === currentU);
            if (targetSession && targetSession.token) {
                if (token !== targetSession.token) {
                    token = targetSession.token;
                    localStorage.setItem('token', token);
                    if (targetSession.email) {
                        localStorage.setItem('loginEmail', targetSession.email);
                    }
                }
            } else if (!sessions.length && token) {
                const email = localStorage.getItem('loginEmail') || '';
                sessions = [{ u: 0, token, email }];
                localStorage.setItem('epo_sessions', JSON.stringify(sessions));
            }
        } catch (_) {}
    }
    if (!settingStore.lang) {
        const rawNav = (navigator.language || '').toLowerCase();
        let lang = 'en';
        if (rawNav.startsWith('zh-tw') || rawNav.startsWith('zh-hk') || rawNav.startsWith('zh-mo') || rawNav.startsWith('zh-hant')) {
            lang = 'zh-Hant';
        } else if (rawNav.startsWith('zh')) {
            lang = 'zh';
        } else if (rawNav.startsWith('fr')) {
            lang = 'fr';
        } else if (rawNav.startsWith('es')) {
            lang = 'es';
        } else if (rawNav.startsWith('nl')) {
            lang = 'nl';
        } else {
            lang = 'en';
        }
        settingStore.lang = lang;
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 10000));

        if (token) {
            const userPromise = Promise.race([loginUserInfo(), timeoutPromise]).catch(e => {
                console.error('loginUserInfo error:', e);
                return null;
            });

            const settingPromise = Promise.race([websiteConfig(), timeoutPromise]).catch(e => {
                console.error('websiteConfig failed:', e);
                return null;
            });

            const [s, user] = await Promise.all([settingPromise, userPromise]);
            setting = s;

            if (setting) {
                settingStore.settings = setting;
                settingStore.domainList = setting.domainList;
                document.title = setting.title;
                if (setting.multiAccountEnabled !== undefined && setting.multiAccountEnabled !== null) {
                    localStorage.setItem('multiAccountEnabled', String(setting.multiAccountEnabled));
                }
            }

            if (user) {
                const storedLoginEmail = localStorage.getItem('loginEmail');
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

                // Update session info in epo_sessions
                try {
                    const urlMatch = window.location.pathname.match(/\/mail\/u\/(\d+)/);
                    const currentU = urlMatch ? parseInt(urlMatch[1], 10) : 0;
                    const rawSessions = localStorage.getItem('epo_sessions');
                    let sessions = rawSessions ? JSON.parse(rawSessions) : [];
                    let targetS = sessions.find(s => s.u === currentU);
                    if (!targetS) {
                        targetS = { u: currentU, token };
                        sessions.push(targetS);
                    }
                    targetS.email = user.email || storedLoginEmail || targetS.email;
                    targetS.name = user.name || user.nickname || targetS.email;
                    targetS.avatarUrl = user.avatarUrl || '';
                    targetS.roleName = user.role?.name || '';
                    localStorage.setItem('epo_sessions', JSON.stringify(sessions));
                } catch (_) {}

                const routers = permsToRouter(user.permKeys);
                routers.forEach(routerData => {
                    router.addRoute('layout', routerData);
                });
            } else {
                // Token 存在但无法获取用户信息，说明 token 已过期或已被销毁，执行清理并强制退回到登录页
                uiStore.resetToDefaults();
                clearAuthStorage({ preserveEmail: true });
                try {
                    sessionStorage.setItem('auth_expired_msg', i18n.global.t('authExpiredMsg'));
                } catch (_) {}

                const pathname = window.location.pathname;
                const isOauth = pathname.startsWith('/oauth');
                const isPublicProfile = pathname !== '/' && !['inbox', 'all', 'sent', 'drafts', 'starred', 'snoozed', 'spam', 'trash', 'message', 'settings', 'manage', 'admin', 'system-setting', 'sys-setting', 'all-users', 'role', 'roles', 'invite-code', 'reg-key', 'analysis', 'login'].some(p => pathname.toLowerCase().startsWith('/' + p));

                if (!isOauth && !isPublicProfile) {
                    window.location.replace('/login/?reason=expired');
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
