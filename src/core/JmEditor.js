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
import { History } from './History.js';
import { BlockDrag } from './BlockDrag.js';
import { Sanitizer } from './Sanitizer.js';

const ZWSP = '​';

export class JmEditor {
  /**
   * @param {HTMLElement} root 편집 영역이 될 요소
   * @param {object} options
   * @param {(html: string) => void} [options.onChange]  내용 변경 콜백
   * @param {() => void} [options.onSelectionChange] 커서 이동 콜백 (툴바 상태 갱신용)
   * @param {(file: File) => Promise<string>} [options.uploadImage] 이미지 파일 → URL 반환. 없으면 base64 로 삽입
   * @param {string} [options.placeholder]
   * @param {(x: number, y: number, cb: (color: string|null) => void) => void} [options.pickColor]
   *        색상 선택 UI 를 띄우는 콜백 (표 셀/행 배경색 메뉴에서 사용). 래퍼가 주입한다.
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.composing = false; // 한글 IME 조합 중 여부

    this.root.contentEditable = 'true';
    this.root.classList.add('jm-editor');
    if (options.placeholder) this.root.dataset.placeholder = options.placeholder;

    this.sel = new SelectionUtil(root);
    this.commands = new Commands(this);
    this.table = new TableCommands(this);
    this.menu = new ContextMenu();
    this.blockDrag = new BlockDrag(this); // 표·갤러리 블록 드래그 이동
    this.gallery = new GalleryCommands(this);
    this.embed = new EmbedCommands(this);
    this.history = new History(() => this.getHTML(), (h) => this.#restore(h));

    this.#ensureBlock();
    this.#bind();
  }

  // ───────────── 공개 API ─────────────

  /**
   * 명령 실행. 툴바 등 외부에서 호출한다.
   * @param {string} name bold|italic|underline|strike|h1|h2|h3|paragraph|quote|ul|ol|link|unlink|image|undo|redo
   *                      |table|tableRowBelow|tableRowAbove|tableColRight|tableColLeft|tableDeleteRow|tableDeleteCol|tableDelete
   *                      |color|bgColor (value: 색상 문자열, null 이면 해제)
   *                      |format (value: 삽입할 HTML — 서식/템플릿. 내부에서 sanitize 후 블록 단위 삽입)
   *                      |gallery (value: {cols, auto} — 이미지 갤러리 블록 삽입)
   *                      |youtube (value: 유튜브 주소 또는 동영상 ID)
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
      quote: () => c.setBlock('blockquote'),
      ul: () => c.toggleList('ul'),
      ol: () => c.toggleList('ol'),
      link: () => c.setLink(value),
      unlink: () => c.setLink(null),
      image: () => c.insertImage(value?.src, value?.alt),
      format: () => c.insertBlockHTML(Sanitizer.clean(value || '')),
      gallery: () => c.insertBlockHTML(GalleryCommands.template(value?.cols, value?.auto ?? true)),
      youtube: () => this.embed.insertYouTube(value),
      color: () => c.setStyle('color', value ?? null),
      bgColor: () => c.setStyle('background-color', value ?? null),
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

  /** 저장용 HTML 반환 (ZWSP·표 레이어 제거) */
  getHTML() {
    let html = this.root.innerHTML.replace(new RegExp(ZWSP, 'g'), '');
    html = TableCommands.unwrapHTML(html);
    html = GalleryCommands.unwrapHTML(html);
    html = EmbedCommands.unwrapHTML(html);
    return BlockDrag.cleanHTML(html);
  }

  /** HTML 로드 (sanitize 후) */
  setHTML(html) {
    this.root.innerHTML = Sanitizer.clean(html || '');
    this.table.wrapAll();
    this.gallery.wrapAll();
    this.embed.wrapAll();
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

  /** 변경 확정: 히스토리 기록 + onChange 호출. Commands 가 명령 끝에 호출한다. */
  commit() {
    this.table.wrapAll(); // 붙여넣기 등으로 들어온 표도 레이어로
    this.gallery.wrapAll();
    this.embed.wrapAll();
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
    this.blockDrag.destroy();
  }

  // ───────────── 내부 ─────────────

  /** 이벤트 바인딩 */
  #bind() {
    const r = this.root;
    const onInput = () => {
      if (this.composing) return; // IME 조합 중에는 기록하지 않음
      this.#ensureBlock();
      this.history.pushDebounced();
      this.#emitChange();
    };
    const onCompStart = () => { this.composing = true; };
    const onCompEnd = () => { this.composing = false; onInput(); };
    const onKeydown = (e) => this.#handleKeydown(e);
    const onPaste = (e) => this.#handlePaste(e);
    const onDrop = (e) => this.#handleDrop(e);
    const onDragover = (e) => e.preventDefault();
    const onContext = (e) => this.#handleContextMenu(e);
    const onDocDown = (e) => {
      // 표 밖을 클릭하면 셀 범위 선택 해제
      if (this.table.selection && !this.table.selection.table.contains(e.target)) this.table.clearSelection();
    };
    document.addEventListener('mousedown', onDocDown, true);
    const onSelChange = () => {
      if (document.activeElement === r) {
        this.sel.save();
        this.options.onSelectionChange?.();
      }
    };

    r.addEventListener('input', onInput);
    r.addEventListener('compositionstart', onCompStart);
    r.addEventListener('compositionend', onCompEnd);
    r.addEventListener('keydown', onKeydown);
    r.addEventListener('paste', onPaste);
    r.addEventListener('drop', onDrop);
    r.addEventListener('dragover', onDragover);
    r.addEventListener('contextmenu', onContext);
    document.addEventListener('selectionchange', onSelChange);

    this.#unbind = () => {
      r.removeEventListener('input', onInput);
      r.removeEventListener('compositionstart', onCompStart);
      r.removeEventListener('compositionend', onCompEnd);
      r.removeEventListener('keydown', onKeydown);
      r.removeEventListener('paste', onPaste);
      r.removeEventListener('drop', onDrop);
      r.removeEventListener('dragover', onDragover);
      r.removeEventListener('contextmenu', onContext);
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

  /** 단축키 + Enter 처리 */
  #handleKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const key = e.key.toLowerCase();
      const map = { b: 'bold', i: 'italic', u: 'underline', z: e.shiftKey ? 'redo' : 'undo', y: 'redo' };
      if (map[key]) { e.preventDefault(); this.exec(map[key]); return; }
    }

    if (e.key === 'Escape' && this.table.selection) { this.table.clearSelection(); return; }
    // 표 셀 안에서 Tab → 셀 이동
    if (e.key === 'Tab' && this.table.handleTab(e.shiftKey)) { e.preventDefault(); return; }

    if (e.key === 'Enter' && !e.shiftKey && !this.composing) {
      const block = this.sel.getBlock();
      // 빈 li 에서 Enter → 목록 탈출
      if (block?.tagName === 'LI' && block.textContent.replace(ZWSP, '') === '') {
        e.preventDefault();
        this.commands.toggleList(block.parentNode.tagName.toLowerCase());
        return;
      }
      // 제목/인용에서 Enter → 다음 줄은 p 로 (브라우저 기본은 같은 태그를 복제함)
      if (block && /^(H1|H2|H3|BLOCKQUOTE)$/.test(block.tagName)) {
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
    e.preventDefault();
    const cd = e.clipboardData;
    const imageItem = Array.from(cd.items || []).find((i) => i.type.startsWith('image/'));
    if (imageItem) { await this.insertImageFile(imageItem.getAsFile()); return; }

    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    if (html) {
      this.commands.insertHTML(Sanitizer.clean(html));
    } else if (text) {
      // 줄바꿈은 단락으로
      const escaped = text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
      const paragraphs = escaped.split(/\r?\n/).map((l) => `<p>${l || '<br>'}</p>`).join('');
      this.commands.insertHTML(paragraphs);
    }
  }

  /** 드롭: 이미지 파일만 처리 */
  async #handleDrop(e) {
    if (BlockDrag.isBlockDrag(e)) return;                       // 블록 이동은 BlockDrag 가 처리
    if (e.target.closest?.(`.${GALLERY_LAYER_CLASS}`)) return; // 갤러리 레이어가 직접 처리
    const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    await this.insertImageFile(file);
  }

  /** 루트가 비었거나 루트 직속에 텍스트/인라인만 있으면 p 로 감싼다 */
  #ensureBlock() {
    const r = this.root;
    if (r.childNodes.length === 0 || (r.childNodes.length === 1 && r.firstChild.tagName === 'BR')) {
      r.innerHTML = '<p><br></p>';
      return;
    }
    Array.from(r.childNodes).forEach((n) => {
      const isBlock = n.nodeType === Node.ELEMENT_NODE && (/^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|TABLE)$/.test(n.tagName) || n.classList.contains(TABLE_LAYER_CLASS) || n.classList.contains(GALLERY_LAYER_CLASS) || n.classList.contains(EMBED_LAYER_CLASS) || n.dataset?.type === 'gallery' || n.dataset?.type === 'youtube');
      if (!isBlock) {
        const p = document.createElement('p');
        r.insertBefore(p, n);
        p.appendChild(n);
      }
    });
  }

  /** 히스토리 복원 */
  #restore(html) {
    this.root.innerHTML = html;
    this.table.wrapAll();
    this.gallery.wrapAll();
    this.embed.wrapAll();
    this.#ensureBlock();
    this.sel.placeCursor(this.root.lastChild || this.root, true);
    this.#emitChange();
  }

  #emitChange() {
    this.options.onChange?.(this.getHTML());
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
