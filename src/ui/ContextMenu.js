/**
 * ContextMenu
 * - 에디터 안에서 쓰는 우클릭 메뉴. 프레임워크 독립.
 * - 항목: { label, action, divider, disabled, children: [...], className, checked }  children 이 있으면 하위 메뉴(마우스 오버로 펼침).
 *   className: 항목 모양용 추가 클래스, checked: 현재 선택된 항목 표시(is-checked·aria-checked)
 * - 바깥 클릭 / Escape / 스크롤 시 닫힌다.
 */
export class ContextMenu {
  /**
   * @param {{className?: string}} [opts] className: 메뉴에 붙일 추가 클래스 (툴바 목록은 jm-listmenu — 내용 폭에 맞춤)
   */
  constructor({ className } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'jm-ctxmenu' + (className ? ` ${className}` : '');
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');
    document.body.appendChild(this.el);
    this.sub = null; // 열려 있는 하위 메뉴 요소
    // 메뉴 끝에서 휠이 본문으로 넘어가지 않게
    this.el.addEventListener('wheel', (e) => {
      const el = this.el;
      if ((el.scrollTop <= 0 && e.deltaY < 0) || (el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0)) e.preventDefault();
    }, { passive: false });

    this.onDocDown = (e) => { if (!this.el.contains(e.target) && !this.sub?.contains(e.target)) this.close(); };
    this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
    this.onScroll = () => this.close();
  }

  /**
   * 메뉴 열기
   * @param {number} x 화면 좌표
   * @param {number} y
   * @param {Array<object>} items
   */
  open(x, y, items) {
    this.#closeSub();
    this.#fill(this.el, items);
    this.el.hidden = false;
    this.#place(this.el, x, y);

    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.onScroll, true);
  }

  close() {
    if (this.el.hidden) return;
    this.#closeSub();
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.onScroll, true);
  }

  destroy() {
    this.close();
    this.el.remove();
  }

  /** 항목들을 메뉴 요소에 채운다 */
  #fill(menuEl, items) {
    menuEl.innerHTML = '';
    items.forEach((it) => {
      if (it.divider) {
        const d = document.createElement('div');
        d.className = 'jm-ctxmenu-divider';
        menuEl.appendChild(d);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jm-ctxmenu-item' + (it.children ? ' has-sub' : '') + (it.className ? ` ${it.className}` : '') + (it.checked ? ' is-checked' : '');
      b.setAttribute('role', it.checked == null ? 'menuitem' : 'menuitemradio');
      if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // 에디터 선택 유지
      if (it.children) {
        b.addEventListener('mouseenter', () => this.#openSub(b, it.children));
        b.addEventListener('click', () => this.#openSub(b, it.children));
      } else {
        b.addEventListener('mouseenter', () => { if (menuEl === this.el) this.#closeSub(); });
        b.addEventListener('click', () => { this.close(); it.action?.(); });
      }
      menuEl.appendChild(b);
    });
  }

  /** 하위 메뉴를 항목 오른쪽에 펼친다 */
  #openSub(anchor, items) {
    this.#closeSub();
    const sub = document.createElement('div');
    sub.className = 'jm-ctxmenu jm-ctxmenu-sub';
    sub.setAttribute('role', 'menu');
    this.#fill(sub, items);
    document.body.appendChild(sub);
    const r = anchor.getBoundingClientRect();
    this.#place(sub, r.right - 2, r.top - 4);
    this.sub = sub;
  }

  #closeSub() {
    this.sub?.remove();
    this.sub = null;
  }

  /** 화면 밖으로 나가지 않게 위치 보정 */
  #place(el, x, y) {
    const { innerWidth: w, innerHeight: h } = window;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(0, Math.min(x, w - r.width - 8))}px`;
    el.style.top = `${Math.max(0, Math.min(y, h - r.height - 8))}px`;
  }
}
