/**
 * font-policy — 글꼴 허용 목록 (style font-family 값 정규화)
 * - 쉼표 목록에서 허용 목록에 있는 첫 이름만 남긴다. 없으면 지운다 (serif 같은 일반 패밀리만 있어도 지워짐).
 * - 저장 값은 `"이름", serif|sans-serif` — 글꼴을 못 받았을 때도 명조·고딕은 맞게 보이도록 대체 글꼴을 붙인다.
 * - 서버 FontPolicy.java 와 같은 규칙이어야 한다 (application.yml jm-editor.font.families·legacy).
 *
 * 설정 (생성 옵션 font > window.JmEditorConfig.font > 기본값):
 *   families 툴바 글꼴 목록 (웹폰트로 불러와 쓴 사람·보는 사람에게 같게 보이는 글꼴)
 *   legacy   툴바에는 없지만 지우지 않는 글꼴 (옛 글·붙여넣기). families 와 합친 것이 허용 목록
 *   css      에디터·뷰어가 불러올 글꼴 CSS 주소 (https:// 또는 / 로 시작). 사이트가 직접 불러오면 []
 */

/** 기본 글꼴 설정 — 툴바는 무료 공개(OFL) 웹폰트만 */
export const FONT_DEFAULTS = Object.freeze({
  families: Object.freeze(['Noto Sans KR', 'Noto Serif KR']),
  legacy: Object.freeze(['맑은 고딕', 'Noto Sans', 'Roboto', '굴림', '돋움', '바탕', '궁서', '함초롬바탕', '함초롬돋움', '한컴바탕', 'HY헤드라인M', 'Apple SD Gothic Neo', 'Arial', 'Helvetica Neue', 'Times New Roman']),
  css: Object.freeze(['https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&display=swap']),
});

/** 영문 별칭 → 목록 이름 (소문자로 비교) */
const FONT_ALIASES = Object.freeze({ 'malgun gothic': '맑은 고딕', 'hcr batang': '함초롬바탕', gulim: '굴림', dotum: '돋움', batang: '바탕', helveticaneue: 'Helvetica Neue' });
/** 설정 목록에 쓸 수 있는 이름 형식 (따옴표·세미콜론 등이 style 로 나가지 않게) */
const FONT_NAME_OK = /^[\p{L}\p{N} _-]{1,64}$/u;

/** 명조 계열 이름 (대체 글꼴 serif). 그 밖은 sans-serif */
const SERIF_FONT = /serif|myeongjo|명조|바탕|batang|궁서|gungsuh|times/i;
/** 불러올 수 있는 글꼴 CSS 주소: https:// 또는 같은 사이트 경로 (// 와 /\ 는 다른 사이트라 제외) */
const FONT_CSS_OK = /^(?:https:\/\/[^\s"'<>\\]+|\/(?![/\\])[^\s"'<>\\]*)$/;

/**
 * 설정 목록 정리: 배열이 아니면 기본 목록, 형식에 어긋난 이름은 버린다
 * @param {unknown} list
 * @param {readonly string[]} [fallback] 배열이 아닐 때 쓸 목록
 * @returns {string[]}
 */
export function normalizeFamilies(list, fallback = FONT_DEFAULTS.families) {
  if (!Array.isArray(list)) return [...fallback];
  return [...new Set(list.map((n) => String(n).trim()).filter((n) => FONT_NAME_OK.test(n)))];
}

/**
 * 허용 목록: 툴바 목록(families) 다음에 옛 글꼴(legacy)
 * @param {{families?: unknown, legacy?: unknown}} font 글꼴 설정
 * @returns {string[]}
 */
export function fontAllowList(font) {
  return [...new Set([...normalizeFamilies(font?.families), ...normalizeFamilies(font?.legacy, FONT_DEFAULTS.legacy)])];
}

/**
 * 저장할 font-family 값: 이름과 대체 글꼴
 * @param {string} name 허용 목록의 이름
 * @returns {string} 예: '"Noto Serif KR", serif'
 */
export function fontFamilyValue(name) {
  return `"${name}", ${SERIF_FONT.test(name) && !/sans/i.test(name) ? 'serif' : 'sans-serif'}`;
}

/**
 * 글꼴 CSS 를 페이지 head 에 붙인다 (같은 주소는 한 번만, 허용되지 않는 주소는 버림)
 * @param {unknown} urls 설정 font.css
 */
export function loadFontCss(urls) {
  if (typeof document === 'undefined' || !Array.isArray(urls)) return;
  for (const url of urls) {
    if (typeof url !== 'string' || !FONT_CSS_OK.test(url)) continue;
    let href;
    try { href = new URL(url, document.baseURI).href; } catch { continue; } // 형식은 맞지만 주소로 못 읽는 값(https://[ 등)은 버림 — 에디터·뷰어 초기화를 막지 않게
    if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((l) => l.href === href)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

/**
 * 쉼표 목록을 따옴표를 지켜 이름별로 나눈다
 * @param {string} value
 * @returns {string[]} 앞뒤 공백·감싼 따옴표를 뺀 이름들
 */
function splitFontNames(value) {
  const names = [];
  let quote = '';
  let start = 0;
  const flush = (end) => {
    let n = value.slice(start, end).trim();
    if (n.length >= 2 && (n[0] === '"' || n[0] === "'") && n[n.length - 1] === n[0]) n = n.slice(1, -1).trim();
    if (n) names.push(n);
  };
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === ',') { flush(i); start = i + 1; }
  }
  flush(value.length);
  return names;
}

/**
 * font-family 값에서 허용 목록의 첫 이름을 찾는다 (대소문자 무시, 영문 별칭 변환)
 * @param {string} value 쉼표 목록
 * @param {string[]} families 허용 목록 (normalizeFamilies 결과)
 * @returns {string|null} 목록에 적힌 이름, 없으면 null
 */
export function fontFamilyName(value, families) {
  const lower = families.map((f) => f.toLowerCase());
  for (const name of splitFontNames(String(value ?? ''))) {
    const key = name.toLowerCase();
    let at = lower.indexOf(key);
    if (at < 0 && Object.hasOwn(FONT_ALIASES, key)) at = lower.indexOf(FONT_ALIASES[key].toLowerCase());
    if (at >= 0) return families[at];
  }
  return null;
}

/** 실제 글꼴이 아니라 브라우저가 고르는 이름 (화면에 무엇이 나올지 이름으로 알 수 없다) */
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont']);

/**
 * 요소에 실제로 적용되는 글꼴 이름. font-family 목록에서 이 컴퓨터에 있는 첫 글꼴을 찾는다
 * (글자 폭을 대체 글꼴과 비교해 판별. 사이트가 불러온 웹폰트도 로드 후에는 포함)
 * @param {Element} el
 * @returns {string|null} 글꼴 이름, 브라우저 기본·시스템 글꼴이 쓰이면 null
 */
export function usedFontName(el) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  const SAMPLE = 'mmwwlliiWW0123 가나다라마바';
  const width = (font) => { ctx.font = `72px ${font}`; return ctx.measureText(SAMPLE).width; };
  const fallbacks = ['monospace', 'serif'].map((g) => [g, width(g)]);
  for (const name of splitFontNames(getComputedStyle(el).fontFamily)) {
    if (GENERIC_FONTS.has(name.toLowerCase())) return null;
    const quoted = `"${name.replace(/["\\]/g, '\\$&')}"`;
    if (fallbacks.some(([g, w]) => width(`${quoted}, ${g}`) !== w)) return name;
  }
  return null;
}

/**
 * 인라인 지정이 없을 때 글자가 따를 값을 읽을 요소: 커서에서 위로 올라가며 prop 을 직접 지정한 요소들의 바깥 부모
 * @param {Node|null|undefined} node 커서 위치
 * @param {Element} root 편집 영역
 * @param {string} prop style 속성 이름 (font-size 등)
 * @returns {Element}
 */
function inheritFrom(node, root, prop) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!el || !root.contains(el)) return root;
  let from = el;
  for (; el && el !== root; el = el.parentElement) if (el.style?.getPropertyValue(prop)) from = el.parentElement;
  return from;
}

/**
 * 인라인 지정이 없을 때의 글자 크기 (사이트 CSS·제목 단계 반영)
 * @param {Node|null|undefined} node
 * @param {Element} root
 * @returns {string} 예: '16px'
 */
export function inheritedFontSize(node, root) {
  return `${Math.round(parseFloat(getComputedStyle(inheritFrom(node, root, 'font-size')).fontSize))}px`;
}

/**
 * 인라인 지정이 없을 때의 글꼴 이름 (허용 목록에 있으면 그 표기로)
 * @param {Node|null|undefined} node
 * @param {Element} root
 * @param {string[]} families
 * @returns {string|null} 알 수 없으면(브라우저·시스템 글꼴) null
 */
export function inheritedFontName(node, root, families) {
  const name = usedFontName(inheritFrom(node, root, 'font-family'));
  return name && (fontFamilyName(name, families) ?? name);
}

/** 소수 둘째 자리까지 줄인 줄 간격 표기 */
const ratioText = (n) => String(Math.round(n * 100) / 100);

/**
 * 인라인 지정이 없을 때의 줄 간격 (글자 크기 대비 배수, 사이트 CSS 반영)
 * @param {Node|null|undefined} node
 * @param {Element} root
 * @returns {string} 예: '1.6'. line-height: normal 이면 한 줄 높이를 재서 돌려준다
 */
export function inheritedLineHeight(node, root) {
  const cs = getComputedStyle(inheritFrom(node, root, 'line-height'));
  const size = parseFloat(cs.fontSize);
  const px = parseFloat(cs.lineHeight);
  if (px && size) return ratioText(px / size);
  const probe = document.createElement('div'); // normal: 글꼴마다 달라 재 본다 (본문 밖에 잠깐 두므로 저장·이력에 남지 않음)
  probe.style.cssText = 'position:absolute;visibility:hidden;line-height:normal';
  probe.style.font = cs.font;
  probe.style.lineHeight = 'normal';
  probe.textContent = 'x';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h && size ? ratioText(h / size) : '';
}
