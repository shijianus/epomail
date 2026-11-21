// Small, dependency-free scanner for literal dictionary/object properties.
// Keep strings, templates, comments and regular expressions opaque so their
// punctuation cannot manufacture keys. This is not a JS/TS data-flow analyser.
function decodeString(raw) {
  const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
  return raw.slice(1, -1).replace(/\\(\r\n|[\r\n]|u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\s\S])/g, (_, escape) => {
    if (/^[\r\n]/.test(escape)) return '';
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
    if (/^[ux][\da-fA-F]+$/.test(escape)) return String.fromCodePoint(parseInt(escape.slice(1), 16));
    return escapes[escape] ?? escape;
  });
}

export function sourceTokens(source) {
  const pattern = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|=>|\|\||&&|\?\?|[^\s]/g;
  const regexPrefix = new Set(['=', '(', '[', '{', ':', ',', ';', '!', '?', '&', '|', 'return', 'case', 'throw']);
  const tokens = [];
  let line = 1;
  let previousEnd = 0;
  let match;
  while ((match = pattern.exec(source))) {
    line += source.slice(previousEnd, match.index).split('\n').length - 1;
    const startLine = line;
    let raw = match[0];
    let kind = 'punctuation';
    if (raw === '/' && (!tokens.length || regexPrefix.has(tokens.at(-1).raw))) {
      const regex = /^\/(?![/*])(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[dgimsuvy]*/.exec(source.slice(match.index));
      if (regex) {
        raw = regex[0];
        pattern.lastIndex = match.index + raw.length;
        kind = 'regex';
      }
    }
    previousEnd = match.index + raw.length;
    line += raw.split('\n').length - 1;
    if (raw.startsWith('//') || raw.startsWith('/*') || raw.startsWith('<!--')) continue;
    if (/^["']/.test(raw) || (raw.startsWith('`') && !raw.includes('${'))) kind = 'string';
    else if (raw.startsWith('`')) kind = 'template';
    else if (/^[A-Za-z_$]/.test(raw)) kind = 'identifier';
    else if (/^\d/.test(raw)) kind = 'number';
    tokens.push({ raw, kind, value: kind === 'string' ? decodeString(raw) : raw, start: match.index, line: startLine });
  }
  return tokens;
}

export function literalObjects(source) {
  const tokens = sourceTokens(source);
  const stack = [];
  const objects = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const owner = stack.at(-1);
    const previous = tokens[i - 1]?.raw;
    const next = tokens[i + 1]?.raw;
    const isProperty = owner?.opener === '{' && (previous === '{' || previous === ',');
    // Support both ordinary/quoted keys and statically computed ['key'] keys.
    const computed = token.raw === '[' && tokens[i + 1]?.kind === 'string' && tokens[i + 2]?.raw === ']' && tokens[i + 3]?.raw === ':';
    if (isProperty && (computed || (['identifier', 'string', 'number'].includes(token.kind) && next === ':'))) {
      const name = computed ? tokens[i + 1].value : token.value;
      const valueIndex = i + (computed ? 4 : 2);
      const value = tokens[valueIndex];
      owner.properties.push({
        name,
        line: token.line,
        start: token.start,
        valueStart: value?.start,
        // Only a complete static value counts as an indirect translation key.
        value: value?.kind === 'string' && [',', '}'].includes(tokens[valueIndex + 1]?.raw) ? value.value : undefined
      });
    }
    if (['{', '[', '('].includes(token.raw)) {
      const block = { opener: token.raw, start: token.start, line: token.line, properties: [] };
      stack.push(block);
      if (token.raw === '{') objects.push(block);
    } else if (['}', ']', ')'].includes(token.raw)) {
      const block = stack.pop();
      if (block) block.end = token.start + token.raw.length;
    }
  }
  return objects;
}

export function duplicateProperties(object) {
  const seen = new Map();
  for (const property of object.properties) {
    if (!seen.has(property.name)) seen.set(property.name, []);
    seen.get(property.name).push(property.line);
  }
  return [...seen].filter(([, lines]) => lines.length > 1);
}
