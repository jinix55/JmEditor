/**
 * ButtonsCommands — 버튼 그룹 블록
 * - 저장 HTML: <div data-type="buttons" data-align="left|center|right">
 *               <a href="…" data-role="button" data-style="primary|outline|gray" target="_blank" rel="noopener noreferrer">텍스트</a> …</div>
 *   뷰어는 CSS 만 있으면 된다.
 * - 에디터에서는 레이어(jm-buttons-layer, contenteditable=false)로 감싸고 헤더에서 버튼 추가 / 주소 / 스타일 / 순서 / 삭제 / 정렬을 다룬다.
 *   각 버튼은 contenteditable 로 글자를 바로 고치고, 클릭하면 선택(헤더 조작 대상)된다.
 */
import { BlockDrag } from '../../core/BlockDrag.js';

export const BUTTONS_LAYER_CLASS = 'jm-buttons-layer';
const SELECTED = 'is-selected';
const STYLES = [['primary', '채움'], ['outline', '외곽선'], ['gray', '회색']];

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
    layer.append(this.#buildHeader(block), block);
    this.#bindButtons(block);
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

    const add = mk('＋ 버튼 추가', () => this.addButton(block));
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
    const left = mk('◀', () => this.move(block, -1), 'needs-sel', '선택한 버튼을 앞으로');
    const right = mk('▶', () => this.move(block, 1), 'needs-sel', '선택한 버튼을 뒤로');
    const del = mk('선택 삭제', () => this.deleteSelected(block), 'needs-sel');
    const align = mkSelect('jm-buttons-align', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], (v) => { block.dataset.align = v; this.editor.commit(); });
    align.value = block.dataset.align || 'center';
    const remove = mk('✕', () => this.#deleteBlock(block), 'jm-buttons-remove', '블록 삭제');

    h.append(handle, title, spacer, add, url, style, left, right, del, align, remove);
    block._header = h;
    return h;
  }

  /** 각 버튼: 글자 편집 가능, 클릭 시 선택 */
  #bindButtons(block) {
    block.querySelectorAll(':scope > a').forEach((a) => {
      if (a._bound) return;
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

  #select(block, a) {
    block.querySelectorAll(`:scope > a.${SELECTED}`).forEach((x) => x.classList.remove(SELECTED));
    a.classList.add(SELECTED);
    this.#refreshHeader(block);
  }

  #selected(block) { return block.querySelector(`:scope > a.${SELECTED}`); }

  #refreshHeader(block) {
    const sel = this.#selected(block);
    block._header?.querySelectorAll('.needs-sel').forEach((el) => { el.disabled = !sel; });
    const style = block._header?.querySelector('.jm-buttons-style');
    if (style && sel) style.value = sel.dataset.style || 'primary';
    if (block._urlInput) block._urlInput.value = sel ? this.editor.constructor.getHref(sel) : '';
  }

  // ───────────── 조작 ─────────────

  addButton(block) {
    const tpl = document.createElement('template');
    tpl.innerHTML = ButtonsCommands.buttonHTML('버튼', 'https://example.com', 'primary');
    const a = tpl.content.firstChild;
    this.editor.constructor.setHref(a, a.getAttribute('href'));
    block.appendChild(a);
    this.#bindButtons(block);
    this.#select(block, a);
    a.focus();
    this.editor.commit();
  }

  setStyle(block, style) {
    const a = this.#selected(block);
    if (!a) return;
    a.dataset.style = style;
    this.editor.commit();
  }

  move(block, dir) {
    const a = this.#selected(block);
    if (!a) return;
    const sib = dir < 0 ? a.previousElementSibling : a.nextElementSibling;
    if (!sib) return;
    if (dir < 0) block.insertBefore(a, sib); else block.insertBefore(sib, a);
    this.editor.commit();
  }

  deleteSelected(block) {
    const a = this.#selected(block);
    if (!a) return;
    a.remove();
    if (!block.querySelector(':scope > a')) { this.#deleteBlock(block); return; }
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
      block.querySelectorAll('a').forEach((a) => { a.removeAttribute('contenteditable'); a.classList.remove(SELECTED); if (!a.className) a.removeAttribute('class'); });
      layer.replaceWith(block);
    });
    return tpl.innerHTML;
  }

  static isBlockDrag(e) { return BlockDrag.isBlockDrag(e); }
}
