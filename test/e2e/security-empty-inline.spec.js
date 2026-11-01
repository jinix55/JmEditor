/**
 * 저장 HTML 의 빈 인라인 제거가 속성값 안의 글자를 태그로 착각해 속성 경계를 깨지 않는다 (DOM 기준 처리)
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html } from './helpers.js';

const Z = '​';

test.describe('빈 인라인 제거', () => {
  test('속성값 안의 태그 모양 글자로 속성을 깨지 못한다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>x</p>');
    const out = await page.evaluate((z) => {
      // 정제를 통과한 값만으로 만든 DOM: alt 는 자유 글자, 뒤 글자에 따옴표
      window.core.root.innerHTML = `<p><s><img src="/a.png" alt="&lt;s &quot;&gt;">${z}</s></p><p>" onerror=window.__xss=1 x="</p>`;
      window.core.root.querySelector('img').setAttribute('alt', '<s ');
      return window.core.getHTML();
    }, Z);
    const parsed = await page.evaluate((h) => {
      const t = document.createElement('template');
      t.innerHTML = h;
      return { attrs: Array.from(t.content.querySelectorAll('img')).flatMap((i) => i.getAttributeNames()), text: t.content.textContent };
    }, out);
    expect(parsed.attrs).not.toContain('onerror');
    expect(parsed.text).toContain('onerror=window.__xss=1');
    expect(out).toContain('alt=');
  });

  test('ZWSP 만 든 인라인은 지금처럼 지워지고 중첩도 지워진다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>x</p>');
    const out = await page.evaluate((z) => {
      window.core.root.innerHTML = `<p>a<strong>${z}</strong>b<em><u>${z}</u></em>c<a href="/x">${z}</a>d<span style="color: red">${z}${z}</span>e</p>`;
      return window.core.getHTML();
    }, Z);
    expect(out).toBe('<p>abcde</p>');
  });

  test('글이 든 인라인과 ZWSP 없는 빈 태그는 그대로', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong>가</strong>나</p>');
    expect(await html(page)).toBe('<p><strong>가</strong>나</p>');
    const out = await page.evaluate((z) => {
      window.core.root.innerHTML = `<p><strong>가${z}나</strong><em></em></p>`;
      return window.core.getHTML();
    }, Z);
    expect(out).toContain('<strong>가나</strong>');
    expect(out).toContain('<em></em>');
  });
});
