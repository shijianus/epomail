import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {cvtR2Url} from "@/utils/convert.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/all',
                name: 'user-all-email',
                component: () => import('@/views/all/index.vue'),
                meta: {
                    title: 'allMail',
                    name: 'user-all-email',
                    menu: true
                }
            },
            {
                path: '/message',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/settings/labels',
                name: 'label-setting',
                component: () => import('@/views/label-setting/index.vue'),
                meta: {
                    title: 'labels',
                    name: 'label-setting',
                    menu: true
                }
            },
            {
                path: '/settings/category',
                name: 'category-setting',
                component: () => import('@/views/category-setting/index.vue'),
                meta: {
                    title: 'category',
                    name: 'category-setting',
                    menu: true
                }
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/snoozed',
                name: 'snoozed',
                component: () => import('@/views/snoozed/index.vue'),
                meta: {
                    title: 'snoozed',
                    name: 'snoozed',
                    menu: true
                }
            },
            {
                path: '/spam',
                name: 'spam',
                component: () => import('@/views/spam/index.vue'),
                meta: {
                    title: 'spam',
                    name: 'spam',
                    menu: true
                }
            },
            {
                path: '/trash',
                name: 'trash',
                component: () => import('@/views/trash/index.vue'),
                meta: {
                    title: 'trash',
                    name: 'trash',
                    menu: true
                }
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    },
    {
        path: '/:username',
        name: 'profile',
        component: () => import('@/views/profile/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    if (!token && to.name !== 'login' && to.name !== 'profile') {
        const elapsed = Date.now() - (window.__EPO_LOADING_START__ || Date.now());
        const minTime = 3000;
        if (elapsed < minTime) {
            setTimeout(() => {
                window.location.href = '/login/index.html';
            }, minTime - elapsed);
        } else {
            window.location.href = '/login/index.html';
        }
        return;
    }

    if (!token && to.name === 'login') {
        loadBackground(next)
        return
    }

    if (token && to.name === 'login') {
        return next(from.path)
    }

    next()

})

function loadBackground(next) {

    const settingStore = useSettingStore();

    if (settingStore.settings.background) {

        const src = cvtR2Url(settingStore.settings.background);

        const img = new Image();
        img.src = src;

        img.onload = () => {
            next()
        };

        img.onerror = () => {
            console.warn("背景图片加载失败:", img.src);
            next()
        };

        setTimeout(() => {
            console.warn("背景加载超时，已放行");
            next()
        }, 3000)

    } else {
        next()
    }

}

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    if (to.meta.menu) {
        if (['content', 'email', 'send'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false
        }
    }

    if (window.innerWidth < 1025) {
        uiStore.asideShow = false
    }

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }
    const elapsed = Date.now() - (window.__EPO_LOADING_START__ || Date.now());
    const minTime = 3000;
    
    function hideAndRemove() {
        doc.classList.add('loading-hide');
        setTimeout(() => {
            doc.remove();
        }, 400); // 400ms is the CSS transition duration
    }

    if (elapsed < minTime) {
        setTimeout(hideAndRemove, minTime - elapsed);
    } else {
        hideAndRemove();
    }
}

export default router
