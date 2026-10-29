/**
 * Commands
 * - 서식 명령 모음. execCommand 를 쓰지 않고 Range/DOM 조작으로 구현.
 * - 모든 명령은 에디터 루트 안에서만 동작하며, 실행 후 editor.commit() 으로 히스토리 기록·변경 알림을 한다.
 */
import { SelectionUtil, TRANSFORMABLE_BLOCK } from './SelectionUtil.js';
import { Sanitizer } from './Sanitizer.js';

const ZWSP = '​'; // 빈 인라인 태그에 커서를 두기 위한 zero-width space

export class Commands {
  /** @param {import('./JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
  }

  // ───────────── 인라인 서식 (strong / em / u / s) ─────────────

  /**
   * 인라인 서식 토글
   * - 선택 영역이 있으면: 전부 해당 서식이면 해제, 아니면 적용
   * - 커서만 있으면: 빈 태그를 삽입해 이후 타이핑에 적용 / 이미 안이면 태그 밖으로 빠져나감
   * @param {'strong'|'em'|'u'|'s'} tag
   */
  toggleInline(tag) {
    const range = this.sel.getRange();
    if (!range) return;

    if (range.collapsed) {
      this.#toggleInlineCollapsed(tag, range);
    } else {
      this.#toggleInlineRange(tag, range);
    }
    this.editor.commit();
  }

  /** 커서만 있을 때의 인라인 토글 */
  #toggleInlineCollapsed(tag, range) {
    const inside = this.sel.closest(tag);
    if (inside) {
      // 태그 밖(뒤)으로 커서 이동 → 이후 입력은 서식 없음
      const after = document.createTextNode(ZWSP);
      inside.parentNode.insertBefore(after, inside.nextSibling);
      const r = document.createRange();
      r.setStart(after, 1);
      r.collapse(true);
      this.sel.setRange(r);
    } else {
      // 빈 태그 삽입 후 커서를 안에 둠
      const el = document.createElement(tag);
      el.appendChild(document.createTextNode(ZWSP));
      range.insertNode(el);
      const r = document.createRange();
      r.setStart(el.firstChild, 1);
      r.collapse(true);
      this.sel.setRange(r);
    }
  }

  /**
   * 선택 영역이 있을 때의 인라인 토글
   * - 선택 범위를 텍스트 조각으로 나눠(문단 여러 개에 걸쳐도 문단마다 따로) 조각별로 감싸거나 푼다
   * - 조각이 모두 해당 태그 안이면 해제(감싼 태그를 조각 앞뒤로 나눠 조각만 꺼냄), 아니면 적용
   */
  #toggleInlineRange(tag, range) {
    const upper = tag.toUpperCase();
    const pieces = this.#textPieces(range);
    if (!pieces.length) return;
    const allFormatted = pieces.every((t) => this.#findAncestor(t, upper));

    if (allFormatted) {
      pieces.forEach((t) => {
        const anc = this.#findAncestor(t, upper);
        if (anc) this.#unwrapEl(this.#isolate(t, anc));
      });
    } else {
      pieces.forEach((t) => {
        if (this.#findAncestor(t, upper)) return;
        const el = document.createElement(tag);
        t.parentNode.insertBefore(el, t);
        el.appendChild(t);
        this.#mergeSiblings(el);
      });
    }
    this.#selectPieces(pieces);
  }

  /**
   * 선택 범위 안의 텍스트 조각 목록. 경계에 걸친 텍스트 노드는 잘라서 범위 안 부분만 남긴다.
   * 편집할 수 없는 영역(블록 헤더 등)·블록 사이 공백·ZWSP 는 제외
   * @param {Range} range
   * @param {boolean} [withImages=false] 범위 안의 본문 이미지도 포함 (링크 적용용)
   * @returns {Array<Text|HTMLImageElement>} 문서 순서
   */
  #textPieces(range, withImages = false) {
    // 경계 텍스트를 자른다. Range 는 살아 있는(live) 객체라 splitText 후 경계가 브라우저에 의해 자동 보정된다
    // → 자른 뒤 경계를 다시 읽는다 (요소 경계에서 끝나는 선택도 어긋나지 않게)
    const { endContainer: ec0, endOffset: eo0 } = range;
    if (ec0.nodeType === Node.TEXT_NODE && eo0 > 0 && eo0 < ec0.length) ec0.splitText(eo0);
    const { startContainer: sc0, startOffset: so0 } = range;
    if (sc0.nodeType === Node.TEXT_NODE && so0 > 0 && so0 < sc0.length) sc0.splitText(so0);
    const { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;

    // 텍스트 노드 경계를 노드 앞/뒤 경계로 바꾼 범위 (조각이 통째로 들어가거나 빠지게)
    const r = document.createRange();
    if (sc.nodeType === Node.TEXT_NODE) { if (so >= sc.length) r.setStartAfter(sc); else r.setStartBefore(sc); } else r.setStart(sc, so);
    if (ec.nodeType === Node.TEXT_NODE) { if (eo === 0) r.setEndBefore(ec); else r.setEndAfter(ec); } else r.setEnd(ec, eo);
    if (r.collapsed) return [];

    const root = r.commonAncestorContainer;
    const all = [];
    if (root.nodeType === Node.TEXT_NODE) all.push(root);
    else {
      const show = NodeFilter.SHOW_TEXT | (withImages ? NodeFilter.SHOW_ELEMENT : 0);
      const walker = document.createTreeWalker(root, show);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'IMG') continue;
        if (r.intersectsNode(n)) all.push(n);
      }
    }
    return all.filter((t) => {
      const parent = t.parentElement;
      if (!parent || !parent.isContentEditable || !this.root.contains(t)) return false;
      if (t.nodeType === Node.ELEMENT_NODE) return true; // 이미지 (편집 가능한 본문 안)
      if (!t.textContent.replace(new RegExp(ZWSP, 'g'), '')) return false;
      // 블록 사이 줄바꿈 공백(표 tbody 안 등)은 제외 — 글이 들어갈 수 있는 블록 안의 텍스트만
      if (parent.closest('p, h1, h2, h3, li, blockquote, td, th, [data-cell="text"], [data-role="title"], a[data-role="button"]')) return true;
      // 구조 모드: dt·dd·글만 있는 div 등 구조 글 블록 안의 텍스트도 (블록 사이 공백만 있는 텍스트는 제외)
      if (!this.sel.structure) return false;
      for (let e = parent; e && e !== this.root; e = e.parentElement) {
        if (this.sel.isTextBlock(e)) return !(/^\s*$/.test(t.textContent) && SelectionUtil.hasBlockChild(e));
      }
      return false;
    });
  }

  /**
   * anc 를 node 앞·뒤에서 나눠 node 쪽 부분만 anc 에 남긴다 (앞·뒤 내용은 anc 복제본으로 형제가 됨)
   * @param {Node} node anc 의 자손
   * @param {HTMLElement} anc
   * @returns {HTMLElement} node 를 담은 anc
   */
  #isolate(node, anc) {
    const hasContent = (frag) => frag.textContent.replace(new RegExp(ZWSP, 'g'), '') !== '' || !!frag.querySelector?.('img, br');
    const pre = document.createRange();
    pre.setStart(anc, 0); pre.setEndBefore(node);
    if (!pre.collapsed) {
      const f = pre.extractContents();
      if (hasContent(f)) { const a = anc.cloneNode(false); a.appendChild(f); anc.parentNode.insertBefore(a, anc); }
    }
    const post = document.createRange();
    post.setStartAfter(node); post.setEnd(anc, anc.childNodes.length);
    if (!post.collapsed) {
      const f = post.extractContents();
      if (hasContent(f)) { const b = anc.cloneNode(false); b.appendChild(f); anc.parentNode.insertBefore(b, anc.nextSibling); }
    }
    return anc;
  }

  /** 요소를 풀어 자식만 남긴다 */
  #unwrapEl(el) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
  }

  /** 바로 옆 형제가 같은 태그·같은 속성이면 하나로 합친다 (조각별 감싸기 후 정리) */
  #mergeSiblings(el) {
    const same = (n) => n && n.nodeType === Node.ELEMENT_NODE && n.tagName === el.tagName
      && n.attributes.length === el.attributes.length
      && Array.from(el.attributes).every((at) => n.getAttribute(at.name) === at.value);
    const prev = el.previousSibling;
    if (same(prev)) { while (el.firstChild) prev.appendChild(el.firstChild); el.remove(); return this.#mergeSiblings(prev); }
    const next = el.nextSibling;
    if (same(next)) { while (next.firstChild) el.appendChild(next.firstChild); next.remove(); }
    return el;
  }

  /** 처리한 조각 전체를 다시 선택 */
  #selectPieces(pieces) {
    const live = pieces.filter((t) => t.isConnected);
    if (!live.length) return;
    const r = document.createRange();
    r.setStartBefore(live[0]);
    r.setEndAfter(live[live.length - 1]);
    this.sel.setRange(r);
  }

  /** 노드에서 루트 방향으로 올라가며 태그 찾기 */
  #findAncestor(node, upper) {
    let n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (n && n !== this.root) {
      if (n.tagName === upper) return n;
      n = n.parentNode;
    }
    return null;
  }

  // ───────────── 글자색 / 배경색 (span style) ─────────────

  /**
   * 선택 영역에 색상 스타일 적용/해제
   * @param {'color'|'background-color'} prop
   * @param {string|null} value null 이면 해제
   */
  setStyle(prop, value) {
    const range = this.sel.getRange();
    if (!range) return;

    if (range.collapsed) {
      // 커서가 단어 한가운데면 그 단어에 적용하고 커서는 제자리 (구글 문서 방식)
      const word = this.#wordRangeAt(range);
      if (word) {
        this.#placeCaretIn(this.#styleRange(word.range, prop, value), word.offset);
        this.editor.commit();
        return;
      }
      // 커서만 있을 때(단어 끝·공백): 커서 자리에 빈 글자(ZWSP)를 두고 같은 속성 span 들에서 모두 꺼낸 뒤(중첩 방지),
      // 값이 있으면 새 span 으로 감싸 이후 입력에 적용. 빈 글자만 남은 기존 span 은 #isolate 가 버린다(줄 높이 잔재 방지)
      const caret = document.createTextNode(ZWSP);
      range.insertNode(caret);
      this.#unstyle(caret, prop);
      if (value) {
        const span = document.createElement('span');
        span.style.setProperty(prop, value);
        caret.parentNode.insertBefore(span, caret);
        span.appendChild(caret);
      }
      const r = document.createRange(); r.setStart(caret, 1); r.collapse(true); this.sel.setRange(r);
      this.editor.commit();
      return;
    }

    this.#selectPieces(this.#styleRange(range, prop, value));
    this.editor.commit();
  }

  /**
   * 범위의 텍스트 조각마다 같은 속성을 가진 span 에서 꺼내(속성 제거) → 값이 있으면 새 span 으로 감싼다
   * @param {Range} range
   * @param {string} prop
   * @param {string|null} value
   * @returns {Text[]} 처리한 텍스트 조각
   */
  #styleRange(range, prop, value) {
    const pieces = this.#textPieces(range);
    pieces.forEach((t) => {
      this.#unstyle(t, prop);
      if (value) {
        const span = document.createElement('span');
        span.style.setProperty(prop, value);
        t.parentNode.insertBefore(span, t);
        span.appendChild(t);
        this.#mergeSiblings(span);
      }
    });
    return pieces;
  }

  /**
   * 커서가 단어 한가운데(앞뒤 모두 글자)면 그 단어 범위와 단어 안 커서 위치를 돌려준다. 단어 끝·공백이면 null.
   * ZWSP(커서용 빈 글자)는 없는 글자로 보고 건너뛴다.
   * @param {Range} range 접힌 범위
   * @returns {{range: Range, offset: number}|null} offset: 단어 시작부터 커서까지 글자 수 (ZWSP 제외)
   */
  #wordRangeAt(range) {
    const block = this.sel.getBlock();
    const { startContainer: sc, startOffset: so } = range;
    if (!block || sc.nodeType !== Node.TEXT_NODE || !block.contains(sc)) return null;
    // 블록 글자를 한 줄로 이은 위치표 [텍스트 노드, 오프셋]
    const chars = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n;
    // 같은 글 블록의 글자만 (dd 안의 p 처럼 자식 블록의 글자와 이어 붙지 않게)
    while ((n = walker.nextNode())) if (this.sel.textBlockOf(n) === block) for (let i = 0; i < n.length; i++) chars.push([n, i]);
    const base = chars.findIndex(([t]) => t === sc);
    if (base < 0) return null;
    const at = base + so; // 커서 바로 뒤 글자
    const ch = (k) => (k >= 0 && k < chars.length ? chars[k][0].data[chars[k][1]] : '');
    const isZ = (k) => ch(k) === ZWSP;
    const isWord = (k) => /\S/.test(ch(k)) && !isZ(k);
    let l = at - 1; while (isZ(l)) l--;
    let r = at; while (isZ(r)) r++;
    if (!isWord(l) || !isWord(r)) return null;
    while (isWord(l - 1) || isZ(l - 1)) l--;
    while (isWord(r + 1) || isZ(r + 1)) r++;
    let offset = 0;
    for (let k = l; k < at; k++) if (!isZ(k)) offset++;
    const w = document.createRange();
    w.setStart(chars[l][0], chars[l][1]);
    w.setEnd(chars[r][0], chars[r][1] + 1);
    return { range: w, offset };
  }

  /**
   * 텍스트 조각들 안에서 앞에서 offset 번째 글자(ZWSP 제외) 앞에 커서를 둔다
   * @param {Text[]} pieces
   * @param {number} offset
   */
  #placeCaretIn(pieces, offset) {
    const live = pieces.filter((t) => t.isConnected);
    let left = offset;
    for (const t of live) {
      for (let i = 0; i < t.length; i++) {
        if (t.data[i] === ZWSP) continue;
        if (left-- === 0) { const r = document.createRange(); r.setStart(t, i); r.collapse(true); this.sel.setRange(r); return; }
      }
    }
    this.#selectPieces(live);
  }

  /**
   * 텍스트 노드를 prop 스타일을 가진 모든 조상 span 에서 꺼낸다 (span 을 쪼개 그 부분만 속성 제거, 다른 속성은 유지)
   * @param {Text} t
   * @param {string} prop
   */
  #unstyle(t, prop) {
    let styled;
    while ((styled = this.#findStyledAncestor(t, prop))) {
      const mid = this.#isolate(t, styled);
      mid.style.removeProperty(prop);
      if (!mid.getAttribute('style')?.trim()) this.#unwrapEl(mid);
    }
  }

  /** 노드에서 루트 방향으로 올라가며 prop 스타일을 가진 span 찾기 */
  #findStyledAncestor(node, prop) {
    let n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (n && n !== this.root) {
      if (n.tagName === 'SPAN' && n.style.getPropertyValue(prop)) return n;
      n = n.parentNode;
    }
    return null;
  }

  /** 현재 커서 위치의 글자색/배경색 */
  getStyleState() {
    const r = this.sel.getRange();
    if (!r) return { color: null, bg: null, fontSize: null };
    return {
      color: this.#findStyledAncestor(r.startContainer, 'color')?.style.color || null,
      bg: this.#findStyledAncestor(r.startContainer, 'background-color')?.style.backgroundColor || null,
      fontSize: this.#findStyledAncestor(r.startContainer, 'font-size')?.style.fontSize || null,
    };
  }

  // ───────────── 블록 정렬 ─────────────

  /**
   * 커서가 있는 블록(단락/제목/인용/목록 항목/표 셀)의 가로 정렬
   * @param {'left'|'center'|'right'|'justify'} value left 면 스타일 제거
   */
  setAlign(value) {
    const block = this.sel.getBlock();
    if (!block) return;
    if (value === 'left') block.style.removeProperty('text-align'); else block.style.textAlign = value;
    if (!block.getAttribute('style')?.trim()) block.removeAttribute('style');
    this.editor.commit();
  }

  // ───────────── 블록 서식 (p / h1~h3 / blockquote) ─────────────

  /**
   * 현재 블록을 다른 블록 태그로 교체. 같은 태그면 p 로 되돌림.
   * @param {'p'|'h1'|'h2'|'h3'|'blockquote'} tag
   */
  setBlock(tag) {
    const block = this.sel.getBlock();
    if (!block || !TRANSFORMABLE_BLOCK.test(block.tagName)) return; // 목록 항목·표 셀·구조 블록(dt·dd 등)은 블록 교체 대상 아님
    const target = block.tagName.toLowerCase() === tag ? 'p' : tag;
    const el = document.createElement(target);
    Commands.#carryAttrs(block, el); // 정렬(style)·class 는 그대로
    while (block.firstChild) el.appendChild(block.firstChild);
    block.replaceWith(el);
    this.sel.placeCursor(el, true);
    this.editor.commit();
  }

  /**
   * 블록 태그를 바꿀 때 옮기는 속성: class(구조 모드의 퍼블 class)와 style(정렬 등).
   * 태그 고유 속성(blockquote data-style, ol start 등)은 옮기지 않는다
   * @param {Element} from
   * @param {Element} to
   */
  static #carryAttrs(from, to) {
    ['class', 'style'].forEach((n) => { const v = from.getAttribute(n); if (v) to.setAttribute(n, v); });
    // 목록 유형은 목록(ul·ol)에만 의미가 있다 — 항목→문단·제목으로 옮길 때는 버림
    if (!/^(UL|OL)$/.test(to.tagName) && to.style.listStyleType) {
      to.style.removeProperty('list-style-type');
      if (!to.getAttribute('style')?.trim()) to.removeAttribute('style');
    }
  }

  /** 인용 스타일: line(세로선, 기본 — 속성 없음) | box(박스) | quote(따옴표) */
  static QUOTE_STYLES = ['line', 'box', 'quote'];

  /**
   * 인용 적용·스타일 변경·해제
   * - 인용이 아닌 블록이면 그 스타일의 인용으로 바꾼다
   * - 이미 인용이면 스타일만 바꾼다. style 이 null 이면 인용을 풀어 단락으로
   * @param {'line'|'box'|'quote'|null} style
   */
  setQuote(style) {
    const block = this.sel.getBlock();
    if (!block || !TRANSFORMABLE_BLOCK.test(block.tagName)) return; // 목록 항목·표 셀·구조 블록(dt·dd 등)은 대상 아님
    let el = block;
    if (block.tagName !== 'BLOCKQUOTE') {
      if (!style) return;
      el = document.createElement('blockquote');
      Commands.#carryAttrs(block, el); // 정렬(style)·class 는 그대로
      while (block.firstChild) el.appendChild(block.firstChild);
      block.replaceWith(el);
    } else if (!style) {
      el = document.createElement('p');
      Commands.#carryAttrs(block, el);
      while (block.firstChild) el.appendChild(block.firstChild);
      block.replaceWith(el);
    }
    if (el.tagName === 'BLOCKQUOTE') {
      if (style && style !== 'line' && Commands.QUOTE_STYLES.includes(style)) el.dataset.style = style;
      else delete el.dataset.style;
    }
    this.sel.placeCursor(el, true);
    this.editor.commit();
  }

  // ───────────── 목록 (ul / ol) ─────────────

  /**
   * 목록 토글 / 유형 지정
   * - 일반 블록이면 li 로 감싸 목록 생성
   * - 이미 같은 종류 목록이면: styleType 이 있으면 유형만 변경, 없으면 p 로 해제
   * - 다른 종류 목록이면 목록 태그 변경
   * @param {'ul'|'ol'} listTag
   * @param {string} [styleType] list-style-type 값 (disc, circle, square, decimal, lower-alpha, upper-roman, hangul …). 기본값이면 스타일 제거
   */
  toggleList(listTag, styleType) {
    const block = this.sel.getBlock();
    // 표 셀 안에서는 목록 미지원. 구조 블록(dt·dd·글만 있는 div 등)은 태그를 바꾸지 않는다
    if (!block || (block.tagName !== 'LI' && !TRANSFORMABLE_BLOCK.test(block.tagName))) return;
    // 구조 모드: 블록 자식(div·p 등)이 있는 li 는 목록을 풀면 블록이 p 안으로 들어가므로 바꾸지 않는다
    if (this.sel.structure && block.tagName === 'LI' && SelectionUtil.hasBlockChild(block)) return;
    const isDefault = !styleType || styleType === (listTag === 'ul' ? 'disc' : 'decimal');
    const applyType = (list) => {
      if (isDefault) list.style.removeProperty('list-style-type'); else list.style.listStyleType = styleType;
      if (!list.getAttribute('style')?.trim()) list.removeAttribute('style');
    };

    if (block.tagName === 'LI') {
      const list = block.parentNode;
      if (list.tagName.toLowerCase() === listTag) {
        if (styleType) applyType(list); else this.#removeFromList(block);
      } else {
        // 목록 종류 바꾸기 (ul↔ol): class·style 은 옮기고 목록 유형은 applyType 이 새 종류에 맞게 정함. ol 의 start 는 ol 로 갈 때만
        const newList = document.createElement(listTag);
        Commands.#carryAttrs(list, newList);
        if (listTag === 'ol' && list.getAttribute('start')) newList.setAttribute('start', list.getAttribute('start'));
        while (list.firstChild) newList.appendChild(list.firstChild);
        list.replaceWith(newList);
        newList.style.removeProperty('list-style-type'); // 이전 종류의 유형(square 등)은 새 종류에 맞지 않음
        applyType(newList);
      }
    } else {
      // 블록 → 목록: 블록의 class·정렬은 항목(li)으로
      const list = document.createElement(listTag);
      const li = document.createElement('li');
      Commands.#carryAttrs(block, li);
      while (block.firstChild) li.appendChild(block.firstChild);
      list.appendChild(li);
      block.replaceWith(list);
      applyType(list);
      this.sel.placeCursor(li, true);
    }
    this.editor.commit();
  }

  /** li 를 목록에서 빼내어 p 로 변환 (목록은 필요 시 분할 — 뒤 목록은 같은 속성·이어지는 번호) */
  #removeFromList(li) {
    const list = li.parentNode;
    const p = document.createElement('p');
    Commands.#carryAttrs(li, p); // 항목의 class·정렬은 문단으로
    while (li.firstChild) p.appendChild(li.firstChild);

    // li 뒤에 형제가 있으면 새 목록으로 분리: class·style(목록 유형) 은 그대로, ol 은 번호가 이어지게 start
    const after = document.createElement(list.tagName.toLowerCase());
    Commands.#carryAttrs(list, after);
    if (list.tagName === 'OL') {
      const lis = Array.from(list.children).filter((c) => c.tagName === 'LI');
      const before = lis.indexOf(li); // 앞에 남는 항목 수 (li 만 셈)
      const start = parseInt(list.getAttribute('start'), 10);
      const next = (Number.isNaN(start) ? 1 : start) + before + 1; // 빠진 항목 다음 번호 (start="0" 도 그대로)
      if (next !== 1 && next >= 0 && next <= 9999) after.setAttribute('start', String(next)); // 저장 규칙(4자리)과 같게
    }
    while (li.nextSibling) after.appendChild(li.nextSibling);

    li.remove();
    list.parentNode.insertBefore(p, list.nextSibling);
    if (after.childNodes.length) p.parentNode.insertBefore(after, p.nextSibling);
    if (list.childNodes.length === 0) list.remove();
    this.sel.placeCursor(p, true);
  }

  // ───────────── 링크 ─────────────

  /**
   * 링크 적용/해제
   * - 커서가 링크 안이면 해제, 선택 영역이 있으면 a 태그로 감쌈
   * @param {string|null} url null 이면 해제
   */
  setLink(url) {
    const range = this.sel.getRange();
    if (!range) return undefined;
    // 주소 검증: javascript: 등은 거부(false 반환 → 툴바가 안내), 도메인만 쓰면 https:// 를 붙임
    const href = url ? Sanitizer.normalizeHref(url) : null;
    if (url && !href) return false;
    const existing = this.sel.closest('a');

    if (existing) {
      if (href) { this.editor.constructor.setHref(existing, href); Sanitizer.applyLinkTarget(existing, href); } // 기존 링크: 주소만 수정(새 창 규칙도 다시 맞춤)
      else this.#unwrapEl(existing);                                // 해제
      this.editor.commit();
      return true;
    }
    if (!href || range.collapsed) return undefined;

    // 문단 여러 개에 걸쳐도 문단마다 따로 링크를 건다 (a 안에 문단이 들어가지 않게). 선택한 이미지도 포함
    const pieces = this.#textPieces(range, true).filter((t) => !t.parentElement.closest('a'));
    if (!pieces.length) return undefined;
    pieces.forEach((t) => {
      const a = document.createElement('a');
      this.editor.constructor.setHref(a, href);
      Sanitizer.applyLinkTarget(a, href); // #·tel:·mailto: 는 새 창 아님
      t.parentNode.insertBefore(a, t);
      a.appendChild(t);
      this.#mergeSiblings(a); // 같은 주소로 이어진 조각(글자·이미지)은 하나의 링크로
    });
    this.#selectPieces(pieces);
    this.editor.commit();
    return true;
  }

  // ───────────── 이미지 / 임의 HTML 삽입 ─────────────

  /**
   * 이미지 삽입. 커서가 있는 블록 뒤에 새 p 로 삽입한다.
   * @param {string} src
   * @param {string} alt
   */
  insertImage(src, alt = '') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    const p = document.createElement('p');
    p.appendChild(img);

    let block = SelectionUtil.blockAnchor(this.sel.getBlock());
    // 표 캡션·그림 설명 안이면(그 안의 문단 포함) 그 표(레이어)·그림 뒤에 (캡션 형제로 들어가면 표·figure 구조가 깨짐)
    const cap = block?.closest?.('caption, figcaption');
    if (cap?.tagName === 'CAPTION') { block = cap.closest('table'); if (block.parentNode?.classList?.contains('jm-table-layer')) block = block.parentNode; }
    else if (cap) block = cap.closest('figure') || cap;
    if (block && /^(TD|TH)$/.test(block.tagName)) block.appendChild(p); // 셀 안이면 셀 내부에
    else if (block) block.parentNode.insertBefore(p, block.nextSibling);
    else this.root.appendChild(p);

    // 이미지 다음에 빈 단락을 두어 계속 입력 가능하게
    const next = document.createElement('p');
    next.appendChild(document.createElement('br'));
    p.parentNode.insertBefore(next, p.nextSibling);
    this.sel.placeCursor(next, false);
    this.editor.commit();
  }

  // ───────────── 구조 모드: 줄바꿈 · 구조를 지키는 범위 삭제 ─────────────

  /**
   * 범위가 퍼블 구조 경계를 넘는지 — 구조 태그를 일부만 덮거나, 합칠 수 없는 두 글 블록에 걸침.
   * 넘으면 브라우저 기본 삭제(요소째 지우고 합침) 대신 deleteRange 를 써야 한다. 구조 모드가 아니면 항상 false
   * @param {Range} range
   */
  crossesStructure(range) {
    if (!this.sel.structure || range.collapsed) return false;
    const a = this.sel.textBlockOf(range.startContainer);
    const b = this.sel.textBlockOf(range.endContainer);
    if (a !== b && !this.sel.canMerge(a, b)) return true;
    // 범위 안의 구조 태그가 범위 양 끝을 모두 감싸지 않으면(일부만 덮음) 경계를 넘는 것
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!range.intersectsNode(n) || !this.sel.isStructureTag(n)) continue;
      if (!(n.contains(range.startContainer) && n.contains(range.endContainer))) return true;
    }
    return false;
  }

  /**
   * 구조를 지키는 범위 삭제: 범위 안의 글자·이미지만 지우고 요소(구조)는 남긴다. 비게 된 글 블록에는 <br> 을 둔다.
   * 삭제 키·선택 위 입력·잘라내기·붙여넣기가 같이 쓴다. range 는 지운 자리(시작)로 접힌다.
   * @param {Range} range 살아 있는 범위 (보통 현재 선택)
   */
  deleteRange(range) {
    if (range.collapsed) return;
    const touched = new Set([this.sel.textBlockOf(range.startContainer), this.sel.textBlockOf(range.endContainer)]);
    const pieces = this.#textPieces(range, true);
    pieces.forEach((t) => { touched.add(this.sel.textBlockOf(t)); t.remove(); });
    // 범위 안에 남은 줄바꿈(br)도 지움 (글 블록 안의 것만)
    const brs = [];
    const host = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    host.querySelectorAll?.('br').forEach((br) => { if (range.intersectsNode(br) && this.sel.textBlockOf(br)) brs.push(br); });
    brs.forEach((br) => { touched.add(this.sel.textBlockOf(br)); br.remove(); });
    range.collapse(true);
    // 비게 된 글 블록은 커서를 둘 수 있게 <br>
    touched.forEach((blk) => {
      if (!blk?.isConnected) return;
      const empty = !blk.textContent.replace(new RegExp(ZWSP, 'g'), '').trim() && !blk.querySelector('img, br');
      if (empty) blk.appendChild(document.createElement('br'));
    });
    this.sel.setRange(range);
  }

  /**
   * 커서 자리에 줄바꿈(<br>) 넣기 — 구조 모드의 dt·dd·캡션·글만 있는 div 에서 Enter (새 블록을 만들지 않음)
   */
  insertLineBreak() {
    const range = this.sel.getRange();
    if (!range) return;
    if (!range.collapsed) { if (this.crossesStructure(range)) this.deleteRange(range); else range.deleteContents(); }
    const br = document.createElement('br');
    range.insertNode(br);
    // 블록 끝의 br 하나는 줄로 보이지 않으므로, 뒤에 내용이 없으면 하나 더 둔다
    const block = this.sel.textBlockOf(br);
    if (block) {
      const rest = document.createRange();
      rest.setStartAfter(br);
      rest.setEnd(block, block.childNodes.length);
      const tail = rest.cloneContents();
      if (!tail.textContent.replace(new RegExp(ZWSP, 'g'), '') && !tail.querySelector('img, br')) br.after(document.createElement('br'));
    }
    const r = document.createRange();
    r.setStartAfter(br);
    r.collapse(true);
    this.sel.setRange(r);
    this.editor.commit();
  }

  /**
   * 커서 위치에 HTML 조각 삽입 (붙여넣기 등). Sanitizer 를 통과한 HTML 만 넘길 것.
   * @param {string} html
   */
  insertHTML(html) {
    const range = this.sel.getRange();
    if (!range) return;
    // 구조 경계를 넘는 선택이면 구조를 지키는 삭제, 아니면 지금처럼
    if (this.crossesStructure(range)) this.deleteRange(range); else range.deleteContents();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const frag = tpl.content;
    const hasBlock = Array.from(frag.childNodes).some((n) => n.nodeType === Node.ELEMENT_NODE && Commands.#isBlockEl(n));
    const block = this.sel.getBlock();

    // 문단·제목 안에 블록(문단·표·목록 등)이 섞인 조각을 넣으면: 문단을 커서 위치에서 둘로 나누고 그 사이에 넣는다
    // (p 안에 p 가 들어가 저장 후 다시 열 때 구조가 바뀌는 것 방지)
    if (hasBlock && block && /^(P|H[1-6])$/.test(block.tagName)) {
      this.#wrapLooseInline(frag);
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      tail.setEnd(block, block.childNodes.length);
      const after = block.cloneNode(false);
      after.appendChild(tail.extractContents());
      const last = frag.lastChild;
      block.parentNode.insertBefore(after, block.nextSibling);
      block.parentNode.insertBefore(frag, after);
      const isEmpty = (el) => !el.textContent.replace(new RegExp(ZWSP, 'g'), '').trim() && !el.querySelector('img');
      if (isEmpty(block)) block.remove();
      if (isEmpty(after)) after.remove();
      if (last?.isConnected) this.sel.placeCursor(last, true);
      this.editor.commit();
      return;
    }

    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      // 넣은 내용 바로 뒤에 커서 (텍스트면 끝, 요소면 그 뒤)
      const r = document.createRange();
      r.setStartAfter(last);
      r.collapse(true);
      this.sel.setRange(r);
    }
    this.editor.commit();
  }

  /** 블록 요소(문단·제목·목록·인용·표·블록 레이어)인지 */
  static #isBlockEl(el) {
    return /^(P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|DL|DT|DD|FIGURE|FIGCAPTION)$/.test(el.tagName);
  }

  /** 조각 최상위의 연속된 인라인·텍스트 노드를 p 로 묶는다 (블록과 섞여 들어올 때) */
  #wrapLooseInline(frag) {
    let p = null;
    Array.from(frag.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && Commands.#isBlockEl(n)) { p = null; return; }
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim() && !p) { n.remove(); return; }
      if (!p) { p = document.createElement('p'); frag.insertBefore(p, n); }
      p.appendChild(n);
    });
  }

  /**
   * 블록 단위 HTML 삽입 (서식/템플릿 삽입용)
   * - 커서가 있는 블록 *뒤에* 통째로 넣는다 (표·제목 등 블록 요소가 단락 안으로 들어가지 않게).
   * - 커서가 빈 단락에 있으면 그 단락을 대체한다.
   * - Sanitizer 를 통과한 HTML 만 넘길 것. 삽입 뒤 빈 단락을 하나 두어 계속 입력 가능하게 한다.
   * @param {string} html
   */
  insertBlockHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    if (!tpl.content.childNodes.length) return;

    // 표 셀 안이면 셀 밖(표 레이어 뒤)에 삽입. 배치 블록 글 칸 안이면 배치 블록 뒤에. 구조 모드에서 퍼블 구조 안이면 그 구조 뒤에
    let block = this.sel.insertAnchor(this.sel.getBlock());
    if (block && /^(TD|TH)$/.test(block.tagName)) {
      block = block.closest('table');
      if (block.parentNode?.classList?.contains('jm-table-layer')) block = block.parentNode;
    }
    // 목록 항목이면 목록 전체 뒤에 삽입
    if (block && block.tagName === 'LI') block = block.parentNode;
    // 블록이 없으면(레이어 안 등) 커서 범위의 루트 직속 조상을 기준으로
    if (!block) {
      let n = this.sel.getRange()?.startContainer || null;
      while (n && n.parentNode && n.parentNode !== this.root) n = n.parentNode;
      if (n && n.parentNode === this.root) block = n;
    }

    const after = document.createElement('p');
    after.appendChild(document.createElement('br'));
    const frag = tpl.content;
    frag.appendChild(after);

    const isEmptyPara = block && block.tagName === 'P' && block.textContent.replace(ZWSP, '') === '' && !block.querySelector('img');
    if (isEmptyPara) block.replaceWith(frag);
    else if (block) block.parentNode.insertBefore(frag, block.nextSibling);
    else this.root.appendChild(frag);

    this.sel.placeCursor(after, false);
    this.editor.commit();
  }

  /** 현재 커서 위치의 서식 상태(툴바 활성화 표시용) */
  getState() {
    const block = this.sel.getBlock();
    return {
      strong: this.sel.isInside('strong'),
      em: this.sel.isInside('em'),
      u: this.sel.isInside('u'),
      s: this.sel.isInside('s'),
      a: this.sel.isInside('a'),
      ...this.getStyleState(),
      block: block ? block.tagName.toLowerCase() : null,
      quote: block?.tagName === 'BLOCKQUOTE' ? (block.dataset.style || 'line') : null, // 인용 스타일
      align: block ? (block.style.textAlign || 'left') : 'left',
      list: block && block.tagName === 'LI' ? block.parentNode.tagName.toLowerCase() : null,
      listType: block && block.tagName === 'LI' ? (block.parentNode.style.listStyleType || null) : null,
    };
  }
}
