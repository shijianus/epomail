/**
 * Epocanvas Mail 底层特性开关配置 (Feature Flags)
 * 
 * 为了确保整体专案的独立性与私密性，默认关闭第三方接入与单点登录 (ENABLE_OAUTH_INTEGRATION = false)
 * 当设为 false 时，管理后台将不再显式「第三方认证与单点登录」设置卡片；
 * 实际用户若有第三方 SSO 接入需求，只需将此项改为 true 即可随时开启。
 */
export const ENABLE_OAUTH_INTEGRATION = false;
