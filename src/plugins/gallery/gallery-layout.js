/**
 * gallery-layout — 이미지 갤러리 저스티파이드 배치 (에디터·뷰어 공용)
 *
 * - 각 줄의 높이를 같게 두고, 이미지 폭은 원본 비율대로 잡은 뒤 한 줄이 컨테이너 폭을 꽉 채우도록 스케일한다.
 *   세로 사진이 섞여도 줄이 가지런하고 가로가 남지 않는다. 마지막 줄은 늘리지 않고 목표 줄 높이로 왼쪽에 둔다.
 * - 목표 줄 높이·이미지 간격은 디자인에서 정한다: CSS 변수 --jm-gallery-row-height / --jm-gallery-gap (px).
 * - 원본 비율은 img 의 width / height 속성에 저장한다 (저장 HTML 에 포함, 뷰어에서 이미지 로딩 전에도 계산 가능).
 * - data-layout="justify" 인 갤러리만 처리. 예전에 저장된 "cover"(칸 고정·잘라 채움) 는 CSS 만으로 보이므로 건드리지 않는다.
 *
 * 뷰어 페이지에서는 아래 한 줄이면 된다:
 *   import { observeGalleries } from '/js/jm-editor/plugins/gallery/gallery-layout.js';
 *   observeGalleries(document.querySelector('.jm-content'));
 */
const DEFAULT_ROW_HEIGHT = 200; // CSS 변수가 없을 때 목표 줄 높이(px)
const DEFAULT_GAP = 8;          // CSS 변수가 없을 때 이미지 간격(px)

/**
 * 갤러리에 적용된 CSS 변수(px)를 숫자로 읽는다
 * @param {CSSStyleDeclaration} cs
 * @param {string} name 변수 이름 (--jm-gallery-…)
 * @param {number} fallback 없거나 숫자가 아닐 때 기본값
 */
function cssPx(cs, name, fallback) {
  const v = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** img 의 원본 비율 (w/h). width/height 속성 → naturalWidth/Height 순으로 읽고, 없으면 4:3 */
function ratioOf(img) {
  const w = parseFloat(img.getAttribute('width')) || img.naturalWidth;
  const h = parseFloat(img.getAttribute('height')) || img.naturalHeight;
  return w > 0 && h > 0 ? w / h : 4 / 3;
}

/**
 * 로드된 이미지의 원본 크기를 width/height 속성에 기록 (저장 HTML 에 비율이 남도록)
 * @param {HTMLImageElement} img
 * @param {boolean} [force=false] 이미 기록돼 있어도 덮어씀 (이미지 교체 시)
 */
export function stampSize(img, force = false) {
  if (img.naturalWidth && img.naturalHeight && (force || !img.getAttribute('width'))) {
    img.setAttribute('width', img.naturalWidth);
    img.setAttribute('height', img.naturalHeight);
  }
}

/**
 * 갤러리 하나를 배치한다
 * @param {HTMLElement} gallery div[data-type="gallery"]
 */
export function layoutGallery(gallery) {
  const imgs = Array.from(gallery.querySelectorAll(':scope > img'));
  if (gallery.dataset.layout !== 'justify') {
    imgs.forEach((img) => { img.style.width = ''; img.style.height = ''; img.style.flex = ''; });
    return;
  }
  const cs = getComputedStyle(gallery);
  const width = gallery.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  if (!imgs.length || width <= 0) return;

  const GAP = cssPx(cs, '--jm-gallery-gap', DEFAULT_GAP);
  const targetH = cssPx(cs, '--jm-gallery-row-height', DEFAULT_ROW_HEIGHT) || DEFAULT_ROW_HEIGHT;

  // 줄 나누기: 목표 높이 기준 폭 합이 컨테이너를 넘을 때,
  // 이 이미지를 포함한 폭과 제외한 폭 중 컨테이너 폭에 더 가까운 쪽을 택한다 (한 줄이 과하게 확대/축소되는 것 방지)
  const rows = [];
  let row = [], rowW = 0;
  imgs.forEach((img) => {
    const r = ratioOf(img);
    const w = r * targetH;
    const withW = rowW + (row.length ? GAP : 0) + w;
    if (row.length && withW > width && Math.abs(withW - width) > Math.abs(rowW - width)) {
      rows.push(row); row = []; rowW = 0;
    }
    row.push({ img, r });
    rowW += (row.length > 1 ? GAP : 0) + w;
  });
  if (row.length) rows.push(row);

  // 줄마다 높이를 계산해 폭을 꽉 채움
  rows.forEach((items, idx) => {
    const sumRatio = items.reduce((a, it) => a + it.r, 0);
    const avail = width - GAP * (items.length - 1);
    let h = avail / sumRatio;
    // 마지막 줄은 늘리지 않고 목표 높이로 왼쪽에 둔다 (폭을 넘칠 때만 줄여서 맞춤)
    if (idx === rows.length - 1) h = Math.min(h, targetH);
    items.forEach(({ img, r }) => {
      img.style.flex = '0 0 auto';
      img.style.width = `${Math.floor(r * h)}px`;
      img.style.height = `${Math.floor(h)}px`;
    });
  });
}

/**
 * root 아래 모든 갤러리를 배치하고, 크기 변경·이미지 로드에 따라 다시 배치한다
 * @param {HTMLElement|Document} root
 * @returns {() => void} 해제 함수
 */
export function observeGalleries(root = document) {
  const galleries = () => Array.from(root.querySelectorAll('div[data-type="gallery"]'));
  const relayout = () => galleries().forEach(layoutGallery);

  // 이미지 로드 완료 시 원본 크기 기록 후 재배치
  const onLoad = (e) => { if (e.target.tagName === 'IMG' && e.target.closest('div[data-type="gallery"]')) { stampSize(e.target); relayout(); } };
  root.addEventListener('load', onLoad, true);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null;
  galleries().forEach((g) => { g.querySelectorAll('img').forEach(stampSize); ro?.observe(g); });
  relayout();

  return () => { root.removeEventListener('load', onLoad, true); ro?.disconnect(); };
}
