import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";
import { useUiStore } from "@/store/ui.js";
import { BUILTIN_LABELS } from "@/store/ui.js";

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
            loginUserInfo().then(user => {
                this.user = user
                const uiStore = useUiStore()

                if (user.customLabels) {
                    try {
                        const parsed = JSON.parse(user.customLabels)

                        if (Array.isArray(parsed)) {
                            // 旧格式：纯数组 (只有 customLabels)
                            // 需要与当前 allLabels 合并：DB 里的数组视为全量
                            if (parsed.length > 0) {
                                // 注入内置标签规则再覆盖
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

                                // ② 过滤废弃的标签（工作、含旧版黑白名单条件的）
                                const filtered = merged.filter(label => {
                                    if (['工作', '系统设置'].includes(label.name)) return false
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

                        // ④ 兜底：无论 DB 里数据如何，始终保证系统默认标签的规则完整性
                        uiStore.ensureDefaultRules()

                    } catch (e) {
                        console.error("Failed to parse customLabels from user", e)
                        try { uiStore.ensureDefaultRules() } catch (_) {}
                    }
                } else {
                    // 用户没有保存过 label 配置，直接用模板规则兜底
                    try { uiStore.ensureDefaultRules() } catch (_) {}
                }
            })
        }
    }
})