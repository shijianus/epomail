import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildScenarioNotificationPreview,
  SCENARIO_TYPES
} from '../mail-vue/src/views/audit-report/utils/adjudication-engine.js';

// No server, build, browser, database, or generated files: use installed frontend
// dependencies and execute the production functions in memory.
const vueRequire = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { createI18n } = vueRequire('vue-i18n');
const { parse, babelParse } = vueRequire('vue/compiler-sfc');
const sourceUrl = path => new URL(`../mail-vue/src/${path}`, import.meta.url);
const locales = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const messages = Object.fromEntries(await Promise.all(locales.map(async locale => [
  locale, (await import(sourceUrl(`i18n/${locale}.js`))).default
])));
const translator = locale => createI18n({
  legacy: false,
  locale,
  fallbackLocale: false,
  messages: { [locale]: messages[locale] }
}).global.t;

// Explicit regression scope, independent of git HEAD and dictionary ordering.
const localizedKeys = [
  'termsDialogUsageTitle', 'termsDialogUsageBody',
  'termsDialogStorageTitle', 'termsDialogStorageBody',
  'termsDialogDisclaimerTitle', 'termsDialogDisclaimerBody',
  'privacyDialogPrinciplesTitle', 'privacyDialogPrinciplesBody',
  'privacyDialogIsolationTitle', 'privacyDialogIsolationBody',
  'privacyDialogErasureTitle', 'privacyDialogErasureBody',
  'auditNoticeSubjectBlacklist', 'auditNoticeDecisionBlacklist',
  'auditPreviewEffectiveBlacklist', 'auditPreviewReachableExternalBlocked',
  'auditNoticeSubjectArchive', 'auditNoticeDecisionArchive',
  'auditPreviewEffectiveArchive', 'auditPreviewEffectiveMaintainBan',
  'auditPreviewEffectiveRejectAppeal', 'nextAuthSampleCaption',
  'oauthSampleClientSecretHint', 'oauthSampleRedirect', 'oauthSampleHandleCallback',
  'oauthSampleExchangeToken', 'oauthSampleFetchUserInfo', 'oauthSampleLoginSuccess',
  'oauthSampleAuthorizeUrl', 'oauthSampleExchangeAuthCode', 'oauthSampleAccessUserInfo',
  'noNewNodesPlaceholder', 'auditTimelineEvent', 'emojiCategoryCommon',
  'emojiCategoryFaces', 'emojiCategoryGestures', 'emojiCategorySymbols',
  'reportNotSpamSuccess', 'visitorUserListForbidden', 'passkeyActivationFailed',
  'auditAppealSubmitFailed', 'aiModelSelectionRequired',
  'phoneValidationRequired', 'phoneValidationNoDigits', 'phoneValidationTooShort',
  'phoneValidationTooLong', 'phoneValidationInvalidLength', 'phoneValidationInvalidCountry',
  'phoneValidationCountryLength', 'phoneValidationInvalidFormat', 'phoneValidationInvalidNumber',
  'addressCityPlaceholderHK', 'addressCityPlaceholderMO', 'addressCityPlaceholderTW',
  'addressCityPlaceholderCN', 'addressCityPlaceholder', 'addressSubdivisionHK',
  'addressSubdivisionMO', 'addressSubdivisionTW', 'addressSubdivisionCN',
  'addressSubdivisionJP', 'addressSubdivisionUS', 'addressSubdivisionGB',
  'addressSubdivisionSG', 'addressSubdivision', 'phoneNumberExample', 'dateYmdDisplay',
  'authPlaceholderLoginSuccess', 'authPlaceholderRegisterSuccess',
  'authPlaceholderInvalidCredentials', 'authPlaceholderPasswordMismatch',
  'authPlaceholderNoLandingNodes', 'labelPersonalBlock', 'labelAutoDelete', 'labelMuted'
];
const parameterSets = [
  { caseId: 'CASE-42', email: 'sender+test@example.test', digits: 7, country: 'Country-é', number: '(123)-456', year: 2026, month: '02', day: '03' },
  { caseId: 'CASE-99', email: 'other@example.test', digits: 12, country: 'Country-ñ', number: '987-654', year: 2027, month: '11', day: '29' }
];
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

for (const locale of locales) {
  test(`new translations: ${locale} has symmetric parameters and real interpolation`, () => {
    const t = translator(locale);
    assert.equal(localizedKeys.length, 75);
    assert.equal(new Set(localizedKeys).size, 75);
    assert.deepEqual(Object.keys(messages[locale]).sort(), Object.keys(messages.zh).sort());
    for (const key of localizedKeys) {
      const text = messages[locale][key];
      assert.equal(typeof text, 'string', `${locale}/${key}`);
      assert.ok(text.trim(), `${locale}/${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(messages.zh[key]), `${locale}/${key}`);
      for (const params of parameterSets) {
        const expected = text.replace(/\{(\w+)\}/g, (_, name) => {
          assert.ok(Object.hasOwn(params, name), `Missing test parameter ${name}`);
          return String(params[name]);
        });
        assert.equal(t(key, params), expected, `${locale}/${key}: interpolation must preserve the supplied values`);
      }
      if (!locale.startsWith('zh')) assert.doesNotMatch(t(key, parameterSets[0]), /\p{Script=Han}/u);
    }
  });
}

const first = SCENARIO_TYPES.FIRST_ADJUDICATION;
const review = SCENARIO_TYPES.SANCTION_REVIEW;
const appeal = SCENARIO_TYPES.APPEAL_AUDIT;
// Independent expected message selection for all eight executable verdicts.
const noticeCases = [
  [first, 'ban_account', 'auditNoticeSubjectFirstBan', 'auditNoticeDecisionFirstBan', 'auditPreviewEffectiveImmediate', 'auditPreviewReachableRejectGap'],
  [first, 'no_penalty', 'auditNoticeSubjectDismiss', 'auditNoticeDecisionDismiss', 'auditPreviewEffectiveImmediate', 'auditPreviewReachableNormal', 'auditNoticeAppealNoneNeeded'],
  [first, 'blacklist_sender', 'auditNoticeSubjectBlacklist', 'auditNoticeDecisionBlacklist', 'auditPreviewEffectiveBlacklist', 'auditPreviewReachableExternalBlocked'],
  [first, 'archive_routine', 'auditNoticeSubjectArchive', 'auditNoticeDecisionArchive', 'auditPreviewEffectiveArchive', 'auditPreviewReachableNormal'],
  [review, 'maintain_ban', 'auditNoticeSubjectMaintainBan', 'auditNoticeDecisionMaintainBan', 'auditPreviewEffectiveMaintainBan', 'auditPreviewReachableRejectGap'],
  [review, 'unban', 'auditNoticeSubjectUnban', 'auditNoticeDecisionUnban', 'auditPreviewEffectiveImmediate', 'auditPreviewReachableNormal'],
  [appeal, 'approve_appeal', 'auditPreviewSubjectApprove', 'auditNoticeDecisionApproveAppeal', 'auditPreviewEffectiveImmediate', 'auditPreviewReachableNormal'],
  [appeal, 'reject_appeal', 'auditNoticeSubjectRejectAppeal', 'auditNoticeDecisionRejectAppeal', 'auditPreviewEffectiveRejectAppeal', 'auditPreviewReachableRejectGap']
];
for (const locale of locales) {
  for (const [scenario, key, subject, decision, effective, reachable, appealPath = 'auditPreviewAppealPathSupported'] of noticeCases) {
    test(`notification: ${locale}/${key} preserves scenario, recipient, reason and conditions`, () => {
      const t = translator(locale);
      const row = Object.freeze({ id: 42, ticketId: 'TICKET-42', email: 'recipient@example.test', reasonCode: 'SMTP_RATE', reportCategory: 'security-class' });
      const verdictMeta = Object.freeze({ key, capabilityDesc: 'Capability description from the selected verdict' });
      const params = { email: row.email, caseId: 'CASE-42', reason: 'security-class [SMTP_RATE]' };
      assert.deepEqual(buildScenarioNotificationPreview({ row, scenario, verdictMeta, caseNumber: params.caseId, t }), {
        statusBadge: t('auditPreviewStatusNotConnected'),
        sender: 'Epocanvas Mail Security <system-security@epocanvas.com>',
        recipient: row.email,
        reachabilityNote: t(reachable),
        subject: t(subject, params),
        reasonCode: row.reasonCode,
        decisionSummary: t(decision, params),
        effectiveCondition: t(effective),
        affectedCapabilities: verdictMeta.capabilityDesc,
        appealPath: t(appealPath)
      });
    });
  }
}
test('notification: incomplete inputs and identifier/category defaults preserve behavior', () => {
  const t = translator('fr');
  assert.equal(buildScenarioNotificationPreview({ row: null, verdictMeta: {}, t }), null);
  assert.equal(buildScenarioNotificationPreview({ row: {}, verdictMeta: null, t }), null);
  for (const [row, caseId] of [[{ ticketId: 'TICKET', id: 12 }, 'TICKET'], [{ id: 12 }, 12], [{}, '-']]) {
    const preview = buildScenarioNotificationPreview({ row, scenario: first, verdictMeta: { key: 'ban_account' }, t });
    assert.equal(preview.subject, t('auditNoticeSubjectFirstBan', { caseId }));
    assert.equal(preview.recipient, '-');
    assert.equal(preview.reasonCode, 'POLICY_VIOLATION');
    assert.equal(preview.affectedCapabilities, '');
    assert.equal(preview.decisionSummary, t('auditNoticeDecisionFirstBan', {
      email: '-', reason: `${t('auditCategorySecurity')} [POLICY_VIOLATION]`
    }));
  }
});

// These source modules import JSON without Node's ESM import attributes. Adapt
// only import/export syntax with the existing parser; execute unmodified bodies
// and real dependencies. Overrides are confined to otherwise defensive branches.
function loadUtility(path, exports, overrides = {}) {
  const url = sourceUrl(path);
  const code = readFileSync(url, 'utf8');
  const nodes = babelParse(code, { sourceType: 'module' }).program.body;
  const require = createRequire(url);
  const bindings = {};
  const bodies = [];
  for (const node of nodes) {
    if (node.type === 'ImportDeclaration') {
      const module = require(node.source.value);
      for (const spec of node.specifiers) {
        const value = spec.type === 'ImportDefaultSpecifier' ? (module.default ?? module) : module[spec.imported.name];
        bindings[spec.local.name] = Object.hasOwn(overrides, spec.local.name) ? overrides[spec.local.name] : value;
      }
    } else {
      const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
      bodies.push(code.slice(declaration.start, declaration.end));
    }
  }
  return new Function(...Object.keys(bindings), `${bodies.join('\n')}\nreturn { ${exports.join(', ')} };`)(...Object.values(bindings));
}
const phone = loadUtility('utils/phone-validator.js', ['validatePhoneNumber', 'COUNTRY_OPTIONS', 'getCountryDisplayName', 'formatPhoneInput', 'getMaxPhoneDigits']);
const { ISO_COUNTRIES } = loadUtility('utils/geo-data.js', ['ISO_COUNTRIES']);
const profile = parse(readFileSync(sourceUrl('views/profile-info/index.vue'), 'utf8'), {
  filename: fileURLToPath(sourceUrl('views/profile-info/index.vue'))
});
assert.deepEqual(profile.errors, []);
const profileScript = profile.descriptor.scriptSetup.content;
const profileAst = babelParse(profileScript, { sourceType: 'module' });
function profileFunction(name, bindings) {
  const node = profileAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(node, `Production profile function ${name} must exist`);
  return new Function(...Object.keys(bindings), `${profileScript.slice(node.start, node.end)}\nreturn ${name};`)(...Object.values(bindings));
}

const validPhones = [
  ['US', '+1 (213) 373-4253', '2133734253', '(213)-373-4253', 'FIXED_LINE_OR_MOBILE'],
  ['CN', '138-0013-8000', '13800138000', '138-0013-8000', 'MOBILE'],
  ['HK', '9123-4567', '91234567', '9123-4567', 'MOBILE'],
  ['TW', '(0912)-345-678', '0912345678', '(0912)-345-678', 'MOBILE'],
  ['FR', '06-12-34-56-78', '0612345678', '06-12-34-56-78', 'MOBILE'],
  ['GB', '07911-123456', '07911123456', '(07911)-123456', 'MOBILE'],
  ['NL', '0612345678', '0612345678', '06-12345678', 'MOBILE']
];
for (const [country, input, cleanNum, formatted, type] of validPhones) {
  test(`phone compatibility: valid ${country} preserves legacy fields and formatting`, () => {
    assert.deepEqual(phone.validatePhoneNumber(country, input), {
      valid: true, errorCode: null, params: {}, msgZh: '', msgEn: '', type, cleanNum, formatted
    });
  });
}
const invalidPhones = [
  ['US', '', 'REQUIRED', {}, '', '请输入电话号码', 'Please enter a phone number'],
  ['US', 'abc', 'NO_DIGITS', {}, '', '号码中必须包含有效数字', 'Number must contain valid digits'],
  ['US', '12', 'TOO_SHORT', { digits: 2, countryCode: 'US' }, '12', '电话号码长度不足（当前为 2 位）', 'Phone number is too short (2 digits)'],
  ['US', '12345678901234567890', 'TOO_LONG', { digits: 20, countryCode: 'US' }, '12345678901234567890', '电话号码长度超出限制（当前为 20 位）', 'Phone number is too long (20 digits)'],
  ['AD', '1234567', 'INVALID_LENGTH', { digits: 7, countryCode: 'AD' }, '1234567', '电话号码长度不符合该国家/地区规范（当前为 7 位）', 'Invalid phone number length (7 digits)'],
  ['ZZ', '12345', 'INVALID_COUNTRY', { digits: 5, countryCode: 'AF' }, '12345', '国家/地区代码无效', 'Invalid country code'],
  ['US', '0000000000', 'INVALID_NUMBER', {}, '0000000000', '无效的电话号码或号段未分配', 'Invalid phone number or unassigned area/prefix']
];
for (const [country, input, errorCode, params, cleanNum, msgZh, msgEn] of invalidPhones) {
  test(`phone compatibility: ${errorCode} preserves legacy messages and normalized number`, () => {
    assert.deepEqual(phone.validatePhoneNumber(country, input), {
      valid: false, errorCode, params, cleanNum, msgZh, msgEn, formatted: ''
    });
  });
}
for (const [errorCode, overrides, suffix, english] of [
  ['COUNTRY_LENGTH', { validatePhoneNumberLength: () => 'UNRECOGNIZED_LENGTH_ERROR' }, '长度不正确', 'length'],
  ['INVALID_FORMAT', { validatePhoneNumberLength: () => undefined, parsePhoneNumber: () => { throw new Error('test parser failure'); } }, '格式不正确', 'format']
]) {
  test(`phone compatibility: defensive ${errorCode} exposes stable code and parameters`, () => {
    const validator = loadUtility('utils/phone-validator.js', ['validatePhoneNumber'], overrides);
    const country = phone.COUNTRY_OPTIONS.find(item => item.code === 'US');
    assert.deepEqual(validator.validatePhoneNumber('US', '2133734253'), {
      valid: false, errorCode,
      params: errorCode === 'COUNTRY_LENGTH' ? { digits: 10, countryCode: 'US' } : { countryCode: 'US' },
      msgZh: `${country.nameZh}电话号码${suffix}`,
      msgEn: `Invalid ${country.nameEn} phone number ${english}`,
      cleanNum: '2133734253', formatted: ''
    });
  });
}

const errorKeys = {
  REQUIRED: 'phoneValidationRequired', NO_DIGITS: 'phoneValidationNoDigits',
  TOO_SHORT: 'phoneValidationTooShort', TOO_LONG: 'phoneValidationTooLong',
  INVALID_LENGTH: 'phoneValidationInvalidLength', INVALID_COUNTRY: 'phoneValidationInvalidCountry',
  COUNTRY_LENGTH: 'phoneValidationCountryLength', INVALID_FORMAT: 'phoneValidationInvalidFormat',
  INVALID_NUMBER: 'phoneValidationInvalidNumber'
};
for (const locale of locales) {
  test(`phone UI: ${locale} maps all nine codes and both validation entry points`, async () => {
    const t = translator(locale);
    const getMessage = profileFunction('getPhoneValidationMessage', {
      t, ISO_COUNTRIES, langSelect: { value: locale }, getCountryDisplayName: phone.getCountryDisplayName
    });
    const country = ISO_COUNTRIES.find(item => item.code === 'US');
    const countryField = { zh: 'nameZh', 'zh-Hant': 'nameZhHant', en: 'nameEn', es: 'nameEs', fr: 'nameFr', nl: 'nameNl' }[locale];
    for (const [errorCode, key] of Object.entries(errorKeys)) {
      const result = Object.freeze({ errorCode, params: Object.freeze({ countryCode: 'US', digits: 17 }) });
      assert.equal(getMessage(result), t(key, { countryCode: 'US', digits: 17, country: country[countryField] }), `${locale}/${errorCode}`);
      assert.deepEqual(result.params, { countryCode: 'US', digits: 17 }, 'Localization must not mutate validation results');
    }
    assert.equal(getMessage({ errorCode: 'FUTURE_CODE', params: {} }), t('phoneValidationInvalidNumber'));
    assert.equal(getMessage({ errorCode: 'INVALID_FORMAT', params: { countryCode: 'ZZ' } }), t('phoneValidationInvalidFormat', { country: 'ZZ' }));
    // Also feed real validator results through the actual production UI mapper.
    for (const [countryCode, input, errorCode, params, , msgZh, msgEn] of invalidPhones) {
      const result = phone.validatePhoneNumber(countryCode, input);
      const meta = ISO_COUNTRIES.find(item => item.code === params.countryCode);
      const expected = t(errorKeys[errorCode], { ...params, country: meta?.[countryField] });
      assert.equal(getMessage(result), expected);
      if (locale === 'zh') assert.equal(expected, msgZh);
      if (locale === 'en') assert.equal(expected, msgEn);
      if (!locale.startsWith('zh')) assert.doesNotMatch(expected, /\p{Script=Han}/u);
    }
    const errors = [];
    const bindings = {
      newPhoneCountry: { value: 'US' }, newPhoneNumber: { value: '' }, lastPhoneValue: '',
      phoneValidationError: { value: '' }, phoneValidationSuccess: { value: true },
      validatePhoneNumber: phone.validatePhoneNumber, formatPhoneInput: phone.formatPhoneInput,
      getMaxPhoneDigits: phone.getMaxPhoneDigits, getPhoneValidationMessage: getMessage,
      ElMessage: { error: message => errors.push(message) }
    };
    profileFunction('onPhoneInput', bindings)('12');
    assert.equal(bindings.newPhoneNumber.value, '(12)');
    assert.equal(bindings.phoneValidationSuccess.value, false);
    assert.equal(bindings.phoneValidationError.value, t('phoneValidationTooShort', { digits: 2 }));
    await profileFunction('saveNewPhone', bindings)();
    assert.deepEqual(errors, [t('phoneValidationTooShort', { digits: 2 })]);
  });
}
