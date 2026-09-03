/**
 * International Phone Validator Utility powered by industry standard packages:
 * - libphonenumber-js (Google libphonenumber standard)
 * - i18n-iso-countries (ISO 3166-1 international standards)
 * 
 * Complies strictly with standard naming rules:
 * - 香港 / Hong Kong
 * - 澳门 / Macau
 * - 台湾 / Taiwan
 * - 中国 / China
 */

import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
  validatePhoneNumberLength,
  AsYouType,
  getExampleNumber
} from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';
import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';
import enLocale from 'i18n-iso-countries/langs/en.json';

// Register standard ISO locales
countries.registerLocale(zhLocale);
countries.registerLocale(enLocale);

// Top priority countries to list first in the UI dropdown
const PRIORITY_CODES = [
  'HK', 'MO', 'TW', 'CN', 'US', 'CA', 'GB', 'JP', 'SG', 'AU',
  'DE', 'FR', 'KR', 'MY', 'NZ', 'TH', 'VN', 'PH', 'ID', 'IN',
  'IT', 'ES', 'NL', 'CH', 'AE'
];

export function getFlagClass(code) {
  if (!code) return '';
  const upper = code.toUpperCase();
  if (upper === 'AC') return 'fi-sh-ac';
  if (upper === 'TA') return 'fi-sh-ta';
  return 'fi-' + code.toLowerCase();
}

/**
 * Standard country options built dynamically from standard ISO 3166-1 and libphonenumber-js
 */
function buildCountryOptions() {
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

    // Strictly normalize names according to requirements:
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

    let dialCode = '';
    try {
      dialCode = '+' + getCountryCallingCode(code);
    } catch (e) {}

    const flagClass = getFlagClass(code);

    // Official Unicode standard regional indicator formula for flag emoji fallback
    let flag = '🌐';
    try {
      flag = String.fromCodePoint(
        ...code.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0))
      );
    } catch (e) {}

    // Standard placeholder / examples
    let placeholder = '';
    if (code === 'CN') placeholder = '138-0013-8000';
    else if (code === 'US') placeholder = '(209)-678-9490';
    else if (code === 'CA') placeholder = '(415)-555-2671';
    else if (code === 'TW') placeholder = '(0912)-345-678';
    else if (code === 'HK') placeholder = '9123-4567';
    else if (code === 'MO') placeholder = '6612-3456';
    else if (code === 'GB') placeholder = '07911-123456';
    else if (code === 'JP') placeholder = '(090)-1234-5678';
    else if (code === 'SG') placeholder = '8123-4567';
    else if (code === 'KR') placeholder = '(010)-1234-5678';
    else if (code === 'KP') placeholder = '191-234-5678';
    else if (code === 'DE') placeholder = '(0151)-1234-5678';
    else if (code === 'FR') placeholder = '06-12-34-56-78';
    else if (code === 'AU') placeholder = '(0412)-345-678';
    else if (code === 'AC') placeholder = '61234';
    else if (code === 'TA') placeholder = '8123';
    else {
      try {
        const ex = getExampleNumber(code, examples);
        if (ex) {
          const nat = ex.formatNational();
          placeholder = nat ? formatPhoneInput(nat.replace(/\D/g, ''), code) : '9123-4567';
        } else {
          placeholder = '9123-4567';
        }
      } catch (e) {
        placeholder = '9123-4567';
      }
    }

    return {
      code,
      dialCode,
      nameZh,
      nameEn,
      flag,
      flagClass,
      placeholder
    };
  });

  // Sort strictly in international common alphabetical order (by English name A to Z)
  list.sort((a, b) => a.nameEn.localeCompare(b.nameEn, 'en'));

  return list;
}

export const COUNTRY_OPTIONS = buildCountryOptions();

/**
 * Automatically determine the default ISO country code based on detected IP country or browser info
 */
export function getDefaultCountryCode(clientCountry) {
  if (clientCountry) {
    const upper = clientCountry.toUpperCase();
    const found = COUNTRY_OPTIONS.find(c => c.code === upper);
    if (found) return found.code;
  }

  if (typeof navigator !== 'undefined') {
    const navLanguages = navigator.languages || [navigator.language];
    for (const l of navLanguages) {
      if (!l) continue;
      const parts = l.split('-');
      if (parts.length > 1) {
        const region = parts[1].toUpperCase();
        const found = COUNTRY_OPTIONS.find(c => c.code === region);
        if (found) return found.code;
      }
    }
  }

  return 'HK'; // Default fallback
}

const KNOWN_MAX_DIGITS = {
  US: 10, CA: 10, CN: 11, HK: 8, MO: 8, SG: 8,
  TW: 10, JP: 11, KR: 11, GB: 11, FR: 10, DE: 12,
  AU: 10, IT: 11, ES: 9, BR: 11, RU: 10, IN: 10,
  AC: 5, TA: 4
};

export function getMaxPhoneDigits(countryCode) {
  const c = (countryCode || 'US').toUpperCase();
  if (KNOWN_MAX_DIGITS[c]) return KNOWN_MAX_DIGITS[c];
  try {
    const ex = getExampleNumber(c, examples);
    if (ex && ex.nationalNumber) {
      return Math.max(ex.nationalNumber.length + 2, 8);
    }
  } catch (e) {}
  return 15;
}

/**
 * Real-time phone number auto-formatter directly for the input box for all 245 countries
 * Formats progressively as the user types with standardized hyphens and area codes.
 */
export function formatPhoneInput(rawNumber, countryCode) {
  if (!rawNumber) return '';
  const digits = String(rawNumber).replace(/\D/g, '');
  if (!digits) return '';

  const c = (countryCode || 'US').toUpperCase();

  // 1. US / CA progressive bracket format: (2) -> (20) -> (209) -> (209)-6 -> (209)-678 -> (209)-678-9 -> (209)-678-9490
  if (c === 'US' || c === 'CA') {
    if (digits.length <= 3) {
      return `(${digits})`;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  }

  // 2. CN: 138-0013-8000 or (010)-8888-8888
  if (c === 'CN') {
    if (digits.startsWith('0')) {
      if (digits.startsWith('01') || digits.startsWith('02')) {
        if (digits.length <= 3) return `(${digits})`;
        if (digits.length <= 7) return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
        return `(${digits.slice(0, 3)})-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
      } else {
        if (digits.length <= 4) return `(${digits})`;
        if (digits.length <= 8) return `(${digits.slice(0, 4)})-${digits.slice(4)}`;
        return `(${digits.slice(0, 4)})-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
      }
    } else {
      if (digits.length <= 3) return digits;
      if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
    }
  }

  // 3. HK / MO / SG: 8 digits 4-4
  if (c === 'HK' || c === 'MO' || c === 'SG') {
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }

  // 4. TW: (0912)-345-678 or (02)-2345-6789
  if (c === 'TW') {
    if (digits.startsWith('09')) {
      if (digits.length <= 4) return `(${digits})`;
      if (digits.length <= 7) return `(${digits.slice(0, 4)})-${digits.slice(4)}`;
      return `(${digits.slice(0, 4)})-${digits.slice(4, 7)}-${digits.slice(7, 10)}`;
    } else if (digits.startsWith('0')) {
      if (digits.length <= 2) return `(${digits})`;
      if (digits.length <= 6) return `(${digits.slice(0, 2)})-${digits.slice(2)}`;
      return `(${digits.slice(0, 2)})-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    } else {
      if (digits.length <= 4) return digits;
      if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
      return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 10)}`;
    }
  }

  // 5. JP / KR: (090)-1234-5678 or (010)-1234-5678
  if (c === 'JP' || c === 'KR') {
    if (digits.startsWith('0')) {
      if (digits.length <= 3) return `(${digits})`;
      if (digits.length <= 7) return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
      return `(${digits.slice(0, 3)})-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
    } else {
      if (digits.length <= 3) return digits;
      if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
    }
  }

  // 6. GB: (07911)-123456
  if (c === 'GB') {
    if (digits.startsWith('0')) {
      if (digits.length <= 5) return `(${digits})`;
      return `(${digits.slice(0, 5)})-${digits.slice(5, 11)}`;
    } else {
      if (digits.length <= 4) return digits;
      return `${digits.slice(0, 4)}-${digits.slice(4, 10)}`;
    }
  }

  // 7. FR: 06-12-34-56-78
  if (c === 'FR') {
    const pairs = [];
    for (let i = 0; i < digits.length && i < 10; i += 2) {
      pairs.push(digits.slice(i, i + 2));
    }
    return pairs.join('-');
  }

  // 8. DE / AU:
  if (c === 'DE' || c === 'AU') {
    if (digits.startsWith('0')) {
      if (digits.length <= 4) return `(${digits})`;
      if (digits.length <= 7) return `(${digits.slice(0, 4)})-${digits.slice(4)}`;
      return `(${digits.slice(0, 4)})-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
    }
  }

  // 9. All 245 countries via AsYouType engine with standard hyphenation
  try {
    const ayt = new AsYouType(c);
    let res = ayt.input(digits);
    if (res) {
      res = res.replace(/\((\d+)\)\s*/, (m, p) => `(${p})-`);
      res = res.replace(/\s+/g, '-');
      return res;
    }
  } catch (e) {}

  // Progressive Fallback
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 15)}`;
}

export function formatPhoneNumber(rawNumber, countryCode) {
  return formatPhoneInput(rawNumber, countryCode);
}

/**
 * Standard phone number validation powered by libphonenumber-js
 */
export function validatePhoneNumber(countryCode, rawNumber) {
  if (!rawNumber || !rawNumber.trim()) {
    return {
      valid: false,
      msgZh: '请输入电话号码',
      msgEn: 'Please enter a phone number',
      cleanNum: '',
      formatted: ''
    };
  }

  const country = COUNTRY_OPTIONS.find(c => c.code === countryCode) || COUNTRY_OPTIONS[0];
  let cleanNum = rawNumber.trim().replace(/[\s\-()]/g, '');

  if (country.dialCode && cleanNum.startsWith(country.dialCode)) {
    cleanNum = cleanNum.slice(country.dialCode.length);
  } else if (cleanNum.startsWith('+')) {
    const dialDigits = country.dialCode.replace('+', '');
    if (dialDigits && cleanNum.startsWith('+' + dialDigits)) {
      cleanNum = cleanNum.slice(dialDigits.length + 1);
    }
  }

  const digitsOnly = cleanNum.replace(/\D/g, '');
  if (!digitsOnly) {
    return {
      valid: false,
      msgZh: '号码中必须包含有效数字',
      msgEn: 'Number must contain valid digits',
      cleanNum: '',
      formatted: ''
    };
  }

  const c = (countryCode || 'US').toUpperCase();

  // 1. Google libphonenumber Standard Length Validation
  const lenError = validatePhoneNumberLength(digitsOnly, c);
  if (lenError) {
    const lenMsgsZh = {
      TOO_SHORT: `电话号码长度不足（当前为 ${digitsOnly.length} 位）`,
      TOO_LONG: `电话号码长度超出限制（当前为 ${digitsOnly.length} 位）`,
      INVALID_LENGTH: `电话号码长度不符合该国家/地区规范（当前为 ${digitsOnly.length} 位）`,
      INVALID_COUNTRY: '国家/地区代码无效'
    };
    const lenMsgsEn = {
      TOO_SHORT: `Phone number is too short (${digitsOnly.length} digits)`,
      TOO_LONG: `Phone number is too long (${digitsOnly.length} digits)`,
      INVALID_LENGTH: `Invalid phone number length (${digitsOnly.length} digits)`,
      INVALID_COUNTRY: 'Invalid country code'
    };
    return {
      valid: false,
      msgZh: lenMsgsZh[lenError] || `${country.nameZh}电话号码长度不正确`,
      msgEn: lenMsgsEn[lenError] || `Invalid ${country.nameEn} phone number length`,
      cleanNum: digitsOnly,
      formatted: ''
    };
  }

  // 2. Google libphonenumber Full National Numbering Plan (NNP) Validation
  let parsed = null;
  try {
    parsed = parsePhoneNumber(digitsOnly, c);
  } catch (e) {
    return {
      valid: false,
      msgZh: `${country.nameZh}电话号码格式不正确`,
      msgEn: `Invalid ${country.nameEn} phone number format`,
      cleanNum: digitsOnly,
      formatted: ''
    };
  }

  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      msgZh: '无效的电话号码或号段未分配',
      msgEn: 'Invalid phone number or unassigned area/prefix',
      cleanNum: digitsOnly,
      formatted: ''
    };
  }

  return {
    valid: true,
    msgZh: '',
    msgEn: '',
    type: parsed.getType(),
    cleanNum: digitsOnly,
    formatted: formatPhoneInput(digitsOnly, countryCode)
  };
}
