/**
 * FindReplace
 * - 찾기·바꾸기 논리 (입력줄 UI 는 ui/FindBar.js). 사용자 입력을 정규식으로 쓰지 않고 글자 그대로 비교한다.
 * - 범위: 편집 가능한 글(본문·표 칸·제목·갤러리/슬라이드 제목). 플러그인 헤더처럼 편집 불가인 글자와 입력란은 제외.
 * - 한 글 블록 안에서만 찾고(줄바꿈·이미지에서 끊김), 태그에 걸친 글자도 찾는다. 바꾸면 첫 글자의 서식을 따른다.
 * - 강조는 CSS Custom Highlight API 라 DOM·저장 HTML 에 흔적이 없다. 미지원 브라우저는 현재 일치만 선택 표시.
 */

import { hasInlineContent } from './SelectionUtil.js';

/** 표시·강조할 일치 수 상한 (넘으면 'N개 이상'). 모두 바꾸기는 상한과 상관없이 전부 바꾼다 */
const MATCH_MAX = 10000;
/** 강조 이름 (jm-editor.css 의 ::highlight 와 같음) */
const HIGHLIGHT_ALL = 'jm-find';
const HIGHLIGHT_CURRENT = 'jm-find-current';
/** 에디터별 지금 강조 범위 — 강조 이름은 문서 전체에 하나라 여러 에디터의 범위를 합쳐 건다 */
const activeHighlights = new Map();

/** @returns {boolean} CSS Custom Highlight API 지원 여부 */
function highlightSupported() {
  return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';
}

/** 모든 에디터의 강조 범위를 문서에 다시 건다 */
function applyHighlights() {
  if (!highlightSupported()) return;
  const all = new Highlight(); // add 반복: 전개 인자는 개수 한도가 있다
  const cur = new Highlight();
  cur.priority = 1;
  activeHighlights.forEach((h) => { h.all.forEach((r) => all.add(r)); if (h.current) cur.add(h.current); });
  if (all.size) CSS.highlights.set(HIGHLIGHT_ALL, all); else CSS.highlights.delete(HIGHLIGHT_ALL);
  if (cur.size) CSS.highlights.set(HIGHLIGHT_CURRENT, cur); else CSS.highlights.delete(HIGHLIGHT_CURRENT);
}

/**
 * 비교용 글자 하나 접기: 길이를 바꾸지 않아 위치가 어긋나지 않는다 (nbsp 는 공백으로, 대소문자 무시면 소문자로)
 * @param {string} text
 * @param {boolean} caseSensitive
 * @returns {string} text 와 길이가 같은 문자열
 */
function foldText(text, caseSensitive) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === ' ') c = ' ';
    else if (!caseSensitive) { const low = c.toLowerCase(); if (low.length === 1) c = low; }
    out += c;
  }
  return out;
}

export class FindReplace {
  /** @param {import('./JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.query = '';
    this.caseSensitive = false;
    /** @type {Array<{parts: Array<{node: Text, start: number, end: number}>, range: Range}>} 일치 (문서 순서) */
    this.matches = [];
    /** 일치가 상한(MATCH_MAX)을 넘어 잘렸는지 */
    this.capped = false;
    /** 현재 일치 번호 (없으면 -1) */
    this.index = -1;
    /** 바꾸는 동안에는 변경 알림으로 다시 찾지 않는다 */
    this.busy = false;
    /** 일치 수가 바뀌면 부르는 콜백 (입력줄 표시) */
    this.onChange = null;
  }

  /** 일치 수 */
  get count() { return this.matches.length; }

  /**
   * 찾기 시작. 커서 뒤 첫 일치를 현재로 한다 (뒤에 없으면 처음)
   * @param {string} query 찾을 말 (글자 그대로)
   * @param {{caseSensitive?: boolean}} [opts]
   * @returns {number} 일치 수
   */
  search(query, opts = {}) {
    this.query = String(query ?? '').replace(/​/g, '');
    this.caseSensitive = !!opts.caseSensitive;
    this.#collect();
    this.index = this.#firstAtOrAfter(this.editor.sel.saved);
    this.#show();
    return this.count;
  }

  /** 다음 일치로 (끝이면 처음으로) */
  next() { return this.#step(1); }

  /** 이전 일치로 (처음이면 끝으로) */
  prev() { return this.#step(-1); }

  /**
   * 현재 일치를 바꾸고 그 뒤 일치로 간다
   * @param {string} text 바꿀 말 (글자로만 넣는다)
   * @returns {boolean} 바꿨으면 true
   */
  replace(text) {
    const m = this.matches[this.index];
    if (!m) return false;
    this.#edit(() => this.#replaceMatch(m, String(text ?? '')));
    return true;
  }

  /**
   * 일치를 모두 바꾼다 (되돌리기 1단계). 바꾼 글은 다시 찾지 않는다
   * @param {string} text 바꿀 말 (글자로만 넣는다)
   * @returns {number} 바꾼 수
   */
  replaceAll(text) {
    if (!this.count) return 0;
    let n = 0;
    this.#edit(() => {
      n = this.#replaceEvery(String(text ?? ''));
      return null;
    });
    return n;
  }

  /** 내용이 바뀌었을 때 다시 찾기 (현재 위치는 가능한 한 유지). 찾는 중이 아니면 아무것도 하지 않는다 */
  refresh() {
    if (!this.query || this.busy) return;
    try {
      const at = this.matches[this.index]?.range;
      const anchor = at?.startContainer.isConnected ? at.cloneRange() : null;
      this.#collect();
      this.index = this.#firstAtOrAfter(anchor);
      this.#show(false);
    } catch (err) { // 찾기 표시가 실패해도 편집·변경 알림을 막지 않는다
      console.error(err);
      this.clear();
    }
  }

  /** 찾기 끝: 강조·일치를 지운다 */
  clear() {
    this.query = '';
    this.matches = [];
    this.capped = false;
    this.index = -1;
    activeHighlights.delete(this);
    applyHighlights();
    this.onChange?.();
  }

  /** 정리 */
  destroy() {
    this.onChange = null;
    this.clear();
  }

  /**
   * 편집을 한 단계로 묶는다: 앞선 입력을 먼저 기록하고, 고친 뒤 기록하고, 다시 찾는다
   * @param {() => (Range|null)} fn 고치기. 다음 일치를 찾을 기준 범위를 돌려준다
   */
  #edit(fn) {
    this.busy = true;
    try {
      this.editor.history.push();
      const after = fn();
      this.#collect();
      this.index = this.#firstAtOrAfter(after);
      this.editor.commit();
    } finally { this.busy = false; }
    this.#show(false);
  }

  /** 앞뒤로 움직이기 */
  #step(delta) {
    if (!this.count) { this.#show(); return false; }
    this.index = (this.index + delta + this.count) % this.count;
    this.#show(true, true);
    return true;
  }

  /**
   * 기준 범위 시작과 같거나 뒤인 첫 일치 번호
   * @param {Range|null|undefined} at
   * @returns {number} 일치가 없으면 -1, 뒤에 없으면 0
   */
  #firstAtOrAfter(at) {
    if (!this.count) return -1;
    if (!at || !this.editor.root.contains(at.startContainer)) return 0;
    const found = this.matches.findIndex((m) => m.range.compareBoundaryPoints(Range.START_TO_START, at) >= 0);
    return found < 0 ? 0 : found;
  }

  /**
   * 글을 글 블록 단위 줄로 모은다. 편집 불가인 글자는 건너뛰고, 줄바꿈·이미지·블록 경계에서 끊는다
   * @returns {Array<{text: string, parts: Array<{node: Text, from: number, offsets: number[]|null}>}>}
   */
  #runs() {
    const { root, sel } = this.editor;
    const runs = [];
    let cur = null;
    let line = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (/^(BR|IMG|HR|PICTURE|IFRAME|TABLE)$/.test(n.tagName)) cur = null;
        continue;
      }
      const parent = n.parentElement;
      if (!parent?.isContentEditable) { cur = null; continue; }
      const owner = sel.textBlockOf(n);
      if (!owner && !/[^\s​]/.test(n.data)) continue; // 블록 사이 공백
      const itemP = parent.closest('li > p'); // 목록 항목 직속 문단은 항목을 글 블록으로 치지만 줄은 따로다
      const key = itemP && itemP.parentElement === owner ? itemP : owner;
      if (key !== line) { cur = null; line = key; }
      if (!cur) runs.push(cur = { text: '', parts: [] });
      const hasZwsp = n.data.includes('​');
      const offsets = hasZwsp ? [] : null;
      const from = cur.text.length;
      if (hasZwsp) {
        let kept = '';
        for (let i = 0; i < n.length; i++) if (n.data[i] !== '​') { kept += n.data[i]; offsets.push(i); }
        offsets.push(n.length);
        cur.text += kept;
      } else cur.text += n.data;
      cur.parts.push({ node: n, from, offsets });
    }
    return runs;
  }

  /** 일치 목록 다시 만들기 (표시용, 상한까지) */
  #collect() {
    this.matches = [];
    this.capped = false;
    this.#eachMatch((parts) => {
      if (this.matches.length >= MATCH_MAX) { this.capped = true; return false; }
      this.matches.push(FindReplace.#toMatch(parts));
      return true;
    });
  }

  /**
   * 모든 일치의 글 노드 조각을 문서 순서로 넘긴다
   * @param {(parts: Array<{node: Text, start: number, end: number}>) => boolean} fn false 를 돌려주면 멈춘다
   */
  #eachMatch(fn) {
    if (!this.query) return;
    const q = foldText(this.query, this.caseSensitive);
    for (const run of this.#runs()) {
      const hay = foldText(run.text, this.caseSensitive);
      let from = 0; // 일치는 앞에서 뒤로 가므로 조각을 처음부터 다시 훑지 않는다
      for (let at = hay.indexOf(q); at >= 0; at = hay.indexOf(q, at + q.length)) {
        const end = at + q.length;
        while (from + 1 < run.parts.length && run.parts[from + 1].from <= at) from++;
        const parts = [];
        for (let i = from; i < run.parts.length && run.parts[i].from < end; i++) {
          const p = run.parts[i];
          const stop = i + 1 < run.parts.length ? run.parts[i + 1].from : run.text.length;
          const a = Math.max(at, p.from);
          const b = Math.min(end, stop);
          if (a >= b) continue;
          const pos = (k) => (p.offsets ? p.offsets[k - p.from] : k - p.from);
          parts.push({ node: p.node, start: pos(a), end: pos(b - 1) + 1 });
        }
        if (fn(parts) === false) return;
      }
    }
  }

  /**
   * 일치를 전부 바꾼다. 뒤에서부터 고쳐 앞 일치 위치가 밀리지 않고, 한 글 노드 안의 일치는 한 번에 고친다 (일치마다 고치면 긴 글에서 이차 시간)
   * @param {string} text
   * @returns {number} 바꾼 수
   */
  #replaceEvery(text) {
    const all = [];
    this.#eachMatch((parts) => { all.push(parts); return true; });
    this.matches = []; // 살아 있는 범위를 들고 고치지 않는다 (뒤에서 다시 찾는다)
    let node = null;
    let tail = '';
    let upto = 0;
    const flush = () => {
      if (!node) return;
      node.data = node.data.slice(0, upto) + tail;
      if (!text) this.#afterDelete(node);
      node = null;
    };
    for (let i = all.length - 1; i >= 0; i--) {
      const parts = all[i];
      if (parts.length > 1) { flush(); this.#replaceMatch({ parts }, text); continue; }
      const p = parts[0];
      if (p.node !== node) { flush(); node = p.node; upto = node.length; tail = ''; }
      tail = text + node.data.slice(p.end, upto) + tail;
      upto = p.start;
    }
    flush();
    return all.length;
  }

  /**
   * 조각으로 일치 객체를 만든다
   * @param {Array<{node: Text, start: number, end: number}>} parts
   */
  static #toMatch(parts) {
    const range = document.createRange();
    range.setStart(parts[0].node, parts[0].start);
    range.setEnd(parts[parts.length - 1].node, parts[parts.length - 1].end);
    return { parts, range };
  }

  /**
   * 일치 하나 바꾸기: 첫 조각 자리에 글자로 넣고(그 서식을 따름) 나머지 조각을 지운다. 비게 된 인라인은 걷어 낸다
   * @param {{parts: Array<{node: Text, start: number, end: number}>}} m
   * @param {string} text
   * @returns {Range} 바꾼 글 바로 뒤 (접힌 범위)
   */
  #replaceMatch(m, text) {
    const [first, ...rest] = m.parts;
    rest.reverse().forEach((p) => {
      p.node.deleteData(p.start, p.end - p.start);
      this.#afterDelete(p.node);
    });
    first.node.replaceData(first.start, first.end - first.start, text);
    const after = document.createRange();
    after.setStart(first.node, first.start + text.length);
    after.collapse(true);
    if (!text) {
      const left = this.#afterDelete(first.node);
      if (left !== first.node && left?.isConnected) after.setStart(left, 0);
      after.collapse(true);
    }
    return after;
  }

  /**
   * 글을 지운 뒤 정리: 글 노드가 비었으면 걷어 내고, 내용이 전혀 없어진 버튼은 항목째 지우고, 비게 된 글 블록에는 커서 자리를 둔다
   * @param {Text} node
   * @returns {Node|null} 남은 노드
   */
  #afterDelete(node) {
    const block = this.editor.sel.textBlockOf(node);
    const button = node.parentElement?.closest('a[data-role="button"]');
    const left = this.#dropIfEmpty(node);
    if (button && !hasInlineContent(button)) { this.editor.buttons.removeButton(button); return null; }
    if (block?.isConnected && !hasInlineContent(block)) block.appendChild(document.createElement('br'));
    return left;
  }

  /**
   * 빈 글 노드를 지우고 글 블록까지 올라가며 비게 된 글자 서식 요소도 지운다 (버튼 링크처럼 블록이 정한 요소는 남긴다)
   * @param {Text} node
   * @returns {Node} 남은 노드 (안 지웠으면 node, 지웠으면 남은 부모)
   */
  #dropIfEmpty(node) {
    if (node.data.replace(/​/g, '')) return node;
    const { sel, root } = this.editor;
    let parent = node.parentNode;
    node.remove();
    while (parent !== root && !sel.isTextBlock(parent) && !parent.hasAttribute('data-role') && /^(STRONG|EM|U|S|SUB|SUP|SPAN|A|SMALL)$/.test(parent.tagName) && !hasInlineContent(parent)) {
      const up = parent.parentNode;
      parent.remove();
      parent = up;
    }
    return parent;
  }

  /**
   * 강조·현재 일치 표시
   * @param {boolean} [scroll=true] 현재 일치를 화면에 보이게
   * @param {boolean} [select=false] Highlight 미지원 때 현재 일치를 선택 표시 (입력 중에는 입력란 포커스를 뺏지 않도록 이전·다음 때만)
   */
  #show(scroll = true, select = false) {
    const cur = this.matches[this.index];
    if (highlightSupported()) {
      if (this.count) activeHighlights.set(this, { all: this.matches.map((m) => m.range), current: cur?.range || null });
      else activeHighlights.delete(this);
      applyHighlights();
    } else if (cur && select) {
      this.editor.sel.setRange(cur.range.cloneRange());
    }
    if (cur && scroll) cur.parts[0].node.parentElement?.scrollIntoView?.({ block: 'nearest' });
    this.onChange?.();
  }
}
