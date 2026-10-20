/**
 * ColorPicker
 * - 견본(swatch) 격자 + 임의 색 선택(HSV 팔레트·색상 띠·HEX 입력) + 스포이드 + 「없음(해제)」.
 * - 스포이드: window.EyeDropper(Chrome/Edge) 가 있으면 화면 어디서나 픽셀 색을 추출,
 *   없으면(Firefox/Safari) 페이지 요소를 클릭해 계산된 글자색/배경색을 가져오는 대체 모드.
 * - 툴바 글자색/배경색 버튼과 표 셀 배경색 메뉴에서 공용으로 쓴다.
 * - open(x, y, onPick) / openAt(anchorEl, onPick) 으로 열고, 선택 시 onPick(color|null) 호출.
 */
/** 스포이드 아이콘 (자체 제작 SVG) */
const EYEDROPPER_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

const DEFAULT_SWATCHES = [
  '#000000', '#424242', '#757575', '#bdbdbd', '#e0e0e0', '#ffffff',
  '#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2',
  '#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#bbdefb', '#e1bee7',
];

export class ColorPicker {
  /**
   * @param {object} [options]
   * @param {string[]} [options.swatches]
   * @param {'color'|'background'} [options.sampleMode='color'] 대체 스포이드가 글자색/배경색 중 무엇을 읽을지 기본값
   */
  constructor({ swatches = DEFAULT_SWATCHES, sampleMode = 'color' } = {}) {
    this.onPick = null;
    this.sampleMode = sampleMode;
    this.hsv = { h: 0, s: 1, v: 1 }; // 현재 팔레트 상태
    this.dragging = null;            // 'sv' | 'hue'

    this.el = document.createElement('div');
    this.el.className = 'jm-colorpicker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');

    this.#buildSwatches(swatches);
    this.#buildCustom();
    this.#buildFoot();
    document.body.appendChild(this.el);

    this.onDocDown = (e) => { if (!this.el.contains(e.target)) this.close(); };
    this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
  }

  // ───────────── UI 구성 ─────────────

  /** 견본 격자 */
  #buildSwatches(swatches) {
    const grid = document.createElement('div');
    grid.className = 'jm-colorpicker-grid';
    swatches.forEach((color) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jm-colorpicker-swatch';
      b.style.background = color;
      b.title = color;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // 에디터 선택 유지
      b.addEventListener('click', () => this.#pick(color));
      grid.appendChild(b);
    });
    this.el.appendChild(grid);
  }

  /** 임의 색: SV 팔레트 + 색상(hue) 띠 + HEX 입력 */
  #buildCustom() {
    const wrap = document.createElement('div');
    wrap.className = 'jm-colorpicker-custom';

    // 채도/명도 팔레트
    this.sv = document.createElement('canvas');
    this.sv.className = 'jm-colorpicker-sv';
    this.sv.width = 160; this.sv.height = 110;
    this.svCursor = document.createElement('div');
    this.svCursor.className = 'jm-colorpicker-cursor';
    const svBox = document.createElement('div');
    svBox.className = 'jm-colorpicker-svbox';
    svBox.append(this.sv, this.svCursor);

    // 색상 띠
    this.hue = document.createElement('canvas');
    this.hue.className = 'jm-colorpicker-hue';
    this.hue.width = 160; this.hue.height = 12;
    this.hueCursor = document.createElement('div');
    this.hueCursor.className = 'jm-colorpicker-huecursor';
    const hueBox = document.createElement('div');
    hueBox.className = 'jm-colorpicker-huebox';
    hueBox.append(this.hue, this.hueCursor);

    // 미리보기 + HEX 입력 + 적용
    const row = document.createElement('div');
    row.className = 'jm-colorpicker-row';
    this.preview = document.createElement('span');
    this.preview.className = 'jm-colorpicker-preview';
    this.hex = document.createElement('input');
    this.hex.type = 'text';
    this.hex.className = 'jm-colorpicker-hex';
    this.hex.maxLength = 7;
    this.hex.placeholder = '#rrggbb';
    this.hex.setAttribute('aria-label', 'HEX 색상');
    this.hex.addEventListener('mousedown', (e) => e.stopPropagation());
    this.hex.addEventListener('input', () => {
      const v = this.hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) { this.hsv = ColorPicker.hexToHsv(v); this.#render(false); }
    });
    this.hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.#applyCustom(); } });
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'jm-btn jm-colorpicker-apply';
    apply.textContent = '적용';
    apply.addEventListener('mousedown', (e) => e.preventDefault());
    apply.addEventListener('click', () => this.#applyCustom());
    row.append(this.preview, this.hex, apply);

    wrap.append(svBox, hueBox, row);
    this.el.appendChild(wrap);

    // 드래그 처리 (SV / Hue 공통)
    const start = (target) => (e) => {
      e.preventDefault();
      this.dragging = target;
      this.#drag(e);
      const move = (ev) => this.#drag(ev);
      const up = () => { this.dragging = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    svBox.addEventListener('pointerdown', start('sv'));
    hueBox.addEventListener('pointerdown', start('hue'));

    this.#drawHue();
  }

  /** 하단: 스포이드 + 없음 */
  #buildFoot() {
    const foot = document.createElement('div');
    foot.className = 'jm-colorpicker-foot';

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'jm-btn jm-colorpicker-eye';
    eye.innerHTML = EYEDROPPER_ICON;
    eye.setAttribute('aria-label', '스포이드');
    eye.title = window.EyeDropper ? '화면의 색을 추출' : '페이지 요소를 클릭해 색을 가져옴';
    eye.addEventListener('mousedown', (e) => e.preventDefault());
    eye.addEventListener('click', () => this.#eyedrop());

    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'jm-btn';
    none.textContent = '없음';
    none.addEventListener('mousedown', (e) => e.preventDefault());
    none.addEventListener('click', () => this.#pick(null));

    foot.append(eye, none);
    this.el.appendChild(foot);
  }

  // ───────────── 열기/닫기 ─────────────

  /**
   * @param {number} x
   * @param {number} y
   * @param {(color: string|null) => void} onPick
   * @param {object} [opts]
   * @param {string} [opts.current] 현재 색 (팔레트 초기값)
   * @param {'color'|'background'} [opts.sampleMode] 대체 스포이드 모드
   */
  open(x, y, onPick, opts = {}) {
    this.onPick = onPick;
    if (opts.sampleMode) this.sampleMode = opts.sampleMode;
    const cur = ColorPicker.toHex(opts.current);
    if (cur) this.hsv = ColorPicker.hexToHsv(cur);
    this.#render(true);

    this.el.hidden = false;
    const { innerWidth: w, innerHeight: h } = window;
    this.el.style.left = `${Math.min(x, w - this.el.offsetWidth - 8)}px`;
    this.el.style.top = `${Math.min(y, h - this.el.offsetHeight - 8)}px`;
    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('keydown', this.onKey, true);
  }

  openAt(anchorEl, onPick, opts) {
    const r = anchorEl.getBoundingClientRect();
    this.open(r.left, r.bottom + 4, onPick, opts);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('keydown', this.onKey, true);
  }

  destroy() { this.close(); this.el.remove(); }

  #pick(color) { this.close(); this.onPick?.(color); }
  #applyCustom() { this.#pick(ColorPicker.hsvToHex(this.hsv)); }

  // ───────────── 팔레트 렌더링 ─────────────

  /** 드래그 좌표 → hsv */
  #drag(e) {
    if (this.dragging === 'sv') {
      const r = this.sv.getBoundingClientRect();
      this.hsv.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      this.hsv.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    } else if (this.dragging === 'hue') {
      const r = this.hue.getBoundingClientRect();
      this.hsv.h = Math.min(359, Math.max(0, ((e.clientX - r.left) / r.width) * 360));
    }
    this.#render(true);
  }

  /** 색상 띠는 고정이므로 1회만 그림 */
  #drawHue() {
    const ctx = this.hue.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, this.hue.width, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.hue.width, this.hue.height);
  }

  /** SV 팔레트·커서·미리보기·HEX 갱신 */
  #render(updateHex) {
    const { h, s, v } = this.hsv;
    const ctx = this.sv.getContext('2d');
    ctx.fillStyle = `hsl(${h}, 100%, 50%)`;
    ctx.fillRect(0, 0, this.sv.width, this.sv.height);
    const white = ctx.createLinearGradient(0, 0, this.sv.width, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)'); white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.fillRect(0, 0, this.sv.width, this.sv.height);
    const black = ctx.createLinearGradient(0, 0, 0, this.sv.height);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black; ctx.fillRect(0, 0, this.sv.width, this.sv.height);

    this.svCursor.style.left = `${s * 100}%`;
    this.svCursor.style.top = `${(1 - v) * 100}%`;
    this.hueCursor.style.left = `${(h / 360) * 100}%`;

    const hex = ColorPicker.hsvToHex(this.hsv);
    this.preview.style.background = hex;
    if (updateHex) this.hex.value = hex;
  }

  // ───────────── 스포이드 ─────────────

  async #eyedrop() {
    if (window.EyeDropper) {
      // 네이티브: 화면 아무 곳의 픽셀 색
      this.close();
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        this.onPick?.(sRGBHex);
      } catch { /* 사용자가 취소(Esc) */ }
      return;
    }
    // 대체: 페이지 요소를 한 번 클릭해 계산된 색을 가져옴
    this.close();
    const mode = this.sampleMode;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';
    const finish = (color) => {
      document.body.style.cursor = prevCursor;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      if (color) this.onPick?.(color);
    };
    const onClick = (e) => {
      e.preventDefault(); e.stopPropagation();
      finish(ColorPicker.sampleElement(e.target, mode));
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  /**
   * 요소의 계산된 색을 HEX 로. background 모드는 투명이면 부모로 올라가며 찾는다.
   * @param {Element} el
   * @param {'color'|'background'} mode
   */
  static sampleElement(el, mode) {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const v = mode === 'background' ? cs.backgroundColor : cs.color;
      const hex = ColorPicker.toHex(v);
      if (hex) return hex;
      if (mode !== 'background') break;
      n = n.parentElement;
    }
    return mode === 'background' ? '#ffffff' : null;
  }

  // ───────────── 색 변환 유틸 ─────────────

  /** 'rgb(…)' / '#abc' / '#aabbcc' → '#aabbcc'. 투명이면 null */
  static toHex(value) {
    if (!value) return null;
    const v = String(value).trim();
    let m = v.match(/^#([0-9a-f]{3})$/i);
    if (m) return '#' + m[1].split('').map((c) => c + c).join('').toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
    if (m) {
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // 완전 투명
      return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
    }
    return null;
  }

  static hsvToHex({ h, s, v }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(5)}${f(3)}${f(1)}`;
  }

  static hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
}
