/**
 * SliderCommands — 이미지 슬라이드 블록 (자동 로테이션)
 * - 저장 HTML: <div data-type="slider" data-interval="3000" data-ratio="16:9" data-indicator="dots" data-width="100" data-align="center">
 *               <p data-role="title">제목</p><img …>…</div>
 *   제목은 선택. 동작(전환·화살표·점)은 slider-runtime.js, 모양은 CSS. 뷰어에는 둘 다 필요.
 * - 에디터에서는 레이어(jm-slider-layer)로 감싸 헤더(이미지 추가 / 선택 삭제 / 전체 삭제 / 전환 간격 / 비율 / 삭제)와
 *   썸네일 줄(클릭 선택, 드래그 순서 변경, 파일 드롭 추가)을 붙인다. 본 화면은 런타임으로 실제처럼 돌아간다.
 */
import { BlockDrag } from '../../core/BlockDrag.js';
import { initSlider, stripSliderUI } from './slider-runtime.js';
import { stampSize } from '../gallery/gallery-layout.js';

export const SLIDER_LAYER_CLASS = 'jm-slider-layer';
const SLIDER_SELECTED = 'is-selected';

export class SliderCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file'; this.fileInput.accept = 'image/*'; this.fileInput.multiple = true; this.fileInput.hidden = true;
    (this.root.parentNode || document.body).appendChild(this.fileInput);
    this.pending = null;
    this.fileInput.addEventListener('change', async () => {
      const files = Array.from(this.fileInput.files);
      this.fileInput.value = '';
      if (this.pending) await this.addFiles(this.pending, files);
    });
  }

  static template(interval = 3000, ratio = '16:9') {
    return `<div data-type="slider" data-interval="${interval}" data-ratio="${ratio}" data-indicator="dots" data-indicator-pos="bottom-center" data-width="100" data-align="center"></div>`;
  }

  // ───────────── 레이어 ─────────────

  wrapAll() {
    this.root.querySelectorAll('div[data-type="slider"]').forEach((b) => {
      if (b.parentNode?.classList?.contains(SLIDER_LAYER_CLASS)) { initSlider(b); this.#refreshThumbs(b); return; }
      this.#wrap(b);
    });
  }

  #wrap(block) {
    const layer = document.createElement('div');
    layer.className = SLIDER_LAYER_CLASS;
    layer.contentEditable = 'false';
    block.parentNode.insertBefore(layer, block);

    const thumbs = document.createElement('div');
    thumbs.className = 'jm-slider-thumbs';
    block._thumbs = thumbs;

    layer.append(this.#buildHeader(block), block, thumbs);
    this.#ensureTitle(block);
    block.querySelectorAll('img').forEach(stampSize);
    initSlider(block);
    this.#bindThumbs(block);
    this.#refreshThumbs(block);
    this.editor.blockDrag?.makeDraggable(block._handle, layer);
    return layer;
  }

  #buildHeader(block) {
    const h = document.createElement('div');
    h.className = 'jm-slider-header';
    const mk = (label, onClick, cls = '', tip = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `jm-btn jm-slider-btn ${cls}`.trim(); b.textContent = label; if (tip) b.title = tip;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', onClick);
      return b;
    };
    const mkSelect = (cls, opts, cur, onChange, tip) => {
      const s = document.createElement('select');
      s.className = cls; s.title = tip;
      opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
      s.value = cur;
      s.addEventListener('mousedown', (e) => e.stopPropagation());
      s.addEventListener('change', () => { onChange(s.value); this.editor.commit(); });
      return s;
    };
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle'; handle.title = '끌어서 이동'; handle.textContent = '⠿';
    block._handle = handle;
    const title = document.createElement('span'); title.className = 'jm-slider-title'; title.textContent = '슬라이드';
    const count = document.createElement('span'); count.className = 'jm-slider-count'; block._countEl = count;

    const add = mk('＋ 이미지 추가', () => { this.pending = block; this.fileInput.click(); });
    const delSel = mk('선택 삭제', () => this.deleteSelected(block), 'jm-slider-delsel');
    const delAll = mk('전체 삭제', () => this.deleteAll(block));
    const interval = mkSelect('jm-slider-interval', [['0', '수동'], ['2000', '2초'], ['3000', '3초'], ['5000', '5초'], ['8000', '8초']], String(parseInt(block.dataset.interval, 10) || 0), (v) => { block.dataset.interval = v; block._slider?.refresh(); }, '자동 전환 간격');
    const ratio = mkSelect('jm-slider-ratio', [['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1'], ['21:9', '21:9']], block.dataset.ratio || '16:9', (v) => { block.dataset.ratio = v; }, '화면 비율');
    const indicator = mkSelect('jm-slider-indicator', [['dots', '점'], ['numbers', '숫자'], ['bars', '막대'], ['none', '표시 없음']], block.dataset.indicator || 'dots', (v) => { block.dataset.indicator = v; block._slider?.refresh(); }, '인디케이터');
    const indPos = mkSelect('jm-slider-indpos', [['bottom-center', '아래 가운데'], ['bottom-left', '아래 왼쪽'], ['bottom-right', '아래 오른쪽'], ['top-left', '위 왼쪽'], ['top-center', '위 가운데'], ['top-right', '위 오른쪽'], ['below', '이미지 밖 아래']], block.dataset.indicatorPos || 'bottom-center', (v) => { block.dataset.indicatorPos = v; block._slider?.refresh(); }, '인디케이터 위치');
    const width = mkSelect('jm-slider-width', [['100', '폭 100%'], ['75', '폭 75%'], ['50', '폭 50%']], block.dataset.width || '100', (v) => { block.dataset.width = v; }, '본문에서 보이는 폭');
    const align = mkSelect('jm-slider-align', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], block.dataset.align || 'center', (v) => { block.dataset.align = v; }, '정렬');
    const remove = mk('✕', () => this.#deleteBlock(block), 'jm-slider-remove', '슬라이드 삭제');
    h.append(handle, title, count, add, delSel, delAll, interval, ratio, indicator, indPos, width, align, remove);
    return h;
  }

  /** 제목(선택) — 갤러리와 같은 규칙 */
  #ensureTitle(block) {
    let t = block.querySelector(':scope > p[data-role="title"]');
    if (!t) { t = document.createElement('p'); t.dataset.role = 'title'; block.insertBefore(t, block.firstChild); }
    t.setAttribute('contenteditable', 'true');
    t.dataset.placeholder = '제목 (비워두면 표시되지 않음)';
    t.addEventListener('mousedown', (e) => e.stopPropagation());
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } });
    t.addEventListener('blur', () => this.editor.commit());
  }

  // ───────────── 썸네일 줄: 선택 / 드래그 순서 / 파일 드롭 ─────────────

  #bindThumbs(block) {
    const thumbs = block._thumbs;
    let dragging = null;
    thumbs.addEventListener('click', (e) => {
      const t = e.target.closest('.jm-slider-thumb');
      if (!t) return;
      thumbs.querySelectorAll(`.${SLIDER_SELECTED}`).forEach((x) => x.classList.remove(SLIDER_SELECTED));
      t.classList.add(SLIDER_SELECTED);
      block._slider?.go(+t.dataset.index);
      this.#refreshHeader(block);
    });
    thumbs.addEventListener('dragstart', (e) => {
      const t = e.target.closest?.('.jm-slider-thumb');
      if (!t) return;
      dragging = t; t.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'jm-slider-reorder');
    });
    thumbs.addEventListener('dragend', () => { dragging?.classList.remove('is-dragging'); dragging = null; thumbs.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); });
    thumbs.addEventListener('dragover', (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      e.preventDefault();
      if (!dragging) { thumbs.classList.add('is-dragover'); return; }
      thumbs.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      const over = e.target.closest?.('.jm-slider-thumb');
      if (over && over !== dragging) { const r = over.getBoundingClientRect(); over.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after'); }
    });
    thumbs.addEventListener('dragleave', (e) => { if (!thumbs.contains(e.relatedTarget)) thumbs.classList.remove('is-dragover'); });
    thumbs.addEventListener('drop', async (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      e.preventDefault(); e.stopPropagation();
      thumbs.classList.remove('is-dragover');
      if (dragging) {
        const imgs = Array.from(block.querySelectorAll(':scope > img'));
        const from = imgs[+dragging.dataset.index];
        const over = e.target.closest?.('.jm-slider-thumb');
        let ref = null;
        if (over && over !== dragging) { const r = over.getBoundingClientRect(); const to = imgs[+over.dataset.index]; ref = e.clientX < r.left + r.width / 2 ? to : to.nextElementSibling; }
        else { const others = Array.from(thumbs.querySelectorAll('.jm-slider-thumb')).filter((t) => t !== dragging); for (const t of others) { const r = t.getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { ref = imgs[+t.dataset.index]; break; } } }
        // ref 가 img 가 아닌 경우(끝) 처리
        if (ref && ref.tagName !== 'IMG') ref = null;
        block.insertBefore(from, ref);
        dragging = null;
        this.#after(block);
        return;
      }
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) await this.addFiles(block, files);
    });
    // 본 화면에 드롭해도 추가
    block.addEventListener('dragover', (e) => { if (!BlockDrag.isBlockDrag(e)) e.preventDefault(); });
    block.addEventListener('drop', async (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      await this.addFiles(block, files);
    });
  }

  #refreshThumbs(block) {
    const thumbs = block._thumbs;
    if (!thumbs) return;
    const selIdx = thumbs.querySelector(`.${SLIDER_SELECTED}`)?.dataset.index;
    thumbs.innerHTML = '';
    const imgs = Array.from(block.querySelectorAll(':scope > img'));
    imgs.forEach((img, i) => {
      const t = document.createElement('div');
      t.className = 'jm-slider-thumb' + (String(i) === selIdx ? ` ${SLIDER_SELECTED}` : '');
      t.draggable = true; t.dataset.index = i; t.title = '클릭: 보기 · 드래그: 순서';
      const im = document.createElement('img'); im.src = img.src; im.alt = ''; im.draggable = false;
      t.appendChild(im);
      thumbs.appendChild(t);
    });
    thumbs.classList.toggle('is-empty', imgs.length === 0);
    this.#refreshHeader(block);
  }

  #refreshHeader(block) {
    const n = block.querySelectorAll(':scope > img').length;
    const s = block._thumbs?.querySelector(`.${SLIDER_SELECTED}`);
    if (block._countEl) block._countEl.textContent = n ? `${n}장` : '이미지를 추가하세요';
    const btn = block.parentNode?.querySelector('.jm-slider-delsel');
    if (btn) btn.disabled = !s;
  }

  // ───────────── 이미지 추가 / 삭제 ─────────────

  async addFiles(block, files) {
    for (const file of files) {
      const src = this.editor.options.uploadImage
        ? await this.editor.options.uploadImage(file)
        : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const img = document.createElement('img');
      img.alt = file.name;
      await new Promise((resolve) => { img.onload = () => { stampSize(img); resolve(); }; img.onerror = resolve; img.src = src; });
      block.appendChild(img);
    }
    this.#after(block);
  }

  deleteSelected(block) {
    const t = block._thumbs?.querySelector(`.${SLIDER_SELECTED}`);
    if (!t) return;
    block.querySelectorAll(':scope > img')[+t.dataset.index]?.remove();
    this.#after(block);
  }

  deleteAll(block) {
    block.querySelectorAll(':scope > img').forEach((i) => i.remove());
    this.#after(block);
  }

  #deleteBlock(block) {
    block._slider?.destroy();
    const layer = block.closest(`.${SLIDER_LAYER_CLASS}`) || block;
    const p = document.createElement('p'); p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  #after(block) {
    block._slider?.refresh();
    this.#refreshThumbs(block);
    this.editor.commit();
  }

  // ───────────── 저장용 변환 ─────────────

  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${SLIDER_LAYER_CLASS}`).forEach((layer) => {
      const block = layer.querySelector('div[data-type="slider"]');
      if (!block) { layer.remove(); return; }
      const t = block.querySelector(':scope > p[data-role="title"]');
      if (t) { if (!t.textContent.replace(/​/g, '').trim()) t.remove(); else { t.removeAttribute('contenteditable'); t.removeAttribute('data-placeholder'); } }
      layer.replaceWith(block);
    });
    return stripSliderUI(tpl.innerHTML);
  }

  destroy() { this.fileInput.remove(); }
}
