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
            { condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
          ]},
          { name: '订阅', icon: 'ic:outline-subscriptions', color: '#10b981', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            { condition: { type: 'system_setting', value: '' } }
          ]},
          { name: '推销', icon: 'ic:outline-local-offer', color: '#f59e0b', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            { condition: { type: 'system_setting', value: '' } }
          ]},
          { name: '系统设置', icon: 'ic:outline-settings', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            // 系统设置默认没有加入条件（后台根据内置逻辑自动归类），用户只能在这里添加排除规则（打补丁）
            // 例如：{ condition: { type: 'none' }, exception: { type: 'sender_is', value: '...' } }
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
