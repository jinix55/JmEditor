/**
 * 에디터가 페이지의 표 칸 안에 있을 때: 삽입 기준이 바깥 표로 새지 않고 getHTML 에 저장된다
 * 하이퍼링크 입력 중 대상 글자 표시
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret, select } from './helpers.js';

/** 표 칸 안에 새 툴바 에디터를 만들어 window.ed·window.core 로 둔다 */
async function openInCell(page) {
  await open(page);
  await page.evaluate(() => {
    window.ed.destroy();
    const table = document.createElement('table');
    table.id = 'outer';
    table.innerHTML = '<caption>바깥</caption><tbody><tr><td id="host"><div id="inner"></div></td></tr></tbody>';
    document.body.appendChild(table);
    window.ed = new window.JM.JmToolbarEditor(document.getElementById('inner'), {});
    window.core = window.ed.editor;
  });
}

/** 바깥 표에 에디터 말고 새로 붙은 것이 없는지 */
const outside = (page) => page.evaluate(() => {
  const outer = document.getElementById('outer');
  return { siblings: Array.from(outer.parentNode.children).filter((e) => e.classList.contains('jm-table-layer') || e.tagName === 'HR' || e.dataset.type).length, afterOuter: outer.nextElementSibling?.tagName ?? null, host: document.getElementById('host').children.length };
});

test.describe('표 칸 안의 에디터', () => {
  for (const [name, run, expected] of [
    ['서식', () => window.core.exec('format', '<h3>서식 제목</h3><p>서식 본문</p>'), '서식 제목'],
    ['표', () => window.core.exec('table', { rows: 2, cols: 2 }), '<table'],
    ['가로줄', () => window.core.exec('hr'), '<hr'],
  ]) {
    test(`${name}: 에디터 안에 들어가고 저장된다`, async ({ page }) => {
      await openInCell(page);
      await setHTML(page, '<p>본문</p>');
      await caret(page, '.jm-editor p', 1);
      const before = await outside(page);
      await page.evaluate(run);
      expect(await html(page)).toContain(expected);
      expect(await html(page)).toContain('본문');
      expect(await outside(page)).toEqual(before);
    });
  }

  test('이미지 감싸기 서식이 에디터 안에서 동작', async ({ page }) => {
    await openInCell(page);
    await setHTML(page, '<p><img src="/a.png" alt="" style="float: left; width: 30%">글</p>');
    await caret(page, '.jm-editor p', -1);
    const before = await outside(page);
    await page.evaluate(() => window.core.exec('format', '<p>추가</p>'));
    expect(await html(page)).toContain('추가');
    expect(await outside(page)).toEqual(before);
  });

  test('갤러리·유튜브도 에디터 안', async ({ page }) => {
    await openInCell(page);
    await setHTML(page, '<p>본문</p>');
    await caret(page, '.jm-editor p', 1);
    const before = await outside(page);
    await page.evaluate(() => { window.core.exec('youtube', 'dQw4w9WgXcQ'); window.core.exec('gallery'); });
    const h = await html(page);
    expect(h).toContain('data-type="youtube"');
    expect(await outside(page)).toEqual(before);
  });

  test('바깥 표는 표 명령·메뉴·Tab 의 대상이 아니다', async ({ page }) => {
    await openInCell(page);
    await setHTML(page, '<p>본문</p>');
    await caret(page, '.jm-editor p', 1);
    const r = await page.evaluate(() => ({ table: window.core.getState().table, cell: !!window.core.table.getCell() }));
    expect(r).toEqual({ table: false, cell: false });
    await page.evaluate(() => window.core.table.addColumn());
    await expect(page.locator('#host')).toHaveCount(1);
    await expect(page.locator('#outer > tbody > tr > td')).toHaveCount(1);
  });

  test('에디터 안 표에서는 지금처럼 그 표 뒤에 들어간다', async ({ page }) => {
    await openInCell(page);
    await setHTML(page, '<table><tbody><tr><td>칸</td></tr></tbody></table><p>끝</p>');
    await caret(page, '.jm-editor td', 1);
    await page.evaluate(() => window.core.exec('format', '<p>뒤</p>'));
    expect(await html(page)).toMatch(/<\/table><p>뒤<\/p>/);
  });

  test('표 칸 안 에디터의 문단 앞 Delete·Backspace 도 평소대로', async ({ page }) => {
    await openInCell(page);
    await setHTML(page, '<p>abc</p><table><tbody><tr><td>x</td></tr></tbody></table>');
    await caret(page, '.jm-editor p', -1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toContain('<p>abc</p>');
  });
});

test.describe('링크 입력 중 대상 표시', () => {
  const highlight = (page) => page.evaluate(() => {
    const h = CSS.highlights?.get('jm-input-target');
    return h ? Array.from(h.values()).map((r) => r.toString()) : [];
  });

  test('선택한 글자가 입력 중 표시되고 닫으면 사라지며 저장에 흔적이 없다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마</p>');
    await select(page, 'p', 1, 3);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await expect(page.locator('.jm-inputbar-input')).toBeFocused();
    expect(await highlight(page)).toEqual(['나다']);
    expect(await html(page)).toBe('<p>가나다라마</p>');
    await page.locator('.jm-inputbar-cancel').click();
    expect(await highlight(page)).toEqual([]);
  });

  test('적용하면 링크가 걸리고 표시가 사라진다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마</p>');
    await select(page, 'p', 1, 3);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await page.locator('.jm-inputbar-input').fill('https://a.b/c');
    await page.keyboard.press('Enter');
    expect(await highlight(page)).toEqual([]);
    expect(await html(page)).toMatch(/가<a [^>]*href="https:\/\/a\.b\/c"[^>]*>나다<\/a>라마/);
  });

  test('링크 안 커서로 열면 그 링크 글자 전체를 표시', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가<a href="/x">나다</a>라</p>');
    await caret(page, 'a', 1);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    expect(await highlight(page)).toEqual(['나다']);
    await page.keyboard.press('Escape');
  });

  test('선택 없는 유튜브 입력은 표시 없음', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나</p>');
    await caret(page, 'p', 1);
    await page.locator('.jm-btn[data-cmd="youtube"]').click();
    expect(await highlight(page)).toEqual([]);
  });

  test('데모 입력줄도 표시', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const root = document.querySelector('.jm-editor');
      root.focus();
      const r = document.createRange();
      r.selectNodeContents(root.querySelector('p'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await page.waitForTimeout(50);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    expect((await highlight(page)).join('').length).toBeGreaterThan(0);
  });
});
