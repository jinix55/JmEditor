/**
 * Sanitizer
 * - 외부에서 들어오는 HTML(붙여넣기, setHTML)을 허용 태그/속성만 남기고 정리한다.
 * - XSS 1차 방어. 서버 저장 시에도 반드시 별도 sanitize(jsoup 등) 할 것.
 */
import { normalizeLayout, normalizeSplit, cellsOf, isImageRole } from '../plugins/layout/layout-presets.js';
import { SHAPE_VALUES, COLOR_VALUES, ICON_VALUES, normalizeHex, toneOf } from '../plugins/buttons/button-theme.js';
import { ARIA_ATTRS } from './structure-policy.js';
import { SAFE_COLOR, parseStyle, cleanLegacyDecl, normalizeLegacy } from './legacy-format.js';
import { normalizeFamilies } from './font-policy.js';
import { resolveConfig } from '../config.js';

/** 허용 태그와 각 태그에서 허용하는 속성 */
const ALLOWED = {
  p: ['style'], br: [], strong: [], em: [], u: [], s: [],
  h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'], h6: ['style'],
  ul: ['style'], ol: ['style', 'start'], li: ['style'],
  blockquote: ['style', 'data-style'], // 인용 스타일: box·quote (세로선은 기본값이라 속성 없음)
  a: ['href', 'target', 'rel', 'data-role', 'data-style', 'data-size', 'data-color', 'data-tone', 'data-icon', 'data-icon-pos'], // data-role=button → 버튼 모양 링크 (값 검사는 #cleanButton)
  img: ['src', 'alt', 'width', 'height', 'data-float', 'style', 'loading'], // 글 감싸기: 방향 + 폭(%) — 값 검사는 #cleanImage, loading 은 lazy·eager 만
  table: ['style', 'data-border'], tbody: [], thead: [], colgroup: [], col: ['style', 'span'],
  tr: ['style'], td: ['style', 'colspan', 'rowspan'], th: ['style', 'colspan', 'rowspan'],
  span: ['style'],
  hr: [], // 가로줄: 속성 없음 (#cleanElement 에서 바로 만든다)
};

/** style 속성에서 허용하는 CSS 속성과 값 검사 (글꼴·글자 크기·테두리·background 는 먼저 cleanLegacyDecl 이 처리) */
const ALLOWED_STYLE = {
  'color': (v) => SAFE_COLOR.test(v),
  'background-color': (v) => SAFE_COLOR.test(v),
  'text-align': (v) => /^(left|center|right|justify)$/i.test(v),
  'vertical-align': (v) => /^(top|middle|bottom)$/i.test(v),
  'width': (v) => /^(\d+(\.\d+)?(px|%)|auto)$/i.test(v),
  'height': (v) => /^\d+(\.\d+)?px$/i.test(v),
  'list-style-type': (v) => /^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|hangul|hangul-consonant|none)$/i.test(v),
};

/** 태그 이름 치환 (레거시/외부 태그 → 표준 태그) */
const TAG_ALIAS = { b: 'strong', i: 'em', strike: 's', div: 'p', font: 'span' };

/** src·srcset 에 허용하는 주소: http(s)://, / 로 시작하는 내부 경로(// 와 /\ 제외), 이미지 data:(base64). img 안의 svg 는 스크립트가 실행되지 않아 허용 (서버 HtmlSanitizer 와 같은 규칙) */
const SAFE_URL = /^(https?:\/\/|\/(?![/\\])|data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/i;
/** 주소에 들어가면 안 되는 제어 문자 */
const URL_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** href·srcset(data: 제외) 값 길이 상한 — 넘으면 그 속성(srcset 은 그 source)을 버린다 (서버 URL_MAX 와 같음) */
const URL_MAX = 8192;
/** 붙여넣기에서 항상 뺄 class 토큰 (오피스·브라우저 생성 이름) */
const PASTE_JUNK_CLASS = /^(Mso.*|Apple-.*)$/;
/** 오피스 원본일 때만 뺄 class 토큰 (font14 같은 퍼블 이름과 겹칠 수 있음) */
const PASTE_OFFICE_CLASS = /^(xl\d+|font\d+)$/;
/** 붙여넣은 원본 HTML 의 오피스 흔적 */
const OFFICE_MARK = /mso-|urn:schemas-microsoft-com|ProgId/i;
/** 자식까지 통째로 버리는 태그: 위험 태그 + 글이 본문에 새면 안 되는 문서 머리·폼 입력 (서버 HtmlSanitizer 와 같음) */
const DROP_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link', 'title', 'textarea', 'select'];
/** 닫는 태그가 없으면 뒤 글을 통째로 삼키는 태그 — 파싱 전에 그 여는 태그만 지운다 (서버와 같은 규칙) */
const SWALLOW_TAG = /<(\/?)(textarea|title|select)(?=[ \t\n\f\r\/>])[^>]*>/gi;
/** 요소 중첩 깊이 상한 — 그보다 깊은 요소는 벗기고 글만 남긴다 (서버 DEPTH_MAX 와 같음) */
const DEPTH_MAX = 256;
/** 파싱 전 입력에서 허용하는 태그 순 열림(이름별 열림 − 닫힘의 합계) — 넘은 뒤의 여는 태그는 파싱 전에 지운다 */
const PARSE_OPEN_MAX = 20000;
/** 닫는 태그를 생략할 수 있어 순 열림에 세지 않는 태그 (파서가 저절로 닫아 중첩이 쌓이지 않음) */
const IMPLIED_END_TAGS = new Set(['p', 'li', 'td', 'th', 'tr', 'dt', 'dd', 'option', 'optgroup', 'thead', 'tbody', 'tfoot', 'colgroup', 'caption', 'body', 'html', 'head']);
/** 이 안에서 연 서식 태그를 자기 닫는 태그가 함께 닫는 생략 가능 태그 */
const FORMAT_CLOSERS = new Set(['p', 'li', 'td', 'th', 'dt', 'dd']);
/** 서식 태그: 바깥 블록이 닫히면 함께 닫히고 파서가 재구성해도 중첩이 쌓이지 않는다 */
const FORMAT_TAGS = new Set(['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u']);
/** 여는 순간 열린 p 를 닫는 블록 태그 — 그 뒤의 닫는 p 는 서식 태그를 닫지 못한다 */
const P_CLOSING_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'listing', 'main', 'menu', 'nav', 'ol', 'plaintext', 'pre', 'search', 'section', 'summary', 'table', 'ul', 'xmp']);
/** table 하나의 순 열림 값: 파서가 tbody·tr·td 까지 함께 쌓고 표 중첩은 깊이도 줄이지 않는다 */
const TABLE_WEIGHT = 4;
/** 서식 태그의 순 열림 값: 닫지 않고 쌓으면 파서 깊이를 줄이지 못한 채 형제 노드까지 늘어 느리다 */
const FORMAT_WEIGHT = 2;
/** 안이 열려 있으면 다른 이름의 닫는 태그가 먹지 않는 태그 — 그 닫는 태그는 순 열림에서 빼지 않는다 ("<div><object></div>" 반복이 한도를 빠져나가지 못하게) */
const SCOPE_BARRIERS = new Set(['object', 'applet', 'marquee']);
/** 순 열림에 세지 않는 빈 태그 */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** 이미지 loading 속성 허용 값 */
const IMG_LOADING = ['lazy', 'eager'];
/** source[type] 허용 값 (이미지 형식만) */
const SOURCE_TYPE = /^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/;
/** srcset 후보 하나: 주소(공백·쉼표 없음) + 선택 서술자(폭 `640w` 또는 배율 `2x`) */
const SRCSET_CANDIDATE = /^([^ ,]+)(?: (\d+w|\d+(?:\.\d+)?x))?$/;
/** picture 하나에 둘 수 있는 source 최대 개수, srcset 후보 최대 개수, media 최대 길이 */
const PICTURE_SOURCE_MAX = 4;
const SRCSET_MAX = 4;
const MEDIA_MAX = 200;
/** href(링크)에 허용하는 주소: http(s)·mailto·tel·# 와 / 로 시작하는 내부 경로 (// 와 /\ 같은 외부 주소 우회는 제외) */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|#|\/(?![/\\]))/i;

/** 플러그인 블록 종류 — 구조 정책을 적용하지 않는다(블록마다 정해진 형식 그대로) */
const PLUGIN_TYPES = ['gallery', 'slider', 'buttons', 'youtube', 'layout', 'map'];
/** 플러그인 블록 선택자 (div[data-type=…]) — 안의 요소는 블록 형식·런타임 몫이라 id 숨김에서 건드리지 않는다 */
const PLUGIN_BLOCK_SELECTOR = PLUGIN_TYPES.map((t) => `div[data-type="${t}"]`).join(', ');
/** 가로줄을 담을 수 없는 요소: 문단·제목·글자 서식 — 저장 HTML 을 다시 파싱하면 구조가 바뀌므로 hr 을 밖으로 꺼낸다 */
const HR_SPLIT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 's', 'span', 'a', 'small', 'sub', 'sup']);
/** 편집·미리보기 화면에서 본문 id 를 보관하는 속성 (getHTML 이 id 로 되돌림) */
export const HIDDEN_ID_ATTR = 'data-jm-id';
/** 구조 모드에서 새로 허용한 태그가 가질 수 있는 속성 (class 는 따로) */
const STRUCTURE_ATTRS = ['style'];
/** th[scope] 허용 값 (구조 모드) */
const TH_SCOPES = ['row', 'col', 'rowgroup', 'colgroup'];

/** 오피스 머리 style 의 class 서식을 옮길 요소 */
const OFFICE_STYLE_TARGETS = 'table, tr, td, th, col, font';
/** 서식 옮기기 상한 (악성 문서가 규칙을 겹쳐 글자 수를 불리지 못하게): 규칙 하나의 길이, 요소 하나에 적용할 규칙 수, 붙여넣기 한 번에 옮길 총 글자 수 */
const OFFICE_RULE_BODY_MAX = 4096;
const OFFICE_RULES_PER_ELEMENT = 16;
const OFFICE_CLASSES_PER_ELEMENT = 16;
const OFFICE_INLINE_BUDGET = 8 * 1024 * 1024;

/**
 * CSS 글에서 class 규칙(.a, td.a)만 뽑는다. 복잡한 선택자·@규칙·태그 규칙은 버린다 (indexOf 로 훑어 입력 길이에 선형)
 * @param {string} css
 * @returns {Map<string, Array<{body: string, order: number}>>} "태그.class"(태그 없으면 ".class") → 뒤쪽 규칙 OFFICE_RULES_PER_ELEMENT 개
 */
function parseClassRules(css) {
  const rules = new Map();
  const text = css.split('\x3C!--').join('').split('-->').join('');
  let plain = '';
  for (let at = 0; at < text.length;) { // 주석 제거 (닫히지 않으면 끝까지 주석)
    const open = text.indexOf('/*', at);
    if (open < 0) { plain += text.slice(at); break; }
    plain += text.slice(at, open);
    const close = text.indexOf('*/', open + 2);
    if (close < 0) break;
    at = close + 2;
  }
  let order = 0;
  for (let at = 0; ;) {
    const open = plain.indexOf('{', at);
    if (open < 0) break;
    const close = plain.indexOf('}', open);
    if (close < 0) break;
    const body = plain.slice(open + 1, close);
    if (body.length <= OFFICE_RULE_BODY_MAX) plain.slice(at, open).split(',').forEach((sel) => {
      const m = /^([a-z][a-z0-9]*)?\.([\w-]+)$/i.exec(sel.trim());
      if (!m) return;
      const key = `${(m[1] || '').toLowerCase()}.${m[2]}`;
      if (!rules.has(key)) rules.set(key, []);
      const list = rules.get(key);
      list.push({ body, order: order++ });
      if (list.length > OFFICE_RULES_PER_ELEMENT) list.shift(); // 칸마다 훑는 양이 입력 크기에 비례하지 않게
    });
    at = close + 1;
  }
  return rules;
}

export class Sanitizer {
  /** 지금 정리 중인 구조 정책 (clean 호출 동안만, null 이면 기본 규칙) */
  static #policy = null;
  /** 지금 정리 중인 요소의 깊이 (clean 호출 동안만) */
  static #depth = 0;
  /** 지금 정리에 쓰는 글꼴 허용 목록 (clean 호출 동안만, null 이면 설정값) */
  static #fonts = null;

  /**
   * HTML 문자열을 정리하여 반환
   * @param {string} html
   * @param {ReturnType<typeof import('./structure-policy.js').makeStructurePolicy>} [policy] 퍼블 구조 정책 (없으면 기본 규칙)
   * @param {string[]} [families] 글꼴 허용 목록 (없으면 window.JmEditorConfig.font > 기본값)
   * @returns {string}
   */
  static clean(html, policy = null, families = null) {
    const prev = Sanitizer.#fonts;
    Sanitizer.#fonts = Sanitizer.#families(families);
    try { return Sanitizer.#withPolicy(policy, () => Sanitizer.#cleanRoot(html)); } finally { Sanitizer.#fonts = prev; }
  }

  /** 글꼴 허용 목록 정리 (인자 > 설정) */
  static #families(families) {
    return normalizeFamilies(families ?? resolveConfig('font').families);
  }

  /** 정책을 잠시 바꿔 실행 (중첩 호출에도 원래대로 복구) */
  static #withPolicy(policy, fn) {
    const prev = Sanitizer.#policy;
    Sanitizer.#policy = policy || null;
    try { return fn(); } finally { Sanitizer.#policy = prev; }
  }

  static #cleanRoot(html) {
    Sanitizer.#depth = 0;
    const doc = new DOMParser().parseFromString(`<body>${Sanitizer.#limitOpenTags(Sanitizer.#dropUnclosedTags(String(html)))}</body>`, 'text/html');
    normalizeLegacy(doc.body, Sanitizer.#fonts, !!Sanitizer.#policy?.tags.has('caption'));
    const frag = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) return; // 최상위 공백 텍스트(블록 사이 줄바꿈) 제거
      const r = Sanitizer.#cleanNode(n);
      if (r) frag.appendChild(r);
    });
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    Sanitizer.#settleHrs(wrap);
    Sanitizer.dedupeIds(wrap);
    return wrap.innerHTML;
  }

  /**
   * 가로줄 자리 잡기: 플러그인 블록 안이면 버리고, 문단·제목·글자 서식 안이면 그 요소를 hr 앞뒤로 나눠 밖으로 꺼낸다 (비게 된 쪽은 지움).
   * 뒤의 hr 부터 처리해 옮기는 노드가 hr 사이 구간뿐이라 선형이다. 서버 settleHrs 와 같은 규칙
   * @param {HTMLElement} root
   */
  static #settleHrs(root) {
    Array.from(root.querySelectorAll('hr')).reverse().forEach((hr) => {
      if (hr.closest(PLUGIN_BLOCK_SELECTOR)) { hr.remove(); return; }
      while (HR_SPLIT_TAGS.has(hr.parentElement.localName)) {
        const before = hr.parentElement;
        const after = before.cloneNode(false);
        while (hr.nextSibling) after.appendChild(hr.nextSibling);
        before.after(hr, after);
        if (!after.firstChild) after.remove();
        if (!before.firstChild) before.remove();
      }
    });
  }

  /**
   * 닫히지 않은 textarea·title·select 여는 태그만 지운다 (파서는 문서 끝까지 뒤 글을 그 안에 넣어, 버림 목록과 만나면 본문이 조용히 사라진다).
   * - textarea·title: 같은 이름의 닫는 태그가 뒤에 없으면 지움. 있으면 거기까지는 태그가 아닌 글이라 건너뛴다
   * - select: 닫는 태그 전에 다른 여는 태그(select·textarea·title)가 오면 지움 (파서가 여기서 select 를 끝내고 앞 글을 버린다)
   * 태그 목록을 먼저 훑어 이름별 마지막 닫는 태그를 알아 두므로 선형 시간. 주석·따옴표는 해석하지 않고, 결과는 다시 파서·정제를 거친다. 서버 dropUnclosedTags 와 같은 규칙
   * @param {string} html
   * @returns {string}
   */
  static #dropUnclosedTags(html) {
    const end = html.lastIndexOf('>') + 1; // 그 뒤에는 완성된 태그가 없다 — 끝까지 찾아보는 일을 막아 선형 유지
    const body = html.slice(0, end);
    const tokens = [];
    const lastClose = {};
    for (const m of body.matchAll(SWALLOW_TAG)) {
      const name = m[2].toLowerCase();
      tokens.push({ close: !!m[1], name, start: m.index, stop: m.index + m[0].length });
      if (m[1]) lastClose[name] = m.index;
    }
    if (!tokens.length) return html;
    const drops = [];
    let inside = null; // 지금 열려 있는 태그
    tokens.forEach((t) => {
      if (inside && inside.name !== 'select') { if (t.close && t.name === inside.name) inside = null; return; }
      if (t.close) { if (t.name === 'select') inside = null; return; }
      if (inside) drops.push(inside); // select 안의 새 여는 태그
      inside = null;
      if ((lastClose[t.name] ?? -1) > t.start) inside = t; else drops.push(t);
    });
    if (!drops.length) return html;
    drops.sort((a, b) => a.start - b.start);
    const parts = [];
    let copied = 0;
    drops.forEach((t) => { parts.push(html.slice(copied, t.start)); copied = t.stop; });
    parts.push(html.slice(copied));
    return parts.join('');
  }

  /**
   * 브라우저 파서가 깊은 중첩에서 이차 시간이라, 파싱 전에 입력을 한 번 훑어 태그 순 열림을 제한한다.
   * 주석·따옴표는 해석하지 않고 이름별 (열림 − 닫힘) 합계만 세며, 합계가 PARSE_OPEN_MAX 에 이르면 그 뒤의 태그를 지운다 (빈 태그·글은 그대로).
   * 저절로 닫히는 태그는 세지 않고, 블록 안에서 연 서식 태그는 그 블록이 닫히면 뺀다 — 큰 정상 문서가 한도에 닿지 않게.
   * 닫는 태그까지 지우는 까닭: 한도에 이른 뒤 남은 닫는 태그만으로도 Chromium 파서가 수십 초 걸린다.
   * 정상 문서는 이 한도에 닿지 않아 그대로 돌아온다. 결과는 다시 파서·정제를 거치므로 보안 경계가 아니다.
   * 서버(HtmlSanitizer)는 jsoup 이 이런 입력을 빠르게 처리해 이 단계가 없다 — 순 열림 2만 초과의 극단 입력에서만 양쪽 결과가 달라질 수 있다(허용).
   * @param {string} html
   * @returns {string}
   */
  static #limitOpenTags(html) {
    const tagStart = /<(\/?)([a-z][^\s/>]*)/gi;
    const open = new Map();
    const parts = [];
    /** 지금 블록을 연 뒤 열어 아직 닫지 않은 서식 태그 (이름별 개수) */
    const formatsInBlock = new Map();
    /** 열려 있다고 보는 FORMAT_CLOSERS */
    const openClosers = new Set();
    let total = 0;
    let barriers = 0; // 열려 있는 SCOPE_BARRIERS 수
    let copied = 0;
    /** 지금 블록 안에서 연 서식 태그를 순 열림에서 뺀다 (블록과 함께 닫혔으므로) */
    const closeFormats = () => {
      formatsInBlock.forEach((c, f) => { open.set(f, open.get(f) - c); total -= c * FORMAT_WEIGHT; });
      formatsInBlock.clear();
    };
    let m;
    while ((m = tagStart.exec(html))) {
      const name = m[2].toLowerCase();
      if (VOID_TAGS.has(name)) continue;
      if (total >= PARSE_OPEN_MAX) {
        const end = html.indexOf('>', tagStart.lastIndex);
        if (end < 0) break;
        parts.push(html.slice(copied, m.index));
        copied = end + 1;
        tagStart.lastIndex = copied;
        continue;
      }
      if (IMPLIED_END_TAGS.has(name)) {
        if (FORMAT_CLOSERS.has(name)) {
          if (!m[1]) { openClosers.add(name); formatsInBlock.clear(); }
          else if (openClosers.delete(name)) closeFormats();
        }
        continue;
      }
      const count = open.get(name) || 0;
      const barrier = SCOPE_BARRIERS.has(name);
      const format = FORMAT_TAGS.has(name);
      const weight = name === 'table' ? TABLE_WEIGHT : (format ? FORMAT_WEIGHT : 1);
      if (!m[1]) {
        open.set(name, count + 1);
        total += weight;
        if (barrier) barriers++;
        if (format) formatsInBlock.set(name, (formatsInBlock.get(name) || 0) + 1);
        else formatsInBlock.clear();
        if (P_CLOSING_TAGS.has(name)) openClosers.delete('p');
      } else if (count > 0 && (barrier || !barriers)) {
        open.set(name, count - 1);
        total -= weight;
        if (barrier) barriers--;
        if (!format) closeFormats();
        else if (formatsInBlock.get(name) > 0) formatsInBlock.set(name, formatsInBlock.get(name) - 1);
      }
    }
    if (!parts.length) return html;
    parts.push(html.slice(copied));
    return parts.join('');
  }

  /**
   * 앞뒤 스페이스(U+0020)만 자른다 — 정규식(^ +| +$)은 공백이 길면 이차 시간이라 인덱스로 찾는다
   * @param {string} s
   * @returns {string}
   */
  static #trimSpaces(s) {
    let from = 0;
    let to = s.length;
    while (from < to && s[from] === ' ') from++;
    while (to > from && s[to - 1] === ' ') to--;
    return s.slice(from, to);
  }

  /**
   * 같은 id 가 두 번 이상 나오면 문서 순서상 첫 번째만 남기고 나머지 요소의 id 를 지운다 (대소문자가 다르면 다른 id)
   * @param {ParentNode} root
   * @param {string} [attr='id'] 검사할 속성 (편집 중에는 data-jm-id)
   */
  static dedupeIds(root, attr = 'id') {
    const seen = new Set();
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const v = el.getAttribute(attr);
      if (seen.has(v)) el.removeAttribute(attr); else seen.add(v);
    });
  }

  /**
   * 화면에 그린 본문(편집 root·미리보기)의 id 를 보관 속성(data-jm-id)으로 옮긴다 — 본문 id 가 관리자 페이지의
   * id·window 전역·CSS #id 와 부딪히지 않게. 플러그인 블록(과 skip 선택자) 안은 런타임이 만든 id(지도 등)가 있어 건드리지 않는다.
   * @param {ParentNode} root
   * @param {string} [skip] 더 건너뛸 선택자 (편집기의 플러그인 레이어 등)
   */
  static hideIds(root, skip = '') {
    const sel = skip ? `${PLUGIN_BLOCK_SELECTOR}, ${skip}` : PLUGIN_BLOCK_SELECTOR;
    root.querySelectorAll('[id]').forEach((el) => {
      if (el.closest(sel)) return;
      el.setAttribute(HIDDEN_ID_ATTR, el.id);
      el.removeAttribute('id');
    });
  }

  /**
   * 구조 모드: id·aria(4종) 를 정책 검사 후 옮긴다 (정책이 없으면 아무것도 하지 않음)
   * @param {Element} el 새로 만든 요소
   * @param {Element} node 원본 요소
   */
  static #copyIdAria(el, node) {
    const pol = Sanitizer.#policy;
    if (!pol) return;
    const id = pol.cleanId(node.getAttribute('id'));
    if (id) el.setAttribute('id', id);
    ARIA_ATTRS.forEach((name) => {
      const v = node.hasAttribute(name) ? pol.cleanAria(name, node.getAttribute(name)) : '';
      if (v) el.setAttribute(name, v);
    });
  }

  /**
   * 구조 모드 아이콘 i: class(허용 토큰)가 남고 글이 없으면(공백만) i 를 그대로 둔다 — class 와 aria-hidden="true" 만 남기고
   * 나머지 속성(id·다른 aria 포함)은 버림 (서버 HtmlSanitizer 와 같은 규칙)
   * @param {Element} node 원본 i
   * @returns {HTMLElement|null} 아이콘이면 정리한 i, 아니면 null(em 으로 바꾸는 기본 규칙)
   */
  static #iconI(node) {
    const pol = Sanitizer.#policy;
    if (!pol || node.textContent.trim() !== '') return null;
    const cls = pol.cleanClass(node.getAttribute('class'));
    if (!cls) return null;
    const el = document.createElement('i');
    el.setAttribute('class', cls);
    const hidden = node.hasAttribute('aria-hidden') ? pol.cleanAria('aria-hidden', node.getAttribute('aria-hidden')) : '';
    if (hidden) el.setAttribute('aria-hidden', hidden);
    Array.from(node.childNodes).forEach((c) => { const r = Sanitizer.#cleanNode(c); if (r) el.appendChild(r); });
    return el;
  }

  /**
   * 붙여넣기 전용: 오피스 문서가 머리 style 의 class 에 둔 표 서식을 칸의 style 로 옮긴다 (정제 전에 적용, 값 검사는 정제가 맡음).
   * 엑셀은 테두리·배경을 .xl65 같은 class 로만 주므로 옮기지 않으면 사라진다. 표 요소와 font 의 class 규칙만 옮기고
   * (td 같은 태그 규칙은 모든 칸에 글자색·크기를 고정하고, p 규칙은 본문 문단을 바꾸므로 제외) 칸에 직접 쓴 값이 우선한다.
   * @param {string} html 붙여넣은 원본 HTML
   * @returns {string} 오피스 문서가 아니거나 옮길 규칙이 없으면 원본 그대로
   */
  static inlineOfficeStyles(html) {
    if (!OFFICE_MARK.test(html) || !html.includes('<style')) return html;
    const doc = new DOMParser().parseFromString(Sanitizer.#limitOpenTags(Sanitizer.#dropUnclosedTags(html)), 'text/html'); // 스크립트가 실행되지 않는 문서
    const rules = parseClassRules(Array.from(doc.querySelectorAll('style'), (s) => s.textContent).join('\n'));
    if (!rules.size) return html;
    let budget = OFFICE_INLINE_BUDGET;
    doc.querySelectorAll(OFFICE_STYLE_TARGETS).forEach((el) => {
      if (budget <= 0) return; // 상한을 넘으면 나머지 칸은 서식 없이
      const tag = el.localName;
      const found = Array.from(el.classList).slice(0, OFFICE_CLASSES_PER_ELEMENT).flatMap((c) => [...(rules.get(`.${c}`) || []), ...(rules.get(`${tag}.${c}`) || [])]);
      if (!found.length) return;
      const decls = found.sort((a, b) => a.order - b.order).slice(-OFFICE_RULES_PER_ELEMENT).map((r) => r.body);
      const own = el.getAttribute('style');
      if (own) decls.push(own);
      const style = decls.join(';');
      budget -= style.length;
      el.setAttribute('style', style);
    });
    return doc.body.innerHTML;
  }

  /**
   * 붙여넣기 전용: 오피스·브라우저가 붙인 class 토큰을 뺀다 (정제를 마친 HTML 에 적용). Mso*·Apple-* 는 항상,
   * xl숫자·font숫자는 원본에 오피스 흔적이 있을 때만. setHTML·HTML 보기 경로에서는 쓰지 않는다
   * @param {string} html 정제한 HTML
   * @param {string} [source] 붙여넣은 원본 HTML
   * @returns {string}
   */
  static stripPasteClasses(html, source = '') {
    if (!html.includes('class=')) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const office = OFFICE_MARK.test(source);
    tpl.content.querySelectorAll('[class]').forEach((el) => {
      const kept = Array.from(el.classList).filter((c) => !PASTE_JUNK_CLASS.test(c) && !(office && PASTE_OFFICE_CLASS.test(c)));
      if (kept.length) el.setAttribute('class', kept.join(' ')); else el.removeAttribute('class');
    });
    return tpl.innerHTML;
  }

  /**
   * 링크 주소가 허용 형식인지 (javascript:·data: 등 차단, 제어 문자 포함 시 차단, 8192자 초과 차단)
   * @param {string} url
   * @returns {boolean}
   */
  static isSafeHref(url) {
    const raw = String(url ?? '');
    const v = raw.trim();
    return raw.length <= URL_MAX && !!v && !URL_CONTROL_CHARS.test(v) && SAFE_HREF.test(v);
  }

  /**
   * 이미지 주소(src)가 허용 형식인지: http(s)://, 내부 경로, 이미지 data: 만. 제어 문자 포함 시 차단
   * @param {string} url
   * @returns {boolean}
   */
  static isSafeUrl(url) {
    const v = String(url ?? '').trim();
    return !!v && !URL_CONTROL_CHARS.test(v) && SAFE_URL.test(v);
  }

  /**
   * 새 창으로 열지 않는 링크인지: 같은 페이지 앵커(#…)·전화(tel:)·메일(mailto:) 은 새 창이 필요 없다 (대소문자 무시)
   * @param {string} href
   * @returns {boolean}
   */
  static isInPageHref(href) {
    return /^(#|tel:|mailto:)/i.test(String(href ?? '').trim());
  }

  /**
   * 링크 종류에 맞게 target·rel 을 맞춘다: #·tel:·mailto: 는 두 속성을 없애고, 나머지는 새 창 + noopener
   * (편집 중에는 주소가 data-jm-href 에 있어 href 를 인자로 받는다)
   * @param {HTMLAnchorElement} a
   * @param {string} href 링크 주소
   */
  static applyLinkTarget(a, href) {
    if (Sanitizer.isInPageHref(href)) { a.removeAttribute('target'); a.removeAttribute('rel'); }
    else { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  }

  /**
   * 사용자가 입력한 링크 주소 정리: 허용 형식이면 그대로, 「example.com/…」 처럼 도메인만 쓰면 https:// 를 붙이고,
   * 그 밖(javascript: 등)은 null
   * @param {string} url
   * @returns {string|null}
   */
  static normalizeHref(url) {
    const v = String(url ?? '').trim();
    if (Sanitizer.isSafeHref(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+([/?#:].*)?$/.test(v) && !/[\u0000-\u001f\u007f\s]/.test(v)) return `https://${v}`;
    return null;
  }

  /**
   * style 문자열 정리: 옛 형식 변환 후 허용 속성·값만 남긴다 (값은 파서가 나눈 그대로 검사하고 다시 조립)
   * @param {string} style
   * @param {string} [tag='span'] 그 style 을 가진 요소의 태그 (표 길이·background·테두리는 표 요소에서만)
   * @param {string[]} [families] 글꼴 허용 목록 (없으면 지금 정리 중인 목록 또는 설정)
   * @returns {string}
   */
  static cleanStyle(style, tag = 'span', families = null) {
    const fonts = families ? normalizeFamilies(families) : (Sanitizer.#fonts || Sanitizer.#families());
    const out = [];
    parseStyle(style).forEach(([name, value]) => {
      const legacy = cleanLegacyDecl(name, value, tag, fonts);
      if (legacy) out.push(`${legacy[0]}: ${legacy[1]}`);
      else if (legacy === undefined && ALLOWED_STYLE[name]?.(value)) out.push(`${name}: ${value}`);
    });
    return out.join('; ');
  }

  /**
   * 노드 단위 재귀 정리
   * - 허용되지 않은 태그는 제거하되 자식 텍스트는 유지(언래핑)
   * - script/style 등 위험 태그는 자식까지 통째로 제거
   * - 깊이 상한(DEPTH_MAX)보다 깊은 요소는 벗기고 글만 남긴다
   */
  static #cleanNode(node) {
    // 텍스트 노드는 그대로
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    if (DROP_TAGS.includes(node.tagName.toLowerCase())) return null;
    if (Sanitizer.#depth >= DEPTH_MAX) return Sanitizer.#textOnly(node);
    Sanitizer.#depth++;
    try { return Sanitizer.#cleanElement(node); } finally { Sanitizer.#depth--; }
  }

  /**
   * 깊이 상한을 넘은 요소: 글만 모은다. 표 중첩처럼 파서가 깊이를 줄이지 않는 입력도 있어 재귀 없이 훑는다 (호출 스택 넘침 방지).
   * @param {Element} node
   * @returns {DocumentFragment}
   */
  static #textOnly(node) {
    const frag = document.createDocumentFragment();
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && DROP_TAGS.includes(n.tagName.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) frag.appendChild(document.createTextNode(walker.currentNode.textContent));
    }
    return frag;
  }

  /**
   * 요소를 벗기고 자식만 정리해 돌려준다. 결과에 남지 않는 요소이므로 깊이에 세지 않는다.
   * @param {Element} node
   * @returns {DocumentFragment}
   */
  static #unwrap(node) {
    Sanitizer.#depth--;
    try { return Sanitizer.#cleanChildren(node); } finally { Sanitizer.#depth++; }
  }

  /**
   * 자식 노드를 정리해 조각으로 모은다
   * @param {Element} node
   * @returns {DocumentFragment}
   */
  static #cleanChildren(node) {
    const frag = document.createDocumentFragment();
    Array.from(node.childNodes).forEach((c) => {
      const r = Sanitizer.#cleanNode(c);
      if (r) frag.appendChild(r);
    });
    return frag;
  }

  /**
   * 요소 하나 정리 (#cleanNode 가 깊이 검사 후 호출)
   * @param {Element} node
   * @returns {Node|null}
   */
  static #cleanElement(node) {
    let tag = node.tagName.toLowerCase();
    const pol = Sanitizer.#policy;
    // 플러그인 블록 안은 구조 정책 없이 (지금 규칙 그대로)
    if (pol && tag === 'div' && PLUGIN_TYPES.includes(node.getAttribute('data-type'))) return Sanitizer.#withPolicy(null, () => Sanitizer.#cleanElement(node));

    // 이미지 갤러리 블록: div[data-type=gallery] 만 예외 허용, 자식은 img 만
    if (tag === 'div' && node.getAttribute('data-type') === 'gallery') {
      const g = document.createElement('div');
      g.setAttribute('data-type', 'gallery');
      // data-cols 는 예전 cover 갤러리 호환용 — 있을 때만 남긴다 (새 갤러리는 쓰지 않음)
      const cols = parseInt(node.getAttribute('data-cols'), 10);
      if (cols >= 1 && cols <= 6) g.setAttribute('data-cols', String(cols));
      if (node.getAttribute('data-auto') === '1') g.setAttribute('data-auto', '1');
      const layout = node.getAttribute('data-layout');
      if (layout === 'justify' || layout === 'cover') g.setAttribute('data-layout', layout);
      const align = node.getAttribute('data-align');
      if (align === 'center' || align === 'right') g.setAttribute('data-align', align);
      // 제목(선택): 첫 번째 p[data-role=title]. 비어 있으면 저장하지 않음
      const title = node.querySelector(':scope > p[data-role="title"]');
      if (title && title.textContent.trim()) {
        const t = Sanitizer.#cleanNode(title);
        if (t && t.nodeType === Node.ELEMENT_NODE) { t.setAttribute('data-role', 'title'); g.appendChild(t); }
      }
      // picture 는 안의 img 한 장으로 줄인다 (picture 안 img 를 따로 또 모으지 않음)
      node.querySelectorAll('img, picture').forEach((el) => {
        if (el.tagName === 'IMG' && el.closest('picture')) return;
        const r = Sanitizer.#blockImage(el);
        if (r) g.appendChild(r);
      });
      return g;
    }

    // 슬라이드 블록: div[data-type=slider] 안에는 제목 p 와 img 만
    if (tag === 'div' && node.getAttribute('data-type') === 'slider') {
      const b = document.createElement('div');
      b.setAttribute('data-type', 'slider');
      const iv = parseInt(node.getAttribute('data-interval'), 10);
      b.setAttribute('data-interval', String(iv >= 0 && iv <= 60000 ? iv : 3000));
      const ratio = node.getAttribute('data-ratio');
      b.setAttribute('data-ratio', ['16:9', '4:3', '1:1', '21:9'].includes(ratio) ? ratio : '16:9');
      const ind = node.getAttribute('data-indicator');
      b.setAttribute('data-indicator', ['dots', 'numbers', 'bars', 'none'].includes(ind) ? ind : 'dots');
      const pos = node.getAttribute('data-indicator-pos');
      b.setAttribute('data-indicator-pos', ['bottom-center', 'bottom-left', 'bottom-right'].includes(pos) ? pos : 'bottom-center');
      const w = node.getAttribute('data-width');
      b.setAttribute('data-width', ['100', '75', '50'].includes(w) ? w : '100');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      const title = node.querySelector(':scope > p[data-role="title"]');
      if (title && title.textContent.trim()) {
        const t = Sanitizer.#cleanNode(title);
        if (t && t.nodeType === Node.ELEMENT_NODE) { t.setAttribute('data-role', 'title'); b.appendChild(t); }
      }
      node.querySelectorAll(':scope > img, :scope > picture').forEach((el) => { const r = Sanitizer.#blockImage(el); if (r) b.appendChild(r); });
      return b;
    }

    // 버튼 그룹 블록: div[data-type=buttons] 안에는 a[data-role=button] 만
    if (tag === 'div' && node.getAttribute('data-type') === 'buttons') {
      const b = document.createElement('div');
      b.setAttribute('data-type', 'buttons');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      node.querySelectorAll(':scope > a').forEach((a) => {
        const r = Sanitizer.#cleanNode(a);
        if (r && r.nodeType === Node.ELEMENT_NODE && r.tagName === 'A') { r.setAttribute('data-role', 'button'); if (!r.getAttribute('data-style')) r.setAttribute('data-style', 'primary'); b.appendChild(r); }
      });
      return b.childNodes.length ? b : null;
    }

    // 유튜브 블록: div[data-type=youtube] + iframe(src 는 youtube embed 주소만)
    if (tag === 'div' && node.getAttribute('data-type') === 'youtube') {
      const iframe = node.querySelector('iframe');
      const m = iframe?.getAttribute('src')?.match(/^https:\/\/www\.(?:youtube|youtube-nocookie)\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/);
      if (!m) return null;
      const b = document.createElement('div');
      b.setAttribute('data-type', 'youtube');
      const w = node.getAttribute('data-width');
      b.setAttribute('data-width', ['100', '75', '50'].includes(w) ? w : '100');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      const f = document.createElement('iframe');
      f.setAttribute('src', `https://www.youtube-nocookie.com/embed/${m[1]}`);
      f.setAttribute('title', 'YouTube video');
      f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      f.setAttribute('allowfullscreen', '');
      b.appendChild(f);
      return b;
    }

    // 이미지+글 배치 블록: div[data-type=layout] 안에는 배치 순서대로 이미지 칸·글 칸만
    if (tag === 'div' && node.getAttribute('data-type') === 'layout') return Sanitizer.#cleanLayout(node);

    // 카카오 지도 블록: 속성만 (안의 내용은 런타임이 그린 것이라 버림)
    if (tag === 'div' && node.getAttribute('data-type') === 'map') return Sanitizer.#cleanMap(node);

    // 모바일 이미지(picture): 구성·source 검사는 #cleanPicture (기본·구조 모드 모두)
    if (tag === 'picture') return Sanitizer.#cleanPicture(node);

    // 가로줄은 속성을 두지 않는다 (구조 모드의 class·id·aria 도)
    if (tag === 'hr') return document.createElement('hr');

    // 구조 모드 아이콘(<i class="ico …"></i>)은 em 으로 바꾸지 않는다
    if (tag === 'i') { const icon = Sanitizer.#iconI(node); if (icon) return icon; }
    // 구조 모드에서 허용한 태그(div 등)는 별칭으로 바꾸지 않는다
    if (!pol?.tags.has(tag)) tag = TAG_ALIAS[tag] || tag;
    const allowed = ALLOWED[tag] || (pol?.tags.has(tag) ? STRUCTURE_ATTRS : null);

    // 허용되지 않은 태그 → 자식만 모아서 반환(언래핑)
    if (!allowed) return Sanitizer.#unwrap(node);

    const el = document.createElement(tag);
    // 구조 모드: class 는 허용 토큰만, th[scope] 는 허용 값만, id·aria 는 정책 검사 통과분만
    if (pol) {
      const cls = pol.cleanClass(node.getAttribute('class'));
      if (cls) el.setAttribute('class', cls);
      if (tag === 'th' && TH_SCOPES.includes(node.getAttribute('scope'))) el.setAttribute('scope', node.getAttribute('scope'));
      Sanitizer.#copyIdAria(el, node);
    }
    // 허용 속성만 복사, URL 프로토콜 검사, style 은 색상 속성만
    allowed.forEach((attr) => {
      const v = node.getAttribute(attr);
      if (v == null) return;
      if (attr === 'href' && !Sanitizer.isSafeHref(v)) return;
      if (attr === 'src' && !Sanitizer.isSafeUrl(v)) return;
      if (attr === 'start' && !/^\d{1,4}$/.test(v)) return;
      if (attr === 'span' && !(/^[1-9]\d{0,3}$/.test(v) && +v <= 1000)) return;
      if (attr === 'loading' && !IMG_LOADING.includes(v)) return;
      if (attr === 'style') {
        const clean = Sanitizer.cleanStyle(v, tag);
        if (clean) el.setAttribute('style', clean);
        return;
      }
      el.setAttribute(attr, v);
    });
    // 속성이 하나도 남지 않은 span 은 의미가 없으므로 언래핑 (구조 모드에서 class·id·aria 가 있으면 남김 — 아이콘·앵커 등)
    if (tag === 'span' && !el.attributes.length) return Sanitizer.#unwrap(node);
    // 링크는 새창 + noopener 강제(#·tel:·mailto: 제외). 버튼 링크 속성은 허용 값만
    if (tag === 'a') {
      Sanitizer.applyLinkTarget(el, el.getAttribute('href') || '');
      if (el.getAttribute('data-role') !== 'button') ['data-role', 'data-style', 'data-size', 'data-color', 'data-tone', 'data-icon', 'data-icon-pos'].forEach((x) => el.removeAttribute(x));
      else Sanitizer.#cleanButton(el, node.getAttribute('style'));
    }
    if (tag === 'img') Sanitizer.#cleanImage(el);
    if (tag === 'blockquote' && !['box', 'quote'].includes(el.getAttribute('data-style'))) el.removeAttribute('data-style');

    Array.from(node.childNodes).forEach((c) => {
      const r = Sanitizer.#cleanNode(c);
      if (r) el.appendChild(r);
    });
    return el;
  }

  /**
   * 버튼 링크 속성 정리: 모양·테마 색·아이콘은 허용 값만, 직접 색은 style 의 --jm-btn(#hex) 만 남기고
   * data-tone 은 그 색의 밝기로 다시 계산 (서버 HtmlSanitizer 와 같은 규칙)
   * @param {HTMLAnchorElement} el 새로 만든 a
   * @param {string|null} rawStyle 원본 style 속성
   */
  static #cleanButton(el, rawStyle) {
    if (!SHAPE_VALUES.includes(el.getAttribute('data-style'))) el.setAttribute('data-style', 'primary');
    if (!['sm', 'lg'].includes(el.getAttribute('data-size'))) el.removeAttribute('data-size');
    if (!COLOR_VALUES.includes(el.getAttribute('data-color')) || el.getAttribute('data-color') === 'blue') el.removeAttribute('data-color');
    if (!ICON_VALUES.includes(el.getAttribute('data-icon'))) el.removeAttribute('data-icon');
    if (!el.hasAttribute('data-icon') || el.getAttribute('data-icon-pos') !== 'right') el.removeAttribute('data-icon-pos');
    el.removeAttribute('data-tone');
    el.removeAttribute('style');
    const m = (rawStyle || '').match(/(?:^|;)\s*--jm-btn\s*:\s*([^;]+)/i);
    const hex = m && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(m[1].trim()) ? normalizeHex(m[1]) : null;
    if (hex) {
      el.removeAttribute('data-color'); // 직접 색이 테마 색보다 우선
      el.setAttribute('style', `--jm-btn: ${hex}`);
      if (toneOf(hex) === 'light') el.setAttribute('data-tone', 'light');
    }
  }

  /**
   * 갤러리·슬라이드 칸용: img 면 그대로 정제, picture 면 안의 첫 img 만 정제해 돌려준다 (source 는 버림)
   * @param {Element} el img 또는 picture
   * @returns {Node|null}
   */
  static #blockImage(el) {
    const img = el.tagName === 'PICTURE' ? Array.from(el.children).find((c) => c.tagName === 'IMG') : el;
    return img ? Sanitizer.#cleanNode(img) : null;
  }

  /**
   * picture 정리: 자식은 source(최대 4개, 규칙 통과분) 다음 img 1개. img 가 없으면 통째로 버리고(null),
   * img 뒤의 자식은 버린다. 남는 source 가 없으면 picture 를 벗기고 img 만 돌려준다. 구조 모드면 picture 의 class 허용 토큰만 남긴다.
   * @param {Element} node picture
   * @returns {Element|null} picture, img(source 없을 때), 또는 null
   */
  static #cleanPicture(node) {
    const kids = Array.from(node.children);
    const imgAt = kids.findIndex((c) => c.tagName === 'IMG');
    if (imgAt < 0) return null;
    const img = Sanitizer.#cleanNode(kids[imgAt]);
    if (img.nodeType !== Node.ELEMENT_NODE) return null; // 깊이 상한으로 img 가 벗겨지면 picture 도 버린다
    const sources = [];
    for (const c of kids.slice(0, imgAt)) {
      if (sources.length >= PICTURE_SOURCE_MAX) break;
      const s = c.tagName === 'SOURCE' ? Sanitizer.#cleanSource(c) : null;
      if (s) sources.push(s);
    }
    if (!sources.length) return img;
    const pic = document.createElement('picture');
    const cls = Sanitizer.#policy?.cleanClass(node.getAttribute('class'));
    if (cls) pic.setAttribute('class', cls);
    Sanitizer.#copyIdAria(pic, node);
    sources.forEach((s) => pic.appendChild(s));
    pic.appendChild(img);
    return pic;
  }

  /**
   * source 정리: srcset(필수)·media 가 규칙에 어긋나면 source 를 버리고(null), type 이 어긋나면 속성만 지운다. 그 밖의 속성은 모두 버린다.
   * 빈 media 는 속성이 없는 것과 같아 지운다.
   * @param {Element} node source
   * @returns {HTMLElement|null}
   */
  static #cleanSource(node) {
    const srcset = Sanitizer.cleanSrcset(node.getAttribute('srcset'));
    if (srcset == null) return null;
    const media = node.getAttribute('media');
    if (media && !Sanitizer.isSafeMedia(media)) return null;
    const s = document.createElement('source');
    if (media) s.setAttribute('media', media);
    s.setAttribute('srcset', srcset);
    const type = node.getAttribute('type');
    if (type && SOURCE_TYPE.test(type)) s.setAttribute('type', type);
    return s;
  }

  /**
   * srcset 값 검사·정규화: 후보 1~4개(`, ` 로 구분), 후보 = 주소 + 선택 서술자(`640w`·`2x`).
   * 주소는 img src 와 같은 SAFE_URL 이어야 하고, data: 주소는 후보가 1개일 때만 허용한다(쉼표 구분이 모호해짐).
   * 제어 문자·앞뒤 공백·대문자 프로토콜까지 고려하며, 하나라도 어긋나면 null. data: 가 아닌 값은 8192자까지.
   * @param {string|null} value
   * @returns {string|null} 후보를 `, ` 로 이은 정규화 문자열, 아니면 null
   */
  static cleanSrcset(value) {
    const raw = String(value ?? '');
    if (URL_CONTROL_CHARS.test(raw)) return null;
    const v = Sanitizer.#trimSpaces(raw);
    if (!v) return null;
    if (raw.length > URL_MAX && !/^data:/i.test(v)) return null;
    // data: 주소는 통째로 후보 1개 (그 안의 쉼표는 base64 구분자 하나뿐이어야 함)
    if (/^data:/i.test(v)) {
      const m = v.match(/^([^ ]+)(?: (\d+w|\d+(?:\.\d+)?x))?$/);
      if (!m || !SAFE_URL.test(m[1]) || m[1].split(',').length !== 2) return null;
      return m[2] ? `${m[1]} ${m[2]}` : m[1];
    }
    const cands = v.split(/, +/).map((c) => Sanitizer.#trimSpaces(c));
    if (cands.length > SRCSET_MAX) return null;
    const out = [];
    for (const c of cands) {
      const m = c.match(SRCSET_CANDIDATE);
      if (!m || !SAFE_URL.test(m[1]) || /^data:/i.test(m[1])) return null;
      out.push(m[2] ? `${m[1]} ${m[2]}` : m[1]);
    }
    return out.join(', ');
  }

  /**
   * source[media] 검사: 200자 이하, 영문·숫자·공백·`( ) : , . -` 만, `url(` 금지
   * @param {string} value
   * @returns {boolean}
   */
  static isSafeMedia(value) {
    const v = String(value ?? '');
    return v.length > 0 && v.length <= MEDIA_MAX && /^[a-z0-9 \t\n\f\r():,.\-]+$/i.test(v) && !/url\s*\(/i.test(v);
  }

  /** 글 감싸기 이미지: data-float 는 left/right, style 은 width 10~100% 만 */
  static #cleanImage(img) {
    if (!['left', 'right'].includes(img.getAttribute('data-float'))) img.removeAttribute('data-float');
    const m = (img.getAttribute('style') || '').match(/(?:^|;)\s*width:\s*(\d{1,3})%/);
    const w = m ? +m[1] : 0;
    if (w >= 10 && w <= 100) img.setAttribute('style', `width: ${w}%`);
    else img.removeAttribute('style');
  }

  /**
   * 카카오 지도(퍼가기) 블록: timestamp(숫자)·key(영문·숫자)·높이(300|400|500)·장소명(100자)만 남긴다.
   * 값이 없으면 빈 블록(에디터에서 코드 입력 대기) — 조회 화면에서는 CSS 로 숨김
   * @param {Element} node
   * @returns {HTMLElement}
   */
  static #cleanMap(node) {
    const b = document.createElement('div');
    b.setAttribute('data-type', 'map');
    b.setAttribute('data-provider', 'kakao-roughmap');
    const ts = node.getAttribute('data-timestamp') || '';
    const key = node.getAttribute('data-key') || '';
    if (/^\d{10,16}$/.test(ts) && /^[A-Za-z0-9]{2,32}$/.test(key)) {
      b.setAttribute('data-timestamp', ts);
      b.setAttribute('data-key', key);
    }
    const h = node.getAttribute('data-height');
    b.setAttribute('data-height', ['300', '400', '500'].includes(h) ? h : '400');
    const title = (node.getAttribute('data-title') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (title) b.setAttribute('data-title', title);
    return b;
  }

  /**
   * 배치 블록 정리: preset·variant 는 허용 값(아니면 기본값), split 은 20~80 의 5 배수만.
   * 칸은 variant 의 저장 순서대로 다시 세우고, 모자라면 빈 칸을 채우고 넘치면 버린다.
   * 이미지 칸은 img 1장만, 글 칸에는 표·이미지·iframe·블록(div)을 넣지 않는다. (서버 HtmlSanitizer 와 같은 규칙)
   */
  static #cleanLayout(node) {
    const { preset, variant } = normalizeLayout(node.getAttribute('data-preset'), node.getAttribute('data-variant'));
    const box = document.createElement('div');
    box.setAttribute('data-type', 'layout');
    box.setAttribute('data-preset', preset);
    box.setAttribute('data-variant', variant);
    const split = normalizeSplit(node.getAttribute('data-split'));
    if (split != null) box.setAttribute('data-split', String(split));

    const cells = Array.from(node.children).filter((c) => c.tagName === 'DIV');
    const images = cells.filter((c) => c.getAttribute('data-cell') === 'image');
    const texts = cells.filter((c) => c.getAttribute('data-cell') === 'text');
    Sanitizer.#depth++; // 칸(div) 자체를 깊이에 센다
    cellsOf(preset, variant).forEach((role) => {
      const isImg = isImageRole(role);
      const src = isImg ? images.shift() : texts.shift();
      const cell = document.createElement('div');
      cell.setAttribute('data-cell', isImg ? 'image' : 'text');
      if (src && isImg) {
        const img = src.querySelector('img');
        const r = img && Sanitizer.#cleanNode(img);
        if (r) cell.appendChild(r);
      } else if (src) {
        Array.from(src.childNodes).forEach((c) => { const r = Sanitizer.#cleanNode(c); if (r) cell.appendChild(r); });
        cell.querySelectorAll('table, picture, img, iframe, div').forEach((el) => el.remove());
      }
      box.appendChild(cell);
    });
    Sanitizer.#depth--;
    return box;
  }
}
