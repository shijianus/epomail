import { defineStore } from 'pinia'
import { getWallpaperCssById } from '@/utils/theme-presets.js'

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
  { name: '工作', icon: 'ic:outline-work-outline', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
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
        themeMode: 'auto',
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
          { name: '工作', icon: 'ic:outline-work-outline', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
        ],
        customSvgs: [],
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        },
        lastSyncTime: Date.now(),
        // Gmail-style core view preferences
        density: 'default', // 'default' | 'comfortable' | 'compact'
        inboxType: 'default', // 'default' | 'important' | 'unread' | 'starred' | 'priority' | 'multiple'
        inboxConfig: {
            default: {
                categories: { primary: true, promotions: true, social: true, updates: true, forums: false },
                includeStarredInPrimary: true
            },
            priority: {
                sections: [
                    { type: 'important_unread', maxItems: 10 },
                    { type: 'starred', maxItems: 10 },
                    { type: 'none', maxItems: 10 },
                    { type: 'everything', maxItems: 25 }
                ],
                hideEmpty: true
            },
            multiple: {
                panels: [
                    { query: 'is:starred', title: '星标邮件' },
                    { query: 'is:unread', title: '未读邮件' },
                    { query: 'has:attachment', title: '含附件' },
                    { query: 'label:work', title: '工作' }
                ],
                maxItems: 10,
                position: 'right'
            }
        },
        readingPane: 'right', // 'right' | 'below' | 'no_split'
        conversationView: true,
        themeWallpaper: '', // preset id or image url
        themeWallpaperOpacity: 85
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
        ensureDefaultRules() {
            // Aggressively clean up deprecated '系统设置' label that might be cached
            const deprecatedIdx = this.allLabels.findIndex(l => l.name === '系统设置')
            if (deprecatedIdx !== -1) {
                this.allLabels.splice(deprecatedIdx, 1)
            }

            // ── Stats 净化：清除 localStorage 持久化的幽灵统计数据 ──────────────
            // stats（total/current/unread）是动态指标，需由后端实时接口填充，
            // 不应通过 persist 固化到本地。历史版本曾将测试数据 (total:100, unread:5)
            // 错误地写入初始状态，此处强制将所有标签的 stats 归零以消除幽灵邮件显示。
            this.allLabels.forEach(label => {
                if (label.stats) {
                    label.stats.total = 0
                    label.stats.current = 0
                    label.stats.unread = 0
                } else {
                    label.stats = { total: 0, current: 0, unread: 0 }
                }
            })

            const CANONICAL = {
                '社群': [{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }],
                '订阅': [{ condition: { type: 'system_setting', value: '' } }],
                '推销': [{ condition: { type: 'system_setting', value: '' } }],
                '工作': []
            }

            // 强制恢复被错误删除的工作标签
            if (!this.allLabels.some(l => l.name === '工作')) {
                this.allLabels.push({ name: '工作', icon: 'ic:outline-work-outline', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [] })
            } else {
                // Ensure the icon is updated if it was previously migrated from 系统设置
                const workLabel = this.allLabels.find(l => l.name === '工作')
                if (workLabel.icon === 'ic:outline-settings') {
                    workLabel.icon = 'ic:outline-work-outline'
                }
            }

            // 保证内置标签存在（如果被删则不重注入——除了工作外，其他均允许用户删除）
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
        },
        setThemeMode(mode) {
            this.themeMode = mode;
            let targetDark = true;
            if (mode === 'light') {
                targetDark = false;
            } else if (mode === 'dark') {
                targetDark = true;
            } else {
                targetDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
            }
            this.dark = targetDark;
            this.applyTheme(targetDark);
        },
        applyTheme(isDark) {
            if (typeof document === 'undefined') return;
            const root = document.documentElement;
            root.classList.toggle('dark', !!isDark);
            const metaTag = document.getElementById('theme-color-meta');
            const isMobile = typeof window !== 'undefined' && !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
            if (metaTag) {
                metaTag.setAttribute('content', isDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#FFFFFF' : '#F1F1F1'));
            }
        },
        setDensity(density) {
            this.density = density;
        },
        setInboxType(type) {
            this.inboxType = type;
        },
        setInboxConfig(type, cfg) {
            if (!this.inboxConfig) this.inboxConfig = {};
            this.inboxConfig[type] = { ...this.inboxConfig[type], ...cfg };
        },
        setReadingPane(pane) {
            this.readingPane = pane;
        },
        setConversationView(val) {
            this.conversationView = !!val;
        },
        setThemeWallpaper(wallpaper) {
            this.themeWallpaper = wallpaper;
            this.applyMainWallpaper();
        },
        setThemeWallpaperOpacity(opacity) {
            this.themeWallpaperOpacity = Number(opacity) || 85;
            this.applyMainWallpaper();
        },
        applyMainWallpaper() {
            if (typeof document === 'undefined') return;
            const root = document.documentElement;
            let bgCss = '';
            if (this.themeWallpaper && this.themeWallpaper !== 'none') {
                bgCss = getWallpaperCssById(this.themeWallpaper);
            }
            if (bgCss) {
                root.style.setProperty('--main-wallpaper-url', bgCss);
                root.style.setProperty('--main-wallpaper-alpha', `${this.themeWallpaperOpacity || 85}%`);
                root.style.setProperty('--panel-alpha', `${this.themeWallpaperOpacity || 85}%`);
                root.classList.add('has-main-wallpaper');
                if (document.body) document.body.classList.add('has-main-wallpaper');
            } else {
                root.style.setProperty('--main-wallpaper-url', 'none');
                root.style.setProperty('--main-wallpaper-alpha', '100%');
                root.style.setProperty('--panel-alpha', '100%');
                root.classList.remove('has-main-wallpaper');
                if (document.body) document.body.classList.remove('has-main-wallpaper');
            }
        },
        initTheme() {
            if (typeof window === 'undefined') return;
            if (!this.themeMode) {
                this.themeMode = this.dark ? 'dark' : 'light';
            }
            if (this.themeMode === 'auto' || this.themeMode === 'system') {
                this.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
            this.applyTheme(this.dark);
            this.applyMainWallpaper();

            if (window.matchMedia) {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                if (mediaQuery.addEventListener) {
                    mediaQuery.addEventListener('change', (e) => {
                        if (this.themeMode === 'auto' || this.themeMode === 'system') {
                            this.dark = e.matches;
                            this.applyTheme(this.dark);
                        }
                    });
                }
            }
        }
    },
    persist: {
        pick: [
            'accountShow',
            'dark',
            'themeMode',
            'allLabels',
            'customSvgs',
            'density',
            'inboxType',
            'inboxConfig',
            'readingPane',
            'conversationView',
            'themeWallpaper',
            'themeWallpaperOpacity'
        ],
    },
})
