/**
 * GalleryCommands
 * - 이미지 갤러리 블록: 저장 HTML 은 <div data-type="gallery" data-layout="justify"><p data-role="title">제목</p><img …>…</div>
 *   제목은 선택 사항. 비어 있으면 저장 시 제거되어 뷰어에는 제목 없이 이미지만 보인다. 사진별 캡션은 두지 않는다.
 * - 배치는 한 가지: 비율을 유지하며 줄 전체를 채우고 마지막 줄은 왼쪽 정렬 (gallery-layout.js).
 *   줄 높이·간격은 CSS 변수(--jm-gallery-row-height / --jm-gallery-gap)로 디자인에서 정한다.
 *   예전에 저장된 cover·열 수·정렬 값은 편집할 때 justify 로 바뀐다 (뷰어는 예전 값도 그대로 보여줌).
 * - 에디터 안에서는 레이어(<div class="jm-gallery-layer" contenteditable="false">) 로 감싸고
 *   헤더(이미지 추가 / 교체 / 선택 삭제 / 전체 삭제)를 붙인다. 저장 시 레이어·헤더·선택 상태는 제거된다.
 * - 갤러리 위에 이미지 파일을 드롭하거나 헤더 「이미지 추가」로 여러 장을 넣을 수 있다.
 *   업로드 제한·긴 변 축소는 gallery-upload.js (에디터 옵션 galleryLimits 로 변경).
 */
import { layoutGallery, stampSize } from './gallery-layout.js';
import { resolveLimits, filterFiles, resizeImage, mbLabel, notify } from './gallery-upload.js';
import { BlockDrag } from '../../core/BlockDrag.js';

export const GALLERY_LAYER_CLASS = 'jm-gallery-layer';
const SELECTED_CLASS = 'is-selected';
const LAYOUT = 'justify';
/** 예전 배치 옵션(열 수·배치 방식·정렬) 속성 — 편집 시 제거 */
const LEGACY_ATTRS = ['data-cols', 'data-auto', 'data-align'];

export class GalleryCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
    this.limits = resolveLimits(editor.options.galleryLimits);
    /** 이번 편집에서 올린 이미지의 크기(바이트) — src 별. 글당 용량 계산용 (불러온 기존 이미지는 크기를 알 수 없어 0) */
    this.bytesBySrc = new Map();

    // 여러 장 추가용 / 1장 교체용 숨김 input (레이어 공용)
    this.fileInput = this.#createFileInput(true);
    this.replaceInput = this.#createFileInput(false);
    this.pendingGallery = null;
    this.fileInput.addEventListener('change', async () => {
      const files = Array.from(this.fileInput.files);
      this.fileInput.value = '';
      if (this.pendingGallery) await this.addFiles(this.pendingGallery, files);
    });
    this.replaceInput.addEventListener('change', async () => {
      const file = this.replaceInput.files[0];
      this.replaceInput.value = '';
      if (file && this.pendingGallery) await this.replaceSelected(this.pendingGallery, file);
    });
  }

  /** 허용 형식만 고르는 숨김 file input */
  #createFileInput(multiple) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.limits.types.join(',');
    input.multiple = multiple;
    input.hidden = true;
    this.root.parentNode?.appendChild(input) ?? document.body.appendChild(input);
    return input;
  }

  // ───────────── 생성 / 레이어 ─────────────

  /** 갤러리 블록 HTML (서식 삽입용) */
  static template() {
    return `<div data-type="gallery" data-layout="${LAYOUT}"></div>`;
  }

  /** 루트 안의 갤러리 요소를 모두 레이어로 감싼다 (setHTML / commit 후) */
  wrapAll() {
    this.root.querySelectorAll('div[data-type="gallery"]').forEach((g) => {
      if (!g.isConnected || !this.root.contains(g)) return; // 앞 블록 정리 중 제거된 경우
      if (g.parentNode?.classList?.contains(GALLERY_LAYER_CLASS)) { this.#layout(g); return; }
      this.#wrap(g);
    });
  }

  #wrap(gallery) {
    const layer = document.createElement('div');
    layer.className = GALLERY_LAYER_CLASS;
    layer.contentEditable = 'false';
    gallery.parentNode.insertBefore(layer, gallery);
    layer.append(this.#buildHeader(gallery), gallery);
    this.editor.blockDrag?.makeDraggable(gallery._handle, layer);
    gallery.classList.add('jm-gallery');
    // 배치는 한 가지 — 예전 배치 옵션은 정리
    gallery.dataset.layout = LAYOUT;
    LEGACY_ATTRS.forEach((a) => gallery.removeAttribute(a));
    this.#ensureTitle(gallery);
    this.#bindGallery(gallery);
    gallery.querySelectorAll('img').forEach((img) => stampSize(img));
    // 폭 변경·이미지 로드 시 재배치
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layoutGallery(gallery)).observe(gallery);
    gallery.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') { stampSize(e.target); layoutGallery(gallery); } }, true);
    this.#layout(gallery);
    return layer;
  }

  /** 제목 요소 보장: 없으면 빈 제목(placeholder) 생성. 레이어는 편집 불가지만 제목만 편집 가능 */
  #ensureTitle(gallery) {
    let t = gallery.querySelector(':scope > p[data-role="title"]');
    if (!t) {
      t = document.createElement('p');
      t.dataset.role = 'title';
      gallery.insertBefore(t, gallery.firstChild);
    }
    t.setAttribute('contenteditable', 'true');
    t.dataset.placeholder = '제목 (비워두면 표시되지 않음)';
    // 제목에서 Enter → 줄바꿈 대신 제목 확정(포커스 해제), 입력 시 변경 기록
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } });
    t.addEventListener('input', () => this.editor.history.pushDebounced());
    t.addEventListener('blur', () => this.editor.commit());
  }

  /** 헤더: 이미지 추가 / 교체 / 선택 삭제 / 전체 삭제 / 갤러리 삭제 */
  #buildHeader(gallery) {
    const h = document.createElement('div');
    h.className = 'jm-gallery-header';

    // 드래그 핸들: 끌어서 블록 위치 이동
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle';
    handle.title = '끌어서 이동';
    handle.textContent = '⠿';
    gallery._handle = handle;

    const title = document.createElement('span');
    title.className = 'jm-gallery-title';
    title.textContent = '이미지 갤러리';

    const mk = (label, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `jm-btn jm-gallery-btn ${cls}`.trim();
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', onClick);
      return b;
    };

    const add = mk('＋ 이미지 추가', () => { this.pendingGallery = gallery; this.fileInput.click(); });
    const replace = mk('교체', () => { this.pendingGallery = gallery; this.replaceInput.click(); }, 'jm-gallery-replace');
    replace.title = '선택한 사진 1장을 다른 파일로 바꿉니다';
    const delSel = mk('선택 삭제', () => this.deleteSelected(gallery), 'jm-gallery-delsel');
    const delAll = mk('전체 삭제', () => this.deleteAll(gallery));

    const count = document.createElement('span');
    count.className = 'jm-gallery-count';
    gallery._countEl = count;

    const remove = mk('✕', () => this.deleteGallery(gallery), 'jm-gallery-remove');
    remove.title = '갤러리 삭제';

    h.append(handle, title, count, add, replace, delSel, delAll, remove);
    return h;
  }

  /** 갤러리 요소 이벤트: 이미지 클릭 선택 토글, 파일 드롭 */
  #bindGallery(gallery) {
    gallery.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (!img) return;
      img.classList.toggle(SELECTED_CLASS);
      this.#refreshHeader(gallery);
    });
    // 사진 순서 이동: 갤러리 안의 img 를 드래그해 다른 img 앞/뒤에 놓는다
    let dragging = null;
    gallery.addEventListener('dragstart', (e) => {
      const img = e.target.closest?.('img');
      if (!img || img.parentNode !== gallery) return;
      dragging = img;
      img.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'jm-gallery-reorder'); // Firefox 는 데이터가 있어야 드래그 시작
    });
    gallery.addEventListener('dragend', () => {
      dragging?.classList.remove('is-dragging');
      gallery.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      dragging = null;
    });
    gallery.addEventListener('dragover', (e) => {
      if (BlockDrag.isBlockDrag(e)) return; // 블록 이동은 BlockDrag 가 처리 (루트에서 버블링 수신)
      e.preventDefault();
      if (dragging) {
        // 마우스가 대상 이미지의 왼쪽 절반이면 앞, 오른쪽 절반이면 뒤
        e.dataTransfer.dropEffect = 'move';
        gallery.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        const over = e.target.closest?.('img');
        if (over && over !== dragging && over.parentNode === gallery) {
          const r = over.getBoundingClientRect();
          over.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
        }
        return;
      }
      gallery.classList.add('is-dragover');
    });
    gallery.addEventListener('dragleave', (e) => { if (!gallery.contains(e.relatedTarget)) gallery.classList.remove('is-dragover'); });
    gallery.addEventListener('drop', async (e) => {
      if (BlockDrag.isBlockDrag(e)) return;
      e.preventDefault(); e.stopPropagation();
      gallery.classList.remove('is-dragover');
      if (dragging) {
        const over = e.target.closest?.('img');
        if (over && over !== dragging && over.parentNode === gallery) {
          const r = over.getBoundingClientRect();
          const before = e.clientX < r.left + r.width / 2;
          gallery.insertBefore(dragging, before ? over : over.nextSibling);
        } else if (!over) {
          // 빈 영역에 놓으면 커서 좌표(줄 → X)에 가장 가까운 위치로
          const imgs = Array.from(gallery.querySelectorAll(':scope > img')).filter((i) => i !== dragging);
          let ref = null;
          for (const it of imgs) { const r = it.getBoundingClientRect(); if (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2)) { ref = it; break; } }
          gallery.insertBefore(dragging, ref);
        }
        this.#layout(gallery);
        this.editor.commit();
        return;
      }
      // 형식 검사는 addFiles 에서 (허용되지 않는 파일은 안내 후 제외)
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) await this.addFiles(gallery, files);
    });
  }

  /** 빈 상태 표시 + 배치 + 헤더 갱신 */
  #layout(gallery) {
    const n = gallery.querySelectorAll('img').length;
    gallery.classList.toggle('is-empty', n === 0);
    layoutGallery(gallery);
    this.#refreshHeader(gallery);
  }

  #refreshHeader(gallery) {
    const n = gallery.querySelectorAll('img').length;
    const s = gallery.querySelectorAll(`img.${SELECTED_CLASS}`).length;
    if (gallery._countEl) gallery._countEl.textContent = n ? `${n}장${s ? ` · ${s}장 선택` : ''}` : '이미지를 드롭하거나 추가하세요';
    const layer = gallery.parentNode;
    const delSel = layer?.querySelector('.jm-gallery-delsel');
    if (delSel) delSel.disabled = s === 0;
    const replace = layer?.querySelector('.jm-gallery-replace');
    if (replace) replace.disabled = s !== 1;
  }

  // ───────────── 제한 / 안내 ─────────────

  /** 사용자 안내 (options.notify 또는 alert) */
  #notify(messages) {
    notify(this.editor.options, messages);
  }

  /** 이 글(에디터)의 모든 갤러리 이미지 */
  #postImages() {
    return Array.from(this.root.querySelectorAll('div[data-type="gallery"] > img'));
  }

  /** 이 글의 갤러리 이미지 용량 합계 (이번 편집에서 올린 것만 크기를 안다) */
  #postBytes(except = null) {
    return this.#postImages().reduce((sum, img) => (img === except ? sum : sum + (this.bytesBySrc.get(img.getAttribute('src')) || 0)), 0);
  }

  /**
   * 축소 후 업로드(또는 base64)해서 img 요소를 만든다
   * @param {File} file 형식·크기 검사를 통과한 파일
   * @returns {Promise<{img: HTMLImageElement, bytes: number}>}
   */
  async #prepare(file) {
    const resized = await resizeImage(file, this.limits.maxDimension);
    const src = this.editor.options.uploadImage
      ? await this.editor.options.uploadImage(resized)
      : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(resized); });
    const img = document.createElement('img');
    img.alt = file.name;
    // 원본 크기를 width/height 속성에 기록한 뒤 붙임 (저장 HTML 에 비율 포함)
    await new Promise((resolve) => { img.onload = () => { stampSize(img, true); resolve(); }; img.onerror = resolve; img.src = src; });
    this.bytesBySrc.set(src, resized.size);
    return { img, bytes: resized.size };
  }

  // ───────────── 이미지 추가 / 교체 / 삭제 ─────────────

  /**
   * 파일들을 제한 검사 → 긴 변 축소 → 업로드(또는 base64) 후 갤러리에 추가
   * - 1회 장수·글당 장수를 넘으면 이번 파일 전체를 넣지 않는다.
   * - 형식·파일당 크기가 맞지 않는 파일만 빼고 나머지는 넣는다.
   * - 글당 용량은 넣는 도중 넘으면 거기서 멈춘다.
   */
  async addFiles(gallery, files) {
    const L = this.limits;
    if (files.length > L.maxFilesPerAdd) {
      this.#notify(`한 번에 ${L.maxFilesPerAdd}장까지 올릴 수 있습니다. (선택: ${files.length}장)`);
      return;
    }
    const { accepted, messages } = filterFiles(files, L);
    const current = this.#postImages().length;
    if (accepted.length && current + accepted.length > L.maxImagesPerPost) {
      this.#notify([...messages, `글 하나에 사진은 ${L.maxImagesPerPost}장까지 넣을 수 있습니다. (현재 ${current}장, 추가 ${accepted.length}장)`]);
      return;
    }
    let total = this.#postBytes();
    let added = 0;
    try {
      for (const file of accepted) {
        const { img, bytes } = await this.#prepare(file);
        if (total + bytes > L.maxTotalSize) {
          this.bytesBySrc.delete(img.getAttribute('src'));
          messages.push(`글 하나에 사진은 ${mbLabel(L.maxTotalSize)}까지 넣을 수 있습니다. (${file.name}부터 제외)`);
          break;
        }
        total += bytes;
        gallery.appendChild(img);
        added++;
      }
    } catch (err) {
      messages.push(`이미지를 올리지 못했습니다: ${err?.message || err}`);
    }
    this.#notify(messages);
    if (!added) return;
    this.#layout(gallery);
    this.editor.commit();
  }

  /**
   * 선택한 사진 1장을 새 파일로 교체 (같은 자리 유지)
   * @param {HTMLElement} gallery
   * @param {File} file
   */
  async replaceSelected(gallery, file) {
    const target = gallery.querySelectorAll(`img.${SELECTED_CLASS}`);
    if (target.length !== 1) { this.#notify('교체할 사진을 1장만 선택하세요.'); return; }
    const old = target[0];
    const { accepted, messages } = filterFiles([file], this.limits);
    if (!accepted.length) { this.#notify(messages); return; }
    try {
      const { img, bytes } = await this.#prepare(file);
      if (this.#postBytes(old) + bytes > this.limits.maxTotalSize) {
        this.bytesBySrc.delete(img.getAttribute('src'));
        this.#notify(`글 하나에 사진은 ${mbLabel(this.limits.maxTotalSize)}까지 넣을 수 있습니다.`);
        return;
      }
      old.replaceWith(img);
    } catch (err) {
      this.#notify(`이미지를 올리지 못했습니다: ${err?.message || err}`);
      return;
    }
    this.#layout(gallery);
    this.editor.commit();
  }

  deleteSelected(gallery) {
    gallery.querySelectorAll(`img.${SELECTED_CLASS}`).forEach((img) => img.remove());
    this.#layout(gallery);
    this.editor.commit();
  }

  deleteAll(gallery) {
    gallery.querySelectorAll('img').forEach((img) => img.remove());
    this.#layout(gallery);
    this.editor.commit();
  }

  /** 갤러리 블록 자체 삭제 → 빈 단락으로 대체 */
  deleteGallery(gallery) {
    const layer = gallery.closest(`.${GALLERY_LAYER_CLASS}`) || gallery;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  // ───────────── 저장용 변환 ─────────────

  /**
   * 레이어·헤더·선택 상태·인라인 스타일 제거 (getHTML 에서 호출)
   * @param {string} html
   */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${GALLERY_LAYER_CLASS}`).forEach((layer) => {
      const g = layer.querySelector('div[data-type="gallery"]');
      if (!g) { layer.remove(); return; }
      g.removeAttribute('class');
      g.removeAttribute('style');
      g.querySelectorAll('img').forEach((img) => { img.removeAttribute('class'); img.removeAttribute('style'); });
      // 제목: 편집 속성 제거, 비어 있으면 통째로 제거
      const t = g.querySelector(':scope > p[data-role="title"]');
      if (t) {
        if (!t.textContent.replace(/​/g, '').trim()) t.remove();
        else { t.removeAttribute('contenteditable'); t.removeAttribute('data-placeholder'); }
      }
      layer.replaceWith(g);
    });
    return tpl.innerHTML;
  }

  destroy() { this.fileInput.remove(); this.replaceInput.remove(); }
}
