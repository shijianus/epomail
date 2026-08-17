/**
 * Parses basic inline Markdown formatting.
 * Strictly prevents block-level formatting to avoid breaking layout structures.
 *
 * Supported syntaxes:
 * - **bold** or __bold__ -> <strong>
 * - *italic* or _italic_ -> <em>
 * - ~~strikethrough~~ -> <del>
 * - `code` -> <code>
 * - ==highlight== -> <mark>
 * - \n -> <br>
 */
export function parseInlineMarkdown(text) {
  if (!text) return '';
  
  // HTML escape to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  
  // Inline Code: `text`
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Highlight: ==text==
  html = html.replace(/==(.*?)==/g, '<mark>$1</mark>');
  
  // Newlines -> <br>
  html = html.replace(/\n/g, '<br>');
  
  return html;
}
