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
        },
        lang: '',
    }),
    actions: {

    },
    persist: {
        pick: ['lang'],
    },
})
