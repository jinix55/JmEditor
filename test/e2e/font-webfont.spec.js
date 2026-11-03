/**
 * 웹폰트 글꼴 — 툴바는 웹폰트로 불러오는 글꼴만, 옛 글꼴은 허용만, 에디터·뷰어가 같은 글꼴 CSS 를 불러오고
 * 저장할 때 대체 글꼴(serif·sans-serif)을 붙인다
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, exec, select } from './helpers.js';

/** 페이지에 붙은 글꼴 CSS 주소 */
const fontLinks = (page) => page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href));

test.describe('웹폰트 글꼴', () => {
  test('툴바 글꼴 목록은 웹폰트 글꼴만', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>글자</p>');
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    const items = await page.getByRole('menuitemradio').allTextContents();
    expect(items).toEqual(expect.arrayContaining(['Noto Sans KR', 'Noto Serif KR']));
    for (const old of ['맑은 고딕', '굴림', '바탕', 'HY헤드라인M', 'Arial']) expect(items).not.toContain(old);
  });

  test('기본 글꼴 CSS 를 한 번만 불러온다', async ({ page }) => {
    await open(page);
    const google = (await fontLinks(page)).filter((h) => h.startsWith('https://fonts.googleapis.com/css2'));
    expect(google).toHaveLength(1);
    expect(google[0]).toContain('Noto+Sans+KR');
    expect(google[0]).toContain('Noto+Serif+KR');
    await page.evaluate(() => { const d = document.createElement('div'); document.body.appendChild(d); new window.JM.JmEditor(d); });
    expect((await fontLinks(page)).filter((h) => h.startsWith('https://fonts.googleapis.com/css2'))).toHaveLength(1);
  });

  test('css 설정: 허용 주소만 불러오고 빈 배열이면 불러오지 않는다', async ({ page }) => {
    await open(page);
    await page.route(/x\.test|\/fonts\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const before = await fontLinks(page);
    await page.evaluate(() => {
      const d = document.createElement('div');
      document.body.appendChild(d);
      new window.JM.JmEditor(d, { font: { css: ['javascript:alert(1)', '//evil.test/a.css', '/\\evil.test/a.css', 'http://x.test/plain.css', '/fonts/a.css', 'https://x.test/b.css', 'https://[', 'https://a:b:c', 42] } });
      const e = document.createElement('div');
      document.body.appendChild(e);
      new window.JM.JmEditor(e, { font: { css: [] } });
    });
    const added = (await fontLinks(page)).filter((h) => !before.includes(h));
    expect(added).toEqual([new URL('/fonts/a.css', page.url()).href, 'https://x.test/b.css']);
  });

  test('뷰어도 같은 글꼴 CSS 를 불러온다', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('/test/e2e/harness.html');
    await page.waitForFunction(() => window.ready === true);
    await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.href.includes('fonts.googleapis.com') && l.remove()));
    await page.evaluate(async () => { const v = await import('/src/viewer.js'); v.initViewer(document.body); });
    expect((await fontLinks(page)).filter((h) => h.startsWith('https://fonts.googleapis.com/css2'))).toHaveLength(1);
  });

  test('저장할 때 대체 글꼴을 붙인다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나</p><p>다라</p>');
    await select(page, 'p:nth-of-type(1)', 0, 2);
    await exec(page, 'fontFamily', 'Noto Serif KR');
    await select(page, 'p:nth-of-type(2)', 0, 2);
    await exec(page, 'fontFamily', 'Noto Sans KR');
    const out = await html(page);
    expect(out).toContain('font-family: &quot;Noto Serif KR&quot;, serif');
    expect(out).toContain('font-family: &quot;Noto Sans KR&quot;, sans-serif');
  });

  test('옛 글꼴은 툴바에 없어도 지우지 않고, 대체 글꼴을 붙인다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><span style="font-family:굴림">가</span><span style="font-family:\'Times New Roman\'">나</span></p>');
    const out = await html(page);
    expect(out).toContain('font-family: &quot;굴림&quot;, sans-serif');
    expect(out).toContain('font-family: &quot;Times New Roman&quot;, serif');
    await exec(page, 'fontFamily', '바탕'); // 연동 코드가 옛 글꼴로 지정해도 허용 목록이라 적용
  });

  test('legacy 를 비우면 옛 글꼴도 지운다', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      window.JmEditorConfig = { font: { legacy: [] } };
      try {
        return [window.JM.Sanitizer.clean('<span style="font-family:굴림">a</span>'), window.JM.Sanitizer.clean('<span style="font-family:\'Noto Sans KR\'">b</span>')];
      } finally { delete window.JmEditorConfig; }
    });
    expect(out).toEqual(['a', '<span style="font-family: &quot;Noto Sans KR&quot;, sans-serif">b</span>']);
  });
});
