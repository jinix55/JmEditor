/**
 * MapCommands — 카카오 지도 블록 (카카오맵 「지도 퍼가기」 코드로 만듦, 앱 키 불필요)
 * - 저장 HTML: <div data-type="map" data-provider="kakao-roughmap" data-timestamp="…" data-key="…" data-height="400" data-title="장소명"></div>
 *   지도는 map-runtime.js 가 그린다. 조회 화면에는 뷰어(JmViewer.initViewer)가 필요하다.
 * - 에디터에서는 레이어(jm-map-layer)로 감싸 헤더(퍼가기 코드 입력 / 높이 / 삭제)를 붙인다.
 *   지도 위에 투명 커버를 덮어 편집 중 클릭이 지도에 먹히지 않게 한다(지도 조작은 미리보기·조회에서).
 * - 본문에 퍼가기 코드를 그대로 붙여 넣어도 지도 블록으로 바뀐다(JmEditor 붙여넣기에서 parseRoughmap 사용).
 */
import { renderMap, stripMapUI, parseRoughmap, MAP_HEIGHTS, MAP_CANVAS_CLASS } from './map-runtime.js';

export const MAP_LAYER_CLASS = 'jm-map-layer';

export class MapCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
  }

  /**
   * 저장 형식 HTML. 값이 없으면 빈 블록(헤더에서 코드 입력)
   * @param {{timestamp: string, key: string}|null} [code]
   */
  static template(code = null) {
    const v = code ? ` data-timestamp="${code.timestamp}" data-key="${code.key}"` : '';
    return `<div data-type="map" data-provider="kakao-roughmap"${v} data-height="400"></div>`;
  }

  /**
   * 퍼가기 코드로 지도 블록 삽입. 코드가 아니면 false
   * @param {string} code
   */
  insertFromCode(code) {
    const parsed = parseRoughmap(code);
    if (!parsed) return false;
    this.editor.commands.insertBlockHTML(MapCommands.template(parsed));
    return true;
  }

  // ───────────── 레이어 ─────────────

  wrapAll() {
    this.root.querySelectorAll('div[data-type="map"]').forEach((b) => {
      if (b.parentNode?.classList?.contains(MAP_LAYER_CLASS)) return;
      this.#wrap(b);
    });
  }

  #wrap(block) {
    const layer = document.createElement('div');
    layer.className = MAP_LAYER_CLASS;
    layer.contentEditable = 'false';
    block.parentNode.insertBefore(layer, block);
    layer.append(this.#buildHeader(block), block);
    this.editor.blockDrag?.makeDraggable(block._handle, layer);
    this.#render(block);
    return layer;
  }

  #buildHeader(block) {
    const h = document.createElement('div');
    h.className = 'jm-map-header';
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle'; handle.title = '끌어서 이동'; handle.textContent = '⠿';
    block._handle = handle;
    const title = document.createElement('span');
    title.className = 'jm-map-title'; title.textContent = '카카오 지도';
    const place = document.createElement('span');
    place.className = 'jm-map-place';
    block._placeEl = place;

    // 퍼가기 코드 입력: 붙여 넣으면 바로 적용
    const code = document.createElement('input');
    code.type = 'text';
    code.className = 'jm-map-code';
    code.placeholder = '카카오맵 「지도 퍼가기」 코드를 붙여 넣으세요';
    code.title = 'map.kakao.com 에서 장소 검색 → 공유 → 지도 퍼가기 → 코드 복사';
    code.addEventListener('mousedown', (e) => e.stopPropagation());
    const apply = () => {
      const parsed = parseRoughmap(code.value);
      code.classList.toggle('is-invalid', !!code.value.trim() && !parsed);
      if (!parsed) return;
      block.dataset.timestamp = parsed.timestamp;
      block.dataset.key = parsed.key;
      delete block.dataset.title; // 새 지도의 장소명은 다시 받아 온다
      code.value = '';
      this.#render(block);
      this.editor.commit();
    };
    code.addEventListener('paste', () => setTimeout(apply)); // 붙여 넣은 값이 들어간 뒤
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });

    // 편집 영역 안의 링크는 열리지 않게 막혀 있으므로 버튼으로 새 창을 연다
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'jm-btn jm-map-help';
    help.textContent = '카카오맵 열기';
    help.title = '장소 검색 → 공유 → 지도 퍼가기 → 코드 복사';
    help.addEventListener('mousedown', (e) => e.preventDefault());
    help.addEventListener('click', () => window.open('https://map.kakao.com/', '_blank', 'noopener'));

    const height = document.createElement('select');
    height.className = 'jm-map-height';
    height.title = '지도 높이';
    MAP_HEIGHTS.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = `높이 ${v}`; height.appendChild(o); });
    height.value = MAP_HEIGHTS.includes(block.dataset.height) ? block.dataset.height : '400';
    height.addEventListener('mousedown', (e) => e.stopPropagation());
    height.addEventListener('change', () => { block.dataset.height = height.value; this.#render(block); this.editor.commit(); });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'jm-btn jm-map-remove';
    remove.textContent = '✕';
    remove.title = '지도 삭제';
    remove.addEventListener('mousedown', (e) => e.preventDefault());
    remove.addEventListener('click', () => this.#delete(block));

    const spacer = document.createElement('span');
    spacer.className = 'jm-map-spacer';
    h.append(handle, title, place, spacer, code, help, height, remove);
    return h;
  }

  /**
   * 지도 그리기 + 편집 중 클릭을 막는 커버.
   * 장소명이 비어 있을 때만 지도 데이터의 장소명으로 채운다(Sanitizer 와 같은 정리). 자동 보정이라 되돌리기 단계는 만들지 않는다.
   */
  #render(block) {
    block.classList.toggle('is-empty', !block.dataset.key);
    if (block._placeEl) block._placeEl.textContent = block.dataset.title || '';
    const job = renderMap(block, {
      onTitle: (name) => {
        const title = name.replace(/\s+/g, ' ').trim().slice(0, 100);
        if (!title || block.dataset.title || !block.isConnected) return;
        block.dataset.title = title;
        if (block._placeEl) block._placeEl.textContent = title;
        this.editor.amend();
      },
    });
    MapCommands.#cover(block); // 불러오는 동안에도 지도 클릭을 막음
    job.then(() => MapCommands.#cover(block)); // 대신 보이는 카드로 바뀌었을 때도
  }

  /** 그린 영역 위에 투명 커버 (없을 때만) */
  static #cover(block) {
    const canvas = block.querySelector(`:scope > .${MAP_CANVAS_CLASS}`);
    if (!canvas || canvas.querySelector(':scope > .jm-map-cover')) return;
    const cover = document.createElement('div');
    cover.className = 'jm-map-cover';
    cover.title = '지도 조작은 미리보기에서';
    canvas.appendChild(cover);
  }

  #delete(block) {
    const layer = block.parentNode;
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  /** 저장용 HTML 에서 레이어·그린 지도 제거 */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${MAP_LAYER_CLASS}`).forEach((layer) => {
      const block = layer.querySelector('div[data-type="map"]');
      if (!block) { layer.remove(); return; }
      stripMapUI(block);
      block.classList.remove('is-empty');
      if (!block.getAttribute('class')) block.removeAttribute('class');
      layer.replaceWith(block);
    });
    return tpl.innerHTML;
  }
}
