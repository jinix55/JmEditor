/**
 * Sanitizer
 * - 외부에서 들어오는 HTML(붙여넣기, setHTML)을 허용 태그/속성만 남기고 정리한다.
 * - XSS 1차 방어. 서버 저장 시에도 반드시 별도 sanitize(jsoup 등) 할 것.
 */

/** 허용 태그와 각 태그에서 허용하는 속성 */
const ALLOWED = {
  p: [], br: [], strong: [], em: [], u: [], s: [],
  h1: [], h2: [], h3: [],
  ul: [], ol: [], li: [],
  blockquote: [],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  table: [], tbody: [], thead: [], tr: [], td: ['style', 'colspan', 'rowspan'], th: ['style', 'colspan', 'rowspan'], // 병합은 서식 템플릿으로만 들어옴(UI 편집 미지원)
  span: ['style'],
};

/** style 속성에서 허용하는 CSS 속성 (글자색·배경색만) */
const ALLOWED_STYLE = ['color', 'background-color'];
/** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;

/** 태그 이름 치환 (레거시/외부 태그 → 표준 태그) */
const TAG_ALIAS = { b: 'strong', i: 'em', strike: 's', div: 'p' };

/** href/src 에 허용하는 프로토콜 */
const SAFE_URL = /^(https?:|mailto:|\/|#|data:image\/)/i;

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
      const r = Sanitizer.#cleanNode(n);
      if (r) frag.appendChild(r);
    });
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    return wrap.innerHTML;
  }

  /**
   * style 문자열에서 color / background-color 만 남긴다
   * @param {string} style
   * @returns {string}
   */
  static cleanStyle(style) {
    return style.split(';')
      .map((d) => d.split(':').map((x) => x.trim()))
      .filter(([k, v]) => k && v && ALLOWED_STYLE.includes(k.toLowerCase()) && SAFE_COLOR.test(v))
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
      const cols = parseInt(node.getAttribute('data-cols'), 10);
      g.setAttribute('data-cols', String(cols >= 1 && cols <= 6 ? cols : 3));
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
      if ((attr === 'href' || attr === 'src') && !SAFE_URL.test(v.trim())) return;
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
    // 링크는 새창 + noopener 강제
    if (tag === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }

    Array.from(node.childNodes).forEach((c) => {
      const r = Sanitizer.#cleanNode(c);
      if (r) el.appendChild(r);
    });
    return el;
  }
}
