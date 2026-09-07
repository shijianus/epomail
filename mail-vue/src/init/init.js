import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUiStore} from "@/store/ui.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";

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
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3000));

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
                accountStore.currentAccountId = user.account.accountId;
                accountStore.currentAccount = user.account;
                userStore.user = user;

                const routers = permsToRouter(user.permKeys);
                routers.forEach(routerData => {
                    router.addRoute('layout', routerData);
                });
            }

        } else {
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
