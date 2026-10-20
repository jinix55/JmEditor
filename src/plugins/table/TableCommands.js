/**
 * TableCommands
 * - 표 삽입 / 행·열 추가·삭제 / 표 삭제 / Tab 셀 이동.
 * - 셀 병합(colspan/rowspan), 열 너비 조절은 지원하지 않는다 (2차 범위).
 * - 표는 항상 <table><tbody><tr><td>…</td></tr></tbody></table> 구조를 유지한다.
 * - 에디터 안에서는 표를 레이어(<div class="jm-table-layer" contenteditable="false">) 로 감싸 하나의 객체처럼 다룬다.
 *   셀 내부만 편집 가능하게 하고, 레이어 우클릭 시 표 메뉴를 띄운다. 저장 HTML 에는 레이어를 남기지 않는다.
 */
export const TABLE_LAYER_CLASS = 'jm-table-layer';

export class TableCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
  }

  // ───────────── 레이어 ─────────────

  /** 루트 안의 모든 table 을 레이어로 감싼다 (setHTML / 붙여넣기 후 호출) */
  wrapAll() {
    this.root.querySelectorAll('table').forEach((t) => {
      if (t.parentNode?.classList?.contains(TABLE_LAYER_CLASS)) return;
      this.#wrap(t);
    });
  }

  /** table 하나를 레이어로 감싼다 */
  #wrap(table) {
    const layer = document.createElement('div');
    layer.className = TABLE_LAYER_CLASS;
    layer.contentEditable = 'false';           // 레이어 자체는 편집 불가
    table.parentNode.insertBefore(layer, table);
    // 드래그 핸들 (끌어서 블록 위치 이동). 저장 시 레이어와 함께 제거됨
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle jm-table-handle';
    handle.title = '끌어서 이동 · 표 위에서 우클릭하면 편집 메뉴';
    handle.textContent = '⠿';
    layer.append(handle, table);
    table.contentEditable = 'true';            // 셀 내부만 편집 가능
    this.editor.blockDrag?.makeDraggable(handle, layer);
    return layer;
  }

  /**
   * 저장용 HTML 에서 레이어 제거 (getHTML 에서 호출)
   * @param {string} html
   * @returns {string}
   */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${TABLE_LAYER_CLASS}`).forEach((layer) => {
      const table = layer.querySelector('table');
      if (table) { table.removeAttribute('contenteditable'); layer.replaceWith(table); }
      else layer.remove();
    });
    return tpl.innerHTML;
  }

  /** 현재 셀 배경색 지정 (null 이면 해제) */
  setCellBackground(color) {
    const cell = this.getCell();
    if (!cell) return;
    if (color) cell.style.backgroundColor = color;
    else { cell.style.removeProperty('background-color'); if (!cell.getAttribute('style')?.trim()) cell.removeAttribute('style'); }
    this.editor.commit();
  }

  /** 현재 행 전체 배경색 지정 */
  setRowBackground(color) {
    const cell = this.getCell();
    if (!cell) return;
    Array.from(cell.parentNode.cells).forEach((c) => {
      if (color) c.style.backgroundColor = color;
      else { c.style.removeProperty('background-color'); if (!c.getAttribute('style')?.trim()) c.removeAttribute('style'); }
    });
    this.editor.commit();
  }

  /**
   * 우클릭 메뉴 항목 (커서가 표 안일 때만 유효)
   * @param {(cb: (color: string|null) => void) => void} [pickColor] 색상 선택 UI 를 띄우는 콜백 (래퍼가 주입)
   */
  getMenuItems(pickColor) {
    const colorItems = pickColor ? [
      { divider: true },
      { label: '셀 배경색…', action: () => pickColor((c) => this.setCellBackground(c)) },
      { label: '행 배경색…', action: () => pickColor((c) => this.setRowBackground(c)) },
    ] : [];
    return [
      { label: '위에 행 추가', action: () => this.addRow(false) },
      { label: '아래에 행 추가', action: () => this.addRow(true) },
      { divider: true },
      { label: '왼쪽에 열 추가', action: () => this.addColumn(false) },
      { label: '오른쪽에 열 추가', action: () => this.addColumn(true) },
      { divider: true },
      { label: '행 삭제', action: () => this.deleteRow() },
      { label: '열 삭제', action: () => this.deleteColumn() },
      ...colorItems,
      { divider: true },
      { label: '표 삭제', action: () => this.deleteTable() },
    ];
  }

  // ───────────── 조회 ─────────────

  /** 커서가 속한 td/th, 없으면 null */
  getCell() {
    return this.sel.closest('td') || this.sel.closest('th');
  }

  /** 커서가 속한 table, 없으면 null */
  getTable() {
    return this.sel.closest('table');
  }

  /** 셀의 (행, 열) 인덱스 */
  #indexOf(cell) {
    const row = cell.parentNode;
    return { row, rowIndex: row.rowIndex, colIndex: cell.cellIndex };
  }

  /** 빈 셀 생성 (br 을 넣어 커서가 들어갈 수 있게) */
  #makeCell(tag = 'td') {
    const c = document.createElement(tag);
    c.appendChild(document.createElement('br'));
    return c;
  }

  // ───────────── 삽입 ─────────────

  /**
   * 표 삽입. 커서가 있는 블록 뒤에 넣고, 첫 셀로 커서 이동.
   * @param {number} rows
   * @param {number} cols
   * @param {boolean} header 첫 행을 th 로
   */
  insert(rows = 3, cols = 3, header = true) {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) tr.appendChild(this.#makeCell(header && r === 0 ? 'th' : 'td'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const block = this.sel.getBlock();
    if (block && !this.getTable()) block.parentNode.insertBefore(table, block.nextSibling);
    else this.root.appendChild(table);
    const layer = this.#wrap(table);

    // 표 뒤에 빈 단락을 두어 계속 입력 가능하게
    const after = document.createElement('p');
    after.appendChild(document.createElement('br'));
    layer.parentNode.insertBefore(after, layer.nextSibling);

    this.sel.placeCursor(table.rows[0].cells[0], false);
    this.editor.commit();
  }

  // ───────────── 행 ─────────────

  /** 현재 행 위/아래에 행 추가 */
  addRow(below = true) {
    const cell = this.getCell();
    if (!cell) return;
    const { row } = this.#indexOf(cell);
    const tr = document.createElement('tr');
    for (let i = 0; i < row.cells.length; i++) tr.appendChild(this.#makeCell('td'));
    row.parentNode.insertBefore(tr, below ? row.nextSibling : row);
    this.sel.placeCursor(tr.cells[0], false);
    this.editor.commit();
  }

  /** 현재 행 삭제. 마지막 행이면 표 삭제 */
  deleteRow() {
    const cell = this.getCell();
    if (!cell) return;
    const table = this.getTable();
    const { row, rowIndex } = this.#indexOf(cell);
    if (table.rows.length === 1) { this.deleteTable(); return; }
    row.remove();
    const next = table.rows[Math.min(rowIndex, table.rows.length - 1)];
    this.sel.placeCursor(next.cells[0], false);
    this.editor.commit();
  }

  // ───────────── 열 ─────────────

  /** 현재 열 왼쪽/오른쪽에 열 추가 */
  addColumn(right = true) {
    const cell = this.getCell();
    if (!cell) return;
    const table = this.getTable();
    const { colIndex } = this.#indexOf(cell);
    Array.from(table.rows).forEach((tr) => {
      const ref = tr.cells[colIndex];
      const tag = ref.tagName.toLowerCase();
      tr.insertBefore(this.#makeCell(tag), right ? ref.nextSibling : ref);
    });
    const target = cell.parentNode.cells[right ? colIndex + 1 : colIndex];
    this.sel.placeCursor(target, false);
    this.editor.commit();
  }

  /** 현재 열 삭제. 마지막 열이면 표 삭제 */
  deleteColumn() {
    const cell = this.getCell();
    if (!cell) return;
    const table = this.getTable();
    const { row, colIndex } = this.#indexOf(cell);
    if (row.cells.length === 1) { this.deleteTable(); return; }
    Array.from(table.rows).forEach((tr) => tr.cells[colIndex]?.remove());
    this.sel.placeCursor(row.cells[Math.min(colIndex, row.cells.length - 1)], false);
    this.editor.commit();
  }

  // ───────────── 표 ─────────────

  /** 표 삭제 후 그 자리에 빈 단락 */
  deleteTable() {
    const table = this.getTable();
    if (!table) return;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    const target = table.parentNode?.classList?.contains(TABLE_LAYER_CLASS) ? table.parentNode : table;
    target.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 키 처리 ─────────────

  /**
   * Tab / Shift+Tab 으로 셀 이동. 마지막 셀에서 Tab 이면 행 추가.
   * @returns {boolean} 처리했으면 true (호출 측에서 preventDefault)
   */
  handleTab(shift) {
    const cell = this.getCell();
    if (!cell) return false;
    const table = this.getTable();
    const cells = Array.from(table.querySelectorAll('td,th'));
    const i = cells.indexOf(cell);
    if (shift) {
      if (i > 0) this.sel.placeCursor(cells[i - 1], true);
    } else if (i < cells.length - 1) {
      this.sel.placeCursor(cells[i + 1], true);
    } else {
      this.addRow(true);
      return true;
    }
    this.editor.options.onSelectionChange?.();
    return true;
  }

  /** 툴바 상태용 */
  getState() {
    return { table: !!this.getTable() };
  }
}
