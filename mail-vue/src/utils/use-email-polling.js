import { onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingStore } from '@/store/setting.js'
import { sleep } from '@/utils/time-utils.js'

/**
 * 邮件列表增量轮询（emailLatest/allEmailLatest）统一生命周期管理：
 * - 组件卸载即终止循环，修复历史 while(true) 永不退出、闭包泄漏问题；
 * - 页面不可见（document.hidden）时暂停请求，后台标签页不再打服务器；
 * - autoRefresh <= 1（用户关闭自动刷新）时不发起任何请求；
 * - 401/403 统一关闭自动刷新。
 *
 * @param {{ routeName: string | string[], tick: () => Promise<void> }} options
 */
export function useEmailPolling({ routeName, tick }) {
    const route = useRoute()
    const settingStore = useSettingStore()
    const names = Array.isArray(routeName) ? routeName : [routeName]
    let stopped = false

    async function loop() {
        while (!stopped) {
            const autoRefresh = settingStore.settings.autoRefresh
            await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000)
            if (stopped) return
            if (document.hidden) continue
            if (!names.includes(route.name)) continue
            if (autoRefresh <= 1) continue
            try {
                await tick()
            } catch (e) {
                if (e.code === 401 || e.code === 403) {
                    settingStore.settings.autoRefresh = 0
                }
                console.error(e)
            }
        }
    }

    onMounted(loop)
    onBeforeUnmount(() => {
        stopped = true
    })
}
