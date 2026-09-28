import { WELCOME_TEMPLATES } from '../const/welcome-templates.js';
import { GLOBAL_ANNOUNCEMENT_TEMPLATES } from '../const/announcement-templates.js';

export function normalizeLangCode(lang) {
  const norm = (lang || '').toLowerCase().trim();
  if (norm.startsWith('zh-hant') || norm.startsWith('zh-tw') || norm.startsWith('zh-hk')) {
    return 'zh-Hant';
  }
  if (norm.startsWith('zh')) {
    return 'zh';
  }
  if (norm.startsWith('fr')) {
    return 'fr';
  }
  if (norm.startsWith('es')) {
    return 'es';
  }
  if (norm.startsWith('nl')) {
    return 'nl';
  }
  if (norm.startsWith('en')) {
    return 'en';
  }
  return norm;
}

export function interpolatePlaceholders(str, userEmail = '', userName = '') {
  if (!str || typeof str !== 'string') return '';
  const domain = userEmail ? (userEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
  const name = userName || (userEmail ? userEmail.split('@')[0] : 'User');
  return str
    .replace(/\{\{\s*user_name\s*\}\}/gi, name)
    .replace(/\{\{\s*username\s*\}\}/gi, name)
    .replace(/\{\{\s*user_email\s*\}\}/gi, userEmail || '')
    .replace(/\{\{\s*domain\s*\}\}/gi, domain);
}

export function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanHtmlStructure(str) {
  if (!str) return '';
  return str
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

const SUPPORTED_LANGS = ['zh', 'zh-Hant', 'en', 'fr', 'es', 'nl'];

/**
 * Check if the email matches a pre-defined official template without modifications.
 * If unmodified, returns the pre-defined translated version in targetLang.
 * If modified or not a pre-defined template, returns null (triggering fallback to AI translation).
 *
 * @param {object} email - Email record { subject, content, text, toEmail, toName, sendEmail, isOfficial, labels }
 * @param {string} targetLang - Target language code ('en', 'zh', 'zh-Hant', 'fr', 'es', 'nl')
 * @returns {object|null} Predefined translation or null
 */
export function getPredefinedTranslation(email, targetLang) {
  if (!email) return null;
  const normTarget = normalizeLangCode(targetLang);
  if (!SUPPORTED_LANGS.includes(normTarget)) {
    return null;
  }

  // Only official emails sent from admin can match pre-defined system templates
  const isOfficial = email.sendEmail === 'admin@epocanvas.com' || Boolean(email.isOfficial);
  if (!isOfficial) {
    return null;
  }

  const actualContent = email.content || '';
  const actualText = email.text || '';
  const actualSubject = email.subject || '';
  const toEmail = email.toEmail || '';
  const toName = email.toName || '';

  const candidateNames = [
    toName,
    toEmail ? toEmail.split('@')[0] : '',
    'Epocanvas 用户',
    'Epocanvas 用戶',
    'User',
    'Epocanvas User'
  ].filter(Boolean);

  const cleanedActualContent = cleanHtmlStructure(actualContent);
  const cleanedActualText = cleanText(actualContent || actualText);
  const cleanedActualSubject = cleanText(actualSubject);

  const templateSets = [
    { type: 'welcome', templates: WELCOME_TEMPLATES },
    { type: 'announcement', templates: GLOBAL_ANNOUNCEMENT_TEMPLATES }
  ];

  for (const set of templateSets) {
    for (const srcLang of SUPPORTED_LANGS) {
      const srcTpl = set.templates[srcLang];
      if (!srcTpl || !srcTpl.content) continue;

      for (const nameCandidate of candidateNames) {
        const expectedHtml = interpolatePlaceholders(srcTpl.content, toEmail, nameCandidate);
        const expectedSubject = interpolatePlaceholders(srcTpl.subject, toEmail, nameCandidate);

        const cleanedExpectedHtml = cleanHtmlStructure(expectedHtml);
        const cleanedExpectedText = cleanText(expectedHtml);
        const cleanedExpectedSubject = cleanText(expectedSubject);

        // Subject comparison: allow exact text match, or known announcement subject variant
        let subjectMatches = (cleanedActualSubject === cleanedExpectedSubject);
        if (!subjectMatches && set.type === 'announcement' && srcLang === 'zh') {
          // Allow legacy announcement subject variant if text matches
          if (cleanedActualSubject === cleanText('📢 系统全域通知与版本升级公告')) {
            subjectMatches = true;
          }
        }

        // Content comparison: either exact HTML structure matches, or stripped plain text matches
        const contentMatches = (cleanedActualContent === cleanedExpectedHtml) ||
                               (cleanedActualText === cleanedExpectedText);

        if (subjectMatches && contentMatches) {
          // Unmodified template match confirmed!
          const targetTpl = set.templates[normTarget];
          if (!targetTpl || !targetTpl.content) return null;

          const translatedHtml = interpolatePlaceholders(targetTpl.content, toEmail, toName);
          const translatedSubject = interpolatePlaceholders(targetTpl.subject, toEmail, toName);
          const translatedText = cleanText(translatedHtml);

          return {
            translatedHtml,
            translatedText,
            translatedSubject,
            isHtml: true,
            engine: 'template',
            sourceLang: srcLang,
            targetLang: normTarget,
            templateType: set.type
          };
        }
      }
    }
  }

  // Actual content differs from the official template (modified by admin) or unknown template:
  // Fall back to AI translation!
  return null;
}
