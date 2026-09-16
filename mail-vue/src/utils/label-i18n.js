/**
 * 标签国际化与多语言显示工具
 * 支持对系统内置预置标签（社群、订阅、推销、工作）进行中英文切换呈现，
 * 用户自订新增/重命名的标签则保持原始用户命名。
 */

export const BUILTIN_LABEL_MAP = {
  '社群': 'labelSocial',
  'social': 'labelSocial',
  '订阅': 'labelSubscriptions',
  '訂閱': 'labelSubscriptions',
  'subscriptions': 'labelSubscriptions',
  'subscription': 'labelSubscriptions',
  '推销': 'labelPromotions',
  '推銷': 'labelPromotions',
  'promotions': 'labelPromotions',
  'promotion': 'labelPromotions',
  '工作': 'labelWork',
  'work': 'labelWork',
  '个人': 'labelPersonal',
  '個人': 'labelPersonal',
  'personal': 'labelPersonal',
  '账单': 'labelBilling',
  '賬單': 'labelBilling',
  '帳單': 'labelBilling',
  'billing': 'labelBilling',
  '通知': 'labelNotice',
  'notice': 'labelNotice',
  '官方': 'officialTag',
  'official': 'officialTag',
  '全域公告': 'globalAnnouncementTag',
  '全域公告郵件': 'globalAnnouncementTag',
  'global announcement': 'globalAnnouncementTag',
  '代办': 'todoTag',
  '代辦': 'todoTag',
  'to-do': 'todoTag',
  'todo': 'todoTag'
};

/**
 * 获取内置标签的 i18n key
 * @param {string} name 
 * @returns {string|null}
 */
export function getLabelI18nKey(name) {
  if (!name || typeof name !== 'string') return null;
  return BUILTIN_LABEL_MAP[name.trim()] || BUILTIN_LABEL_MAP[name.trim().toLowerCase()] || null;
}

/**
 * 获取标签的当前多语言显示名称
 * @param {string|object} label - 标签名称或标签对象
 * @param {function} [t] - vue-i18n 的 t 函数
 * @returns {string} 渲染名称
 */
export function getLabelDisplayName(label, t) {
  const name = typeof label === 'object' && label !== null ? (label.name || '') : (label || '');
  if (!name) return '';
  const key = getLabelI18nKey(name);
  if (key && typeof t === 'function') {
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }
  return name;
}

export default {
  BUILTIN_LABEL_MAP,
  getLabelI18nKey,
  getLabelDisplayName
};
