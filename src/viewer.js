/**
 * 뷰어 진입점 — 조회 페이지에서 저장된 HTML 을 그대로 보여줄 때 필요한 런타임만 묶음
 *   initViewer(el): 갤러리 비율 배치 + 슬라이드 자동 전환 초기화
 */
import { observeGalleries } from './plugins/gallery/gallery-layout.js';
import { initSliders } from './plugins/slider/slider-runtime.js';

export { observeGalleries, initSliders };

/**
 * @param {HTMLElement|Document} [root=document] 본문 컨테이너 (.jm-content)
 * @returns {() => void} 해제 함수
 */
export function initViewer(root = document) {
  const stop = observeGalleries(root);
  initSliders(root);
  return stop;
}
