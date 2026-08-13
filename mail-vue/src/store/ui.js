import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        accountShow: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        dark: true,
        showAddLabel: false,
        customLabels: [],
        defaultLabels: [
          { name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, stats: { total: 1250, current: 340, unread: 12 }, rules: [
            { condition: { type: 'sender_includes', value: '@gmail.com' } }, 
            { condition: { type: 'sender_includes', value: '@outlook.com' } }, 
            { condition: { type: 'sender_includes', value: '@yahoo.com' } }
          ]},
          { name: '工作', icon: 'ic:outline-work-outline', color: '#f59e0b', listVis: true, stats: { total: 850, current: 120, unread: 5 }, rules: [
            { condition: { type: 'is_corporate', value: true } }
          ]},
          { name: '推销', icon: 'ic:outline-local-offer', color: '#ef4444', listVis: true, stats: { total: 4200, current: 56, unread: 0 }, rules: [
            { condition: { type: 'in_blacklist', value: true } }
          ]},
          { name: '订阅', icon: 'ic:outline-rss-feed', color: '#10b981', listVis: true, stats: { total: 3100, current: 890, unread: 45 }, rules: [
            { 
              condition: { type: 'in_whitelist', value: true },
              exception: { type: 'in_blacklist', value: true }
            }
          ]}
        ],
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        },
        lastSyncTime: Date.now()
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        }
    },
    persist: {
        pick: ['accountShow','dark', 'customLabels', 'defaultLabels'],
    },
})
