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

    const token = localStorage.getItem('token');
    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
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

                const routers = permsToRouter(user.permKeys);
                routers.forEach(routerData => {
                    router.addRoute('layout', routerData);
                });
            } else {
                // Token 存在但无法获取用户信息，说明 token 已过期或已被销毁，执行清理并强制退回到登录页
                uiStore.resetToDefaults();
                clearAuthStorage({ preserveEmail: true });
                try {
                    sessionStorage.setItem('auth_expired_msg', '登录凭证已过期，请重新登录');
                } catch (_) {}

                const pathname = window.location.pathname;
                const isOauth = pathname.startsWith('/oauth');
                const isPublicProfile = pathname !== '/' && !['inbox', 'all', 'sent', 'drafts', 'starred', 'snoozed', 'spam', 'trash', 'message', 'settings', 'system-setting', 'sys-setting', 'all-users', 'role', 'roles', 'invite-code', 'reg-key', 'analysis', 'login'].some(p => pathname.toLowerCase().startsWith('/' + p));

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
            }
        }
    } catch (e) {
        console.error('init() unexpected error:', e);
    }
}
