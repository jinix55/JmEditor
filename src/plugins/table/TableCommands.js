/**
 * TableCommands
 * - 표 삽입, 행/열 추가·삭제·이동, 셀 병합/분할, 셀 범위 선택, 정렬, 배경색, 머리글 토글,
 *   표 폭/테두리, 열 너비·행 높이 드래그 조절, Tab 셀 이동.
 * - 모든 행/열/병합 연산은 TableGrid(colspan/rowspan 반영 격자) 위에서 좌표로 계산한다.
 * - 에디터 안에서는 표를 레이어(<div class="jm-table-layer" contenteditable="false">) 로 감싸 하나의 객체처럼 다룬다.
 *   셀 내부만 편집 가능하고, 레이어 우클릭 시 표 메뉴. 저장 HTML 에는 레이어·선택 표시가 남지 않는다.
 *
 * 저장 형식:
 *   <table style="width:100%" data-border="0"?><colgroup><col style="width:120px">…</colgroup><tbody>
 *     <tr style="height:40px"?><td colspan rowspan style="text-align;vertical-align;background-color">…
 */
import { TableGrid } from './TableGrid.js';
import { SelectionUtil } from '../../core/SelectionUtil.js';

export const TABLE_LAYER_CLASS = 'jm-table-layer';
const SEL_CLASS = 'is-cell-selected';
const RESIZE_EDGE = 6; // 셀 경계 몇 px 안에서 리사이즈 커서로 바뀔지

export class TableCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
    this.selection = null; // { table, r1, c1, r2, c2 } 셀 범위 선택
  }

  // ───────────── 레이어 ─────────────

  /** 루트 안의 모든 table 을 레이어로 감싼다 (setHTML / 붙여넣기 후 호출) */
  wrapAll() {
    this.root.querySelectorAll('table').forEach((t) => {
      if (t.parentNode?.classList?.contains(TABLE_LAYER_CLASS)) return;
      this.#wrap(t);
    });
  }

  #wrap(table) {
    const layer = document.createElement('div');
    layer.className = TABLE_LAYER_CLASS;
    layer.contentEditable = 'false';
    table.parentNode.insertBefore(layer, table);
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle jm-table-handle';
    handle.title = '끌어서 이동 · 표 위에서 우클릭하면 편집 메뉴';
    handle.textContent = '⠿';
    layer.append(handle, table);
    table.contentEditable = 'true';
    this.editor.blockDrag?.makeDraggable(handle, layer);
    this.#bindSelection(table);
    this.#bindResize(layer, table);
    return layer;
  }

  /** 저장용 HTML 에서 레이어·선택 표시 제거 */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${TABLE_LAYER_CLASS}`).forEach((layer) => {
      const table = layer.querySelector('table');
      if (!table) { layer.remove(); return; }
      table.removeAttribute('contenteditable');
      table.querySelectorAll(`.${SEL_CLASS}`).forEach((c) => { c.classList.remove(SEL_CLASS); if (!c.className) c.removeAttribute('class'); });
      layer.replaceWith(table);
    });
    return tpl.innerHTML;
  }

  // ───────────── 조회 ─────────────

  getCell() { return this.sel.closest('td') || this.sel.closest('th'); }
  getTable() { return this.sel.closest('table'); }
  #grid(table) { return new TableGrid(table); }

  #makeCell(tag = 'td') {
    const c = document.createElement(tag);
    c.appendChild(document.createElement('br'));
    return c;
  }

  /** 현재 작업 대상 사각형: 범위 선택이 있으면 그것, 없으면 커서 셀 */
  #targetRect() {
    if (this.selection) return this.selection;
    const cell = this.getCell();
    if (!cell) return null;
    const table = cell.closest('table');
    const pos = this.#grid(table).positionOf(cell);
    return { table, r1: pos.r, c1: pos.c, r2: pos.r + pos.rs - 1, c2: pos.c + pos.cs - 1 };
  }

  /** 대상 셀들 (범위 선택 or 커서 셀) */
  #targetCells() {
    const rect = this.#targetRect();
    if (!rect) return [];
    return this.#grid(rect.table).cellsInRect(rect);
  }

  // ───────────── 셀 범위 선택 (마우스 드래그 / Shift+클릭) ─────────────

  #bindSelection(table) {
    let anchor = null;
    table.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || table._resizeHit) return; // 경계 리사이즈 시작 중이면 선택 안 함
      const cell = e.target.closest('td,th');
      if (!cell || cell.closest('table') !== table) return;
      if (e.shiftKey && this.selection?.table === table) {
        e.preventDefault();
        this.#selectRange(table, this.selection.anchorCell, cell);
        return;
      }
      anchor = cell;
      this.clearSelection();
    });
    table.addEventListener('mousemove', (e) => {
      if (!anchor || !(e.buttons & 1) || table._resizing) return;
      const cell = e.target.closest('td,th');
      if (!cell || cell.closest('table') !== table || cell === anchor) return;
      // 다른 셀로 넘어가면 브라우저 텍스트 선택 대신 셀 범위 선택
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      this.#selectRange(table, anchor, cell);
    });
    const end = () => { anchor = null; };
    table.addEventListener('mouseup', end);
    table.addEventListener('mouseleave', (e) => { if (!(e.buttons & 1)) end(); });
  }

  #selectRange(table, a, b) {
    const grid = this.#grid(table);
    const pa = grid.positionOf(a), pb = grid.positionOf(b);
    if (!pa || !pb) return;
    const rect = grid.normalizeRect(pa.r, pa.c, pb.r + pb.rs - 1, pb.c + pb.cs - 1);
    this.clearSelection();
    this.selection = { table, anchorCell: a, ...rect };
    grid.cellsInRect(rect).forEach((c) => c.classList.add(SEL_CLASS));
    this.editor.options.onSelectionChange?.();
  }

  clearSelection() {
    if (!this.selection) return;
    this.selection.table.querySelectorAll(`.${SEL_CLASS}`).forEach((c) => c.classList.remove(SEL_CLASS));
    this.selection = null;
  }

  // ───────────── 열 너비 / 행 높이 드래그 조절 ─────────────

  #bindResize(layer, table) {
    let drag = null; // { kind:'col'|'row', index, start, startSize, cells }
    const hit = (e) => {
      const cell = e.target.closest?.('td,th');
      if (!cell || cell.closest('table') !== table) return null;
      const r = cell.getBoundingClientRect();
      if (r.right - e.clientX <= RESIZE_EDGE) {
        const pos = this.#grid(table).positionOf(cell);
        return { kind: 'col', index: pos.c + pos.cs - 1 };
      }
      if (r.bottom - e.clientY <= RESIZE_EDGE) {
        const pos = this.#grid(table).positionOf(cell);
        return { kind: 'row', index: pos.r + pos.rs - 1 };
      }
      return null;
    };
    table.addEventListener('mousemove', (e) => {
      if (drag) return;
      const h = hit(e);
      table._resizeHit = !!h; // 선택 핸들러가 참고
      table.style.cursor = h ? (h.kind === 'col' ? 'col-resize' : 'row-resize') : '';
    });
    // 경계에서 바로 표 밖으로 나가도 커서 스타일이 남지 않게 (저장 HTML 에 섞이지 않도록)
    table.addEventListener('mouseleave', () => { if (!drag) { table.style.removeProperty('cursor'); table._resizeHit = false; } });
    table.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const h = hit(e);
      if (!h) return;
      e.preventDefault(); e.stopPropagation();
      this.#ensureColgroup(table);
      if (h.kind === 'col') {
        // 모든 열을 현재 렌더 폭(px)으로 고정한 뒤, 당기는 열과 오른쪽 이웃 열이 폭을 주고받는다 (표 전체 폭 유지)
        const cols = Array.from(table.querySelectorAll('colgroup > col'));
        const widths = cols.map((_, i) => this.#colWidth(table, i));
        cols.forEach((col, i) => { col.style.width = `${widths[i]}px`; });
        const next = cols[h.index + 1] ? h.index + 1 : null;
        drag = { ...h, start: e.clientX, cols, widths, next };
      } else {
        const tr = table.rows[h.index];
        drag = { ...h, start: e.clientY, startSize: tr.getBoundingClientRect().height, tr };
      }
      table._resizing = true;
      layer.classList.add('is-resizing');
      // 드래그 동안에만 document 에서 이동·놓기를 받는다 (표마다 상시 등록하면 실행 취소 때마다 쌓여 해제되지 않음)
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    const MIN = 30;
    const move = (e) => {
      if (!drag) return;
      if (drag.kind === 'col') {
        let delta = e.clientX - drag.start;
        const w0 = drag.widths[drag.index];
        if (drag.next != null) {
          const w1 = drag.widths[drag.next];
          delta = Math.max(MIN - w0, Math.min(w1 - MIN, delta)); // 양쪽 최소 폭 유지
          drag.cols[drag.next].style.width = `${w1 - delta}px`;
        } else {
          delta = Math.max(MIN - w0, delta); // 마지막 열: 표 폭 자체가 늘어남
        }
        drag.cols[drag.index].style.width = `${w0 + delta}px`;
      } else {
        drag.tr.style.height = `${Math.max(24, drag.startSize + e.clientY - drag.start)}px`;
      }
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!drag) return;
      if (drag.kind === 'col') this.#writeColPercents(table, this.#colPercents(table)); // px → % 로 되돌려 저장
      drag = null;
      table._resizing = false;
      layer.classList.remove('is-resizing');
      this.editor.commit();
    };
  }

  /** colgroup 이 없으면 현재 렌더 폭으로 만든다 (열 너비 저장용) */
  #ensureColgroup(table) {
    const n = this.#grid(table).colCount;
    let cg = table.querySelector(':scope > colgroup');
    if (!cg) { cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
    while (cg.children.length < n) cg.appendChild(document.createElement('col'));
    while (cg.children.length > n) cg.lastChild.remove();
    Array.from(cg.children).forEach((col, i) => { if (!col.style.width) col.style.width = `${this.#colWidth(table, i)}px`; });
  }

  /** 열 i 의 현재 렌더 폭 */
  #colWidth(table, i) {
    const grid = this.#grid(table);
    for (let r = 0; r < grid.rowCount; r++) {
      const g = grid.grid[r][i];
      if (g && g.c0 === i && (g.cell.colSpan || 1) === 1) return g.cell.getBoundingClientRect().width;
    }
    return table.getBoundingClientRect().width / Math.max(1, grid.colCount);
  }

  // ───────────── 삽입 ─────────────

  insert(rows = 3, cols = 3, header = true) {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) tr.appendChild(this.#makeCell(header && r === 0 ? 'th' : 'td'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const cur = this.sel.getBlock();
    const block = this.sel.insertAnchor(cur); // 퍼블 구조 안이면 그 구조 뒤에
    // 표 안이면 지금처럼 문서 끝에. 단 구조 안의 표라면 그 구조 바로 뒤에
    const useAnchor = block && (!this.getTable() || block !== SelectionUtil.blockAnchor(cur));
    if (useAnchor) block.parentNode.insertBefore(table, block.nextSibling);
    else this.root.appendChild(table);
    const layer = this.#wrap(table);
    const after = document.createElement('p');
    after.appendChild(document.createElement('br'));
    layer.parentNode.insertBefore(after, layer.nextSibling);
    this.sel.placeCursor(table.rows[0].cells[0], false);
    this.editor.commit();
  }

  // ───────────── 행 ─────────────

  /** 현재(또는 선택 범위 경계) 행 위/아래에 행 추가 — 가로지르는 병합 셀은 rowspan 확장 */
  addRow(below = true) {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    const grid = this.#grid(table);
    const at = below ? rect.r2 + 1 : rect.r1; // 새 행이 들어갈 그리드 행 번호
    const tr = document.createElement('tr');
    const expanded = new Set();
    for (let c = 0; c < grid.colCount; c++) {
      const above = at > 0 ? grid.grid[at - 1]?.[c] : null;
      const belowG = grid.grid[at]?.[c];
      // 같은 셀이 경계 위아래를 모두 차지하면 그 셀이 새 행도 덮도록 rowspan 확장
      if (above && belowG && above.cell === belowG.cell) {
        if (!expanded.has(above.cell)) { above.cell.rowSpan = (above.cell.rowSpan || 1) + 1; expanded.add(above.cell); }
        continue;
      }
      tr.appendChild(this.#makeCell('td')); // 새 행은 열마다 한 칸씩
    }
    const refTr = grid.rows[Math.min(at, grid.rows.length - 1)];
    if (at >= grid.rows.length) refTr.parentNode.appendChild(tr);
    else refTr.parentNode.insertBefore(tr, refTr);
    this.#afterChange(table, tr.cells[0]);
  }

  /** 대상 행(들) 삭제 — 병합 셀은 rowspan 축소 또는 다음 행으로 이동 */
  deleteRow() {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    for (let r = rect.r2; r >= rect.r1; r--) this.#deleteOneRow(table, r);
    if (!table.rows.length) { this.deleteTable(table); return; }
    const next = Math.min(rect.r1, table.rows.length - 1);
    this.#afterChange(table, this.#grid(table).cellAt(next, 0));
  }

  #deleteOneRow(table, r) {
    const grid = this.#grid(table);
    const tr = grid.rows[r];
    if (!tr) return;
    const seen = new Set();
    for (let c = 0; c < grid.colCount; c++) {
      const g = grid.grid[r][c];
      if (!g || seen.has(g.cell)) continue;
      seen.add(g.cell);
      const rs = g.cell.rowSpan || 1;
      if (g.r0 < r) {                       // 위에서 내려온 셀: 줄이기만
        g.cell.rowSpan = rs - 1;
      } else if (rs > 1) {                  // 이 행에서 시작하는 병합 셀: 다음 행으로 내려보냄
        g.cell.rowSpan = rs - 1;
        const nextTr = grid.rows[r + 1];
        const ref = grid.firstCellInRowFromCol(r + 1, g.c0 + (g.cell.colSpan || 1));
        nextTr.insertBefore(g.cell, ref);
      }
    }
    tr.remove();
    if (table.rows.length === 0) return;
    this.#normalizeRowSpans(table);
  }

  /** 행 위/아래로 이동 (가로지르는 병합 셀이 있으면 불가) */
  moveRow(dir) {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    const grid = this.#grid(table);
    const r = dir < 0 ? rect.r1 : rect.r2, t = r + dir;
    if (t < 0 || t >= grid.rowCount || grid.rowHasSpanAcross(r) || grid.rowHasSpanAcross(t)) return;
    const a = grid.rows[r], b = grid.rows[t];
    if (dir < 0) a.parentNode.insertBefore(a, b); else a.parentNode.insertBefore(b, a);
    this.#afterChange(table, a.cells[0]);
  }

  // ───────────── 열 ─────────────

  addColumn(right = true) {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    const grid = this.#grid(table);
    const at = right ? rect.c2 + 1 : rect.c1;
    const expanded = new Set();
    for (let r = 0; r < grid.rowCount; r++) {
      const left = at > 0 ? grid.grid[r][at - 1] : null;
      const rightG = grid.grid[r][at];
      if (left && rightG && left.cell === rightG.cell) {
        if (!expanded.has(left.cell)) { left.cell.colSpan = (left.cell.colSpan || 1) + 1; expanded.add(left.cell); }
        continue;
      }
      const ref = rightG || left;
      const tag = (ref?.cell.tagName || 'TD').toLowerCase();
      const cell = this.#makeCell(tag);
      const refCell = grid.firstCellInRowFromCol(r, at);
      grid.rows[r].insertBefore(cell, refCell);
    }
    this.#colgroupInsert(table, at);
    this.#afterChange(table, this.#grid(table).cellAt(rect.r1, at));
  }

  deleteColumn() {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    for (let c = rect.c2; c >= rect.c1; c--) { this.#deleteOneColumn(table, c); this.#colgroupRemove(table, c); }
    if (!this.#grid(table).colCount) { this.deleteTable(table); return; }
    const g = this.#grid(table);
    this.#afterChange(table, g.cellAt(rect.r1, Math.min(rect.c1, g.colCount - 1)));
  }

  #deleteOneColumn(table, c) {
    const grid = this.#grid(table);
    const seen = new Set();
    for (let r = 0; r < grid.rowCount; r++) {
      const g = grid.grid[r][c];
      if (!g || seen.has(g.cell)) continue;
      seen.add(g.cell);
      const cs = g.cell.colSpan || 1;
      if (cs > 1) g.cell.colSpan = cs - 1;
      else g.cell.remove();
    }
    Array.from(table.rows).forEach((tr) => { if (!tr.cells.length) tr.remove(); });
    this.#normalizeRowSpans(table);
  }

  moveColumn(dir) {
    const rect = this.#targetRect();
    if (!rect) return;
    const { table } = rect;
    const grid = this.#grid(table);
    const c = dir < 0 ? rect.c1 : rect.c2, t = c + dir;
    if (t < 0 || t >= grid.colCount || grid.colHasSpanAcross(c) || grid.colHasSpanAcross(t)) return;
    for (let r = 0; r < grid.rowCount; r++) {
      const a = grid.grid[r][c]?.cell, b = grid.grid[r][t]?.cell;
      if (!a || !b) continue;
      if (dir < 0) a.parentNode.insertBefore(a, b); else a.parentNode.insertBefore(b, a);
    }
    const cg = table.querySelector(':scope > colgroup');
    if (cg) { const a = cg.children[c], b = cg.children[t]; if (a && b) { if (dir < 0) cg.insertBefore(a, b); else cg.insertBefore(b, a); } }
    this.#afterChange(table, this.#grid(table).cellAt(rect.r1, t));
  }

  // ───────────── 병합 / 분할 ─────────────

  canMerge() {
    const s = this.selection;
    if (!s) return false;
    const grid = this.#grid(s.table);
    return (s.r2 > s.r1 || s.c2 > s.c1) && grid.isRectClean(s);
  }

  /** 선택 범위를 하나의 셀로 병합 (내용은 첫 셀에 이어 붙임) */
  mergeCells() {
    if (!this.canMerge()) return;
    const s = this.selection;
    const grid = this.#grid(s.table);
    const cells = grid.cellsInRect(s);
    const first = cells[0];
    cells.slice(1).forEach((c) => {
      const hasContent = c.textContent.trim() || c.querySelector('img');
      if (hasContent) {
        if (first.innerHTML === '<br>') first.innerHTML = '';
        Array.from(c.childNodes).forEach((n) => first.appendChild(n));
      }
      c.remove();
    });
    first.rowSpan = s.r2 - s.r1 + 1;
    first.colSpan = s.c2 - s.c1 + 1;
    if (first.rowSpan === 1) first.removeAttribute('rowspan');
    if (first.colSpan === 1) first.removeAttribute('colspan');
    Array.from(s.table.rows).forEach((tr) => { if (!tr.cells.length) tr.remove(); });
    this.#normalizeRowSpans(s.table);
    this.clearSelection();
    this.#afterChange(s.table, first);
  }

  canSplit() {
    const cell = this.getCell();
    return !!cell && ((cell.rowSpan || 1) > 1 || (cell.colSpan || 1) > 1);
  }

  /** 병합 셀을 1×1 로 되돌리고 빈 셀 채움 */
  splitCell() {
    const cell = this.getCell();
    if (!cell) return;
    const table = cell.closest('table');
    const grid = this.#grid(table);
    const pos = grid.positionOf(cell);
    const tag = cell.tagName.toLowerCase();
    cell.removeAttribute('rowspan'); cell.removeAttribute('colspan');
    for (let r = pos.r; r < pos.r + pos.rs; r++) {
      for (let c = pos.c; c < pos.c + pos.cs; c++) {
        if (r === pos.r && c === pos.c) continue;
        const ref = this.#grid(table).firstCellInRowFromCol(r, c);
        grid.rows[r].insertBefore(this.#makeCell(tag), ref);
      }
    }
    this.#afterChange(table, cell);
  }

  // ───────────── 정렬 / 배경 / 머리글 ─────────────

  /** 대상 셀들에 가로 정렬 */
  setAlign(value) {
    this.#targetCells().forEach((c) => this.#setStyle(c, 'text-align', value === 'left' ? null : value));
    this.editor.commit();
  }

  /** 대상 셀들에 세로 정렬 */
  setVAlign(value) {
    this.#targetCells().forEach((c) => this.#setStyle(c, 'vertical-align', value === 'top' ? null : value));
    this.editor.commit();
  }

  /** 대상 셀들 배경색 (null 이면 해제) */
  setCellBackground(color) {
    this.#targetCells().forEach((c) => this.#setStyle(c, 'background-color', color));
    this.editor.commit();
  }

  /** 대상 행 전체 배경색 */
  setRowBackground(color) {
    const rect = this.#targetRect();
    if (!rect) return;
    const grid = this.#grid(rect.table);
    grid.cellsInRect({ r1: rect.r1, c1: 0, r2: rect.r2, c2: grid.colCount - 1 }).forEach((c) => this.#setStyle(c, 'background-color', color));
    this.editor.commit();
  }

  /** 대상 행을 머리글(th) ↔ 일반(td) 토글 */
  toggleHeaderRow() {
    const rect = this.#targetRect();
    if (!rect) return;
    const grid = this.#grid(rect.table);
    const cells = grid.cellsInRect({ r1: rect.r1, c1: 0, r2: rect.r2, c2: grid.colCount - 1 });
    const toTh = cells.some((c) => c.tagName === 'TD');
    cells.forEach((c) => this.#retag(c, toTh ? 'th' : 'td'));
    this.#afterChange(rect.table, this.#grid(rect.table).cellAt(rect.r1, rect.c1));
  }

  /** 대상 열을 머리글 ↔ 일반 토글 */
  toggleHeaderCol() {
    const rect = this.#targetRect();
    if (!rect) return;
    const grid = this.#grid(rect.table);
    const cells = grid.cellsInRect({ r1: 0, c1: rect.c1, r2: grid.rowCount - 1, c2: rect.c2 });
    const toTh = cells.some((c) => c.tagName === 'TD');
    cells.forEach((c) => this.#retag(c, toTh ? 'th' : 'td'));
    this.#afterChange(rect.table, this.#grid(rect.table).cellAt(rect.r1, rect.c1));
  }

  #retag(cell, tag) {
    if (cell.tagName.toLowerCase() === tag) return cell;
    const n = document.createElement(tag);
    Array.from(cell.attributes).forEach((a) => n.setAttribute(a.name, a.value));
    while (cell.firstChild) n.appendChild(cell.firstChild);
    cell.replaceWith(n);
    return n;
  }

  // ───────────── 표 전체 ─────────────

  /** 표 폭: '100%' | 'auto' */
  setTableWidth(value) {
    const table = this.getTable();
    if (!table) return;
    if (value === 'auto') table.style.width = 'auto'; else table.style.removeProperty('width');
    if (!table.getAttribute('style')?.trim()) table.removeAttribute('style');
    this.editor.commit();
  }

  /** 테두리 표시 토글 (data-border="0" 이면 숨김) */
  toggleBorder() {
    const table = this.getTable();
    if (!table) return;
    if (table.dataset.border === '0') delete table.dataset.border; else table.dataset.border = '0';
    this.editor.commit();
  }

  /** 모든 열 너비 초기화 (colgroup 제거) */
  resetColumnWidths() {
    const table = this.getTable();
    if (!table) return;
    table.querySelector(':scope > colgroup')?.remove();
    Array.from(table.rows).forEach((tr) => tr.style.removeProperty('height'));
    this.editor.commit();
  }

  deleteTable(table = this.getTable()) {
    if (!table) return;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    const target = table.parentNode?.classList?.contains(TABLE_LAYER_CLASS) ? table.parentNode : table;
    target.replaceWith(p);
    this.clearSelection();
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 키 처리 ─────────────

  /** Tab / Shift+Tab 으로 셀 이동 (그리드 읽기 순서). 마지막 셀에서 Tab 이면 행 추가 */
  handleTab(shift) {
    const cell = this.getCell();
    if (!cell) return false;
    const table = cell.closest('table');
    const cells = this.#grid(table).allCells();
    const i = cells.indexOf(cell);
    if (shift) { if (i > 0) this.sel.placeCursor(cells[i - 1], true); }
    else if (i < cells.length - 1) this.sel.placeCursor(cells[i + 1], true);
    else { this.clearSelection(); this.addRow(true); return true; }
    this.editor.options.onSelectionChange?.();
    return true;
  }

  // ───────────── 메뉴 ─────────────

  /**
   * 우클릭 메뉴 항목
   * @param {(cb: (color: string|null) => void) => void} [pickColor]
   */
  getMenuItems(pickColor) {
    const cell = this.getCell();
    const table = cell?.closest('table');
    const grid = table ? this.#grid(table) : null;
    const rect = this.#targetRect();
    const sel = !!this.selection;
    const rowMovable = (d) => rect && grid && !grid.rowHasSpanAcross(rect.r1) && (d < 0 ? rect.r1 > 0 : rect.r2 < grid.rowCount - 1);
    const colMovable = (d) => rect && grid && !grid.colHasSpanAcross(rect.c1) && (d < 0 ? rect.c1 > 0 : rect.c2 < grid.colCount - 1);
    const colorItems = pickColor ? [
      { label: '셀 배경색…', action: () => pickColor((c) => this.setCellBackground(c)) },
      { label: '행 배경색…', action: () => pickColor((c) => this.setRowBackground(c)) },
    ] : [];
    return [
      { label: '행', children: [
        { label: '위에 행 추가', action: () => this.addRow(false) },
        { label: '아래에 행 추가', action: () => this.addRow(true) },
        { label: sel ? '선택한 행 삭제' : '행 삭제', action: () => this.deleteRow() },
        { divider: true },
        { label: '위로 이동', disabled: !rowMovable(-1), action: () => this.moveRow(-1) },
        { label: '아래로 이동', disabled: !rowMovable(1), action: () => this.moveRow(1) },
        { divider: true },
        { label: '머리글 행 전환', action: () => this.toggleHeaderRow() },
      ] },
      { label: '열', children: [
        { label: '왼쪽에 열 추가', action: () => this.addColumn(false) },
        { label: '오른쪽에 열 추가', action: () => this.addColumn(true) },
        { label: sel ? '선택한 열 삭제' : '열 삭제', action: () => this.deleteColumn() },
        { divider: true },
        { label: '왼쪽으로 이동', disabled: !colMovable(-1), action: () => this.moveColumn(-1) },
        { label: '오른쪽으로 이동', disabled: !colMovable(1), action: () => this.moveColumn(1) },
        { divider: true },
        { label: '머리글 열 전환', action: () => this.toggleHeaderCol() },
      ] },
      { divider: true },
      { label: '셀 병합', disabled: !this.canMerge(), action: () => this.mergeCells() },
      { label: '셀 분할', disabled: !this.canSplit(), action: () => this.splitCell() },
      { label: '가로 정렬', children: [
        { label: '왼쪽', action: () => this.setAlign('left') },
        { label: '가운데', action: () => this.setAlign('center') },
        { label: '오른쪽', action: () => this.setAlign('right') },
      ] },
      { label: '세로 정렬', children: [
        { label: '위', action: () => this.setVAlign('top') },
        { label: '중간', action: () => this.setVAlign('middle') },
        { label: '아래', action: () => this.setVAlign('bottom') },
      ] },
      ...colorItems,
      { divider: true },
      { label: '표', children: [
        { label: table?.style.width === 'auto' ? '폭: 가로 100%' : '폭: 내용에 맞춤', action: () => this.setTableWidth(table?.style.width === 'auto' ? '100%' : 'auto') },
        { label: table?.dataset.border === '0' ? '테두리 표시' : '테두리 숨김', action: () => this.toggleBorder() },
        { label: '열 너비·행 높이 초기화', action: () => this.resetColumnWidths() },
        { divider: true },
        { label: '표 삭제', action: () => this.deleteTable() },
      ] },
    ];
  }

  getState() {
    const cell = this.getCell();
    return { table: !!this.getTable(), tableSelection: !!this.selection, valign: cell ? (cell.style.verticalAlign || 'top') : null };
  }

  // ───────────── 내부 유틸 ─────────────

  #setStyle(el, prop, value) {
    if (value) el.style.setProperty(prop, value); else el.style.removeProperty(prop);
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }

  /** rowspan 이 표 끝을 넘지 않도록 보정 */
  #normalizeRowSpans(table) {
    const n = table.rows.length;
    Array.from(table.rows).forEach((tr, r) => Array.from(tr.cells).forEach((c) => {
      const rs = c.rowSpan || 1;
      if (r + rs > n) c.rowSpan = Math.max(1, n - r);
      if ((c.rowSpan || 1) === 1) c.removeAttribute('rowspan');
      if ((c.colSpan || 1) === 1) c.removeAttribute('colspan');
    }));
  }

  /** colgroup 의 각 col 너비를 % 로 읽는다 (px 면 표 폭 기준 환산, 없으면 균등) */
  #colPercents(table) {
    const cg = table.querySelector(':scope > colgroup');
    const cols = cg ? Array.from(cg.children) : [];
    const tw = table.getBoundingClientRect().width || 1;
    return cols.map((col) => {
      const w = col.style.width;
      if (/%$/.test(w)) return parseFloat(w);
      if (/px$/.test(w)) return (parseFloat(w) / tw) * 100;
      return NaN;
    });
  }

  /** 합이 100% 가 되도록 col 너비를 다시 쓴다 (NaN 은 평균으로) */
  #writeColPercents(table, pct) {
    const cg = table.querySelector(':scope > colgroup');
    if (!cg) return;
    const known = pct.filter((v) => !Number.isNaN(v));
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 100 / pct.length;
    const filled = pct.map((v) => (Number.isNaN(v) ? avg : v));
    const sum = filled.reduce((a, b) => a + b, 0) || 1;
    Array.from(cg.children).forEach((col, i) => { col.style.width = `${((filled[i] / sum) * 100).toFixed(2)}%`; });
  }

  /** 열 추가 시: at 위치에 col 을 끼우고 평균 너비를 준 뒤 100% 로 재배분 */
  #colgroupInsert(table, at) {
    const cg = table.querySelector(':scope > colgroup');
    if (!cg) return;
    const pct = this.#colPercents(table);
    const col = document.createElement('col');
    cg.insertBefore(col, cg.children[at] || null);
    pct.splice(at, 0, NaN);
    this.#writeColPercents(table, pct);
  }

  /** 열 삭제 시: 해당 col 을 빼고 100% 로 재배분 */
  #colgroupRemove(table, c) {
    const cg = table.querySelector(':scope > colgroup');
    if (!cg) return;
    const pct = this.#colPercents(table);
    cg.children[c]?.remove();
    pct.splice(c, 1);
    this.#writeColPercents(table, pct);
  }

  /** 변경 후 공통 처리: 선택 해제, 커서 이동, 기록 */
  #afterChange(table, focusCell) {
    this.clearSelection();
    if (focusCell) this.sel.placeCursor(focusCell, false);
    this.editor.commit();
  }
}
