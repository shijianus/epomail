/**
 * Unit & Integration Test for Settings & Management Separation and Anti-Privilege Escalation
 */
import assert from 'node:assert';
import { getRoleGroupSlug, getRoleGroupName, hasAnyManagePermission, getFirstAllowedManageTab } from '../mail-vue/src/utils/role-utils.js';

console.log('🧪 Starting Settings & Management Separation Verification...');

// 1. Test Role Group Slug Mapping
{
  console.log('▶ Test 1: Role group slug mapping');
  const masterByCode = { role: { roleCode: 'master', name: '站长' } };
  assert.strictEqual(getRoleGroupSlug(masterByCode), 'admin', 'Master roleCode must map to admin');

  const masterByEmail = { email: 'admin@epomail.bond', role: { roleCode: 'custom' } };
  assert.strictEqual(getRoleGroupSlug(masterByEmail), 'admin', 'admin@epomail.bond must map to admin');

  const masterByWildcardPerm = { permKeys: ['*'], role: { roleCode: 'custom' } };
  assert.strictEqual(getRoleGroupSlug(masterByWildcardPerm), 'admin', 'Wildcard permission must map to admin');

  const moderatorUser = { role: { roleCode: 'moderator', name: '协管者' }, permKeys: ['user:query'] };
  assert.strictEqual(getRoleGroupSlug(moderatorUser), 'moderator', 'Moderator roleCode must map to moderator');

  const customUser = { role: { roleCode: 'auditor-ops_v1', name: '审计专员' }, permKeys: ['analysis:query'] };
  assert.strictEqual(getRoleGroupSlug(customUser), 'auditor-ops_v1', 'Custom roleCode preserves valid slug characters');

  const standardUser = { role: { roleCode: 'user_lv0', name: '普通用户' }, permKeys: [] };
  assert.strictEqual(getRoleGroupSlug(standardUser), 'user_lv0', 'RoleCode is preserved for users');

  const userWithoutRole = { role: null, permKeys: [] };
  assert.strictEqual(getRoleGroupSlug(userWithoutRole), 'user', 'Regular user with no role must map to user');

  console.log('  ✓ Role group slugs correctly computed');
}

// 2. Test Role Group Display Names
{
  console.log('▶ Test 2: Role group display names');
  const t = (k) => {
    const dict = { roleMaster: '站长 (Master)', roleModerator: '协管者 (Moderator)' };
    return dict[k] || k;
  };

  const admin = { role: { roleCode: 'master' } };
  assert.strictEqual(getRoleGroupName(admin, t), '站长 (Master)');

  const mod = { role: { roleCode: 'moderator' } };
  assert.strictEqual(getRoleGroupName(mod, t), '协管者 (Moderator)');

  const custom = { role: { roleCode: 'analyst', name: '数据分析官' } };
  assert.strictEqual(getRoleGroupName(custom, t), '数据分析官');

  console.log('  ✓ Role group names correctly resolved');
}

// 3. Test hasAnyManagePermission
{
  console.log('▶ Test 3: hasAnyManagePermission checks');
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['*'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['user:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['setting:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['analysis:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['role:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['reg-key:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['all-email:query'] }), true);
  assert.strictEqual(hasAnyManagePermission({ permKeys: ['mail:send', 'profile:update'] }), false);
  assert.strictEqual(hasAnyManagePermission({ permKeys: [] }), false);
  assert.strictEqual(hasAnyManagePermission(null), false);

  console.log('  ✓ hasAnyManagePermission strictly enforces management privileges');
}

// 4. Test getFirstAllowedManageTab
{
  console.log('▶ Test 4: First allowed tab prioritization');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['*'] }), 'system');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['setting:query'] }), 'system');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['user:query'] }), 'users');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['analysis:query'] }), 'analysis');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['all-email:query'] }), 'mail');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['role:query'] }), 'roles');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['reg-key:query'] }), 'reg-keys');
  assert.strictEqual(getFirstAllowedManageTab({ permKeys: ['other'] }), 'system');

  console.log('  ✓ Tab prioritization aligns with permissions');
}

// 5. Simulated Guard Anti-Privilege Escalation Logic
{
  console.log('▶ Test 5: Route guard logic simulation (anti-privilege escalation)');

  function simulateGuard(toPath, user) {
    const isAuthenticated = !!user;
    if (!isAuthenticated) return { allow: false, redirect: '/login' };

    const managePermList = [
      'setting:query', 'user:query', 'role:query',
      'analysis:query', 'reg-key:query', 'all-email:query'
    ];
    const userPerms = Array.isArray(user?.permKeys) ? user.permKeys : [];
    const isMaster = userPerms.includes('*') || user?.role?.roleCode === 'master' || user?.email === 'admin@epomail.bond';
    const hasAnyManage = isMaster || userPerms.some(p => managePermList.includes(p));

    const isManageRoute = toPath.startsWith('/manage') || toPath.startsWith('/admin');

    if (isManageRoute) {
      if (!hasAnyManage) {
        return { allow: false, redirect: '/settings/profile', error: 'unauthorizedAccess' };
      }

      // Check specific tab permission
      const tabMatch = toPath.match(/\/manage\/[^/]+\/([^/]+)/) || toPath.match(/\/admin\/([^/]+)/);
      const tab = tabMatch ? tabMatch[1] : '';
      const permReqMap = {
        'analysis': 'analysis:query',
        'users': 'user:query',
        'mail': 'all-email:query',
        'roles': 'role:query',
        'reg-keys': 'reg-key:query',
        'system': 'setting:query',
        'apps': 'setting:query',
        'rules': 'setting:query'
      };

      const requiredPerm = permReqMap[tab];
      if (requiredPerm && !isMaster && !userPerms.includes(requiredPerm)) {
        const fallbackTab = getFirstAllowedManageTab(user);
        const userSlug = getRoleGroupSlug(user);
        return { allow: false, redirect: `/manage/${userSlug}/${fallbackTab}`, error: 'unauthorizedAccess' };
      }

      // Check role group url binding
      const expectedSlug = getRoleGroupSlug(user);
      const manageRoleMatch = toPath.match(/^\/manage\/([^/]+)/);
      if (manageRoleMatch && manageRoleMatch[1] !== expectedSlug) {
        const subRest = toPath.replace(/^\/manage\/[^/]+/, '');
        return { allow: false, redirect: `/manage/${expectedSlug}${subRest}` };
      }
    }

    return { allow: true, path: toPath };
  }

  // Case A: Unauthenticated user accesses manage -> Redirect to login
  const resA = simulateGuard('/manage/admin/system', null);
  assert.strictEqual(resA.allow, false);
  assert.strictEqual(resA.redirect, '/login');

  // Case B: Regular user without manage perm tries to access manage -> Blocked & redirected to /settings/profile
  const normalUser = { email: 'alice@epomail.bond', permKeys: [], role: { roleCode: 'user_lv0' } };
  const resB = simulateGuard('/manage/admin/system', normalUser);
  assert.strictEqual(resB.allow, false);
  assert.strictEqual(resB.redirect, '/settings/profile');
  assert.strictEqual(resB.error, 'unauthorizedAccess');

  // Case C: Regular user tries to access /admin alias -> Blocked & redirected to /settings/profile
  const resC = simulateGuard('/admin/users', normalUser);
  assert.strictEqual(resC.allow, false);
  assert.strictEqual(resC.redirect, '/settings/profile');

  // Case D: Moderator with user:query tries to access /system -> Blocked & redirected to /manage/moderator/users
  const modUser = { email: 'mod@epomail.bond', permKeys: ['user:query'], role: { roleCode: 'moderator' } };
  const resD = simulateGuard('/manage/moderator/system', modUser);
  assert.strictEqual(resD.allow, false);
  assert.strictEqual(resD.redirect, '/manage/moderator/users');
  assert.strictEqual(resD.error, 'unauthorizedAccess');

  // Case E: Moderator accesses allowed tab /manage/moderator/users -> Allowed
  const resE = simulateGuard('/manage/moderator/users', modUser);
  assert.strictEqual(resE.allow, true);

  // Case F: Admin accesses wrong role slug in URL (e.g. /manage/visitor/system) -> Automatically normalized to /manage/admin/system
  const adminUser = { email: 'admin@epomail.bond', permKeys: ['*'], role: { roleCode: 'master' } };
  const resF = simulateGuard('/manage/visitor/system', adminUser);
  assert.strictEqual(resF.allow, false);
  assert.strictEqual(resF.redirect, '/manage/admin/system');

  // Case G: Personal settings always accessible to normal user
  const resG = simulateGuard('/settings/profile', normalUser);
  assert.strictEqual(resG.allow, true);

  console.log('  ✓ Anti-privilege escalation guard simulation passed all scenarios');
}

console.log('🎉 ALL 5 TEST SCENARIOS PASSED WITH ZERO FAILURES!');
