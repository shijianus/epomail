import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";
import { useUiStore } from "@/store/ui.js";
import { useSettingStore } from "@/store/setting.js";
import i18n from "@/i18n/index.js";

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        refreshList: 0,
    }),
    actions: {
        refreshUserList() {
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        refreshUserInfo() {
            return loginUserInfo().then(user => {
                this.applyUserInfo(user)
                return user
            })
        },
        applyUserInfo(user) {
            if (!user) return
            this.user = user
            const uiStore = useUiStore()
            const settingStore = useSettingStore()

            // 1. Density: bound to user, fallback to 'default'
            uiStore.density = user.density || 'default'

            // 2. Inbox Type: bound to user, fallback to 'default'
            uiStore.inboxType = user.inboxType || 'default'

            // 3. Inbox Config: bound to user, fallback to default category layout
            if (user.inboxConfig && typeof user.inboxConfig === 'object' && Object.keys(user.inboxConfig).length > 0) {
                uiStore.inboxConfig = { ...uiStore.inboxConfig, ...user.inboxConfig }
            } else {
                uiStore.resetInboxConfig()
            }

            // 4. Reading Pane: bound to user, fallback to 'no_split' (standard webmail default)
            uiStore.readingPane = user.readingPane || 'no_split'

            // 5. Conversation View: bound to user, fallback to true
            uiStore.conversationView = user.conversationView !== undefined ? !!user.conversationView : true

            // 6. Theme Wallpaper & Opacity: bound to user, fallback to 'none'
            uiStore.themeWallpaper = user.themeWallpaper || 'none'
            uiStore.themeWallpaperOpacity = user.themeWallpaperOpacity !== undefined ? Number(user.themeWallpaperOpacity) : 85
            uiStore.applyMainWallpaper()

            // 7. Theme Mode: bound to user, fallback to 'auto'
            if (user.themeMode) {
                uiStore.setThemeMode(user.themeMode)
            } else if (uiStore.themeMode) {
                uiStore.setThemeMode(uiStore.themeMode)
            } else {
                uiStore.setThemeMode('auto')
            }

            // 8. Language: bound to user if specified
            if (user.lang && user.lang !== settingStore.lang) {
                settingStore.lang = user.lang
                try {
                    let setting = JSON.parse(localStorage.getItem('setting') || '{}')
                    localStorage.setItem('setting', JSON.stringify({ ...setting, lang: user.lang }))
                } catch (e) {}
                if (i18n && i18n.global) {
                    i18n.global.locale.value = user.lang
                }
            }

            // 9. Custom Labels: bound to user, fallback to default labels
            if (user.customLabels) {
                try {
                    const parsed = typeof user.customLabels === 'string' ? JSON.parse(user.customLabels) : user.customLabels

                    if (Array.isArray(parsed)) {
                        // 旧格式：纯数组 (只有 customLabels)
                        // 需要与当前 allLabels 合并：DB 里的数组视为全量
                        if (parsed.length > 0) {
                            uiStore.allLabels = parsed
                        }
                    } else if (parsed && typeof parsed === 'object') {
                        // 旧格式：{ customLabels: [...], defaultLabels: [...] }
                        // 将两者合并为统一 allLabels
                        const dbCustom = parsed.customLabels || []
                        const dbDefs   = parsed.defaultLabels || []
                        const dbAll    = [...dbDefs, ...dbCustom]

                        if (dbAll.length > 0) {
                            // ① 把 DB 里有的标签合并进来
                            const merged = [...uiStore.allLabels]

                            dbAll.forEach(dbLabel => {
                                const existing = merged.find(t => t.name === dbLabel.name)
                                if (existing) {
                                    // 同步可见性偏好
                                    if (dbLabel.listVis !== undefined) existing.listVis = dbLabel.listVis
                                    // 同步用户自定义 rules（过滤废弃类型）
                                    if (dbLabel.rules && dbLabel.rules.length > 0) {
                                        const hasDeprecated = dbLabel.rules.every(r =>
                                            r.condition && ['sender_includes', 'in_blacklist', 'in_whitelist'].includes(r.condition.type)
                                        )
                                        if (!hasDeprecated) {
                                            existing.rules = dbLabel.rules
                                        }
                                    }
                                } else {
                                    // DB 里有但 store 里没有的标签（用户自定义），追加进来
                                    merged.push(dbLabel)
                                }
                            })

                            // ② 过滤废弃的标签（系统设置、含旧版黑白名单条件的）
                            const filtered = merged.filter(label => {
                                if (['系统设置'].includes(label.name)) return false
                                if (!label.rules) return true
                                return !label.rules.some(r =>
                                    (r.condition && (r.condition.type === 'in_blacklist' || r.condition.type === 'in_whitelist')) ||
                                    (r.exception && (r.exception.type === 'in_blacklist' || r.exception.type === 'in_whitelist'))
                                )
                            })

                            uiStore.allLabels = filtered
                        }

                        // ③ 新格式：allLabels 直接覆盖（最高优先）
                        if (parsed.allLabels && Array.isArray(parsed.allLabels) && parsed.allLabels.length > 0) {
                            uiStore.allLabels = parsed.allLabels
                        }
                    }

                    // ④ 全局清理废弃的“系统设置”标签，然后再兜底规则
                    uiStore.allLabels = uiStore.allLabels.filter(l => l.name !== '系统设置')
                    uiStore.ensureDefaultRules()

                } catch (e) {
                    console.error("Failed to parse customLabels from user", e)
                    try { uiStore.ensureDefaultRules() } catch (_) {}
                }
            } else {
                // 用户没有保存过 label 配置，直接用模板规则兜底
                uiStore.resetLabelsToDefault()
            }
        }
    }
})