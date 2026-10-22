/**
 * LayoutCommands — 이미지+글 배치 블록 (배치 프리셋)
 *
 * - 저장 HTML:
 *   <div data-type="layout" data-preset="side|one|diagonal|pair" data-variant="…" data-split="20~80(5단위)?">
 *     <div data-cell="image"><img …></div><div data-cell="text"><p>…</p></div> …</div>
 *   칸 순서는 layout-presets.js 의 variant 별 역할 순서(= 휴대폰 세로 쌓기 순서). 화면 배치는 CSS grid 만으로 → 뷰어 런타임 불필요.
 * - 에디터에서는 레이어(jm-layout-layer, contenteditable=false)로 감싸고 헤더(⠿ 이동 / 배치 아이콘 / ✕)를 붙인다.
 *   글 칸은 contenteditable 로 본문처럼 편집, 이미지 칸은 자리 표시(클릭·파일 놓기) / 교체·삭제 도구.
 *   두 열 사이 손잡이를 끌면 왼쪽 열 폭(%)이 바뀐다.
 * - 배치를 바꾸면 같은 역할의 칸끼리 내용이 이동한다(이미지 옆 작은 글 → 작은 글 자리 등).
 * - 이미지 업로드 형식·파일당 크기·긴 변 축소는 갤러리 규칙(gallery-upload.js, 설정 gallery 영역)을 따른다.
 */
import { BlockDrag } from '../../core/BlockDrag.js';
import { LAYOUT_PRESETS, SPLIT, isImageRole, normalizeLayout, normalizeSplit, cellsOf } from './layout-presets.js';
import { resolveLimits, filterFiles, resizeImage, notify } from '../gallery/gallery-upload.js';
import { stampSize } from '../gallery/gallery-layout.js';

export const LAYOUT_LAYER_CLASS = 'jm-layout-layer';
/** 편집용 UI(자리 표시·이미지 도구·폭 손잡이) — 저장 시 제거 */
const UI_CLASS = 'jm-layout-ui';
const TEXT_PLACEHOLDER = '글을 입력하세요.';
/** 글 칸에 둘 수 없는 것: 표·이미지·iframe·다른 블록(레이어) — 붙여넣기 등으로 들어오면 제거. 일반 div 는 p 로 바꿈 (Sanitizer 와 같은 결과) */
const TEXT_CELL_FORBIDDEN = 'table, img, iframe, div[data-type], [class*="-layer"]';
/** 글 칸 직속으로 허용하는 블록 */
const TEXT_BLOCK = /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE)$/;

export class LayoutCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.root = editor.root;
    this.limits = resolveLimits(editor.options.galleryLimits);
    this.pendingCell = null;
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = this.limits.types.join(',');
    this.fileInput.hidden = true;
    this.root.parentNode?.appendChild(this.fileInput) ?? document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files[0];
      this.fileInput.value = '';
      if (file && this.pendingCell) await this.setImage(this.pendingCell, file);
    });
  }

  // ───────────── 생성 / 레이어 ─────────────

  /**
   * 배치 블록 HTML (서식 삽입용)
   * @param {string} [preset='side']
   * @param {string} [variant] 없으면 그 preset 의 첫 배치
   */
  static template(preset = 'side', variant) {
    const n = normalizeLayout(preset, variant);
    const cells = cellsOf(n.preset, n.variant)
      .map((role) => (isImageRole(role) ? '<div data-cell="image"></div>' : `<div data-cell="text"><p>${TEXT_PLACEHOLDER}</p></div>`))
      .join('');
    return `<div data-type="layout" data-preset="${n.preset}" data-variant="${n.variant}">${cells}</div>`;
  }

  /** 루트 안의 배치 블록을 모두 레이어로 감싼다 (setHTML / commit 후) */
  wrapAll() {
    this.root.querySelectorAll('div[data-type="layout"]').forEach((b) => {
      if (b.parentNode?.classList?.contains(LAYOUT_LAYER_CLASS)) { this.#render(b); return; }
      this.#wrap(b);
    });
  }

  #wrap(block) {
    const layer = document.createElement('div');
    layer.className = LAYOUT_LAYER_CLASS;
    layer.contentEditable = 'false';
    block.parentNode.insertBefore(layer, block);
    layer.append(this.#buildHeader(block), block);
    block.classList.add('jm-layout');
    this.editor.blockDrag?.makeDraggable(block._handle, layer);
    this.#bind(block);
    this.#render(block);
    return layer;
  }

  /** 헤더: ⠿ 이동 / 종류 이름 / 배치 아이콘 / ✕ */
  #buildHeader(block) {
    const h = document.createElement('div');
    h.className = 'jm-layout-header';
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle';
    handle.title = '끌어서 이동';
    handle.textContent = '⠿';
    block._handle = handle;

    const title = document.createElement('span');
    title.className = 'jm-layout-title';
    const spacer = document.createElement('span');
    spacer.className = 'jm-layout-spacer';
    const variants = document.createElement('span');
    variants.className = 'jm-layout-variants';
    block._variantsEl = variants;
    block._titleEl = title;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'jm-btn jm-layout-btn jm-layout-remove';
    remove.textContent = '✕';
    remove.title = '배치 블록 삭제';
    remove.addEventListener('mousedown', (e) => e.preventDefault());
    remove.addEventListener('click', () => this.deleteBlock(block));

    h.append(handle, title, spacer, variants, remove);
    return h;
  }

  /** 배치 아이콘 버튼 (칸 모양을 작은 격자로) */
  #variantButton(block, variant, def) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jm-layout-variant';
    b.title = def.label;
    b.dataset.variant = variant;
    const grid = document.createElement('span');
    grid.className = `jm-layout-icon jm-layout-icon-${def.icon.length}`;
    [...def.icon].forEach((k) => { const i = document.createElement('i'); if (k === 'i') i.className = 'is-img'; grid.appendChild(i); });
    b.appendChild(grid);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => this.setVariant(block, variant));
    return b;
  }

  /** 블록 이벤트: 이미지 칸 클릭·파일 놓기, 글 칸 입력 정리 (한 번만 등록) */
  #bind(block) {
    block.addEventListener('click', (e) => {
      const btn = e.target.closest?.(`.${UI_CLASS} [data-act], .${UI_CLASS}[data-act]`);
      if (!btn) return;
      const cell = btn.closest('[data-cell="image"]');
      if (btn.dataset.act === 'pick') { this.pendingCell = cell; this.fileInput.click(); }
      if (btn.dataset.act === 'clear') this.clearImage(cell);
    });
    block.addEventListener('dragover', (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      const cell = e.target.closest?.('[data-cell="image"]');
      if (!cell) return;
      e.preventDefault();
      cell.classList.add('is-dragover');
    });
    block.addEventListener('dragleave', (e) => {
      const cell = e.target.closest?.('[data-cell="image"]');
      if (cell && !cell.contains(e.relatedTarget)) cell.classList.remove('is-dragover');
    });
    block.addEventListener('drop', async (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      const cell = e.target.closest?.('[data-cell="image"]');
      // 이미지 칸 밖(글 칸)에 놓은 파일은 무시 — 본문 이미지로 들어가지 않게
      e.preventDefault(); e.stopPropagation();
      if (!cell) return;
      cell.classList.remove('is-dragover');
      const file = Array.from(e.dataTransfer?.files || [])[0];
      if (file) await this.setImage(cell, file);
    });
    block.addEventListener('input', () => {
      if (this.editor.composing) return;
      block.querySelectorAll(':scope > [data-cell="text"]').forEach((c) => this.#normalizeText(c));
    });
  }

  /** 칸 편집 상태·UI 다시 그리기 */
  #render(block) {
    block.querySelectorAll(`.${UI_CLASS}`).forEach((el) => el.remove());
    const { preset, variant } = normalizeLayout(block.dataset.preset, block.dataset.variant);
    block.dataset.preset = preset;
    block.dataset.variant = variant;

    block.querySelectorAll(':scope > [data-cell="text"]').forEach((cell) => {
      cell.contentEditable = 'true';
      cell.querySelectorAll(TEXT_CELL_FORBIDDEN).forEach((el) => el.remove());
      this.#normalizeText(cell);
    });
    block.querySelectorAll(':scope > [data-cell="image"]').forEach((cell) => {
      cell.contentEditable = 'false';
      const img = cell.querySelector('img');
      if (!img) {
        const ph = document.createElement('button');
        ph.type = 'button';
        ph.className = `${UI_CLASS} jm-layout-ph`;
        ph.dataset.act = 'pick';
        ph.textContent = '이미지를 넣으세요 (클릭 또는 파일 끌어다 놓기)';
        cell.appendChild(ph);
      } else {
        const tools = document.createElement('span');
        tools.className = `${UI_CLASS} jm-layout-imgtools`;
        tools.innerHTML = '<button type="button" data-act="pick">교체</button><button type="button" data-act="clear">삭제</button>';
        cell.appendChild(tools);
      }
    });

    // 헤더: 종류 이름 + 배치 아이콘
    if (block._titleEl) block._titleEl.textContent = LAYOUT_PRESETS[preset].label;
    if (block._variantsEl) {
      block._variantsEl.replaceChildren(...Object.entries(LAYOUT_PRESETS[preset].variants).map(([v, def]) => {
        const b = this.#variantButton(block, v, def);
        b.classList.toggle('is-on', v === variant);
        return b;
      }));
    }

    // 두 열 사이 폭 손잡이
    const split = document.createElement('div');
    split.className = `${UI_CLASS} jm-layout-split`;
    split.contentEditable = 'false';
    split.title = '끌어서 좌우 폭 조절';
    split.addEventListener('pointerdown', (e) => this.#startSplit(e, block));
    block.appendChild(split);
    this.#placeSplit(block);
  }

  /** 글 칸 직속을 문단 계열 블록으로 정리 (맨 텍스트·div·br 은 p 로) */
  #normalizeText(cell) {
    let loose = null;
    Array.from(cell.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains(UI_CLASS)) return;
      if (n.nodeType === Node.ELEMENT_NODE && TEXT_BLOCK.test(n.tagName)) { loose = null; return; }
      if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'DIV') {
        const p = document.createElement('p');
        p.append(...n.childNodes);
        n.replaceWith(p);
        loose = null;
        return;
      }
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim() && !loose) { n.remove(); return; }
      if (!loose) { loose = document.createElement('p'); cell.insertBefore(loose, n); }
      loose.appendChild(n);
    });
    if (!cell.querySelector('p, h1, h2, h3, ul, ol, blockquote')) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      cell.appendChild(p);
    }
  }

  // ───────────── 배치 / 폭 ─────────────

  /**
   * 같은 종류 안에서 배치 변경 — 같은 역할의 칸끼리 내용 이동, 칸 순서를 새 배치의 저장 순서로
   * @param {HTMLElement} block
   * @param {string} variant
   */
  setVariant(block, variant) {
    const { preset, variant: from } = normalizeLayout(block.dataset.preset, block.dataset.variant);
    if (!LAYOUT_PRESETS[preset].variants[variant] || variant === from) return;
    const cells = Array.from(block.querySelectorAll(':scope > [data-cell]'));
    const byRole = {};
    cellsOf(preset, from).forEach((role, i) => { byRole[role] = cells[i]; });
    const ordered = cellsOf(preset, variant).map((role) => byRole[role]).filter(Boolean);
    const split = block.querySelector(':scope > .jm-layout-split');
    ordered.forEach((c) => block.insertBefore(c, split));
    block.dataset.variant = variant;
    this.#render(block);
    this.editor.commit();
  }

  /**
   * 왼쪽 열 폭(%) 지정 — 20~80, 5 단위. 50 이면 기본값이라 속성을 지운다
   * @param {HTMLElement} block
   * @param {number} pct
   * @param {boolean} [commit=true]
   */
  setSplit(block, pct, commit = true) {
    const snapped = Math.round(Math.max(SPLIT.min, Math.min(SPLIT.max, pct)) / SPLIT.step) * SPLIT.step;
    const v = normalizeSplit(snapped) ?? SPLIT.default;
    if (v === SPLIT.default) delete block.dataset.split; else block.dataset.split = String(v);
    this.#placeSplit(block);
    if (commit) this.editor.commit();
  }

  /** 폭 손잡이를 두 열 사이 간격 가운데에 둔다 */
  #placeSplit(block) {
    const h = block.querySelector(':scope > .jm-layout-split');
    if (!h) return;
    const cs = getComputedStyle(block);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const gap = parseFloat(cs.columnGap) || 0;
    const s = (normalizeSplit(block.dataset.split) ?? SPLIT.default) / 100;
    h.style.left = `calc(${padL}px + (100% - ${padL + padR + gap}px) * ${s} + ${gap / 2}px)`;
  }

  /** 폭 손잡이 드래그 */
  #startSplit(e, block) {
    e.preventDefault();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    block.classList.add('is-resizing');
    const move = (ev) => {
      const r = block.getBoundingClientRect();
      const cs = getComputedStyle(block);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const gap = parseFloat(cs.columnGap) || 0;
      const inner = r.width - padL - padR - gap;
      this.setSplit(block, ((ev.clientX - r.left - padL - gap / 2) / inner) * 100, false);
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      block.classList.remove('is-resizing');
      this.editor.commit();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }

  // ───────────── 이미지 칸 ─────────────

  /**
   * 이미지 칸에 파일 넣기(또는 교체): 형식·크기 검사 → 긴 변 축소 → 업로드(또는 base64)
   * @param {HTMLElement} cell div[data-cell=image]
   * @param {File} file
   */
  async setImage(cell, file) {
    const { accepted, messages } = filterFiles([file], this.limits);
    if (!accepted.length) { notify(this.editor.options, messages); return; }
    try {
      const resized = await resizeImage(file, this.limits.maxDimension);
      const src = this.editor.options.uploadImage
        ? await this.editor.options.uploadImage(resized)
        : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(resized); });
      const img = document.createElement('img');
      img.alt = file.name;
      await new Promise((resolve) => { img.onload = () => { stampSize(img, true); resolve(); }; img.onerror = resolve; img.src = src; });
      img.onload = null;
      cell.replaceChildren(img);
    } catch (err) {
      notify(this.editor.options, `이미지를 올리지 못했습니다: ${err?.message || err}`);
      return;
    }
    this.#render(cell.parentElement);
    this.editor.commit();
  }

  /** 이미지 칸 비우기 (자리 표시로) */
  clearImage(cell) {
    cell.replaceChildren();
    this.#render(cell.parentElement);
    this.editor.commit();
  }

  /** 배치 블록 삭제 → 빈 단락으로 대체 */
  deleteBlock(block) {
    const layer = block.closest(`.${LAYOUT_LAYER_CLASS}`) || block;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.editor.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 저장용 변환 ─────────────

  /**
   * 레이어·헤더·편집 UI·편집 속성 제거 (getHTML 에서 호출)
   * @param {string} html
   */
  static unwrapHTML(html) {
    if (!html.includes(LAYOUT_LAYER_CLASS)) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${LAYOUT_LAYER_CLASS}`).forEach((layer) => {
      const block = layer.querySelector('div[data-type="layout"]');
      if (!block) { layer.remove(); return; }
      block.querySelectorAll(`.${UI_CLASS}`).forEach((el) => el.remove());
      block.removeAttribute('class');
      block.removeAttribute('style');
      block.querySelectorAll(':scope > [data-cell]').forEach((c) => { c.removeAttribute('contenteditable'); c.removeAttribute('class'); });
      layer.replaceWith(block);
    });
    return tpl.innerHTML;
  }

  destroy() { this.fileInput.remove(); }
}
