/**
 * JmEditor (코어)
 * - 프레임워크 독립. contenteditable 요소 하나를 받아 편집 기능을 붙인다.
 * - 툴바/업로드 UI 는 포함하지 않는다 → Thymeleaf(바닐라)나 React 래퍼가 이 클래스를 감싼다.
 *
 * 사용:
 *   const editor = new JmEditor(el, { onChange: html => ..., uploadImage: file => Promise<url> });
 *   editor.exec('bold');  editor.getHTML();  editor.setHTML(html);  editor.destroy();
 */
import { SelectionUtil } from './SelectionUtil.js';
import { Commands } from './Commands.js';
import { TableCommands, TABLE_LAYER_CLASS } from '../plugins/table/TableCommands.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { GalleryCommands, GALLERY_LAYER_CLASS } from '../plugins/gallery/GalleryCommands.js';
import { EmbedCommands, EMBED_LAYER_CLASS } from '../plugins/embed/EmbedCommands.js';
import { ButtonsCommands, BUTTONS_LAYER_CLASS } from '../plugins/buttons/ButtonsCommands.js';
import { SliderCommands, SLIDER_LAYER_CLASS } from '../plugins/slider/SliderCommands.js';
import { LayoutCommands, LAYOUT_LAYER_CLASS } from '../plugins/layout/LayoutCommands.js';
import { MapCommands, MAP_LAYER_CLASS } from '../plugins/map/MapCommands.js';
import { isRoughmapCode } from '../plugins/map/map-runtime.js';
import { ImageCommands } from '../plugins/image/ImageCommands.js';
import { History } from './History.js';
import { BlockDrag } from './BlockDrag.js';
import { Sanitizer, HIDDEN_ID_ATTR } from './Sanitizer.js';
import { makeStructurePolicy, INLINE_STRUCTURE_TAGS } from './structure-policy.js';
import { resolveConfig } from '../config.js';

const ZWSP = '​';

const HREF_ATTR = 'data-jm-href'; // 편집 중 링크 주소 보관 속성 (href 는 제거해 어떤 환경에서도 열리지 않게)
const ID_ATTR = HIDDEN_ID_ATTR; // 편집 중 id 보관 속성 (본문 id 가 페이지의 id·window 전역과 겹쳐 페이지 스크립트를 흔들지 않게)

/** id 숨김에서 건너뛸 플러그인 레이어 (헤더·핸들 등 에디터 UI 포함, 표 레이어는 본문이라 제외) */
const PLUGIN_LAYER_SELECTOR = [GALLERY_LAYER_CLASS, EMBED_LAYER_CLASS, BUTTONS_LAYER_CLASS, SLIDER_LAYER_CLASS, LAYOUT_LAYER_CLASS, MAP_LAYER_CLASS].map((c) => `.${c}`).join(', ');

export class JmEditor {
  /** 편집 DOM 의 링크 주소 읽기 (href 또는 보관 속성) */
  static getHref(a) { return a?.getAttribute(HREF_ATTR) ?? a?.getAttribute('href') ?? ''; }
  /** 편집 DOM 의 링크 주소 쓰기 (href 는 두지 않음) */
  static setHref(a, url) { a.setAttribute(HREF_ATTR, url); a.removeAttribute('href'); }

  /**
   * @param {HTMLElement} root 편집 영역이 될 요소
   * @param {object} options
   * @param {(html: string) => void} [options.onChange]  내용 변경 콜백
   * @param {() => void} [options.onSelectionChange] 커서 이동 콜백 (툴바 상태 갱신용)
   * @param {(file: File) => Promise<string>} [options.uploadImage] 이미지 파일 → URL 반환. 없으면 base64 로 삽입
   * @param {object} [options.galleryLimits] 갤러리 업로드 제한 (설정 파일 jm-editor.config.js 의 gallery 와 같은 키, 이 값이 우선)
   * @param {(message: string) => void} [options.notify] 업로드 제한 등 안내 문구 표시. 없으면 alert
   * @param {string} [options.placeholder]
   * @param {object} [options.structure] 퍼블 구조 보존 정책 (window.JmEditorConfig.structure 보다 우선, core/structure-policy.js)
   * @param {(x: number, y: number, cb: (color: string|null) => void) => void} [options.pickColor]
   *        색상 선택 UI 를 띄우는 콜백 (표 셀/행 배경색 메뉴에서 사용). 래퍼가 주입한다.
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.composing = false; // 한글 IME 조합 중 여부
    /** 퍼블 구조 정책 (꺼져 있으면 null — 지금 정리 규칙). 생성 시 확정 */
    this.structure = makeStructurePolicy(resolveConfig('structure', options.structure));

    this.root.contentEditable = 'true';
    this.root.classList.add('jm-editor');
    if (this.structure) this.root.classList.add('jm-structure'); // 구조 모드 표시 (중첩 블록 손잡이 숨김 등 CSS 용)
    if (options.placeholder) this.root.dataset.placeholder = options.placeholder;

    this.sel = new SelectionUtil(root);
    this.sel.structure = this.structure; // 블록 판정·삽입 기준이 구조를 알게
    this.commands = new Commands(this);
    this.table = new TableCommands(this);
    this.menu = new ContextMenu();
    this.blockDrag = new BlockDrag(this); // 표·갤러리 블록 드래그 이동
    this.gallery = new GalleryCommands(this);
    this.embed = new EmbedCommands(this);
    this.buttons = new ButtonsCommands(this);
    this.slider = new SliderCommands(this);
    this.layout = new LayoutCommands(this); // 이미지+글 배치 블록
    this.map = new MapCommands(this);       // 카카오 지도(퍼가기) 블록
    this.image = new ImageCommands(this, resolveConfig('image', options.image));   // 본문 이미지 글 감싸기·크기 조절
    this.history = new History(() => this.getHTML(), (h) => this.#restore(h));

    this.#ensureBlock();
    this.#bind();
    this.#bindGapInserter();
    this.#updateEmpty();
  }

  // ───────────── 공개 API ─────────────

  /**
   * 명령 실행. 툴바 등 외부에서 호출한다.
   * @param {string} name bold|italic|underline|strike|h1|h2|h3|paragraph|quote|ul|ol|link|unlink|image|undo|redo
   *                      |table|tableRowBelow|tableRowAbove|tableColRight|tableColLeft|tableDeleteRow|tableDeleteCol|tableDelete
   *                      |color|bgColor (value: 색상 문자열, null 이면 해제)
   *                      |fontSize (value: '14px' 등, null 이면 해제)
   *                      |alignLeft|alignCenter|alignRight (블록 가로 정렬)
   *                      |valignTop|valignMiddle|valignBottom (표 셀 세로 정렬)
   *                      |format (value: 삽입할 HTML — 서식/템플릿. 내부에서 sanitize 후 블록 단위 삽입)
   *                      |gallery (이미지 갤러리 블록 삽입)
   *                      |youtube (value: 유튜브 주소 또는 동영상 ID)
   *                      |buttons (value: {align} — 버튼 그룹 블록 삽입)
   *                      |slider (value: {interval, ratio} — 이미지 슬라이드 블록 삽입)
   *                      |map (value: 카카오맵 퍼가기 코드 — 없으면 빈 지도 블록. 코드가 틀리면 false)
   *                      |layout (value: 'side'|'one'|'diagonal'|'pair' 또는 {preset, variant} — 이미지+글 배치 블록 삽입)
   * @param {*} [value] link 의 url, image 의 {src, alt}, table 의 {rows, cols, header}
   */
  exec(name, value) {
    this.root.focus();
    this.sel.restore();
    const c = this.commands;
    const map = {
      bold: () => c.toggleInline('strong'),
      italic: () => c.toggleInline('em'),
      underline: () => c.toggleInline('u'),
      strike: () => c.toggleInline('s'),
      h1: () => c.setBlock('h1'),
      h2: () => c.setBlock('h2'),
      h3: () => c.setBlock('h3'),
      paragraph: () => c.setBlock('p'),
      heading: () => c.setBlock(['h1', 'h2', 'h3'].includes(value) ? value : 'p'), // 툴바 제목 셀렉트

      // 값 없이 부르면 인용 토글, 'line'·'box'·'quote' 면 그 스타일로, null 이면 인용 해제
      quote: () => (value === undefined ? c.setBlock('blockquote') : c.setQuote(value)),
      ul: () => c.toggleList('ul', value),
      ol: () => c.toggleList('ol', value),
      link: () => c.setLink(value),
      unlink: () => c.setLink(null),
      image: () => c.insertImage(value?.src, value?.alt),
      format: () => c.insertBlockHTML(Sanitizer.clean(value || '', this.structure)),
      gallery: () => c.insertBlockHTML(GalleryCommands.template()),
      layout: () => c.insertBlockHTML(LayoutCommands.template(value?.preset ?? value, value?.variant)),
      youtube: () => this.embed.insertYouTube(value),
      buttons: () => c.insertBlockHTML(ButtonsCommands.template(value?.align)),
      slider: () => c.insertBlockHTML(SliderCommands.template(value?.interval, value?.ratio)),
      map: () => (value ? this.map.insertFromCode(value) : (c.insertBlockHTML(MapCommands.template()), true)),
      color: () => c.setStyle('color', value ?? null),
      bgColor: () => c.setStyle('background-color', value ?? null),
      fontSize: () => c.setStyle('font-size', value ?? null),
      // 정렬: 표 셀 범위 선택이 있으면 선택한 셀 전체에, 아니면 커서 블록(셀 포함)에
      alignLeft: () => (this.table.selection ? this.table.setAlign('left') : c.setAlign('left')),
      alignCenter: () => (this.table.selection ? this.table.setAlign('center') : c.setAlign('center')),
      alignRight: () => (this.table.selection ? this.table.setAlign('right') : c.setAlign('right')),
      valignTop: () => this.table.setVAlign('top'),
      valignMiddle: () => this.table.setVAlign('middle'),
      valignBottom: () => this.table.setVAlign('bottom'),
      undo: () => this.history.undo(),
      redo: () => this.history.redo(),
      // 표
      table: () => this.table.insert(value?.rows, value?.cols, value?.header),
      tableRowBelow: () => this.table.addRow(true),
      tableRowAbove: () => this.table.addRow(false),
      tableColRight: () => this.table.addColumn(true),
      tableColLeft: () => this.table.addColumn(false),
      tableDeleteRow: () => this.table.deleteRow(),
      tableDeleteCol: () => this.table.deleteColumn(),
      tableDelete: () => this.table.deleteTable(),
    };
    return map[name]?.();
  }

  /** 저장용 HTML 반환 (ZWSP·표 레이어 제거, picture 안 img 뒤 글은 picture 밖으로) */
  getHTML() {
    let html = this.root.innerHTML.replace(new RegExp(ZWSP, 'g'), '');
    html = TableCommands.unwrapHTML(html);
    html = GalleryCommands.unwrapHTML(html);
    html = EmbedCommands.unwrapHTML(html);
    html = ButtonsCommands.unwrapHTML(html);
    html = SliderCommands.unwrapHTML(html);
    html = LayoutCommands.unwrapHTML(html);
    html = MapCommands.unwrapHTML(html);
    html = ImageCommands.unwrapHTML(html);
    html = JmEditor.#restoreLinks(html);
    html = JmEditor.#restoreIds(html);
    return BlockDrag.cleanHTML(html);
  }

  /** HTML 로드 (sanitize 후) */
  setHTML(html) {
    this.image?.clear();
    this.slider?.stopAll(); // 이전 내용의 슬라이드 타이머 정리
    this.root.innerHTML = Sanitizer.clean(html || '', this.structure);
    this.table.wrapAll();
    this.gallery.wrapAll();
    this.embed.wrapAll();
    this.buttons.wrapAll();
    this.slider.wrapAll();
    this.layout.wrapAll();
    this.map.wrapAll();
    this.#neutralizeLinks();
    this.#neutralizeIds();
    this.#ensureBlock();
    this.history = new History(() => this.getHTML(), (h) => this.#restore(h));
    this.#emitChange();
  }

  /** 이미지 파일 삽입 (툴바 파일 선택, 드롭, 붙여넣기 공통 경로) */
  async insertImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const src = this.options.uploadImage
      ? await this.options.uploadImage(file)
      : await this.#toDataURL(file);
    this.exec('image', { src, alt: file.name });
  }

  /** 현재 서식 상태 (툴바 활성화용) */
  getState() {
    return { ...this.commands.getState(), ...this.table.getState() };
  }

  /** 자동 보정 반영: 되돌리기 단계 없이 마지막 기록을 덮어쓰고 onChange 호출 (지도 장소명 자동 채우기 등) */
  amend() {
    this.history.amend();
    this.#emitChange();
  }

  /** 변경 확정: 히스토리 기록 + onChange 호출. Commands 가 명령 끝에 호출한다. */
  commit() {
    this.table.wrapAll(); // 붙여넣기 등으로 들어온 표도 레이어로
    this.gallery.wrapAll();
    this.embed.wrapAll();
    this.buttons.wrapAll();
    this.slider.wrapAll();
    this.layout.wrapAll();
    this.map.wrapAll();
    this.image.fixPictures(); // picture 안 img 뒤 글은 picture 밖으로
    this.#neutralizeLinks();
    this.#neutralizeIds();
    this.#ensureBlock();
    this.history.push();
    this.#emitChange();
    this.options.onSelectionChange?.();
  }

  /** 이벤트 해제 */
  destroy() {
    this.#unbind?.();
    this.menu.destroy();
    this.gallery.destroy();
    this.slider.destroy();
    this.layout.destroy();
    this.image.destroy();
    this.blockDrag.destroy();
    this.gapBar?.remove();
  }

  // ───────────── 내부 ─────────────

  /** 이벤트 바인딩 */
  #bind() {
    const r = this.root;
    const onInput = () => {
      this.#updateEmpty(); // 조합 중 첫 글자에도 placeholder 가 바로 사라지게
      if (this.composing) return; // IME 조합 중에는 기록하지 않음
      this.image.fixPictures(); // 크롬이 picture 안(img 뒤)에 넣은 글을 밖으로 (저장 때 사라지지 않게)
      this.#cleanStraySpans();
      this.#ensureBlock();
      this.history.pushDebounced();
      this.#emitChange();
    };
    const onCompStart = () => { this.composing = true; };
    const onCompEnd = () => { this.composing = false; onInput(); };
    const onKeydown = (e) => this.#handleKeydown(e);
    const onBeforeInput = (e) => this.#handleBeforeInput(e);
    const onPaste = (e) => this.#handlePaste(e);
    const onDrop = (e) => this.#handleDrop(e);
    const onDragover = (e) => e.preventDefault();
    const onContext = (e) => this.#handleContextMenu(e);
    // 편집 중에는 링크(버튼 포함)를 따라가지 않는다. 가운데 클릭(auxclick)도 차단.
    // 호스트 페이지가 document 캡처 단계에서 링크를 가로채는 경우(새 탭 열기 등)도 막기 위해 window 캡처 단계에서 먼저 잡는다
    const onLinkClick = (e) => {
      if (this.mode !== undefined && this.mode !== 'editor') return;
      if (!r.contains(e.target) || !e.target.closest?.('a')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onDocDown = (e) => {
      // 표 밖을 클릭하면 셀 범위 선택 해제 (우클릭 메뉴·색상 팝업 등 편집 UI 클릭은 제외 — 선택을 쓰는 명령이므로)
      if (!this.table.selection) return;
      if (this.table.selection.table.contains(e.target)) return;
      if (e.target.closest?.('.jm-ctxmenu, .jm-colorpicker, .jm-toolbar, .jm-toolbar-top')) return;
      this.table.clearSelection();
    };
    document.addEventListener('mousedown', onDocDown, true);
    const onSelChange = () => {
      // 루트뿐 아니라 표 셀·갤러리 제목 등 루트 안쪽 편집 영역에 포커스가 있을 때도 커서를 저장
      const ae = document.activeElement;
      if (ae === r || (ae && r.contains(ae))) {
        this.sel.save();
        this.options.onSelectionChange?.();
      }
    };

    r.addEventListener('input', onInput);
    r.addEventListener('compositionstart', onCompStart);
    r.addEventListener('compositionend', onCompEnd);
    r.addEventListener('keydown', onKeydown);
    r.addEventListener('beforeinput', onBeforeInput);
    r.addEventListener('paste', onPaste);
    r.addEventListener('drop', onDrop);
    r.addEventListener('dragover', onDragover);
    r.addEventListener('contextmenu', onContext);
    window.addEventListener('click', onLinkClick, true);
    window.addEventListener('auxclick', onLinkClick, true);
    document.addEventListener('selectionchange', onSelChange);

    this.#unbind = () => {
      r.removeEventListener('input', onInput);
      r.removeEventListener('compositionstart', onCompStart);
      r.removeEventListener('compositionend', onCompEnd);
      r.removeEventListener('keydown', onKeydown);
      r.removeEventListener('beforeinput', onBeforeInput);
      r.removeEventListener('paste', onPaste);
      r.removeEventListener('drop', onDrop);
      r.removeEventListener('dragover', onDragover);
      r.removeEventListener('contextmenu', onContext);
      window.removeEventListener('click', onLinkClick, true);
      window.removeEventListener('auxclick', onLinkClick, true);
      document.removeEventListener('selectionchange', onSelChange);
      document.removeEventListener('mousedown', onDocDown, true);
    };
  }
  #unbind = null;

  /** 우클릭: 표 레이어 위에서만 표 메뉴 표시, 그 외는 브라우저 기본 메뉴 */
  #handleContextMenu(e) {
    const layer = e.target.closest?.(`.${TABLE_LAYER_CLASS}`);
    if (!layer || !this.root.contains(layer)) return;
    e.preventDefault();
    // 우클릭한 셀로 커서 이동 (셀 밖 레이어 여백을 눌렀으면 첫 셀)
    const cell = e.target.closest('td,th') || layer.querySelector('td,th');
    const inSelection = this.table.selection && cell?.classList.contains('is-cell-selected');
    if (!inSelection) this.table.clearSelection();
    if (cell && !cell.contains(this.sel.getRange()?.startContainer)) this.sel.placeCursor(cell, true);
    const pickColor = this.options.pickColor
      ? (cb) => this.options.pickColor(e.clientX, e.clientY, cb)
      : null;
    this.menu.open(e.clientX, e.clientY, this.table.getMenuItems(pickColor));
  }

  /**
   * 커서가 블록 안 편집 영역(편집 불가 레이어 속 contenteditable=true)에 있으면 그 영역, 아니면 null
   * @returns {HTMLElement|null}
   */
  #innerEditHost() {
    let n = this.sel.getRange()?.startContainer;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
    const host = n?.closest?.('[contenteditable="true"]');
    if (!host || host === this.root || !this.root.contains(host)) return null;
    const cell = n.closest('td, th'); // 표는 table 전체가 편집 영역이므로 셀 단위로
    return cell && host.contains(cell) ? cell : host;
  }

  /**
   * 커서가 글 블록의 처음(Backspace)·끝(Delete)에 있고, 이웃 글 블록과 합치면 구조가 깨지는지
   * @param {boolean} forward Delete 면 true
   */
  #blocksMerge(forward) {
    const range = this.sel.getRange();
    if (!range || !range.collapsed) return false; // 범위 삭제는 beforeinput 에서
    const block = this.sel.getBlock();
    if (!block) return false;
    const edge = document.createRange();
    if (forward) { edge.setStart(range.endContainer, range.endOffset); edge.setEnd(block, block.childNodes.length); }
    else { edge.setStart(block, 0); edge.setEnd(range.startContainer, range.startOffset); }
    const part = edge.cloneContents();
    if (part.textContent.replace(new RegExp(ZWSP, 'g'), '') || part.querySelector('img')) return false; // 가장자리가 아님
    // 커서 앞(뒤)에 줄바꿈(br)이 있고 블록에 글이 있으면 그 줄바꿈을 지우는 것 — 빈 블록 자리표시 br 만 있는 경우는 가장자리
    if (part.querySelector('br') && block.textContent.replace(new RegExp(ZWSP, 'g'), '').trim()) return false;
    const other = this.sel.adjacentTextBlock(block, forward);
    return !!other && !this.sel.canMerge(block, other);
  }

  /**
   * 구조 모드 beforeinput: 선택 범위가 구조 경계를 넘을 때 브라우저 기본(요소째 지움) 대신 구조를 지키는 삭제.
   * 삭제 키·잘라내기·선택 위 글자 입력·Enter 가 대상 (붙여넣기는 #handlePaste → insertHTML 이 같은 삭제를 씀)
   * @param {InputEvent} e
   */
  #handleBeforeInput(e) {
    if (!this.structure || this.composing) return;
    if (!/^(delete|insertText|insertReplacementText|insertParagraph|insertLineBreak)/.test(e.inputType)) return;
    const range = this.sel.getRange();
    if (!range) return;
    // 접힌 커서: 키보드(keydown)가 처리하지 못한 입력(모바일 가상 키보드 등)도 같은 규칙으로
    if (range.collapsed) {
      if (/^delete(Content|Word|Soft|Hard)?(Backward|Forward)?$/.test(e.inputType) && this.#blocksMerge(/Forward$/.test(e.inputType))) { e.preventDefault(); return; }
      if (e.inputType === 'insertParagraph' && this.sel.isSoftBreakBlock(this.sel.getBlock())) { e.preventDefault(); this.commands.insertLineBreak(); }
      return;
    }
    if (!this.commands.crossesStructure(range)) return;
    e.preventDefault();
    this.commands.deleteRange(range);
    const text = e.inputType.startsWith('insertText') || e.inputType === 'insertReplacementText' ? e.data : null;
    if (text) {
      const t = document.createTextNode(text);
      const r = this.sel.getRange();
      r.insertNode(t);
      r.setStartAfter(t);
      r.collapse(true);
      this.sel.setRange(r);
    }
    this.commit();
  }

  /** 단축키 + Enter 처리 */
  #handleKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const key = e.key.toLowerCase();
      const map = { b: 'bold', i: 'italic', u: 'underline', z: e.shiftKey ? 'redo' : 'undo', y: 'redo' };
      if (map[key]) { e.preventDefault(); this.exec(map[key]); return; }
      // 전체 선택: 블록 안 편집 영역(배치 글 칸·표 셀·제목 등)이면 그 영역만 (브라우저는 바깥 에디터 전체를 선택해 블록까지 지워짐)
      if (key === 'a' && !e.shiftKey && !e.altKey) {
        const host = this.#innerEditHost();
        if (host) {
          e.preventDefault();
          const r = document.createRange();
          r.selectNodeContents(host);
          this.sel.setRange(r);
          return;
        }
      }
    }

    if (e.key === 'Escape' && this.table.selection) { this.table.clearSelection(); return; }
    // 표 셀 안에서 Tab → 셀 이동
    if (e.key === 'Tab' && this.table.handleTab(e.shiftKey)) { e.preventDefault(); return; }

    // 구조 모드: Backspace·Delete 가 다른 구조 컨테이너나 dt·dd 경계를 넘어 합치지 않게
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.structure && !this.composing && this.#blocksMerge(e.key === 'Delete')) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !this.composing) {
      const block = this.sel.getBlock();
      // 구조 모드: dt·dd·캡션·글만 있는 div 에서는 새 블록 대신 줄바꿈 (브라우저 기본은 dd 를 복제함)
      if (this.sel.isSoftBreakBlock(block)) {
        e.preventDefault();
        this.commands.insertLineBreak();
        return;
      }
      // 빈 li 에서 Enter → 목록 탈출
      if (block?.tagName === 'LI' && block.textContent.replace(ZWSP, '') === '') {
        e.preventDefault();
        this.commands.toggleList(block.parentNode.tagName.toLowerCase());
        return;
      }
      // 제목/인용에서 Enter → 다음 줄은 p 로 (브라우저 기본은 같은 태그를 복제함)
      if (block && /^(H[1-6]|BLOCKQUOTE)$/.test(block.tagName)) {
        const range = this.sel.getRange();
        if (range && range.collapsed) {
          const atEnd = (() => {
            const test = range.cloneRange();
            test.setEnd(block, block.childNodes.length);
            return test.toString().replace(ZWSP, '') === '';
          })();
          if (atEnd) {
            e.preventDefault();
            const p = document.createElement('p');
            p.appendChild(document.createElement('br'));
            block.parentNode.insertBefore(p, block.nextSibling);
            this.sel.placeCursor(p, false);
            this.commit();
          }
        }
      }
    }
  }

  /** 붙여넣기: 이미지 파일이면 업로드, HTML 이면 sanitize, 아니면 텍스트 */
  async #handlePaste(e) {
    // 블록 헤더의 입력란(버튼 주소·지도 코드 등)에는 브라우저 기본 붙여넣기
    if (e.target.closest?.('input, textarea, select')) return;
    e.preventDefault();
    const cd = e.clipboardData;
    const imageItem = Array.from(cd.items || []).find((i) => i.type.startsWith('image/'));
    if (imageItem) { await this.insertImageFile(imageItem.getAsFile()); return; }

    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    const escape = (s) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    // 갤러리·슬라이드 제목, 버튼 글자처럼 한 줄짜리 편집 영역에는 서식 없이 글자만
    const start = this.sel.getRange()?.startContainer;
    const startEl = start?.nodeType === Node.TEXT_NODE ? start.parentElement : start;
    if (startEl?.closest?.('[data-role="title"], a[data-role="button"]')) {
      const plain = text || new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
      if (plain) this.commands.insertHTML(escape(plain.replace(/\s*\r?\n\s*/g, ' ')));
      return;
    }
    // 카카오맵 「지도 퍼가기」 코드를 본문에 붙여 넣으면 지도 블록으로
    if (isRoughmapCode(text)) { this.map.insertFromCode(text); return; }
    if (html) {
      this.commands.insertHTML(Sanitizer.clean(html, this.structure));
    } else if (text) {
      // 한 줄이면 커서 위치에 글자로, 여러 줄이면 줄마다 단락으로 (현재 문단을 나눠 그 사이에)
      const lines = text.split(/\r?\n/);
      if (lines.length === 1) this.commands.insertHTML(escape(text));
      else this.commands.insertHTML(lines.map((l) => `<p>${escape(l) || '<br>'}</p>`).join(''));
    }
  }

  /** 드롭: 이미지 파일만 처리 */
  async #handleDrop(e) {
    if (BlockDrag.isBlockDrag(e)) return;                       // 블록 이동은 BlockDrag 가 처리
    if (e.target.closest?.(`.${GALLERY_LAYER_CLASS}, .${LAYOUT_LAYER_CLASS}`)) return; // 갤러리·배치 블록 레이어가 직접 처리
    const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    await this.insertImageFile(file);
  }

  /**
   * 블록(레이어) 사이 빈 단락 삽입기
   * - 편집 불가 레이어(표·갤러리·슬라이드·유튜브·버튼) 가 서로 붙어 있거나 문서 맨 앞/뒤에 있으면 그 사이에 커서를 둘 수 없다.
   * - 경계 근처(±8px)에 마우스를 올리면 「＋ 단락 추가」 줄을 띄우고, 클릭하면 빈 단락을 넣고 커서를 옮긴다.
   */
  #bindGapInserter() {
    // 블록 폭 전체를 가로지르는 선(wrapper) + 가운데 버튼
    const bar = document.createElement('div');
    bar.className = 'jm-gap';
    bar.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jm-gap-insert';
    btn.textContent = '＋ 단락 추가';
    bar.appendChild(btn);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      if (bar._before) this.root.insertBefore(p, bar._before); else this.root.appendChild(p);
      bar.hidden = true;
      this.sel.placeCursor(p, false);
      this.root.focus();
      this.commit();
    });
    const wrap = this.root.parentNode || document.body;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    wrap.appendChild(bar);
    this.gapBar = bar;

    const isLayer = (el) => el && el.nodeType === 1 && el.getAttribute('contenteditable') === 'false';
    const onMove = (e) => {
      if (this.gapBar.contains(e.target)) return;
      const blocks = Array.from(this.root.children);
      const rootRect = this.root.getBoundingClientRect();
      let hit = null;
      for (let i = 0; i <= blocks.length; i++) {
        const prev = blocks[i - 1], next = blocks[i];
        // 경계 양쪽 중 하나라도 레이어이고, 반대쪽이 (없거나) 레이어일 때만 (일반 단락이 있으면 거기서 쓰면 됨)
        if (!(isLayer(prev) || isLayer(next))) continue;
        if ((prev && !isLayer(prev)) || (next && !isLayer(next))) continue;
        const y = next ? next.getBoundingClientRect().top : prev.getBoundingClientRect().bottom;
        if (Math.abs(e.clientY - y) <= 8 && e.clientX >= rootRect.left && e.clientX <= rootRect.right) { hit = { y, before: next || null }; break; }
      }
      if (!hit) { bar.hidden = true; return; }
      const wrapRect = wrap.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(this.root).paddingLeft) || 0;
      const padR = parseFloat(getComputedStyle(this.root).paddingRight) || 0;
      bar.style.top = `${hit.y - wrapRect.top + wrap.scrollTop}px`;
      bar.style.left = `${rootRect.left - wrapRect.left + pad}px`;
      bar.style.width = `${rootRect.width - pad - padR}px`;
      bar._before = hit.before;
      bar.hidden = false;
    };
    this.root.addEventListener('mousemove', onMove);
    this.root.addEventListener('mouseleave', (e) => { if (!bar.contains(e.relatedTarget)) bar.hidden = true; });
  }

  /** 편집 중 링크가 열리지 않도록 href 를 보관 속성으로 옮긴다 (setHTML / commit / restore 후 호출) */
  /**
   * 브라우저가 문단 합치기 등에서 끼워 넣는 스타일 span(크롬의 font-family: inherit 등) 정리 — 커서가 있는 블록만.
   * 허용되지 않는 style 속성은 빼고(저장 규칙 Sanitizer.cleanStyle 과 같게), 남는 것이 없으면 span 을 푼다.
   */
  #cleanStraySpans() {
    const block = this.sel.getBlock();
    if (!block) return;
    block.querySelectorAll('span[style]').forEach((sp) => {
      // 속성 하나씩 검사해 허용되지 않는 것만 뺀다 (남은 style 의 표기는 브라우저 그대로)
      Array.from(sp.style).forEach((name) => {
        if (!Sanitizer.cleanStyle(`${name}: ${sp.style.getPropertyValue(name)}`)) sp.style.removeProperty(name);
      });
      if (sp.style.length) return;
      sp.removeAttribute('style');
      if (sp.attributes.length) return; // 다른 속성이 있으면 span 은 둔다
      while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
      sp.remove();
    });
  }

  #neutralizeLinks() {
    this.root.querySelectorAll('a[href]').forEach((a) => JmEditor.setHref(a, a.getAttribute('href')));
  }

  /**
   * 편집 DOM 의 id 를 보관 속성(data-jm-id)으로 옮긴다 — 편집 중 본문에는 id 가 없게 (getHTML 에서 되돌림).
   * 플러그인 블록·레이어 안(지도 런타임 등이 만든 요소)은 건너뛴다. 표 레이어는 본문이라 포함.
   */
  #neutralizeIds() {
    Sanitizer.hideIds(this.root, PLUGIN_LAYER_SELECTOR);
  }

  /**
   * 저장용 HTML 에서 보관 속성(data-jm-id)을 id 로 되돌린다. 같은 값은 문서 순서상 첫 번째만 남긴다
   * (편집 중 Enter·복사로 블록이 복제되면 보관 속성도 함께 복제되므로)
   * @param {string} html
   * @returns {string}
   */
  static #restoreIds(html) {
    if (!html.includes(ID_ATTR)) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    Sanitizer.dedupeIds(tpl.content, ID_ATTR);
    tpl.content.querySelectorAll(`[${ID_ATTR}]`).forEach((el) => {
      el.setAttribute('id', el.getAttribute(ID_ATTR));
      el.removeAttribute(ID_ATTR);
    });
    return tpl.innerHTML;
  }

  /** 저장용 HTML 에서 보관 속성을 href 로 되돌린다. 허용되지 않는 주소(javascript: 등)는 href 없이 둔다 */
  static #restoreLinks(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`a[${HREF_ATTR}]`).forEach((a) => {
      const url = a.getAttribute(HREF_ATTR);
      if (Sanitizer.isSafeHref(url)) a.setAttribute('href', url);
      a.removeAttribute(HREF_ATTR);
    });
    return tpl.innerHTML;
  }

  /**
   * 루트가 비었거나 루트 직속에 텍스트/인라인만 있으면 p 로 감싼다 (노드마다 문단, 공백 글은 지움 — 예전 동작).
   * 구조 모드에서 이어진 비블록 구간에 small·sub·sup(INLINE_STRUCTURE_TAGS)가 있으면 그 구간을 한 문단으로 묶는다
   * (「<sup>1</sup> 각주」가 두 문단으로 갈라지지 않게). 묶을 때 구간 앞뒤 공백 글만 지우고 안의 공백은 둔다.
   */
  #ensureBlock() {
    const r = this.root;
    if (r.childNodes.length === 0 || (r.childNodes.length === 1 && r.firstChild.tagName === 'BR')) {
      r.innerHTML = '<p><br></p>';
      return;
    }
    // 루트 직속 노드를 블록 사이의 비블록 구간으로 나눈다
    const runs = [];
    let cur = null;
    Array.from(r.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && this.#isRootBlock(n)) { cur = null; return; }
      if (!cur) runs.push(cur = []);
      cur.push(n);
    });
    /** 블록 사이 줄바꿈 같은 공백(ZWSP 포함)뿐인 글 */
    const blank = (n) => n.nodeType === Node.TEXT_NODE && !n.textContent.replace(/[\s\u200B]/g, '');
    const inlineSel = INLINE_STRUCTURE_TAGS.join(',');
    const hasInlineStructure = (n) => n.nodeType === Node.ELEMENT_NODE && (n.matches(inlineSel) || !!n.querySelector(inlineSel));
    const wrap = (nodes) => {
      const p = document.createElement('p');
      r.insertBefore(p, nodes[0]);
      nodes.forEach((x) => p.appendChild(x));
    };
    runs.forEach((run) => {
      if (this.structure && run.some(hasInlineStructure)) {
        let a = 0;
        let b = run.length;
        while (a < b && blank(run[a])) run[a++].remove();
        while (b > a && blank(run[b - 1])) run[--b].remove();
        wrap(run.slice(a, b));
        return;
      }
      run.forEach((n) => { if (blank(n)) n.remove(); else wrap([n]); });
    });
  }

  /**
   * 루트 직속에 그대로 둘 블록인지 (문단·제목·목록·인용·표, 구조 모드의 블록 구조 태그, 플러그인 레이어·블록)
   * @param {Element} n
   */
  #isRootBlock(n) {
    // 구조 모드에서는 허용된 구조 태그(section·div·dl 등)도 루트 블록으로 인정 (p 로 감싸면 구조가 깨짐)
    return /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|TABLE)$/.test(n.tagName) || this.sel.isStructureTag(n) || n.classList.contains(TABLE_LAYER_CLASS) || n.classList.contains(GALLERY_LAYER_CLASS) || n.classList.contains(EMBED_LAYER_CLASS) || n.classList.contains(BUTTONS_LAYER_CLASS) || n.classList.contains(SLIDER_LAYER_CLASS) || n.classList.contains(LAYOUT_LAYER_CLASS) || n.classList.contains(MAP_LAYER_CLASS) || ['gallery', 'youtube', 'buttons', 'slider', 'layout', 'map'].includes(n.dataset?.type);
  }

  /** 히스토리 복원 */
  #restore(html) {
    this.image.clear();
    this.slider.stopAll();
    this.root.innerHTML = html;
    this.table.wrapAll();
    this.gallery.wrapAll();
    this.embed.wrapAll();
    this.buttons.wrapAll();
    this.slider.wrapAll();
    this.layout.wrapAll();
    this.map.wrapAll();
    this.#neutralizeLinks();
    this.#neutralizeIds();
    this.#ensureBlock();
    this.sel.placeCursor(this.root.lastChild || this.root, true);
    this.#emitChange();
  }

  #emitChange() {
    this.#updateEmpty();
    this.options.onChange?.(this.getHTML());
  }

  /**
   * 비어 있음 표시(루트 is-empty) — placeholder 용.
   * CSS 로는 글자(텍스트 노드)를 셀 수 없어 「가나다<br>x」 같은 문단도 비었다고 보므로 JS 로 판단한다.
   * 비어 있음: 블록이 문단 하나뿐이고 그 안에 글자가 없으며 줄바꿈(br)이 하나 이하
   */
  #updateEmpty() {
    const r = this.root;
    const only = r.childElementCount === 1 ? r.firstElementChild : null;
    const blank = (el) => !el.textContent.replace(/\u200B/g, '');
    const empty = r.childElementCount === 0
      ? blank(r)
      : only?.tagName === 'P' && blank(only) && only.childElementCount <= 1 && !only.querySelector(':not(br)') && r.childNodes.length === 1;
    r.classList.toggle('is-empty', empty);
  }

  #toDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
}
