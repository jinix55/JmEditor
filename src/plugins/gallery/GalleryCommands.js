/**
 * GalleryCommands
 * - 이미지 갤러리 블록: 저장 HTML 은 <div data-type="gallery" data-cols="N" data-auto="1"><p data-role="title">제목</p><img …>…</div>
 *   제목은 선택 사항. 비어 있으면 저장 시 제거되어 뷰어에는 제목 없이 이미지만 보인다.
 * - 에디터 안에서는 레이어(<div class="jm-gallery-layer" contenteditable="false">) 로 감싸고
 *   헤더(이미지 추가 / 선택 삭제 / 전체 삭제 / 열 수)를 붙인다. 저장 시 레이어·헤더·선택 상태는 제거된다.
 * - 이미지는 CSS grid 로 data-cols 열에 균등 배치. data-auto="1" 이면 개수에 따라 열 수를 자동 계산한다.
 * - 갤러리 위에 이미지 파일을 드롭하거나 헤더 「이미지 추가」로 여러 장을 넣을 수 있다.
 */
import { layoutGallery, stampSize } from './gallery-layout.js';

export const GALLERY_LAYER_CLASS = 'jm-gallery-layer';
const SELECTED_CLASS = 'is-selected';
const DEFAULT_LAYOUT = 'justify'; // 'justify'(비율 유지, 줄 채움) | 'cover'(칸 고정, 잘라 채움)
const MAX_AUTO_COLS = 4;

export class GalleryCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;

    // 여러 장 선택용 숨김 input (레이어 공용)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.multiple = true;
    this.fileInput.hidden = true;
    this.root.parentNode?.appendChild(this.fileInput) ?? document.body.appendChild(this.fileInput);
    this.pendingGallery = null;
    this.fileInput.addEventListener('change', async () => {
      const files = Array.from(this.fileInput.files);
      this.fileInput.value = '';
      if (this.pendingGallery) await this.addFiles(this.pendingGallery, files);
    });
  }

  // ───────────── 생성 / 레이어 ─────────────

  /** 갤러리 블록 HTML (서식 삽입용) */
  static template(cols = 3, auto = true, layout = DEFAULT_LAYOUT) {
    return `<div data-type="gallery" data-cols="${cols}"${auto ? ' data-auto="1"' : ''} data-layout="${layout}"></div>`;
  }

  /** 루트 안의 갤러리 요소를 모두 레이어로 감싼다 (setHTML / commit 후) */
  wrapAll() {
    this.root.querySelectorAll('div[data-type="gallery"]').forEach((g) => {
      if (g.parentNode?.classList?.contains(GALLERY_LAYER_CLASS)) { this.#layout(g); return; }
      this.#wrap(g);
    });
  }

  #wrap(gallery) {
    const layer = document.createElement('div');
    layer.className = GALLERY_LAYER_CLASS;
    layer.contentEditable = 'false';
    gallery.parentNode.insertBefore(layer, gallery);
    layer.append(this.#buildHeader(gallery), gallery);
    gallery.classList.add('jm-gallery');
    if (!gallery.dataset.layout) gallery.dataset.layout = DEFAULT_LAYOUT;
    this.#ensureTitle(gallery);
    this.#bindGallery(gallery);
    gallery.querySelectorAll('img').forEach(stampSize);
    // 폭 변경·이미지 로드 시 재배치
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layoutGallery(gallery)).observe(gallery);
    gallery.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') { stampSize(e.target); layoutGallery(gallery); } }, true);
    this.#layout(gallery);
    return layer;
  }

  /** 제목 요소 보장: 없으면 빈 제목(placeholder) 생성. 레이어는 편집 불가지만 제목만 편집 가능 */
  #ensureTitle(gallery) {
    let t = gallery.querySelector(':scope > p[data-role="title"]');
    if (!t) {
      t = document.createElement('p');
      t.dataset.role = 'title';
      gallery.insertBefore(t, gallery.firstChild);
    }
    t.setAttribute('contenteditable', 'true');
    t.dataset.placeholder = '제목 (비워두면 표시되지 않음)';
    // 제목에서 Enter → 줄바꿈 대신 제목 확정(포커스 해제), 입력 시 변경 기록
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } });
    t.addEventListener('input', () => this.editor.history.pushDebounced());
    t.addEventListener('blur', () => this.editor.commit());
  }

  /** 헤더: 이미지 추가 / 선택 삭제 / 전체 삭제 / 열 수 */
  #buildHeader(gallery) {
    const h = document.createElement('div');
    h.className = 'jm-gallery-header';

    const title = document.createElement('span');
    title.className = 'jm-gallery-title';
    title.textContent = '이미지 갤러리';

    const mk = (label, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `jm-btn jm-gallery-btn ${cls}`.trim();
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', onClick);
      return b;
    };

    const add = mk('＋ 이미지 추가', () => { this.pendingGallery = gallery; this.fileInput.click(); });
    const delSel = mk('선택 삭제', () => this.deleteSelected(gallery), 'jm-gallery-delsel');
    const delAll = mk('전체 삭제', () => this.deleteAll(gallery));

    // 열 수: 자동 / 1~6
    const cols = document.createElement('select');
    cols.className = 'jm-gallery-cols';
    cols.title = '열 수';
    [['auto', '자동'], ['1', '1열'], ['2', '2열'], ['3', '3열'], ['4', '4열'], ['5', '5열'], ['6', '6열']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; cols.appendChild(o);
    });
    cols.value = gallery.dataset.auto === '1' ? 'auto' : (gallery.dataset.cols || '3');
    cols.addEventListener('mousedown', (e) => e.stopPropagation());
    cols.addEventListener('change', () => {
      if (cols.value === 'auto') gallery.dataset.auto = '1';
      else { delete gallery.dataset.auto; gallery.dataset.cols = cols.value; }
      this.#layout(gallery);
      this.editor.commit();
    });

    // 배치 방식: 비율 유지(줄 채움) / 칸 고정(잘라 채움)
    const layout = document.createElement('select');
    layout.className = 'jm-gallery-layout';
    layout.title = '배치 방식';
    [['justify', '비율 유지'], ['cover', '잘라 채움']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; layout.appendChild(o);
    });
    layout.value = gallery.dataset.layout || DEFAULT_LAYOUT;
    layout.addEventListener('mousedown', (e) => e.stopPropagation());
    layout.addEventListener('change', () => { gallery.dataset.layout = layout.value; this.#layout(gallery); this.editor.commit(); });

    // 정렬: 가로를 다 못 채운 줄(주로 마지막 줄)을 어디에 둘지
    const align = document.createElement('select');
    align.className = 'jm-gallery-align';
    align.title = '정렬';
    [['left', '왼쪽'], ['center', '중앙'], ['right', '오른쪽']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; align.appendChild(o);
    });
    align.value = gallery.dataset.align || 'left';
    align.addEventListener('mousedown', (e) => e.stopPropagation());
    align.addEventListener('change', () => {
      if (align.value === 'left') delete gallery.dataset.align; else gallery.dataset.align = align.value;
      this.editor.commit();
    });

    const count = document.createElement('span');
    count.className = 'jm-gallery-count';
    gallery._countEl = count;

    const up = mk('▲', () => this.moveBlock(gallery, -1), 'jm-gallery-move');
    up.title = '위로 이동';
    const down = mk('▼', () => this.moveBlock(gallery, 1), 'jm-gallery-move');
    down.title = '아래로 이동';

    const remove = mk('✕', () => this.deleteGallery(gallery), 'jm-gallery-remove');
    remove.title = '갤러리 삭제';

    h.append(title, count, add, delSel, delAll, cols, layout, align, up, down, remove);
    return h;
  }

  /** 갤러리 요소 이벤트: 이미지 클릭 선택 토글, 파일 드롭 */
  #bindGallery(gallery) {
    gallery.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (!img) return;
      img.classList.toggle(SELECTED_CLASS);
      this.#refreshHeader(gallery);
    });
    // 사진 순서 이동: 갤러리 안의 img 를 드래그해 다른 img 앞/뒤에 놓는다
    let dragging = null;
    gallery.addEventListener('dragstart', (e) => {
      const img = e.target.closest?.('img');
      if (!img || img.parentNode !== gallery) return;
      dragging = img;
      img.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'jm-gallery-reorder'); // Firefox 는 데이터가 있어야 드래그 시작
    });
    gallery.addEventListener('dragend', () => {
      dragging?.classList.remove('is-dragging');
      gallery.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      dragging = null;
    });
    gallery.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragging) {
        // 마우스가 대상 이미지의 왼쪽 절반이면 앞, 오른쪽 절반이면 뒤
        e.dataTransfer.dropEffect = 'move';
        gallery.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        const over = e.target.closest?.('img');
        if (over && over !== dragging && over.parentNode === gallery) {
          const r = over.getBoundingClientRect();
          over.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
        }
        return;
      }
      gallery.classList.add('is-dragover');
    });
    gallery.addEventListener('dragleave', (e) => { if (!gallery.contains(e.relatedTarget)) gallery.classList.remove('is-dragover'); });
    gallery.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      gallery.classList.remove('is-dragover');
      if (dragging) {
        const over = e.target.closest?.('img');
        if (over && over !== dragging && over.parentNode === gallery) {
          const r = over.getBoundingClientRect();
          const before = e.clientX < r.left + r.width / 2;
          gallery.insertBefore(dragging, before ? over : over.nextSibling);
        } else if (!over) {
          gallery.appendChild(dragging); // 빈 영역에 놓으면 맨 뒤로
        }
        this.#layout(gallery);
        this.editor.commit();
        return;
      }
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) await this.addFiles(gallery, files);
    });
  }

  /** 열 수 계산·적용 + 빈 상태 표시 + 헤더 갱신 */
  #layout(gallery) {
    const n = gallery.querySelectorAll('img').length;
    if (gallery.dataset.auto === '1') gallery.dataset.cols = String(Math.max(1, Math.min(MAX_AUTO_COLS, n)));
    gallery.style.setProperty('--jm-cols', gallery.dataset.cols || '3');
    gallery.classList.toggle('is-empty', n === 0);
    layoutGallery(gallery);
    this.#refreshHeader(gallery);
  }

  #refreshHeader(gallery) {
    const n = gallery.querySelectorAll('img').length;
    const s = gallery.querySelectorAll(`img.${SELECTED_CLASS}`).length;
    if (gallery._countEl) gallery._countEl.textContent = n ? `${n}장${s ? ` · ${s}장 선택` : ''}` : '이미지를 드롭하거나 추가하세요';
    const btn = gallery.parentNode?.querySelector('.jm-gallery-delsel');
    if (btn) btn.disabled = s === 0;
  }

  // ───────────── 이미지 추가 / 삭제 ─────────────

  /** 파일들을 업로드(또는 base64)하여 갤러리에 추가 */
  async addFiles(gallery, files) {
    for (const file of files) {
      const src = this.editor.options.uploadImage
        ? await this.editor.options.uploadImage(file)
        : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const img = document.createElement('img');
      img.alt = file.name;
      // 원본 크기를 width/height 속성에 기록한 뒤 붙임 (저장 HTML 에 비율 포함)
      await new Promise((resolve) => { img.onload = () => { stampSize(img); resolve(); }; img.onerror = resolve; img.src = src; });
      gallery.appendChild(img);
    }
    this.#layout(gallery);
    this.editor.commit();
  }

  deleteSelected(gallery) {
    gallery.querySelectorAll(`img.${SELECTED_CLASS}`).forEach((img) => img.remove());
    this.#layout(gallery);
    this.editor.commit();
  }

  deleteAll(gallery) {
    gallery.querySelectorAll('img').forEach((img) => img.remove());
    this.#layout(gallery);
    this.editor.commit();
  }

  /**
   * 갤러리 블록을 문서에서 위/아래로 한 칸 이동 (앞·뒤 형제 블록과 자리 바꿈)
   * @param {HTMLElement} gallery
   * @param {-1|1} dir
   */
  moveBlock(gallery, dir) {
    const layer = gallery.closest(`.${GALLERY_LAYER_CLASS}`) || gallery;
    const sibling = dir < 0 ? layer.previousElementSibling : layer.nextElementSibling;
    if (!sibling) return;
    if (dir < 0) layer.parentNode.insertBefore(layer, sibling);
    else layer.parentNode.insertBefore(sibling, layer);
    layer.scrollIntoView({ block: 'nearest' });
    this.editor.commit();
  }

  /** 갤러리 블록 자체 삭제 → 빈 단락으로 대체 */
  deleteGallery(gallery) {
    const layer = gallery.closest(`.${GALLERY_LAYER_CLASS}`) || gallery;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 저장용 변환 ─────────────

  /**
   * 레이어·헤더·선택 상태·인라인 스타일 제거 (getHTML 에서 호출)
   * @param {string} html
   */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${GALLERY_LAYER_CLASS}`).forEach((layer) => {
      const g = layer.querySelector('div[data-type="gallery"]');
      if (!g) { layer.remove(); return; }
      g.removeAttribute('class');
      g.removeAttribute('style');
      g.querySelectorAll('img').forEach((img) => { img.removeAttribute('class'); img.removeAttribute('style'); });
      // 제목: 편집 속성 제거, 비어 있으면 통째로 제거
      const t = g.querySelector(':scope > p[data-role="title"]');
      if (t) {
        if (!t.textContent.replace(/\u200B/g, '').trim()) t.remove();
        else { t.removeAttribute('contenteditable'); t.removeAttribute('data-placeholder'); }
      }
      layer.replaceWith(g);
    });
    return tpl.innerHTML;
  }

  destroy() { this.fileInput.remove(); }
}
