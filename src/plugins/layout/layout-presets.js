/**
 * layout-presets — 이미지+글 배치 블록의 배치 정의 (에디터·Sanitizer 공용)
 *
 * - preset(서식 종류) → variant(이미지 위치) → cells: 칸 역할 목록. 배열 순서가 곧 저장(DOM) 순서이자 휴대폰 세로 쌓기 순서다.
 * - 역할 이름이 'img' 로 시작하면 이미지 칸, 나머지는 글 칸. 배치를 바꿀 때 같은 역할끼리 내용이 이동한다.
 * - icon: 배치 아이콘용 칸 모양 (2칸은 2자, 4분할은 왼쪽 위·오른쪽 위·왼쪽 아래·오른쪽 아래 4자 / i = 이미지, t = 글)
 * - 화면 배치(어느 칸이 어디)는 jm-editor.css 의 preset·variant 별 grid 규칙이 정한다.
 * - 서버 HtmlSanitizer.java 의 LAYOUT_CELLS 와 같아야 한다.
 */
export const LAYOUT_PRESETS = Object.freeze({
  side: {
    label: '이미지 | 글',
    variants: {
      left: { label: '이미지 왼쪽', icon: 'it', cells: ['img', 'text'] },
      right: { label: '이미지 오른쪽', icon: 'ti', cells: ['text', 'img'] },
    },
  },
  one: {
    label: '이미지 1장 + 글',
    variants: {
      tl: { label: '이미지 왼쪽 위', icon: 'ittt', cells: ['img', 'near', 'wide'] },
      tr: { label: '이미지 오른쪽 위', icon: 'titt', cells: ['near', 'img', 'wide'] },
      bl: { label: '이미지 왼쪽 아래', icon: 'ttit', cells: ['wide', 'img', 'near'] },
      br: { label: '이미지 오른쪽 아래', icon: 'ttti', cells: ['wide', 'near', 'img'] },
    },
  },
  diagonal: {
    label: '대각선 이미지 2장 + 글',
    variants: {
      'tl-br': { label: '왼쪽 위 + 오른쪽 아래', icon: 'itti', cells: ['img-top', 'text-top', 'text-bottom', 'img-bottom'] },
      'tr-bl': { label: '오른쪽 위 + 왼쪽 아래', icon: 'tiit', cells: ['text-top', 'img-top', 'img-bottom', 'text-bottom'] },
    },
  },
  pair: {
    label: '이미지 2장 나란히 + 글',
    variants: {
      top: { label: '이미지 위', icon: 'iitt', cells: ['img-left', 'text-left', 'img-right', 'text-right'] },
      bottom: { label: '이미지 아래', icon: 'ttii', cells: ['text-left', 'img-left', 'text-right', 'img-right'] },
    },
  },
});

/** 좌우 칸 폭(왼쪽 열 %) 범위·단위·기본값 */
export const SPLIT = Object.freeze({ min: 20, max: 80, step: 5, default: 50 });

/** 역할이 이미지 칸인지 */
export const isImageRole = (role) => role.startsWith('img');

/**
 * preset·variant 를 허용 값으로 맞춘다 (없거나 잘못되면 기본값)
 * @param {string} preset
 * @param {string} variant
 * @returns {{ preset: string, variant: string }}
 */
export function normalizeLayout(preset, variant) {
  const p = LAYOUT_PRESETS[preset] ? preset : 'side';
  const variants = LAYOUT_PRESETS[p].variants;
  return { preset: p, variant: variants[variant] ? variant : Object.keys(variants)[0] };
}

/**
 * split 값 검사: 허용 범위·단위면 숫자, 아니면 null
 * @param {string|number|null} value
 */
export function normalizeSplit(value) {
  const n = parseInt(value, 10);
  return n >= SPLIT.min && n <= SPLIT.max && n % SPLIT.step === 0 ? n : null;
}

/** variant 의 칸 역할 목록 */
export function cellsOf(preset, variant) {
  return LAYOUT_PRESETS[preset].variants[variant].cells;
}
