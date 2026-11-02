import axios from "axios";
import router from "@/router";
import i18n from "@/i18n/index.js";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {forceLogoutToLogin} from "@/utils/auth.js";
import { attachRequestSession, isCurrentResponse } from '@/utils/tab-session.js';
import { isLocalSessionEnded } from '@/utils/device-privacy.js';
import { normalizeUiLocale } from '@/utils/ui-locale.js';

let http = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL,
    timeout: 15000
});

http.interceptors.request.use(config => {
    if (isLocalSessionEnded()) return Promise.reject(new axios.CanceledError('Local session ended'));
    const { lang } = useSettingStore();
    attachRequestSession(config);
    config.headers['accept-language'] = normalizeUiLocale(lang || 'zh')
    return config
})

http.interceptors.response.use((res) => {
    if (isLocalSessionEnded() || !isCurrentResponse(res.config)) {
        return Promise.reject(new axios.CanceledError('Session changed'));
    }

    return new Promise((resolve, reject) => {

        const noMsg = res.config.noMsg;
        const data = res.data

        if (res.config.url?.includes('/email/list') || res.config.url?.includes('/email/latest')) {
            useUiStore().lastSyncTime = Date.now()
        }

        // 无论是否配置了 noMsg（长轮询/静默请求等），401 凭证过期均必须强制退回登录界面
        if (data.code === 401) {
            forceLogoutToLogin(data.message, res.config.authSession);
            return reject(data);
        }

        if (noMsg) {
            data.code === 200 ? resolve(data.data) : reject(data);
            return;
        }

        if (data.code === 403) {
            ElMessage({
                message: data.message,
                type: 'warning',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
            return reject(data)
        } else if (data.code === 502) {
            ElMessage({
                message: data.message,
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
            return reject(data)
        } else if (data.code !== 200) {
            ElMessage({
                message: data.message,
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
            return reject(data)
        }
        resolve(data.data)
    })
},
(error) => {
    if (isLocalSessionEnded() || axios.isCancel(error)) return Promise.reject(error);
    if (error.config && !isCurrentResponse(error.config)) return Promise.reject(error);

    // 捕获所有 HTTP 401 响应并强制回退到登录页
    if (error.status === 401 || error.response?.status === 401 || error.response?.data?.code === 401) {
        forceLogoutToLogin(error.response?.data?.message, error.config?.authSession);
        return Promise.reject(error);
    }

    const noMsg = error.config?.noMsg;
    if (noMsg) return Promise.reject(error);

    if (error.status === 403 || error.response?.status === 403) {
        ElMessage({
            message: error.response?.data?.message || i18n.global.t('unauthorizedAccess') || '无权访问该资源',
            type: 'warning',
            plain: true,
            grouping: true,
            repeatNum: -4,
        });
        return Promise.reject(error);
    }

    if (error.message && error.message.includes('Network Error')) {
        ElMessage({
            message: i18n.global.t('networkErrorMsg'),
            type: 'error',
            plain: true,
            grouping: true,
            repeatNum: -4,
        })
    } else if (error.code === 'ECONNABORTED') {
        ElMessage({
            message: i18n.global.t('timeoutErrorMsg'),
            type: 'error',
            plain: true,
            grouping: true
        })
    } else if (error.response) {
        ElMessage({
            message: i18n.global.t('serverBusyErrorMsg'),
            type: 'error',
            plain: true,
            grouping: true,
            repeatNum: -4,
        })
    } else {
        ElMessage({
            message: i18n.global.t('reqFailErrorMsg'),
            type: 'error',
            plain: true,
            grouping: true,
            repeatNum: -4,
        })
    }
    return Promise.reject(error)
})

export default http


