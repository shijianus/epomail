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
                        if (Array.isArray(parsed) && parsed.length > 0) {
                             uiStore.customLabels = parsed
                        }
                    } catch (e) {
                        console.error("Failed to parse customLabels from user", e)
                    }
                }
            })
        }
    }
})