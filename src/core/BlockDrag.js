/**
 * BlockDrag — 블록(표 레이어, 갤러리 레이어 등)을 드래그로 문서 안에서 옮기는 공통 모듈
 * - 각 블록은 핸들 요소 하나를 등록한다(makeDraggable). 핸들을 끌면 루트 직속 블록 사이에 삽입선이 표시되고,
 *   놓으면 그 위치로 이동한다.
 * - 드래그 데이터 타입 MIME 으로 이미지 파일 드롭·갤러리 사진 순서 이동과 구분한다.
 */
export const BLOCK_MIME = 'application/x-jm-block';
const DROP_BEFORE = 'jm-drop-before';
const DROP_AFTER = 'jm-drop-after';

export class BlockDrag {
  /** @param {import('./JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.root = editor.root;
    this.dragging = null; // 드래그 중인 블록(루트 직속 요소)
    this.target = null;   // 삽입 기준 블록
    this.before = true;   // 기준 블록 앞/뒤

    this.onOver = (e) => this.#over(e);
    this.onDrop = (e) => this.#drop(e);
    this.root.addEventListener('dragover', this.onOver);
    this.root.addEventListener('drop', this.onDrop);
  }

  /**
   * 핸들을 끌면 block 이 이동하도록 등록
   * @param {HTMLElement} handle
   * @param {HTMLElement} block 루트 직속 블록(레이어)
   */
  makeDraggable(handle, block) {
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      this.dragging = block;
      block.classList.add('is-block-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(BLOCK_MIME, '1');
      e.dataTransfer.setData('text/plain', 'jm-block'); // Firefox 드래그 시작 조건
      // 고스트 이미지는 블록 전체로
      try { e.dataTransfer.setDragImage(block, 20, 20); } catch { /* 일부 브라우저 미지원 */ }
      e.stopPropagation();
    });
    handle.addEventListener('dragend', () => this.#end());
  }

  /** 이벤트가 블록 드래그인지 */
  static isBlockDrag(e) {
    return Array.from(e.dataTransfer?.types || []).includes(BLOCK_MIME);
  }

  /** 마우스 Y 좌표로 루트 직속 블록과 앞/뒤를 정한다 */
  #locate(e) {
    const blocks = Array.from(this.root.children).filter((b) => b !== this.dragging);
    let target = null, before = true;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { target = b; before = true; break; }
      target = b; before = false;
    }
    return { target, before };
  }

  #clearMarks() {
    this.root.querySelectorAll(`.${DROP_BEFORE}, .${DROP_AFTER}`).forEach((el) => el.classList.remove(DROP_BEFORE, DROP_AFTER));
  }

  #over(e) {
    if (!this.dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { target, before } = this.#locate(e);
    if (target === this.target && before === this.before) return;
    this.#clearMarks();
    this.target = target; this.before = before;
    if (target) target.classList.add(before ? DROP_BEFORE : DROP_AFTER);
  }

  #drop(e) {
    if (!this.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const { target, before } = this.#locate(e);
    if (target) this.root.insertBefore(this.dragging, before ? target : target.nextSibling);
    else this.root.appendChild(this.dragging);
    const moved = this.dragging;
    this.#end();
    moved.scrollIntoView({ block: 'nearest' });
    this.editor.commit();
  }

  #end() {
    this.dragging?.classList.remove('is-block-dragging');
    this.#clearMarks();
    this.dragging = null; this.target = null;
  }

  /** 저장용 HTML 에서 드래그 표시 클래스 제거 */
  static cleanHTML(html) {
    return html.replace(/\s?class="(?:[^"]*\s)?(?:jm-drop-before|jm-drop-after|is-block-dragging)(?:\s[^"]*)?"/g, (m) => {
      const cls = m.match(/class="([^"]*)"/)[1].split(/\s+/).filter((c) => c && !/^(jm-drop-before|jm-drop-after|is-block-dragging)$/.test(c));
      return cls.length ? ` class="${cls.join(' ')}"` : '';
    });
  }

  destroy() {
    this.root.removeEventListener('dragover', this.onOver);
    this.root.removeEventListener('drop', this.onDrop);
  }
}
