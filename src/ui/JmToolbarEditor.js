/**
 * Toolbar (바닐라 JS 래퍼 — Thymeleaf 용)
 * - 코어 Editor 에 툴바 UI 를 붙인다.
 * - 버튼 mousedown 에서 preventDefault 하여 에디터 포커스/선택이 유지되도록 한다.
 */
import { JmEditor } from '../core/JmEditor.js';
import { TableGridPicker } from './TableGridPicker.js';
import { ColorPicker } from './ColorPicker.js';
import { FormatPicker, SAMPLE_FORMATS } from './FormatPicker.js';
import { JmEditorApi } from '../api/JmEditorApi.js';
import { observeGalleries } from '../plugins/gallery/gallery-layout.js';

/** 서식 버튼 아이콘 (자체 제작 SVG) */
const FORMAT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';

/** 코드 보기 / 미리보기 아이콘 (자체 제작 SVG) */
const CODE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/><path d="m14 4-4 16"/></svg>';
const PREVIEW_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

/**
 * 툴바 버튼 정의: [명령, 라벨, 활성화 판정 함수, 표 안에서만 표시, 옵션{icon, right, group, row}]
 * - row: 'top' 이면 상단 줄(모드 전환 + 서식), 없으면 하단 줄(서식 메뉴)
 */
const BUTTONS = [
  // 맨 왼쪽: 모드 전환 세그먼트 (Editor / HTML / 미리보기) — 하단 내용 영역이 모드에 따라 바뀜
  ['modeEditor', 'Editor', (s) => s.mode === 'editor', false, { group: 'mode', segFirst: true, row: 'top' }],
  ['modeHtml', 'HTML', (s) => s.mode === 'html', false, { icon: CODE_ICON, group: 'mode', row: 'top' }],
  ['modePreview', '미리보기', (s) => s.mode === 'preview', false, { icon: PREVIEW_ICON, group: 'mode', segLast: true, row: 'top' }],
  ['format', '서식', () => false, false, { icon: FORMAT_ICON, right: true, row: 'top' }],
  // ── 하단 줄: 서식 메뉴 ──
  ['bold', 'B', (s) => s.strong],
  ['italic', 'I', (s) => s.em],
  ['underline', 'U', (s) => s.u],
  ['strike', 'S', (s) => s.s],
  ['color', 'A', (s) => !!s.color],      // 글자색 (버튼 하단 색 띠로 현재 색 표시)
  ['bgColor', '배경', (s) => !!s.bg],    // 글자 배경색
  null, // 구분선
  ['h1', 'H1', (s) => s.block === 'h1'],
  ['h2', 'H2', (s) => s.block === 'h2'],
  ['h3', 'H3', (s) => s.block === 'h3'],
  ['quote', '❝', (s) => s.block === 'blockquote'],
  null,
  ['ul', '• 목록', (s) => s.list === 'ul'],
  ['ol', '1. 목록', (s) => s.list === 'ol'],
  null,
  ['link', '링크', (s) => s.a],
  ['image', '이미지', () => false],
  ['table', '표', (s) => s.table], // 행·열 편집은 표 레이어 우클릭 메뉴에서
  null,
  ['undo', '↶', () => false],
  ['redo', '↷', () => false],
];

export class JmToolbarEditor {
  /**
   * @param {HTMLElement} container 툴바+에디터가 들어갈 컨테이너
   * @param {object} options Editor 옵션과 동일 + { initialHTML, loadFormats, api, contentId, onLoaded, onSaved }
   *   loadFormats: () => Promise<Format[]>  서식 목록 공급 함수 (없으면 api.formats → 샘플 서식 순)
   *   api:        JmEditorApi 인스턴스 또는 그 생성 옵션 객체. 지정 시 조회/등록/수정/업로드/서식을 API 로 처리
   *   contentId:  지정 시 생성 직후 api.get(contentId) 로 내용을 불러옴 (수정 화면)
   *   onLoaded(record), onSaved(record): 조회·저장 완료 콜백
   */
  constructor(container, options = {}) {
    // API 레이어 (옵션으로 켬)
    this.api = options.api instanceof JmEditorApi ? options.api
      : options.api ? new JmEditorApi(options.api) : null;
    this.contentId = options.contentId ?? null;
    this.record = null;   // 마지막으로 조회/저장한 레코드
    this.dirty = false;   // 조회/저장 이후 변경 여부
    this.onLoaded = options.onLoaded;
    this.onSaved = options.onSaved;
    if (this.api) {
      options = {
        uploadImage: (file) => this.api.uploadImage(file),
        loadFormats: () => this.api.formats(),
        ...options, // 명시한 옵션이 우선
      };
    }
    this.container = container;
    this.container.classList.add('jm-container');

    // 상단 줄(모드 전환 + 서식) / 하단 줄(서식 메뉴)
    this.toolbarTop = document.createElement('div');
    this.toolbarTop.className = 'jm-toolbar jm-toolbar-top';
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'jm-toolbar';
    this.area = document.createElement('div');
    // 코드(HTML 소스) 보기용 textarea — 토글 시 편집 영역과 교체
    this.source = document.createElement('textarea');
    this.source.className = 'jm-source';
    this.source.hidden = true;
    this.source.spellcheck = false;
    // 미리보기 패널 — 저장될 HTML 을 뷰어 스타일(.jm-content)로 렌더
    this.previewPane = document.createElement('div');
    this.previewPane.className = 'jm-preview-pane jm-content';
    this.previewPane.hidden = true;
    this.container.append(this.toolbarTop, this.toolbar, this.area, this.source, this.previewPane);
    this.mode = 'editor'; // 'editor' | 'html' | 'preview'

    // 이미지 선택용 숨김 input
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.hidden = true;
    this.container.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => {
      this.editor.insertImageFile(this.fileInput.files[0]);
      this.fileInput.value = '';
    });

    this.buttons = {};
    this.#buildToolbar();

    // 표 크기 선택 격자 (「표」 버튼 아래 팝업)
    this.gridPicker = new TableGridPicker({
      onPick: (rows, cols) => this.editor.exec('table', { rows, cols, header: true }),
    });

    // 서식(템플릿) 목록 드롭다운 — 서식 관리 API 에서 받아온 HTML 을 블록 단위로 삽입
    this.formatPicker = new FormatPicker({
      loadFormats: options.loadFormats || (async () => SAMPLE_FORMATS),
      onPick: (f) => this.editor.exec('format', f.html),
    });

    // 색상 선택 팝업 (툴바 글자색/배경색 + 표 셀 배경색 공용)
    this.colorPicker = new ColorPicker();

    this.editor = new JmEditor(this.area, {
      ...options,
      onChange: (html) => { this.dirty = true; options.onChange?.(html); },
      onSelectionChange: () => this.#refreshState(),
      pickColor: (x, y, cb) => this.colorPicker.open(x, y, cb, { sampleMode: 'background' }),
    });
    if (options.initialHTML) this.editor.setHTML(options.initialHTML);
    this.dirty = false;
    // 수정 화면: id 가 있으면 API 로 조회해서 채움
    if (this.api && this.contentId != null) this.load(this.contentId);
  }

  // ───────────── API 연동: 조회 / 저장 ─────────────

  /**
   * 콘텐츠 조회 후 에디터에 반영
   * @param {string|number} id
   * @returns {Promise<object>} 레코드 { id, title, content, ... }
   */
  async load(id) {
    if (!this.api) throw new Error('api 옵션이 설정되지 않았습니다');
    const rec = await this.api.get(id);
    this.contentId = rec.id ?? id;
    this.record = rec;
    this.setHTML(rec.content || '');
    this.dirty = false;
    this.onLoaded?.(rec);
    return rec;
  }

  /**
   * 저장: contentId 가 있으면 수정(PUT), 없으면 등록(POST) 후 contentId 보관
   * @param {object} [extra] content 외에 함께 보낼 필드 (title 등)
   * @returns {Promise<object>} 저장된 레코드
   */
  async save(extra = {}) {
    if (!this.api) throw new Error('api 옵션이 설정되지 않았습니다');
    if (this.mode === 'html') this.editor.setHTML(this.source.value); // HTML 모드 편집분 반영
    const data = { ...extra, content: this.editor.getHTML() };
    const rec = this.contentId != null
      ? await this.api.update(this.contentId, data)
      : await this.api.create(data);
    this.contentId = rec?.id ?? this.contentId;
    this.record = rec;
    this.dirty = false;
    this.onSaved?.(rec);
    return rec;
  }

  /** 새 글 작성 상태로 초기화 (등록 화면 재사용) */
  reset() {
    this.contentId = null;
    this.record = null;
    this.setHTML('');
    this.dirty = false;
  }

  /** 툴바 버튼 생성 */
  #buildToolbar() {
    BUTTONS.forEach((def) => {
      if (!def) {
        const sep = document.createElement('span');
        sep.className = 'jm-sep';
        this.toolbar.appendChild(sep);
        return;
      }
      const [cmd, label, , tableOnly, opts = {}] = def;
      const bar = opts.row === 'top' ? this.toolbarTop : this.toolbar;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jm-btn';
      if (tableOnly) btn.hidden = true; // 커서가 표 안일 때만 표시
      if (opts.right) btn.classList.add('jm-btn-right'); // 우측 정렬 (첫 버튼에 margin-left:auto)
      if (opts.group) btn.classList.add('jm-btn-seg');  // 세그먼트(모드 전환) 스타일
      if (opts.segFirst) btn.classList.add('jm-btn-seg-first');
      if (opts.segLast) btn.classList.add('jm-btn-seg-last');
      btn.dataset.cmd = cmd;
      if (opts.icon) {
        // 아이콘 + 텍스트
        btn.classList.add('jm-btn-icon');
        btn.innerHTML = `${opts.icon}<span>${label}</span>`;
      } else {
        btn.textContent = label;
      }
      // mousedown 에서 포커스 이동 방지 → 선택 영역 유지
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.#onCommand(cmd));
      bar.appendChild(btn);
      this.buttons[cmd] = btn;
    });
  }

  /** 버튼 클릭 → 명령 실행. 링크/이미지는 입력 UI 를 거친다 */
  #onCommand(cmd) {
    if (cmd === 'link') {
      if (this.editor.getState().a) { this.editor.exec('unlink'); return; }
      const url = window.prompt('링크 URL 을 입력하세요', 'https://');
      if (url) this.editor.exec('link', url);
      return;
    }
    if (cmd === 'image') { this.fileInput.click(); return; }
    if (cmd === 'color' || cmd === 'bgColor') {
      this.editor.sel.save();
      const state = this.editor.getState();
      this.colorPicker.toggleAt(this.buttons[cmd], (color) => this.editor.exec(cmd, color), {
        current: cmd === 'color' ? state.color : state.bg,
        sampleMode: cmd === 'color' ? 'color' : 'background',
      });
      return;
    }
    if (cmd === 'table') { this.editor.sel.save(); this.gridPicker.toggle(this.buttons.table); return; }
    if (cmd === 'format') { this.editor.sel.save(); this.formatPicker.toggle(this.buttons.format); return; }
    if (cmd === 'modeEditor') { this.setMode('editor'); return; }
    if (cmd === 'modeHtml') { this.setMode('html'); return; }
    if (cmd === 'modePreview') { this.setMode('preview'); return; }
    if (this.mode !== 'editor') return; // 편집 모드가 아니면 서식 명령 무시
    this.editor.exec(cmd);
  }

  /** 커서 위치에 따라 버튼 활성화 표시 */
  #refreshState() {
    if (this.mode !== 'editor') return;
    const state = { ...this.editor.getState(), mode: this.mode };
    BUTTONS.forEach((def) => {
      if (!def) return;
      const [cmd, , isActive, tableOnly] = def;
      this.buttons[cmd].classList.toggle('is-active', !!isActive(state));
      if (tableOnly) this.buttons[cmd].hidden = !state.table;
    });
    // 현재 색을 버튼 하단 띠로 표시
    this.buttons.color.style.setProperty('--jm-swatch', state.color || 'transparent');
    this.buttons.bgColor.style.setProperty('--jm-swatch', state.bg || 'transparent');
  }

  /**
   * 모드 전환: editor(편집) / html(소스 편집) / preview(미리보기)
   * - html 모드에서 나갈 때 textarea 내용을 setHTML(Sanitizer 통과) 로 반영
   * - preview 는 저장될 HTML(getHTML) 을 .jm-content 로 렌더 (뷰어와 동일 규칙)
   */
  setMode(mode) {
    if (mode === this.mode) return;
    // 현재 모드 정리
    if (this.mode === 'html') this.editor.setHTML(this.source.value);
    this.mode = mode;

    this.area.hidden = mode !== 'editor';
    this.source.hidden = mode !== 'html';
    this.previewPane.hidden = mode !== 'preview';

    if (mode === 'html') { this.source.value = JmToolbarEditor.prettify(this.editor.getHTML()); this.source.focus(); }
    else if (mode === 'preview') {
      this.previewPane.innerHTML = this.editor.getHTML();
      this.#stopPreviewLayout?.();
      this.#stopPreviewLayout = observeGalleries(this.previewPane); // 갤러리 저스티파이드 배치 (뷰어와 동일)
    }
    else this.area.focus();

    // 편집 모드가 아니면 서식 버튼 비활성, 모드 버튼은 활성 표시
    const editing = mode === 'editor';
    BUTTONS.forEach((def) => {
      if (!def) return;
      const [cmd, , , , opts = {}] = def;
      const b = this.buttons[cmd];
      if (opts.group === 'mode') b.classList.toggle('is-active', def[2]({ mode }));
      else b.disabled = !editing && cmd !== 'format';
    });
    this.buttons.format.disabled = !editing;
    this.toolbar.hidden = !editing; // 편집 모드가 아니면 하단 서식 줄 숨김
  }

  /** 블록 태그 앞뒤에 줄바꿈을 넣어 읽기 쉽게 (내용은 변경하지 않음) */
  static prettify(html) {
    return html
      .replace(/<(p|h1|h2|h3|ul|ol|li|blockquote|table|tbody|thead|tr|div)(\s[^>]*)?>/g, '\n<$1$2>')
      .replace(/<\/(p|h1|h2|h3|ul|ol|blockquote|table|tbody|thead|tr|div)>/g, '</$1>\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  #stopPreviewLayout = null;

  getHTML() { return this.mode === 'html' ? this.source.value : this.editor.getHTML(); }
  setHTML(html) { this.editor.setHTML(html); if (this.mode === 'html') this.source.value = JmToolbarEditor.prettify(html); if (this.mode === 'preview') this.previewPane.innerHTML = this.editor.getHTML(); }
  /** 서식 관리에서 변경 후 호출하면 다음 열 때 다시 불러옴 */
  refreshFormats() { this.formatPicker.refresh(); }
  destroy() { this.gridPicker.destroy(); this.colorPicker.destroy(); this.formatPicker.destroy(); this.editor.destroy(); }
}
