/**
 * structure-policy — 퍼블리싱 구조 보존 정책 (구조 태그·class 허용 범위)
 * - 기본은 켜짐. 끄면(enabled: false) 예전 규칙: class 를 지우고 div→p, 모르는 태그는 벗긴다.
 * - 켜져 있으면 tags 의 구조 태그와 허용 태그의 class(토큰 검사 통과분)를 남긴다. 플러그인 블록(div[data-type]) 안은 예외(지금 규칙).
 * - 서버 HtmlSanitizer 와 같은 규칙이어야 한다 (application.yml jm-editor.structure.*).
 *
 * 설정 (생성 옵션 structure > window.JmEditorConfig.structure > 기본값):
 *   { enabled: true, tags: [...], classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', classAllow: null | ['tit-*', 'box-gray'], classDeny: ['btn-admin*'] }
 *   classAllow·classDeny 의 'xxx-*' 는 접두어, 나머지는 정확한 이름.
 *   idPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$', idDeny: ['gnb', 'site-*']  — 구조 모드에서 id 형식·금지 이름(같은 'xxx-*' 규칙)
 */

/** 기본 정책 (켜짐 — 끄려면 enabled: false, 서버도 같은 값으로) */
export const STRUCTURE_DEFAULTS = Object.freeze({
  enabled: true,
  tags: Object.freeze(['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup']),
  classPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
  classAllow: null,
  classDeny: Object.freeze([]),
  idPattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
  idDeny: Object.freeze([]),
});

/** 구조 모드에서 새로 허용할 수 있는 태그 (이 밖의 이름은 설정해도 무시 — script·form 등 차단) */
export const STRUCTURE_TAG_LIMIT = Object.freeze(['section', 'article', 'aside', 'div', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'caption', 'header', 'footer', 'nav', 'h4', 'h5', 'h6', 'small', 'sub', 'sup']);

/**
 * 글자 단위(인라인) 구조 태그 — 정제에서는 구조 태그로 허용하지만, 편집기의 블록·컨테이너 판정에서는 strong 처럼 일반 인라인으로 본다
 * (블록으로 보면 sup 안 Enter 가 줄바꿈이 되거나 루트의 sup 가 문단 밖에 남는다)
 */
export const INLINE_STRUCTURE_TAGS = Object.freeze(['small', 'sub', 'sup']);

/**
 * 에디터 예약 class — 설정과 무관하게 항상 지운다 (편집 상태 표시용. 남으면 저장·조회 화면이 어긋남)
 * `jm-` 로 시작하는 이름 전부 + 아래 이름. 퍼블에서 흔한 is-active 는 에디터가 본문에 쓰지 않으므로 예약하지 않는다.
 */
export const RESERVED_CLASSES = Object.freeze(['is-selected', 'is-empty', 'is-dragging', 'is-block-dragging', 'is-dragover', 'is-resizing',
  'is-img', 'is-current', 'is-on', 'is-invalid', 'is-checked', 'needs-sel', 'drop-before', 'drop-after', 'has-sub']);

/** class 토큰 한계: 이름 길이·개수 (사용자 정규식이 느려도 입력 크기가 제한되게 — ReDoS 완화) */
export const CLASS_TOKEN_MAX = 64;
export const CLASS_TOKENS_MAX = 32;
/**
 * 예약 id — 설정과 무관하게 항상 지운다. 라이브러리·뷰어·지도 스크립트가 window 에서 **읽는** 전역 이름만 (DOM clobbering 방지:
 * 같은 id 의 요소가 있으면 window.이름 이 그 요소가 된다). 브라우저 속성 이름 전체를 막지 않는다 — history·location·content 같은
 * 흔한 퍼블 id 는 window 의 진짜 속성이 이기므로 남긴다. (서버 StructurePolicy.RESERVED_IDS 와 같아야 함)
 * JmEditorConfig(config.js), JmEditor·JmViewer(번들 전역), JM(데모·하네스), kakao·daum(지도 스크립트), EyeDropper(ColorPicker)
 */
export const RESERVED_IDS = Object.freeze(['JmEditorConfig', 'JmEditor', 'JmViewer', 'JM', 'kakao', 'daum', 'EyeDropper']);
/** id 길이 한계 (사용자 정규식이 더 길게 허용해도 — ReDoS 완화), aria id 토큰 최대 개수, aria-label 최대 길이 */
export const ID_MAX = 64;
export const ARIA_IDS_MAX = 8;
export const ARIA_LABEL_MAX = 200;
/** 남길 aria 속성 (이 밖의 aria-*·role 은 버린다) */
export const ARIA_ATTRS = Object.freeze(['aria-labelledby', 'aria-describedby', 'aria-label', 'aria-hidden']);
/** 제어 문자·공백(유니코드 공백 포함) — id 에 들어가면 안 됨 (Java 정규식 $ 가 끝 줄바꿈 앞에서도 맞는 차이를 막는 몫도 있음) */
const ID_BAD_CHARS = /[\u0000-\u001f\u007f\s]/;
/** 제어 문자 (aria-label 금지) */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** 사용자 정규식 길이 한계 (넘으면 기본 형식) */
const PATTERN_MAX = 200;

/** 'xxx-*' 접두어 또는 정확한 이름 목록과 맞는지 */
function matchesAny(token, list) {
  return list.some((p) => (p.endsWith('*') ? token.startsWith(p.slice(0, -1)) : token === p));
}

/**
 * 설정값을 검사·정리한 정책 객체로 만든다. 꺼져 있으면 null (호출하는 쪽은 null 이면 지금 규칙)
 * @param {object|null|undefined} cfg STRUCTURE_DEFAULTS 와 같은 모양 (일부만 줘도 됨)
 * @returns {{tags: Set<string>, cleanClass: (value: string) => string, cleanId: (value: string) => string, cleanAria: (name: string, value: string) => string}|null}
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
  const idSrc = typeof c.idPattern === 'string' && c.idPattern && c.idPattern.length <= PATTERN_MAX ? c.idPattern : STRUCTURE_DEFAULTS.idPattern;
  let idPattern;
  try { idPattern = new RegExp(idSrc); } catch { idPattern = new RegExp(STRUCTURE_DEFAULTS.idPattern); }
  const idDeny = Array.isArray(c.idDeny) ? c.idDeny.map(String) : [];
  /**
   * id 값 하나가 남아도 되는지: 길이·공백·제어 문자, 형식, jm- 접두(대소문자 무시 — 에디터 예약), 예약 전역(정확한 이름 — HTML id·JS 전역 모두 대소문자 구분), idDeny
   */
  const okId = (v) => v.length > 0 && v.length <= ID_MAX && !ID_BAD_CHARS.test(v) && idPattern.test(v)
    && !/^jm-/i.test(v) && !RESERVED_IDS.includes(v) && !matchesAny(v, idDeny);
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
    /**
     * id 속성값 검사 (값은 손대지 않음 — 앞뒤 공백도 다른 id 라 통째로 거부)
     * @param {string} value
     * @returns {string} 통과하면 그대로, 아니면 ''
     */
    cleanId(value) {
      const v = String(value ?? '');
      return okId(v) ? v : '';
    },
    /**
     * aria 속성값 검사: aria-labelledby·aria-describedby 는 공백으로 나눈 id 토큰 1~8개(각 토큰 idPattern 등 id 규칙),
     * aria-label 은 제어 문자 없는 200자 이하(빈 값 제외), aria-hidden 은 'true' 만. 그 밖의 이름은 ''.
     * @param {string} name 속성 이름 (소문자)
     * @param {string} value
     * @returns {string} 남길 값(공백 구분 토큰은 한 칸으로 정리), 아니면 ''
     */
    cleanAria(name, value) {
      const v = String(value ?? '');
      if (name === 'aria-hidden') return v === 'true' ? v : '';
      if (name === 'aria-label') return v.trim() && v.length <= ARIA_LABEL_MAX && !CONTROL_CHARS.test(v) ? v : '';
      if (name === 'aria-labelledby' || name === 'aria-describedby') {
        const toks = v.split(/[ \t\n\f\r]+/).filter(Boolean);
        return toks.length >= 1 && toks.length <= ARIA_IDS_MAX && toks.every(okId) ? toks.join(' ') : '';
      }
      return '';
    },
  });
}
