import { defineConfig, passthroughImageService } from 'astro/config';
import starlight from '@astrojs/starlight';

// 站点来源：hreflang/canonical 需要绝对地址，部署到正式域名后只需改这一行。
const SITE_ORIGIN = 'https://mail.epocanvas.com';

// 侧边栏条目的多语言文案：label 为默认语言（简体中文），其余语言从 translations 取。
const SIDEBAR_I18N = {
	'隐私政策': {
		'zh-TW': '隱私權政策', 'zh-tw': '隱私權政策', en: 'Privacy Policy',
		fr: 'Politique de confidentialité', es: 'Política de privacidad', nl: 'Privacybeleid',
	},
	'服务条款': {
		'zh-TW': '服務條款', 'zh-tw': '服務條款', en: 'Terms of Service',
		fr: "Conditions d'utilisation", es: 'Términos del servicio', nl: 'Servicevoorwaarden',
	},
};
const t = (label, slug) => ({ label, slug, translations: SIDEBAR_I18N[label] ?? {} });

export default defineConfig({
	site: SITE_ORIGIN,
	// 纯文档站点用不到 Astro 开发工具栏
	devToolbar: { enabled: false },
	// 全站没有 <Image> 调用；passthrough 服务规避 sharp 原生依赖在隔离布局下解析不到的问题
	image: { service: passthroughImageService() },
	integrations: [
		starlight({
			title: 'EpoCanvas Mail',
			description: 'EpoCanvas Mail 隐私政策与服务条款——开源 Cloudflare 邮箱服务的官方法律文档（6 语言）',
			// 简体中文为默认语言，占用 URL 根路径；其余语言带目录前缀（如 /en/mail/privacy-policy/）
			defaultLocale: 'root',
			locales: {
				root: { label: '简体中文', lang: 'zh-CN' },
				'zh-tw': { label: '繁體中文', lang: 'zh-TW' },
				en: { label: 'English', lang: 'en' },
				fr: { label: 'Français', lang: 'fr' },
				es: { label: 'Español', lang: 'es' },
				nl: { label: 'Nederlands', lang: 'nl' },
			},
			logo: { src: './public/favicon.svg' },
			favicon: '/favicon.svg',
			social: { github: 'https://github.com/shijianus/epomail' },
			// 页面「最后更新于」时间戳取自构建时的 Git 提交历史
			lastUpdated: true,
			customCss: ['./src/styles/custom.css'],
			sidebar: [t('隐私政策', 'mail/privacy-policy'), t('服务条款', 'mail/terms-of-service')],
		}),
	],
});
