import { defineStore } from 'pinia'

// 系统内置标签模板（用于兜底注入）
export const BUILTIN_LABELS = [
  { name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
    { condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
  ]},
  { name: '订阅', icon: 'ic:outline-subscriptions', color: '#10b981', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
    { condition: { type: 'system_setting', value: '' } }
  ]},
  { name: '推销', icon: 'ic:outline-local-offer', color: '#f59e0b', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
    { condition: { type: 'system_setting', value: '' } }
  ]},
  { name: '系统设置', icon: 'ic:outline-settings', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
]

export const MAX_LABELS = 7

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
        // 统一标签列表，最多 MAX_LABELS 个
        allLabels: [
          { name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            { condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
          ]},
          { name: '订阅', icon: 'ic:outline-subscriptions', color: '#10b981', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            { condition: { type: 'system_setting', value: '' } }
          ]},
          { name: '推销', icon: 'ic:outline-local-offer', color: '#f59e0b', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
            { condition: { type: 'system_setting', value: '' } }
          ]},
          { name: '系统设置', icon: 'ic:outline-settings', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
        ],
        customSvgs: [],
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        },
        lastSyncTime: Date.now()
    }),
    getters: {
        // 向后兼容：其他地方读取 customLabels / defaultLabels 时转发到 allLabels
        customLabels: (state) => state.allLabels,
        defaultLabels: (state) => state.allLabels,
    },
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        },
        // 确保内置标签的系统规则始终存在（幂等）
        ensureDefaultRules() {
            const CANONICAL = {
                '社群': [{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }],
                '订阅': [{ condition: { type: 'system_setting', value: '' } }],
                '推销': [{ condition: { type: 'system_setting', value: '' } }],
                '系统设置': []
            }

            // 强制恢复被错误删除的系统设置标签
            if (!this.allLabels.some(l => l.name === '系统设置')) {
                this.allLabels.push({ name: '系统设置', icon: 'ic:outline-settings', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [] })
            }

            // 保证内置标签存在（如果被删则不重注入——除了系统设置外，其他均允许用户删除）
            this.allLabels.forEach(label => {
                const canonicals = CANONICAL[label.name]
                if (!canonicals) return
                if (!label.rules) label.rules = []
                canonicals.forEach(cRule => {
                    const alreadyHas = label.rules.some(r => r.condition?.type === cRule.condition?.type)
                    if (!alreadyHas) {
                        label.rules.push({ ...cRule, condition: { ...cRule.condition } })
                    }
                })
            })
        },
        // 获取全量标签（供 rule-engine 等使用）
        getAllLabelNames() {
            return this.allLabels.map(l => l.name)
        }
    },
    persist: {
        pick: ['accountShow', 'dark', 'allLabels', 'customSvgs'],
    },
})
