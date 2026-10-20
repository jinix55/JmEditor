/**
 * gallery-layout — 이미지 갤러리 저스티파이드 배치 (에디터·뷰어 공용)
 *
 * - 각 줄의 높이를 같게 두고, 이미지 폭은 원본 비율대로 잡은 뒤 한 줄이 컨테이너 폭을 꽉 채우도록 스케일한다.
 *   세로 사진이 섞여도 줄이 가지런하고 가로가 남지 않는다.
 * - 원본 비율은 img 의 width / height 속성에 저장한다 (저장 HTML 에 포함, 뷰어에서 이미지 로딩 전에도 계산 가능).
 * - data-layout="justify" 인 갤러리만 처리. "cover"(칸 고정·잘라 채움) 는 CSS 만으로 동작하므로 건드리지 않는다.
 * - data-cols 는 한 줄에 들어갈 대략적인 장 수로 쓰여 목표 줄 높이를 정한다.
 *
 * 뷰어 페이지에서는 아래 한 줄이면 된다:
 *   import { observeGalleries } from '/js/jm-editor/plugins/gallery/gallery-layout.js';
 *   observeGalleries(document.querySelector('.jm-content'));
 */
const GAP = 8;             // 이미지 사이 간격(px) — CSS gap 과 같아야 함
const MAX_LAST_ROW_SCALE = 1.6; // 마지막 줄이 너무 커지지 않도록 확대 상한

/** img 의 원본 비율 (w/h). width/height 속성 → naturalWidth/Height 순으로 읽고, 없으면 4:3 */
function ratioOf(img) {
  const w = parseFloat(img.getAttribute('width')) || img.naturalWidth;
  const h = parseFloat(img.getAttribute('height')) || img.naturalHeight;
  return w > 0 && h > 0 ? w / h : 4 / 3;
}

/** 로드된 이미지의 원본 크기를 width/height 속성에 기록 (저장 HTML 에 비율이 남도록) */
export function stampSize(img) {
  if (img.naturalWidth && img.naturalHeight && !img.getAttribute('width')) {
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
  const width = gallery.clientWidth - (parseFloat(getComputedStyle(gallery).paddingLeft) || 0) * 2;
  if (!imgs.length || width <= 0) return;

  const cols = Math.max(1, parseInt(gallery.dataset.cols, 10) || 3);
  const targetH = (width - GAP * (cols - 1)) / cols / (4 / 3); // 4:3 사진이 cols 장 들어가는 높이

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
    // 마지막 줄은 너무 커지지 않게 상한 적용 (그 이상이면 왼쪽 정렬로 남김)
    if (idx === rows.length - 1 && h > targetH * MAX_LAST_ROW_SCALE) h = targetH * MAX_LAST_ROW_SCALE;
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
