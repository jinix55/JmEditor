/**
 * ImageCommands — 본문 이미지 글 감싸기·크기 조절
 *
 * - 저장 HTML: <img src="…" data-float="left|right" style="width: N%">  (N = 10~100, 본문 폭 대비)
 *   data-float 가 있으면 이미지가 그쪽에 붙고 뒤따르는 글이 둘러 흐른다. 조회 화면은 CSS 만으로 같은 모양.
 * - 본문 이미지를 클릭하면 선택되고 위쪽에 도구 막대가 뜬다:
 *   ⠿ 이동(이미지 문단을 다른 문단 앞뒤로) / 감싸기 없음·왼쪽·오른쪽 / 폭 30·40·50·100% / 교체 / 삭제
 * - 선택된 이미지 바깥 아래 모서리의 손잡이를 끌면 폭(%)이 바뀌고 글이 실시간으로 다시 흐른다.
 * - 모바일 이미지: <picture><source media="(max-width: 767px)" srcset="…"><img …></picture>
 *   도구 막대의 모바일 추가·교체·삭제. 모바일 media 값은 옵션 image.mobileMedia 로 바꾼다.
 *   PC 교체는 img 만 바꾸고 source 는 유지, 이미지 삭제는 picture 째로 지운다.
 * - 갤러리·슬라이드·배치 블록 안 이미지는 각 블록이 다루므로 대상이 아니다.
 * - 도구 막대·손잡이는 document.body 에 붙어 저장 HTML 에 섞이지 않는다. 선택 표시 클래스는 unwrapHTML 에서 제거.
 */
import { stampSize } from '../gallery/gallery-layout.js';
import { Sanitizer } from '../../core/Sanitizer.js';
import { notify } from '../gallery/gallery-upload.js';

const IMG_SELECTED_CLASS = 'jm-img-selected';
/** 다른 블록이 다루는 이미지 영역 */
const EXCLUDE = '.jm-gallery-layer, .jm-slider-layer, .jm-layout-layer, div[data-type="gallery"], div[data-type="slider"], div[data-type="layout"]';
const MIN_PCT = 10;
const MAX_PCT = 100;
const QUICK_WIDTHS = [30, 40, 50, 100];
/** 모바일 source 의 기본 media 값 */
const DEFAULT_MOBILE_MEDIA = '(max-width: 767px)';

export class ImageCommands {
  /**
   * @param {import('../../core/JmEditor.js').JmEditor} editor
   * @param {{mobileMedia?: string}} [config] 이미지 설정 (config.js 의 image 섹션)
   */
  constructor(editor, config = {}) {
    this.editor = editor;
    /** 모바일 source 의 media 값 — 저장 정제(Sanitizer.isSafeMedia)를 통과하지 못하면 기본값 + 경고 (넣자마자 저장에서 지워지지 않게) */
    this.mobileMedia = ImageCommands.#mediaOption(config.mobileMedia);
    this.root = editor.root;
    /** @type {HTMLImageElement|null} */
    this.img = null;

    this.bar = this.#buildBar();
    this.handle = this.#buildResizeHandle();
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.hidden = true;
    /** 모바일 이미지 추가·교체용 파일 입력 (PC 교체용과 따로) */
    this.mobileInput = this.fileInput.cloneNode();
    document.body.append(this.bar, this.handle, this.fileInput, this.mobileInput);
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files[0];
      this.fileInput.value = '';
      if (file && this.img) await this.replace(this.img, file);
    });
    this.mobileInput.addEventListener('change', async () => {
      const file = this.mobileInput.files[0];
      this.mobileInput.value = '';
      if (!file || !this.img) return;
      if (ImageCommands.mobileSource(this.img)) await this.replaceMobile(this.img, file); else await this.addMobile(this.img, file);
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
    const src = await this.#upload(file);
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.alt = file.name;
    await new Promise((resolve) => { img.onload = () => { stampSize(img, true); resolve(); }; img.onerror = resolve; img.src = src; });
    img.onload = null;
    this.#changed();
  }

  /**
   * 파일 → 주소: uploadImage 옵션이 있으면 업로드, 없으면 base64(data:)
   * @param {File} file
   * @returns {Promise<string>}
   */
  async #upload(file) {
    return this.editor.options.uploadImage
      ? this.editor.options.uploadImage(file)
      : new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  }

  /**
   * 옵션 image.mobileMedia 검사: 없으면 기본값, Sanitizer.isSafeMedia 를 통과하지 못하면 console.warn 후 기본값
   * @param {*} value
   * @returns {string}
   */
  static #mediaOption(value) {
    if (value == null || value === '') return DEFAULT_MOBILE_MEDIA;
    if (typeof value === 'string' && Sanitizer.isSafeMedia(value)) return value;
    console.warn(`[JmEditor] image.mobileMedia 값이 올바르지 않아 기본값 ${DEFAULT_MOBILE_MEDIA} 을 씁니다:`, value);
    return DEFAULT_MOBILE_MEDIA;
  }

  /**
   * 업로드 주소 → 모바일 source 의 srcset. 주소의 공백·쉼표는 srcset 구분자라 %인코딩해 다시 검사하고,
   * 그래도 쓸 수 없으면(상대 경로·javascript: 등) 사용자에게 알리고 null
   * @param {string} url uploadImage(또는 base64) 결과
   * @returns {string|null}
   */
  #mobileSrcset(url) {
    const raw = String(url ?? '').trim();
    const srcset = Sanitizer.cleanSrcset(raw)
      ?? (/^data:/i.test(raw) ? null : Sanitizer.cleanSrcset(raw.replace(/[\s,]/g, (c) => encodeURIComponent(c))));
    if (!srcset) notify(this.editor.options, `모바일 이미지 주소를 쓸 수 없습니다: ${raw.slice(0, 100)}`);
    return srcset;
  }

  /**
   * 이미지가 든 picture 의 첫 source (모바일 이미지). 없으면 null
   * @param {HTMLImageElement} img
   * @returns {HTMLSourceElement|null}
   */
  static mobileSource(img) {
    const p = img.parentElement;
    return p?.tagName === 'PICTURE' ? p.querySelector(':scope > source') : null;
  }

  /**
   * 모바일 이미지 추가: picture 로 감싸고 source[media][srcset] 를 img 앞에 둔다
   * @param {HTMLImageElement} img
   * @param {File} file
   */
  async addMobile(img, file) {
    if (!file.type.startsWith('image/')) return;
    const srcset = this.#mobileSrcset(await this.#upload(file));
    if (!srcset) return;
    let pic = img.parentElement;
    if (pic?.tagName !== 'PICTURE') {
      pic = document.createElement('picture');
      img.before(pic);
      pic.append(img);
    }
    const source = document.createElement('source');
    source.setAttribute('media', this.mobileMedia);
    source.setAttribute('srcset', srcset);
    pic.prepend(source);
    this.#changed();
  }

  /**
   * 모바일 이미지 교체: 첫 source 의 srcset 만 새 주소로. type 이 새 파일 형식과 다르면 지운다
   * @param {HTMLImageElement} img
   * @param {File} file
   */
  async replaceMobile(img, file) {
    const source = ImageCommands.mobileSource(img);
    if (!source || !file.type.startsWith('image/')) return;
    const srcset = this.#mobileSrcset(await this.#upload(file));
    if (!srcset) return;
    source.setAttribute('srcset', srcset);
    if (source.getAttribute('type') !== file.type) source.removeAttribute('type');
    this.#changed();
  }

  /**
   * 모바일 이미지 삭제: 첫 source 삭제. source 가 더 없으면 picture 를 벗긴다(picture 자체 속성은 버림)
   * @param {HTMLImageElement} img
   */
  removeMobile(img) {
    const source = ImageCommands.mobileSource(img);
    if (!source) return;
    const pic = img.parentElement;
    source.remove();
    if (!pic.querySelector(':scope > source')) pic.replaceWith(img);
    this.#changed();
  }

  /**
   * 이미지 삭제: picture 안이면 picture 째로. 이미지만 든 문단이면 빈 문단으로 남긴다
   * @param {HTMLImageElement} img
   */
  remove(img) {
    const target = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : img;
    const p = target.parentElement;
    target.remove();
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

    // 모바일 이미지: source 있음 → 썸네일 + 교체 + 삭제, 없음 → 추가
    this.mobileThumb = document.createElement('img');
    this.mobileThumb.className = 'jm-imgbar-thumb';
    this.mobileThumb.alt = '';
    this.mobileThumb.title = '모바일 이미지';
    this.mobileAdd = mk('모바일 추가', '모바일 화면용 이미지를 추가', () => this.#pickMobile());
    this.mobileReplace = mk('모바일 교체', '모바일 화면용 이미지를 바꿈', () => this.#pickMobile());
    this.mobileDel = mk('모바일 삭제', '모바일 화면용 이미지를 삭제', (img) => this.removeMobile(img), 'jm-imgbar-del');
    this.mobileSep = sep();
    this.mobileGroup = [this.mobileSep, this.mobileThumb, this.mobileAdd, this.mobileReplace, this.mobileDel];

    bar.append(this.moveSlot, ...Object.values(this.floatBtns), sep(), ...this.widthBtns, this.sizeLabel, sep(), replace, del, ...this.mobileGroup);
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

  /** 모바일 이미지 파일 선택창 열기 */
  #pickMobile() {
    this.mobileInput.click();
  }

  /** 현재 상태 표시 (감싸기 방향·폭·모바일 이미지 유무) */
  #refreshBar() {
    const img = this.img;
    if (!img) return;
    const side = img.dataset.float || 'none';
    Object.entries(this.floatBtns).forEach(([k, b]) => b.classList.toggle('is-on', k === side));
    const pct = parseInt(img.style.width, 10);
    this.widthBtns.forEach((b) => b.classList.toggle('is-on', +b.dataset.w === pct));
    this.sizeLabel.textContent = pct ? `${pct}%` : '원본';
    const source = ImageCommands.mobileSource(img);
    this.mobileThumb.hidden = this.mobileReplace.hidden = this.mobileDel.hidden = !source;
    this.mobileAdd.hidden = !!source;
    if (source) this.mobileThumb.src = (source.getAttribute('srcset') || '').trim().split(/\s+/)[0] || '';
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

  // ───────────── picture 안 글 정리 ─────────────

  /**
   * 편집 DOM 의 picture 정리 + 커서 유지. 크롬은 picture 끝에서 입력하거나 뒤 글 앞에서 Backspace 하면 글을 picture 안(img 뒤)에
   * 넣는데, 저장 정제는 img 뒤 자식을 버리므로 화면과 저장이 어긋난다 → 입력·commit 때마다 글을 picture 밖으로 옮긴다.
   * 옮긴 글 안에 커서가 있으면 커서도 그 글을 따라간다.
   */
  fixPictures() {
    if (!this.root.querySelector('picture')) return;
    const r = this.editor.sel.getRange();
    const start = r && ImageCommands.#boundaryRef(r.startContainer, r.startOffset);
    const end = r && ImageCommands.#boundaryRef(r.endContainer, r.endOffset);
    if (!ImageCommands.fixPictures(this.root) || !r) return;
    const next = document.createRange();
    if (!ImageCommands.#applyRef(next, start, true) || !ImageCommands.#applyRef(next, end, false)) return;
    this.editor.sel.setRange(next);
  }

  /**
   * picture 의 글·요소를 밖으로 옮긴다: img 뒤의 모든 노드는 picture 바로 뒤로, img 앞의 source 가 아닌 노드(공백 글 제외)는
   * picture 바로 앞으로 (화면에 보이던 순서 그대로). img 가 없으면 남은 노드를 앞으로 옮기고 picture 를 지운다.
   * @param {ParentNode} root
   * @returns {boolean} 옮긴 것이 있으면 true
   */
  static fixPictures(root) {
    let changed = false;
    root.querySelectorAll('picture').forEach((pic) => {
      const kids = Array.from(pic.childNodes);
      const imgAt = kids.findIndex((n) => n.nodeName === 'IMG');
      const before = (imgAt < 0 ? kids : kids.slice(0, imgAt)).filter((n) => n.nodeName !== 'SOURCE' && !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()));
      const after = imgAt < 0 ? [] : kids.slice(imgAt + 1);
      if (before.length) { pic.before(...before); changed = true; }
      if (after.length) { pic.after(...after); changed = true; }
      if (imgAt < 0) { pic.remove(); changed = true; }
    });
    return changed;
  }

  /**
   * 범위 경계를 노드 기준으로 기억한다 — 글 노드면 (노드, 위치), 요소면 「그 자리 다음 자식 앞」(자식이 옮겨져도 따라가게)
   * @param {Node} node
   * @param {number} offset
   * @returns {{node: Node, offset?: number, before?: Node|null}}
   */
  static #boundaryRef(node, offset) {
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };
    return { node, before: node.childNodes[offset] || null };
  }

  /**
   * 기억한 경계를 범위에 적용
   * @param {Range} range
   * @param {{node: Node, offset?: number, before?: Node|null}} ref
   * @param {boolean} isStart 시작 경계면 true
   * @returns {boolean} 적용했으면 true (노드가 문서에서 빠졌으면 false)
   */
  static #applyRef(range, ref, isStart) {
    const set = (n, o) => (isStart ? range.setStart(n, o) : range.setEnd(n, o));
    if (ref.offset != null) {
      if (!ref.node.isConnected) return false;
      set(ref.node, Math.min(ref.offset, ref.node.length));
    } else if (ref.before?.isConnected) {
      if (isStart) range.setStartBefore(ref.before); else range.setEndBefore(ref.before);
    } else {
      if (!ref.node.isConnected) return false;
      set(ref.node, ref.node.childNodes.length);
    }
    return true;
  }

  // ───────────── 저장용 변환 ─────────────

  /**
   * 저장용 정리 (getHTML 에서 호출): 선택 표시 클래스 제거, picture 안 img 뒤 글을 picture 밖으로 (fixPictures — 편집 화면과 같은 결과)
   * @param {string} html
   */
  static unwrapHTML(html) {
    if (!html.includes(IMG_SELECTED_CLASS) && !html.includes('<picture')) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`img.${IMG_SELECTED_CLASS}`).forEach((img) => ImageCommands.#unmark(img));
    ImageCommands.fixPictures(tpl.content);
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
    this.mobileInput.remove();
  }
}
