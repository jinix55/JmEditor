/**
 * ButtonsCommands — 버튼 그룹 블록
 * - 저장 HTML: <div data-type="buttons" data-align="left|center|right">
 *               <a href="…" data-role="button" data-style="primary|outline|soft" data-color="green" data-size="sm|lg"
 *                  data-icon="arrow" data-icon-pos="right" target="_blank" rel="noopener noreferrer">텍스트</a> …</div>
 *   직접 고른 색은 style="--jm-btn: #rrggbb" (+ 밝은 색이면 data-tone="light"). 모양·색·아이콘 정의는 button-theme.js.
 *   뷰어는 CSS 만 있으면 된다 (테두리·오버·연한 배경은 고른 색에서 CSS 가 계산).
 * - 에디터에서는 레이어(jm-buttons-layer, contenteditable=false)로 감싸고 헤더에서 버튼 추가 / 정렬, 선택한 버튼의
 *   주소 / 모양 / 색 / 크기 / 아이콘 / 삭제를 다룬다.
 *   각 버튼은 contenteditable 로 글자를 바로 고치고, 클릭하면 선택(헤더 조작 대상)된다.
 */
import { BlockDrag } from '../../core/BlockDrag.js';
import { Sanitizer } from '../../core/Sanitizer.js';
import { BUTTON_SHAPES, BUTTON_COLORS, BUTTON_ICONS, normalizeHex, toneOf } from './button-theme.js';

export const BUTTONS_LAYER_CLASS = 'jm-buttons-layer';
const SELECTED = 'is-selected';
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
    const target = Sanitizer.isInPageHref(href) ? '' : ' target="_blank" rel="noopener noreferrer"'; // #·tel:·mailto: 는 새 창 아님
    return `<a href="${href}" data-role="button" data-style="${style}"${target}>${text}</a>`;
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
    // 허용되지 않는 주소(javascript: 등)는 저장하지 않고 # 로 두며 입력란을 빨갛게 표시
    url.addEventListener('input', () => {
      const a = this.#selected(block);
      const href = Sanitizer.normalizeHref(url.value);
      url.classList.toggle('is-invalid', !!url.value.trim() && !href);
      if (a) { this.editor.constructor.setHref(a, href || '#'); Sanitizer.applyLinkTarget(a, href || '#'); }
    });
    url.addEventListener('change', () => this.editor.commit());
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); url.blur(); } });
    block._urlInput = url;
    const style = mkSelect('jm-buttons-style needs-sel', BUTTON_SHAPES, (v) => this.setStyle(block, v));
    style.title = '선택한 버튼의 모양';
    // 색: 테마 색 견본 + 직접 선택 (고른 색 하나로 테두리·오버·연한 배경이 자동 계산됨)
    const colors = document.createElement('span');
    colors.className = 'jm-buttons-colors';
    BUTTON_COLORS.forEach(([v, label, hex]) => {
      const sw = mk('', () => this.setColor(block, v), 'jm-buttons-swatch needs-sel', label);
      sw.dataset.color = v;
      sw.style.setProperty('--sw', `var(--jm-btn-${v}, ${hex})`);
      colors.appendChild(sw);
    });
    const custom = mk('직접…', (e) => this.#pickCustomColor(block, e.currentTarget), 'jm-buttons-swatch-custom needs-sel', '색 직접 고르기');
    colors.appendChild(custom);
    const size = mkSelect('jm-buttons-size needs-sel', SIZES, (v) => this.setSize(block, v));
    size.title = '선택한 버튼의 크기';
    const icon = mkSelect('jm-buttons-icon needs-sel', [['', '아이콘 없음'], ...BUTTON_ICONS], (v) => this.setIcon(block, v || null));
    icon.title = '선택한 버튼의 아이콘';
    const iconPos = mkSelect('jm-buttons-iconpos needs-sel', [['left', '글자 앞'], ['right', '글자 뒤']], (v) => this.setIconPos(block, v));
    iconPos.title = '아이콘 위치';
    const del = mk('선택 삭제', () => this.deleteSelected(block), 'needs-sel');
    const align = mkSelect('jm-buttons-align', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], (v) => { block.dataset.align = v; this.editor.commit(); });
    align.value = block.dataset.align || 'center';
    const remove = mk('✕', () => this.#deleteBlock(block), 'jm-buttons-remove', '블록 삭제');
    // 둘째 줄: 선택한 버튼 설정
    const br = document.createElement('span');
    br.className = 'jm-buttons-break';
    const selLabel = document.createElement('span');
    selLabel.className = 'jm-buttons-sellabel';
    selLabel.textContent = '선택한 버튼';

    // 둘째 줄 오른쪽 묶음: 색부터 삭제까지 (줄바꿈돼도 함께 오른쪽 정렬)
    const right = document.createElement('span');
    right.className = 'jm-buttons-right';
    right.append(colors, size, icon, iconPos, del);

    h.append(handle, title, spacer, add, align, remove, br, selLabel, url, style, right);
    block._header = h;
    return h;
  }

  /** 직접 색 고르기: 에디터의 색상 선택기(pickColor)가 있으면 그것을, 없으면 브라우저 기본 색 입력 */
  #pickCustomColor(block, anchor) {
    const apply = (c) => { const hex = normalizeHex(c); if (hex) this.setColor(block, hex); };
    const r = anchor.getBoundingClientRect();
    if (this.editor.options.pickColor) { this.editor.options.pickColor(r.left, r.bottom + 4, (c) => { if (c) apply(c); }); return; }
    const input = document.createElement('input');
    input.type = 'color';
    input.value = normalizeHex(this.#selected(block)?.style.getPropertyValue('--jm-btn')) || '#1d4ed8';
    input.addEventListener('change', () => apply(input.value), { once: true });
    input.click();
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
      } else if (!over) {
        // 빈 곳에 놓으면 커서 좌표(같은 줄 우선, 그 다음 X)에 가장 가까운 위치로
        const ref = ButtonsCommands.nearestAfter(Array.from(block.querySelectorAll(':scope > .jm-btn-item')).filter((i) => i !== dragging), e.clientX, e.clientY);
        block.insertBefore(dragging, ref);
      }
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
    const h = block._header;
    const style = h?.querySelector('.jm-buttons-style');
    if (style && sel) style.value = sel.dataset.style === 'gray' ? 'soft' : (sel.dataset.style || 'primary'); // 예전 회색은 연한색으로 표시
    const size = h?.querySelector('.jm-buttons-size');
    if (size && sel) size.value = sel.dataset.size || 'md';
    // 색: 직접 고른 색이면 「직접…」, 아니면 해당 테마 견본을 표시
    const customHex = sel ? normalizeHex(sel.style.getPropertyValue('--jm-btn')) : null;
    const color = sel ? (sel.dataset.style === 'gray' ? 'gray' : (sel.dataset.color || 'blue')) : null;
    h?.querySelectorAll('.jm-buttons-swatch').forEach((sw) => sw.classList.toggle('is-on', !!sel && !customHex && sw.dataset.color === color));
    const custom = h?.querySelector('.jm-buttons-swatch-custom');
    if (custom) { custom.classList.toggle('is-on', !!customHex); custom.style.setProperty('--sw', customHex || ''); }
    const icon = h?.querySelector('.jm-buttons-icon');
    if (icon && sel) icon.value = sel.dataset.icon || '';
    const iconPos = h?.querySelector('.jm-buttons-iconpos');
    if (iconPos) { if (sel) iconPos.value = sel.dataset.iconPos === 'right' ? 'right' : 'left'; iconPos.disabled = !sel || !sel.dataset.icon; }
    if (block._urlInput) block._urlInput.value = sel ? this.editor.constructor.getHref(sel) : '';
  }

  // ───────────── 조작 ─────────────

  addButton(block, text = '버튼', href = '#') {
    const a = document.createElement('a');
    a.textContent = text;
    a.setAttribute('data-role', 'button'); a.setAttribute('data-style', 'primary');
    const safe = Sanitizer.normalizeHref(href) || '#'; // 허용되지 않는 주소는 #
    this.editor.constructor.setHref(a, safe);
    Sanitizer.applyLinkTarget(a, safe);
    block.appendChild(a);
    this.#bindButtons(block);
    this.#select(block, a);
    this.editor.commit();
  }

  /**
   * 모양 지정 (primary 채움 / outline 외곽선 / soft 연한색). 예전 회색 버튼은 회색 테마로 옮긴다
   * @param {HTMLElement} block
   * @param {string} style
   */
  setStyle(block, style) {
    const a = this.#selected(block);
    if (!a) return;
    if (a.dataset.style === 'gray' && !a.dataset.color && !a.style.getPropertyValue('--jm-btn')) a.dataset.color = 'gray';
    a.dataset.style = style;
    this.#refreshHeader(block);
    this.editor.commit();
  }

  /**
   * 색 지정: 테마 이름(blue·green…) 또는 직접 고른 색(#rrggbb). 직접 색은 밝기에 따라 data-tone 을 함께 기록
   * @param {HTMLElement} block
   * @param {string} value
   */
  setColor(block, value) {
    const a = this.#selected(block);
    if (!a) return;
    if (a.dataset.style === 'gray') a.dataset.style = 'soft';
    const hex = value?.startsWith?.('#') ? normalizeHex(value) : null;
    a.style.removeProperty('--jm-btn');
    delete a.dataset.tone;
    if (hex) {
      delete a.dataset.color;
      a.style.setProperty('--jm-btn', hex);
      if (toneOf(hex) === 'light') a.dataset.tone = 'light';
    } else if (value && value !== 'blue') a.dataset.color = value;
    else delete a.dataset.color;
    if (!a.getAttribute('style')?.trim()) a.removeAttribute('style');
    this.#refreshHeader(block);
    this.editor.commit();
  }

  /**
   * 아이콘 지정 (null 이면 없앰)
   * @param {HTMLElement} block
   * @param {string|null} name
   */
  setIcon(block, name) {
    const a = this.#selected(block);
    if (!a) return;
    if (name) a.dataset.icon = name;
    else { delete a.dataset.icon; delete a.dataset.iconPos; }
    this.#refreshHeader(block);
    this.editor.commit();
  }

  /** 아이콘 위치: left(글자 앞, 기본) / right(글자 뒤) */
  setIconPos(block, pos) {
    const a = this.#selected(block);
    if (!a || !a.dataset.icon) return;
    if (pos === 'right') a.dataset.iconPos = 'right'; else delete a.dataset.iconPos;
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

  /**
   * 좌표 뒤에 와야 할 첫 항목 (삽입 기준). 줄(Y) 을 먼저 비교하고 같은 줄이면 중심 X 로 비교. 없으면 null(맨 뒤)
   */
  static nearestAfter(items, x, y) {
    for (const it of items) {
      const r = it.getBoundingClientRect();
      if (y < r.top) return it;                                   // 위 줄에 놓음 → 이 항목 앞
      if (y <= r.bottom && x < r.left + r.width / 2) return it;   // 같은 줄, 왼쪽 절반 → 이 항목 앞
    }
    return null;
  }

  static isBlockDrag(e) { return BlockDrag.isBlockDrag(e); }
}
