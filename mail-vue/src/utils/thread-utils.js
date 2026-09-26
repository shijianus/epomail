/**
 * Email Conversation Threading Utilities
 */

/**
 * Normalizes an email subject by iteratively stripping reply/forward prefixes
 * and bracketed tags to ensure all messages in a conversation map to the same thread.
 *
 * @param {string} subject
 * @returns {string} Normalized subject in lowercase
 */
export function normalizeSubject(subject) {
  let s = (subject || '').trim();
  let prev = '';
  while (s && s !== prev) {
    prev = s;
    s = s.replace(/^(re|fwd|fw|回复|转发|轉發|aw|wg|vs|sv)[:：\s]+/gi, '')
         .replace(/^(\[[^\]]+\]|\([^\)]+\))[:：\s]*/g, '')
         .trim();
  }
  return s.toLowerCase();
}

/**
 * Derives a consistent thread grouping key for an email item.
 *
 * @param {Object} item
 * @returns {string|null} Grouping key or null if item is an expand placeholder
 */
export function getThreadKey(item) {
  if (!item || item.expand) return null;
  if (item.threadId) return `thread_${item.threadId}`;

  const norm = normalizeSubject(item.subject);
  if (!norm) {
    const sender = (item.sendEmail || '').trim().toLowerCase();
    return sender ? `sender_${sender}` : `id_${item.emailId}`;
  }
  return `subj_${norm}`;
}
