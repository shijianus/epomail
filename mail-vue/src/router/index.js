import {createRouter} from 'vue-router'
import createAccountHistory from './account-history.js';
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import {cvtR2Url} from "@/utils/convert.js";
import {getRoleGroupSlug, getFirstAllowedManageTab, hasAnyManagePermission} from "@/utils/role-utils.js";
import {hasPerm} from "@/perm/perm.js";
import {ElMessage} from 'element-plus';
import i18n from '@/i18n/index.js';

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox/:mailHash?',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/all/:mailHash?',
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
                redirect: '/settings/profile'
            },
            {
                path: '/settings/profile',
                alias: ['/settings/personal', '/settings/profile-info', '/settings/account', '/settings/accounts'],
                name: 'user-profile',
                component: () => import('@/views/profile-info/index.vue'),
                meta: {
                    title: 'profile',
                    name: 'user-profile',
                    menu: true
                }
            },
            {
                path: '/settings/general',
                alias: ['/settings/general-settings', '/settings/profile-setting'],
                name: 'general-setting',
                component: () => import('@/views/profile-setting/index.vue'),
                meta: {
                    title: 'general',
                    name: 'general-setting',
                    menu: true
                }
            },
            {
                path: '/settings/security',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'security',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/settings/data',
                alias: ['/settings/user-data', '/settings/export', '/settings/data-setting'],
                name: 'data-setting',
                component: () => import('@/views/data-setting/index.vue'),
                meta: {
                    title: 'data',
                    name: 'data-setting',
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
                path: '/sent/:mailHash?',
                name: 'send',
                component: () => import('@/views/send/index.vue'),
                meta: {
                    title: 'sent',
                    name: 'send',
                    menu: true
                }
            },
            {
                path: '/drafts/:mailHash?',
                name: 'draft',
                component: () => import('@/views/draft/index.vue'),
                meta: {
                    title: 'drafts',
                    name: 'draft',
                    menu: true
                }
            },
            {
                path: '/starred/:mailHash?',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/snoozed/:mailHash?',
                name: 'snoozed',
                component: () => import('@/views/snoozed/index.vue'),
                meta: {
                    title: 'snoozed',
                    name: 'snoozed',
                    menu: true
                }
            },
            {
                path: '/spam/:mailHash?',
                name: 'spam',
                component: () => import('@/views/spam/index.vue'),
                meta: {
                    title: 'spam',
                    name: 'spam',
                    menu: true
                }
            },
            {
                path: '/trash/:mailHash?',
                name: 'trash',
                component: () => import('@/views/trash/index.vue'),
                meta: {
                    title: 'trash',
                    name: 'trash',
                    menu: true
                }
            },
            // ── 管理控制台板块 (#manage/:roleGroup/...) ──
            {
                path: '/manage',
                name: 'manage-root',
                redirect: () => {
                    const userStore = useUserStore();
                    const roleGroup = getRoleGroupSlug(userStore.user);
                    const firstTab = getFirstAllowedManageTab(userStore.user);
                    return `/manage/${roleGroup}/${firstTab}`;
                }
            },
            {
                path: '/manage/:roleGroup',
                name: 'manage-role-root',
                redirect: to => {
                    const userStore = useUserStore();
                    const roleGroup = to.params.roleGroup || getRoleGroupSlug(userStore.user);
                    const firstTab = getFirstAllowedManageTab(userStore.user);
                    return `/manage/${roleGroup}/${firstTab}`;
                }
            },
            {
                path: '/admin',
                name: 'admin-root',
                redirect: () => {
                    const userStore = useUserStore();
                    const roleGroup = getRoleGroupSlug(userStore.user);
                    const firstTab = getFirstAllowedManageTab(userStore.user);
                    return `/manage/${roleGroup}/${firstTab}`;
                }
            },
            {
                path: '/manage/:roleGroup/analysis',
                alias: ['/manage/:roleGroup/analytics', '/analysis', '/admin/analysis', '/admin/analytics'],
                name: 'manage-analysis',
                component: () => import('@/views/analysis/index.vue'),
                meta: {
                    title: 'analytics',
                    name: 'manage-analysis',
                    perm: 'analysis:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/users',
                alias: ['/manage/:roleGroup/user', '/all-users', '/admin/users', '/admin/user'],
                name: 'manage-users',
                component: () => import('@/views/user/index.vue'),
                meta: {
                    title: 'allUsers',
                    name: 'manage-users',
                    perm: 'user:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/mail',
                alias: ['/manage/:roleGroup/all-mail', '/all-mail', '/admin/mail', '/admin/all-mail'],
                name: 'manage-mail',
                component: () => import('@/views/all-email/index.vue'),
                meta: {
                    title: 'allMail',
                    name: 'manage-mail',
                    perm: 'all-email:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/roles',
                alias: ['/manage/:roleGroup/role', '/role', '/roles', '/admin/roles', '/admin/role', '/settings/role', '/settings/roles'],
                name: 'manage-roles',
                component: () => import('@/views/role/index.vue'),
                meta: {
                    title: 'permissions',
                    name: 'manage-roles',
                    perm: 'role:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/reg-keys',
                alias: ['/manage/:roleGroup/reg-key', '/manage/:roleGroup/invite-code', '/invite-code', '/reg-key', '/admin/reg-keys', '/admin/reg-key', '/admin/invite-code', '/settings/reg-key'],
                name: 'manage-reg-keys',
                component: () => import('@/views/reg-key/index.vue'),
                meta: {
                    title: 'inviteCode',
                    name: 'manage-reg-keys',
                    perm: 'reg-key:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/system',
                alias: ['/manage/:roleGroup/sys-setting', '/system-setting', '/sys-setting', '/admin/system', '/admin/sys-setting', '/settings/system', '/settings/sys-setting'],
                name: 'manage-system',
                component: () => import('@/views/sys-setting/index.vue'),
                meta: {
                    title: 'SystemSettings',
                    name: 'manage-system',
                    perm: 'setting:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/apps',
                alias: ['/manage/:roleGroup/oauth-apps', '/manage/:roleGroup/oauth-app', '/oauth-apps', '/oauth-app', '/admin/apps', '/admin/oauth-apps', '/settings/oauth-apps', '/settings/oauth-app'],
                name: 'manage-apps',
                component: () => import('@/views/oauth-app/index.vue'),
                meta: {
                    title: 'oauthApps',
                    name: 'manage-apps',
                    perm: 'setting:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/rules',
                alias: ['/manage/:roleGroup/category', '/manage/:roleGroup/category-setting', '/category-setting', '/category', '/admin/rules', '/admin/category', '/settings/category'],
                name: 'manage-rules',
                component: () => import('@/views/category-setting/index.vue'),
                meta: {
                    title: 'categorySetting',
                    name: 'manage-rules',
                    perm: 'setting:query',
                    isManage: true,
                    menu: true
                }
            },
            {
                path: '/manage/:roleGroup/audit',
                alias: ['/manage/:roleGroup/audit-report', '/manage/:roleGroup/risk', '/audit-report', '/audit', '/admin/audit', '/admin/audit-report', '/settings/audit'],
                name: 'manage-audit',
                component: () => import('@/views/audit-report/index.vue'),
                meta: {
                    title: 'auditReport',
                    name: 'manage-audit',
                    perm: 'setting:query',
                    isManage: true,
                    menu: true
                }
            }
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/oauth/authorize',
        name: 'oauth-authorize',
        component: () => import('@/views/oauth/authorize.vue')
    },
    // /test 仅开发模式注册，不暴露生产
    ...(import.meta.env.DEV ? [{
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    }] : []),
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
    history: createAccountHistory(0),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach(async (to, from, next) => {
    // 确保 mailHash 与 mailId 双向参数兼容
    if (to.params.mailHash && !to.params.mailId) {
        to.params.mailId = to.params.mailHash;
    }
    if (to.params.mailId && !to.params.mailHash) {
        to.params.mailHash = to.params.mailId;
    }

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    // 1. 目标为登录界面：无论是从何处跳转，直接硬重定向到独立的 /login/ 应用，避免 SPA 内部循环拦截
    if (to.name === 'login' || to.path === '/login' || to.path === '/login/') {
        removeLoading();
        window.location.replace('/login/' + (window.location.search || ''));
        return;
    }

    // 2. 无 token 时防止动态管理路由未加载而贪婪匹配到 /:username (profile) 导致的异常展示
    const protectedSystemPaths = [
        'manage', 'admin', 'moderator',
        'system-setting', 'sys-setting', 'all-users', 'role', 'roles',
        'reg-key', 'invite-code', 'analysis', 'oauth-apps', 'oauth-app', 'settings',
        'category', 'category-setting', 'audit', 'audit-report', 'risk'
    ];
    if (!token && to.name === 'profile' && protectedSystemPaths.includes(to.params.username?.toLowerCase())) {
        removeLoading();
        window.location.replace('/login/');
        return;
    }

    // 3. 无 token 且访问受保护的内部路由：立即硬重定向到登录页
    if (!token && !['login', 'profile', 'oauth-authorize'].includes(to.name)) {
        removeLoading();
        window.location.replace('/login/');
        return;
    }

    // 4. 管理控制台权限校验与严格防越权保护
    const toPath = (to.path || '').toLowerCase();
    const isManageRoute = to.meta?.isManage || toPath.startsWith('/manage') || toPath.startsWith('/admin') || [
        'manage-root', 'manage-role-root', 'admin-root',
        'manage-analysis', 'manage-users', 'manage-mail', 'manage-roles', 'manage-reg-keys', 'manage-system', 'manage-apps', 'manage-rules', 'manage-audit'
    ].includes(to.name);

    if (isManageRoute) {
        if (!token) {
            removeLoading();
            window.location.replace('/login/');
            return;
        }

        const userStore = useUserStore();
        if (!userStore.user?.userId) {
            try {
                await userStore.refreshUserInfo();
            } catch (err) {
                console.warn('Failed to refresh user info in beforeEach guard:', err);
            }
        }

        const user = userStore.user;
        const canManage = hasAnyManagePermission(user);

        // 越权阻断：当前身份组完全无管理权限，立即拦截并重定向到个人设置中心
        if (!canManage) {
            ElMessage.error(i18n.global.t('unauthorizedAccess') || '越权访问拦截：无权访问该管理模块');
            next({ path: '/settings/profile', replace: true });
            return;
        }

        const userRoleGroup = getRoleGroupSlug(user);

        // 访问 /manage 或 /manage/:roleGroup 或 /admin 根节点：按角色权限重定向至第一可用子项
        if (to.name === 'manage-root' || to.name === 'manage-role-root' || to.name === 'admin-root' || to.path === '/manage' || to.path === '/admin') {
            const firstTab = getFirstAllowedManageTab(user);
            next({ path: `/manage/${userRoleGroup}/${firstTab}`, replace: true });
            return;
        }

        // 单项细分权限校验：若无此子页面权限，越权阻断并重定向至第一可用子项
        if (to.meta?.perm && !hasPerm(to.meta.perm)) {
            ElMessage.error(i18n.global.t('unauthorizedAccess') || '越权访问拦截：无权访问该管理模块');
            const firstTab = getFirstAllowedManageTab(user);
            next({ path: `/manage/${userRoleGroup}/${firstTab}`, replace: true });
            return;
        }

        // URL 角色分组绑定与防篡改：若 URL 中的 roleGroup 与当前用户实际身份组不一致，规范化重定向
        const targetRoleGroup = to.params.roleGroup;
        if (targetRoleGroup && targetRoleGroup !== userRoleGroup) {
            const tab = to.path.split('/').filter(Boolean).pop() || getFirstAllowedManageTab(user);
            next({ path: `/manage/${userRoleGroup}/${tab}`, replace: true });
            return;
        }
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
    doc.classList.add('loading-hide');
    setTimeout(() => {
        if (doc && doc.parentNode) {
            doc.parentNode.removeChild(doc);
        }
    }, 400); // 400ms is the CSS transition duration
}

export default router
