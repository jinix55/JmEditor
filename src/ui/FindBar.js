/**
 * FindBar — 찾기·바꾸기 입력줄 (툴바 아래). 동작은 코어의 FindReplace 가 맡고, 이 클래스는 입력·표시만 한다.
 * 버튼은 mousedown 에서 포커스를 옮기지 않아 입력란 포커스와 저장된 커서가 유지된다.
 */
export class FindBar {
  /**
   * @param {import('../core/JmEditor.js').JmEditor} editor
   */
  constructor(editor) {
    this.editor = editor;
    this.el = document.createElement('div');
    this.el.className = 'jm-findbar';
    this.el.hidden = true;
    this.el.innerHTML = '<input type="text" class="jm-find-input jm-find-query" placeholder="찾을 말" aria-label="찾을 말">'
      + '<span class="jm-find-count" aria-live="polite"></span>'
      + '<input type="text" class="jm-find-input jm-find-replace" placeholder="바꿀 말" aria-label="바꿀 말">'
      + '<label class="jm-inputbar-check"><input type="checkbox" class="jm-find-case">대소문자</label>'
      + '<button type="button" class="jm-btn jm-find-prev">이전</button>'
      + '<button type="button" class="jm-btn jm-find-next">다음</button>'
      + '<button type="button" class="jm-btn jm-find-one">바꾸기</button>'
      + '<button type="button" class="jm-btn jm-find-all">모두 바꾸기</button>'
      + '<button type="button" class="jm-btn jm-find-close" aria-label="닫기">닫기</button>';
    const q = (c) => this.el.querySelector(c);
    this.query = q('.jm-find-query');
    this.replaceInput = q('.jm-find-replace');
    this.caseBox = q('.jm-find-case');
    this.countEl = q('.jm-find-count');
    this.el.querySelectorAll('button, label').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
    q('.jm-find-prev').addEventListener('click', () => editor.find.prev());
    q('.jm-find-next').addEventListener('click', () => editor.find.next());
    q('.jm-find-one').addEventListener('click', () => editor.find.replace(this.replaceInput.value));
    q('.jm-find-all').addEventListener('click', () => editor.find.replaceAll(this.replaceInput.value));
    q('.jm-find-close').addEventListener('click', () => this.close());
    this.query.addEventListener('input', () => this.#search());
    this.caseBox.addEventListener('change', () => this.#search());
    this.el.addEventListener('keydown', (e) => this.#onKey(e));
    editor.find.onChange = () => this.#render();
  }

  /** 열려 있는지 */
  get isOpen() { return !this.el.hidden; }

  /**
   * 입력줄 열기. 한 줄 안의 글자를 선택해 두었으면 찾을 말로 채운다
   * @param {boolean} [toReplace=false] 바꿀 말 입력란에 포커스 (Ctrl+H)
   */
  open(toReplace = false) {
    const { sel } = this.editor;
    if (!this.isOpen) sel.save();
    const picked = this.isOpen ? '' : (sel.getRange()?.toString() ?? '').replace(/​/g, '');
    if (picked && !/[\r\n]/.test(picked)) this.query.value = picked;
    this.el.hidden = false;
    this.#search();
    const target = toReplace ? this.replaceInput : this.query;
    target.focus();
    target.select();
  }

  /**
   * 입력줄 닫기: 강조를 지우고 커서를 돌려준다
   * @param {boolean} [restore=true] false 면 편집 영역으로 돌아가지 않는다 (HTML·미리보기로 전환할 때)
   */
  close(restore = true) {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.editor.find.clear();
    if (!restore) return;
    const { sel, root } = this.editor;
    root.focus();
    if (sel.saved?.startContainer.isConnected) sel.restore();
  }

  /** 정리 */
  destroy() {
    this.el.remove();
  }

  /** 입력값으로 다시 찾기 */
  #search() {
    this.editor.find.search(this.query.value, { caseSensitive: this.caseBox.checked });
  }

  /** 입력줄 키: Enter 다음(Shift 이전)·바꿀 말에서 Enter 바꾸기·Esc 닫기·Ctrl/Cmd+F 찾을 말 칸 선택 */
  #onKey(e) {
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); this.query.focus(); this.query.select(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const { find } = this.editor;
    const from = document.activeElement;
    if (from === this.replaceInput) find.replace(this.replaceInput.value);
    else if (e.shiftKey) find.prev();
    else find.next();
    from?.focus?.(); // 미지원 브라우저의 선택 표시가 포커스를 가져가도 입력을 이어 간다
  }

  /** 일치 수 표시 */
  #render() {
    const { find } = this.editor;
    this.countEl.textContent = find.query ? `${find.index + 1}/${find.count}${find.capped ? '개 이상' : ''}` : '';
  }
}
