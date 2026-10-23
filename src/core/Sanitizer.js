/**
 * Sanitizer
 * - 외부에서 들어오는 HTML(붙여넣기, setHTML)을 허용 태그/속성만 남기고 정리한다.
 * - XSS 1차 방어. 서버 저장 시에도 반드시 별도 sanitize(jsoup 등) 할 것.
 */
import { normalizeLayout, normalizeSplit, cellsOf, isImageRole } from '../plugins/layout/layout-presets.js';
import { SHAPE_VALUES, COLOR_VALUES, ICON_VALUES, normalizeHex, toneOf } from '../plugins/buttons/button-theme.js';

/** 허용 태그와 각 태그에서 허용하는 속성 */
const ALLOWED = {
  p: ['style'], br: [], strong: [], em: [], u: [], s: [],
  h1: ['style'], h2: ['style'], h3: ['style'],
  ul: ['style'], ol: ['style', 'start'], li: ['style'],
  blockquote: ['style', 'data-style'], // 인용 스타일: box·quote (세로선은 기본값이라 속성 없음)
  a: ['href', 'target', 'rel', 'data-role', 'data-style', 'data-size', 'data-color', 'data-tone', 'data-icon', 'data-icon-pos'], // data-role=button → 버튼 모양 링크 (값 검사는 #cleanButton)
  img: ['src', 'alt', 'width', 'height', 'data-float', 'style'], // 글 감싸기: 방향 + 폭(%) — 값 검사는 #cleanImage
  table: ['style', 'data-border'], tbody: [], thead: [], colgroup: [], col: ['style'],
  tr: ['style'], td: ['style', 'colspan', 'rowspan'], th: ['style', 'colspan', 'rowspan'],
  span: ['style'],
};

/** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;
/** style 속성에서 허용하는 CSS 속성과 값 검사 */
const ALLOWED_STYLE = {
  'color': (v) => SAFE_COLOR.test(v),
  'background-color': (v) => SAFE_COLOR.test(v),
  'text-align': (v) => /^(left|center|right|justify)$/i.test(v),
  'vertical-align': (v) => /^(top|middle|bottom)$/i.test(v),
  'width': (v) => /^\d+(\.\d+)?(px|%)$/i.test(v) || v === 'auto',
  'height': (v) => /^\d+(\.\d+)?px$/i.test(v),
  'font-size': (v) => { const m = v.match(/^(\d+)px$/i); return !!m && +m[1] >= 8 && +m[1] <= 96; },
  'list-style-type': (v) => /^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|hangul|hangul-consonant|none)$/i.test(v),
};

/** 태그 이름 치환 (레거시/외부 태그 → 표준 태그) */
const TAG_ALIAS = { b: 'strong', i: 'em', strike: 's', div: 'p' };

/** src 에 허용하는 주소: http(s)·/ 경로·이미지 data:(base64). img 안의 svg 는 스크립트가 실행되지 않아 허용 (서버 HtmlSanitizer 와 같은 규칙) */
const SAFE_URL = /^(https?:|\/|data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/i;
/** href(링크)에 허용하는 주소: http(s)·mailto·tel·# 와 / 로 시작하는 내부 경로 (// 와 /\ 같은 외부 주소 우회는 제외) */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|#|\/(?![/\\]))/i;

export class Sanitizer {
  /**
   * HTML 문자열을 정리하여 반환
   * @param {string} html
   * @returns {string}
   */
  static clean(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const frag = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) return; // 최상위 공백 텍스트(블록 사이 줄바꿈) 제거
      const r = Sanitizer.#cleanNode(n);
      if (r) frag.appendChild(r);
    });
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    return wrap.innerHTML;
  }

  /**
   * 링크 주소가 허용 형식인지 (javascript:·data: 등 차단, 제어 문자 포함 시 차단)
   * @param {string} url
   * @returns {boolean}
   */
  static isSafeHref(url) {
    const v = String(url ?? '').trim();
    return !!v && !/[\u0000-\u001f\u007f]/.test(v) && SAFE_HREF.test(v);
  }

  /**
   * 사용자가 입력한 링크 주소 정리: 허용 형식이면 그대로, 「example.com/…」 처럼 도메인만 쓰면 https:// 를 붙이고,
   * 그 밖(javascript: 등)은 null
   * @param {string} url
   * @returns {string|null}
   */
  static normalizeHref(url) {
    const v = String(url ?? '').trim();
    if (Sanitizer.isSafeHref(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+([/?#:].*)?$/.test(v) && !/[\u0000-\u001f\u007f\s]/.test(v)) return `https://${v}`;
    return null;
  }

  /**
   * style 문자열에서 color / background-color 만 남긴다
   * @param {string} style
   * @returns {string}
   */
  static cleanStyle(style) {
    return style.split(';')
      .map((d) => d.split(':').map((x) => x.trim()))
      .filter(([k, v]) => k && v && ALLOWED_STYLE[k.toLowerCase()]?.(v))
      .map(([k, v]) => `${k.toLowerCase()}: ${v}`)
      .join('; ');
  }

  /**
   * 노드 단위 재귀 정리
   * - 허용되지 않은 태그는 제거하되 자식 텍스트는 유지(언래핑)
   * - script/style 등 위험 태그는 자식까지 통째로 제거
   */
  static #cleanNode(node) {
    // 텍스트 노드는 그대로
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    let tag = node.tagName.toLowerCase();
    if (['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link'].includes(tag)) return null;

    // 이미지 갤러리 블록: div[data-type=gallery] 만 예외 허용, 자식은 img 만
    if (tag === 'div' && node.getAttribute('data-type') === 'gallery') {
      const g = document.createElement('div');
      g.setAttribute('data-type', 'gallery');
      // data-cols 는 예전 cover 갤러리 호환용 — 있을 때만 남긴다 (새 갤러리는 쓰지 않음)
      const cols = parseInt(node.getAttribute('data-cols'), 10);
      if (cols >= 1 && cols <= 6) g.setAttribute('data-cols', String(cols));
      if (node.getAttribute('data-auto') === '1') g.setAttribute('data-auto', '1');
      const layout = node.getAttribute('data-layout');
      if (layout === 'justify' || layout === 'cover') g.setAttribute('data-layout', layout);
      const align = node.getAttribute('data-align');
      if (align === 'center' || align === 'right') g.setAttribute('data-align', align);
      // 제목(선택): 첫 번째 p[data-role=title]. 비어 있으면 저장하지 않음
      const title = node.querySelector(':scope > p[data-role="title"]');
      if (title && title.textContent.trim()) {
        const t = Sanitizer.#cleanNode(title);
        if (t && t.nodeType === Node.ELEMENT_NODE) { t.setAttribute('data-role', 'title'); g.appendChild(t); }
      }
      node.querySelectorAll('img').forEach((img) => {
        const r = Sanitizer.#cleanNode(img);
        if (r) g.appendChild(r);
      });
      return g;
    }

    // 슬라이드 블록: div[data-type=slider] 안에는 제목 p 와 img 만
    if (tag === 'div' && node.getAttribute('data-type') === 'slider') {
      const b = document.createElement('div');
      b.setAttribute('data-type', 'slider');
      const iv = parseInt(node.getAttribute('data-interval'), 10);
      b.setAttribute('data-interval', String(iv >= 0 && iv <= 60000 ? iv : 3000));
      const ratio = node.getAttribute('data-ratio');
      b.setAttribute('data-ratio', ['16:9', '4:3', '1:1', '21:9'].includes(ratio) ? ratio : '16:9');
      const ind = node.getAttribute('data-indicator');
      b.setAttribute('data-indicator', ['dots', 'numbers', 'bars', 'none'].includes(ind) ? ind : 'dots');
      const pos = node.getAttribute('data-indicator-pos');
      b.setAttribute('data-indicator-pos', ['bottom-center', 'bottom-left', 'bottom-right'].includes(pos) ? pos : 'bottom-center');
      const w = node.getAttribute('data-width');
      b.setAttribute('data-width', ['100', '75', '50'].includes(w) ? w : '100');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      const title = node.querySelector(':scope > p[data-role="title"]');
      if (title && title.textContent.trim()) {
        const t = Sanitizer.#cleanNode(title);
        if (t && t.nodeType === Node.ELEMENT_NODE) { t.setAttribute('data-role', 'title'); b.appendChild(t); }
      }
      node.querySelectorAll(':scope > img').forEach((img) => { const r = Sanitizer.#cleanNode(img); if (r) b.appendChild(r); });
      return b;
    }

    // 버튼 그룹 블록: div[data-type=buttons] 안에는 a[data-role=button] 만
    if (tag === 'div' && node.getAttribute('data-type') === 'buttons') {
      const b = document.createElement('div');
      b.setAttribute('data-type', 'buttons');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      node.querySelectorAll(':scope > a').forEach((a) => {
        const r = Sanitizer.#cleanNode(a);
        if (r && r.nodeType === Node.ELEMENT_NODE && r.tagName === 'A') { r.setAttribute('data-role', 'button'); if (!r.getAttribute('data-style')) r.setAttribute('data-style', 'primary'); b.appendChild(r); }
      });
      return b.childNodes.length ? b : null;
    }

    // 유튜브 블록: div[data-type=youtube] + iframe(src 는 youtube embed 주소만)
    if (tag === 'div' && node.getAttribute('data-type') === 'youtube') {
      const iframe = node.querySelector('iframe');
      const m = iframe?.getAttribute('src')?.match(/^https:\/\/www\.(?:youtube|youtube-nocookie)\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/);
      if (!m) return null;
      const b = document.createElement('div');
      b.setAttribute('data-type', 'youtube');
      const w = node.getAttribute('data-width');
      b.setAttribute('data-width', ['100', '75', '50'].includes(w) ? w : '100');
      const al = node.getAttribute('data-align');
      b.setAttribute('data-align', ['left', 'center', 'right'].includes(al) ? al : 'center');
      const f = document.createElement('iframe');
      f.setAttribute('src', `https://www.youtube-nocookie.com/embed/${m[1]}`);
      f.setAttribute('title', 'YouTube video');
      f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      f.setAttribute('allowfullscreen', '');
      b.appendChild(f);
      return b;
    }

    // 이미지+글 배치 블록: div[data-type=layout] 안에는 배치 순서대로 이미지 칸·글 칸만
    if (tag === 'div' && node.getAttribute('data-type') === 'layout') return Sanitizer.#cleanLayout(node);

    // 카카오 지도 블록: 속성만 (안의 내용은 런타임이 그린 것이라 버림)
    if (tag === 'div' && node.getAttribute('data-type') === 'map') return Sanitizer.#cleanMap(node);

    tag = TAG_ALIAS[tag] || tag;

    // 허용되지 않은 태그 → 자식만 모아서 반환(언래핑)
    if (!ALLOWED[tag]) {
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach((c) => {
        const r = Sanitizer.#cleanNode(c);
        if (r) frag.appendChild(r);
      });
      return frag;
    }

    const el = document.createElement(tag);
    // 허용 속성만 복사, URL 프로토콜 검사, style 은 색상 속성만
    ALLOWED[tag].forEach((attr) => {
      const v = node.getAttribute(attr);
      if (v == null) return;
      if (attr === 'href' && !Sanitizer.isSafeHref(v)) return;
      if (attr === 'src' && !SAFE_URL.test(v.trim())) return;
      if (attr === 'start' && !/^\d{1,4}$/.test(v)) return;
      if (attr === 'style') {
        const clean = Sanitizer.cleanStyle(v);
        if (clean) el.setAttribute('style', clean);
        return;
      }
      el.setAttribute(attr, v);
    });
    // 스타일이 전부 제거된 span 은 의미가 없으므로 언래핑
    if (tag === 'span' && !el.getAttribute('style')) {
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach((c) => {
        const r = Sanitizer.#cleanNode(c);
        if (r) frag.appendChild(r);
      });
      return frag;
    }
    // 링크는 새창 + noopener 강제. 버튼 링크 속성은 허용 값만
    if (tag === 'a') {
      el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer');
      if (el.getAttribute('data-role') !== 'button') ['data-role', 'data-style', 'data-size', 'data-color', 'data-tone', 'data-icon', 'data-icon-pos'].forEach((x) => el.removeAttribute(x));
      else Sanitizer.#cleanButton(el, node.getAttribute('style'));
    }
    if (tag === 'img') Sanitizer.#cleanImage(el);
    if (tag === 'blockquote' && !['box', 'quote'].includes(el.getAttribute('data-style'))) el.removeAttribute('data-style');

    Array.from(node.childNodes).forEach((c) => {
      const r = Sanitizer.#cleanNode(c);
      if (r) el.appendChild(r);
    });
    return el;
  }

  /**
   * 버튼 링크 속성 정리: 모양·테마 색·아이콘은 허용 값만, 직접 색은 style 의 --jm-btn(#hex) 만 남기고
   * data-tone 은 그 색의 밝기로 다시 계산 (서버 HtmlSanitizer 와 같은 규칙)
   * @param {HTMLAnchorElement} el 새로 만든 a
   * @param {string|null} rawStyle 원본 style 속성
   */
  static #cleanButton(el, rawStyle) {
    if (!SHAPE_VALUES.includes(el.getAttribute('data-style'))) el.setAttribute('data-style', 'primary');
    if (!['sm', 'lg'].includes(el.getAttribute('data-size'))) el.removeAttribute('data-size');
    if (!COLOR_VALUES.includes(el.getAttribute('data-color')) || el.getAttribute('data-color') === 'blue') el.removeAttribute('data-color');
    if (!ICON_VALUES.includes(el.getAttribute('data-icon'))) el.removeAttribute('data-icon');
    if (!el.hasAttribute('data-icon') || el.getAttribute('data-icon-pos') !== 'right') el.removeAttribute('data-icon-pos');
    el.removeAttribute('data-tone');
    el.removeAttribute('style');
    const m = (rawStyle || '').match(/(?:^|;)\s*--jm-btn\s*:\s*([^;]+)/i);
    const hex = m && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(m[1].trim()) ? normalizeHex(m[1]) : null;
    if (hex) {
      el.removeAttribute('data-color'); // 직접 색이 테마 색보다 우선
      el.setAttribute('style', `--jm-btn: ${hex}`);
      if (toneOf(hex) === 'light') el.setAttribute('data-tone', 'light');
    }
  }

  /** 글 감싸기 이미지: data-float 는 left/right, style 은 width 10~100% 만 */
  static #cleanImage(img) {
    if (!['left', 'right'].includes(img.getAttribute('data-float'))) img.removeAttribute('data-float');
    const m = (img.getAttribute('style') || '').match(/(?:^|;)\s*width:\s*(\d{1,3})%/);
    const w = m ? +m[1] : 0;
    if (w >= 10 && w <= 100) img.setAttribute('style', `width: ${w}%`);
    else img.removeAttribute('style');
  }

  /**
   * 카카오 지도(퍼가기) 블록: timestamp(숫자)·key(영문·숫자)·높이(300|400|500)·장소명(100자)만 남긴다.
   * 값이 없으면 빈 블록(에디터에서 코드 입력 대기) — 조회 화면에서는 CSS 로 숨김
   * @param {Element} node
   * @returns {HTMLElement}
   */
  static #cleanMap(node) {
    const b = document.createElement('div');
    b.setAttribute('data-type', 'map');
    b.setAttribute('data-provider', 'kakao-roughmap');
    const ts = node.getAttribute('data-timestamp') || '';
    const key = node.getAttribute('data-key') || '';
    if (/^\d{10,16}$/.test(ts) && /^[A-Za-z0-9]{2,32}$/.test(key)) {
      b.setAttribute('data-timestamp', ts);
      b.setAttribute('data-key', key);
    }
    const h = node.getAttribute('data-height');
    b.setAttribute('data-height', ['300', '400', '500'].includes(h) ? h : '400');
    const title = (node.getAttribute('data-title') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (title) b.setAttribute('data-title', title);
    return b;
  }

  /**
   * 배치 블록 정리: preset·variant 는 허용 값(아니면 기본값), split 은 20~80 의 5 배수만.
   * 칸은 variant 의 저장 순서대로 다시 세우고, 모자라면 빈 칸을 채우고 넘치면 버린다.
   * 이미지 칸은 img 1장만, 글 칸에는 표·이미지·iframe·블록(div)을 넣지 않는다. (서버 HtmlSanitizer 와 같은 규칙)
   */
  static #cleanLayout(node) {
    const { preset, variant } = normalizeLayout(node.getAttribute('data-preset'), node.getAttribute('data-variant'));
    const box = document.createElement('div');
    box.setAttribute('data-type', 'layout');
    box.setAttribute('data-preset', preset);
    box.setAttribute('data-variant', variant);
    const split = normalizeSplit(node.getAttribute('data-split'));
    if (split != null) box.setAttribute('data-split', String(split));

    const cells = Array.from(node.children).filter((c) => c.tagName === 'DIV');
    const images = cells.filter((c) => c.getAttribute('data-cell') === 'image');
    const texts = cells.filter((c) => c.getAttribute('data-cell') === 'text');
    cellsOf(preset, variant).forEach((role) => {
      const isImg = isImageRole(role);
      const src = isImg ? images.shift() : texts.shift();
      const cell = document.createElement('div');
      cell.setAttribute('data-cell', isImg ? 'image' : 'text');
      if (src && isImg) {
        const img = src.querySelector('img');
        const r = img && Sanitizer.#cleanNode(img);
        if (r) cell.appendChild(r);
      } else if (src) {
        Array.from(src.childNodes).forEach((c) => { const r = Sanitizer.#cleanNode(c); if (r) cell.appendChild(r); });
        cell.querySelectorAll('table, img, iframe, div').forEach((el) => el.remove());
      }
      box.appendChild(cell);
    });
    return box;
  }
}
