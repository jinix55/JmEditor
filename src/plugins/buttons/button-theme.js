/**
 * button-theme — 버튼 모양·색·아이콘 정의 (에디터·Sanitizer 공용)
 *
 * 저장 형식 (a[data-role="button"]):
 * - data-style: primary(채움) | outline(외곽선) | soft(연한색) | gray(예전 회색 — 호환용)
 * - data-color: 테마 색 이름 (없으면 blue). 직접 고른 색은 style="--jm-btn: #rrggbb" 로 저장
 * - data-tone: 직접 고른 색이 밝으면 light (글자를 어둡게, 외곽선·연한색 글자를 진하게). 테마 색은 모두 어두워 생략
 * - data-icon: 아이콘 이름, data-icon-pos: right (없으면 글자 앞)
 * 테두리·마우스 오버·연한 배경은 고른 색 하나에서 CSS color-mix 로 계산하므로 조회 화면은 CSS 만으로 보인다.
 * 아이콘 모양(SVG)은 jm-editor.css 에 있다. 서버 HtmlSanitizer.java 의 허용 목록과 같아야 한다.
 */

/** 모양 [값, 이름] */
export const BUTTON_SHAPES = Object.freeze([['primary', '채움'], ['outline', '외곽선'], ['soft', '연한색']]);

/** 테마 색 [값, 이름, 기본 색] — 실제 색은 CSS 변수 --jm-btn-<값> 로 사이트에서 바꿀 수 있다 */
export const BUTTON_COLORS = Object.freeze([
  ['blue', '파랑', '#1d4ed8'],
  ['green', '초록', '#15803d'],
  ['red', '빨강', '#dc2626'],
  ['orange', '주황', '#ea580c'],
  ['purple', '보라', '#7c3aed'],
  ['gray', '회색', '#475467'],
  ['black', '검정', '#111827'],
]);

/** 아이콘 [값, 이름(목록 표시용 기호 포함)] */
export const BUTTON_ICONS = Object.freeze([
  ['arrow', '→ 화살표'], ['external', '↗ 바로가기'], ['download', '⤓ 다운로드'], ['phone', '☎ 전화'],
  ['mail', '✉ 메일'], ['calendar', '▦ 일정'], ['pin', '⌖ 위치'], ['search', '⌕ 검색'],
  ['play', '▶ 재생'], ['check', '✓ 확인'], ['info', 'ⓘ 안내'], ['heart', '♥ 좋아요'],
  ['star', '★ 즐겨찾기'], ['plus', '＋ 추가'], ['chat', '✎ 문의'], ['file', '▤ 문서'],
]);

/** 저장 값 검사용 */
export const SHAPE_VALUES = Object.freeze(['primary', 'outline', 'soft', 'gray']);
export const COLOR_VALUES = Object.freeze(BUTTON_COLORS.map(([v]) => v));
export const ICON_VALUES = Object.freeze(BUTTON_ICONS.map(([v]) => v));

/** 직접 고른 색 형식: #rgb | #rrggbb */
export const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * 색을 #rrggbb 로 맞춘다 (#rgb·rgb() 허용). 형식이 아니면 null
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeHex(value) {
  const v = String(value ?? '').trim();
  if (HEX_COLOR.test(v)) return v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : v.toLowerCase();
  const m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!m) return null;
  return `#${m.slice(1, 4).map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 색의 밝기 판정 (WCAG 상대 휘도). 밝으면 'light' — 흰 글자가 잘 안 보이는 색
 * @param {string} hex #rrggbb
 * @returns {'light'|'dark'}
 */
export function toneOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 흰 글자 대비 4.5:1 미만이면 밝은 색으로 본다 ((1.05)/(L+0.05) < 4.5 ⇔ L > 0.183)
  return lum > 0.183 ? 'light' : 'dark';
}
