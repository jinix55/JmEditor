/**
 * ContextMenu
 * - 에디터 안에서 쓰는 간단한 우클릭 메뉴. 프레임워크 독립.
 * - 항목은 [{ label, action, divider }] 배열. 바깥 클릭/Escape/스크롤 시 닫힌다.
 */
export class ContextMenu {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'jm-ctxmenu';
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');
    document.body.appendChild(this.el);

    this.onDocDown = (e) => { if (!this.el.contains(e.target)) this.close(); };
    this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
    this.onScroll = () => this.close();
  }

  /**
   * 메뉴 열기
   * @param {number} x 화면 좌표
   * @param {number} y
   * @param {Array<{label?: string, action?: () => void, divider?: boolean}>} items
   */
  open(x, y, items) {
    this.el.innerHTML = '';
    items.forEach((it) => {
      if (it.divider) {
        const d = document.createElement('div');
        d.className = 'jm-ctxmenu-divider';
        this.el.appendChild(d);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jm-ctxmenu-item';
      b.setAttribute('role', 'menuitem');
      b.textContent = it.label;
      // mousedown 에서 포커스/선택이 빠지지 않도록
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { this.close(); it.action?.(); });
      this.el.appendChild(b);
    });

    this.el.hidden = false;
    // 화면 밖으로 나가지 않게 보정
    const { innerWidth: w, innerHeight: h } = window;
    const r = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.min(x, w - r.width - 8)}px`;
    this.el.style.top = `${Math.min(y, h - r.height - 8)}px`;

    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.onScroll, true);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.onScroll, true);
  }

  destroy() {
    this.close();
    this.el.remove();
  }
}
