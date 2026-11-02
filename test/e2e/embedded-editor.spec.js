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

  /** 글자 구간을 실제 마우스로 끈다 */
  async function drag(page, selector, start, end) {
    const [a, b] = await page.evaluate(([sel, s, e]) => {
      const text = document.querySelector(`.jm-editor ${sel}`).firstChild;
      const at = (i) => { const r = document.createRange(); r.setStart(text, i); r.setEnd(text, i + 1); const c = r.getBoundingClientRect(); return [c.left, c.right, (c.top + c.bottom) / 2]; };
      const first = at(s); const last = at(e - 1);
      return [[first[0] + 1, first[2]], [last[1] - 1, last[2]]];
    }, [selector, start, end]);
    await page.mouse.move(...a);
    await page.mouse.down();
    await page.mouse.move(...b, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(30);
  }

  test('입력 중 다시 드래그하면 표시가 따라오고 주소는 유지되며 새 글자에 링크가 걸린다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마바사아</p>');
    await select(page, 'p', 0, 2);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await page.locator('.jm-inputbar-input').fill('https://a.b/c');
    await drag(page, 'p', 5, 7);
    expect(await highlight(page)).toEqual(['바사']);
    await expect(page.locator('.jm-inputbar-input')).toHaveValue('https://a.b/c');
    await page.locator('.jm-inputbar-input').click();
    expect(await highlight(page)).toEqual(['바사']);
    await page.keyboard.press('Enter');
    expect(await html(page)).toMatch(/<p>가나다라마<a [^>]*>바사<\/a>아<\/p>/);
  });

  test('입력 중 빈 곳을 누르면 표시만 사라지고 주소는 유지', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마</p>');
    await select(page, 'p', 0, 2);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await page.locator('.jm-inputbar-input').fill('https://a.b/c');
    await page.locator('.jm-editor p').click();
    await page.waitForTimeout(30);
    expect(await highlight(page)).toEqual([]);
    await expect(page.locator('.jm-inputbar-input')).toHaveValue('https://a.b/c');
  });

  test('입력 중 기존 링크를 누르면 그 링크 값으로 바뀌고, 벗어나면 쓰던 주소로 돌아온다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마<a href="/x" target="_self">링크글</a></p><p>뒤의문단입니다</p>');
    await select(page, 'p', 0, 2);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    const input = page.locator('.jm-inputbar-input');
    await input.fill('https://a.b/c');
    await page.locator('.jm-editor a').click({ modifiers: [] });
    await page.waitForTimeout(30);
    expect(await highlight(page)).toEqual(['링크글']);
    await expect(input).toHaveValue('/x');
    await expect(page.locator('.jm-inputbar-label')).toContainText('비우면 해제');
    await expect(page.locator('.jm-inputbar-newwin input')).not.toBeChecked();
    await drag(page, 'p:nth-of-type(2)', 0, 2);
    expect(await highlight(page)).toEqual(['뒤의']);
    await expect(input).toHaveValue('https://a.b/c');
    await expect(page.locator('.jm-inputbar-label')).not.toContainText('비우면 해제');
    await expect(page.locator('.jm-inputbar-newwin input')).toBeChecked();
  });

  test('입력 중 옮겨 간 기존 링크는 주소를 비우면 해제', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>가나다라마<a href="/x">링크글</a></p>');
    await select(page, 'p', 0, 2);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await page.locator('.jm-editor a').click();
    await page.waitForTimeout(30);
    await page.locator('.jm-inputbar-input').fill('');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<p>가나다라마링크글</p>');
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

  test('데모 입력줄도 다시 드래그를 따라간다', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const root = document.querySelector('.jm-editor');
      root.innerHTML = '<p>가나다라마바사아</p>';
      root.focus();
      const r = document.createRange();
      r.setStart(root.querySelector('p').firstChild, 0);
      r.setEnd(root.querySelector('p').firstChild, 2);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await page.waitForTimeout(50);
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await page.locator('#linkUrl').fill('https://a.b/c');
    await drag(page, 'p', 5, 7);
    expect(await highlight(page)).toEqual(['바사']);
    await expect(page.locator('#linkUrl')).toHaveValue('https://a.b/c');
  });
});
