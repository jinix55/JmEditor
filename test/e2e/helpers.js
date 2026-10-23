/**
 * E2E 공통 도우미 — 하네스 열기, 내용 넣기·읽기, 커서·선택 지정, 명령 실행
 */
import { expect, test } from '@playwright/test';

/**
 * 하네스를 열고 에디터가 준비될 때까지 기다린다
 * @param {import('@playwright/test').Page} page
 * @param {string} [query] 예: '?structure=1'. 없으면 프로젝트 설정(metadata.query)을 따른다
 */
export async function open(page, query = test.info().project.metadata?.query || '') {
  await page.goto(`/test/e2e/harness.html${query}`);
  await page.waitForFunction(() => window.ready === true);
}

/** 에디터 내용 넣기 (setHTML — 정제 포함) */
export async function setHTML(page, html) {
  await page.evaluate((h) => window.ed.setHTML(h), html);
}

/** 저장용 HTML (getHTML) — 태그 사이 공백을 지워 비교하기 쉽게 */
export async function html(page) {
  return page.evaluate(() => window.ed.getHTML().replace(/>\s+</g, '><').trim());
}

/**
 * 커서 두기: selector 로 찾은 요소의 nth 번째 텍스트 노드 안 offset 위치
 * @param {string} selector 편집 영역 안 CSS 선택자
 * @param {number} offset 글자 위치 (음수면 끝에서)
 * @param {number} [nth=0] 몇 번째 텍스트 노드인지 (0부터)
 */
export async function caret(page, selector, offset = 0, nth = 0) {
  await page.evaluate(([sel, off, k]) => {
    const el = window.core.root.querySelector(sel);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t = walker.nextNode();
    for (let i = 0; i < k && t; i++) t = walker.nextNode();
    const r = document.createRange();
    if (t) r.setStart(t, off < 0 ? t.length + off + 1 : Math.min(off, t.length)); else r.setStart(el, 0);
    r.collapse(true);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }, [selector, offset, nth]);
}

/** 선택: selector 요소의 첫 텍스트 노드 [start, end) */
export async function select(page, selector, start, end) {
  await page.evaluate(([sel, a, b]) => {
    const el = window.core.root.querySelector(sel);
    const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const r = document.createRange();
    r.setStart(t, a); r.setEnd(t, b);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }, [selector, start, end]);
}

/**
 * 에디터 명령 실행 (JmEditor.exec). value 를 생략하면 값 없이(undefined), null 을 주면 null 그대로 넘긴다
 * (quote(null)=해제 처럼 null 과 생략이 다른 명령이 있음)
 */
export async function exec(page, name, ...rest) {
  return page.evaluate(([n, hasValue, v]) => (hasValue ? window.core.exec(n, v) : window.core.exec(n)), [name, rest.length > 0, rest[0] ?? null]);
}

/** 클립보드 붙여넣기 흉내 (text/plain, text/html) */
export async function paste(page, { text = '', htmlData = '' }) {
  await page.evaluate(([t, h]) => {
    const dt = new DataTransfer();
    if (t) dt.setData('text/plain', t);
    if (h) dt.setData('text/html', h);
    window.core.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [text, htmlData]);
}

/** 비교용 정규화: 태그 사이 공백 제거 + 속성 이름순 정렬 (속성 순서만 다른 것은 같은 문서) */
export async function canonical(page) {
  return page.evaluate(() => {
    const tpl = document.createElement('template');
    tpl.innerHTML = window.ed.getHTML();
    tpl.content.querySelectorAll('*').forEach((el) => {
      const attrs = Array.from(el.attributes).map((a) => [a.name, a.value]).sort(([a], [b]) => a.localeCompare(b));
      attrs.forEach(([n]) => el.removeAttribute(n));
      attrs.forEach(([n, v]) => el.setAttribute(n, v));
    });
    return tpl.innerHTML.replace(/>\s+</g, '><').trim();
  });
}

/** 저장 → 다시 불러오기 → 저장 결과가 같은지 (왕복 안정성, 속성 순서는 무시) */
export async function expectRoundTrip(page) {
  const a = await canonical(page);
  await page.evaluate(() => window.ed.setHTML(window.ed.getHTML()));
  expect(await canonical(page)).toBe(a);
}
