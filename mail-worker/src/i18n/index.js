import { createI18n } from 'vue-i18n';
import en from './en.js'
import zh from './zh.js'
import zhHant from './zh-Hant.js'
import fr from './fr.js'
import es from './es.js'
import nl from './nl.js'

const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    fallbackLocale: 'zh',
    messages: {
        zh,
        'zh-CN': zh,
        'zh-Hant': zhHant,
        'zh-TW': zhHant,
        en,
        fr,
        es,
        nl
    },
});

export default i18n;