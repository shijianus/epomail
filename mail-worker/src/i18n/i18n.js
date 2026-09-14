import i18next from 'i18next';
import zh from './zh.js'
import en from './en.js'
import zhHant from './zh-Hant.js'
import fr from './fr.js'
import es from './es.js'
import nl from './nl.js'
import app from '../hono/hono';

app.use('*', async (c, next) => {
	const rawHeader = (c.req.header('accept-language') || '').toLowerCase();
	let lang = 'zh';
	if (rawHeader.startsWith('zh-tw') || rawHeader.startsWith('zh-hk') || rawHeader.startsWith('zh-hant')) {
		lang = 'zh-Hant';
	} else if (rawHeader.startsWith('zh')) {
		lang = 'zh';
	} else if (rawHeader.startsWith('fr')) {
		lang = 'fr';
	} else if (rawHeader.startsWith('es')) {
		lang = 'es';
	} else if (rawHeader.startsWith('nl')) {
		lang = 'nl';
	} else if (rawHeader.startsWith('en')) {
		lang = 'en';
	}
	i18next.init({
		lng: lang,
	});
	return await next()
})

const resources = {
	en: {
		translation: en
	},
	zh: {
		translation: zh,
	},
	'zh-Hant': {
		translation: zhHant
	},
	fr: {
		translation: fr
	},
	es: {
		translation: es
	},
	nl: {
		translation: nl
	}
};

i18next.init({
	fallbackLng: 'zh',
	resources,
});

export const t = (key, values) => i18next.t(key, values)

export default i18next;
