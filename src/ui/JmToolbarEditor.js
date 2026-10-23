/**
 * Toolbar (바닐라 JS 래퍼 — Thymeleaf 용)
 * - 코어 Editor 에 툴바 UI 를 붙인다.
 * - 버튼 mousedown 에서 preventDefault 하여 에디터 포커스/선택이 유지되도록 한다.
 */
import { JmEditor } from '../core/JmEditor.js';
import { Sanitizer } from '../core/Sanitizer.js';
import { TableGridPicker } from './TableGridPicker.js';
import { ColorPicker } from './ColorPicker.js';
import { FormatPicker, SAMPLE_FORMATS } from './FormatPicker.js';
import { JmEditorApi } from '../api/JmEditorApi.js';
import { observeGalleries } from '../plugins/gallery/gallery-layout.js';
import { initSliders } from '../plugins/slider/slider-runtime.js';
import { initMaps } from '../plugins/map/map-runtime.js';
import { ContextMenu } from './ContextMenu.js';

/** 서식 버튼 아이콘 (자체 제작 SVG) */
const FORMAT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21Z"/></svg>'; // 서식 — 북마크 모양

/** 유튜브 버튼 아이콘 (자체 제작 SVG) */
const YOUTUBE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/></svg>';

/** 정렬 버튼 아이콘 (자체 제작 SVG) */
const ALIGN_LEFT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h12M3 18h16"/></svg>';
const ALIGN_CENTER_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M6 12h12M4 18h16"/></svg>';
const ALIGN_RIGHT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M9 12h12M5 18h16"/></svg>';

/** 인용 아이콘 */
const QUOTE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7.2 17.5c-1.9 0-3.2-1.5-3.2-3.6 0-3.6 2.4-6.6 5.8-7.9l.6 1.3c-2.2.9-3.6 2.5-3.9 4.4.3-.1.7-.2 1-.2 1.8 0 3 1.3 3 3s-1.4 3-3.3 3Zm9 0c-1.9 0-3.2-1.5-3.2-3.6 0-3.6 2.4-6.6 5.8-7.9l.6 1.3c-2.2.9-3.6 2.5-3.9 4.4.3-.1.7-.2 1-.2 1.8 0 3 1.3 3 3s-1.4 3-3.3 3Z"/></svg>';

/** 실행 취소 / 다시 실행 아이콘 */
const UNDO_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';
const REDO_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>';

/** 세로 정렬 아이콘 (표 셀 전용) */
const VALIGN_TOP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4h16"/><rect x="8" y="8" width="8" height="10" rx="1"/></svg>';
const VALIGN_MIDDLE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 12h4M16 12h4"/><rect x="8" y="7" width="8" height="10" rx="1"/></svg>';
const VALIGN_BOTTOM_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20h16"/><rect x="8" y="6" width="8" height="10" rx="1"/></svg>';

/** 정렬 메뉴 항목 */
const ALIGN_ITEMS = [['left', '왼쪽', ALIGN_LEFT_ICON], ['center', '가운데', ALIGN_CENTER_ICON], ['right', '오른쪽', ALIGN_RIGHT_ICON]];
const VALIGN_ITEMS = [['top', '위', VALIGN_TOP_ICON], ['middle', '중간', VALIGN_MIDDLE_ICON], ['bottom', '아래', VALIGN_BOTTOM_ICON]];

/** 목록 버튼 아이콘 (자체 제작 SVG) */
const UL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none"/><path d="M10 6h10M10 12h10M10 18h10"/></svg>';
const OL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10"/><text x="2.5" y="8" font-size="7" font-family="sans-serif" font-weight="700" fill="currentColor" stroke="none">1</text><text x="2.5" y="14" font-size="7" font-family="sans-serif" font-weight="700" fill="currentColor" stroke="none">2</text><text x="2.5" y="20" font-size="7" font-family="sans-serif" font-weight="700" fill="currentColor" stroke="none">3</text></svg>';

/** 글자 크기 선택지 (px) */
const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48];

/** 링크 / 이미지 버튼 아이콘 (자체 제작 SVG) */
const LINK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
const IMAGE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>';

/** 표 버튼 아이콘 (자체 제작 SVG) */
const TABLE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>';

/** 스플릿 버튼 꺾쇠 아이콘 */
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

/** 목록 유형 (list-style-type) */
/** 인용 스타일 메뉴 [값, 이름] — 세로선은 기본 */
const QUOTE_ITEMS = [['line', '세로선'], ['box', '박스'], ['quote', '따옴표']];
const UL_TYPES = [['disc', '● 기본'], ['circle', '○ 원'], ['square', '■ 사각']];
const OL_TYPES = [['decimal', '1. 숫자'], ['decimal-leading-zero', '01. 숫자(0 채움)'], ['lower-alpha', 'a. 소문자'], ['upper-alpha', 'A. 대문자'], ['lower-roman', 'i. 로마 소문자'], ['upper-roman', 'I. 로마 대문자'], ['hangul', '가. 한글']];

/** 코드 보기 / 미리보기 아이콘 (자체 제작 SVG) */
const CODE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/><path d="m14 4-4 16"/></svg>';
const PREVIEW_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
/** 편집(Editor) 모드 아이콘 — 연필 (자체 제작 SVG) */
const EDIT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

/**
 * 툴바 버튼 정의: [명령, 라벨, 활성화 판정 함수, 표 안에서만 표시, 옵션{icon, right, group, row}]
 * - row: 'top' 이면 상단 줄(모드 전환 + 서식), 없으면 하단 줄(서식 메뉴)
 */
const BUTTONS = [
  // 맨 왼쪽: 모드 전환 세그먼트 (Editor / HTML / 미리보기) — 하단 내용 영역이 모드에 따라 바뀜
  ['modeEditor', 'Editor', (s) => s.mode === 'editor', false, { icon: EDIT_ICON, group: 'mode', segFirst: true, row: 'top' }],
  ['modeHtml', 'HTML', (s) => s.mode === 'html', false, { icon: CODE_ICON, group: 'mode', row: 'top' }],
  ['modePreview', '미리보기', (s) => s.mode === 'preview', false, { icon: PREVIEW_ICON, group: 'mode', segLast: true, row: 'top' }],
  ['format', '서식', () => false, false, { icon: FORMAT_ICON, right: true, row: 'top' }],
  // ── 하단 줄: 서식 메뉴 ──
  // 글자 서식 버튼: 라벨 자체를 해당 서식으로 렌더 (CSS .jm-btn[data-cmd=…])
  ['bold', 'B', (s) => s.strong, false, { tip: '굵게 (Ctrl+B)' }],
  ['italic', 'I', (s) => s.em, false, { tip: '기울임 (Ctrl+I)' }],
  ['underline', 'U', (s) => s.u, false, { tip: '밑줄 (Ctrl+U)' }],
  ['strike', 'S', (s) => s.s, false, { tip: '취소선' }],
  ['color', 'A', (s) => !!s.color, false, { tip: '글자색' }],     // 버튼 하단 색 띠로 현재 색 표시
  ['bgColor', 'A', (s) => !!s.bg, false, { tip: '글자 배경색' }],
  ['fontSize', '크기', () => false, false, { tip: '글자 크기', select: FONT_SIZES.map((n) => [`${n}px`, `${n}px`]), selectDefault: ['', '기본'] }],
  null, // 구분선
  // 제목: 셀렉트 (본문 / 제목 1~3). 값 선택 시 exec('heading', 'p'|'h1'|'h2'|'h3')
  ['heading', '제목', () => false, false, { tip: '제목 단계', select: [['h1', '제목 1'], ['h2', '제목 2'], ['h3', '제목 3']], selectDefault: ['p', '본문'] }],
  ['quote', '인용', (s) => s.block === 'blockquote', false, { tip: '인용 (스타일 선택)', icon: QUOTE_ICON, iconOnly: true, dropdown: true }],
  null,
  // 정렬: 드롭다운 두 개 (가로 / 세로). 버튼 아이콘은 현재 상태를 보여주고, 누르면 목록
  ['alignMenu', '가로 정렬', () => false, false, { tip: '가로 정렬', icon: ALIGN_LEFT_ICON, iconOnly: true, dropdown: true }],
  ['valignMenu', '세로 정렬', () => false, false, { tip: '세로 정렬 (표 셀)', icon: VALIGN_TOP_ICON, iconOnly: true, dropdown: true, tableEnabled: true }],
  null,
  // 목록: 스플릿 버튼 (본 버튼 = 토글, 오른쪽 꺾쇠 = 유형 메뉴)
  ['ul', '비순서 목록', (s) => s.list === 'ul', false, { tip: '비순서 목록', icon: UL_ICON, iconOnly: true, splitMain: true }],
  ['ulType', '비순서 목록 유형', () => false, false, { tip: '비순서 목록 유형', icon: CHEVRON_ICON, iconOnly: true, splitArrow: true }],
  ['ol', '순서 목록', (s) => s.list === 'ol', false, { tip: '순서 목록', icon: OL_ICON, iconOnly: true, splitMain: true }],
  ['olType', '순서 목록 유형', () => false, false, { tip: '순서 목록 유형', icon: CHEVRON_ICON, iconOnly: true, splitArrow: true }],
  null,
  ['link', '링크', (s) => s.a, false, { tip: '링크', icon: LINK_ICON, iconOnly: true }],
  ['image', '이미지', () => false, false, { tip: '이미지', icon: IMAGE_ICON, iconOnly: true }],
  ['youtube', '유튜브', () => false, false, { icon: YOUTUBE_ICON, iconOnly: true }], // 아이콘만 표시 (라벨은 title)
  ['table', '표', (s) => s.table, false, { tip: '표 삽입', icon: TABLE_ICON, iconOnly: true }], // 행·열 편집은 표 레이어 우클릭 메뉴에서
  null,
  ['undo', '실행 취소', () => false, false, { tip: '실행 취소 (Ctrl+Z)', icon: UNDO_ICON, iconOnly: true }],
  ['redo', '다시 실행', () => false, false, { tip: '다시 실행 (Ctrl+Y)', icon: REDO_ICON, iconOnly: true }],
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
    // 인라인 입력줄 (링크 URL / 유튜브 주소) — 툴바 아래에 펼쳐짐
    this.inputBar = document.createElement('div');
    this.inputBar.className = 'jm-inputbar';
    this.inputBar.hidden = true;
    this.inputBar.innerHTML = '<span class="jm-inputbar-label"></span><input type="text" class="jm-inputbar-input"><button type="button" class="jm-btn jm-inputbar-ok">적용</button><button type="button" class="jm-btn jm-inputbar-cancel">취소</button>';
    this.inputLabel = this.inputBar.querySelector('.jm-inputbar-label');
    this.inputField = this.inputBar.querySelector('.jm-inputbar-input');
    this.inputBar.querySelector('.jm-inputbar-ok').addEventListener('mousedown', (e) => e.preventDefault());
    this.inputBar.querySelector('.jm-inputbar-ok').addEventListener('click', () => this.#submitInput());
    this.inputBar.querySelector('.jm-inputbar-cancel').addEventListener('mousedown', (e) => e.preventDefault());
    this.inputBar.querySelector('.jm-inputbar-cancel').addEventListener('click', () => this.#closeInput());
    this.inputField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.#submitInput(); } if (e.key === 'Escape') this.#closeInput(); });
    this.inputHandler = null;

    // 미리보기 패널 — 저장될 HTML 을 뷰어 스타일(.jm-content)로 렌더
    this.previewPane = document.createElement('div');
    this.previewPane.className = 'jm-preview-pane jm-content';
    this.previewPane.hidden = true;
    this.container.append(this.toolbarTop, this.toolbar, this.inputBar, this.area, this.source, this.previewPane);
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
      policy: () => this.editor?.structure, // 미리보기도 본문과 같은 정리 규칙 (에디터는 아래에서 만들어짐)
    });

    // 목록 유형 메뉴
    this.listMenu = new ContextMenu({ className: 'jm-listmenu' }); // 툴바 드롭다운 목록 (내용 폭)

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
      if (opts.select) {
        // 값 고르기 컨트롤 (글자 크기·제목): 현재 값을 보여 주는 버튼, 누르면 다른 메뉴와 같은 목록
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jm-btn jm-btn-dropdown jm-btn-select';
        btn.dataset.cmd = cmd;
        btn.dataset.value = opts.selectDefault?.[0] ?? '';
        if (opts.tip) { btn.title = opts.tip; btn.setAttribute('aria-label', opts.tip); }
        btn.innerHTML = `<span class="jm-btn-select-label"></span>${CHEVRON_ICON}`;
        btn.firstChild.textContent = opts.selectDefault?.[1] ?? label;
        btn.addEventListener('mousedown', (e) => e.preventDefault()); // 선택 영역 유지
        btn.addEventListener('click', () => this.#openSelectMenu(cmd, opts));
        bar.appendChild(btn);
        this.buttons[cmd] = btn;
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jm-btn';
      if (tableOnly) btn.hidden = true; // 커서가 표 안일 때만 표시
      if (opts.right) btn.classList.add('jm-btn-right'); // 우측 정렬 (첫 버튼에 margin-left:auto)
      if (opts.group) btn.classList.add('jm-btn-seg');  // 세그먼트(모드 전환) 스타일
      if (opts.segFirst) btn.classList.add('jm-btn-seg-first');
      if (opts.segLast) btn.classList.add('jm-btn-seg-last');
      btn.dataset.cmd = cmd;
      if (opts.tip) btn.title = opts.tip;
      if (opts.splitMain) btn.classList.add('jm-btn-split-main');
      if (opts.splitArrow) btn.classList.add('jm-btn-split-arrow');
      if (opts.icon) {
        // 아이콘 (+ 텍스트). iconOnly 면 라벨은 툴팁으로만
        btn.classList.add('jm-btn-icon');
        btn.innerHTML = opts.iconOnly ? opts.icon : `${opts.icon}<span>${label}</span>`;
        if (opts.dropdown) { btn.classList.add('jm-btn-dropdown'); btn.innerHTML += CHEVRON_ICON; }
        btn.title = label;
        btn.setAttribute('aria-label', label);
      } else {
        btn.textContent = label;
      }
      // mousedown 에서 포커스 이동 방지 → 선택 영역 유지
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.#onCommand(cmd));
      // 스플릿 버튼(본 버튼 + 꺾쇠)은 한 묶음에 넣어 줄바꿈 때 서로 떨어지지 않게
      if (opts.splitMain) {
        const pair = document.createElement('span');
        pair.className = 'jm-btn-split';
        bar.appendChild(pair);
        pair.appendChild(btn);
      } else if (opts.splitArrow && bar.lastElementChild?.classList.contains('jm-btn-split')) {
        bar.lastElementChild.appendChild(btn);
      } else {
        bar.appendChild(btn);
      }
      this.buttons[cmd] = btn;
    });
  }

  /**
   * 값 고르기 버튼(글자 크기·제목)의 목록 열기. 현재 값은 강조, 고르면 exec(cmd, 값)
   * @param {string} cmd
   * @param {{select: Array<[string,string]>, selectDefault?: [string,string]}} opts
   */
  #openSelectMenu(cmd, opts) {
    const btn = this.buttons[cmd];
    const r = btn.getBoundingClientRect();
    this.editor.sel.save();
    this.listMenu.open(r.left, r.bottom + 4, [opts.selectDefault, ...opts.select].filter(Boolean).map(([v, text]) => ({
      label: text, checked: v === btn.dataset.value, action: () => this.editor.exec(cmd, v || null),
    })));
  }

  /**
   * 값 고르기 버튼에 현재 값 표시
   * @param {string} cmd
   * @param {string} value 목록에 없으면 기본 값
   */
  #setSelectValue(cmd, value) {
    const btn = this.buttons[cmd];
    const opts = BUTTONS.find((d) => d?.[0] === cmd)?.[4];
    if (!btn || !opts) return;
    const [v, text] = opts.select.find(([x]) => x === value) || opts.selectDefault;
    btn.dataset.value = v;
    btn.firstChild.textContent = text;
  }

  /** 버튼 클릭 → 명령 실행. 링크/이미지는 입력 UI 를 거친다 */
  #onCommand(cmd) {
    if (cmd === 'link') {
      const a = this.editor.sel.closest('a');
      // 허용되지 않는 주소(javascript: 등)면 입력줄을 닫지 않고 안내
      const apply = (v) => {
        if (v && this.editor.exec('link', v) === false) { this.inputField.setCustomValidity('http(s)·mailto·tel 주소나 / 로 시작하는 경로만 쓸 수 있습니다'); this.inputField.reportValidity(); return false; }
        return true;
      };
      if (a) this.#openInput('링크 URL (비우면 해제)', JmEditor.getHref(a), (v) => (v ? apply(v) : (this.editor.exec('unlink'), true)));
      else this.#openInput('링크 URL', 'https://', apply);
      return;
    }
    if (cmd === 'youtube') {
      this.#openInput('유튜브 주소', '', (v) => {
        if (!v) return true;
        if (!this.editor.exec('youtube', v)) { this.inputField.setCustomValidity('유튜브 주소가 아닙니다'); this.inputField.reportValidity(); return false; }
        return true;
      });
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
    if (cmd === 'alignMenu' || cmd === 'valignMenu') {
      const r = this.buttons[cmd].getBoundingClientRect();
      this.editor.sel.save();
      const items = cmd === 'alignMenu' ? ALIGN_ITEMS : VALIGN_ITEMS;
      const prefix = cmd === 'alignMenu' ? 'align' : 'valign';
      this.listMenu.open(r.left, r.bottom + 4, items.map(([v, label]) => ({
        label, action: () => this.editor.exec(prefix + v.charAt(0).toUpperCase() + v.slice(1)),
      })));
      return;
    }
    if (cmd === 'ulType' || cmd === 'olType') {
      const tag = cmd === 'ulType' ? 'ul' : 'ol';
      const r = this.buttons[cmd].getBoundingClientRect();
      this.editor.sel.save();
      this.listMenu.open(r.left, r.bottom + 4, (tag === 'ul' ? UL_TYPES : OL_TYPES).map(([v, label]) => ({
        label, action: () => this.editor.exec(tag, v),
      })));
      return;
    }
    if (cmd === 'quote') {
      // 인용 스타일 목록: 항목을 그 스타일 모양(세로선·박스·따옴표)으로 보여 주고 현재 스타일은 강조, 인용 안이면 「인용 해제」
      const r = this.buttons.quote.getBoundingClientRect();
      this.editor.sel.save();
      const current = this.editor.getState().quote;
      const items = QUOTE_ITEMS.map(([v, label]) => ({
        label, className: `jm-quote-item jm-quote-item-${v}`, checked: current === v, action: () => this.editor.exec('quote', v),
      }));
      if (current) items.push({ divider: true }, { label: '인용 해제', action: () => this.editor.exec('quote', null) });
      this.listMenu.open(r.left, r.bottom + 4, items);
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
      if (def[4]?.tableEnabled) this.buttons[cmd].disabled = !state.table;
    });
    // 정렬 버튼 아이콘을 현재 상태로
    const setIcon = (cmd, icon) => { const b = this.buttons[cmd]; if (b) b.innerHTML = icon + CHEVRON_ICON; };
    setIcon('alignMenu', (ALIGN_ITEMS.find(([v]) => v === state.align) || ALIGN_ITEMS[0])[2]);
    setIcon('valignMenu', (VALIGN_ITEMS.find(([v]) => v === state.valign) || VALIGN_ITEMS[0])[2]);
    // 현재 글자 크기 표시
    this.#setSelectValue('heading', state.block);
    this.#setSelectValue('fontSize', state.fontSize);
    // 현재 색을 버튼 하단 띠로 표시
    this.buttons.color.style.setProperty('--jm-swatch', state.color || 'transparent');
    this.buttons.bgColor.style.setProperty('--jm-swatch', state.bg || 'transparent');
  }

  /** 인라인 입력줄 열기. handler(value) 가 true 를 돌려주면 닫는다 */
  #openInput(label, initial, handler) {
    this.editor.sel.save();
    this.inputLabel.textContent = label;
    this.inputField.value = initial;
    this.inputField.setCustomValidity('');
    this.inputHandler = handler;
    this.inputBar.hidden = false;
    this.inputField.focus();
    this.inputField.select();
  }

  #submitInput() {
    this.inputField.setCustomValidity('');
    const v = this.inputField.value.trim();
    this.editor.root.focus();
    this.editor.sel.restore();
    if (this.inputHandler?.(v) !== false) this.#closeInput();
    else this.inputField.focus();
  }

  #closeInput() {
    this.inputBar.hidden = true;
    this.inputHandler = null;
    this.editor.root.focus();
    this.editor.sel.restore();
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

    // 미리보기를 떠나면 미리보기 런타임(슬라이드 타이머 등) 정리
    if (mode !== 'preview') { this.#stopPreviewLayout?.(); this.#stopPreviewLayout = null; }
    if (mode === 'html') { this.source.value = JmToolbarEditor.prettify(this.editor.getHTML()); this.source.focus(); }
    else if (mode === 'preview') {
      this.#renderPreview();
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

  /** 저장할 HTML. HTML 모드에서는 입력 중인 소스를 Sanitizer 로 거른 결과 */
  getHTML() { return this.mode === 'html' ? Sanitizer.clean(this.source.value, this.editor.structure) : this.editor.getHTML(); }
  setHTML(html) { this.editor.setHTML(html); if (this.mode === 'html') this.source.value = JmToolbarEditor.prettify(html); if (this.mode === 'preview') this.#renderPreview(); }

  /** 미리보기 그리기: 이전 런타임(갤러리 배치 감시·슬라이드 타이머)을 정리하고 Sanitizer 를 거친 HTML 로 다시 그림 */
  #renderPreview() {
    this.#stopPreviewLayout?.();
    this.previewPane.innerHTML = Sanitizer.clean(this.editor.getHTML(), this.editor.structure);
    const stopGalleries = observeGalleries(this.previewPane); // 갤러리 저스티파이드 배치 (뷰어와 동일)
    const stopSliders = initSliders(this.previewPane);       // 슬라이드 자동 전환
    const stopMaps = initMaps(this.previewPane);             // 카카오 지도
    this.#stopPreviewLayout = () => { stopGalleries(); stopSliders(); stopMaps(); };
  }
  /** 서식 관리에서 변경 후 호출하면 다음 열 때 다시 불러옴 */
  refreshFormats() { this.formatPicker.refresh(); }
  destroy() {
    this.#stopPreviewLayout?.(); // 미리보기 런타임(갤러리 감시·슬라이드 타이머) 정리
    this.#stopPreviewLayout = null;
    this.gridPicker.destroy(); this.colorPicker.destroy(); this.formatPicker.destroy(); this.listMenu.destroy(); this.editor.destroy();
  }
}
