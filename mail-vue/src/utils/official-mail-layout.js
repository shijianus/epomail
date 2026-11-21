import { WELCOME_BRAND, WELCOME_STAR, welcomeIllustration } from './welcome-art.js';

// Only injected for a message the authenticated API identifies as official.
export const OFFICIAL_MAIL_CSS = `
  .official-mail-body {
    display: flow-root;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100%;
    height: auto;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    color: #1e293b;
    background-color: #fff;
    color-scheme: light;
  }
  .official-mail-body * {
    box-sizing: border-box;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-wrap: anywhere;
    flex-wrap: wrap;
  }
  .official-mail-body pre { white-space: pre-wrap; }
  .official-mail-body table { table-layout: fixed; }
`;

// Historic templates used the background shorthand. Copy only a solid color
// into the sanitized result. The gradient grammar permits hex stops only.
const HEX = '#(?:[a-f\\d]{3}|[a-f\\d]{6})';
const STOP = `${HEX}(?:\\s+\\d+(?:\\.\\d+)?%)?`;
const gradient = new RegExp(`^linear-gradient\\(\\s*(?:-?\\d+(?:\\.\\d+)?deg\\s*,\\s*)?(${HEX})(?:\\s+\\d+(?:\\.\\d+)?%)?(?:\\s*,\\s*${STOP})+\\s*\\)$`, 'i');
const solid = /^(?:#[a-f\d]{3,4}|#[a-f\d]{6}|#[a-f\d]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\))$/i;

export function officialBackgroundColor(value) {
  if (solid.test(value)) return value;
  const first = gradient.exec(value)?.[1];
  // The old branded banner and primary button used translucent white text.
  return first?.toLowerCase() === '#0078d4' ? '#1854a0' : first || '';
}

// Existing welcome messages can still contain the original seven SVG images
// or a version where an earlier editor stripped those images from their boxes.
export function restoreStoredWelcomeArt(fragment) {
  const divs = [...fragment.querySelectorAll('div')];
  const badge = divs.find(box => {
    if (box.style.width !== '92px' || box.style.height !== '92px' ||
        !box.parentElement?.querySelector('h1')) return false;
    const logo = box.firstElementChild;
    if (!logo) return !box.textContent.trim() && box.style.borderRadius === '22px' && box.style.display === 'flex';
    return box.childElementCount === 1 && logo.localName === 'svg' && logo.getAttribute('viewBox') === '0 0 400 400' &&
      logo.getAttribute('width') === '76' && logo.getAttribute('height') === '76' &&
      logo.querySelector('#epomailLogoGrad') && logo.querySelector('#epomailCutout');
  });
  if (!badge) return;
  badge.innerHTML = WELCOME_BRAND;
  const welcome = badge.parentElement.parentElement?.parentElement || fragment;
  for (const box of welcome.querySelectorAll('div')) {
    if (box.style.width !== '300px' || box.style.display !== 'flex' || !box.parentElement.querySelector('h3')) continue;
    const art = box.firstElementChild;
    if (!art) {
      if (!box.textContent.trim()) box.remove();
      continue;
    }
    if (box.childElementCount !== 1 || art.localName !== 'svg' || art.getAttribute('viewBox') !== '0 0 320 180' ||
        art.getAttribute('width') !== '100%' || art.getAttribute('height') !== '150') continue;
    const labels = [...art.querySelectorAll('text')];
    if (labels.length < 7 || labels.length > 12) continue;
    const title = labels.find(node => node.getAttribute('x') === '80' && node.getAttribute('y') === '80') || labels[0];
    const text = node => node.textContent.trim().slice(0, 160);
    box.innerHTML = welcomeIllustration(text(title), labels.filter(node => node !== title && text(node) !== '@').map(text));
  }
  for (const star of welcome.querySelectorAll('svg')) {
    if (star.getAttribute('width') === '18' && star.getAttribute('height') === '18' &&
        star.getAttribute('viewBox') === '0 0 24 24' &&
        star.querySelector('path')?.getAttribute('d') === 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z') {
      star.insertAdjacentHTML('beforebegin', WELCOME_STAR);
      star.remove();
    }
  }
}
