// CJK UI-text gate. Comments, regexes, protocol comparisons and object keys
// are not display text. Plain strings are NOT blanket-exempted (including
// pure-Chinese strings and non-i18n `value || 'fallback'` expressions).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { duplicateProperties, literalObjects, sourceTokens } from './i18n-source.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mail-vue', 'src');
const LANGS = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const cjk = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const blank = (text) => text.replace(/[^\r\n]/g, ' ');
// Reviewed data, never a hit-count baseline. Match exact file + source + count;
// edits, deletion, duplication, missing files and invalid records fail closed.
let exceptionFailures = 0;
const dataExceptions = [];
const exceptionIds = new Set();
const exceptionFail = (message) => {
  exceptionFailures++;
  console.log(`FAIL data exception ${message}`);
};
try {
  const records = JSON.parse(readFileSync(new URL('./i18n-data-exceptions.json', import.meta.url), 'utf8'));
  if (!Array.isArray(records)) throw new Error('expected an array of exact data exceptions');
  for (const [index, entry] of records.entries()) {
    if (!entry || typeof entry.file !== 'string' || !/^[\w.-]+(?:\/[\w.-]+)*\.(?:vue|js|jsx|ts|tsx)$/.test(entry.file) ||
        entry.file.split('/').some((segment) => segment === '.' || segment === '..') ||
        typeof entry.snippet !== 'string' || !entry.snippet.trim() ||
        typeof entry.reason !== 'string' || !entry.reason.trim() ||
        !Number.isInteger(entry.occurrences) || entry.occurrences < 1) {
      exceptionFail(`#${index + 1}: exact file, nonempty snippet/reason and positive occurrences required`);
      continue;
    }
    const snippet = entry.snippet.replace(/\r\n?/g, '\n');
    const id = `${entry.file}\0${snippet}`;
    if (exceptionIds.has(id)) {
      exceptionFail(`${entry.file}: duplicate exception record #${index + 1}`);
      continue;
    }
    exceptionIds.add(id);
    dataExceptions.push({ ...entry, snippet, visited: false });
  }
} catch (error) {
  exceptionFail(`cannot load i18n-data-exceptions.json: ${error.message}`);
}

function checkedDataRanges(rel, text) {
  const ranges = [];
  let records = 0;
  for (const entry of dataExceptions.filter((item) => item.file === rel)) {
    entry.visited = true;
    const matches = [];
    let from = 0;
    let start;
    while ((start = text.indexOf(entry.snippet, from)) !== -1) {
      matches.push([start, start + entry.snippet.length]);
      from = start + 1;
    }
    if (matches.length !== entry.occurrences) {
      exceptionFail(`stale ${rel}: expected ${entry.occurrences} exact occurrence(s), found ${matches.length}; ${entry.snippet.split('\n')[0]}`);
      continue;
    }
    records++;
    ranges.push(...matches);
  }
  if (records) console.log(`DATA ${rel}: ${records} reviewed records / ${ranges.length} exact matches`);
  return ranges;
}

const languageNames = new Map([
  ['zh', new Set(['中文 (简体)', '简体中文'])],
  ['zh-Hant', new Set(['正體中文 (繁體)', '正體中文'])],
  ['ja', new Set(['日本語'])]
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(vue|js|jsx|ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

// Precisely scoped locale resources, not whole-file or historical-hit baselines.
// Each registered object must still contain six nonempty, symmetric languages.
const templateResources = new Map([
  ['const/announcement-templates.js', { name: 'GLOBAL_ANNOUNCEMENT_TEMPLATES', fields: ['lang', 'subject', 'content'] }],
  ['const/welcome-templates.js', { name: 'WELCOME_TEMPLATES', fields: ['lang', 'name', 'subject', 'content'] }]
]);
let resourceFailures = 0;
function checkedResourceRanges(rel, text) {
  const objects = literalObjects(text);
  const ranges = [];
  const reject = (message) => {
    resourceFailures++;
    console.log(`FAIL resource ${rel}: ${message}`);
  };
  // These are existing locale data tables, not arbitrary strings in this file.
  // Only verified names/descs and their matching legacy mirrors are masked;
  // newly added strings outside those exact properties are still scanned.
  if (rel === 'utils/theme-presets.js') {
    const presets = objects.filter((object) => object.properties.some((property) => property.name === 'id'));
    for (const preset of presets) {
      for (const [field, mirror] of [['names', 'name'], ['descs', 'desc']]) {
        const property = preset.properties.find((entry) => entry.name === field);
        if (!property) {
          if (field === 'names' || preset.properties.find((entry) => entry.name === 'id')?.value?.startsWith('theme-')) reject(`preset at line ${preset.line} has no ${field}`);
          continue;
        }
        const table = objects.find((object) => object.start === property.valueStart);
        if (!table || table.properties.map((entry) => entry.name).sort().join(',') !== [...LANGS].sort().join(',') ||
            table.properties.some((entry) => typeof entry.value !== 'string' || !entry.value.trim())) {
          reject(`${field} at line ${preset.line} must contain six nonempty language entries`);
          continue;
        }
        ranges.push([table.start, table.end]);
        for (const [suffix, lang] of [['Zh', 'zh'], ['En', 'en']]) {
          const legacy = preset.properties.find((entry) => entry.name === `${mirror}${suffix}`);
          if (!legacy || legacy.value !== table.properties.find((entry) => entry.name === lang)?.value) {
            reject(`${mirror}${suffix} at line ${preset.line} differs from ${field}.${lang}`);
          } else {
            const token = sourceTokens(text.slice(legacy.valueStart))[0];
            ranges.push([legacy.valueStart, legacy.valueStart + token.raw.length]);
          }
        }
      }
    }
    if (!presets.length) reject('no theme/cover preset objects found');
    else console.log(`RESOURCE ${rel}: ${presets.length} locale tables and compatibility mirrors verified`);
  }
  // Existing manual formatters explicitly route all six locales. Validate that
  // routing before classifying their literal bodies as locale resources. This
  // checks branch coverage, not linguistic translation quality.
  const branchResources = {
    'utils/day.js': ['fromNow', 'formatDetailDate'],
    'utils/geo-data.js': ['getPostalCodeLabel', 'getPostalCodePlaceholder']
  };
  for (const name of branchResources[rel] || []) {
    const declaration = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(text);
    const body = declaration && objects.find((object) => object.start === declaration.index + declaration[0].length - 1);
    const source = body && text.slice(declaration.index, body.end);
    if (!source || !/lang\s*=\s*[^;\n]*['"]zh['"]/.test(source) ||
        LANGS.slice(1).some((lang) => !new RegExp(`lang\\s*===\\s*['"]${lang}['"]`).test(source))) {
      reject(`${name}: expected zh default and explicit zh-Hant/en/es/fr/nl branches`);
    } else {
      ranges.push([body.start, body.end]);
      console.log(`RESOURCE ${rel}#${name}: six locale branches verified`);
    }
  }
  const spec = templateResources.get(rel);
  if (!spec) return ranges;
  const declaration = new RegExp(`export\\s+const\\s+${spec.name}\\s*=\\s*\\{`).exec(text);
  const table = declaration && objects.find((object) => object.start === declaration.index + declaration[0].length - 1);
  const errors = [];
  if (!table) errors.push(`missing literal export ${spec.name}`);
  else {
    const actual = table.properties.map((property) => property.name);
    if ([...actual].sort().join(',') !== [...LANGS].sort().join(',')) errors.push('expected exactly six language entries');
    for (const lang of LANGS) {
      const entry = table.properties.find((property) => property.name === lang);
      const body = entry && objects.find((object) => object.start === entry.valueStart);
      if (!body) { errors.push(`${lang}: missing literal language object`); continue; }
      if (duplicateProperties(body).length) errors.push(`${lang}: duplicate resource fields`);
      if (body.properties.map((property) => property.name).sort().join(',') !== [...spec.fields].sort().join(',')) {
        errors.push(`${lang}: expected fields ${spec.fields.join(', ')}`);
      }
      for (const field of spec.fields) {
        const property = body.properties.find((item) => item.name === field);
        if (typeof property?.value !== 'string' || !property.value.trim()) errors.push(`${lang}.${field}: empty or nonliteral resource`);
        if (field === 'lang' && property?.value !== lang) errors.push(`${lang}.lang: incorrect locale`);
      }
    }
  }
  if (errors.length) {
    resourceFailures += errors.length;
    errors.forEach((error) => console.log(`FAIL resource ${rel}: ${error}`));
    return [];
  }
  console.log(`RESOURCE ${rel}#${spec.name}: six language entries verified`);
  return [[table.start, table.end]];
}

function scanCode(text) {
  const tokens = sourceTokens(text);
  const ignored = new Set();
  const translationEnds = new Set();
  const pairs = new Map();
  const closingPairs = new Map();
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i].raw;
    if (['(', '[', '{'].includes(raw)) stack.push(i);
    if ([')', ']', '}'].includes(raw)) {
      const start = stack.pop();
      if (start !== undefined) {
        pairs.set(start, i);
        closingPairs.set(i, start);
      }
    }
  }
  const ignore = (start, end) => { for (let i = start; i <= end; i++) ignored.add(i); };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (tokens[i + 1]?.raw !== '(' || !pairs.has(i + 1)) continue;
    const end = pairs.get(i + 1);
    const translation = /^(?:\$?(?:t|rt|tc|tn|te)|tr)$/.test(token.raw);
    // Compare an already-normalized string: x === normalize('wire value').
    // Restrict this to calls that immediately form a comparison operand.
    if (['===', '!==', '==', '!='].includes(tokens[i - 1]?.raw) || ['===', '!==', '==', '!='].includes(tokens[end + 1]?.raw)) ignore(i + 1, end);
    const consoleCall = tokens[i - 1]?.raw === '.' && tokens[i - 2]?.raw === 'console';
    if (translation || consoleCall) {
      ignore(i + 1, end);
      if (translation) translationEnds.add(end);
    }
    // Predicate operands classify incoming data; they are never displayed.
    if (tokens[i - 1]?.raw === '.' && /^(?:includes|startsWith|endsWith|indexOf|lastIndexOf)$/.test(token.raw)) {
      ignore(i + 1, end);
      // ['legacy', '协议值'].includes(value) is a protocol comparison too.
      if (tokens[i - 2]?.raw === ']') {
        const start = closingPairs.get(i - 2);
        if (start !== undefined) ignore(start, i - 2);
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (translationEnds.has(i - 2) && ['||', '??'].includes(tokens[i - 1]?.raw) && ['string', 'template'].includes(tokens[i].kind)) ignored.add(i);
  }
  const hits = [];
  const objects = literalObjects(text);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (ignored.has(i) || !['string', 'template'].includes(token.kind) || !cjk.test(token.raw)) continue;
    const prev = tokens[i - 1]?.raw;
    const next = tokens[i + 1]?.raw;
    if (['===', '!==', '==', '!=', 'case'].includes(prev) || ['===', '!==', '==', '!='].includes(next)) continue;
    if (next === ':' && ['{', ','].includes(prev)) continue; // dictionary/protocol lookup key
    if (prev === '[' && next === ']' && tokens[i - 2]?.kind === 'identifier') continue; // lookup, not display
    // Language self-names are intentional only when paired with their locale id.
    if (prev === ':' && languageNames.get(tokens[i - 2]?.value)?.has(token.value)) continue;
    const object = objects.find((entry) => entry.properties.some((property) => property.name === 'label' && property.valueStart === token.start)
      && entry.properties.some((property) => ['key', 'value'].includes(property.name) && languageNames.get(property.value)?.has(token.value)));
    if (object) continue;
    // CSS comments inside a stylesheet template literal are not visible text;
    // do not strip comments from arbitrary strings (e.g. displayed code samples).
    const assignment = text.slice(Math.max(0, token.start - 120), token.start);
    if (/\b(?:style|styleElement)\.textContent\s*=\s*$/.test(assignment)) {
      const raw = token.raw.replace(/\/\*[\s\S]*?\*\//g, blank);
      if (cjk.test(raw)) hits.push({ ...token, raw });
    } else if (/\.innerHTML\s*=\s*$/.test(assignment)) {
      const raw = token.raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (style) => style.replace(/\/\*[\s\S]*?\*\//g, blank));
      if (cjk.test(raw)) hits.push({ ...token, raw });
    } else hits.push(token);
  }
  return hits;
}

function collectHits(text, isVue) {
  if (!isVue) return scanCode(text);
  const hits = [];
  let markup = text.replace(/<!--[\s\S]*?-->/g, blank);
  markup = markup.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (whole, type, body, offset) => {
    if (type.toLowerCase() === 'script') {
      const start = offset + whole.indexOf('>') + 1;
      hits.push(...scanCode(body).map((token) => ({ ...token, start: token.start + start })));
    }
    return blank(whole);
  });
  // Template attributes can contain JS with quoted text. Check expressions as
  // code rather than deleting the entire attribute (which would hide fallbacks).
  const pattern = /\{\{([\s\S]*?)\}\}|<\/?[A-Za-z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  const addText = (value, start) => { if (cjk.test(value)) hits.push({ raw: value, start }); };
  let previous = 0;
  let match;
  while ((match = pattern.exec(markup))) {
    addText(markup.slice(previous, match.index), previous);
    if (match[1] !== undefined) {
      hits.push(...scanCode(match[1]).map((token) => ({ ...token, start: token.start + match.index + 2 })));
    } else {
      const attributes = [...match[0].matchAll(/([:@#\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)];
      const localeAttribute = attributes.find((attribute) => attribute[1] === 'value');
      const locale = localeAttribute?.[3] ?? localeAttribute?.[4];
      for (const attribute of attributes) {
        const name = attribute[1];
        const value = attribute[3] ?? attribute[4];
        const start = match.index + attribute.index + attribute[0].indexOf(attribute[2]) + 1;
        if (name.startsWith(':') || name.startsWith('v-') || name.startsWith('@')) {
          hits.push(...scanCode(value).map((token) => ({ ...token, start: token.start + start })));
        } else if (/^(?:label|title|placeholder|alt|aria-label|description|content|text)$/.test(name)) {
          if (name === 'label' && languageNames.get(locale)?.has(value)) continue;
          addText(value, start);
        }
      }
    }
    previous = pattern.lastIndex;
  }
  addText(markup.slice(previous), previous);
  return hits;
}

let hits = 0;
for (const file of walk(srcDir).filter((file) => !/[\\/]i18n[\\/]/.test(file))) {
  const rel = file.slice(srcDir.length + 1).split(/[\\/]/).join('/');
  // Normalize only line endings, not spacing or punctuation in reviewed data.
  const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const ranges = [...checkedResourceRanges(rel, text), ...checkedDataRanges(rel, text)];
  let masked = text;
  for (const [start, end] of ranges) masked = masked.slice(0, start) + blank(masked.slice(start, end)) + masked.slice(end);
  const lines = text.split('\n');
  const found = new Set();
  for (const token of collectHits(masked, file.endsWith('.vue'))) {
    const line = masked.slice(0, token.start).split('\n').length;
    token.raw.split('\n').forEach((part, offset) => { if (cjk.test(part)) found.add(line + offset); });
  }
  for (const line of [...found].sort((a, b) => a - b)) {
    hits++;
    console.log(`${rel}:${line}: ${lines[line - 1].trim().slice(0, 220)}`);
  }
}
for (const entry of dataExceptions) {
  if (!entry.visited) exceptionFail(`stale ${entry.file}: source file missing or outside scan scope`);
}
console.log(`\n=== total suspicious lines: ${hits} ===`);
const failed = hits > 0 || resourceFailures > 0 || exceptionFailures > 0;
console.log(`[i18n-hardcoded] ${failed ? 'FAIL' : 'PASS'}: ${hits} suspicious lines, ${resourceFailures} resource failures, ${exceptionFailures} data exception failures`);
process.exitCode = failed ? 1 : 0;
