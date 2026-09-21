/**
 * Standard Geolocation & Administrative Division Dataset
 * Powered by industry-standard npm packages:
 * - i18n-iso-countries (ISO 3166-1 multilingual standards)
 * - libphonenumber-js (ISO 3166-1 official territory codes)
 *
 * 省州数据策略：不再依赖 country-state-city 整包数据（约 8.7MB，此前拖垮个人主页），
 * 改为内置精简子集（见 LOCAL_INTL_SUBDIVISIONS）；未列出的国家优雅降级为不展示省州下拉。
 *
 * Strict naming adherence:
 * - 香港 / Hong Kong
 * - 澳门 / Macau
 * - 台湾 / Taiwan
 * - 中国 / China
 */

import { getCountries } from 'libphonenumber-js';
import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';
import enLocale from 'i18n-iso-countries/langs/en.json';
import frLocale from 'i18n-iso-countries/langs/fr.json';
import esLocale from 'i18n-iso-countries/langs/es.json';
import nlLocale from 'i18n-iso-countries/langs/nl.json';
import zhHantCountries from './countries-zh-hant.json';

countries.registerLocale(zhLocale);
countries.registerLocale(enLocale);
countries.registerLocale(frLocale);
countries.registerLocale(esLocale);
countries.registerLocale(nlLocale);

const PRIORITY_CODES = [
  'HK', 'MO', 'TW', 'CN', 'US', 'CA', 'GB', 'JP', 'SG', 'AU',
  'DE', 'FR', 'KR', 'MY', 'NZ', 'TH', 'VN', 'PH', 'ID', 'IN',
  'IT', 'ES', 'NL', 'CH'
];

// Chinese localization map for ISO 3166-2 subdivisions
const HK_ZH_MAP = {
  'Central and Western District': '中西区',
  'Wan Chai': '湾仔区',
  'Eastern': '东区',
  'Southern': '南区',
  'Yau Tsim Mong': '油尖旺区',
  'Sham Shui Po': '深水埗区',
  'Kowloon City': '九龙城区',
  'Wong Tai Sin': '黄大仙区',
  'Kwun Tong': '观塘区',
  'Kwai Tsing': '葵青区',
  'Tsuen Wan District': '荃湾区',
  'Tuen Mun': '屯门区',
  'Yuen Long District': '元朗区',
  'North': '北区',
  'Tai Po': '大埔区',
  'Sha Tin': '沙田区',
  'Sai Kung District': '西贡区',
  'Islands District': '离岛区'
};

const CN_ZH_MAP = {
  'Beijing': '北京市', 'Shanghai': '上海市', 'Tianjin': '天津市', 'Chongqing': '重庆市',
  'Guangdong': '广东省', 'Zhejiang': '浙江省', 'Jiangsu': '江苏省', 'Shandong': '山东省',
  'Fujian': '福建省', 'Sichuan': '四川省', 'Hubei': '湖北省', 'Hunan': '湖南省',
  'Henan': '河南省', 'Hebei': '河北省', 'Shaanxi': '陕西省', 'Anhui': '安徽省',
  'Jiangxi': '江西省', 'Liaoning': '辽宁省', 'Jilin': '吉林省', 'Heilongjiang': '黑龙江省',
  'Guangxi': '广西壮族自治区', 'Hainan': '海南省', 'Guizhou': '贵州省', 'Yunnan': '云南省',
  'Shanxi': '山西省', 'Inner Mongolia': '内蒙古自治区', 'Gansu': '甘肃省', 'Qinghai': '青海省',
  'Ningxia': '宁夏回族自治区', 'Xinjiang': '新疆维吾尔自治区', 'Tibet': '西藏自治区'
};

const TW_ZH_MAP = {
  'Taipei': '台北市', 'New Taipei': '新北市', 'Taoyuan': '桃园市', 'Taichung': '台中市',
  'Tainan': '台南市', 'Kaohsiung': '高雄市', 'Keelung': '基隆市', 'Hsinchu': '新竹市',
  'Chiayi': '嘉义市', 'Yilan': '宜兰县', 'Hualien': '花莲县', 'Taitung': '台东县',
  'Penghu': '澎湖县', 'Kinmen': '金门县', 'Lienchiang': '连江县', 'Miaoli': '苗栗县',
  'Changhua': '彰化县', 'Nantou': '南投县', 'Yunlin': '云林县', 'Pingtung': '屏东县'
};

const MO_PARISHES = [
  { value: '花地玛堂区', labelZh: '花地玛堂区 (北区)', labelEn: 'Nossa Senhora de Fátima' },
  { value: '圣安多尼堂区', labelZh: '圣安多尼堂区 (白鸽巢)', labelEn: 'Santo António' },
  { value: '大堂区', labelZh: '大堂区 (中区/新口岸)', labelEn: 'Sé' },
  { value: '望德堂区', labelZh: '望德堂区 (荷兰园)', labelEn: 'São Lázaro' },
  { value: '风顺堂区', labelZh: '风顺堂区 (下环)', labelEn: 'São Lourenço' },
  { value: '嘉模堂区', labelZh: '嘉模堂区 (氹仔)', labelEn: 'Nossa Senhora do Carmo (Taipa)' },
  { value: '圣方济各堂区', labelZh: '圣方济各堂区 (路环)', labelEn: 'São Francisco Xavier (Coloane)' },
  { value: '路氹城', labelZh: '路氹城', labelEn: 'Cotai' }
];

// Pre-warmed standard ISO 3166-2 lists for instant UI rendering with zero network/disk lag
const HK_SUBDIVISIONS = Object.entries(HK_ZH_MAP).map(([en, zh]) => ({
  value: zh,
  labelZh: zh,
  labelZhHant: zh.replace('中西区', '中西區').replace('湾仔区', '灣仔區').replace('东区', '東區').replace('南区', '南區').replace('油尖旺区', '油尖旺區').replace('深水埗区', '深水埗區').replace('九龙城区', '九龍城區').replace('黄大仙区', '黃大仙區').replace('观塘区', '觀塘區').replace('葵青区', '葵青區').replace('荃湾区', '荃灣區').replace('屯门区', '屯門區').replace('元朗区', '元朗區').replace('北区', '北區').replace('大埔区', '大埔區').replace('沙田区', '沙田區').replace('西贡区', '西貢區').replace('离岛区', '離島區'),
  labelEn: en
}));

const CN_SUBDIVISIONS = Object.entries(CN_ZH_MAP).map(([en, zh]) => ({
  value: zh,
  labelZh: zh,
  labelZhHant: zh.replace('省', '省').replace('市', '市').replace('自治区', '自治區').replace('广东', '廣東').replace('浙江', '浙江').replace('江苏', '江蘇').replace('山东', '山東').replace('四川', '四川').replace('辽宁', '遼寧').replace('吉林', '吉林').replace('黑龙江', '黑龍江').replace('广西', '廣西').replace('贵州', '貴州').replace('云南', '雲南').replace('陕西', '陝西').replace('内蒙古', '內蒙古').replace('宁夏', '寧夏').replace('新疆维吾尔', '新疆維吾爾'),
  labelEn: en
}));

const TW_SUBDIVISIONS = Object.entries(TW_ZH_MAP).map(([en, zh]) => ({
  value: zh,
  labelZh: zh,
  labelZhHant: zh.replace('台北市', '臺北市').replace('新北市', '新北市').replace('桃园市', '桃園市').replace('台中市', '臺中市').replace('台南市', '臺南市').replace('高雄市', '高雄市').replace('基隆市', '基隆市').replace('新竹市', '新竹市').replace('嘉义市', '嘉義市').replace('宜兰县', '宜蘭縣').replace('花莲县', '花蓮縣').replace('台东县', '臺東縣').replace('澎湖县', '澎湖縣').replace('金门县', '金門縣').replace('连江县', '連江縣').replace('苗栗县', '苗栗縣').replace('彰化县', '彰化縣').replace('南投县', '南投縣').replace('云林县', '雲林縣').replace('屏东县', '屏東縣'),
  labelEn: en
}));

export function getFlagClass(code) {
  if (!code) return '';
  const upper = code.toUpperCase();
  if (upper === 'AC') return 'fi-sh-ac';
  if (upper === 'TA') return 'fi-sh-ta';
  return 'fi-' + code.toLowerCase();
}

/**
 * Standard ISO Countries built dynamically from standard ISO 3166-1
 */
function buildIsoCountries() {
  const allCodes = getCountries();

  const list = allCodes.map(code => {
    let nameZh = countries.getName(code, 'zh');
    let nameEn = countries.getName(code, 'en');

    // Handle exceptionally reserved ISO codes AC & TA not in standard ISO 3166-1 tables
    if (code === 'AC') {
      nameZh = '阿森松岛';
      nameEn = 'Ascension Island';
    } else if (code === 'TA') {
      nameZh = '特里斯坦-达库尼亚';
      nameEn = 'Tristan da Cunha';
    } else {
      nameZh = nameZh || code;
      nameEn = nameEn || code;
    }

    nameZh = nameZh
      .replace(/中国台湾省?|台湾省/g, '台湾')
      .replace(/^中国香港$/, '香港')
      .replace(/^中国澳门$/, '澳门')
      .replace(/^韩国$/, '南韩')
      .replace(/^朝鲜$/, '北韩')
      .replace(/^圣赫勒拿、阿森松和特里斯坦-达库尼亚$/, '圣赫勒拿');

    nameEn = nameEn
      .replace(/, Province of China/g, '')
      .replace(/People's Republic of China/g, 'China')
      .replace(/^Macao$/, 'Macau')
      .replace(/^Saint Helena, Ascension and Tristan da Cunha$/, 'Saint Helena')
      .replace(/Korea, Republic of/g, 'South Korea')
      .replace(/Korea, Democratic People's Republic of/g, 'North Korea');

    const flagClass = getFlagClass(code);

    let flag = '🌐';
    try {
      flag = String.fromCodePoint(
        ...code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0))
      );
    } catch (e) {}

    let nameZhHant = zhHantCountries[code];
    if (Array.isArray(nameZhHant)) nameZhHant = nameZhHant[0];
    nameZhHant = nameZhHant || nameZh;
    if (code === 'AC') {
      nameZh = '阿森松岛';
      nameZhHant = '阿森松島';
      nameEn = 'Ascension Island';
    } else if (code === 'TA') {
      nameZh = '特里斯坦-达库尼亚';
      nameZhHant = '特里斯坦-達庫尼亞';
      nameEn = 'Tristan da Cunha';
    } else {
      nameZh = nameZh || code;
      nameEn = nameEn || code;
    }
    let nameFr = countries.getName(code, 'fr') || nameEn;
    let nameEs = countries.getName(code, 'es') || nameEn;
    let nameNl = countries.getName(code, 'nl') || nameEn;

    return {
      code,
      nameZh,
      nameZhHant,
      nameEn,
      nameFr,
      nameEs,
      nameNl,
      flag,
      flagClass
    };
  });

  // Sort strictly in international common alphabetical order (by English name A to Z)
  list.sort((a, b) => a.nameEn.localeCompare(b.nameEn, 'en'));

  return list;
}

export const ISO_COUNTRIES = buildIsoCountries();

// 常用国际国家/地区一级行政区本地精简数据（ISO 3166-2 常用集）。
// 命中本地数据即同步返回；未列出的国家优雅降级为不展示省州下拉（不再整包拉取 8.7MB 数据）。
const intl = (name) => ({ value: name, labelZh: name, labelEn: name });
const LOCAL_INTL_SUBDIVISIONS = {
  US: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'].map(intl),
  CA: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'].map(intl),
  GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'].map(intl),
  AU: ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania', 'Australian Capital Territory', 'Northern Territory'].map(intl),
  NZ: ['Auckland', 'Bay of Plenty', 'Canterbury', 'Gisborne', "Hawke's Bay", 'Manawatū-Whanganui', 'Marlborough', 'Nelson', 'Northland', 'Otago', 'Southland', 'Taranaki', 'Tasman', 'Waikato', 'Wellington', 'West Coast'].map(intl),
  JP: ['Aichi', 'Akita', 'Aomori', 'Chiba', 'Ehime', 'Fukui', 'Fukuoka', 'Fukushima', 'Gifu', 'Gunma', 'Hiroshima', 'Hokkaido', 'Hyogo', 'Ibaraki', 'Ishikawa', 'Iwate', 'Kagawa', 'Kagoshima', 'Kanagawa', 'Kochi', 'Kumamoto', 'Kyoto', 'Mie', 'Miyagi', 'Miyazaki', 'Nagano', 'Nagasaki', 'Nara', 'Niigata', 'Oita', 'Okayama', 'Okinawa', 'Osaka', 'Saga', 'Saitama', 'Shiga', 'Shimane', 'Shizuoka', 'Tochigi', 'Tokushima', 'Tokyo', 'Tottori', 'Toyama', 'Wakayama', 'Yamagata', 'Yamaguchi', 'Yamanashi'].map(intl),
  KR: ['Seoul', 'Busan', 'Daegu', 'Incheon', 'Gwangju', 'Daejeon', 'Ulsan', 'Sejong', 'Gyeonggi-do', 'Gangwon-do', 'Chungcheongbuk-do', 'Chungcheongnam-do', 'Jeollabuk-do', 'Jeollanam-do', 'Gyeongsangbuk-do', 'Gyeongsangnam-do', 'Jeju-do'].map(intl),
  DE: ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'].map(intl),
  FR: ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur", 'Guadeloupe', 'Martinique', 'Guyane', 'La Réunion', 'Mayotte'].map(intl),
  ES: ['Andalucía', 'Aragón', 'Principado de Asturias', 'Illes Balears', 'Canarias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Comunidad de Madrid', 'Región de Murcia', 'Comunidad Foral de Navarra', 'País Vasco'].map(intl),
  IT: ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto'].map(intl),
  NL: ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland'].map(intl),
  MY: ['Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu'].map(intl),
};

/**
 * Get subdivisions for a country synchronously.
 * 本地精简数据集直出（HK/MO/CN/TW + LOCAL_INTL_SUBDIVISIONS）；
 * 未列出的国家返回空数组，表单侧按「无省州下拉」优雅降级。
 */
export function getSubdivisionsByCountry(countryCode) {
  if (!countryCode) return [];
  const upper = countryCode.toUpperCase();

  if (upper === 'HK') return HK_SUBDIVISIONS;
  if (upper === 'MO') return MO_PARISHES;
  if (upper === 'CN') return CN_SUBDIVISIONS;
  if (upper === 'TW') return TW_SUBDIVISIONS;

  if (LOCAL_INTL_SUBDIVISIONS[upper]) return LOCAL_INTL_SUBDIVISIONS[upper];

  return [];
}

/**
 * Countries/territories that DO NOT use postal code systems (Universal Postal Union / ISO 3166)
 * e.g., HKG (Hong Kong), MAC (Macau), PRK (North Korea), UAE, Qatar, etc.
 */
const NO_POSTAL_CODE_COUNTRIES = new Set([
  'HK', 'MO', 'KP', 'AE', 'QA', 'SY', 'YE', 'FJ', 'VU', 'BS', 'BZ', 'BJ', 'BW', 'BF', 'BI', 'CM',
  'CF', 'KM', 'CG', 'DJ', 'GQ', 'ER', 'GA', 'GM', 'GH', 'GD', 'GY', 'CI', 'KI', 'ML', 'MR',
  'NR', 'RW', 'ST', 'SC', 'SL', 'SB', 'SO', 'SR', 'TG', 'TO', 'TV', 'UG'
]);

/**
 * Returns whether a country or territory uses postal codes
 */
export function hasPostalCode(countryCode) {
  if (!countryCode) return false;
  return !NO_POSTAL_CODE_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Returns the exact context-aware label for postal code:
 * "邮政编码 (选填)：" only for places without postal codes like HKG, North Korea, etc.
 * "邮政编码：" for countries that use postal codes (China, USA, Taiwan, Japan, UK, etc.)
 */
export function getPostalCodeLabel(countryCode, lang = 'zh') {
  const hasZip = hasPostalCode(countryCode);
  if (lang === 'zh-Hant') {
    return hasZip ? '郵遞區號：' : '郵遞區號 (選填)：';
  }
  if (lang === 'fr') {
    return hasZip ? 'Code postal :' : 'Code postal (optionnel) :';
  }
  if (lang === 'es') {
    return hasZip ? 'Código postal:' : 'Código postal (opcional):';
  }
  if (lang === 'nl') {
    return hasZip ? 'Postcode:' : 'Postcode (optioneel):';
  }
  if (lang === 'en') {
    return hasZip ? 'Postal Code / ZIP:' : 'Postal Code (Optional):';
  }
  return hasZip ? '邮政编码：' : '邮政编码 (选填)：';
}

/**
 * Returns the placeholder for postal code based on the country
 */
export function getPostalCodePlaceholder(countryCode, lang = 'zh') {
  const upper = (countryCode || '').toUpperCase();
  if (!hasPostalCode(upper)) {
    if (lang === 'zh-Hant') return '當地無郵遞區號（留空或選填）';
    if (lang === 'fr') return 'Aucun code postal local (optionnel)';
    if (lang === 'es') return 'Sin código postal local (opcional)';
    if (lang === 'nl') return 'Geen lokale postcode (optioneel)';
    if (lang === 'en') return 'No postal code used locally (optional)';
    return '当地无邮政编码（留空或选填）';
  }
  if (lang === 'zh-Hant') {
    if (upper === 'TW') return '郵遞區號 (如: 100)';
    if (upper === 'CN') return '6 位數字郵政編碼 (如: 100000)';
    if (upper === 'US') return '5 位 ZIP Code (如: 94105)';
    if (upper === 'JP') return '7 位數字郵編 (如: 100-0001)';
    if (upper === 'GB') return '英國郵政編碼 (如: SW1A 1AA)';
    if (upper === 'CA') return '加拿大郵編 (如: K1A 0B1)';
    return '輸入郵遞區號';
  }
  if (lang === 'fr') {
    if (upper === 'FR') return 'Code postal à 5 chiffres (ex. 75001)';
    if (upper === 'US') return 'Code ZIP à 5 chiffres (ex. 94105)';
    return 'Entrez le code postal';
  }
  if (lang === 'es') {
    if (upper === 'ES') return 'Código postal de 5 dígitos (ej. 28001)';
    if (upper === 'US') return 'Código ZIP de 5 dígitos (ej. 94105)';
    return 'Ingrese código postal';
  }
  if (lang === 'nl') {
    if (upper === 'NL') return '4 cijfers en 2 letters (bijv. 1012 AB)';
    return 'Voer postcode in';
  }
  if (lang === 'en') {
    if (upper === 'CN') return '6-digit postal code (e.g. 100000)';
    if (upper === 'US') return '5-digit ZIP code (e.g. 94105)';
    if (upper === 'TW') return 'Postal code (e.g. 100)';
    if (upper === 'JP') return '7-digit postal code (e.g. 100-0001)';
    if (upper === 'GB') return 'UK postcode (e.g. SW1A 1AA)';
    if (upper === 'CA') return 'Canadian postal code (e.g. K1A 0B1)';
    return 'Enter postal code';
  }
  if (upper === 'CN') return '6 位数字邮政编码 (如: 100000)';
  if (upper === 'US') return '5 位 ZIP Code (如: 94105)';
  if (upper === 'TW') return '邮递区号 (如: 100)';
  if (upper === 'JP') return '7 位数字邮编 (如: 100-0001)';
  if (upper === 'GB') return '英国邮政编码 (如: SW1A 1AA)';
  if (upper === 'CA') return '加拿大邮编 (如: K1A 0B1)';
  return '输入邮政编码';
}

/**
 * Format a structured address object into a clean standard string
 */
export function formatStructuredAddress(addr, lang = 'zh') {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;

  const countryMeta = ISO_COUNTRIES.find(c => c.code === addr.country);
  const countryName = countryMeta ? (lang === 'zh' ? countryMeta.nameZh : countryMeta.nameEn) : (addr.country || '');
  
  const parts = [];
  if (countryName && countryName !== '其他国家 / 地区' && countryName !== 'Other International') {
    parts.push(countryName);
  }
  if (addr.state) parts.push(addr.state);
  if (addr.city) parts.push(addr.city);
  if (addr.street) parts.push(addr.street);
  if (addr.postalCode && hasPostalCode(addr.country)) parts.push(`[${addr.postalCode}]`);

  return parts.join(' · ');
}

export function getCountryDisplayName(countryMeta, lang = 'zh') {
  if (!countryMeta) return '';
  if (lang === 'zh-Hant') return countryMeta.nameZhHant || countryMeta.nameZh;
  if (lang === 'fr') return countryMeta.nameFr || countryMeta.nameEn;
  if (lang === 'es') return countryMeta.nameEs || countryMeta.nameEn;
  if (lang === 'nl') return countryMeta.nameNl || countryMeta.nameEn;
  if (lang === 'en') return countryMeta.nameEn;
  return countryMeta.nameZh;
}
