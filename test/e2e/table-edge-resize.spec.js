/**
 * 표 오른쪽 끝(마지막 열) 끌기: 다른 열 폭을 유지한 채 표 폭이 바뀐다. 중간 경계는 표 폭을 유지한다
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret } from './helpers.js';

const rows = '<tr><td>팀원</td><td>연결</td><td>523</td><td>13</td></tr>';

/** 표 폭과 열 폭(반올림) */
const widths = (page) => page.evaluate(() => {
  const t = document.querySelector('.jm-editor table');
  return { table: Math.round(t.getBoundingClientRect().width), cells: [...t.rows[0].cells].map((c) => Math.round(c.getBoundingClientRect().width)) };
});

/** idx 번째 칸의 오른쪽 경계를 dx 만큼 끈다 */
async function dragEdge(page, idx, dx) {
  const b = await page.locator('.jm-editor td').nth(idx).boundingBox();
  const x = b.x + b.width - 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

const near = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(2);

test.describe('표 끝 끌기', () => {
  for (const [name, tableStyle] of [['px 폭', 'width:340px'], ['내용 맞춤', 'width:auto'], ['% 폭', 'width:50%']]) {
    test(`${name}: 늘리면 다른 열은 그대로, 표만 커진다`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<table style="${tableStyle}">${rows}</table>`);
      const a = await widths(page);
      await dragEdge(page, 3, 60);
      const b = await widths(page);
      near(b.table, a.table + 60);
      a.cells.slice(0, 3).forEach((w, i) => near(b.cells[i], w));
      near(b.cells[3], a.cells[3] + 60);
    });

    test(`${name}: 줄이면 다른 열은 그대로, 표만 작아진다`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<table style="${tableStyle}">${rows}</table>`);
      const a = await widths(page);
      await dragEdge(page, 3, -10);
      const b = await widths(page);
      near(b.table, a.table - 10);
      a.cells.slice(0, 3).forEach((w, i) => near(b.cells[i], w));
    });

    test(`${name}: 중간 경계는 표 폭을 유지한다`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<table style="${tableStyle}">${rows}</table>`);
      const a = await widths(page);
      await dragEdge(page, 1, 10);
      const b = await widths(page);
      near(b.table, a.table);
      near(b.cells[1], a.cells[1] + 10);
      near(b.cells[2], a.cells[2] - 10);
    });
  }

  test('폭을 안 정한 표(100%)는 편집 영역 밖으로 커지지 않고, 줄이면 그만큼 작아진다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<table>${rows}</table>`);
    const a = await widths(page);
    await dragEdge(page, 3, 100);
    near((await widths(page)).table, a.table);
    await dragEdge(page, 3, -50);
    near((await widths(page)).table, a.table - 50);
  });

  for (const [name, colgroup] of [
    ['col span 하나', '<colgroup><col span="4" style="width:70px"></colgroup>'],
    ['col span 섞임', '<colgroup><col style="width:70px"><col span="3" style="width:70px"></colgroup>'],
    ['colgroup 여러 개', '<colgroup><col style="width:70px"><col style="width:70px"></colgroup><colgroup><col span="2" style="width:70px"></colgroup>'],
  ]) {
    test(`${name}: 끝을 끌어도 칸이 표 폭을 채운다`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<table style="width:280px">${colgroup}${rows}</table>`);
      const a = await widths(page);
      await dragEdge(page, 3, 100);
      const b = await widths(page);
      near(b.table, a.table + 100);
      a.cells.slice(0, 3).forEach((w, i) => near(b.cells[i], w));
      near(b.cells.reduce((x, y) => x + y, 0), b.table);
      const saved = await html(page);
      expect(saved).not.toContain('span=');
      expect(saved.match(/<col\b/g)).toHaveLength(4);
    });
  }

  test('col span 표: 중간 경계를 끌어도 열이 어긋나지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<table style="width:280px"><colgroup><col span="4" style="width:70px"></colgroup>${rows}</table>`);
    const a = await widths(page);
    await dragEdge(page, 0, 10);
    const b = await widths(page);
    near(b.table, a.table);
    near(b.cells[0], a.cells[0] + 10);
    near(b.cells[1], a.cells[1] - 10);
    near(b.cells[2], a.cells[2]);
  });

  test('col span 표: 열 추가·삭제 뒤 col 수가 열 수와 같다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<table style="width:280px"><colgroup><col span="4" style="width:70px"></colgroup>${rows}</table>`);
    const count = () => page.evaluate(() => { const t = document.querySelector('.jm-editor table'); return { cols: t.querySelectorAll('col').length, span: t.querySelectorAll('col[span]').length, cells: t.rows[0].cells.length }; });
    await caret(page, 'td', 0);
    await page.evaluate(() => window.core.table.addColumn(true));
    let c = await count();
    expect(c.span).toBe(0);
    expect(c.cols).toBe(c.cells);
    await page.evaluate(() => window.core.table.deleteColumn());
    c = await count();
    expect(c.span).toBe(0);
    expect(c.cols).toBe(c.cells);
  });

  test('저장·다시 불러오기, 되돌리기', async ({ page }) => {
    await open(page);
    await setHTML(page, `<table style="width:340px">${rows}</table>`);
    await dragEdge(page, 3, 60);
    const saved = await html(page);
    expect(saved).toMatch(/<table style="width: (399|400|401)px/);
    expect(saved).not.toContain('cursor');
    const b = await widths(page);
    await setHTML(page, saved);
    const c = await widths(page);
    near(c.table, b.table);
    c.cells.forEach((w, i) => near(w, b.cells[i]));
    await setHTML(page, `<table style="width:340px">${rows}</table>`);
    await dragEdge(page, 3, 60);
    await page.evaluate(() => window.core.exec('undo'));
    near((await widths(page)).table, 340);
  });
});
