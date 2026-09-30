import orm, { mailOrm } from '../entity/orm.js';
import user from '../entity/user.js';
import account from '../entity/account.js';
import email from '../entity/email.js';
import { star } from '../entity/star.js';
import { eq, and } from 'drizzle-orm';
import reqUtils from '../utils/req-utils.js';
import emailUtils from '../utils/email-utils.js';
import { emailConst, isDel } from '../const/entity-const.js';
import emailCryptoUtils from '../utils/email-crypto-utils.js';
import KvConst from '../const/kv-const.js';
import {
  SECURITY_EVENT_TYPES,
  renderSecurityNoticeEmail
} from '../const/security-notice-templates.js';

const KNOWN_ENV_PREFIX = 'USER_KNOWN_ENV_';
const KNOWN_ENV_TTL = 180 * 24 * 3600; // 180 days

const securityNoticeService = {
  /**
   * Parse client context (IP, UA, Geo, ASN) from incoming request
   */
  parseClientContext(c) {
    if (!c) {
      return {
        ip: 'Unknown',
        browser: 'Web Browser',
        device: 'Desktop',
        os: 'Unknown OS',
        country: '',
        city: '',
        region: '',
        asn: '',
        asnOrg: '',
        location: 'Unknown',
        time: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      };
    }

    const ip = reqUtils.getIp(c);
    const ua = reqUtils.getUserAgent(c);

    // Extract Cloudflare Edge Geo metadata
    const country = c.req?.header?.('cf-ipcountry') || c.req?.raw?.cf?.country || '';
    const city = c.req?.header?.('cf-ipcity') || c.req?.raw?.cf?.city || '';
    const region = c.req?.header?.('cf-region') || c.req?.raw?.cf?.region || '';
    const asn = String(c.req?.header?.('cf-asn') || c.req?.raw?.cf?.asn || '');
    const asnOrg = c.req?.header?.('cf-asorganization') || c.req?.raw?.cf?.asOrganization || '';

    let location = 'Unknown';
    if (country && city && region && city !== region) {
      location = `${country} · ${city} (${region})`;
    } else if (country && city) {
      location = `${country} · ${city}`;
    } else if (country) {
      location = country;
    }

    const deviceDescription = [ua.os, ua.browser].filter(Boolean).join(' · ') || ua.device || 'Desktop';
    const networkDescription = asnOrg || (asn ? `AS${asn}` : '') || 'Direct Network';
    const time = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    return {
      ip,
      clientIp: ip,
      browser: ua.browser || 'Web Browser',
      device: deviceDescription,
      clientDevice: deviceDescription,
      rawDevice: ua.device || 'Desktop',
      os: ua.os || 'Desktop OS',
      country,
      city,
      region,
      asn,
      asnOrg,
      network: networkDescription,
      clientNetwork: networkDescription,
      location,
      clientLocation: location,
      time
    };
  },

  /**
   * Evaluates user's login environment and triggers Level 1 notifications if a new device/location/network is detected
   */
  async checkAndTriggerLoginEnvironmentNotice(c, userId, userEmail) {
    if (!c || !userId || !c.env?.kv) return;

    try {
      const clientCtx = this.parseClientContext(c);
      const kvKey = KNOWN_ENV_PREFIX + userId;
      const knownData = await c.env.kv.get(kvKey, { type: 'json' });

      const deviceFingerprint = `${clientCtx.os}|${clientCtx.browser}|${clientCtx.device}`;
      const locationFingerprint = clientCtx.country ? `${clientCtx.country}|${clientCtx.city}` : '';
      const networkFingerprint = clientCtx.asnOrg ? `${clientCtx.asn}|${clientCtx.asnOrg}` : '';

      // First time recording user's login environment: initialize profile without alarm
      if (!knownData) {
        const initialProfile = {
          devices: [deviceFingerprint],
          knownDevices: [deviceFingerprint],
          locations: locationFingerprint ? [locationFingerprint] : [],
          knownLocations: locationFingerprint ? [locationFingerprint] : [],
          networks: networkFingerprint ? [networkFingerprint] : [],
          knownNetworks: networkFingerprint ? [networkFingerprint] : [],
          lastNoticeTimestamps: {},
          initializedAt: Date.now()
        };
        await c.env.kv.put(kvKey, JSON.stringify(initialProfile), { expirationTtl: KNOWN_ENV_TTL });
        return null;
      }

      const devices = Array.isArray(knownData.devices) ? knownData.devices : (Array.isArray(knownData.knownDevices) ? knownData.knownDevices : []);
      const locations = Array.isArray(knownData.locations) ? knownData.locations : (Array.isArray(knownData.knownLocations) ? knownData.knownLocations : []);
      const networks = Array.isArray(knownData.networks) ? knownData.networks : (Array.isArray(knownData.knownNetworks) ? knownData.knownNetworks : []);
      const lastNotices = knownData.lastNoticeTimestamps || {};
      const now = Date.now();
      const DEBOUNCE_MS = 3600 * 1000; // 1-hour quiet period per event type

      let eventToTrigger = null;

      // 1. Check for New Device
      if (!devices.includes(deviceFingerprint)) {
        if (!lastNotices[SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN] || (now - lastNotices[SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN] > DEBOUNCE_MS)) {
          eventToTrigger = SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN;
          lastNotices[SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN] = now;
        }
        devices.push(deviceFingerprint);
      }
      // 2. Check for New Geographic Location (if country is known)
      else if (locationFingerprint && !locations.includes(locationFingerprint)) {
        if (!lastNotices[SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN] || (now - lastNotices[SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN] > DEBOUNCE_MS)) {
          eventToTrigger = SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN;
          lastNotices[SECURITY_EVENT_TYPES.NEW_LOCATION_LOGIN] = now;
        }
        locations.push(locationFingerprint);
      }
      // 3. Check for New Network / ASN
      else if (networkFingerprint && !networks.includes(networkFingerprint)) {
        if (!lastNotices[SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN] || (now - lastNotices[SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN] > DEBOUNCE_MS)) {
          eventToTrigger = SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN;
          lastNotices[SECURITY_EVENT_TYPES.NEW_NETWORK_LOGIN] = now;
        }
        networks.push(networkFingerprint);
      }

      // Update known environment cache in KV
      knownData.devices = devices.slice(-15); // retain last 15 devices
      knownData.knownDevices = knownData.devices;
      knownData.locations = locations.slice(-15);
      knownData.knownLocations = knownData.locations;
      knownData.networks = networks.slice(-15);
      knownData.knownNetworks = knownData.networks;
      knownData.lastNoticeTimestamps = lastNotices;
      await c.env.kv.put(kvKey, JSON.stringify(knownData), { expirationTtl: KNOWN_ENV_TTL });

      // Send the identified security notice if triggered
      if (eventToTrigger) {
        const noticeResult = await this.sendNotice(c, userId, eventToTrigger, clientCtx);
        return { eventCode: eventToTrigger, noticeResult };
      }
      return null;
    } catch (err) {
      console.error('[securityNoticeService] checkAndTriggerLoginEnvironmentNotice error:', err);
      return null;
    }
  },

  /**
   * Delivers an official security notice email directly to the user's primary inbox
   */
  async sendNotice(c, userId, eventCode, customParams = {}) {
    if (!c || !userId) return null;

    try {
      const userDb = c._mockOrm || orm(c);
      const mailDb = c._mockOrm || (c.env?.mail_db ? mailOrm(c) : orm(c));

      // 1. Fetch user record
      const userRow = await userDb.select().from(user).where(
        and(eq(user.userId, userId), eq(user.isDel, isDel.NORMAL))
      ).get();

      if (!userRow) {
        return null;
      }

      // 2. Fetch primary mailbox account for recipient ID
      let accRow = null;
      try {
        accRow = await mailDb.select().from(account).where(
          and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))
        ).orderBy(account.accountId).limit(1).get();
      } catch (e) {
        try {
          accRow = await mailDb.select().from(account).where(
            eq(account.userId, userId)
          ).limit(1).get();
        } catch (e2) {}
      }

      const accountId = accRow ? accRow.accountId : 0;
      const targetEmail = userRow.email;
      const userName = userRow.nickname || (targetEmail ? targetEmail.split('@')[0] : 'User');

      // 3. Compile client environment context parameters
      const defaultCtx = this.parseClientContext(c);
      const mergedParams = {
        ...defaultCtx,
        ...customParams,
        userName,
        userEmail: targetEmail
      };

      // 4. Resolve user language preference
      let userLang = 'zh';
      if (userRow.lang) {
        userLang = userRow.lang;
      } else {
        // Try user profile cache in KV
        try {
          const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
          if (profileStr) {
            const p = JSON.parse(profileStr);
            if (p.lang) userLang = p.lang;
          }
        } catch (_) {}
      }

      // 5. Render notice email content
      const rendered = renderSecurityNoticeEmail({
        eventCode,
        lang: userLang,
        params: mergedParams
      });

      const now = new Date().toISOString();
      let emailPayload = {
        userId: userId,
        accountId: accountId,
        sendEmail: 'announcement@epocanvas.com',
        name: 'Epocanvas Mail 官方安全中心',
        subject: rendered.subject,
        content: rendered.content,
        text: rendered.text,
        toEmail: targetEmail,
        toName: userName,
        recipient: JSON.stringify([{ address: targetEmail, name: userName }]),
        cc: '[]',
        bcc: '[]',
        inReplyTo: '',
        relation: '',
        messageId: '',
        type: emailConst.type.RECEIVE,
        status: 0,
        unread: emailConst.unread.UNREAD,
        isDel: isDel.NORMAL,
        isSpam: 0,
        snoozedTime: null,
        snoozedEndTime: null,
        labels: JSON.stringify(['官方', '安全']),
        isOfficial: 1,
        code: '',
        createTime: now
      };

      // Encrypt if user has E2E mailbox encryption active
      let allMailMode = 1;
      try {
        const cachedSetting = await c.env?.kv?.get?.(KvConst.SETTING, { type: 'json' });
        if (cachedSetting && cachedSetting.allMailMode !== undefined) {
          allMailMode = Number(cachedSetting.allMailMode);
        }
      } catch (e) {}

      if (emailCryptoUtils.shouldEncryptEmail(allMailMode, emailPayload)) {
        const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
        emailPayload = await emailCryptoUtils.encryptEmailRecord(emailPayload, cryptoKey);
      }

      // Insert into email database (Mail domain)
      const inserted = await mailDb.insert(email).values(emailPayload).returning().get();

      // Automatically star Level 3 & Level 4 critical alerts
      if (inserted && inserted.emailId && rendered.isStarred) {
        await mailDb.insert(star).values({
          userId: userId,
          emailId: inserted.emailId,
          createTime: now
        }).run().catch(() => {});
      }

      return {
        success: !!(inserted && inserted.emailId),
        emailId: inserted?.emailId,
        ...(inserted || {})
      };
    } catch (err) {
      console.error('[securityNoticeService] sendNotice error:', err);
      return null;
    }
  }
};

export default securityNoticeService;
