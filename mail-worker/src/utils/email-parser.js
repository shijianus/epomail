export function extractEmailAddress(fullStr) {
  if (!fullStr) return '';
  const match = fullStr.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim();
  }
  return fullStr.trim();
}
