/**
 * ImageCommands — 본문 이미지 글 감싸기·크기 조절
 *
 * - 저장 HTML: <img src="…" data-float="left|right" style="width: N%">  (N = 10~100, 본문 폭 대비)
 *   data-float 가 있으면 이미지가 그쪽에 붙고 뒤따르는 글이 둘러 흐른다. 조회 화면은 CSS 만으로 같은 모양.
 * - 본문 이미지를 클릭하면 선택되고 위쪽에 도구 막대가 뜬다:
 *   ⠿ 이동(이미지 문단을 다른 문단 앞뒤로) / 감싸기 없음·왼쪽·오른쪽 / 폭 30·40·50·100% / 교체 / 삭제
 * - 선택된 이미지 바깥 아래 모서리의 손잡이를 끌면 폭(%)이 바뀌고 글이 실시간으로 다시 흐른다.
 * - 갤러리·슬라이드·배치 블록 안 이미지는 각 블록이 다루므로 대상이 아니다.
 * - 도구 막대·손잡이는 document.body 에 붙어 저장 HTML 에 섞이지 않는다. 선택 표시 클래스는 unwrapHTML 에서 제거.
 */
import { stampSize } from '../gallery/gallery-layout.js';

const IMG_SELECTED_CLASS = 'jm-img-selected';
/** 다른 블록이 다루는 이미지 영역 */
const EXCLUDE = '.jm-gallery-layer, .jm-slider-layer, .jm-layout-layer, div[data-type="gallery"], div[data-type="slider"], div[data-type="layout"]';
const MIN_PCT = 10;
const MAX_PCT = 100;
const QUICK_WIDTHS = [30, 40, 50, 100];

export class ImageCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.root = editor.root;
    /** @type {HTMLImageElement|null} */
    this.img = null;

    this.bar = this.#buildBar();
    this.handle = this.#buildResizeHandle();
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.hidden = true;
    document.body.append(this.bar, this.handle, this.fileInput);
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files[0];
      this.fileInput.value = '';
      if (file && this.img) await this.replace(this.img, file);
    });

    // 이미지 클릭 → 선택. mousedown 기본 동작(브라우저 이미지 드래그·캐럿 이동)은 막는다
    this.onDown = (e) => {
      const img = e.target.closest?.('img');
      if (img && this.#isBodyImage(img)) { e.preventDefault(); this.select(img); return; }
      if (this.img && !this.bar.contains(e.target) && e.target !== this.handle) this.clear();
    };
    this.onKey = (e) => {
      if (!this.img) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(this.img); return; }
      this.clear(); // 그 밖의 키(입력·Esc 등)는 원래 커서로 — 이미지 선택만 푼다
    };
    this.onMove = () => this.#place();
    document.addEventListener('mousedown', this.onDown, true);
    this.root.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.onMove, true);
    window.addEventListener('resize', this.onMove);
  }

  // ───────────── 선택 ─────────────

  /** 감싸기 대상인 본문 이미지인지 (다른 블록 안 이미지 제외) */
  #isBodyImage(img) {
    return this.root.contains(img) && !img.closest(EXCLUDE);
  }

  /**
   * 이미지 선택: 표시 + 도구 막대·손잡이 위치
   * @param {HTMLImageElement} img
   */
  select(img) {
    if (this.img && this.img !== img) ImageCommands.#unmark(this.img);
    this.img = img;
    img.classList.add(IMG_SELECTED_CLASS);
    this.#bindMoveHandle(img);
    this.#refreshBar();
    this.bar.hidden = false;
    this.handle.hidden = false;
    this.#place();
  }

  /** 선택 해제 */
  clear() {
    if (this.img) ImageCommands.#unmark(this.img);
    this.img = null;
    this.bar.hidden = true;
    this.handle.hidden = true;
  }

  // ───────────── 명령 ─────────────

  /**
   * 감싸기 방향 지정
   * @param {HTMLImageElement} img
   * @param {'left'|'right'|null} side null 이면 감싸기 없음
   */
  setFloat(img, side) {
    if (side) img.dataset.float = side; else delete img.dataset.float;
    // 감싸기를 처음 켜면 폭이 없을 때 40% 로 시작 (원본 크기 그대로면 글이 들어갈 자리가 없음)
    if (side && !img.style.width) img.style.width = '40%';
    this.#changed();
  }

  /**
   * 폭 지정 (본문 폭 대비 %)
   * @param {HTMLImageElement} img
   * @param {number} pct 10~100 으로 맞춤
   */
  setWidth(img, pct) {
    img.style.width = `${Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(pct)))}%`;
    this.#changed();
  }

  /**
   * 이미지 교체: 업로드(또는 base64) 후 같은 자리·같은 감싸기·폭 유지
   * @param {HTMLImageElement} img
   * @param {File} file
   */
  async replace(img, file) {
    if (!file.type.startsWith('image/')) return;
    const src = this.editor.options.uploadImage
      ? await this.editor.options.uploadImage(file)
      : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.alt = file.name;
    await new Promise((resolve) => { img.onload = () => { stampSize(img, true); resolve(); }; img.onerror = resolve; img.src = src; });
    img.onload = null;
    this.#changed();
  }

  /**
   * 이미지 삭제: 이미지만 든 문단이면 빈 문단으로 남긴다
   * @param {HTMLImageElement} img
   */
  remove(img) {
    const p = img.parentElement;
    img.remove();
    if (p && p !== this.root && !p.textContent.trim() && !p.querySelector('img')) p.replaceChildren(document.createElement('br'));
    this.clear();
    this.editor.commit();
  }

  /** 변경 반영: 위치 갱신 + 히스토리 기록 */
  #changed() {
    this.#refreshBar();
    this.#place();
    this.editor.commit();
  }

  // ───────────── 도구 막대 / 손잡이 ─────────────

  #buildBar() {
    const bar = document.createElement('div');
    bar.className = 'jm-imgbar';
    bar.hidden = true;
    bar.addEventListener('mousedown', (e) => { if (e.target !== this.moveHandle) e.preventDefault(); });

    const mk = (label, title, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `jm-imgbar-btn ${cls}`.trim();
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => { if (this.img) onClick(this.img); });
      return b;
    };
    const sep = () => { const s = document.createElement('span'); s.className = 'jm-imgbar-sep'; return s; };

    this.moveSlot = document.createElement('span');
    this.floatBtns = {
      none: mk('감싸기 없음', '글을 감싸지 않음', (img) => this.setFloat(img, null)),
      left: mk('◧ 왼쪽', '이미지를 왼쪽에 두고 글이 오른쪽으로 흐름', (img) => this.setFloat(img, 'left')),
      right: mk('◨ 오른쪽', '이미지를 오른쪽에 두고 글이 왼쪽으로 흐름', (img) => this.setFloat(img, 'right')),
    };
    this.widthBtns = QUICK_WIDTHS.map((w) => { const b = mk(`${w}%`, `본문 폭의 ${w}%`, (img) => this.setWidth(img, w)); b.dataset.w = w; return b; });
    this.sizeLabel = document.createElement('span');
    this.sizeLabel.className = 'jm-imgbar-size';
    const replace = mk('교체', '다른 이미지 파일로 바꿈', () => this.fileInput.click());
    const del = mk('삭제', '이미지 삭제', (img) => this.remove(img), 'jm-imgbar-del');

    bar.append(this.moveSlot, ...Object.values(this.floatBtns), sep(), ...this.widthBtns, this.sizeLabel, sep(), replace, del);
    return bar;
  }

  /** 이동 핸들: 선택한 이미지의 문단(루트 직속 블록)을 BlockDrag 로 옮긴다. 표 셀 안 등 문단이 아니면 숨김 */
  #bindMoveHandle(img) {
    let block = img;
    while (block.parentElement && block.parentElement !== this.root) block = block.parentElement;
    const movable = block.parentElement === this.root && block.tagName === 'P';
    const h = document.createElement('span');
    h.className = 'jm-imgbar-move';
    h.textContent = '⠿';
    h.title = '끌어서 다른 문단 앞뒤로 이동';
    h.hidden = !movable;
    if (movable) this.editor.blockDrag?.makeDraggable(h, block);
    h.addEventListener('dragend', () => requestAnimationFrame(() => this.#place()));
    this.moveSlot.replaceChildren(h);
    this.moveHandle = h;
  }

  /** 현재 상태 표시 (감싸기 방향·폭) */
  #refreshBar() {
    const img = this.img;
    if (!img) return;
    const side = img.dataset.float || 'none';
    Object.entries(this.floatBtns).forEach(([k, b]) => b.classList.toggle('is-on', k === side));
    const pct = parseInt(img.style.width, 10);
    this.widthBtns.forEach((b) => b.classList.toggle('is-on', +b.dataset.w === pct));
    this.sizeLabel.textContent = pct ? `${pct}%` : '원본';
  }

  #buildResizeHandle() {
    const h = document.createElement('div');
    h.className = 'jm-img-resize';
    h.hidden = true;
    h.title = '끌어서 크기 조절';
    h.addEventListener('pointerdown', (e) => this.#startResize(e));
    return h;
  }

  /** 손잡이 드래그: 바깥쪽으로 끌면 커짐 (오른쪽 감싸기는 왼쪽 아래 손잡이) */
  #startResize(e) {
    const img = this.img;
    if (!img) return;
    e.preventDefault();
    const box = img.parentElement;
    const cs = getComputedStyle(box);
    const boxW = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const startW = img.getBoundingClientRect().width;
    const dir = img.dataset.float === 'right' ? -1 : 1;
    const startX = e.clientX;
    this.handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const pct = ((startW + (ev.clientX - startX) * dir) / boxW) * 100;
      img.style.width = `${Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(pct)))}%`;
      this.#refreshBar();
      this.#place();
    };
    const up = () => {
      this.handle.removeEventListener('pointermove', move);
      this.handle.removeEventListener('pointerup', up);
      this.handle.removeEventListener('pointercancel', up);
      this.editor.commit();
    };
    this.handle.addEventListener('pointermove', move);
    this.handle.addEventListener('pointerup', up);
    this.handle.addEventListener('pointercancel', up);
  }

  /** 도구 막대(이미지 위)·손잡이(바깥 아래 모서리) 위치 갱신. 이미지가 사라졌으면 선택 해제 */
  #place() {
    const img = this.img;
    if (!img) return;
    if (!img.isConnected || !this.root.contains(img)) { this.clear(); return; }
    const r = img.getBoundingClientRect();
    const sx = window.scrollX, sy = window.scrollY;
    const barH = this.bar.offsetHeight || 32;
    // 이미지 왼쪽 위에 맞추되 화면 오른쪽을 넘지 않게
    const maxLeft = document.documentElement.clientWidth - this.bar.offsetWidth - 4;
    this.bar.style.left = `${Math.max(4, Math.min(r.left, maxLeft)) + sx}px`;
    this.bar.style.top = `${Math.max(4, r.top + sy - barH - 6)}px`;
    const left = img.dataset.float === 'right' ? r.left : r.right;
    this.handle.style.left = `${left + sx - 6}px`;
    this.handle.style.top = `${r.bottom + sy - 6}px`;
  }

  // ───────────── 저장용 변환 ─────────────

  /**
   * 선택 표시 클래스 제거 (getHTML 에서 호출)
   * @param {string} html
   */
  static unwrapHTML(html) {
    if (!html.includes(IMG_SELECTED_CLASS)) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`img.${IMG_SELECTED_CLASS}`).forEach((img) => ImageCommands.#unmark(img));
    return tpl.innerHTML;
  }

  /** 선택 표시 클래스 제거 (빈 class 속성도 남기지 않음) */
  static #unmark(img) {
    img.classList.remove(IMG_SELECTED_CLASS);
    if (!img.classList.length) img.removeAttribute('class');
  }

  destroy() {
    document.removeEventListener('mousedown', this.onDown, true);
    this.root.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.onMove, true);
    window.removeEventListener('resize', this.onMove);
    this.bar.remove();
    this.handle.remove();
    this.fileInput.remove();
  }
}
