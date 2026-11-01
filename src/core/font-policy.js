/**
 * font-policy — 글꼴 허용 목록 (style font-family 값 정규화)
 * - 쉼표 목록에서 허용 목록에 있는 첫 이름만 남긴다. 없으면 지운다 (serif 같은 일반 패밀리만 있어도 지워짐).
 * - 서버 FontPolicy.java 와 같은 규칙이어야 한다 (application.yml jm-editor.font.families).
 *
 * 설정 (생성 옵션 font > window.JmEditorConfig.font > 기본값): { families: ['맑은 고딕', 'Arial'] }
 */

/** 기본 글꼴 목록 */
export const FONT_DEFAULTS = Object.freeze({
  families: Object.freeze(['맑은 고딕', 'Noto Sans KR', 'Noto Sans', '굴림', '돋움', '바탕', '궁서', '함초롬바탕', '함초롬돋움', 'HY헤드라인M', 'Arial', 'Times New Roman']),
});

/** 영문 별칭 → 목록 이름 (소문자로 비교) */
const FONT_ALIASES = Object.freeze({ 'malgun gothic': '맑은 고딕', 'hcr batang': '함초롬바탕', gulim: '굴림', dotum: '돋움', batang: '바탕' });
/** 설정 목록에 쓸 수 있는 이름 형식 (따옴표·세미콜론 등이 style 로 나가지 않게) */
const FONT_NAME_OK = /^[\p{L}\p{N} _-]{1,64}$/u;

/**
 * 설정 목록 정리: 배열이 아니면 기본 목록, 형식에 어긋난 이름은 버린다
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeFamilies(list) {
  if (!Array.isArray(list)) return [...FONT_DEFAULTS.families];
  return [...new Set(list.map((n) => String(n).trim()).filter((n) => FONT_NAME_OK.test(n)))];
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
