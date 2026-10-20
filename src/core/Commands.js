/**
 * Commands
 * - 서식 명령 모음. execCommand 를 쓰지 않고 Range/DOM 조작으로 구현.
 * - 모든 명령은 에디터 루트 안에서만 동작하며, 실행 후 editor.commit() 으로 히스토리 기록·변경 알림을 한다.
 */
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

  /** 선택 영역이 있을 때의 인라인 토글 */
  #toggleInlineRange(tag, range) {
    const upper = tag.toUpperCase();
    const allFormatted = this.#isRangeFullyInside(range, upper);

    if (allFormatted) {
      // 해제: 선택 영역을 잘라낸 뒤(경계의 태그는 자동 분할됨) 그 안의 해당 태그를 언래핑
      const frag = range.extractContents();
      this.#unwrapTag(frag, upper);
      const first = frag.firstChild;
      const last = frag.lastChild;

      // 잘라낸 뒤 커서가 여전히 wrapper 안이면, wrapper 를 커서 지점에서 앞/뒤로 분할하고 그 사이에 삽입
      const wrapper = this.#findAncestor(range.startContainer, upper);
      if (wrapper) {
        const tailRange = document.createRange();
        tailRange.setStart(range.startContainer, range.startOffset);
        tailRange.setEnd(wrapper, wrapper.childNodes.length);
        const tailEl = wrapper.cloneNode(false);
        tailEl.appendChild(tailRange.extractContents());

        wrapper.parentNode.insertBefore(frag, wrapper.nextSibling);
        if (last) wrapper.parentNode.insertBefore(tailEl, last.nextSibling);
        this.#cleanEmpty(wrapper);
        this.#cleanEmpty(tailEl);
      } else {
        range.insertNode(frag);
      }
      if (first && last) {
        const r = document.createRange();
        r.setStartBefore(first);
        r.setEndAfter(last);
        this.sel.setRange(r);
      }
    } else {
      // 적용: 잘라낸 내용에서 중첩된 동일 태그 제거 후 감싸기
      const frag = range.extractContents();
      this.#unwrapTag(frag, upper);
      const el = document.createElement(tag);
      el.appendChild(frag);
      range.insertNode(el);
      const r = document.createRange();
      r.selectNodeContents(el);
      this.sel.setRange(r);
    }
  }

  /** range 안의 모든 텍스트가 특정 태그 안에 있는지 검사 */
  #isRangeFullyInside(range, upper) {
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let node;
    let found = false;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node) || node.textContent === ZWSP) continue;
      found = true;
      if (!this.#findAncestor(node, upper)) return false;
    }
    return found;
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

  /** 노드 트리 안의 특정 태그를 모두 언래핑 */
  #unwrapTag(container, upper) {
    container.querySelectorAll(upper.toLowerCase()).forEach((el) => {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
    });
  }

  /** 내용이 비었으면(ZWSP 포함) 요소 제거 */
  #cleanEmpty(el) {
    if (el && el.textContent.replace(ZWSP, '') === '' && !el.querySelector('img,br')) el.remove();
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
      // 커서만 있을 때: 빈 span 을 넣어 이후 입력에 적용 (해제는 span 밖으로)
      const inside = this.#findStyledAncestor(range.startContainer, prop);
      if (!value) {
        if (!inside) return;
        const after = document.createTextNode(ZWSP);
        inside.parentNode.insertBefore(after, inside.nextSibling);
        const r = document.createRange(); r.setStart(after, 1); r.collapse(true); this.sel.setRange(r);
      } else {
        const span = document.createElement('span');
        span.style.setProperty(prop, value);
        span.appendChild(document.createTextNode(ZWSP));
        range.insertNode(span);
        const r = document.createRange(); r.setStart(span.firstChild, 1); r.collapse(true); this.sel.setRange(r);
      }
      this.editor.commit();
      return;
    }

    // 선택 영역: 잘라내기 → 안쪽의 같은 속성 제거 → (적용이면) span 으로 감싸기
    const frag = range.extractContents();
    this.#stripStyle(frag, prop);
    let node;
    if (value) {
      node = document.createElement('span');
      node.style.setProperty(prop, value);
      node.appendChild(frag);
    } else {
      node = frag;
    }
    const first = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.firstChild : node;
    const last = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node;

    // 잘라낸 지점이 같은 속성 span 안이면 분할해서 바깥에 삽입
    const wrapper = this.#findStyledAncestor(range.startContainer, prop);
    if (wrapper) {
      const tailRange = document.createRange();
      tailRange.setStart(range.startContainer, range.startOffset);
      tailRange.setEnd(wrapper, wrapper.childNodes.length);
      const tailEl = wrapper.cloneNode(false);
      tailEl.appendChild(tailRange.extractContents());
      wrapper.parentNode.insertBefore(node, wrapper.nextSibling);
      if (last) wrapper.parentNode.insertBefore(tailEl, last.nextSibling);
      this.#cleanEmpty(wrapper);
      this.#cleanEmpty(tailEl);
    } else {
      range.insertNode(node);
    }
    if (first && last) {
      const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last); this.sel.setRange(r);
    }
    this.editor.commit();
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

  /** 트리 안의 span 에서 prop 제거. 스타일이 남지 않는 span 은 언래핑 */
  #stripStyle(container, prop) {
    container.querySelectorAll('span').forEach((el) => {
      el.style.removeProperty(prop);
      if (!el.getAttribute('style') || el.style.length === 0) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
      }
    });
  }

  /** 현재 커서 위치의 글자색/배경색 */
  getStyleState() {
    const r = this.sel.getRange();
    if (!r) return { color: null, bg: null };
    return {
      color: this.#findStyledAncestor(r.startContainer, 'color')?.style.color || null,
      bg: this.#findStyledAncestor(r.startContainer, 'background-color')?.style.backgroundColor || null,
    };
  }

  // ───────────── 블록 서식 (p / h1~h3 / blockquote) ─────────────

  /**
   * 현재 블록을 다른 블록 태그로 교체. 같은 태그면 p 로 되돌림.
   * @param {'p'|'h1'|'h2'|'h3'|'blockquote'} tag
   */
  setBlock(tag) {
    const block = this.sel.getBlock();
    if (!block || /^(LI|TD|TH)$/.test(block.tagName)) return; // 목록 항목·표 셀은 블록 교체 대상 아님
    const target = block.tagName.toLowerCase() === tag ? 'p' : tag;
    const el = document.createElement(target);
    while (block.firstChild) el.appendChild(block.firstChild);
    block.replaceWith(el);
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
    if (!block || /^(TD|TH)$/.test(block.tagName)) return; // 표 셀 안에서는 목록 미지원
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
        const newList = document.createElement(listTag);
        while (list.firstChild) newList.appendChild(list.firstChild);
        list.replaceWith(newList);
        applyType(newList);
      }
    } else {
      const list = document.createElement(listTag);
      const li = document.createElement('li');
      while (block.firstChild) li.appendChild(block.firstChild);
      list.appendChild(li);
      block.replaceWith(list);
      applyType(list);
      this.sel.placeCursor(li, true);
    }
    this.editor.commit();
  }

  /** li 를 목록에서 빼내어 p 로 변환 (목록은 필요 시 분할) */
  #removeFromList(li) {
    const list = li.parentNode;
    const p = document.createElement('p');
    while (li.firstChild) p.appendChild(li.firstChild);

    // li 뒤에 형제가 있으면 새 목록으로 분리
    const after = document.createElement(list.tagName.toLowerCase());
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
    if (!range) return;
    const existing = this.sel.closest('a');

    if (existing) {
      if (url) { this.editor.constructor.setHref(existing, url); } // 기존 링크: 주소만 수정
      else {                                                 // 해제
        while (existing.firstChild) existing.parentNode.insertBefore(existing.firstChild, existing);
        existing.remove();
      }
      this.editor.commit();
      return;
    }
    if (!url || range.collapsed) return;

    const a = document.createElement('a');
    this.editor.constructor.setHref(a, url);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(range.extractContents());
    range.insertNode(a);
    this.sel.placeCursor(a, true);
    this.editor.commit();
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

    const block = this.sel.getBlock();
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

  /**
   * 커서 위치에 HTML 조각 삽입 (붙여넣기 등). Sanitizer 를 통과한 HTML 만 넘길 것.
   * @param {string} html
   */
  insertHTML(html) {
    const range = this.sel.getRange();
    if (!range) return;
    range.deleteContents();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const last = tpl.content.lastChild;
    range.insertNode(tpl.content);
    if (last) this.sel.placeCursor(last, true);
    this.editor.commit();
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

    // 표 셀 안이면 셀 밖(표 레이어 뒤)에 삽입
    let block = this.sel.getBlock();
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
      list: block && block.tagName === 'LI' ? block.parentNode.tagName.toLowerCase() : null,
      listType: block && block.tagName === 'LI' ? (block.parentNode.style.listStyleType || null) : null,
    };
  }
}
