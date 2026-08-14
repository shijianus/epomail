import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";
import { useUiStore } from "@/store/ui.js";

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
                
                if (user.customLabels) {
                    try {
                        const uiStore = useUiStore()
                        const parsed = JSON.parse(user.customLabels)
                        if (Array.isArray(parsed)) {
                            if (parsed.length > 0) uiStore.customLabels = parsed
                        } else if (parsed && typeof parsed === 'object') {
                            if (parsed.customLabels) uiStore.customLabels = parsed.customLabels
                            if (parsed.defaultLabels) {
                                const dbDefs = parsed.defaultLabels;

                                // ① 补充 DB 中有但 uiStore 没有的 label
                                dbDefs.forEach(dbLabel => {
                                    if (!uiStore.defaultLabels.find(t => t.name === dbLabel.name)) {
                                        uiStore.defaultLabels.push(dbLabel);
                                    }
                                });

                                // ② 更新 uiStore 中已有 label 的用户设置（listVis 和用户自定义 rules）
                                uiStore.defaultLabels.forEach(templateLabel => {
                                    const dbLabel = dbDefs.find(d => d.name === templateLabel.name);
                                    if (dbLabel) {
                                        // 同步可见性偏好
                                        templateLabel.listVis = dbLabel.listVis !== undefined ? dbLabel.listVis : templateLabel.listVis;
                                        // 同步用户自定义 rules（只取 DB 中合法的规则，过滤废弃的类型）
                                        if (dbLabel.rules && dbLabel.rules.length > 0) {
                                            const hasDeprecated = dbLabel.rules.every(r =>
                                                r.condition && ['sender_includes', 'in_blacklist', 'in_whitelist'].includes(r.condition.type)
                                            );
                                            if (!hasDeprecated) {
                                                templateLabel.rules = dbLabel.rules;
                                            }
                                        }
                                    }
                                });

                                // ③ 删除废弃的系统标签（工作、含旧版黑白名单条件的）
                                uiStore.defaultLabels = uiStore.defaultLabels.filter(templateLabel => {
                                    if (['工作'].includes(templateLabel.name)) return false;
                                    if (!templateLabel.rules) return true;
                                    return !templateLabel.rules.some(r =>
                                        (r.condition && (r.condition.type === 'in_blacklist' || r.condition.type === 'in_whitelist')) ||
                                        (r.exception && (r.exception.type === 'in_blacklist' || r.exception.type === 'in_whitelist'))
                                    );
                                });
                            }
                        }

                        // ④ 兜底：无论 DB 里数据如何，始终保证系统默认标签的规则完整性
                        uiStore.ensureDefaultRules()

                    } catch (e) {
                        console.error("Failed to parse customLabels from user", e)
                        // 即使解析失败，也要确保规则完整
                        try { useUiStore().ensureDefaultRules() } catch (_) {}
                    }
                } else {
                    // 用户没有保存过 label 配置，直接用模板规则兜底
                    try { useUiStore().ensureDefaultRules() } catch (_) {}
                }
            })
        }
    }
})