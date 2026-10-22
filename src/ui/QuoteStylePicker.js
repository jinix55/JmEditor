/**
 * QuoteStylePicker
 * - 툴바 「인용」 버튼 아래에 인용 스타일 카드(세로선·박스·따옴표)를 미리보기로 보여 주고, 고르면 onPick(style) 호출.
 * - 현재 커서가 인용 안이면 그 스타일을 강조하고 「인용 해제」를 함께 보여 준다 (onPick(null)).
 * - 미리보기는 실제 저장 스타일(.jm-content blockquote[data-style]) 그대로 그린다.
 */
export const QUOTE_STYLE_ITEMS = Object.freeze([['line', '세로선'], ['box', '박스'], ['quote', '따옴표']]);

export class QuoteStylePicker {
  /**
   * @param {object} options
   * @param {(style: 'line'|'box'|'quote'|null) => void} options.onPick
   */
  constructor({ onPick }) {
    this.onPick = onPick;
    this.el = document.createElement('div');
    this.el.className = 'jm-quotepicker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', '인용 스타일');

    const title = document.createElement('div');
    title.className = 'jm-quotepicker-title';
    title.textContent = '인용 스타일';
    const list = document.createElement('div');
    list.className = 'jm-quotepicker-list';
    this.cards = QUOTE_STYLE_ITEMS.map(([style, label]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'jm-quotepicker-card';
      card.dataset.style = style;
      const preview = document.createElement('div');
      preview.className = 'jm-quotepicker-preview jm-content';
      const bq = document.createElement('blockquote');
      if (style !== 'line') bq.dataset.style = style;
      bq.textContent = '인용 예시';
      preview.appendChild(bq);
      const name = document.createElement('span');
      name.className = 'jm-quotepicker-name';
      name.textContent = label;
      card.append(preview, name);
      card.addEventListener('mousedown', (e) => e.preventDefault()); // 에디터 선택 유지
      card.addEventListener('click', () => this.#pick(style));
      list.appendChild(card);
      return card;
    });
    this.removeBtn = document.createElement('button');
    this.removeBtn.type = 'button';
    this.removeBtn.className = 'jm-quotepicker-remove';
    this.removeBtn.textContent = '인용 해제';
    this.removeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.removeBtn.addEventListener('click', () => this.#pick(null));

    this.el.append(title, list, this.removeBtn);
    document.body.appendChild(this.el);

    this.anchor = null;
    this.onDocDown = (e) => { if (!this.el.contains(e.target) && !this.anchor?.contains(e.target)) this.close(); };
    this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
  }

  /**
   * 버튼 아래에 열기
   * @param {HTMLElement} anchorEl
   * @param {'line'|'box'|'quote'|null} current 커서가 있는 인용의 스타일 (인용이 아니면 null)
   */
  open(anchorEl, current) {
    this.anchor = anchorEl;
    this.cards.forEach((c) => c.classList.toggle('is-on', c.dataset.style === current));
    this.removeBtn.hidden = !current;
    this.el.hidden = false;
    const r = anchorEl.getBoundingClientRect();
    this.el.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - this.el.offsetWidth - 8))}px`;
    this.el.style.top = `${r.bottom + window.scrollY + 4}px`;
    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  /** 열려 있으면 닫고, 닫혀 있으면 연다 */
  toggle(anchorEl, current) {
    if (this.el.hidden) this.open(anchorEl, current); else this.close();
  }

  destroy() {
    this.close();
    this.el.remove();
  }

  #pick(style) {
    this.close();
    this.onPick?.(style);
  }
}
