import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { parseHTML } from 'linkedom';
import { EVENT_DEFINITIONS, SECURITY_EVENT_TYPES, renderSecurityNoticeEmail } from '../src/const/security-notice-templates.js';
import decisionNoticeService from '../src/service/decision-notice-service.js';
import securityNoticeService from '../src/service/security-notice-service.js';
import user from '../src/entity/user.js';
import account from '../src/entity/account.js';
import email from '../src/entity/email.js';
import { star } from '../src/entity/star.js';

const languages = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const eventsByLevel = [
  ['NEW_DEVICE_LOGIN', 'NEW_LOCATION_LOGIN', 'NEW_NETWORK_LOGIN'],
  ['PAT_CREATED', 'FORWARDING_MODIFIED', 'TELEGRAM_MODIFIED', 'OAUTH_AUTHORIZED'],
  ['PASSWORD_CHANGED', 'TOTP_ENABLED', 'PASSKEY_ADDED', 'BACKUP_CODES_REGENERATED', 'OAUTH_IDENTITY_BOUND', 'OAUTH_IDENTITY_UNBOUND'],
  ['ACCOUNT_LOCKED', 'TOTP_DISABLED', 'PASSKEY_DELETED', 'STORAGE_PURGED', 'ACCOUNT_DELETED']
];
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const mobile = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function context({ ua = desktop, city = 'Tokyo', org = 'Example ASN', headers = {} } = {}) {
  const fields = new Headers({ 'user-agent': ua, ...headers });
  return {
    env: { ...env, USER_DB: env.NOTICE_USER_DB, MAIL_DB: env.NOTICE_MAIL_DB },
    req: { header: name => fields.get(name), raw: { cf: { country: 'JP', city, asn: 64496, asOrganization: org } } }
  };
}

it('provides complete localized content and the expected severity for every security event', () => {
  expect(Object.keys(SECURITY_EVENT_TYPES).sort()).toEqual(eventsByLevel.flat().sort());
  for (const [index, codes] of eventsByLevel.entries()) {
    for (const code of codes) {
      expect(EVENT_DEFINITIONS[code].level).toBe(index + 1);
      for (const lang of languages) {
        const copy = EVENT_DEFINITIONS[code].templates[lang];
        for (const field of ['subject', 'headline', 'summary', 'detailDesc', 'badge']) expect(copy[field].trim()).toBeTruthy();
        const mail = renderSecurityNoticeEmail(code, lang, { ip: '192.0.2.1', device: 'Example Device' });
        expect(mail.subject).toBe(copy.subject);
        expect(mail.html).toMatch(/<svg\b/);
        expect(mail.isStarred).toBe(index >= 2);
        for (const value of ['192.0.2.1', 'Example Device', 'announcement@epocanvas.com']) {
          expect(mail.html).toContain(value);
          expect(mail.text).toContain(value);
        }
      }
    }
  }
});

it('uses the edge IP and records parsed device, location, and network context', () => {
  const parsed = securityNoticeService.parseClientContext(context({ headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.2' } }));
  expect(parsed).toMatchObject({ clientIp: '192.0.2.1', clientLocation: 'JP · Tokyo', clientNetwork: 'Example ASN', asn: '64496' });
  expect(parsed.browser).toMatch(/Chrome/);
  expect(parsed.os).toMatch(/macOS/i);
  const withoutEdge = context({ ua: mobile, headers: { 'x-forwarded-for': '192.0.2.2' } });
  withoutEdge.req.raw.cf = {};
  const other = securityNoticeService.parseClientContext(withoutEdge);
  expect(other.clientLocation).toBe('Unknown');
  expect(other.clientIp).toBe('Unknown');
  expect(other.os).toMatch(/iOS/);
  expect(other.browser).toMatch(/Safari/);
});

it('initializes known environments in KV and debounces each change category independently', async () => {
  const id = 941, key = 'USER_KNOWN_ENV_' + id;
  const send = vi.spyOn(securityNoticeService, 'sendNotice').mockResolvedValue({ success: true });
  const record = options => securityNoticeService.checkAndTriggerLoginEnvironmentNotice(context(options), id, 'reader@example.test');
  try {
    expect(await record()).toBeNull();
    expect(await record()).toBeNull();
    expect(await record({ city: 'Kyoto' })).toMatchObject({ eventCode: 'NEW_LOCATION_LOGIN' });
    expect(await record({ city: 'Osaka' })).toBeNull();
    expect(await record({ ua: mobile })).toMatchObject({ eventCode: 'NEW_DEVICE_LOGIN' });
    expect(await record({ org: 'Second Example ASN' })).toMatchObject({ eventCode: 'NEW_NETWORK_LOGIN' });
    const stored = await env.kv.get(key, { type: 'json' });
    expect(stored.devices).toHaveLength(2);
    expect(stored.locations).toHaveLength(3);
    expect(stored.networks).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(3);
  } finally {
    send.mockRestore();
    await env.kv.delete(key);
  }
});

it('persists notices to the primary live inbox and stars only high-severity notifications in split D1', async () => {
  const c = context(), userDb = c.env.USER_DB, mailDb = c.env.MAIL_DB;
  for (const [db, name, table] of [[userDb, 'user', user], [mailDb, 'account', account], [mailDb, 'email', email], [mailDb, 'star', star]]) {
    const columns = Object.values(getTableColumns(table)).map(col => col.name + ' ' + col.getSQLType() + (col.primary ? ' PRIMARY KEY' : ''));
    await db.prepare('CREATE TABLE ' + name + ' (' + columns.join(', ') + ')').run();
  }
  const userId = 942, address = 'notice@example.test';
  await userDb.prepare('INSERT INTO user(user_id,email,is_del) VALUES(?,?,0)').bind(userId,address).run();
  await mailDb.batch([1,2,3].map(id => mailDb.prepare('INSERT INTO account(account_id,user_id,email,is_del) VALUES(?,?,?,?)').bind(id,userId,address,id === 1 ? 1 : 0)));
  const ids = [];
  for (const code of ['NEW_DEVICE_LOGIN', 'PAT_CREATED', 'TOTP_ENABLED', 'ACCOUNT_LOCKED']) {
    const saved = await securityNoticeService.sendNotice(c, userId, code);
    expect(saved).toMatchObject({ success: true, accountId: 2, userId, isOfficial: 1, sendEmail: 'announcement@epocanvas.com', toEmail: address });
    expect(JSON.parse(saved.labels)).toEqual(['官方', '安全']);
    expect(saved.subject).toBe(renderSecurityNoticeEmail(code, 'zh', {}).subject);
    ids.push(saved.emailId);
  }
  const starred = await mailDb.prepare('SELECT email_id FROM star WHERE user_id=? ORDER BY email_id').bind(userId).all();
  expect(starred.results.map(row => row.email_id)).toEqual(ids.slice(2));
  expect(await securityNoticeService.sendNotice(c, userId+1, 'ACCOUNT_LOCKED')).toBeNull();
});

describe('official notice rendering', () => {
	it.each(languages)('preserves readable actions and literal device names in %s', lang => {
		const keyName = 'Device <sample> & reader';
		const { html, text } = renderSecurityNoticeEmail('PASSKEY_ADDED', lang, { keyName });
		const { document } = parseHTML(html);
		const action = document.querySelector('a');
		expect(action.textContent.trim().length).toBeGreaterThan(1);
		expect(action.style.getPropertyValue('background-color')).toBe('#0f172a');
		expect(action.style.getPropertyValue('color')).toBe('#ffffff');
		expect(document.querySelector('table').style.getPropertyValue('table-layout')).toBe('fixed');
		expect(document.body.textContent).toContain(keyName);
		expect(text).toContain(keyName);
		expect(document.querySelector('sample')).toBeNull();
		const extras = renderSecurityNoticeEmail('OAUTH_AUTHORIZED', lang, { appName: 'Example <App>', forwardTarget: 'forward@example.test' });
		for (const value of ['Example <App>', 'forward@example.test']) {
			expect(parseHTML(extras.html).document.body.textContent).toContain(value);
			expect(extras.text).toContain(value);
		}
		const keyLabels = { zh: '通行密钥', 'zh-Hant': '通行金鑰', en: 'Passkey Name', es: 'Nombre de la clave de acceso', fr: 'Nom de la clé d’accès', nl: 'Naam van de toegangssleutel' };
		expect(text).toContain(keyLabels[lang]);
	});

	it('preserves public case fields as text in both delivery formats when styles are stripped', () => {
		const number = 'CASE-<sample>-' + 'A'.repeat(100);
		const reason = 'Review <reference> & explanation';
		const notes = '<internal-example> is a literal label';
		const { htmlContent, textContent } = decisionNoticeService.renderFinalNotice({
			actionType: 'unban', caseNumber: number, publicReason: reason, notes
		});
		const { document } = parseHTML(htmlContent);
		expect(document.querySelector('sample, reference, internal-example')).toBeNull();
		expect(document.querySelector('h2').textContent).toBeTruthy();
		for (const field of [number, reason, notes]) {
			expect(document.body.textContent).toContain(field);
			expect(textContent).toContain(field);
		}
	});
});
