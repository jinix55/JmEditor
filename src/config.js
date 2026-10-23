/**
 * JmEditor 설정 — 기본값과 페이지 설정(window.JmEditorConfig) 병합
 *
 * 우선순위: 에디터 생성 옵션 > window.JmEditorConfig > 아래 기본값
 * window.JmEditorConfig 는 에디터 생성 시점에 읽으므로, CDN 으로 번들을 불러온 뒤 페이지에서 지정해도 된다.
 *   window.JmEditorConfig = { gallery: { maxFileSizeMB: 20 } };   // 바꿀 항목만
 *   new JmToolbarEditor(el, { galleryLimits: { maxFilesPerAdd: 5 } }); // 에디터별 (우선)
 * dist/jm-editor.config.js 는 전체 항목 견본 — 자기 서버에 복사해 고쳐 불러와도 된다.
 * 크기 단위는 MB, 길이 단위는 px.
 */
import { STRUCTURE_DEFAULTS } from './core/structure-policy.js';

/** 기본 설정 */
export const DEFAULT_CONFIG = Object.freeze({
  gallery: Object.freeze({
    types: Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp']), // 올릴 수 있는 형식
    maxFileSizeMB: 10,      // 파일당 (원본)
    maxFilesPerAdd: 10,     // 한 번에 올리는 장수
    maxImagesPerPost: 50,   // 글당 장수
    maxTotalSizeMB: 100,    // 글당 용량 (축소 후)
    maxDimension: 2000,     // 긴 변 상한(px), 넘으면 축소 (GIF 제외)
  }),
  // 퍼블리싱 구조(class·section·dl 등) 보존 — 기본 꺼짐. 서버 HtmlSanitizer 도 같은 값으로 켜야 한다 (core/structure-policy.js)
  structure: STRUCTURE_DEFAULTS,
});

/**
 * 설정 파일(window.JmEditorConfig)의 한 영역을 읽는다
 * @param {'gallery'|'structure'} section
 * @returns {object} 없으면 빈 객체
 */
export function fileConfig(section) {
  const cfg = typeof window !== 'undefined' ? window.JmEditorConfig : undefined;
  return (cfg && typeof cfg[section] === 'object' && cfg[section]) || {};
}

/**
 * 기본값 < 설정 파일 < 생성 옵션 순으로 합친 영역 설정
 * @param {'gallery'|'structure'} section
 * @param {object} [override] 에디터 생성 옵션으로 넘긴 값
 * @returns {object}
 */
export function resolveConfig(section, override) {
  return { ...DEFAULT_CONFIG[section], ...fileConfig(section), ...(override || {}) };
}
