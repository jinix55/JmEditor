/**
 * legacy-format — 옛 글·워드·한글·엑셀 HTML 변환 (Sanitizer 허용 검사 전 단계)
 * - normalizeLegacy: font 태그·표 옛 속성을 style 로, font-weight 를 strong 으로 (파싱한 DOM 을 한 번 훑음)
 * - parseStyle·cleanLegacyDecl: style 선언 파싱과 값 변환(pt→px, background→색, 테두리·글꼴 정규화)
 * 서버 LegacyFormat.java 와 같은 규칙이어야 한다 (사례 파일 test/fixtures/legacy/cases.txt). 정규식은 모두 앵커가 있어 선형이고, 값 길이는 STYLE_VALUE_MAX 로 묶인다.
 */
import { storedFontName, fontFamilyValue } from './font-policy.js';

/** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
export const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d \t\n\f\r.,%]+\)|[a-z]+)$/i;
/** style 선언 값 길이 상한 */
const STYLE_VALUE_MAX = 256;
/** 단위별 px 값 (1pt=1.333px, 1mm=3.78px, 1cm=37.8px) */
const PX_PER_UNIT = { px: 1, pt: 1.333, mm: 3.78, cm: 37.8 };
/** font 태그 size 1~7 의 px */
const FONT_TAG_SIZES = [10, 13, 16, 18, 24, 32, 48];
const FONT_PX_MIN = 8;
const FONT_PX_MAX = 96;
/** 테두리 폭 상한(px) */
const BORDER_PX_MAX = 20;
/** font-size rem 값 (1rem=16px) */
const FONT_REM = /^(\d{0,6}(?:\.\d{1,6})?)rem$/i;
/** line-height 값: 단위 없는 수·%·px·pt */
const LINE_HEIGHT = /^(\d{0,6}(?:\.\d{1,6})?)(px|pt|%)?$/i;
/** letter-spacing 값: px·pt·em (음수 허용) */
const LETTER_SPACING = /^(-?)(\d{0,6}(?:\.\d{1,6})?)(px|pt|em)$/i;
/** 길이 값: px·pt·mm·cm (소수 허용, 지수 표기 불가) */
const PX_PT_LENGTH = /^(\d{0,6}(?:\.\d{1,6})?)(px|pt|mm|cm)$/i;
/** width·height 속성 값: 숫자(px)·px·pt·% */
const LENGTH_ATTR = /^\d{1,6}(?:\.\d{1,6})?(?:px|pt|%)?$/i;
const BORDER_WIDTH_WORD = /^(thin|medium|thick)$/i;
const BORDER_STYLE_WORD = /^(none|solid|dashed|dotted|double)$/i;
/** 테두리 단축값 속성 */
const BORDER_SHORTHAND = /^border(-(top|right|bottom|left))?$/;
/** 테두리 낱개 속성: [이름 전체, 종류] */
const BORDER_PART = /^border(?:-(?:top|right|bottom|left))?-(width|style|color)$/;
/** background 단축값에서 색으로 보지 않는 낱말 (색 이름 형식에 맞아도) */
const BG_KEYWORDS = new Set(['none', 'repeat', 'space', 'round', 'scroll', 'fixed', 'local', 'left', 'right', 'top', 'bottom', 'center', 'auto', 'cover', 'contain', 'inherit', 'initial', 'unset', 'revert']);
/** width·height pt 변환, background 변환, 옛 속성을 적용하는 표 요소 */
const LEGACY_TABLE_TAGS = new Set(['table', 'tr', 'td', 'th', 'col']);
/** align 을 text-align 으로 옮기는 블록 (table 은 표 위치라 따로) */
const ALIGN_BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** 블록을 감싼 font·span 이 안쪽 글자로 내려주는 속성 (배경은 단축값·낱개를 한 항목으로) */
const PENDING_KEYS = { color: 'color', 'font-size': 'font-size', 'font-family': 'font-family', 'background-color': 'background-color', background: 'background-color', 'line-height': 'line-height', 'letter-spacing': 'letter-spacing' };
/** 굵게 판정 값 */
const BOLD_VALUE = /^(bold|bolder|[7-9]00)$/i;
/** 들여쓰기 값: px·pt·mm·cm (음수는 text-indent 만, 지수 표기 불가) */
const INDENT_LENGTH = /^(-?)(\d{0,6}(?:\.\d{1,6})?)(px|pt|mm|cm)$/i;
/** margin-left·text-indent 를 남기는 글 블록 */
const INDENT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
/** 들여쓰기 절댓값 상한(px) */
const INDENT_PX_MAX = 400;
/** 굵기 해제 값 */
const NOT_BOLD_VALUE = /^(normal|lighter|[1-6]00)$/i;
/** 내용을 바로 감쌀 수 없어 굵기를 자식에게 넘기는 요소 */
const BOLD_PASS_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'col', 'ul', 'ol', 'dl', 'menu', 'picture']);
/** strong 으로 감싸지 않고 따로 처리하는 블록 요소 */
const BOLD_BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'caption', 'center', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
/** 내용을 통째로 버리는 태그 — 훑지 않는다 (Sanitizer 의 DROP_TAGS 와 같음) */
const LEGACY_SKIP_TAGS = new Set(['script', 'style', 'iframe', 'embed', 'meta', 'link', 'title', 'textarea', 'select']);

/**
 * style 문자열을 선언 목록으로 나눈다. 따옴표·괄호 안의 `;`·`:` 는 구분자가 아니며, 첫 `:` 가 이름과 값을 나눈다.
 * 이름은 소문자, 값이 비었거나 STYLE_VALUE_MAX 를 넘으면 버린다.
 * @param {string} style
 * @returns {Array<[string, string]>}
 */
export function parseStyle(style) {
  const out = [];
  let quote = '';
  let depth = 0;
  let start = 0;
  let colon = -1;
  const flush = (end) => {
    if (colon < 0) return;
    const name = style.slice(start, colon).trim().toLowerCase();
    const value = style.slice(colon + 1, end).trim();
    if (name && value && value.length <= STYLE_VALUE_MAX) out.push([name, value]);
  };
  for (let i = 0; i < style.length; i++) {
    const c = style[i];
    if (c === '\\') i++;
    else if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { if (depth > 0) depth--; }
    else if (depth === 0 && c === ':' && colon < 0) colon = i;
    else if (depth === 0 && c === ';') { flush(i); start = i + 1; colon = -1; }
  }
  flush(style.length);
  return out;
}

/**
 * 값을 공백으로 나눈다 (괄호 안 공백은 나누지 않음 — rgb(0, 0, 0))
 * @param {string} value
 * @returns {string[]}
 */
function splitTokens(value) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    const space = c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
    if (space && depth === 0) {
      if (start >= 0) { out.push(value.slice(start, i)); start = -1; }
    } else {
      if (start < 0) start = i;
      if (c === '(') depth++;
      else if (c === ')' && depth > 0) depth--;
    }
  }
  if (start >= 0) out.push(value.slice(start));
  return out;
}

/**
 * px·pt·mm·cm 길이를 px 숫자로 (반올림 전)
 * @param {string} value
 * @returns {number|null} 형식이 다르면 null
 */
function lengthPx(value) {
  const m = value.match(PX_PT_LENGTH);
  if (!m || !m[1]) return null;
  return Number(m[1]) * PX_PER_UNIT[m[2].toLowerCase()];
}

/**
 * 소수 둘째 자리까지 반올림한 숫자 글자 (뒤의 0 없음)
 * @param {number} v
 * @returns {string}
 */
function round2(v) {
  return String(Math.round(v * 100) / 100);
}

/**
 * font-size 를 px 글자로: px·pt·mm·cm·rem → 반올림, 8~96px 로 맞춤
 * @param {string} value
 * @returns {string|null} em·% 등 그 밖은 null
 */
function fontSizePx(value) {
  const rem = value.match(FONT_REM);
  const px = rem && rem[1] ? Number(rem[1]) * 16 : lengthPx(value);
  return px == null ? null : `${Math.min(FONT_PX_MAX, Math.max(FONT_PX_MIN, Math.round(px)))}px`;
}

/**
 * line-height 정규화: 단위 없는 수 0.5~5, 50~500%, px·pt → px(8~200). 다시 조립하므로 값이 style 을 벗어날 수 없다
 * @param {string} value
 * @returns {string|null} 그 밖은 null
 */
function lineHeightValue(value) {
  const m = value.match(LINE_HEIGHT);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!unit) return n >= 0.5 && n <= 5 ? String(n) : null;
  if (unit === '%') return n >= 50 && n <= 500 ? `${n}%` : null;
  const px = Math.round(n * PX_PER_UNIT[unit]);
  return px >= 8 && px <= 200 ? `${px}px` : null;
}

/**
 * margin-left·text-indent 정규화: px·pt·mm·cm → 정수 px, 범위 안만 (다시 조립하므로 값이 style 을 벗어날 수 없다)
 * @param {string} value
 * @param {boolean} negative 음수 허용 (text-indent 의 내어쓰기)
 * @returns {string|null} 범위·단위 밖이면 null
 */
function indentValue(value, negative) {
  if (value === '0') return '0px';
  const m = value.match(INDENT_LENGTH);
  if (!m || !m[2] || (m[1] && !negative)) return null;
  const px = Math.round(Number(m[2]) * PX_PER_UNIT[m[3].toLowerCase()]);
  if (px > INDENT_PX_MAX) return null;
  return `${m[1] && px ? -px : px}px`;
}

/**
 * letter-spacing 정규화: px·pt → px(소수 둘째 자리, -10~20), em(-1~2). 0 은 기본값이라 지움
 * @param {string} value
 * @returns {string|null} 그 밖은 null
 */
function letterSpacingValue(value) {
  const m = value.match(LETTER_SPACING);
  if (!m || !m[2]) return null;
  const n = Number(m[2]) * (m[1] ? -1 : 1);
  const unit = m[3].toLowerCase();
  if (unit === 'em') return n !== 0 && n >= -1 && n <= 2 ? `${n}em` : null;
  const px = Math.round(n * PX_PER_UNIT[unit] * 100) / 100;
  return px !== 0 && px >= -10 && px <= 20 ? `${px}px` : null;
}

/** 테두리 폭 정규화: 키워드, 0, px·pt·mm·cm (0~20px, 소수 둘째 자리까지 실제 값, 0 초과인데 0.01 미만이면 0.01px). 어긋나면 null */
function borderWidth(value) {
  if (BORDER_WIDTH_WORD.test(value)) return value.toLowerCase();
  if (value === '0') return '0px';
  const px = lengthPx(value);
  if (px == null || px > BORDER_PX_MAX) return null;
  if (px === 0) return '0px';
  return `${px < 0.01 ? '0.01' : round2(px)}px`;
}

/** 테두리 단축값 정규화: 토큰 3개 이하, 폭·스타일·색 각 하나까지. 어긋나면 null */
function borderShorthand(value) {
  const tokens = splitTokens(value);
  if (!tokens.length || tokens.length > 3) return null;
  let width = null;
  let style = null;
  let color = null;
  for (const t of tokens) {
    const w = borderWidth(t);
    if (w) { if (width) return null; width = w; }
    else if (BORDER_STYLE_WORD.test(t)) { if (style) return null; style = t.toLowerCase(); }
    else if (SAFE_COLOR.test(t)) { if (color) return null; color = t; }
    else return null;
  }
  return [width, style, color].filter(Boolean).join(' ');
}

/** background 단축값에서 첫 색을 찾는다. 없으면 null */
function backgroundColor(value) {
  return splitTokens(value).find((t) => SAFE_COLOR.test(t) && !BG_KEYWORDS.has(t.toLowerCase())) || null;
}

/**
 * style 선언 하나를 옛 형식 규칙으로 변환한다
 * @param {string} name 소문자 속성 이름
 * @param {string} value
 * @param {string} tag 그 style 을 가진 요소의 태그 (소문자)
 * @param {string[]} families 글꼴 허용 목록
 * @returns {[string, string]|null|undefined} 변환 결과, null 이면 지움, undefined 면 이 규칙 대상이 아님(일반 허용 검사로)
 */
export function cleanLegacyDecl(name, value, tag, families) {
  const cell = tag === 'td' || tag === 'th';
  if (name === 'font-family') {
    const family = storedFontName(value, families);
    return family ? [name, fontFamilyValue(family)] : null;
  }
  if (name === 'font-size') {
    const size = fontSizePx(value);
    return size ? [name, size] : null;
  }
  if (name === 'line-height') {
    const v = lineHeightValue(value);
    return v ? [name, v] : null;
  }
  if (name === 'letter-spacing') {
    const v = letterSpacingValue(value);
    return v ? [name, v] : null;
  }
  if ((name === 'width' || name === 'height') && LEGACY_TABLE_TAGS.has(tag) && /(pt|mm|cm)$/i.test(value)) {
    const px = lengthPx(value);
    return px == null ? null : [name, `${Math.round(px)}px`];
  }
  if (name === 'background') {
    const color = LEGACY_TABLE_TAGS.has(tag) || tag === 'span' ? backgroundColor(value) : null;
    return color ? ['background-color', color] : null;
  }
  if (name === 'margin-left' || name === 'margin-right') { // 표 가운데 정렬(align=center)의 값, 글 블록의 왼쪽 들여쓰기
    if (name === 'margin-left' && INDENT_TAGS.has(tag)) { const v = indentValue(value, false); return v ? [name, v] : null; }
    return tag === 'table' && /^auto$/i.test(value) ? [name, 'auto'] : null;
  }
  if (name === 'text-indent') { // 첫 줄 들여쓰기 (음수는 내어쓰기) — HWP·워드
    const v = INDENT_TAGS.has(tag) ? indentValue(value, true) : null;
    return v ? [name, v] : null;
  }
  if (name === 'border-collapse') {
    return tag === 'table' && /^(collapse|separate)$/i.test(value) ? [name, value.toLowerCase()] : null;
  }
  if (BORDER_SHORTHAND.test(name)) {
    const v = cell ? borderShorthand(value) : null;
    return v ? [name, v] : null;
  }
  const part = name.match(BORDER_PART);
  if (part) {
    if (!cell) return null;
    if (part[1] === 'width') { const w = borderWidth(value); return w ? [name, w] : null; }
    if (part[1] === 'style') return BORDER_STYLE_WORD.test(value) ? [name, value.toLowerCase()] : null;
    return SAFE_COLOR.test(value) ? [name, value] : null;
  }
  return undefined;
}

/**
 * 옛 속성을 style 선언으로 옮긴다. style 에 이미 있는 속성은 style 이 우선. 값은 검사를 통과한 것만 쓴다(세미콜론 주입 방지).
 * @param {Element} el
 * @param {string} tag
 * @param {string[]} families
 */
function moveLegacyAttrs(el, tag, families) {
  const pairs = [];
  const attr = (name) => (el.getAttribute(name) ?? '').trim();
  if (tag === 'font') {
    if (SAFE_COLOR.test(attr('color'))) pairs.push(['color', attr('color')]);
    if (/^[1-7]$/.test(attr('size'))) pairs.push(['font-size', `${FONT_TAG_SIZES[+attr('size') - 1]}px`]);
    const family = storedFontName(attr('face'), families);
    if (family) pairs.push(['font-family', fontFamilyValue(family)]);
  } else if (LEGACY_TABLE_TAGS.has(tag)) {
    if (SAFE_COLOR.test(attr('bgcolor'))) pairs.push(['background-color', attr('bgcolor')]);
    if (tag === 'table') {
      if (/^center$/i.test(attr('align'))) pairs.push(['margin-left', 'auto'], ['margin-right', 'auto']); // 표 위치 — text-align 으로 옮기면 칸 글자가 가운데로 간다. left·right 는 지움
      if (attr('border') === '0' && !el.hasAttribute('data-border')) el.setAttribute('data-border', '0');
    } else if (/^(left|center|right|justify)$/i.test(attr('align'))) pairs.push(['text-align', attr('align').toLowerCase()]);
    if (/^(top|middle|bottom)$/i.test(attr('valign'))) pairs.push(['vertical-align', attr('valign').toLowerCase()]);
    ['width', 'height'].forEach((n) => {
      const v = attr(n);
      if (LENGTH_ATTR.test(v)) pairs.push([n, /\d$/.test(v) ? `${v}px` : v]);
    });
  } else if (ALIGN_BLOCK_TAGS.has(tag) && /^(left|center|right|justify)$/i.test(attr('align'))) {
    pairs.push(['text-align', attr('align').toLowerCase()]);
  }
  if (!pairs.length) return;
  const style = el.getAttribute('style') || '';
  const has = new Set(parseStyle(style).map(([n]) => (n === 'background' ? 'background-color' : n)));
  const add = pairs.filter(([n]) => !has.has(n)).map(([n, v]) => `${n}: ${v}`);
  if (add.length) el.setAttribute('style', style ? `${add.join('; ')}; ${style}` : add.join('; '));
}

/**
 * style 의 마지막 유효 font-weight 판정
 * @param {string|null} style
 * @returns {boolean|null} 굵게 true, 해제 false, 지정 없음 null
 */
function boldState(style) {
  let bold = null;
  if (style) parseStyle(style).forEach(([n, v]) => { if (n === 'font-weight') { if (BOLD_VALUE.test(v)) bold = true; else if (NOT_BOLD_VALUE.test(v)) bold = false; } });
  return bold;
}

/**
 * 내려줄 스타일에 요소의 style 을 더한다 (같은 항목은 안쪽이 이김)
 * @param {Map<string,string>|null} pending 항목 → 선언 문자열
 * @param {string|null} style
 * @returns {Map<string,string>|null}
 */
function addPending(pending, style) {
  const out = new Map(pending || []);
  if (style) parseStyle(style).forEach(([n, v]) => { if (PENDING_KEYS[n]) out.set(PENDING_KEYS[n], `${n}: ${v}`); });
  return out.size ? out : null;
}

/**
 * 블록이 직접 지정한 항목은 내려받지 않는다 (블록의 값이 이긴다)
 * @param {Map<string,string>|null} pending
 * @param {string|null} style
 * @returns {Map<string,string>|null}
 */
function dropDeclared(pending, style) {
  if (!pending || !style) return pending;
  const out = new Map(pending);
  parseStyle(style).forEach(([n]) => { if (PENDING_KEYS[n]) out.delete(PENDING_KEYS[n]); });
  return out.size ? out : null;
}

/**
 * 블록을 품은 요소 집합: 블록에서 위로 올라가며 표시한다 (이미 표시한 곳에서 멈춰 선형)
 * @param {HTMLElement} root
 * @returns {Set<Element>}
 */
function elementsWithBlock(root) {
  const marked = new Set();
  root.querySelectorAll([...BOLD_BLOCK_TAGS].join(',')).forEach((b) => {
    for (let a = b.parentElement; a && a !== root && !marked.has(a); a = a.parentElement) marked.add(a);
  });
  return marked;
}

/**
 * style 의 기울임·밑줄·취소선
 * @param {string|null} style
 * @returns {{em: boolean|null, u: boolean, s: boolean}} em: 기울임 true, 해제 false, 지정 없음 null
 */
function decorationsOf(style) {
  const out = { em: null, u: false, s: false };
  if (style) parseStyle(style).forEach(([n, v]) => {
    const value = v.toLowerCase();
    if (n === 'font-style') { if (/^(italic|oblique)\b/.test(value)) out.em = true; else if (value === 'normal') out.em = false; }
    else if (n === 'text-decoration' || n === 'text-decoration-line') { out.u = /\bunderline\b/.test(value); out.s = /\bline-through\b/.test(value); }
  });
  return out;
}

/**
 * font-style·text-decoration 을 em·u·s 로 옮긴다 (굵기→strong 과 같은 방식: 블록과 표·목록 구조는 안쪽으로 넘기고 글 묶음을 감싼다).
 * 이미 그 태그 안이면 감싸지 않고, a 자신의 밑줄은 옮기지 않으며, 버튼 링크·플러그인 블록 자신의 style 은 보지 않는다. 값은 정제에서 style 과 함께 지워진다
 * @param {HTMLElement} root body
 */
function moveDecorations(root) {
  if (!Array.from(root.querySelectorAll('[style]')).some((el) => /font-style|text-decoration/i.test(el.getAttribute('style')))) return;
  const withBlock = elementsWithBlock(root);
  const NONE = { em: false, u: false, s: false };
  const stack = Array.from(root.children, (c) => [c, NONE, NONE]);
  while (stack.length) {
    const [el, want, doneBefore] = stack.pop();
    const tag = el.tagName.toLowerCase();
    if (LEGACY_SKIP_TAGS.has(tag) || (tag === 'a' && el.getAttribute('data-role') === 'button')) continue;
    if (tag === 'div' && el.hasAttribute('data-type')) { for (const c of el.children) stack.push([c, NONE, doneBefore]); continue; }
    const own = decorationsOf(el.getAttribute('style'));
    const next = { em: own.em ?? want.em, u: want.u || (own.u && tag !== 'a'), s: want.s || own.s };
    const done = { em: doneBefore.em || tag === 'em' || tag === 'i', u: doneBefore.u || tag === 'u', s: doneBefore.s || tag === 's' || tag === 'strike' };
    if (BOLD_PASS_TAGS.has(tag)) { for (const c of el.children) stack.push([c, next, done]); continue; }
    const wrap = { em: next.em && !done.em, u: next.u && !done.u, s: next.s && !done.s };
    if (!wrap.em && !wrap.u && !wrap.s) { for (const c of el.children) stack.push([c, NONE, done]); continue; }
    const inside = { em: done.em || wrap.em, u: done.u || wrap.u, s: done.s || wrap.s };
    let run = [];
    const flush = () => {
      if (run.some((n) => n.textContent.trim())) {
        let outer = null;
        let inner = null;
        [['em', wrap.em], ['u', wrap.u], ['s', wrap.s]].forEach(([name, on]) => {
          if (!on) return;
          const e = el.ownerDocument.createElement(name);
          if (inner) inner.appendChild(e); else outer = e;
          inner = e;
        });
        run[0].before(outer);
        run.forEach((n) => inner.appendChild(n));
      }
      run.forEach((n) => { if (n.nodeType === Node.ELEMENT_NODE) stack.push([n, NONE, inside]); });
      run = [];
    };
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) { run.push(n); return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const childTag = n.tagName.toLowerCase();
      if (BOLD_BLOCK_TAGS.has(childTag) || withBlock.has(n)) { flush(); stack.push([n, next, done]); }
      else if (childTag === 'a' && n.getAttribute('data-role') === 'button') flush();
      else if (wrap.em && decorationsOf(n.getAttribute('style')).em === false) { flush(); stack.push([n, { ...next, em: false }, done]); }
      else run.push(n);
    });
    flush();
  }
}

/**
 * 파싱한 문서를 한 번 훑어 옛 형식을 바꾼다: font·표 옛 속성 → style, 굵은 요소의 내용 → strong,
 * 블록을 감싼 font·span → 속성을 지우고(뒤에서 벗겨짐) 안쪽 글자에 span 으로 내려줌(편집기는 블록을 감싼 span 을 다룰 수 없다).
 * 재귀 없이 스택으로 돌고, 감싸기는 묶음마다 한 번이라 선형이다. font 태그 이름은 Sanitizer 별칭이 span 으로 바꾼다.
 * @param {HTMLElement} root body
 * @param {string[]} families 글꼴 허용 목록
 * @param {boolean} keepCaption caption 이 허용 태그인지 (아니면 표 앞 문단으로 — 벗기면 표 안에 글이 남아 다시 파싱할 때 달라진다)
 */
export function normalizeLegacy(root, families, keepCaption) {
  moveDecorations(root);
  const withBlock = elementsWithBlock(root);
  /** [요소, 굵게 해야 함, 이미 굵은 안쪽임, 내려줄 스타일] */
  const stack = [];
  const pushKids = (el, want, done, pending) => { for (const c of el.children) stack.push([c, want, done, pending]); };
  pushKids(root, false, false, null);
  while (stack.length) {
    const [el, inherited, within, down] = stack.pop();
    const tag = el.tagName.toLowerCase();
    if (LEGACY_SKIP_TAGS.has(tag)) continue;
    if (tag === 'caption' && !keepCaption && el.parentElement?.tagName === 'TABLE') {
      const p = el.ownerDocument.createElement('p');
      if (el.hasAttribute('style')) p.setAttribute('style', el.getAttribute('style'));
      while (el.firstChild) p.appendChild(el.firstChild);
      const table = el.parentElement;
      table.parentNode.insertBefore(p, table);
      el.remove();
      stack.push([p, inherited, within, down]);
      continue;
    }
    moveLegacyAttrs(el, tag, families);
    const button = tag === 'a' && el.getAttribute('data-role') === 'button';
    const plugin = tag === 'div' && el.hasAttribute('data-type');
    const host = (tag === 'font' || tag === 'span') && withBlock.has(el);
    const style = el.getAttribute('style');
    const want = !plugin && !button && (inherited || boldState(style) === true);
    const done = within || tag === 'strong' || tag === 'b' || tag === 'th';
    let pending = plugin || button ? null : down;
    if (host) {
      pending = addPending(pending, style);
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
    } else pending = dropDeclared(pending, style);
    if (BOLD_PASS_TAGS.has(tag)) pushKids(el, want, done, pending);
    else if ((want && !done) || pending || host) wrapRuns(el, { bold: want && !done, done, pending, host, withBlock, stack });
    else pushKids(el, false, done || button, null);
  }
}

/**
 * 요소의 인라인 자식 묶음을 strong·span 으로 감싼다. 블록 자식에는 넘기고, 글자 없는 묶음은 감싸지 않는다.
 * 버튼 링크·플러그인 블록은 건드리지 않고, 굵기를 해제한 자식과 이미 strong 인 자식은 strong 밖에 둔다.
 * @param {Element} el
 * @param {{bold: boolean, done: boolean, pending: Map<string,string>|null, host: boolean, withBlock: Set<Element>, stack: Array}} o host 면 벗겨질 요소라 빈 글자도 버린다
 */
function wrapRuns(el, { bold, done, pending, host, withBlock, stack }) {
  let run = [];
  const flush = (before) => {
    if (run.some((n) => n.textContent.trim())) {
      let outer = null;
      let inner = null;
      if (pending) {
        outer = el.ownerDocument.createElement('span');
        outer.setAttribute('style', [...pending.values()].join('; '));
        inner = outer;
      }
      if (bold) {
        const strong = el.ownerDocument.createElement('strong');
        if (inner) inner.appendChild(strong); else outer = strong;
        inner = strong;
      }
      if (outer) { // 내려줄 서식이 없으면(스타일 없는 span·font) 감싸지 않는다
        el.insertBefore(outer, before);
        run.forEach((n) => inner.appendChild(n));
      }
    } else if (host) run.forEach((n) => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });
    run.forEach((n) => { if (n.nodeType === Node.ELEMENT_NODE) stack.push([n, false, done || bold, null]); });
    run = [];
  };
  Array.from(el.childNodes).forEach((n) => {
    if (n.nodeType !== Node.ELEMENT_NODE && n.nodeType !== Node.TEXT_NODE) return;
    const tag = n.nodeType === Node.ELEMENT_NODE ? n.tagName.toLowerCase() : '';
    if (BOLD_BLOCK_TAGS.has(tag) || (tag && withBlock.has(n))) {
      flush(n);
      stack.push([n, bold, done, pending]);
    } else if ((tag === 'a' && n.getAttribute('data-role') === 'button')) {
      flush(n);
      stack.push([n, false, done, null]);
    } else if (bold && (tag === 'strong' || tag === 'b' || (tag && boldState(n.getAttribute('style')) === false))) {
      flush(n);
      stack.push([n, false, true, pending]);
    } else run.push(n);
  });
  flush(null);
}
