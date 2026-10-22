/**
 * SelectionUtil
 * - window.getSelection() / Range 를 다루는 공통 유틸.
 * - 에디터 루트 밖 선택은 무시하고, 선택 영역 저장/복원(툴바 클릭으로 포커스가 빠질 때)을 제공한다.
 */
export class SelectionUtil {
  /** @param {HTMLElement} root 에디터 contenteditable 루트 */
  constructor(root) {
    this.root = root;
    this.saved = null; // 마지막으로 저장한 Range
  }

  /** 현재 Range 반환. 루트 밖이거나 없으면 null */
  getRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.root.contains(range.commonAncestorContainer) ? range : null;
  }

  /** 현재 선택을 저장 (툴바 버튼 mousedown 시점에 호출) */
  save() {
    const r = this.getRange();
    if (r) this.saved = r.cloneRange();
  }

  /** 저장된 선택 복원 */
  restore() {
    if (!this.saved) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.saved);
  }

  /** Range 를 선택 상태로 적용 */
  setRange(range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    this.saved = range.cloneRange();
  }

  /** 커서를 특정 노드의 끝(또는 시작)으로 이동 */
  placeCursor(node, toEnd = true) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(!toEnd);
    this.setRange(range);
  }

  /**
   * 현재 커서가 속한 블록 요소(p, h1~3, li, blockquote, td/th) 반환
   * - 표 셀 안에 p 가 없으면 셀 자체가 블록 역할
   * @returns {HTMLElement|null}
   */
  getBlock() {
    const r = this.getRange();
    if (!r) return null;
    let node = r.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== this.root) {
      if (/^(P|H1|H2|H3|LI|BLOCKQUOTE|TD|TH)$/.test(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  }

  /**
   * 블록(표·이미지·서식 등) 삽입 기준 블록: 이미지+글 배치 블록의 글 칸 안이면 배치 블록 레이어로 바꾼다
   * (글 칸에는 블록을 넣지 않으므로 칸 밖, 배치 블록 뒤에 삽입되게)
   * @param {HTMLElement|null} block getBlock() 결과
   * @returns {HTMLElement|null}
   */
  static blockAnchor(block) {
    return block?.closest?.('.jm-layout-layer') || block;
  }

  /** 커서가 특정 태그(strong/em 등) 안에 있는지 */
  isInside(tagName) {
    return !!this.closest(tagName);
  }

  /** 커서 위치에서 상위로 올라가며 tagName 요소 찾기 (루트 전까지) */
  closest(tagName) {
    const r = this.getRange();
    if (!r) return null;
    let node = r.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const tag = tagName.toUpperCase();
    while (node && node !== this.root) {
      if (node.tagName === tag) return node;
      node = node.parentNode;
    }
    return null;
  }
}
