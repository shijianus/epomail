/**
 * Role & Permission Utilities for Epocanvas Mail
 * Handles role group slug generation, human-readable display names,
 * and management console navigation & access control.
 */

export const MANAGE_PERMISSIONS = [
    'all-email:query',
    'user:query',
    'role:query',
    'setting:query',
    'analysis:query',
    'reg-key:query'
];

/**
 * Standardize role group slug for URL routing (#manage/:roleGroup/...)
 * E.g.: 'admin' for master/站长, 'moderator' for 协管者, or custom roleCode
 */
export function getRoleGroupSlug(user) {
    if (!user) return 'admin';

    const roleCode = (user.role?.roleCode || user.role?.key || '').toLowerCase().trim();
    const roleName = (user.role?.name || '').trim();
    const email = (user.email || '').toLowerCase().trim();

    // Master / Superadmin
    if (
        roleCode === 'master' ||
        roleCode === 'admin' ||
        roleName === '站长' ||
        email === 'admin@epomail.bond' ||
        user.permKeys?.includes('*')
    ) {
        return 'admin';
    }

    // Moderator
    if (roleCode === 'moderator' || roleName.includes('协管') || roleName.includes('管理')) {
        return 'moderator';
    }

    // Specific role code or fallback
    if (roleCode) {
        return roleCode.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'user';
    }

    return 'user';
}

/**
 * Get human-readable role group display name
 */
export function getRoleGroupName(user, t) {
    if (!user) return '站长';
    const slug = getRoleGroupSlug(user);
    if (slug === 'admin') {
        return t ? (t('roleMaster') || '站长') : '站长';
    }
    if (slug === 'moderator') {
        return t ? (t('roleModerator') || '协管者') : '协管者';
    }
    return user?.role?.name || slug;
}

/**
 * Get first management tab allowed for current user based on permKeys
 */
export function getFirstAllowedManageTab(user) {
    const permKeys = Array.isArray(user?.permKeys) ? user.permKeys : [];
    if (permKeys.includes('*')) return 'system';
    if (permKeys.includes('setting:query')) return 'system';
    if (permKeys.includes('user:query')) return 'users';
    if (permKeys.includes('analysis:query')) return 'analysis';
    if (permKeys.includes('all-email:query')) return 'mail';
    if (permKeys.includes('role:query')) return 'roles';
    if (permKeys.includes('reg-key:query')) return 'reg-keys';
    return 'system';
}

/**
 * Check if user has ANY management permission
 */
export function hasAnyManagePermission(user) {
    if (!user) return false;
    const permKeys = Array.isArray(user?.permKeys) ? user.permKeys : [];
    if (permKeys.includes('*')) return true;
    return MANAGE_PERMISSIONS.some(p => permKeys.includes(p));
}
