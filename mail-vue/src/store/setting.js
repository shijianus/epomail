import { defineStore } from 'pinia'

export const useSettingStore = defineStore('setting', {
    state: () => ({
        domainList: [],
        settings: {
            r2Domain: '',
            loginOpacity: 1.00,
            aiEnabled: 1,
            aiDailyQuota: 0,
            aiRateLimitRpm: 60,
            aiMaxTokens: 2048,
            aiAdminOnly: 0,
            aiModel: '',
            aiModels: '',
            multiAccountEnabled: 0,
            termsUrl: '',
            privacyUrl: '',
            // Audit Report & Risk Control Policy Settings
            auditMaxIpPerAccount: 3,
            auditMaxDevicePerAccount: 3,
            auditCriticalQuota: 3,
            auditAutoCleanOldest: 1,
            auditPrioritizeNonCriticalClean: 1,
            auditOptMailSend: 0,
            auditOptMailReceive: 0,
            auditOptMailDelete: 0,
            auditOptMailStar: 0,
            auditOptMailSchedule: 0,
        },
        lang: '',
    }),
    getters: {
        setting: (state) => state.settings,
    },
    actions: {
        setSettings(data) {
            if (!data) return;
            this.settings = { ...this.settings, ...data };
            if (data.domainList) {
                this.domainList = data.domainList;
            }
        },
    },
    persist: {
        pick: ['lang', 'settings'],
    },
})
