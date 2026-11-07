import assert from 'node:assert/strict';
import test from 'node:test';

// Read-only, dependency-free Node tests. Key symmetry, duplicate keys, source
// references and hardcoded UI text remain the responsibility of existing gates.
const locales = ['zh', 'zh-Hant', 'en', 'fr', 'es', 'nl'];
const translatedLocales = ['fr', 'es', 'nl'];
function flatten(dictionary, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(dictionary)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}
const dictionaries = Object.fromEntries(await Promise.all(locales.map(async locale => [
  locale,
  flatten((await import(new URL(`../mail-vue/src/i18n/${locale}.js`, import.meta.url))).default)
])));
const english = dictionaries.en;

// An exact key + value + reason list, not a permitted count of English strings.
// Shared brands and protocol/console identifiers stay copyable and recognizable.
const technical = [
  ['Turnstile', ['turnstileSetting'], 'Cloudflare product name'],
  ['https://example.com', ['homepageUrlPlaceholder'], 'Copyable example URL'],
  ['https://example.com/logo.png', ['appLogoPlaceholder'], 'Copyable example URL'],
  ['Client ID', ['clientId'], 'OAuth client identifier field name'],
  ['Client Secret', ['clientSecret'], 'OAuth client credential field name'],
  ['Backblaze B2', ['b2Preset'], 'Storage provider product name'],
  ['AWS S3', ['awsPreset'], 'Storage provider product name'],
  ['Cloudflare R2', ['r2Preset'], 'Storage provider product name'],
  ['Turso / LibSQL', ['tursoPreset'], 'Database products'],
  ['Cloudflare D1 REST API', ['d1HttpPreset'], 'Database product and protocol'],
  ['Touch ID (Mac)', ['keyNameMacTouchId'], 'Apple authentication product name'],
  ['Face ID / Touch ID (iOS)', ['keyNameAppleIos'], 'Apple authentication product names'],
  ['{msg}', ['totalUserAccount'], 'Parameter-only display'],
  ['{year}-{month}-{day}', ['dateYmdDisplay'], 'Numeric date format'],
  ['{pending}/{banned}', ['abuseKpiStatFormat'], 'Numeric ratio format'],
  ['{region} · {count}x', ['auditRegionCounterFormat'], 'Region parameter and occurrence counter']
];
const sharedVocabulary = [
  ['Avatar', ['avatar'], 'Established avatar label in all three languages'],
  ['Admin', ['admin'], 'Established administrator abbreviation in all three languages'],
  ['Spam', ['spam', 'moveToSpam'], 'Established unwanted-mail term in all three languages']
];
const nativeVocabulary = {
  fr: [
    ['Source', ['contentProcessingUi.rawSourceLabel'], 'French noun'],
    ['Email', ['emailAccount', 'tabEmailAddress', 'selectEmail', 'emailSetting', 'profileEmail'], 'Established French email label'],
    ['Expiration', ['tokenExpires'], 'French noun'],
    ['Total', ['total', 'statTotal', 'totalAmount'], 'French noun/adjective'],
    ['Total {count}', ['totalSentCount'], 'French total with parameter'],
    ['Normal', ['normal', 'auditRiskLevelNormal', 'auditRiskMetricNormal'], 'French adjective'],
    ['Action', ['action', 'filterAction', 'abuseColOpt'], 'French noun'],
    ['Description', ['description'], 'French noun'],
    ['Date', ['date'], 'French noun'],
    ['Version', ['version'], 'French noun'],
    ['Message', ['message'], 'French noun'],
    ['Position', ['position'], 'French noun'],
    ['Important', ['important', 'importantNotice'], 'French adjective'],
    ['Promotions', ['labelPromotions'], 'French marketing-category noun'],
    ['Type', ['ruleType'], 'French noun'],
    ['Note', ['note', 'auditBtnNote'], 'French noun'],
    ['Mobile', ['phoneLabelMobile'], 'French telephone adjective'],
    ['Interaction', ['scopeBadgeAction'], 'French noun'],
    ['Section {index}', ['sectionIndex'], 'French section label with parameter'],
    ['Configurable', ['oauthConfigStatusActive'], 'French adjective'],
    ['Client', ['auditFieldClient'], 'French computing noun'],
    ['Suggestion', ['auditColSuggestion', 'abuseColAction'], 'French noun'],
    ['LV0 · Normal', ['auditLevelLv0'], 'Level identifier and French adjective'],
    ['Verdict', ['auditChipDecision', 'auditV2ChipDecision'], 'French noun'],
    ['Europe', ['auditRegionEurope'], 'French continent name']
  ],
  es: [
    ['General', ['general'], 'Spanish adjective'],
    ['Total', ['total', 'statTotal', 'totalAmount'], 'Spanish noun/adjective'],
    ['Normal', ['normal', 'auditRiskLevelNormal', 'auditRiskMetricNormal'], 'Spanish adjective'],
    ['Personal', ['labelPersonal', 'profileEmailLabelPersonal'], 'Spanish adjective'],
    ['Color', ['color', 'colorLabel'], 'Spanish noun'],
    ['Total {count}', ['totalSentCount'], 'Spanish total with parameter'],
    ['Universal', ['common'], 'Spanish adjective'],
    ['Client ID:', ['clientIdLabel'], 'OAuth field identifier with punctuation'],
    ['Configurable', ['oauthConfigStatusActive'], 'Spanish adjective'],
    ['LV0 · Normal', ['auditLevelLv0'], 'Level identifier and Spanish adjective']
  ],
  nl: [
    ['Status', ['tabStatus', 'abuseColStatus'], 'Dutch noun'],
    ['Code: ', ['codeLabel'], 'Dutch noun with punctuation'],
    ['Website', ['websiteSetting'], 'Established Dutch noun'],
    ['Details', ['details', 'thirdPartyViewDetailsBtn'], 'Dutch plural noun'],
    ['Labels', ['labels', 'labelAs'], 'Established Dutch category noun'],
    ['Type', ['ruleType'], 'Dutch noun'],
    ['Gender', ['gender'], 'Established Dutch noun'],
    ['Compact', ['densityCompact'], 'Dutch adjective'],
    ['Bucket', ['storageBucket'], 'Established object-storage term'],
    ['Endpoint', ['storageEndpoint', 'aiEndpoint'], 'Established API term'],
    ['Provider', ['byoStorageProvider'], 'Established Dutch computing noun'],
    ['Moderator', ['roleModerator'], 'Established Dutch role noun'],
    ['Database', ['diagDbLabel'], 'Established Dutch computing noun'],
    ['Protocol', ['abuseCatProtocol'], 'Dutch noun'],
    ['{count} accounts', ['abuseClusterAccountCount'], 'Established Dutch account noun with parameter'],
    ['Cluster', ['auditChipCluster'], 'Established Dutch grouping noun'],
    ['Cohort', ['auditGaugeLegendCohort'], 'Dutch statistical noun']
  ]
};
const reviewedIdenticalText = Object.fromEntries(translatedLocales.map(locale => {
  const records = new Map();
  for (const [value, keys, reason] of [...technical, ...sharedVocabulary, ...nativeVocabulary[locale]]) {
    for (const key of keys) {
      assert.ok(!records.has(key), `Duplicate exception ${locale}/${key}`);
      records.set(key, { value, reason });
    }
  }
  return [locale, records];
}));

// Strip syntax before scanning prose, so parameter names such as {failed}, HTML
// attributes and URL paths cannot masquerade as untranslated visible English.
function visibleProse(text) {
  return text
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    // Dutch uses this established technical expression in otherwise Dutch prose.
    .replace(/\bend-to-end(?:cryptografie|versleuteling)?\b/gi, ' ');
}
const englishProse = /\b(?:sign\s+(?:up|in)|please|your|successfully|failed|settings|cannot|unable|currently|should|must|whether|otherwise|already|remaining|received|forwarding|unlimited|default|custom|enabled|disabled|synced|registration|password|credentials|current|and|with|the|this|you|will|would|don't|doesn't)\b/i;
const mixedFragments = /\b(?:sync\s+(?:current|all)|system\s+(?:paramètres|ajustes|instellingen)|new\s+(?:mot de passe|contraseña|wachtwoord)|(?:connexion|iniciar sesión|inloggen)\s+(?:succès|éxito|succes)\s+message|(?:enregistré|guardado|opgeslagen)\s+(?:réussi\(e\)|con éxito|geslaagd))\b/i;
function qualityProblems(locale, key, text) {
  const problems = [];
  if (text === english[key] && reviewedIdenticalText[locale].get(key)?.value !== text) {
    problems.push('unreviewed English-identical text');
  }
  const prose = visibleProse(text);
  if (englishProse.test(prose)) problems.push('English prose');
  if (mixedFragments.test(prose)) problems.push('mixed-language fragment');
  return problems;
}
const parameters = text => [...text.matchAll(/\{[^{}]*\}/g)].map(match => match[0]).sort();
const htmlTags = text => text.match(/<\/?[A-Za-z][^>]*>/g) || [];
const urls = text => text.match(/https?:\/\/[^\s<>"'）)]+/g) || [];

for (const locale of locales) {
  test(`${locale}: every leaf stays nonempty and preserves all named and literal interpolations`, () => {
    for (const [key, value] of Object.entries(dictionaries[locale])) {
      assert.equal(typeof value, 'string', `${locale}/${key}`);
      assert.ok(value.trim(), `${locale}/${key}: empty message`);
      assert.deepEqual(parameters(value), parameters(english[key]), `${locale}/${key}: interpolation multiset`);
    }
  });
}

for (const locale of translatedLocales) {
  test(`${locale}: English-identical text has an exact reviewed linguistic or technical reason`, () => {
    for (const [key, { value, reason }] of reviewedIdenticalText[locale]) {
      assert.ok(reason.trim(), `${locale}/${key}: missing reason`);
      assert.equal(english[key], value, `${locale}/${key}: stale English exception`);
      assert.equal(dictionaries[locale][key], value, `${locale}/${key}: stale locale exception`);
    }
    for (const [key, value] of Object.entries(dictionaries[locale])) {
      if (value === english[key]) {
        assert.equal(reviewedIdenticalText[locale].get(key)?.value, value, `${locale}/${key}: untranslated English`);
      }
    }
  });

  test(`${locale}: all user-facing messages reject obvious English prose and mixed fragments`, () => {
    const failures = Object.entries(dictionaries[locale]).flatMap(([key, value]) =>
      qualityProblems(locale, key, value).map(problem => `${locale}/${key}: ${problem}: ${value}`)
    );
    assert.deepEqual(failures, []);
  });

  test(`${locale}: all message HTML and copyable URLs preserve their English structure`, () => {
    for (const [key, value] of Object.entries(dictionaries[locale])) {
      assert.deepEqual(htmlTags(value), htmlTags(english[key]), `${locale}/${key}: HTML tags or attributes`);
      assert.deepEqual(urls(value), urls(english[key]), `${locale}/${key}: copyable URL`);
    }
  });

  test(`${locale}: scopes, S3 paths, database bindings and address examples remain usable`, () => {
    const literals = {
      scopeRead: ['emails:read'],
      scopeSend: ['emails:send'],
      scopeProfile: ['profile:read'],
      forcePathStyleDesc: ['/bucket/key', 'bucket.s3.endpoint'],
      bucketPlaceholder: ['epomail-attachments'],
      forwardingSubjectPrefix: ['[fwd]'],
      forwardingTypeAliasDesc: ['billing', 'dev-*'],
      forwardingAliasPrefixPlaceholder: ['billing', 'dev', 'notice'],
      dbSingleDescTooltip: ['USER_DB', 'MAIL_DB', 'wrangler.toml'],
      dbModeDualDesc: ['USER_DB', 'MAIL_DB'],
      d1GuidanceContent: ['USER_DB', 'MAIL_DB', 'wrangler.toml'],
      ruleBriefList: ["spam{'@'}a.com", 'a.com', "*{'@'}*.a.com"],
      auditRuleAuthBruteForce: ['RULE_AUTH_BRUTE_FORCE'],
      auditSubmitDisabledNoPerm: ['audit:adjudicate']
    };
    for (const [key, tokens] of Object.entries(literals)) {
      for (const token of tokens) {
        assert.ok(dictionaries[locale][key].includes(token), `${locale}/${key}: missing literal ${token}`);
      }
    }
  });
}

test('destructive confirmation prompts use exactly the required localized input', () => {
  for (const locale of locales) {
    const dictionary = dictionaries[locale];
    const required = dictionary.delInputPattern;
    assert.equal(/<b\b[^>]*>([^<]+)<\/b>/.exec(dictionary.clearAllDelConfirm)?.[1], required, locale);
    assert.ok(dictionary.inputErrorMessage.includes(required), `${locale}: wrong confirmation word`);
  }
});

test('quality checks reject original mixed translations across the full feature range', () => {
  const regressions = {
    fr: [
      ['loginTitle', 'Sign in to your compte to access email'],
      ['syncToOtherLangTooltip', 'Sync current paramètres to the other langue.'],
      ['userDataControlTooltip', 'Manage utilisateur access to features in the Data partition.'],
      ['forwardingSavedSuccess', 'email forwarding règles enregistré réussi(e)'],
      ['networkErrorMsg', 'Network erreur. Check your internet'],
      ['totpBackupRemaining', 'sauvegarde codes remaining: {count}'],
      ['storageTestSuccess', 'Connection réussi(e)'],
      ['auditAssigneeSystem', 'System Bot (Automatisé)']
    ],
    es: [
      ['regTitle', 'Sign up for an cuenta to use correo'],
      ['newPassword', 'New contraseña'],
      ['dataExportDesc', 'exportar and descargar your personal profile'],
      ['forwardingSavedSuccess', 'correo forwarding reglas guardado con éxito'],
      ['oauthAuthorizeTitle', 'Authorization Request'],
      ['storageTestSuccess', 'Connection con éxito'],
      ['auditLevel0Title', 'Level 0 · Sospecha de Bot'],
      ['auditAssigneeSystem', 'System Bot (Automatizado)']
    ],
    nl: [
      ['loginTitle', 'Sign in to your account to access e-mail'],
      ['SystemSettings', 'System instellingen'],
      ['newPassword', 'New wachtwoord'],
      ['userDataControlTooltip', 'Manage gebruiker access to features in the Data partition.'],
      ['totpEnabledDesc', 'Your account is protected with TOTP tweefactor authentication.'],
      ['thirdPartyAppsDesc', 'Manage third-party apps connected to your account.'],
      ['storageTestSuccess', 'Connection geslaagd'],
      ['auditAssigneeSystem', 'System Bot (Geautomatiseerd)']
    ]
  };
  // Exact original snippets without a unique English function word are still
  // regressions: do not allow the English technical look of a short label to
  // exempt storage, authorization or audit user-facing copy.
  const untranslatedLabels = /\b(?:Connection|Authorization Request|System Bot|Level\s+\d)\b/;
  for (const [locale, samples] of Object.entries(regressions)) {
    for (const [key, text] of samples) {
      assert.notEqual(dictionaries[locale][key], text, `${locale}/${key}: original regression returned`);
      assert.ok(qualityProblems(locale, key, text).length || untranslatedLabels.test(text), `${locale}/${key}: regression detector ineffective`);
    }
  }
  for (const locale of translatedLocales) {
    assert.ok(qualityProblems(locale, 'staticUiTip', english.staticUiTip).length, `${locale}: English fallback accepted`);
    assert.deepEqual(qualityProblems(locale, 'clientId', 'Client ID'), []);
    assert.ok(qualityProblems(locale, 'loginTitle', 'Client ID').length === 0, 'Literal labels do not imply a broad sentence exemption');
  }
});
