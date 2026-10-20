/**
 * EmbedCommands — 유튜브 동영상 블록
 * - 저장 HTML: <div data-type="youtube" data-width="100|75|50" data-align="left|center|right">
 *               <iframe src="https://www.youtube-nocookie.com/embed/{id}" title="YouTube video" allow="…" allowfullscreen></iframe></div>
 *   16:9 영역은 CSS 로 잡는다. 뷰어는 CSS 만 있으면 된다.
 * - 에디터에서는 레이어(<div class="jm-embed-layer" contenteditable="false">) 로 감싸 핸들(드래그 이동)·헤더(폭/정렬/삭제)를 붙인다.
 *   편집 중에는 iframe 을 로드하지 않고 썸네일(i.ytimg.com) + 제목·채널(YouTube oEmbed) 을 보여준다. 재생은 미리보기/조회에서.
 */
import { BlockDrag } from '../../core/BlockDrag.js';

export const EMBED_LAYER_CLASS = 'jm-embed-layer';
const EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';

export class EmbedCommands {
  /** @param {import('../../core/JmEditor.js').JmEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.sel = editor.sel;
    this.root = editor.root;
  }

  /**
   * 유튜브 주소/ID 에서 동영상 ID 추출. 지원: watch?v=, youtu.be/, shorts/, embed/, live/, 순수 ID
   * @returns {string|null}
   */
  static parseYouTubeId(input) {
    const s = (input || '').trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)?\/?([A-Za-z0-9_-]{11})(?:[/?]|$)/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  /** 저장 형식 HTML */
  static template(id, width = '100', align = 'center') {
    return `<div data-type="youtube" data-width="${width}" data-align="${align}">`
      + `<iframe src="${EMBED_BASE}${id}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  /** 유튜브 블록 삽입 (주소 또는 ID). 실패 시 false */
  insertYouTube(input) {
    const id = EmbedCommands.parseYouTubeId(input);
    if (!id) return false;
    this.editor.commands.insertBlockHTML(EmbedCommands.template(id));
    return true;
  }

  // ───────────── 레이어 ─────────────

  wrapAll() {
    this.root.querySelectorAll('div[data-type="youtube"]').forEach((b) => {
      if (b.parentNode?.classList?.contains(EMBED_LAYER_CLASS)) return;
      this.#wrap(b);
    });
  }

  #wrap(block) {
    const layer = document.createElement('div');
    layer.className = EMBED_LAYER_CLASS;
    layer.contentEditable = 'false';
    block.parentNode.insertBefore(layer, block);

    const header = document.createElement('div');
    header.className = 'jm-embed-header';
    const handle = document.createElement('span');
    handle.className = 'jm-block-handle';
    handle.title = '끌어서 이동';
    handle.textContent = '⠿';
    const title = document.createElement('span');
    title.className = 'jm-embed-title';
    title.textContent = 'YouTube';
    const spacer = document.createElement('span');
    spacer.className = 'jm-embed-spacer';

    const mkSelect = (cls, opts, cur, onChange) => {
      const sel = document.createElement('select');
      sel.className = cls;
      opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
      sel.value = cur;
      sel.addEventListener('mousedown', (e) => e.stopPropagation());
      sel.addEventListener('change', () => { onChange(sel.value); this.editor.commit(); });
      return sel;
    };
    const width = mkSelect('jm-embed-width', [['100', '폭 100%'], ['75', '폭 75%'], ['50', '폭 50%']], block.dataset.width || '100', (v) => { block.dataset.width = v; });
    const align = mkSelect('jm-embed-align', [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']], block.dataset.align || 'center', (v) => { block.dataset.align = v; });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'jm-btn jm-embed-remove';
    remove.textContent = '✕';
    remove.title = '삭제';
    remove.addEventListener('mousedown', (e) => e.preventDefault());
    remove.addEventListener('click', () => this.#delete(layer));

    header.append(handle, title, spacer, width, align, remove);

    // 편집용 커버: 썸네일 + 제목. iframe 은 CSS 로 숨겨 편집 중엔 로드하지 않음
    const id = EmbedCommands.idOf(block);
    const cover = document.createElement('div');
    cover.className = 'jm-embed-cover';
    cover.title = '재생은 미리보기에서';
    if (id) cover.style.backgroundImage = `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
    cover.innerHTML = '<span class="jm-embed-play" aria-hidden="true"></span><div class="jm-embed-info"><div class="jm-embed-name">YouTube 동영상</div><div class="jm-embed-author"></div></div>';
    if (id) {
      EmbedCommands.fetchInfo(id).then((info) => {
        if (!info) return;
        cover.querySelector('.jm-embed-name').textContent = info.title;
        cover.querySelector('.jm-embed-author').textContent = info.author;
        title.textContent = `YouTube · ${info.title}`;
      });
    }

    layer.append(header, block);
    block.appendChild(cover);
    this.editor.blockDrag?.makeDraggable(handle, layer);
    return layer;
  }

  #delete(layer) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    layer.replaceWith(p);
    this.sel.placeCursor(p, false);
    this.editor.commit();
  }

  /** 저장용 HTML 에서 레이어·커버 제거 */
  static unwrapHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(`.${EMBED_LAYER_CLASS}`).forEach((layer) => {
      const block = layer.querySelector('div[data-type="youtube"]');
      if (!block) { layer.remove(); return; }
      block.querySelector('.jm-embed-cover')?.remove();
      layer.replaceWith(block);
    });
    return tpl.innerHTML;
  }

  /** 블록의 동영상 ID */
  static idOf(block) {
    const m = block.querySelector('iframe')?.getAttribute('src')?.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /**
   * YouTube oEmbed 로 제목·채널명 조회 (CORS 허용). 실패하면 null. 결과는 메모리 캐시
   * @returns {Promise<{title: string, author: string}|null>}
   */
  static async fetchInfo(id) {
    EmbedCommands._cache ||= new Map();
    if (EmbedCommands._cache.has(id)) return EmbedCommands._cache.get(id);
    const p = (async () => {
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
        if (!res.ok) return null;
        const j = await res.json();
        return { title: j.title || '', author: j.author_name || '' };
      } catch { return null; }
    })();
    EmbedCommands._cache.set(id, p);
    return p;
  }

  /** 블록 드래그 중인지 등 외부에서 판별할 때 */
  static isBlockDrag(e) { return BlockDrag.isBlockDrag(e); }
}
