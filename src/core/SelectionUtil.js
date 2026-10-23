/**
 * SelectionUtil
 * - window.getSelection() / Range 를 다루는 공통 유틸.
 * - 에디터 루트 밖 선택은 무시하고, 선택 영역 저장/복원(툴바 클릭으로 포커스가 빠질 때)을 제공한다.
 */
/** 기본 글 블록 (커서가 속하는 블록) */
const CARET_BLOCK = /^(P|H1|H2|H3|LI|BLOCKQUOTE|TD|TH)$/;
/** 구조 모드에서 더하는 글 블록: 정의 목록·캡션 (자식에 블록이 있어도 직접 글이 있으면 블록 역할) */
const STRUCTURE_CARET_BLOCK = /^(DT|DD|FIGCAPTION|CAPTION)$/;
/** h4~h6 — 정책이 허용한 경우에만 글 블록(제목) */
const SUB_HEADING = /^H[4-6]$/;
/** 태그를 바꿀 수 있는 블록 (제목·인용·목록 전환 대상) */
export const TRANSFORMABLE_BLOCK = /^(P|H1|H2|H3|BLOCKQUOTE)$/;
/** 블록 요소 태그 (구조 컨테이너인지 — 블록 자식이 있는지 — 판정용) */
const BLOCK_TAG = /^(P|H[1-6]|UL|OL|LI|BLOCKQUOTE|TABLE|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|DL|DT|DD|FIGURE|FIGCAPTION)$/;

export class SelectionUtil {
  /** @param {HTMLElement} root 에디터 contenteditable 루트 */
  constructor(root) {
    this.root = root;
    this.saved = null; // 마지막으로 저장한 Range
    /** 퍼블 구조 정책 (JmEditor 가 넣음, 꺼져 있으면 null) */
    this.structure = null;
  }

  /**
   * 구조 모드에서 허용된 구조 태그인지 (section·div·dl 등)
   * @param {Node} el
   */
  isStructureTag(el) {
    return !!this.structure && el?.nodeType === Node.ELEMENT_NODE && this.structure.tags.has(el.tagName.toLowerCase());
  }

  /** 블록 자식이 있는 요소인지 (구조 컨테이너 판정) */
  static hasBlockChild(el) {
    return Array.from(el.children).some((c) => BLOCK_TAG.test(c.tagName) || c.getAttribute('contenteditable') === 'false');
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
   * - 구조 모드: dt·dd·figcaption·caption, 그리고 블록 자식이 없는 구조 태그(글만 있는 div 등)도 블록
   * @returns {HTMLElement|null}
   */
  getBlock() {
    const r = this.getRange();
    if (!r) return null;
    let node = r.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== this.root) {
      if (this.isTextBlock(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  /**
   * 글 블록(커서가 속하는 블록)인지
   * @param {Element} el
   */
  isTextBlock(el) {
    if (CARET_BLOCK.test(el.tagName)) return true;
    if (!this.structure) return false;
    if (STRUCTURE_CARET_BLOCK.test(el.tagName)) return true;
    if (SUB_HEADING.test(el.tagName)) return this.isStructureTag(el);
    // 플러그인 블록·칸(버튼 묶음 div 등)은 글 블록이 아님 — 그 뒤에 이미지 등을 넣으면 저장 때 사라짐
    if (!this.isStructureTag(el) || el.getAttribute('contenteditable') != null || el.hasAttribute('data-type') || el.hasAttribute('data-cell')) return false;
    // 블록 자식이 없거나, 블록 자식과 함께 직접 글이 있는 구조 태그(섞인 내용)
    return !SelectionUtil.hasBlockChild(el) || SelectionUtil.hasDirectText(el);
  }

  /** 직접 자식에 공백이 아닌 글이 있는지 (섞인 내용 판정) */
  static hasDirectText(el) {
    return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && /[^\s\u200B]/.test(n.textContent));
  }

  /**
   * 노드가 속한 가장 가까운 글 블록 (getBlock 과 같은 규칙, 커서 대신 노드 기준)
   * @param {Node} node
   * @returns {HTMLElement|null}
   */
  textBlockOf(node) {
    for (let e = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node; e && e !== this.root; e = e.parentNode) {
      if (this.isTextBlock(e)) return e;
    }
    return null;
  }

  /**
   * 구조 모드에서 Enter 를 줄바꿈(br)으로 처리할 글 블록인지 — dt·dd·figcaption·caption·글만 있는 구조 태그
   * (p·제목·목록·인용·표 셀은 지금처럼 문단 나누기)
   * @param {Element|null} el getBlock() 결과
   */
  isSoftBreakBlock(el) {
    return !!this.structure && !!el && !CARET_BLOCK.test(el.tagName) && !SUB_HEADING.test(el.tagName) && this.isTextBlock(el);
  }

  /**
   * 요소가 속한 구조 컨테이너 — 가장 가까운 구조 태그 조상(글 블록이 아닌 것). 없으면 루트
   * @param {Node} node
   * @returns {Element}
   */
  containerOf(node) {
    for (let e = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node?.parentNode; e && e !== this.root; e = e.parentNode) {
      if (this.isStructureTag(e) && !this.isTextBlock(e)) return e;
    }
    return this.root;
  }

  /**
   * 두 글 블록을 합쳐도 구조가 깨지지 않는지 (Backspace·Delete·범위 삭제 판정)
   * - 같은 구조 컨테이너 안이고, 둘 다 dt·dd 같은 구조 글 블록이 아니면 합칠 수 있다
   * @param {Element|null} a
   * @param {Element|null} b
   */
  canMerge(a, b) {
    if (!this.structure || !a || !b) return true;
    if (this.isSoftBreakBlock(a) || this.isSoftBreakBlock(b)) return false;
    return this.containerOf(a) === this.containerOf(b);
  }

  /**
   * 문서 순서로 block 바로 앞(또는 뒤)의 글 블록 (편집 영역 안의 글자 기준)
   * @param {Element} block
   * @param {boolean} [forward=false] true 면 뒤
   * @returns {Element|null}
   */
  adjacentTextBlock(block, forward = false) {
    const isLayer = (n) => n.nodeType === Node.ELEMENT_NODE && n.getAttribute('contenteditable') === 'false' && !n.contains(block);
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => {
        if (block.contains(n)) return NodeFilter.FILTER_SKIP;
        if (isLayer(n)) return NodeFilter.FILTER_ACCEPT;                  // 블록 레이어는 통째로 한 이웃
        const layer = (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement)?.closest('[contenteditable="false"]');
        if (layer && this.root.contains(layer) && !layer.contains(block)) return NodeFilter.FILTER_REJECT; // 레이어 안(헤더 글자·셀 등)은 보지 않음
        if (n.nodeType === Node.ELEMENT_NODE) return n.tagName === 'IMG' || n.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        return /[^\s\u200B]/.test(n.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    walker.currentNode = block;
    const n = forward ? walker.nextNode() : walker.previousNode();
    if (!n || isLayer(n)) return null; // 이웃이 블록 레이어면 합칠 글 블록이 아님 (브라우저 기본 동작)
    return this.textBlockOf(n);
  }

  /**
   * 새 블록(표·서식·플러그인)을 넣을 기준: blockAnchor 규칙에 더해, 구조 모드에서 구조 컨테이너 안이면
   * 그 가장 바깥 컨테이너(루트 직속) 뒤에 넣는다 (퍼블 구조 안에 블록 기능이 끼어들지 않게)
   * @param {HTMLElement|null} block getBlock() 결과
   * @returns {HTMLElement|null}
   */
  insertAnchor(block) {
    const a = SelectionUtil.blockAnchor(block);
    if (!this.structure || !a) return a;
    let top = a;
    while (top.parentNode && top.parentNode !== this.root) top = top.parentNode;
    return top.parentNode === this.root && this.isStructureTag(top) ? top : a;
  }

  /**
   * 블록(표·이미지·서식 등) 삽입 기준 블록: 배치 블록 글 칸·갤러리/슬라이드 제목처럼 블록 안 편집 영역이면
   * 그 블록의 레이어로 바꾼다 (블록 안에 블록이 들어가 저장 시 사라지지 않게 — 레이어 뒤에 삽입)
   * @param {HTMLElement|null} block getBlock() 결과
   * @returns {HTMLElement|null}
   */
  static blockAnchor(block) {
    return block?.closest?.('.jm-layout-layer, .jm-gallery-layer, .jm-slider-layer') || block;
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
