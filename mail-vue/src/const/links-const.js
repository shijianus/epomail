/**
 * EpoMail 官方外部站点与文档链接默认配置
 * 
 * 默认指向 epocanvas.com 下各官方子域，站长可在环境变量 (BLOG_BASE_URL, DOCS_URL, SUPPORT_URL) 
 * 或系统设置中覆写自订链接。前端优先采用动态设置，无设置时优雅回退至此官方默认配置。
 */

export const DEFAULT_OFFICIAL_LINKS = {
  blog: 'https://blog.epocanvas.com',
  docs: 'https://docs.epocanvas.com/epomail',
  support: 'https://blog.epocanvas.com/support',
  telegram: 'https://t.me/epomail',
  github: 'https://github.com/shijianus/epomail',
  releases: 'https://github.com/shijianus/epomail/releases'
};

/**
 * 获取官方外链地址，优先读取当前 settingStore.settings 中的动态值
 * @param {string} key - 'blog' | 'docs' | 'support' | 'telegram' | 'github' | 'releases'
 * @param {object} [settingStore] - Pinia settingStore 实例
 * @returns {string} 目标外链完整 URL
 */
export function getOfficialLink(key, settingStore = null) {
  const settings = settingStore?.settings || {};
  switch (key) {
    case 'blog':
      return settings.blogUrl || DEFAULT_OFFICIAL_LINKS.blog;
    case 'docs':
      return settings.docsUrl || DEFAULT_OFFICIAL_LINKS.docs;
    case 'support':
      return settings.supportUrl || DEFAULT_OFFICIAL_LINKS.support;
    case 'telegram':
      return settings.telegramLink || DEFAULT_OFFICIAL_LINKS.telegram;
    case 'github':
      return settings.githubLink || DEFAULT_OFFICIAL_LINKS.github;
    case 'releases':
      return settings.releasesLink || DEFAULT_OFFICIAL_LINKS.releases;
    default:
      return DEFAULT_OFFICIAL_LINKS[key] || '';
  }
}

export default DEFAULT_OFFICIAL_LINKS;
