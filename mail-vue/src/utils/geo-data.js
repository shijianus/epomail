/**
 * Standard Geolocation & Administrative Division Dataset
 * Powered by industry-standard npm packages:
 * - country-state-city (ISO 3166-1 & ISO 3166-2, loaded on-demand for zero initial lag)
 * - i18n-iso-countries (ISO 3166-1 multilingual standards)
 * - libphonenumber-js (ISO 3166-1 official territory codes)
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

countries.registerLocale(zhLocale);
countries.registerLocale(enLocale);

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
  labelEn: en
}));

const CN_SUBDIVISIONS = Object.entries(CN_ZH_MAP).map(([en, zh]) => ({
  value: zh,
  labelZh: zh,
  labelEn: en
}));

const TW_SUBDIVISIONS = Object.entries(TW_ZH_MAP).map(([en, zh]) => ({
  value: zh,
  labelZh: zh,
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

    return {
      code,
      nameZh,
      nameEn,
      flag,
      flagClass
    };
  });

  // Sort strictly in international common alphabetical order (by English name A to Z)
  list.sort((a, b) => a.nameEn.localeCompare(b.nameEn, 'en'));

  return list;
}

export const ISO_COUNTRIES = buildIsoCountries();

// Lazy cache for country-state-city standard module
let cachedCscState = null;

/**
 * Get subdivisions for a country dynamically
 * Instant synchronous return for HK, MO, CN, TW; asynchronously supplements other countries via country-state-city
 */
export function getSubdivisionsByCountry(countryCode) {
  if (!countryCode) return [];
  const upper = countryCode.toUpperCase();

  if (upper === 'HK') return HK_SUBDIVISIONS;
  if (upper === 'MO') return MO_PARISHES;
  if (upper === 'CN') return CN_SUBDIVISIONS;
  if (upper === 'TW') return TW_SUBDIVISIONS;

  if (cachedCscState) {
    const states = cachedCscState.getStatesOfCountry(upper) || [];
    return states.map(s => ({
      value: s.name,
      labelZh: s.name,
      labelEn: s.name
    }));
  }

  // Pre-fetch country-state-city in background for international countries
  import('country-state-city').then(mod => {
    cachedCscState = mod.State;
  }).catch(() => {});

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
  if (hasZip) {
    return lang === 'zh' ? '邮政编码：' : 'Postal Code / ZIP:';
  }
  return lang === 'zh' ? '邮政编码 (选填)：' : 'Postal Code (Optional):';
}

/**
 * Returns the placeholder for postal code based on the country
 */
export function getPostalCodePlaceholder(countryCode, lang = 'zh') {
  const upper = (countryCode || '').toUpperCase();
  if (!hasPostalCode(upper)) {
    return lang === 'zh' ? '当地无邮政编码（留空或选填）' : 'No postal code used locally (optional)';
  }
  if (upper === 'CN') return lang === 'zh' ? '6 位数字邮政编码 (如: 100000)' : '6-digit postal code (e.g. 100000)';
  if (upper === 'US') return lang === 'zh' ? '5 位 ZIP Code (如: 94105)' : '5-digit ZIP code (e.g. 94105)';
  if (upper === 'TW') return lang === 'zh' ? '邮递区号 (如: 100)' : 'Postal code (e.g. 100)';
  if (upper === 'JP') return lang === 'zh' ? '7 位数字邮编 (如: 100-0001)' : '7-digit postal code (e.g. 100-0001)';
  if (upper === 'GB') return lang === 'zh' ? '英国邮政编码 (如: SW1A 1AA)' : 'UK postcode (e.g. SW1A 1AA)';
  if (upper === 'CA') return lang === 'zh' ? '加拿大邮编 (如: K1A 0B1)' : 'Canadian postal code (e.g. K1A 0B1)';
  return lang === 'zh' ? '输入邮政编码' : 'Enter postal code';
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
