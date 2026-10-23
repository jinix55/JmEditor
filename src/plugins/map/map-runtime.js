/**
 * map-runtime — 카카오맵 「지도 퍼가기」(약도) 블록을 실제 지도로 그린다 (에디터·미리보기·조회 공용)
 * - 저장 HTML: <div data-type="map" data-provider="kakao-roughmap" data-timestamp="…" data-key="…" data-height="400" data-title="장소명"></div>
 *   스크립트는 저장하지 않고, 이 런타임이 카카오 약도 스크립트를 불러와 그린다. 앱 키가 필요 없다.
 * - 카카오 로더(roughmapLoader.js)는 document.write 로 본 스크립트를 넣으므로, 불러오는 동안만 write 를 가로채 script 요소로 붙인다.
 * - 카카오 쪽은 같은 timestamp 의 지도를 하나만 관리하므로(instances[timestamp]) 같은 지도는 차례로 그린다.
 * - 불러오지 못하면 장소명과 「카카오맵에서 보기」 링크 카드를 대신 보여 준다.
 */

/** 카카오맵이 지금 퍼가기 코드에 넣어 주는 로더 주소 (예전 코드의 ssl.daumcdn.net 로더와 같은 동작) */
const LOADER_URL = 'https://t1.kakaocdn.net/kakaomapweb/roughmap/loader/prod/roughmapLoader.js';
/** 로더가 불러오는 본 스크립트(roughmapLander.js)의 호스트 — 이 호스트만 허용 */
const LANDER_HOST = 't1.kakaocdn.net';
const LOAD_TIMEOUT = 10000;  // 스크립트 로드 제한 시간 (ms)
const RENDER_TIMEOUT = 8000; // 지도 그림 완료 대기 제한 시간 (ms)
/** 그린 결과를 담는 요소 (저장 HTML 에서는 제거) */
export const MAP_CANVAS_CLASS = 'jm-map-canvas';
/** 높이 선택지 (px) */
export const MAP_HEIGHTS = Object.freeze(['300', '400', '500']);
/** 값 형식: timestamp 는 숫자, key 는 영문·숫자 */
export const MAP_TIMESTAMP = /^\d{10,16}$/;
export const MAP_KEY = /^[A-Za-z0-9]{2,32}$/;

let loading = null;            // 로더 Promise (한 번만)
const chains = new Map();      // timestamp → 마지막 그리기 Promise (같은 지도 차례로)

/**
 * 「지도 퍼가기」 코드(HTML)나 timestamp·key 가 든 글에서 값을 뽑는다
 * @param {string} code
 * @returns {{timestamp: string, key: string}|null}
 */
export function parseRoughmap(code) {
  const s = String(code || '');
  const ts = s.match(/["']?timestamp["']?\s*:\s*["']?(\d{10,16})/)?.[1] || s.match(/daumRoughmapContainer(\d{10,16})/)?.[1];
  const key = s.match(/["']?key["']?\s*:\s*["']([A-Za-z0-9]{2,32})["']/)?.[1];
  return ts && key ? { timestamp: ts, key } : null;
}

/**
 * 붙여 넣은 글이 퍼가기 코드 그 자체인지 (본문 전체를 복사했는데 그 안에 코드가 섞인 경우는 제외)
 * @param {string} text
 * @returns {boolean}
 */
export function isRoughmapCode(text) {
  const t = String(text || '').trim();
  return t.length < 3000 && /^(<!--|<div[^>]*daumRoughmapContainer|<script|new\s+daum\.roughmap)/i.test(t) && !!parseRoughmap(t);
}

/** 카카오 약도 스크립트 로드 (이미 있으면 바로) */
export function loadRoughmap() {
  if (window.daum?.roughmap?.Lander) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const origWrite = document.write;
    const hadOwn = Object.prototype.hasOwnProperty.call(document, 'write'); // 다른 코드가 이미 감싸 둔 경우
    // 되돌리기: 우리 hook 이 그대로 있을 때만 (그 사이 다른 코드가 다시 감쌌다면 건드리지 않음)
    const restore = () => {
      if (document.write !== hook) return;
      if (hadOwn) document.write = origWrite; else delete document.write; // 지우면 원래 메서드(prototype)로 돌아감
    };
    const timer = setTimeout(() => { restore(); reject(new Error('지도 스크립트 시간 초과')); }, LOAD_TIMEOUT);
    const done = (err) => { clearTimeout(timer); restore(); if (err) reject(err); else resolve(); };
    // 로더가 쓰는 <script src="…roughmapLander.js"> 를 실제 script 요소로 (카카오 주소일 때만 — 다른 write 는 원래대로)
    // (로더는 페이지 프로토콜을 따라 http 주소를 만들기도 하므로 항상 https 로)
    function hook(...args) {
      const src = String(args[0]).match(/src="(?:https?:)?(\/\/[^"]+\.js)"/)?.[1];
      let url = null;
      try { url = src ? new URL(`https:${src}`) : null; } catch { url = null; }
      if (!url || url.hostname !== LANDER_HOST || !url.pathname.includes('/roughmapLander')) return origWrite.apply(document, args);
      const rm = window.daum?.roughmap;
      if (rm) { rm.url_protocal = 'https:'; rm.URL_KEY_DATA_LOAD_PRE = 'https://t1.kakaocdn.net/roughmap/'; }
      const s = document.createElement('script');
      s.charset = 'UTF-8';
      s.src = url.href;
      s.onload = () => (window.daum?.roughmap?.Lander ? done() : done(new Error('지도 스크립트 오류')));
      s.onerror = () => done(new Error('지도 스크립트를 불러오지 못했습니다'));
      document.head.appendChild(s);
    }
    document.write = hook;
    const l = document.createElement('script');
    l.charset = 'UTF-8';
    l.src = LOADER_URL;
    l.onload = () => { restore(); if (window.daum?.roughmap?.Lander) done(); };
    l.onerror = () => done(new Error('지도 스크립트를 불러오지 못했습니다'));
    document.head.appendChild(l);
  });
  loading.catch(() => { loading = null; }); // 실패하면 다음에 다시 시도
  return loading;
}

/**
 * 블록 하나를 그린다. 값이 없거나 형식이 틀리면 아무것도 그리지 않는다.
 * @param {HTMLElement} block div[data-type=map]
 * @param {{onTitle?: (title: string) => void}} [opts] onTitle: 지도 데이터에서 장소명을 얻었을 때 (에디터가 data-title 채움)
 * @returns {Promise<boolean>} 지도를 그렸으면 true, 대신 카드를 보였거나 그릴 것이 없으면 false
 */
export function renderMap(block, opts = {}) {
  stripMapUI(block);
  const { timestamp: ts, key } = block.dataset;
  if (!MAP_TIMESTAMP.test(ts || '') || !MAP_KEY.test(key || '')) return Promise.resolve(false);
  const canvas = document.createElement('div');
  canvas.className = MAP_CANVAS_CLASS;
  block.appendChild(canvas);
  const prev = chains.get(ts) || Promise.resolve();
  const job = prev.then(() => draw(block, canvas, ts, key, opts)).catch(() => { showFallback(block, canvas); return false; });
  const tail = job.then(() => {}, () => {});
  chains.set(ts, tail);
  tail.then(() => { if (chains.get(ts) === tail) chains.delete(ts); }); // 마지막 그리기가 끝나면 정리
  return job;
}

/** 실제 그리기: 컨테이너에 카카오가 찾는 id 를 잠시 붙여 Lander 를 만들고, 지도가 생길 때까지 기다린다 */
async function draw(block, canvas, ts, key, opts) {
  await loadRoughmap();
  if (!canvas.isConnected) return false; // 그 사이 블록이 바뀜
  const height = MAP_HEIGHTS.includes(block.dataset.height) ? block.dataset.height : '400';
  const width = Math.round(canvas.clientWidth || block.clientWidth || 640);
  const root = document.createElement('div');
  root.className = 'root_daum_roughmap root_daum_roughmap_landing';
  root.id = `daumRoughmapContainer${ts}`;
  // 같은 id 가 문서에 이미 있으면 그쪽을 찾으므로 잠시 떼어 둔다
  const clash = Array.from(document.querySelectorAll(`[id="${root.id}"]`));
  clash.forEach((el) => el.removeAttribute('id'));
  canvas.appendChild(root);
  fixProtocolRelative(canvas);
  const lander = new window.daum.roughmap.Lander({ timestamp: ts, key, mapWidth: String(width), mapHeight: height });
  lander.render();
  root.removeAttribute('id'); // Lander 는 생성 때 요소를 잡아 두므로 id 는 더 필요 없음
  clash.forEach((el) => el.setAttribute('id', root.id));
  // 블록이 지워지거나 다시 그려지면(canvas 분리) 기다리지 않고 끝낸다 — 같은 지도의 다음 그리기가 막히지 않게
  await waitFor(() => !canvas.isConnected || root.querySelector('.wrap_map'), RENDER_TIMEOUT);
  if (!canvas.isConnected) return false;
  if (!root.querySelector('.wrap_map')) { showFallback(block, canvas); return false; }
  const name = lander.roughmapData?.name || window.daum.roughmap.instances?.[ts]?.roughmapData?.name;
  if (name) opts.onTitle?.(String(name));
  return true;
}

/**
 * 카카오 약도는 로고·마커 이미지를 「//t1.kakaocdn.net/…」 처럼 프로토콜 없이 넣는다.
 * http(s) 가 아닌 페이지(file:// 로 연 데모 등)에서는 깨지므로 https 로 바꾼다. 나중에 추가되는 이미지도 감시
 * @param {HTMLElement} canvas
 */
function fixProtocolRelative(canvas) {
  if (/^https?:$/.test(location.protocol)) return;
  const fix = (img) => { const src = img.getAttribute('src'); if (src?.startsWith('//')) img.setAttribute('src', `https:${src}`); };
  const obs = new MutationObserver((ms) => ms.forEach((m) => {
    if (m.type === 'attributes') fix(m.target);
    m.addedNodes.forEach((n) => { if (n.nodeType !== 1) return; if (n.tagName === 'IMG') fix(n); n.querySelectorAll?.('img').forEach(fix); });
  }));
  obs.observe(canvas, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  canvas._fixObs = obs;
}

/** 조건이 참이 될 때까지 기다림 (제한 시간) */
function waitFor(test, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (test()) resolve(true);
      else if (Date.now() - t0 > timeout) resolve(false);
      else setTimeout(tick, 100);
    };
    tick();
  });
}

/** 지도를 못 그렸을 때: 장소명 + 카카오맵 링크 카드 */
function showFallback(block, canvas) {
  if (!canvas.isConnected) return;
  const title = (block.dataset.title || '').trim();
  canvas.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'jm-map-fallback';
  const label = document.createElement('span');
  label.textContent = `📍 ${title || '카카오 지도'} — 지도를 불러오지 못했습니다.`;
  const a = document.createElement('a');
  a.href = title ? `https://map.kakao.com/link/search/${encodeURIComponent(title)}` : 'https://map.kakao.com/';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = '카카오맵에서 보기';
  card.append(label, ' ', a);
  canvas.appendChild(card);
}

/** 그린 결과 제거 (저장 전·다시 그리기 전) */
export function stripMapUI(block) {
  block.querySelectorAll(`:scope > .${MAP_CANVAS_CLASS}`).forEach((c) => { c._fixObs?.disconnect(); c.remove(); });
}

/**
 * 영역 안의 지도 블록을 모두 그린다 (조회 화면·미리보기)
 * @param {HTMLElement|Document} [root=document]
 * @returns {() => void} 해제 함수 (그린 지도 제거)
 */
export function initMaps(root = document) {
  const blocks = Array.from(root.querySelectorAll('div[data-type="map"]'));
  blocks.forEach((b) => renderMap(b));
  return () => blocks.forEach(stripMapUI);
}
