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
          { name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, rules: [{type: 'domain', value: '@gmail.com'}, {type: 'domain', value: '@outlook.com'}, {type: 'domain', value: '@yahoo.com'}] },
          { name: '工作', icon: 'ic:outline-work-outline', color: '#f59e0b', listVis: true, rules: [] },
          { name: '推销', icon: 'ic:outline-local-offer', color: '#ef4444', listVis: true, rules: [] },
          { name: '订阅', icon: 'ic:outline-rss-feed', color: '#10b981', listVis: true, rules: [] }
        ],
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
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
