// Parse in an inert <template> before DOMPurify or the live shadow root sees
// sender-controlled markup. DOMPurify handles XSS; this layer handles network
// privacy, including CSS URLs and alternate image sources.
export const MAIL_SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'referrerpolicy'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta', 'base', 'svg', 'math', 'video', 'audio', 'source', 'track'],
  FORBID_ATTR: ['srcset', 'ping', 'background', 'poster', 'autofocus']
};

const REMOVED_TAGS = new Set([
  ...MAIL_SANITIZE_OPTIONS.FORBID_TAGS,
  'input', 'button', 'select', 'textarea', 'noscript', 'template'
]);
const SAFE_STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration',
  'text-transform', 'text-indent', 'white-space', 'word-break', 'overflow-wrap',
  'vertical-align', 'display', 'width', 'height', 'min-width', 'max-width',
  'min-height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom',
  'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'border', 'border-top', 'border-right', 'border-bottom',
  'border-left', 'border-color', 'border-style', 'border-width', 'border-radius',
  'border-collapse', 'border-spacing', 'table-layout', 'list-style-type', 'opacity'
]);
const NETWORK_ATTRIBUTES = new Set([
  'src', 'srcset', 'imagesrcset', 'imagesizes', 'background', 'poster', 'ping',
  'xlink:href', 'data', 'codebase', 'action', 'formaction', 'manifest', 'lowsrc', 'dynsrc'
]);

export function safeMailStyle(style = '') {
  return String(style).split(';').flatMap(declaration => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return [];
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || !value) return [];
    // No escapes, custom properties, resource functions, CSS imports or markup.
    if (/[^a-z0-9\s#.,%()+\-/'"!]/i.test(value) || /url|image|expression|var\s*\(|attr\s*\(/i.test(value)) return [];
    return [`${property}: ${value}`];
  }).join('; ');
}

function httpUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function inlineRaster(value) {
  return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(value);
}

export function prepareMailContent(html, {
  document = globalThis.document,
  baseUrl = document?.baseURI,
  allowRemoteImages = false,
  trustedImageUrls = []
} = {}) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const trusted = new Set(trustedImageUrls.map(url => httpUrl(url, baseUrl)).filter(Boolean));
  let remoteImageCount = 0;

  for (const element of [...template.content.querySelectorAll('*')]) {
    const tag = element.localName.toLowerCase();
    if (REMOVED_TAGS.has(tag)) {
      element.remove();
      continue;
    }

    // Never retain srcset: a later resize must not trigger a different request.
    // A srcset-only <img> may use its first HTTP source after explicit approval.
    const imageSource = tag === 'img'
      ? (element.getAttribute('src') || (element.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0] || '').trim()
      : '';
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (NETWORK_ATTRIBUTES.has(name) || name.startsWith('on') || name === 'autofocus') {
        element.removeAttribute(attribute.name);
      } else if (name === 'style') {
        const style = safeMailStyle(attribute.value);
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
      } else if (name === 'href') {
        if (tag !== 'a' || !/^(?:https?:|mailto:|#)/i.test(attribute.value.trim())) {
          element.removeAttribute(attribute.name);
        } else {
          element.setAttribute('rel', 'noopener noreferrer');
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.setAttribute('target', '_blank');
        }
      }
    }

    if (tag !== 'img' || !imageSource) continue;
    const remoteUrl = httpUrl(imageSource, baseUrl);
    const isTrusted = remoteUrl && trusted.has(remoteUrl);
    const isRemote = remoteUrl && !isTrusted;
    if (isRemote) remoteImageCount++;
    if (inlineRaster(imageSource) || isTrusted || (isRemote && allowRemoteImages)) {
      element.setAttribute('src', remoteUrl || imageSource);
      element.setAttribute('referrerpolicy', 'no-referrer');
      element.setAttribute('decoding', 'async');
    }
  }

  const bodyStyle = String(html || '').match(/<body\b[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const serialized = [...template.content.childNodes].map(node => {
    if (node.nodeType === 1) return node.outerHTML;
    if (node.nodeType === 3) return node.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '';
  }).join('');
  return {
    html: serialized,
    remoteImageCount,
    bodyStyle: safeMailStyle(bodyStyle?.[1] || bodyStyle?.[2] || '')
  };
}
