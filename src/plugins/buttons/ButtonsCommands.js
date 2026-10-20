/**
 * ButtonsCommands — 버튼 그룹 블록
 * - 저장 HTML: <div data-type="buttons" data-align="left|center|right">
 *               <a href="…" data-role="button" data-style="primary|outline|gray" data-size="sm|md|lg" target="_blank" rel="noopener noreferrer">텍스트</a> …</div>
 *   뷰어는 CSS 만 있으면 된다.
 * - 에디터에서는 레이어(jm-buttons-layer, contenteditable=false)로 감싸고 헤더에서 버튼 추가 / 주소 / 스타일 / 순서 / 삭제 / 정렬을 다룬다.
 *   각 버튼은 contenteditable 로 글자를 바로 고치고, 클릭하면 선택(헤더 조작 대상)된다.
 */
import { BlockDrag } from '../../core/BlockDrag.js';

export const BUTTONS_LAYER_CLASS = 'jm-buttons-layer';
const SELECTED = 'is-selected';
const STYLES = [['primary', '채움'], ['outline', '외곽선'], ['gray', '회색']];
const SIZES = [['sm', '작게'], ['md', '보통'], ['lg', '크게']];

export class ButtonsCommands {
  /**
   * @param {import('../../core/JmEditor.js').JmEditor} editor
   */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
  }

  static template(align = 'center') {
    return `<div data-type="buttons" data-align="${align}">${ButtonsCommands.buttonHTML('버튼', 'https://example.com', 'primary')}</div>`;
  }

  static buttonHTML(text, href, style) {
    return `<a href="${href}" data-role="button" data-style="${style}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  // ───────────── 레이어 ─────────────

  wrapAll() {
    this.root.querySelectorAll('div[data-type="buttons"]').forEach((b) => {
      if (b.parentNode?.classList?.contains(BUTTONS_LAYER_CLASS)) { this.#bindButtons(b); return; }
      this.#wrap(b);
    });
  }

  #wrap(block) {
    const layer = document.createElement('div');
    layer.className = BUTTONS_LAYER_CLASS;
    layer.contentEditable = 'false';
    block.parentNode.insertBefore(layer, block);
    layer.append(this.#buildHeader(block), this.#buildAddRow(block), block);
    this.#bindButtons(block);
    this.#bindReorder(block);
    this.editor.blockDrag?.makeDraggable(block._handle, layer);
    return layer;
  }

  #buildHeader(block) {
    const h = document.createElement('div');
    h.className = 'jm-buttons-header';
    const mk = (label, onClick, cls = '', tip = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `jm-btn jm-buttons-btn ${cls}`.trim(); b.textContent = label; if (tip) b.title = tip;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', onClick);
      return b;
    };
    const mkSelect = (cls, opts, onChange) => {
      const s = document.createElement('select');
      s.className = cls;
      opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
      s.addEventListener('mousedown', (e) => e.stopPropagation());
      s.addEventListener('change', () => onChange(s.value));
      return s;
    };

    const handle = document.createElement('span');
    handle.className = 'jm-block-handle'; handle.title = '끌어서 이동'; handle.textContent = '⠿';
    block._handle = handle;
    const title = document.createElement('span');
    title.className = 'jm-buttons-title'; title.textContent = '버튼';
    const spacer = document.createElement('span'); spacer.className = 'jm-buttons-spacer';

    const add = mk('＋ 버튼 추가', () => this.#toggleAddRow(block));
    // 주소 입력란: 선택한 버튼의 href 를 레이어 안에서 바로 편집
    const url = document.createElement('input');
    url.type = 'text';
    url.className = 'jm-buttons-url needs-sel';
    url.placeholder = '선택한 버튼의 주소 (https://…)';
    url.title = '선택한 버튼의 링크 주소';
    url.addEventListener('mousedown', (e) => e.stopPropagation());
    url.addEventListener('input', () => { const a = this.#selected(block); if (a) this.editor.constructor.setHref(a, url.value.trim() || '#'); });
    url.addEventListener('change', () => this.editor.commit());
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); url.blur(); } });
    block._urlInput = url;
    const style = mkSelect('jm-buttons-style needs-sel', STYLES, (v) => this.setStyle(block, v));
    style.title = '선택한 버튼의 모양';
    const size = mkSelect('jm-buttons-size needs-sel', SIZES, (v) => this.setSize(block, v));
    size.title = '선택한 버튼의 크기';
    const del = mk('선택 삭제', () => this.deleteSelected(block), 'needs-sel');
    const align = mkSelect('jm-buttons-align', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], (v) => { block.dataset.align = v; this.editor.commit(); });
    align.value = block.dataset.align || 'center';
    const remove = mk('✕', () => this.#deleteBlock(block), 'jm-buttons-remove', '블록 삭제');

    h.append(handle, title, spacer, add, url, style, size, del, align, remove);
    block._header = h;
    return h;
  }

  /** 「버튼 추가」 입력줄: 이름 + 주소 → 추가 */
  #buildAddRow(block) {
    const row = document.createElement('div');
    row.className = 'jm-buttons-addrow';
    row.hidden = true;
    row.innerHTML = '<input type="text" class="jm-buttons-addname" placeholder="버튼 이름"><input type="text" class="jm-buttons-addurl" placeholder="https://…"><button type="button" class="jm-btn jm-buttons-btn jm-buttons-addok">추가</button><button type="button" class="jm-btn jm-buttons-btn jm-buttons-addcancel">취소</button>';
    const name = row.querySelector('.jm-buttons-addname'), url = row.querySelector('.jm-buttons-addurl');
    [name, url].forEach((i) => i.addEventListener('mousedown', (e) => e.stopPropagation()));
    const submit = () => {
      const text = name.value.trim();
      if (!text) { name.focus(); return; }
      this.addButton(block, text, url.value.trim() || '#');
      row.hidden = true;
    };
    row.querySelector('.jm-buttons-addok').addEventListener('mousedown', (e) => e.preventDefault());
    row.querySelector('.jm-buttons-addok').addEventListener('click', submit);
    row.querySelector('.jm-buttons-addcancel').addEventListener('mousedown', (e) => e.preventDefault());
    row.querySelector('.jm-buttons-addcancel').addEventListener('click', () => { row.hidden = true; });
    [name, url].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') row.hidden = true; }));
    block._addRow = row;
    return row;
  }

  #toggleAddRow(block) {
    const row = block._addRow;
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) {
      row.querySelector('.jm-buttons-addname').value = '';
      row.querySelector('.jm-buttons-addurl').value = 'https://';
      row.querySelector('.jm-buttons-addname').focus();
    }
  }

  /** 각 버튼: 편집용 래퍼(span.jm-btn-item = 그립 + a) 로 감싸고, 글자 편집 가능, 클릭 시 선택 */
  #bindButtons(block) {
    block.querySelectorAll(':scope > a').forEach((a) => {
      // 래퍼: 드래그 그립 + 버튼. 저장 시 unwrapHTML 에서 제거
      const item = document.createElement('span');
      item.className = 'jm-btn-item';
      item.draggable = true;
      const grip = document.createElement('span');
      grip.className = 'jm-btn-grip';
      grip.title = '끌어서 순서 변경';
      grip.textContent = '⠿';
      grip.addEventListener('mousedown', (e) => e.stopPropagation());
      block.insertBefore(item, a);
      item.append(grip, a);
      a._bound = true;
      a.setAttribute('contenteditable', 'true');
      a.addEventListener('mousedown', () => this.#select(block, a));
      a.addEventListener('focus', () => this.#select(block, a));
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); a.blur(); } });
      a.addEventListener('input', () => this.editor.history.pushDebounced());
      a.addEventListener('blur', () => { if (!a.textContent.trim()) a.textContent = '버튼'; this.editor.commit(); });
      a.addEventListener('click', (e) => e.preventDefault()); // 편집 중 이동 방지
    });
    this.#refreshHeader(block);
  }

  /** 그립 드래그로 버튼 순서 변경 */
  #bindReorder(block) {
    let dragging = null;
    block.addEventListener('dragstart', (e) => {
      const item = e.target.closest?.('.jm-btn-item');
      if (!item || !e.target.closest('.jm-btn-grip') && e.target !== item) { e.preventDefault(); return; } // 글자 선택 드래그는 막고 그립에서만
      dragging = item;
      item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'jm-button-reorder');
      e.stopPropagation();
    });
    block.addEventListener('dragend', () => {
      dragging?.classList.remove('is-dragging');
      block.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      dragging = null;
    });
    block.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      block.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      const over = e.target.closest?.('.jm-btn-item');
      if (over && over !== dragging) {
        const r = over.getBoundingClientRect();
        over.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
      }
    });
    block.addEventListener('drop', (e) => {
      if (!dragging) return;
      e.preventDefault(); e.stopPropagation();
      const over = e.target.closest?.('.jm-btn-item');
      if (over && over !== dragging) {
        const r = over.getBoundingClientRect();
        block.insertBefore(dragging, e.clientX < r.left + r.width / 2 ? over : over.nextSibling);
      } else if (!over) block.appendChild(dragging);
      dragging.classList.remove('is-dragging');
      block.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      dragging = null;
      this.editor.commit();
    });
  }

  #select(block, a) {
    block.querySelectorAll(`a.${SELECTED}`).forEach((x) => x.classList.remove(SELECTED));
    a.classList.add(SELECTED);
    this.#refreshHeader(block);
  }

  #selected(block) { return block.querySelector(`a.${SELECTED}`); }

  #refreshHeader(block) {
    const sel = this.#selected(block);
    block._header?.querySelectorAll('.needs-sel').forEach((el) => { el.disabled = !sel; });
    const style = block._header?.querySelector('.jm-buttons-style');
    if (style && sel) style.value = sel.dataset.style || 'primary';
    const size = block._header?.querySelector('.jm-buttons-size');
    if (size && sel) size.value = sel.dataset.size || 'md';
    if (block._urlInput) block._urlInput.value = sel ? this.editor.constructor.getHref(sel) : '';
  }

  // ───────────── 조작 ─────────────

  addButton(block, text = '버튼', href = '#') {
    const a = document.createElement('a');
    a.textContent = text;
    a.setAttribute('data-role', 'button'); a.setAttribute('data-style', 'primary');
    a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
    this.editor.constructor.setHref(a, href);
    block.appendChild(a);
    this.#bindButtons(block);
    this.#select(block, a);
    this.editor.commit();
  }

  setStyle(block, style) {
    const a = this.#selected(block);
    if (!a) return;
    a.dataset.style = style;
    this.editor.commit();
  }

  setSize(block, size) {
    const a = this.#selected(block);
    if (!a) return;
    if (size === 'md') delete a.dataset.size; else a.dataset.size = size;
    this.editor.commit();
  }

  deleteSelected(block) {
    const a = this.#selected(block);
    if (!a) return;
    (a.closest('.jm-btn-item') || a).remove();
    if (!block.querySelector('a')) { this.#deleteBlock(block); return; }
    this.#refreshHeader(block);
    this.editor.commit();
  }

  #deleteBlock(block) {
    const layer = block.closest(`.${BUTTONS_LAYER_CLASS}`) || block;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 저장용 변환 ─────────────

  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${BUTTONS_LAYER_CLASS}`).forEach((layer) => {
      const block = layer.querySelector('div[data-type="buttons"]');
      if (!block) { layer.remove(); return; }
      block.querySelectorAll('.jm-btn-item').forEach((item) => { const a = item.querySelector('a'); if (a) item.replaceWith(a); else item.remove(); });
      block.querySelectorAll('a').forEach((a) => { a.removeAttribute('contenteditable'); a.classList.remove(SELECTED); if (!a.className) a.removeAttribute('class'); });
      layer.replaceWith(block);
    });
    return tpl.innerHTML;
  }

  static isBlockDrag(e) { return BlockDrag.isBlockDrag(e); }
}
