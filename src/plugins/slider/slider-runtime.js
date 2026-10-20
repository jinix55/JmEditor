/**
 * slider-runtime — 이미지 슬라이드 블록 동작 (에디터·뷰어 공용)
 * - div[data-type="slider"] 안의 img 들을 한 장씩 보여주며 data-interval(ms, 0 이면 수동) 간격으로 자동 전환한다.
 * - 화살표·인디케이터는 런타임이 붙이는 UI(.jm-slider-ui) 로, 저장 HTML 에는 포함되지 않는다.
 * - data-indicator: dots(점) | numbers(현재/전체) | bars(막대) | none
 * - data-indicator-pos: bottom-center(기본) | bottom-left | bottom-right
 * - 마우스를 올리면 자동 전환을 멈추고, 인디케이터 옆 ⏸/▶ 버튼으로 사용자가 직접 멈춤/재생할 수 있다.
 *
 * 뷰어 페이지:
 *   import { initSliders } from '/js/jm-editor/plugins/slider/slider-runtime.js';
 *   initSliders(document.querySelector('.jm-content'));
 */
const UI = 'jm-slider-ui';

/**
 * 슬라이더 하나 초기화. 이미 초기화돼 있으면 새로 고침만 한다
 * @param {HTMLElement} block
 * @returns {{ go: (i:number)=>void, next: ()=>void, prev: ()=>void, refresh: ()=>void, destroy: ()=>void, index: ()=>number }}
 */
export function initSlider(block) {
  if (block._slider) { block._slider.refresh(); return block._slider; }

  let index = 0, timer = null, paused = false, stopped = false; // paused: 호버, stopped: 사용자가 멈춤
  const imgs = () => Array.from(block.querySelectorAll(':scope > img'));

  // UI: 화살표 + 점
  const prev = document.createElement('button');
  prev.type = 'button'; prev.className = `${UI} jm-slider-arrow jm-slider-prev`; prev.setAttribute('aria-label', '이전'); prev.innerHTML = '&#10094;';
  const next = document.createElement('button');
  next.type = 'button'; next.className = `${UI} jm-slider-arrow jm-slider-next`; next.setAttribute('aria-label', '다음'); next.innerHTML = '&#10095;';
  const dots = document.createElement('div');
  dots.className = `${UI} jm-slider-dots`;
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'jm-slider-toggle'; toggle.setAttribute('aria-label', '자동 전환 멈춤/재생');
  toggle.addEventListener('mousedown', (e) => e.stopPropagation());
  toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stopped = !stopped; renderToggle(); start(); });
  const renderToggle = () => {
    const auto = interval() > 0 && imgs().length > 1;
    toggle.hidden = !auto;
    toggle.innerHTML = stopped ? '&#9654;' : '&#10074;&#10074;';
    toggle.title = stopped ? '자동 전환 재생' : '자동 전환 멈춤';
  };
  [prev, next, dots].forEach((el) => el.addEventListener('mousedown', (e) => e.stopPropagation()));
  prev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.prev(); });
  next.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.next(); });
  block.append(prev, next, dots);

  const render = () => {
    const list = imgs();
    if (!list.length) { index = 0; dots.innerHTML = ''; return; }
    index = ((index % list.length) + list.length) % list.length;
    list.forEach((img, i) => img.classList.toggle('is-current', i === index));
    dots.innerHTML = '';
    const kind = block.dataset.indicator || 'dots';
    dots.className = `${UI} jm-slider-dots jm-slider-ind-${kind} jm-slider-pos-${block.dataset.indicatorPos || 'bottom-center'}`;
    if (kind === 'numbers') {
      const n = document.createElement('span');
      n.className = 'jm-slider-num';
      n.textContent = `${index + 1} / ${list.length}`;
      dots.appendChild(n);
    } else if (kind !== 'none') {
      list.forEach((_, i) => {
        const d = document.createElement('button');
        d.type = 'button'; d.className = (kind === 'bars' ? 'jm-slider-bar' : 'jm-slider-dot') + (i === index ? ' is-current' : ''); d.setAttribute('aria-label', `${i + 1}번`);
        d.addEventListener('mousedown', (e) => e.stopPropagation());
        d.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.go(i); });
        dots.appendChild(d);
      });
    }
    dots.appendChild(toggle); // 인디케이터 옆에 멈춤/재생
    renderToggle();
    const single = list.length < 2;
    prev.hidden = single; next.hidden = single;
    dots.hidden = single || (kind === 'none' && toggle.hidden);
  };

  const interval = () => Math.max(0, parseInt(block.dataset.interval, 10) || 0);
  const start = () => {
    stop();
    const ms = interval();
    if (ms > 0 && imgs().length > 1 && !stopped) timer = setInterval(() => { if (!paused) api.next(); }, ms);
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const onEnter = () => { paused = true; };
  const onLeave = () => { paused = false; };
  block.addEventListener('mouseenter', onEnter);
  block.addEventListener('mouseleave', onLeave);

  const api = {
    go: (i) => { index = i; render(); start(); },
    next: () => api.go(index + 1),
    prev: () => api.go(index - 1),
    index: () => index,
    refresh: () => { render(); start(); },
    destroy: () => {
      stop();
      block.removeEventListener('mouseenter', onEnter);
      block.removeEventListener('mouseleave', onLeave);
      block.querySelectorAll(`.${UI}`).forEach((el) => el.remove());
      imgs().forEach((img) => img.classList.remove('is-current'));
      delete block._slider;
    },
  };
  block._slider = api;
  render();
  start();
  return api;
}

/** root 아래 모든 슬라이드 블록 초기화 */
export function initSliders(root = document) {
  root.querySelectorAll('div[data-type="slider"]').forEach(initSlider);
}

/** 저장용: 런타임 UI 와 상태 클래스 제거 (문자열 HTML) */
export function stripSliderUI(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll(`.${UI}`).forEach((el) => el.remove());
  tpl.content.querySelectorAll('div[data-type="slider"] > img').forEach((img) => { img.classList.remove('is-current'); if (!img.className) img.removeAttribute('class'); });
  return tpl.innerHTML;
}
