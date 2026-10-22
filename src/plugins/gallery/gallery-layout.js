/**
 * gallery-layout — 이미지 갤러리 저스티파이드 배치 (에디터·뷰어 공용)
 *
 * - 각 줄의 높이를 같게 두고, 이미지 폭은 원본 비율대로 잡은 뒤 한 줄이 컨테이너 폭을 꽉 채우도록 스케일한다.
 *   세로 사진이 섞여도 줄이 가지런하고 가로가 남지 않는다. 마지막 줄은 늘리지 않고 목표 줄 높이로 왼쪽에 둔다.
 * - 2:3 보다 길쭉한 세로 사진은 두 줄 높이를 차지하고 옆에 다음 사진들을 두 줄로 쌓는다 (computeJustifiedLayout).
 * - 사진은 계산한 좌표로 절대 배치하고 갤러리 높이를 맞춘다. 스크립트가 없으면 CSS 의 flex 줄 배치로 보인다.
 * - 목표 줄 높이·이미지 간격은 디자인에서 정한다: CSS 변수 --jm-gallery-row-height / --jm-gallery-gap (px).
 * - 한 줄 최대 장수(--jm-gallery-max-per-row, 기본 4): 폭이 넓으면 4:3 사진이 이 장수만큼 들어가는 높이까지 줄 높이를 키운다.
 *   (줄 높이가 고정이면 넓은 화면에서 한 줄에 사진이 많이 들어가 작게 길게 늘어서므로) 좁은 화면에서는 --jm-gallery-row-height 그대로.
 * - 원본 비율은 img 의 width / height 속성에 저장한다 (저장 HTML 에 포함, 뷰어에서 이미지 로딩 전에도 계산 가능).
 * - data-layout="justify" 인 갤러리만 처리. 예전에 저장된 "cover"(칸 고정·잘라 채움) 는 CSS 만으로 보이므로 건드리지 않는다.
 *
 * 뷰어 페이지에서는 아래 한 줄이면 된다:
 *   import { observeGalleries } from '/js/jm-editor/plugins/gallery/gallery-layout.js';
 *   observeGalleries(document.querySelector('.jm-content'));
 */
const DEFAULT_ROW_HEIGHT = 200; // CSS 변수가 없을 때 목표 줄 높이(px)
const DEFAULT_GAP = 8;          // CSS 변수가 없을 때 이미지 간격(px)
const DEFAULT_MAX_PER_ROW = 4;  // CSS 변수가 없을 때 한 줄 최대 장수(대략, 4:3 사진 기준)

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

/** 이 비율(폭/높이) 이하 — 2:3 보다 길쭉한 세로 사진은 두 줄 높이로 놓고 옆에 두 줄을 쌓는다 */
const TALL_RATIO = 0.67;
/** 두 줄 블록 옆 남은 폭에 4:3 사진이 최소 이만큼(장) 들어가야 블록을 만든다 (좁은 화면에서는 일반 줄로) */
const MIN_SIDE_PHOTOS = 1.5;

/**
 * 저스티파이드 배치 계산 (DOM 없이 숫자만 — 에디터·뷰어 공용, 테스트 가능)
 * - 일반 줄: 목표 높이 T 로 담다가 폭을 넘으면(가까운 쪽 기준) 줄을 끊고, 줄 높이를 조정해 폭을 꽉 채운다
 * - 긴 세로 사진(비율 ≤ TALL_RATIO): 두 줄 높이 H 를 차지하고, 옆 남은 폭 S 에 다음 사진들을 두 줄(h1·h2)로 쌓는다.
 *   H = h1 + gap + h2, S = W − r·H − gap, 각 줄은 S 를 꽉 채움 → H 를 연립식 한 번으로 계산
 *   앞에 같은 줄 사진이 있으면 그 사진들을 첫 줄 앞에 두고 긴 사진은 오른쪽, 없으면 왼쪽·오른쪽을 번갈아 둔다
 * - 마지막 줄(또는 마지막 블록)은 늘리지 않고 목표 높이로 왼쪽에 둔다
 * @param {number[]} ratios 사진 비율(폭/높이), 문서 순서
 * @param {number} W 내용 폭(px)
 * @param {number} gap 간격(px)
 * @param {number} T 목표 줄 높이(px)
 * @returns {{ boxes: Array<{x:number,y:number,w:number,h:number}>, height: number }}
 */
export function computeJustifiedLayout(ratios, W, gap, T) {
  const n = ratios.length;
  const boxes = new Array(n);
  const noBlock = new Set();   // 블록으로 만들 수 없었던 긴 사진 (일반 사진처럼 배치)
  let y = 0;
  let blockCount = 0;

  const blockable = (k) => ratios[k] <= TALL_RATIO && !noBlock.has(k)
    && W - ratios[k] * (2 * T + gap) - gap >= T * (4 / 3) * MIN_SIDE_PHOTOS;
  const sumR = (idx) => idx.reduce((a, k) => a + ratios[k], 0);
  const naturalW = (idx) => idx.reduce((a, k) => a + ratios[k] * T, 0) + gap * Math.max(0, idx.length - 1);

  /**
   * from 부터 폭 avail 에 목표 높이로 담기 (가까운 쪽 규칙). 블록 대상 긴 사진을 만나면 멈춤. 담은 인덱스 목록
   * atLeastOne: 블록 옆 줄용 — 첫 사진이 긴 사진이어도 하나는 담는다 (긴 사진이 연달아 나와도 블록이 만들어지게)
   */
  const take = (from, avail, seed = [], atLeastOne = false) => {
    const idx = [...seed];
    let w = naturalW(idx);
    let k = from;
    while (k < n && (!blockable(k) || (atLeastOne && !idx.length))) {
      const withW = w + (idx.length ? gap : 0) + ratios[k] * T;
      if (idx.length && withW > avail && Math.abs(withW - avail) > Math.abs(w - avail)) break;
      idx.push(k); w = withW; k++;
    }
    return { idx, next: k };
  };

  /** 줄 하나 배치: x0 부터 높이 h */
  const place = (idx, x0, y0, h) => {
    let x = x0;
    idx.forEach((k) => { const w = ratios[k] * h; boxes[k] = { x, y: y0, w, h }; x += w + gap; });
  };

  /** 일반 줄 배치 (마지막이면 늘리지 않음) */
  const placeRow = (idx, isLast) => {
    let h = (W - gap * (idx.length - 1)) / sumR(idx);
    if (isLast) h = Math.min(h, T);
    place(idx, 0, y, h);
    y += h + gap;
  };

  let i = 0;
  while (i < n) {
    const row = take(i, W);
    if (row.next >= n || !blockable(row.next)) {     // 긴 사진 없음 → 일반 줄
      if (!row.idx.length) { noBlock.add(row.next); continue; }
      placeRow(row.idx, row.next >= n);
      i = row.next;
      continue;
    }

    // 긴 사진 t 로 두 줄 블록 만들기
    const t = row.next;
    const rt = ratios[t];
    const H0 = 2 * T + gap;
    const S0 = W - rt * H0 - gap;
    let pending = row.idx;
    if (pending.length && naturalW(pending) > S0) { placeRow(pending, false); pending = []; } // 앞 사진이 옆에 안 들어가면 따로 한 줄
    const side = pending.length ? 'right' : (blockCount % 2 === 0 ? 'left' : 'right');
    const r1 = take(t + 1, S0, pending, true);
    const r2 = take(r1.next, S0, [], true);
    if (!r1.idx.length || !r2.idx.length) {          // 옆에 두 줄을 채울 사진이 모자라면 블록 대신 일반 배치
      noBlock.add(t);
      i = pending.length ? pending[0] : t;
      continue;
    }
    const isEnd = r2.next >= n;
    const a1 = 1 / sumR(r1.idx), a2 = 1 / sumR(r2.idx);
    const c1 = gap * (r1.idx.length - 1), c2 = gap * (r2.idx.length - 1);
    let H = ((W - gap - c1) * a1 + (W - gap - c2) * a2 + gap) / (1 + rt * (a1 + a2));
    let h1, h2;
    if (isEnd && H > H0) {
      // 마지막 블록은 늘리지 않음: 목표 높이로 두되, 옆 폭(S0)을 넘는 줄은 그 폭에 맞게 줄인다
      h1 = Math.min(T, (S0 - c1) * a1);
      h2 = Math.min(T, (S0 - c2) * a2);
      H = h1 + h2 + gap;
    } else {
      const S = W - rt * H - gap;
      h1 = (S - c1) * a1; h2 = (S - c2) * a2;
    }
    if (h1 < T * 0.5 || h2 < T * 0.5 || H > 4 * T) {  // 한쪽 줄이 지나치게 납작·길어지면 블록 대신 일반 배치
      noBlock.add(t);
      i = pending.length ? pending[0] : t;
      continue;
    }
    const tallW = rt * H;
    const xSub = side === 'left' ? tallW + gap : 0;
    // 오른쪽 배치: 옆 줄이 폭을 채우면 오른쪽 끝, 늘리지 않은 마지막 블록이면 옆 줄 바로 뒤 (가운데가 비지 않게)
    const subW = Math.max(sumR(r1.idx) * h1 + c1, sumR(r2.idx) * h2 + c2);
    boxes[t] = { x: side === 'left' ? 0 : Math.min(W - tallW, subW + gap), y, w: tallW, h: H };
    place(r1.idx, xSub, y, h1);
    place(r2.idx, xSub, y + h1 + gap, h2);
    y += H + gap;
    blockCount++;
    i = r2.next;
  }
  return { boxes, height: Math.max(0, y - gap) };
}

/** 예전 배치(줄 단위 flex)·좌표 배치에서 넣은 인라인 값 정리 */
function resetInline(gallery, imgs) {
  gallery.style.height = '';
  imgs.forEach((img) => {
    ['width', 'height', 'flex', 'position', 'left', 'top'].forEach((p) => img.style.removeProperty(p));
  });
}

/**
 * 갤러리 하나를 배치한다 (좌표 배치: 사진을 갤러리 안에 절대 위치로 놓고 갤러리 높이를 맞춘다)
 * @param {HTMLElement} gallery div[data-type="gallery"]
 */
export function layoutGallery(gallery) {
  const imgs = Array.from(gallery.querySelectorAll(':scope > img'));
  if (gallery.dataset.layout !== 'justify') { resetInline(gallery, imgs); return; }
  if (!imgs.length) { gallery.style.height = ''; return; }
  const cs = getComputedStyle(gallery);
  const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  const width = gallery.clientWidth - padL - padR;
  if (width <= 0) return; // 숨김 상태 등 — 보일 때 다시 배치됨

  const GAP = cssPx(cs, '--jm-gallery-gap', DEFAULT_GAP);
  const rowH = cssPx(cs, '--jm-gallery-row-height', DEFAULT_ROW_HEIGHT) || DEFAULT_ROW_HEIGHT;
  const perRow = Math.max(1, Math.round(cssPx(cs, '--jm-gallery-max-per-row', DEFAULT_MAX_PER_ROW)) || DEFAULT_MAX_PER_ROW);
  // 넓은 화면: 4:3 사진 perRow 장이 한 줄을 채우는 높이보다 낮아지지 않게 (줄 높이 = 둘 중 큰 값)
  const fitH = (width - GAP * (perRow - 1)) / perRow / (4 / 3);
  const targetH = Math.max(rowH, fitH);

  const { boxes, height } = computeJustifiedLayout(imgs.map(ratioOf), width, GAP, targetH);

  // 제목(있으면) 아래부터 사진 영역
  const title = gallery.querySelector(':scope > p[data-role="title"]');
  let top = padT;
  if (title && title.offsetParent === gallery) {
    top = title.offsetTop + title.offsetHeight + (parseFloat(getComputedStyle(title).marginBottom) || 0) + GAP;
  }
  imgs.forEach((img, k) => {
    const b = boxes[k];
    img.style.position = 'absolute';
    img.style.flex = 'none';
    img.style.left = `${Math.round(padL + b.x)}px`;
    img.style.top = `${Math.round(top + b.y)}px`;
    img.style.width = `${Math.max(1, Math.floor(b.w))}px`;
    img.style.height = `${Math.max(1, Math.floor(b.h))}px`;
  });
  const contentH = top - padT + height;
  gallery.style.height = `${Math.ceil(cs.boxSizing === 'border-box' ? contentH + padT + padB : contentH)}px`;
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
