import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'VITE')
    return {
        server: {
            host: true,
            port: 3001,
            hmr: true,
        },
        base: env.VITE_STATIC_URL || '/',
        plugins: [vue(),
            VitePWA({
                injectRegister: 'script-defer',
                manifest: {
                    name: env.VITE_PWA_NAME,
                    short_name: env.VITE_PWA_NAME,
                    background_color: '#FFFFFF',
                    theme_color: '#FFFFFF',
                    icons: [
                        {
                            src: 'logo.svg',
                            sizes: '192x192',
                            type: 'image/svg+xml',
                        }
                    ],
                },
                workbox: {
                    disableDevLogs: true,
                    globPatterns: [],
                    runtimeCaching: [],
                    navigateFallback: null,
                    cleanupOutdatedCaches: true,
                }
            }),
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            })
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
        },
        build: {
            target: 'es2022',
            outDir: env.VITE_OUT_DIR || 'dist',
            emptyOutDir: true,
            assetsInclude: ['**/*.json'],
            chunkSizeWarningLimit: 1500,
            rollupOptions: {
                output: {
                    // 厂商分包：业务改动不再击穿整个 vendor 缓存
                    // 注意：Vite 7 已不支持 build.manualChunks 顶层简写（会被静默忽略），必须挂在 rollupOptions.output 下
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return undefined
                        if (id.includes('element-plus') || id.includes('@element-plus') || id.includes('@ctrl/tinycolor')) return 'element-plus'
                        if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
                        if (
                            id.includes('/@vue/') ||
                            id.includes('/node_modules/vue/') ||
                            id.includes('vue-router') ||
                            id.includes('/pinia') ||
                            id.includes('vue-i18n') ||
                            id.includes('@vueuse/') ||
                            id.includes('/axios/') ||
                            id.includes('/dayjs/') ||
                            id.includes('lodash-es') ||
                            id.includes('@vue/devtools')
                        ) return 'vue-vendor'
                        return undefined
                    }
                }
            }
        }
    }
})