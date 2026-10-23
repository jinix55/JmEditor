/**
 * structure-policy — 퍼블리싱 구조 보존 정책 (구조 태그·class 허용 범위)
 * - 기본은 꺼짐: 지금처럼 class 를 지우고 div→p, 모르는 태그는 벗긴다.
 * - 켜면 tags 의 구조 태그와 허용 태그의 class(토큰 검사 통과분)를 남긴다. 플러그인 블록(div[data-type]) 안은 예외(지금 규칙).
 * - 서버 HtmlSanitizer 와 같은 규칙이어야 한다 (application.yml jm-editor.structure.*).
 *
 * 설정 (생성 옵션 structure > window.JmEditorConfig.structure > 기본값):
 *   { enabled: true, tags: [...], classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', classAllow: null | ['tit-*', 'box-gray'], classDeny: ['btn-admin*'] }
 *   classAllow·classDeny 의 'xxx-*' 는 접두어, 나머지는 정확한 이름.
 */

/** 기본 정책 (꺼짐) */
export const STRUCTURE_DEFAULTS = Object.freeze({
  enabled: false,
  tags: Object.freeze(['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption']),
  classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
  classAllow: null,
  classDeny: Object.freeze([]),
});

/** 구조 모드에서 새로 허용할 수 있는 태그 (이 밖의 이름은 설정해도 무시 — script·form 등 차단) */
export const STRUCTURE_TAG_LIMIT = Object.freeze(['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup']);

/**
 * 에디터 예약 class — 설정과 무관하게 항상 지운다 (편집 상태 표시용. 남으면 저장·조회 화면이 어긋남)
 * `jm-` 로 시작하는 이름 전부 + 아래 이름. 퍼블에서 흔한 is-active 는 에디터가 본문에 쓰지 않으므로 예약하지 않는다.
 */
export const RESERVED_CLASSES = Object.freeze(['is-selected', 'is-empty', 'is-dragging', 'is-block-dragging', 'is-dragover', 'is-resizing',
  'is-img', 'is-current', 'is-on', 'is-invalid', 'is-checked', 'needs-sel', 'drop-before', 'drop-after', 'has-sub']);

/** class 토큰 한계: 이름 길이·개수 (사용자 정규식이 느려도 입력 크기가 제한되게 — ReDoS 완화) */
export const CLASS_TOKEN_MAX = 64;
export const CLASS_TOKENS_MAX = 32;
/** 사용자 정규식 길이 한계 (넘으면 기본 형식) */
const PATTERN_MAX = 200;

/** 'xxx-*' 접두어 또는 정확한 이름 목록과 맞는지 */
function matchesAny(token, list) {
  return list.some((p) => (p.endsWith('*') ? token.startsWith(p.slice(0, -1)) : token === p));
}

/**
 * 설정값을 검사·정리한 정책 객체로 만든다. 꺼져 있으면 null (호출하는 쪽은 null 이면 지금 규칙)
 * @param {object|null|undefined} cfg STRUCTURE_DEFAULTS 와 같은 모양 (일부만 줘도 됨)
 * @returns {{tags: Set<string>, cleanClass: (value: string) => string}|null}
 */
export function makeStructurePolicy(cfg) {
  const c = { ...STRUCTURE_DEFAULTS, ...(cfg || {}) };
  if (!c.enabled) return null;
  // tags: 배열이면 그대로(빈 배열 = 구조 태그 없음), 없으면 기본값 — 서버 StructurePolicy 와 같은 해석
  const tags = new Set((Array.isArray(c.tags) ? c.tags : STRUCTURE_DEFAULTS.tags).map((t) => String(t).trim().toLowerCase()).filter((t) => STRUCTURE_TAG_LIMIT.includes(t)));
  let pattern;
  const src = typeof c.classPattern === 'string' && c.classPattern && c.classPattern.length <= PATTERN_MAX ? c.classPattern : STRUCTURE_DEFAULTS.classPattern;
  try { pattern = new RegExp(src); } catch { pattern = new RegExp(STRUCTURE_DEFAULTS.classPattern); }
  const allow = Array.isArray(c.classAllow) ? c.classAllow.map(String) : null;
  const deny = Array.isArray(c.classDeny) ? c.classDeny.map(String) : [];
  /** class 토큰 하나가 남아도 되는지 */
  const okToken = (t) => t.length <= CLASS_TOKEN_MAX && pattern.test(t) && !t.startsWith('jm-') && !RESERVED_CLASSES.includes(t)
    && (!allow || matchesAny(t, allow)) && !matchesAny(t, deny);
  return Object.freeze({
    tags,
    /**
     * class 속성값에서 허용 토큰만 남긴다 (중복 제거, 순서 유지)
     * @param {string} value
     * @returns {string} 남는 것이 없으면 ''
     */
    cleanClass(value) {
      const seen = new Set();
      return String(value || '').trim().split(/\s+/).slice(0, CLASS_TOKENS_MAX)
        .filter((t) => t && okToken(t) && !seen.has(t) && seen.add(t)).join(' ');
    },
  });
}
