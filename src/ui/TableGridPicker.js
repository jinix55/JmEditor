/**
 * TableGridPicker
 * - 툴바 「표」 버튼 아래에 N×M 격자 팝업을 띄워, 마우스로 행·열 수를 고른 뒤 클릭하면 onPick(rows, cols) 호출.
 * - 프레임워크 독립. 키보드(방향키/Enter/Esc) 도 지원.
 */
export class TableGridPicker {
  /**
   * @param {object} options
   * @param {number} [options.maxRows=8]
   * @param {number} [options.maxCols=10]
   * @param {(rows: number, cols: number) => void} options.onPick
   */
  constructor({ maxRows = 8, maxCols = 10, onPick }) {
    this.maxRows = maxRows;
    this.maxCols = maxCols;
    this.onPick = onPick;
    this.rows = 0;
    this.cols = 0;

    this.el = document.createElement('div');
    this.el.className = 'jm-gridpicker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');

    this.grid = document.createElement('div');
    this.grid.className = 'jm-gridpicker-grid';
    this.grid.style.gridTemplateColumns = `repeat(${maxCols}, 1fr)`;
    this.cells = [];
    for (let r = 1; r <= maxRows; r++) {
      for (let c = 1; c <= maxCols; c++) {
        const cell = document.createElement('div');
        cell.className = 'jm-gridpicker-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.addEventListener('mouseenter', () => this.#highlight(r, c));
        cell.addEventListener('mousedown', (e) => e.preventDefault()); // 에디터 선택 유지
        cell.addEventListener('click', () => this.#pick(r, c));
        this.grid.appendChild(cell);
        this.cells.push(cell);
      }
    }

    this.label = document.createElement('div');
    this.label.className = 'jm-gridpicker-label';

    this.el.append(this.grid, this.label);
    document.body.appendChild(this.el);

    this.anchor = null;
    this.onDocDown = (e) => { if (!this.el.contains(e.target) && !this.anchor?.contains(e.target)) this.close(); };
    this.onKey = (e) => this.#handleKey(e);
    this.#highlight(0, 0);
  }

  /** 버튼 기준 위치에 열기 */
  open(anchorEl) {
    this.anchor = anchorEl;
    const r = anchorEl.getBoundingClientRect();
    this.el.hidden = false;
    this.el.style.left = `${Math.min(r.left, window.innerWidth - this.el.offsetWidth - 8)}px`;
    this.el.style.top = `${r.bottom + 4}px`;
    this.#highlight(1, 1);
    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  toggle(anchorEl) {
    this.el.hidden ? this.open(anchorEl) : this.close();
  }

  destroy() {
    this.close();
    this.el.remove();
  }

  /** rows×cols 범위 강조 + 라벨 갱신 */
  #highlight(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells.forEach((cell) => {
      cell.classList.toggle('is-on', +cell.dataset.r <= rows && +cell.dataset.c <= cols);
    });
    this.label.textContent = rows && cols ? `${rows} × ${cols}` : '표 크기 선택';
  }

  #pick(rows, cols) {
    this.close();
    this.onPick?.(rows, cols);
  }

  /** 방향키로 크기 조절, Enter 로 확정, Esc 로 닫기 */
  #handleKey(e) {
    const map = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    if (map[e.key]) {
      e.preventDefault();
      const [dr, dc] = map[e.key];
      this.#highlight(
        Math.min(this.maxRows, Math.max(1, this.rows + dr)),
        Math.min(this.maxCols, Math.max(1, this.cols + dc)),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.#pick(this.rows, this.cols);
    } else if (e.key === 'Escape') {
      this.close();
    }
  }
}
