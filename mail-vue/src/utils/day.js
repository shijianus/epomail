import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/fr'
import 'dayjs/locale/es'
import 'dayjs/locale/nl'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {useSettingStore} from "@/store/setting.js";

dayjs.extend(utc)
dayjs.extend(timezone)

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function getDayjsLocale(lang) {
    if (lang === 'zh-Hant') return 'zh-tw';
    if (lang === 'fr') return 'fr';
    if (lang === 'es') return 'es';
    if (lang === 'nl') return 'nl';
    if (lang === 'en') return 'en';
    return 'zh-cn';
}

export function fromNow(date) {
    const settingStore = useSettingStore();
    const lang = settingStore.lang || 'zh';
    const dayjsLocale = getDayjsLocale(lang);
    const d = dayjs.utc(date).tz(timeZone).locale(dayjsLocale);
    const now = dayjs().tz(timeZone).locale(dayjsLocale);
    const diffSeconds = now.diff(d, 'second');
    const diffMinutes = now.diff(d, 'minute');
    const diffHours = now.diff(d, 'hour');
    const isToday = now.isSame(d, 'day');

    if (lang === 'en') {
        if (isToday) {
            if (diffSeconds < 60) return `Just now`;
            if (diffMinutes < 60) return `${diffMinutes} min ago`;
            if (diffHours < 2) return `${diffHours} hour ago`;
            if (diffHours < 24) return `${diffHours} hours ago`;
            return d.format('hh:mm A');
        }
        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `Yesterday ${d.format('hh:mm A')}`;
        }
        return d.year() === now.year() ? d.format('MMM D') : d.format('YYYY/MM/DD');
    }

    if (lang === 'fr') {
        if (isToday) {
            if (diffSeconds < 60) return `À l'instant`;
            if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
            if (diffHours < 24) return `Il y a ${diffHours} h`;
            return d.format('HH:mm');
        }
        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `Hier ${d.format('HH:mm')}`;
        }
        return d.year() === now.year() ? d.format('D MMM') : d.format('DD/MM/YYYY');
    }

    if (lang === 'es') {
        if (isToday) {
            if (diffSeconds < 60) return `Hace un momento`;
            if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
            if (diffHours < 24) return `Hace ${diffHours} h`;
            return d.format('HH:mm');
        }
        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `Ayer ${d.format('HH:mm')}`;
        }
        return d.year() === now.year() ? d.format('D MMM') : d.format('DD/MM/YYYY');
    }

    if (lang === 'nl') {
        if (isToday) {
            if (diffSeconds < 60) return `Zojuist`;
            if (diffMinutes < 60) return `${diffMinutes} min geleden`;
            if (diffHours < 24) return `${diffHours} uur geleden`;
            return d.format('HH:mm');
        }
        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `Gisteren ${d.format('HH:mm')}`;
        }
        return d.year() === now.year() ? d.format('D MMM') : d.format('DD-MM-YYYY');
    }

    if (lang === 'zh-Hant') {
        if (isToday) {
            if (diffSeconds < 60) return `幾秒前`;
            if (diffMinutes < 60) return `${diffMinutes}分鐘前`;
            if (diffHours >= 1 && diffHours < 2) return '1小時前';
            return d.format('HH:mm');
        } else if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `昨天 ${d.format('HH:mm')}`;
        } else if (now.subtract(2, 'day').isSame(d, 'day')) {
            return `前天 ${d.format('HH:mm')}`;
        }
        return d.year() === now.year() ? d.format('M月D日') : d.format('YYYY/M/D');
    }

    // Default: zh (Simplified Chinese)
    if (isToday) {
        if (diffSeconds < 60) return `几秒前`;
        if (diffMinutes < 60) return `${diffMinutes}分钟前`;
        if (diffHours >= 1 && diffHours < 2) return '1小时前';
        return d.format('HH:mm');
    } else if (now.subtract(1, 'day').isSame(d, 'day')) {
        return `昨天 ${d.format('HH:mm')}`;
    } else if (now.subtract(2, 'day').isSame(d, 'day')) {
        return `前天 ${d.format('HH:mm')}`;
    }
    return d.year() === now.year() ? d.format('M月D日') : d.format('YYYY/M/D');
}

export function updateNow(date) {
    return fromNow(date);
}

export function formatDetailDate(time) {
    const settingStore = useSettingStore();
    const lang = settingStore.lang || 'zh';
    const dayjsLocale = getDayjsLocale(lang);
    const d = dayjs.utc(time).tz(timeZone).locale(dayjsLocale);
    const now = dayjs().tz(timeZone);
    const isSameYear = now.year() === d.year();

    if (lang === 'en') {
        return isSameYear
            ? d.format('ddd, MMM D, h:mm A')
            : d.format('ddd, MMM D, YYYY, h:mm A');
    }
    if (lang === 'fr') {
        return isSameYear
            ? d.format('ddd D MMM, HH:mm')
            : d.format('ddd D MMM YYYY, HH:mm');
    }
    if (lang === 'es') {
        return isSameYear
            ? d.format('ddd, D [de] MMM, HH:mm')
            : d.format('ddd, D [de] MMM [de] YYYY, HH:mm');
    }
    if (lang === 'nl') {
        return isSameYear
            ? d.format('ddd D MMM, HH:mm')
            : d.format('ddd D MMM YYYY, HH:mm');
    }
    if (lang === 'zh-Hant') {
        return d.format('YYYY年M月D日 ddd AH:mm');
    }
    return d.format('YYYY年M月D日 ddd AH:mm');
}

export function tzDayjs(time) {
    const settingStore = useSettingStore();
    const dayjsLocale = getDayjsLocale(settingStore.lang);
    return dayjs.utc(time).tz(timeZone).locale(dayjsLocale);
}

export function toUtc(time) {
    return dayjs(time).utc();
}

export function setExtend(lang) {
    dayjs.locale(getDayjsLocale(lang));
}
