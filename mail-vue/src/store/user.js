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
                                // Smart merge: keep template rules if the DB version has no rules, so new template rules apply to existing blank DB states
                                const dbDefs = parsed.defaultLabels;
                                // Add missing labels from DB that are not in uiStore
                                dbDefs.forEach(dbLabel => {
                                    if (!uiStore.defaultLabels.find(t => t.name === dbLabel.name)) {
                                        uiStore.defaultLabels.push(dbLabel);
                                    }
                                });
                                // Update existing
                                uiStore.defaultLabels.forEach(templateLabel => {
                                    const dbLabel = dbDefs.find(d => d.name === templateLabel.name);
                                    if (dbLabel) {
                                        templateLabel.listVis = dbLabel.listVis !== undefined ? dbLabel.listVis : templateLabel.listVis;
                                        if (dbLabel.rules && dbLabel.rules.length > 0) {
                                            // Ensure we don't carry over deprecated whitelist condition blocks if they're naked
                                            const hasOnlyDeprecated = dbLabel.rules.every(r => r.condition && ['sender_includes'].includes(r.condition.type));
                                            if (!hasOnlyDeprecated) {
                                                templateLabel.rules = dbLabel.rules;
                                            }
                                        }
                                    }
                                });
                                
                                // Ensure '社群' always has default rules if it is empty
                                const socialLabel = uiStore.defaultLabels.find(t => t.name === '社群');
                                if (socialLabel && (!socialLabel.rules || socialLabel.rules.length === 0)) {
                                    socialLabel.rules = [{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }];
                                }
                                // Ensure '系统设置' is injected if completely missing
                                if (!uiStore.defaultLabels.find(t => t.name === '系统设置')) {
                                    uiStore.defaultLabels.push({ name: '系统设置', icon: 'ic:outline-settings', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [] });
                                }

                                // Remove deprecated labels containing in_blacklist or in_whitelist to comply with system settings requirement
                                uiStore.defaultLabels = uiStore.defaultLabels.filter(templateLabel => {
                                    if (['工作', '推销', '订阅'].includes(templateLabel.name)) return false; // Hard remove deprecated categories
                                    if (!templateLabel.rules) return true;
                                    return !templateLabel.rules.some(r => 
                                        (r.condition && (r.condition.type === 'in_blacklist' || r.condition.type === 'in_whitelist')) ||
                                        (r.exception && (r.exception.type === 'in_blacklist' || r.exception.type === 'in_whitelist'))
                                    );
                                });
                            }
                        }
                    } catch (e) {
                        console.error("Failed to parse customLabels from user", e)
                    }
                }
            })
        }
    }
})