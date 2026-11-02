import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocsPageUrl,
  formatUiDate,
  formatUiNumber,
  normalizeUiLocale,
  resolvePolicyUrl,
  resolveUiLocale
} from '../../mail-vue/src/utils/ui-locale.js';
import { normalizeAuthLang, resolveAuthLang } from '../src/app/i18n/authLocale.ts';

const storage = (value) => ({ getItem: () => value });

test('UI locale normalizer accepts six-language aliases and safe fallbacks', () => {
  assert.equal(normalizeUiLocale('zh-TW'), 'zh-Hant');
  assert.equal(normalizeUiLocale('zh-HK'), 'zh-Hant');
  assert.equal(normalizeUiLocale('zh-MO'), 'zh-Hant');
  assert.equal(normalizeUiLocale('zh-Hant'), 'zh-Hant');
  assert.equal(normalizeUiLocale('zh-Hans-CN'), 'zh');
  assert.equal(normalizeUiLocale('zh-Hans-TW'), 'zh');
  assert.equal(normalizeUiLocale('zh-Hant-CN'), 'zh-Hant');
  assert.equal(resolveUiLocale('fr-???', 'en'), 'en');
  assert.equal(normalizeUiLocale('zh-SG'), 'zh');
  assert.equal(normalizeUiLocale('fr-CA'), 'fr');
  assert.equal(normalizeUiLocale('nl-NL'), 'nl');
  assert.equal(normalizeUiLocale('de-DE'), 'zh');
  assert.equal(resolveUiLocale('', 'fr-CA'), 'fr');
  assert.equal(resolveUiLocale('unknown', 'de-DE'), 'en');
});

test('auth locale normalizer resolves persisted aliases before browser locale', () => {
  assert.equal(normalizeAuthLang('zh-HK'), 'zh-Hant');
  assert.equal(normalizeAuthLang('zh-CN'), 'zh');
  assert.equal(normalizeAuthLang('zh-Hans-TW'), 'zh');
  assert.equal(normalizeAuthLang('zh-Hant-CN'), 'zh-Hant');
  assert.equal(resolveAuthLang({ storage: storage('{"lang":"fr-???"}'), navigatorLanguage: 'en' }), 'en');
  assert.equal(normalizeAuthLang('fr-CA'), 'fr');
  assert.equal(normalizeAuthLang('unknown', 'nl'), 'nl');
  assert.equal(resolveAuthLang({ storage: storage('{"lang":"zh-MO"}'), navigatorLanguage: 'en-US' }), 'zh-Hant');
  assert.equal(resolveAuthLang({ storage: storage('{"lang":"invalid"}'), navigatorLanguage: 'fr-CA' }), 'fr');
  assert.equal(resolveAuthLang({ storage: storage('not-json'), navigatorLanguage: 'de-DE' }), 'en');
});

test('docs URLs use registered segments and preserve complete custom policy URLs', () => {
  assert.equal(buildDocsPageUrl('mail/api/', 'zh-CN'), 'https://docs.epocanvas.com/epomail/mail/api/');
  assert.equal(buildDocsPageUrl('mail/api/', 'zh-TW'), 'https://docs.epocanvas.com/epomail/zh-tw/mail/api/');
  assert.equal(buildDocsPageUrl('mail/api/', 'de-DE'), 'https://docs.epocanvas.com/epomail/mail/api/');
  const custom = 'https://legal.example.test/privacy?revision=v2#current';
  assert.equal(resolvePolicyUrl(custom, 'mail/privacy-policy/', 'fr'), custom);
  assert.equal(resolvePolicyUrl('javascript:alert(1)', 'mail/privacy-policy/', 'fr'), 'https://docs.epocanvas.com/epomail/fr/mail/privacy-policy/');
});

test('date and number helpers are explicit-locale and UTC-safe', () => {
  const options = { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' };
  const utcDate = formatUiDate('2026-01-02 03:04:05', 'en', options);
  const offsetDate = formatUiDate('2026-01-02T03:04:05+08:00', 'en', options);
  assert.match(utcDate, /01\/02\/2026/);
  assert.match(offsetDate, /01\/01\/2026/);
  assert.equal(formatUiDate('', 'fr'), '-');
  assert.equal(formatUiDate('not-a-date', 'fr'), '-');
  assert.notEqual(formatUiNumber(1234.5, 'fr'), formatUiNumber(1234.5, 'en'));
  assert.equal(formatUiNumber('not-a-number', 'en'), '-');
});
