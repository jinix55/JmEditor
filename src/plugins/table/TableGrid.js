/**
 * TableGrid — colspan / rowspan 을 반영한 표 그리드 모델
 * - 표를 2차원 격자로 펼쳐 (행, 열) 좌표 ↔ 셀 요소를 양방향으로 찾는다.
 * - 모든 행/열/병합 연산은 이 모델 위에서 좌표로 계산한 뒤 DOM 에 반영한다.
 *
 * grid[r][c] = { cell, r0, c0 }  — 그 칸을 차지하는 셀과, 셀의 원점 좌표
 */
export class TableGrid {
  /** @param {HTMLTableElement} table */
  constructor(table) {
    this.table = table;
    this.rows = Array.from(table.rows);
    this.grid = [];
    this.#build();
  }

  #build() {
    const grid = [];
    this.rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      Array.from(tr.cells).forEach((cell) => {
        while (grid[r][c]) c++; // 위에서 내려온 rowspan 이 차지한 칸은 건너뜀
        const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
        for (let i = 0; i < rs; i++) {
          grid[r + i] = grid[r + i] || [];
          for (let j = 0; j < cs; j++) grid[r + i][c + j] = { cell, r0: r, c0: c };
        }
        c += cs;
      });
    });
    this.grid = grid;
  }

  get rowCount() { return this.grid.length; }
  get colCount() { return Math.max(0, ...this.grid.map((row) => row.length)); }

  /** 좌표의 셀 (없으면 null) */
  cellAt(r, c) { return this.grid[r]?.[c]?.cell || null; }

  /** 셀의 원점 좌표와 크기 */
  positionOf(cell) {
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const g = this.grid[r][c];
        if (g && g.cell === cell && g.r0 === r && g.c0 === c) return { r, c, rs: cell.rowSpan || 1, cs: cell.colSpan || 1 };
      }
    }
    return null;
  }

  /**
   * 두 좌표를 감싸는 사각형을 병합 셀이 잘리지 않도록 확장한다
   * @returns {{r1,c1,r2,c2}}
   */
  normalizeRect(r1, c1, r2, c2) {
    let rect = { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = rect.r1; r <= rect.r2; r++) {
        for (let c = rect.c1; c <= rect.c2; c++) {
          const g = this.grid[r]?.[c];
          if (!g) continue;
          const pos = { r: g.r0, c: g.c0, rs: g.cell.rowSpan || 1, cs: g.cell.colSpan || 1 };
          const nr1 = Math.min(rect.r1, pos.r), nc1 = Math.min(rect.c1, pos.c);
          const nr2 = Math.max(rect.r2, pos.r + pos.rs - 1), nc2 = Math.max(rect.c2, pos.c + pos.cs - 1);
          if (nr1 !== rect.r1 || nc1 !== rect.c1 || nr2 !== rect.r2 || nc2 !== rect.c2) { rect = { r1: nr1, c1: nc1, r2: nr2, c2: nc2 }; changed = true; }
        }
      }
    }
    return rect;
  }

  /** 사각형 안의 고유 셀 목록 (원점 기준, 읽기 순서) */
  cellsInRect({ r1, c1, r2, c2 }) {
    const seen = new Set(), out = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const g = this.grid[r]?.[c];
      if (g && !seen.has(g.cell)) { seen.add(g.cell); out.push(g.cell); }
    }
    return out;
  }

  /** 읽기 순서(행→열)로 모든 고유 셀 */
  allCells() {
    return this.cellsInRect({ r1: 0, c1: 0, r2: this.rowCount - 1, c2: this.colCount - 1 });
  }

  /**
   * tr 안에서 그리드 열 c 이상에 원점을 둔 첫 셀 (새 셀을 끼워 넣을 기준)
   * @returns {HTMLTableCellElement|null}
   */
  firstCellInRowFromCol(r, c) {
    const tr = this.rows[r];
    for (const cell of Array.from(tr.cells)) {
      const pos = this.positionOf(cell);
      if (pos && pos.c >= c) return cell;
    }
    return null;
  }

  /** 사각형이 병합 셀 경계와 정확히 맞는지(병합 가능 여부) */
  isRectClean(rect) {
    const n = this.normalizeRect(rect.r1, rect.c1, rect.r2, rect.c2);
    return n.r1 === rect.r1 && n.c1 === rect.c1 && n.r2 === rect.r2 && n.c2 === rect.c2;
  }

  /** 행 r 을 가로지르는 병합 셀이 있는지 (행 이동 가능 여부 판단) */
  rowHasSpanAcross(r) {
    return (this.grid[r] || []).some((g) => g && (g.r0 !== r || (g.cell.rowSpan || 1) > 1));
  }

  /** 열 c 를 가로지르는 병합 셀이 있는지 */
  colHasSpanAcross(c) {
    return this.grid.some((row) => row[c] && (row[c].c0 !== c || (row[c].cell.colSpan || 1) > 1));
  }
}
