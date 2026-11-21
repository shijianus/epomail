// Email clients can render these marks without fonts, images or network access.
export const WELCOME_BRAND = '<span style="display: block; margin: auto; text-align: center; color: #fff; line-height: 1.2"><span aria-hidden="true" style="display: block; font-size: 32px">✉</span><strong style="display: block; font-size: 15px">EpoMail</strong></span>';
export const WELCOME_STAR = '<span aria-hidden="true" style="color: #1854a0; font-size: 18px">★</span>';

function escapeText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function welcomeIllustration(title, labels) {
  const labelStyle = 'display: inline-block; margin: 3px 4px 3px 0; padding: 3px 7px; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; font-size: 13px; line-height: 1.5';
  const details = labels.map(label => '<span style="' + labelStyle + '">' + escapeText(label) + '</span>').join(' ');
  return '<div style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; background-color: #fff">' +
    '<strong style="display: block; margin-bottom: 5px; color: #1e3a5f; font-size: 15px">' + escapeText(title) + '</strong>' +
    '<div>' + details + '</div></div>';
}
