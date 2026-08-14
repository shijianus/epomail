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
                                        } else if (templateLabel.name === '社群' && (!templateLabel.rules || templateLabel.rules.length === 0)) {
                                            // Force initialize template if it's completely empty
                                            templateLabel.rules = [{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }];
                                        }
                                    } else if (templateLabel.name === '社群' && (!templateLabel.rules || templateLabel.rules.length === 0)) {
                                         templateLabel.rules = [{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }];
                                    }
                                });
                                // Add missing labels from DB that are not in uiStore
                                dbDefs.forEach(dbLabel => {
                                    if (!uiStore.defaultLabels.find(t => t.name === dbLabel.name)) {
                                        uiStore.defaultLabels.push(dbLabel);
                                    }
                                });
                                // Remove deprecated labels containing in_blacklist or in_whitelist to comply with system settings requirement
                                uiStore.defaultLabels = uiStore.defaultLabels.filter(templateLabel => {
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