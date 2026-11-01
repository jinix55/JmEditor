/**
 * 마무리 묶음 회귀 테스트 — 저장 HTML 빈 속성·왕복 멱등, 빈 인라인, 색 해제, 링크, 이력, 목록, 표 범위 선택, UI, pre 붙여넣기
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, canonical, caret, select, exec, paste } from './helpers.js';

const IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const TABLE = '<table><tbody><tr><td>a1</td><td>a2</td></tr><tr><td>b1</td><td>b2</td></tr><tr><td>c1</td><td>c2</td></tr><tr><td>d1</td><td>d2</td></tr></tbody></table>';

/** 구조 모드가 꺼진 프로젝트인지 */
const structureOff = () => test.info().project.metadata?.query === '?structure=0';

/** 첫 selector 요소 처음 ~ 마지막 selector 요소 끝까지 선택 */
async function selectAcross(page, selector) {
  await page.evaluate((sel) => {
    const els = window.core.root.querySelectorAll(sel);
    const walk = (el) => document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    r.setStart(walk(els[0]).nextNode(), 0);
    const w = walk(els[els.length - 1]);
    let last = w.nextNode();
    for (let n = last; n; n = w.nextNode()) last = n;
    r.setEnd(last, last.length);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    window.core.sel.save();
  }, selector);
}

/** 빈 블록 안(요소 자체)에 커서 두기 */
async function caretIn(page, selector) {
  await page.evaluate((sel) => {
    const el = window.core.root.querySelector(sel);
    const r = document.createRange();
    r.setStart(el, 0); r.collapse(true);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    window.core.sel.save();
  }, selector);
}

/** 요소 가운데 화면 좌표 */
const center = (page, selector) => page.evaluate((sel) => {
  const r = window.core.root.querySelector(sel).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);

/** 칸 from 에서 눌러 to 까지 끌어 놓는다 */
async function dragCells(page, from, to, release = true) {
  const a = await center(page, from);
  const b = await center(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  if (release) await page.mouse.up();
}

const cell = (r, c) => `tr:nth-child(${r}) td:nth-child(${c})`;
const undoSteps = (page) => page.evaluate(() => window.core.history.undoStack.length);
const tableSel = (page) => page.evaluate(() => {
  const s = window.core.table.selection;
  return s ? { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2, connected: s.table.isConnected } : null;
});
const firstColumn = (page) => page.evaluate(() => Array.from(window.core.root.querySelectorAll('tr')).map((tr) => tr.cells[0].textContent));

test.describe('1. 저장 HTML 의 빈 속성', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('칸 드래그 뒤 td 에 class="" 가 남지 않는다', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    await dragCells(page, cell(1, 1), cell(2, 2));
    await page.evaluate(() => window.core.table.clearSelection());
    expect(await html(page)).not.toContain('class');
    expect(await page.evaluate(() => window.core.root.querySelectorAll('[class=""]').length)).toBe(0);
  });

  test('표 위 경계 마우스 커서가 저장 HTML 에 섞이지 않는다', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    const before = await html(page);
    const edge = await page.evaluate(() => { const r = window.core.root.querySelector('td').getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(edge.x, edge.y);
    expect(await html(page)).toBe(before);
    await page.mouse.move(0, 0);
    expect(await html(page)).toBe(before);
  });

  test('열 너비·행 높이 초기화 뒤 tr 에 style="" 가 남지 않는다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr style="height:40px"><td>a</td></tr></tbody></table><p>x</p>');
    await caret(page, 'td', 0);
    await page.evaluate(() => window.core.table.resetColumnWidths());
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td></tr></tbody></table><p>x</p>');
  });

  /** 블록 손잡이를 끌어 clientY 에 놓는다 */
  const dropBlock = (page, y) => page.evaluate((clientY) => {
    const root = window.core.root;
    const handle = root.querySelector('.jm-table-handle');
    const dataTransfer = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true, clientY }));
    fire(handle, 'dragstart');
    fire(root.querySelector('p'), 'dragover');
    fire(root.querySelector('p'), 'drop');
    fire(handle, 'dragend');
  }, y);

  test('제자리 블록 드래그: p 에 class="" 도 되돌리기 단계도 남지 않는다', async ({ page }) => {
    await setHTML(page, `<p>x</p>${TABLE}<p>y</p>`);
    const before = await html(page);
    const y = await page.evaluate(() => { const r = window.core.root.querySelector('.jm-table-layer + p').getBoundingClientRect(); return r.top + 1; });
    await dropBlock(page, y);
    expect(await html(page)).toBe(before);
    expect(await undoSteps(page)).toBe(0);
    expect(await page.evaluate(() => window.core.root.querySelectorAll('[class=""]').length)).toBe(0);
  });

  test('블록을 실제로 옮기면 단계 하나', async ({ page }) => {
    await setHTML(page, `<p>x</p>${TABLE}<p>y</p>`);
    const y = await page.evaluate(() => window.core.root.querySelector('p').getBoundingClientRect().top + 1);
    await dropBlock(page, y);
    expect((await html(page)).startsWith('<table>')).toBe(true);
    expect(await undoSteps(page)).toBe(1);
  });
});

test.describe('2. 왕복 멱등', () => {
  test('툴바 서식 저장 결과가 다시 불러와도 글자 그대로', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>abc def</p><p>ghi</p><ul><li>j</li></ul>');
    await select(page, 'p', 0, 3);
    await exec(page, 'color', '#ff0000');
    await select(page, 'p', 0, 1);
    await exec(page, 'fontSize', '20px');
    await exec(page, 'fontFamily', '돋움');
    await caret(page, 'p:nth-child(2)', 1);
    await exec(page, 'alignCenter');
    await exec(page, 'lineHeight', '1.5');
    await caret(page, 'li', 0);
    await exec(page, 'ul', 'square');
    const saved = await page.evaluate(() => window.ed.getHTML());
    expect(saved.replace(/&quot;/g, "")).not.toMatch(/;\s*"/);
    const again = await page.evaluate((h) => { window.ed.setHTML(h); return window.ed.getHTML(); }, saved);
    expect(again).toBe(saved);
  });

  test('값 안의 세미콜론·data: 주소는 건드리지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p><img src="${IMG}" alt="a;" style="width: 50%"></p>`);
    const saved = await page.evaluate(() => window.ed.getHTML());
    expect(saved).toContain(IMG);
    expect(saved).toContain('alt="a;"');
  });
});

test.describe('3. 빈 인라인', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('글 끝 커서에서 색·크기만 지정: 저장 HTML 그대로, 되돌리기 단계 없음', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await caret(page, 'p', 3);
    await exec(page, 'color', '#ff0000');
    await exec(page, 'fontSize', '20px');
    expect(await html(page)).toBe('<p>abc</p>');
    expect(await undoSteps(page)).toBe(0);
  });

  for (const [name, src, sel, result] of [
    ['strong', '<p>x<strong>bb</strong>y</p>', 'strong', '<p>xy</p>'],
    ['링크', '<p>x<a href="/u">bb</a>y</p>', 'a', '<p>xy</p>'],
    ['중첩', '<p>x<a href="/u"><em><u>bb</u></em></a>y</p>', 'u', '<p>xy</p>'],
  ]) {
    test(`deleteRange 가 빈 ${name} 을 남기지 않는다`, async ({ page }) => {
      await setHTML(page, src);
      await selectAcross(page, sel);
      await page.evaluate(() => { window.core.commands.deleteRange(window.core.sel.getRange()); window.core.commit(); });
      expect(await html(page)).toBe(result);
    });
  }

  test('선택을 덮어 붙여넣어도 빈 서식이 남지 않는다', async ({ page }) => {
    await setHTML(page, '<p>x<strong>bb</strong>y</p>');
    await select(page, 'strong', 0, 2);
    await paste(page, { text: 'k' });
    expect(await html(page)).toBe('<p>xky</p>');
  });

  test('글 일부만 지우면 서식은 그대로, 아이콘 i 처럼 내용 요소가 있는 서식도 그대로', async ({ page }) => {
    await setHTML(page, '<p>x<strong>bcd</strong>y</p>');
    await select(page, 'strong', 0, 2);
    await page.evaluate(() => { window.core.commands.deleteRange(window.core.sel.getRange()); window.core.commit(); });
    expect(await html(page)).toBe('<p>x<strong>d</strong>y</p>');
  });

  test('구조 경계를 넘는 선택 위 Delete·조합 입력에도 빈 태그가 남지 않는다', async ({ page }) => {
    test.skip(structureOff(), '구조 모드 전용');
    const SRC = '<div class="a"><p>x<strong>bb</strong></p></div><div class="b"><p><a href="/u">cc</a>y</p></div>';
    const OUT = '<div class="a"><p>x</p></div><div class="b"><p>y</p></div>';
    await setHTML(page, SRC);
    await page.evaluate(() => {
      const r = document.createRange();
      r.setStart(window.core.root.querySelector('strong').firstChild, 0);
      r.setEnd(window.core.root.querySelector('a').firstChild, 2);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(OUT);
    await setHTML(page, SRC);
    await page.evaluate(() => {
      const r = document.createRange();
      r.setStart(window.core.root.querySelector('strong').firstChild, 0);
      r.setEnd(window.core.root.querySelector('a').firstChild, 2);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      window.core.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      window.core.root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    expect(await html(page)).toBe(OUT);
  });
});

test.describe('4. 색 해제', () => {
  test('class 가 있는 span 은 색만 빠지고 class 는 남는다', async ({ page }) => {
    test.skip(structureOff(), '구조 모드 끔에서는 class 가 정제에서 빠진다');
    await open(page);
    await setHTML(page, '<p><span class="tag" style="color:red">abc</span></p>');
    await select(page, 'span', 0, 3);
    await exec(page, 'color', null);
    expect(await html(page)).toBe('<p><span class="tag">abc</span></p>');
  });

  test('다른 속성이 없는 span 은 벗겨진다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><span style="color:red">abc</span></p>');
    await select(page, 'span', 0, 3);
    await exec(page, 'color', null);
    expect(await html(page)).toBe('<p>abc</p>');
  });
});

test.describe('5. 링크', () => {
  const A = (t, u = '/u') => `<a href="${u}" rel="noopener noreferrer" target="_blank">${t}</a>`;
  test.beforeEach(async ({ page }) => { await open(page); });

  test('x<a>y</a>z 전체 선택 후 unlink', async ({ page }) => {
    await setHTML(page, '<p>x<a href="/u">y</a>z</p>');
    await selectAcross(page, 'p');
    await exec(page, 'unlink');
    expect(await html(page)).toBe('<p>xyz</p>');
  });

  test('문단 여러 개의 링크를 함께 해제', async ({ page }) => {
    await setHTML(page, '<p><a href="/u">a</a></p><p>b<a href="/v">c</a></p>');
    await selectAcross(page, 'p');
    await exec(page, 'unlink');
    expect(await html(page)).toBe('<p>a</p><p>bc</p>');
  });

  test('링크 안 커서·링크 안 선택 unlink 는 예전처럼 링크 전체 해제', async ({ page }) => {
    await setHTML(page, '<p>x<a href="/u">yy</a>z</p>');
    await select(page, 'a', 0, 1);
    await exec(page, 'unlink');
    expect(await html(page)).toBe('<p>xyyz</p>');
  });

  test('y~z 선택 후 link 는 z 에도 적용', async ({ page }) => {
    await setHTML(page, '<p>x<a href="/u">y</a>z</p>');
    await page.evaluate(() => {
      const p = window.core.root.querySelector('p');
      const r = document.createRange();
      r.setStart(p.querySelector('a').firstChild, 0);
      r.setEnd(p.lastChild, 1);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await exec(page, 'link', '/v');
    expect(await canonical(page)).toBe(`<p>x${A('yz', '/v')}</p>`);
  });

  test('링크 안만 선택하면 그 링크 주소를 바꾼다', async ({ page }) => {
    await setHTML(page, '<p>x<a href="/u">yy</a>z</p>');
    await select(page, 'a', 0, 2);
    await exec(page, 'link', '/v');
    expect(await canonical(page)).toBe(`<p>x${A('yy', '/v')}z</p>`);
  });
});

test('6. 입력 후 undo, 다시 입력하고 400ms 안에 redo 해도 새 글이 남는다', async ({ page }) => {
  await open(page);
  await setHTML(page, '<p>a</p>');
  await caret(page, 'p', 1);
  await page.keyboard.type('b');
  await page.evaluate(() => window.core.history.push());
  await exec(page, 'undo');
  await caret(page, 'p', 1);
  await page.keyboard.type('c');
  await exec(page, 'redo');
  expect(await html(page)).toBe('<p>ac</p>');
  await exec(page, 'undo');
  expect(await html(page)).toBe('<p>a</p>');
});

test('7. 빈 li 에서 굵게를 여러 번 누른 뒤 Enter 로 목록을 벗어난다', async ({ page }) => {
  await open(page);
  await setHTML(page, '<ul><li>x</li><li><br></li></ul>');
  await caretIn(page, 'li:nth-child(2)');
  await exec(page, 'bold');
  await exec(page, 'bold');
  await exec(page, 'bold'); // 세 번째에 ZWSP 가 둘이 된다
  expect(await page.evaluate(() => (window.core.root.querySelector('li:nth-child(2)').textContent.match(/\u200B/g) || []).length)).toBeGreaterThan(1);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<ul><li>x</li></ul><p><br></p>');
});

test.describe('8. 인접 목록 합치기', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('문단을 차례로 ol 로 바꾸면 한 목록 (앞 목록에)', async ({ page }) => {
    await setHTML(page, '<p>a</p><p>b</p>');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  test('뒤 문단부터 바꿔도 (뒤 목록에)', async ({ page }) => {
    await setHTML(page, '<p>a</p><p>b</p>');
    await caret(page, 'p:nth-child(2)', 0);
    await exec(page, 'ol');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  test('사이 문단을 바꾸면 앞뒤 목록이 하나로, 범위 명령도 한 목록', async ({ page }) => {
    await setHTML(page, '<ol><li>a</li></ol><p>b</p><p>c</p><ol><li>d</li></ol>');
    await selectAcross(page, 'p');
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li><li>c</li><li>d</li></ol>');
    await exec(page, 'ol'); // 선택은 b·c 그대로 — 그 항목만 해제, 뒤 목록 번호는 이어진다
    expect(await html(page)).toBe('<ol><li>a</li></ol><p>b</p><p>c</p><ol start="4"><li>d</li></ol>');
  });

  test('항목을 빼고 다시 넣으면 원래 한 목록', async ({ page }) => {
    await setHTML(page, '<ol><li>a</li><li>b</li><li>c</li></ol>');
    await caret(page, 'li:nth-child(2)', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li></ol><p>b</p><ol start="3"><li>c</li></ol>');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li><li>c</li></ol>');
  });

  test('종류·번호 형식·시작 번호가 다르면 합치지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li>a</li></ul><p>b</p><ol style="list-style-type: lower-alpha"><li>c</li></ol><p>d</p><ol start="5"><li>e</li></ol>');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    await caret(page, 'p', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ul><li>a</li></ul><ol><li>b</li></ol><ol style="list-style-type: lower-alpha"><li>c</li></ol><ol><li>d</li></ol><ol start="5"><li>e</li></ol>');
  });

  test('종류 바꾸기로 같은 종류와 닿아도 합친다, 커서는 그대로', async ({ page }) => {
    await setHTML(page, '<ol><li>a</li></ol><ul><li>b</li></ul>');
    await caret(page, 'ul li', 1);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>a</li><li>b</li></ol>');
    await page.keyboard.type('c');
    expect(await html(page)).toBe('<ol><li>a</li><li>bc</li></ol>');
  });
});

test.describe('9. 표', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('범위 선택 중 세로 정렬 버튼이 켜지고 동작한다', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    await dragCells(page, cell(1, 1), cell(2, 2));
    expect(await tableSel(page)).toMatchObject({ r1: 0, r2: 1 });
    expect(await page.evaluate(() => window.core.getState().table)).toBe(true);
    expect(await page.evaluate(() => window.ed.buttons.valignMenu.disabled)).toBe(false);
    await exec(page, 'valignMiddle');
    expect((await html(page)).match(/vertical-align: middle/g)).toHaveLength(4);
  });

  test('범위 선택 후 되돌리기·setHTML 뒤에 selection 이 남지 않는다', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    await dragCells(page, cell(1, 1), cell(2, 2));
    await exec(page, 'alignCenter');
    expect(await tableSel(page)).not.toBeNull();
    await exec(page, 'undo');
    expect(await tableSel(page)).toBeNull();
    await dragCells(page, cell(1, 1), cell(2, 2));
    await setHTML(page, `${TABLE}<p>x</p>`);
    expect(await tableSel(page)).toBeNull();
  });

  test('Shift+클릭: 커서 칸을 기준으로 범위 선택, 다시 Shift+클릭은 같은 기준', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    await caret(page, cell(1, 1), 0);
    const to = await center(page, cell(2, 2));
    await page.keyboard.down('Shift');
    await page.mouse.click(to.x, to.y);
    expect(await tableSel(page)).toMatchObject({ r1: 0, c1: 0, r2: 1, c2: 1 });
    const to2 = await center(page, cell(3, 1));
    await page.mouse.click(to2.x, to2.y);
    await page.keyboard.up('Shift');
    expect(await tableSel(page)).toMatchObject({ r1: 0, c1: 0, r2: 2, c2: 0 });
  });

  test('2·3행을 위로: 두 행이 함께, 아래로도', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>x</p>`);
    await dragCells(page, cell(2, 1), cell(3, 1));
    await page.evaluate(() => window.core.table.moveRow(-1));
    expect(await firstColumn(page)).toEqual(['b1', 'c1', 'a1', 'd1']);
    await dragCells(page, cell(1, 1), cell(2, 1));
    await page.evaluate(() => window.core.table.moveRow(1));
    expect(await firstColumn(page)).toEqual(['a1', 'b1', 'c1', 'd1']);
  });

  test('범위 안에 세로 병합이 있으면 이동 메뉴 비활성·무동작', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>a</td></tr><tr><td rowspan="2">b</td></tr><tr></tr><tr><td>d</td></tr></tbody></table><p>x</p>');
    await caret(page, 'tr:nth-child(2) td', 0);
    const items = await page.evaluate(() => window.core.table.getMenuItems()[0].children.filter((i) => /이동/.test(i.label ?? '')).map((i) => i.disabled));
    expect(items).toEqual([true, true]);
  });

  test('범위 드래그를 표 밖에서 놓은 뒤 바깥 드래그로 범위가 잡히지 않는다', async ({ page }) => {
    await setHTML(page, `${TABLE}<p>out</p>`);
    await dragCells(page, cell(1, 1), cell(1, 2), false);
    const out = await center(page, 'p');
    await page.mouse.move(out.x, out.y + 200, { steps: 3 });
    await page.mouse.up();
    await page.mouse.move(out.x, out.y);
    await page.mouse.down();
    const inside = await center(page, cell(2, 2));
    await page.mouse.move(inside.x, inside.y, { steps: 4 });
    const other = await center(page, cell(3, 2));
    await page.mouse.move(other.x, other.y, { steps: 4 });
    await page.mouse.up();
    expect(await tableSel(page)).toBeNull();
  });

  test('rowspan 이 표보다 큰 표: 불러올 때 정규화, 분할·행 삭제 오류 없음', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const BIG = '<table><tbody><tr><td rowspan="5">a</td><td>b</td></tr><tr><td>c</td></tr></tbody></table><p>x</p>';
    await setHTML(page, BIG);
    expect(await html(page)).toContain('rowspan="2"');
    await caret(page, 'td', 0);
    await page.evaluate(() => window.core.table.splitCell());
    expect(await page.evaluate(() => window.core.root.querySelectorAll('td').length)).toBe(4);
    await setHTML(page, BIG);
    await caret(page, 'td:nth-child(2)', 0);
    await page.evaluate(() => window.core.table.deleteRow());
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td><td>c</td></tr></tbody></table><p>x</p>');
    await setHTML(page, '<table><tbody><tr><td rowspan="9">a</td><td>b</td></tr></tbody></table><p>x</p>');
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>x</p>');
    await caret(page, 'td', 0);
    await page.evaluate(() => window.core.table.addRow(true));
    expect(await page.evaluate(() => window.core.root.querySelectorAll('tr').length)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('thead 끝을 넘는 rowspan 은 구역 안으로', async ({ page }) => {
    await setHTML(page, '<table><thead><tr><th rowspan="3">h</th><th>i</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>x</p>');
    expect(await html(page)).not.toContain('rowspan');
  });

  test('colgroup 2개 표 초기화 뒤 col 이 남지 않는다', async ({ page }) => {
    await setHTML(page, '<table><colgroup><col style="width:30%"></colgroup><colgroup><col style="width:70%"></colgroup><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>x</p>');
    await caret(page, 'td', 0);
    await page.evaluate(() => window.core.table.resetColumnWidths());
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>x</p>');
  });

  test('col 1개 3열 표 열 추가: col 이 열 수와 맞고 새 열 자리에 들어간다', async ({ page }) => {
    await setHTML(page, '<table><colgroup><col style="width:100px"></colgroup><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table><p>x</p>');
    await caret(page, 'td:nth-child(3)', 0);
    const before = await page.evaluate(() => { window.core.root.querySelector('col').dataset.mark = '1'; return 0; });
    expect(before).toBe(0);
    await page.evaluate(() => window.core.table.addColumn(false));
    const cols = await page.evaluate(() => Array.from(window.core.root.querySelectorAll('col')).map((c) => [c.dataset.mark || '', c.style.width]));
    expect(cols).toHaveLength(4);
    expect(cols[0][0]).toBe('1');
    cols.forEach(([, w]) => expect(w).toMatch(/%$/));
  });
});

test.describe('10. UI', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('표 크기·서식 팝업이 화면 아래로 잘리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 260 });
    await page.locator('.jm-btn[data-cmd="table"]').click();
    const grid = await page.evaluate(() => { const r = document.querySelector('.jm-gridpicker').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
    expect(grid.top).toBeGreaterThanOrEqual(0);
    expect(grid.bottom).toBeLessThanOrEqual(grid.h);
    await page.keyboard.press('Escape');
    await page.locator('.jm-btn[data-cmd="format"]').click();
    await page.waitForSelector('.jm-formatpicker-cat');
    const fmt = await page.evaluate(() => { const r = document.querySelector('.jm-formatpicker').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
    expect(fmt.top).toBeGreaterThanOrEqual(0);
    expect(fmt.bottom).toBeLessThanOrEqual(fmt.h);
  });

  test('색 선택기: 바깥 스크롤에 닫히고 안쪽 스크롤에는 그대로', async ({ page }) => {
    await page.evaluate(() => { document.documentElement.style.height = '4000px'; });
    await page.locator('.jm-btn[data-cmd="color"]').click();
    const hidden = () => page.evaluate(() => document.querySelector('.jm-colorpicker').hidden);
    expect(await hidden()).toBe(false);
    await page.evaluate(() => document.querySelector('.jm-colorpicker').dispatchEvent(new Event('scroll')));
    expect(await hidden()).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForFunction(() => document.querySelector('.jm-colorpicker').hidden);
  });

  test('같은 목록 버튼을 다시 누르면 닫히고, 다른 버튼이면 그 목록이 열린다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await caret(page, 'p', 0);
    const menu = page.locator('.jm-listmenu');
    for (const cmd of ['ulType', 'olType', 'heading', 'alignMenu', 'quote', 'fontSize']) {
      await page.locator(`.jm-btn[data-cmd="${cmd}"]`).click();
      await expect(menu).toBeVisible();
      await page.locator(`.jm-btn[data-cmd="${cmd}"]`).click();
      await expect(menu).toBeHidden();
    }
    await page.locator('.jm-btn[data-cmd="ulType"]').click();
    await page.locator('.jm-btn[data-cmd="olType"]').click();
    await expect(menu).toBeVisible();
    expect(await menu.locator('button').count()).toBe(7);
  });

  test('setMode·setHTML 끝에 툴바 상태 갱신', async ({ page }) => {
    await setHTML(page, '<p><strong>a</strong></p>');
    await caret(page, 'strong', 1);
    const bold = page.locator('.jm-btn[data-cmd="bold"]');
    await expect(bold).toHaveClass(/is-active/);
    await page.evaluate(() => window.ed.setHTML('<p>b</p>'));
    await expect(bold).not.toHaveClass(/is-active/);
    await page.evaluate(() => { window.ed.setMode('html'); window.ed.setMode('editor'); });
    expect(await page.evaluate(() => window.ed.buttons.valignMenu.disabled)).toBe(true);
  });

  test('미리보기로 바꾸면 입력줄이 닫힌다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await page.locator('.jm-btn[data-cmd="link"]').click();
    await expect(page.locator('.jm-inputbar')).toBeVisible();
    await page.evaluate(() => window.ed.setMode('preview'));
    await expect(page.locator('.jm-inputbar')).toBeHidden();
  });

  test('HTML 모드에서 고치면 dirty', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await page.evaluate(() => { window.ed.setMode('html'); window.ed.dirty = false; });
    await page.locator('.jm-source').fill('<p>b</p>');
    expect(await page.evaluate(() => window.ed.dirty)).toBe(true);
  });

  test('data-interval=4000 슬라이드 선택 상자에 값이 보인다', async ({ page }) => {
    await setHTML(page, `<div data-type="slider" data-interval="4000"><img src="${IMG}"></div><p>x</p>`);
    const s = page.locator('.jm-slider-interval');
    await expect(s).toHaveValue('4000');
    expect(await s.evaluate((el) => el.selectedOptions[0].textContent)).toBe('4초');
    expect(await html(page)).toContain('data-interval="4000"');
  });

  test('버튼 추가: 주소 기본값 https:// 만 있으면 # 으로 저장', async ({ page }) => {
    await setHTML(page, '<div data-type="buttons" data-align="left"><a href="/a" data-role="button" data-style="primary">a</a></div><p>x</p>');
    await page.evaluate(() => window.core.root.querySelector('.jm-buttons-add, .jm-buttons-btn').click());
    await page.locator('.jm-buttons-addname').fill('b');
    await expect(page.locator('.jm-buttons-addurl')).toHaveValue('https://');
    await page.locator('.jm-buttons-addok').click();
    const saved = await html(page);
    expect(saved).not.toContain('href="https://"');
    expect(saved).toContain('href="#"');
  });

  test('링크 이미지 삭제 뒤 빈 a 가 남지 않는다', async ({ page }) => {
    await setHTML(page, `<p><a href="/u"><img src="${IMG}"></a></p>`);
    await page.evaluate(() => window.core.image.remove(window.core.root.querySelector('img')));
    expect(await html(page)).toBe('<p><br></p>');
    await setHTML(page, `<p>a<a href="/u"><strong><img src="${IMG}"></strong></a>b</p>`);
    await page.evaluate(() => window.core.image.remove(window.core.root.querySelector('img')));
    expect(await html(page)).toBe('<p>ab</p>');
  });

  test('폭 360 갤러리 헤더 글자가 쪼개지지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await setHTML(page, '<div data-type="gallery" data-layout="justify"></div><p>x</p>');
    const heights = await page.evaluate(() => Array.from(document.querySelectorAll('.jm-gallery-title, .jm-gallery-header button')).map((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return [el.textContent, Math.max(...Array.from(r.getClientRects()).map((c) => c.height)), new Set(Array.from(r.getClientRects()).map((c) => Math.round(c.top))).size];
    }));
    expect(heights.length).toBeGreaterThan(1);
    heights.forEach(([, , lines]) => expect(lines).toBe(1));
  });

  test('갤러리 제목 끝 Delete·처음 Backspace 가 앞뒤 문단과 합치지 않는다', async ({ page }) => {
    const SRC = `<p>앞</p><div data-type="gallery" data-layout="justify"><p data-role="title">제목</p><img src="${IMG}"></div><p>뒤</p>`;
    await setHTML(page, SRC);
    const before = await html(page);
    const put = (atEnd) => page.evaluate((end) => {
      const t = window.core.root.querySelector('p[data-role="title"]');
      t.focus();
      const r = document.createRange();
      r.setStart(t.firstChild, end ? t.firstChild.length : 0); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, atEnd);
    await put(true);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(before);
    await put(false);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe(before);
    await put(true);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toContain('>제</p>');
  });
});

test.describe('12. pre 붙여넣기', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('줄마다 br 로 줄을 지키고 들여쓰기를 살린다', async ({ page }) => {
    await setHTML(page, '<p><br></p>');
    await caretIn(page, 'p');
    await paste(page, { htmlData: '<pre>a\n  b\n\nc\n</pre>' });
    expect(await html(page)).toBe('<p>a<br>&nbsp;&nbsp;b<br><br>c</p>');
  });

  test('pre 안 서식은 남고 줄도 유지된다', async ({ page }) => {
    await setHTML(page, '<p>앞</p>');
    await caret(page, 'p', 1);
    await paste(page, { htmlData: '<div>x</div><pre><b>a</b>\nb</pre>' });
    expect(await html(page)).toContain('<strong>a</strong><br>b');
  });

  test('pre 가 아닌 글의 소스 줄바꿈은 그대로 (공백 취급)', async ({ page }) => {
    await setHTML(page, '<p><br></p>');
    await caretIn(page, 'p');
    await paste(page, { htmlData: '<p>a\nb</p>' });
    expect(await html(page)).toBe('<p>a\nb</p>');
  });
});

test.describe('문서의 명령 표', () => {
  test('lineHeight 잘못된 값은 false, 찾기 API 는 문서대로', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>abc abc</p>');
    await caret(page, 'p', 1);
    expect(await exec(page, 'lineHeight', 'x')).toBe(false);
    expect(await exec(page, 'lineHeight', '1.5')).toBe(true);
    const r = await page.evaluate(() => {
      const f = window.core.find;
      f.search('abc', { caseSensitive: false });
      const n = f.count;
      f.next(); f.prev();
      f.replaceAll('d');
      f.clear();
      window.ed.openFind(true); const opened = !window.ed.findBar.el.hidden;
      window.ed.closeFind();
      return { n, opened, closed: window.ed.findBar.el.hidden };
    });
    expect(r).toEqual({ n: 2, opened: true, closed: true });
    expect(await html(page)).toBe('<p style="line-height: 1.5">d d</p>');
  });
});

test.describe('C. 복사·붙여넣기', () => {
  const copyKey = 'ControlOrMeta+C';
  const cutKey = 'ControlOrMeta+X';
  const pasteKey = 'ControlOrMeta+V';
  const PARA = '<p>가나 <strong>굵게</strong> 다라 <span style="color: #d32f2f">빨강</span> 끝</p>';
  const realClipboard = async (page, context, browserName) => {
    test.skip(browserName !== 'chromium', '클립보드 권한은 Chromium 만');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
  };
  const pWidth = (page, n) => page.evaluate((i) => {
    const r = document.createRange();
    r.selectNodeContents(window.core.root.querySelectorAll('p')[i]);
    return r.getBoundingClientRect().width;
  }, n);

  test('문단 복사·붙여넣기 3회: 저장 HTML 이 원본과 같고 폭이 유지된다', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, `${PARA}<p><br></p>`);
    const w = await pWidth(page, 0);
    for (let i = 0; i < 3; i++) {
      await selectAcross(page, `p:nth-child(${i + 1})`);
      await page.keyboard.press(copyKey);
      await caretIn(page, `p:nth-child(${i + 2})`);
      await page.keyboard.press(pasteKey);
      const want = PARA.repeat(i + 2);
      await expect.poll(() => html(page)).toBe(want);
      expect(Math.abs(await pWidth(page, i + 1) - w)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.core.root.lastElementChild.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' })));
    }
    expect(await html(page)).not.toContain('font-family');
  });

  test('글 일부 선택: 문단 없이 글자만 이어 붙는다', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<p>abcdef</p><p>xy</p>');
    await select(page, 'p', 1, 3);
    await page.keyboard.press(copyKey);
    await caret(page, 'p:nth-child(2)', 1);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toBe('<p>abcdef</p><p>xbcy</p>');
  });

  test('strong·색 span 안 일부 선택: 서식을 유지', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<p><strong>abcd</strong><span style="color: #d32f2f">efgh</span></p><p>xy</p>');
    await select(page, 'strong', 1, 3);
    await page.keyboard.press(copyKey);
    await caret(page, 'p:nth-child(2)', 1);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toContain('<p>x<strong>bc</strong>y</p>');
    await select(page, 'span', 0, 2);
    await page.keyboard.press(copyKey);
    await caret(page, 'p:nth-child(2)', 0);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toContain('<p><span style="color: #d32f2f">ef</span>x<strong>bc</strong>y</p>');
  });

  test('여러 블록 선택은 블록 유지, 끝 빈 문단은 안 따라온다', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<h2>t</h2><p>u</p><p>v</p><p><br></p>');
    await page.evaluate(() => {
      const k = window.core.root.children;
      const r = document.createRange();
      r.setStart(k[0].firstChild, 0); r.setEnd(k[2], 0);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.keyboard.press(copyKey);
    await caretIn(page, 'p:last-child');
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toBe('<h2>t</h2><p>u</p><p>v</p><h2>t</h2><p>u</p>');
  });

  test('표 칸 안 글 복사', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<table><tbody><tr><td>a<strong>bc</strong></td><td>x</td></tr></tbody></table><p>y</p>');
    await select(page, 'strong', 0, 2);
    await page.keyboard.press(copyKey);
    await caret(page, 'td:nth-child(2)', 1);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toContain('<td>x<strong>bc</strong></td>');
    expect(await html(page)).not.toContain('contenteditable');
  });

  test('잘라내기: 글이 지워지고 서식째 붙는다, 되돌리기 가능', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<p>a<strong>bcd</strong>e</p><p>xy</p>');
    await select(page, 'strong', 0, 3);
    await page.keyboard.press(cutKey);
    await expect.poll(() => html(page)).toBe('<p>ae</p><p>xy</p>');
    await caret(page, 'p:nth-child(2)', 1);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => html(page)).toBe('<p>ae</p><p>x<strong>bcd</strong>y</p>');
  });

  test('클립보드 글자는 블록 줄바꿈을 지키고 ZWSP·편집 속성이 없다', async ({ page, context, browserName }) => {
    await realClipboard(page, context, browserName);
    await setHTML(page, '<p><a href="/u">link</a></p><p>z</p>');
    await selectAcross(page, 'p');
    await page.keyboard.press(copyKey);
    const r = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return { text: await (await item.getType('text/plain')).text(), html: await (await item.getType('text/html')).text() };
    });
    expect(r.text.replace(/\n+/g, '|')).toBe('link|z');
    expect(r.html).toContain('<a ');
    expect(r.html).not.toContain('data-jm');
    await setHTML(page, '<p><a href="/u">link</a></p><p>z</p>');
    await select(page, 'a', 0, 4);
    await page.keyboard.press(copyKey);
    await caret(page, 'p:nth-child(2)', 1);
    await page.keyboard.press(pasteKey);
    await expect.poll(() => canonical(page)).toBe('<p><a href="/u" rel="noopener noreferrer" target="_blank">link</a></p><p>z<a href="/u" rel="noopener noreferrer" target="_blank">link</a></p>');
  });

  const COMPUTED = 'orphans: 2; widows: 2; -webkit-text-stroke-width: 0px; font-family: &quot;Apple SD Gothic Neo&quot;, serif; font-size: 16px; letter-spacing: 1px; line-height: 2; text-indent: 3px; word-spacing: 1px';

  test.describe('다른 페이지 계산 스타일', () => {
    test.beforeEach(async ({ page }) => { await open(page); await setHTML(page, '<p><br></p>'); await caretIn(page, 'p'); });

    test('글꼴·크기·본문색·흰 배경을 빼고 다른 색은 남긴다', async ({ page }) => {
      await paste(page, { htmlData: `<span style="color: rgb(31, 36, 33); background-color: rgb(255, 255, 255); ${COMPUTED}">본문 글자 길게</span><strong style="color: rgb(31, 36, 33); font-weight: 700; ${COMPUTED}">굵게</strong><span style="color: rgb(200, 0, 0); ${COMPUTED}">빨강</span><span style="color: rgb(31, 36, 33); background-color: yellow; ${COMPUTED}">표시</span>` });
      expect(await html(page)).toBe('<p>본문 글자 길게<strong>굵게</strong><span style="color: rgb(200, 0, 0)">빨강</span><span style="color: rgb(31, 36, 33); background-color: yellow">표시</span></p>'); // 배경이 남는 요소의 글자색은 빼지 않는다
    });

    test('표시가 없는 일반 인라인 style 은 그대로', async ({ page }) => {
      await paste(page, { htmlData: '<span style="color: red; font-size: 20px; background-color: white">a</span>' });
      expect(await html(page)).toBe('<p><span style="color: red; font-size: 20px; background-color: white">a</span></p>');
    });

    test('오피스 붙여넣기는 건드리지 않는다', async ({ page }) => {
      await paste(page, { htmlData: '<span style="mso-font-kerning:0pt; orphans: 2; widows: 2; font-size: 20px">a</span>' });
      expect(await html(page)).toBe('<p><span style="font-size: 20px">a</span></p>');
    });

    test('끝 br·같은 style 중첩이 쌓이지 않는다', async ({ page }) => {
      await paste(page, { htmlData: '<span style="color: red"><span style="color: red">a</span><br></span>' });
      expect(await html(page)).toBe('<p><span style="color: red">a</span></p>');
    });

    test('같은 색 span 안에 붙여넣어도 중첩되지 않는다', async ({ page }) => {
      await setHTML(page, '<p><span style="color: red">ab</span></p>');
      await caret(page, 'span', 1);
      await paste(page, { htmlData: '<span style="color: red">x</span>' });
      expect(await html(page)).toBe('<p><span style="color: red">axb</span></p>');
    });
  });
});

test.describe('D. 리뷰 반영', () => {
  /** 합성 복사·잘라내기: 클립보드에 넣은 값을 돌려준다 */
  const clip = (page, type = 'copy', target = 'root') => page.evaluate(([t, where]) => {
    const dt = new DataTransfer();
    const el = where === 'root' ? window.core.root : document.body;
    const ev = new ClipboardEvent(t, { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { html: dt.getData('text/html'), text: dt.getData('text/plain'), prevented: ev.defaultPrevented };
  }, [type, target]);
  const COMP = 'orphans: 2; widows: 2; -webkit-text-stroke-width: 0px';
  const pasteInto = async (page, htmlData) => {
    await setHTML(page, '<p><br></p>');
    await caretIn(page, 'p');
    await paste(page, { htmlData });
  };
  test.beforeEach(async ({ page }) => { await open(page); });

  test.describe('1. 계산 스타일 판단', () => {
    for (const [name, src, out] of [
      ['유색 한 종류는 유지', `<span style="color: rgb(200, 0, 0); ${COMP}">빨강</span>`, '<p><span style="color: rgb(200, 0, 0)">빨강</span></p>'],
      ['흰 글자 + 어두운 배경은 색 유지', `<span style="color: rgb(255, 255, 255); background-color: #111; ${COMP}">w</span>`, '<p><span style="color: rgb(255, 255, 255); background-color: #111">w</span></p>'],
      ['무채색 한 종류는 뺀다', `<span style="color: rgb(31, 36, 33); ${COMP}">a</span>`, '<p>a</p>'],
      ['회색 이름도', `<span style="color: gray; ${COMP}">a</span>`, '<p>a</p>'],
      ['28px 한 종류는 유지', `<span style="font-size: 28px; ${COMP}">a</span>`, '<p><span style="font-size: 28px">a</span></p>'],
      ['16px·medium 한 종류는 뺀다', `<span style="font-size: 16px; ${COMP}">a</span><span style="font-size: medium; ${COMP}">b</span>`.replace('font-size: medium', 'font-size: 16px'), '<p>ab</p>'],
      ['크기 두 종류면 많은 값만 뺀다', `<span style="font-size: 16px; ${COMP}">긴 본문</span><span style="font-size: 28px; ${COMP}">t</span>`, '<p>긴 본문<span style="font-size: 28px">t</span></p>'],
      ['색 두 종류면 많은 값만 뺀다(유색이라도)', `<span style="color: rgb(0, 0, 200); ${COMP}">긴 본문</span><span style="color: rgb(200, 0, 0); ${COMP}">t</span>`, '<p>긴 본문<span style="color: rgb(200, 0, 0)">t</span></p>'],
    ]) {
      test(name, async ({ page }) => {
        await pasteInto(page, src);
        expect(await html(page)).toBe(out);
      });
    }
  });

  test.describe('2. 표 칸 범위', () => {
    const T = '<table><tbody><tr><td colspan="2">a</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr></tbody></table><p>x</p>';

    test('복사: 표 HTML(병합 포함)과 탭·줄바꿈 글', async ({ page }) => {
      await setHTML(page, T);
      await dragCells(page, 'tr:nth-child(1) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      const r = await clip(page, 'copy', 'body');
      expect(r.prevented).toBe(true);
      expect(r.html).toBe('<table><tbody><tr><td colspan="2">a</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>');
      expect(r.text).toBe('a\nd\te');
    });

    test('잘라내기: 칸 비우기, 되돌리기 한 단계', async ({ page }) => {
      await setHTML(page, T);
      await dragCells(page, 'tr:nth-child(2) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      const before = await undoSteps(page);
      const r = await clip(page, 'cut', 'body');
      expect(r.text).toBe('d\te');
      expect(await html(page)).toContain('<tr><td><br></td><td><br></td><td>f</td></tr>');
      expect(await undoSteps(page)).toBe(before + 1);
      await exec(page, 'undo');
      expect(await html(page)).toBe(T);
    });

    for (const key of ['Delete', 'Backspace']) {
      test(`${key}: 칸 비우기`, async ({ page }) => {
        await setHTML(page, T);
        await dragCells(page, 'tr:nth-child(2) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
        await page.keyboard.press(key);
        expect(await html(page)).toContain('<tr><td><br></td><td><br></td><td>f</td></tr>');
      });
    }

    test('붙여넣기: 글은 첫 칸에, 표는 표 뒤에 (글자로 내리지 않음)', async ({ page }) => {
      await setHTML(page, T);
      await dragCells(page, 'tr:nth-child(2) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'K'); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
      expect(await html(page)).toContain('<td>dK</td>');
      await setHTML(page, T);
      await dragCells(page, 'tr:nth-child(2) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/html', '<table><tbody><tr><td>N</td></tr></tbody></table>'); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
      const out = await html(page);
      expect(out).toContain('</table><table><tbody><tr><td>N</td></tr></tbody></table>');
    });

    test('실제 Ctrl+C·X (chromium)', async ({ page, context, browserName }) => {
      test.skip(browserName !== 'chromium', '클립보드 권한은 Chromium 만');
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await setHTML(page, T);
      await dragCells(page, 'tr:nth-child(2) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      await page.keyboard.press('ControlOrMeta+C');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('d\te');
      await page.keyboard.press('ControlOrMeta+X');
      expect(await html(page)).toContain('<tr><td><br></td><td><br></td><td>f</td></tr>');
    });
  });

  test.describe('3·4. 클립보드 글자', () => {
    test('슬라이드 범위 복사에 편집 UI 글자가 없다', async ({ page }) => {
      await setHTML(page, `<p>앞</p><div data-type="slider" data-interval="0"><p data-role="title">제목</p><img src="${IMG}"></div><p>뒤</p>`);
      await page.evaluate(() => {
        const ps = window.core.root.querySelectorAll(':scope > p');
        const r = document.createRange();
        r.setStart(ps[0].firstChild, 0); r.setEnd(ps[1].firstChild, 1);
        window.core.root.focus();
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      expect((await clip(page)).text).toBe('앞\n제목\n뒤');
    });

    test('전체 선택 글자에 줄바꿈이 있다', async ({ page }) => {
      await setHTML(page, '<h2>t</h2><p>a<br>b</p><ul><li>c</li><li>d</li></ul><table><tbody><tr><td>e</td><td><p>f</p></td></tr><tr><td>g</td><td>h</td></tr></tbody></table>');
      await caret(page, 'h2', 0);
      await page.keyboard.press('ControlOrMeta+a');
      expect((await clip(page)).text).toBe('t\na\nb\nc\nd\ne\tf\ng\th');
    });

    test('공통 함수 규칙: 플러그인은 제목·버튼 글자만, 빈 문단은 빈 줄', async ({ page }) => {
      const r = await page.evaluate(() => window.core.constructor.plainText('<p>a</p><p><br></p><div data-type="buttons"><a href="#" data-role="button">b1</a><a href="#" data-role="button">b2</a></div><div data-type="youtube"><iframe title="x"></iframe></div><div data-type="map" data-title="장소"></div><div data-type="gallery"><p data-role="title">g</p><img></div><p>z</p>'));
      expect(r).toBe('a\n\nb1\nb2\ng\nz');
    });
  });

  test.describe('5. 절대 주소', () => {
    test('클립보드 HTML 만 절대 주소, 편집 내용은 그대로', async ({ page }) => {
      await setHTML(page, '<p><a href="/u">l</a><a href="#x">m</a><a href="mailto:a@b.c">n</a><img src="/uploads/a.png"></p><p>z</p>');
      await selectAcross(page, 'p');
      const origin = new URL(page.url()).origin;
      const r = await clip(page);
      expect(r.html).toContain(`href="${origin}/u"`);
      expect(r.html).toContain(`src="${origin}/uploads/a.png"`);
      expect(r.html).toContain('href="#x"');
      expect(r.html).toContain('href="mailto:a@b.c"');
      expect(await html(page)).toContain('href="/u"');
    });

    test('srcset 도 절대 주소, 같은 출처 붙여넣기는 / 경로로 되돌림, 다른 출처는 그대로', async ({ page }) => {
      const origin = new URL(page.url()).origin;
      await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m.png 2x"><img src="/a.png"></picture>t</p><p>z</p>');
      await selectAcross(page, 'p:nth-child(2)');
      await page.evaluate(() => {
        const p = window.core.root.querySelector('p');
        const r = document.createRange();
        r.setStartBefore(p.firstChild); r.setEnd(p.lastChild, 1);
        window.core.root.focus();
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      expect((await clip(page)).html).toContain(`srcset="${origin}/m.png 2x"`);
      await pasteInto(page, `<a href="${origin}/u">a</a><a href="https://other.example/u">b</a><img src="${origin}/p.png">`);
      const out = await canonical(page);
      expect(out).toContain('href="/u"');
      expect(out).toContain('href="https://other.example/u"');
      expect(out).toContain('src="/p.png"');
    });
  });

  test.describe('6. 끝 br', () => {
    for (const [src, out] of [
      ['<p>a</p><p><br></p>', '<p>a</p><p><br></p>'],
      ['<table><tbody><tr><td><br></td></tr></tbody></table>', '<td><br></td>'],
      ['<p>a<br><br></p>', '<p>a<br><br></p>'],
      ['<p>a<br></p><p>b<br></p>', '<p>a<br></p><p>b</p>'],
      ['a<span style="color: red"><br></span>', '<p>a</p>'],
    ]) {
      test(src, async ({ page }) => {
        await page.evaluate(() => 0);
        const r = await page.evaluate((h) => window.JM.Sanitizer.tidyPaste(h), src.startsWith('a') ? `<p>${src}</p>` : src);
        expect(r).toContain(out);
      });
    }
  });

  test.describe('7. 서식 중첩 비교', () => {
    test('다른 색을 사이에 둔 같은 색은 벗기지 않는다, 사이가 다른 속성이면 벗긴다', async ({ page }) => {
      const S = (c, x) => `<span style="color: ${c}">${x}</span>`;
      const r = await page.evaluate((h) => window.JM.Sanitizer.tidyPaste(h), S('red', `r${S('blue', `b${S('red', 'r2')}`)}`));
      expect(r).toBe(S('red', `r${S('blue', `b${S('red', 'r2')}`)}`));
      const r2 = await page.evaluate((h) => window.JM.Sanitizer.tidyPaste(h), S('red', `<span style="font-size: 20px">${S('red', 'x')}</span>`));
      expect(r2).toBe(S('red', '<span style="font-size: 20px">x</span>'));
    });

    test('커서 조상도 같은 규칙', async ({ page }) => {
      await setHTML(page, '<p><span style="color: red">r<span style="color: blue">bb</span></span></p>');
      await select(page, 'span span', 1, 1);
      await paste(page, { htmlData: '<span style="color: red">x</span>' });
      expect(await html(page)).toContain('<span style="color: red">x</span>');
    });
  });

  test('8. dt~dd 범위 복사는 dl 로 감싼다', async ({ page }) => {
    test.skip(structureOff(), '구조 모드 전용');
    await setHTML(page, '<dl class="k"><dt>t</dt><dd>d</dd></dl><p>x</p>');
    await page.evaluate(() => {
      const r = document.createRange();
      r.setStart(window.core.root.querySelector('dt').firstChild, 0);
      r.setEnd(window.core.root.querySelector('dd').firstChild, 1);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    expect((await clip(page)).html).toBe('<dl class="k"><dt>t</dt><dd>d</dd></dl>');
  });

  test('9. 클릭 선택 이미지 복사·잘라내기', async ({ page }) => {
    await setHTML(page, `<p>a<img src="${IMG}" alt="k">b</p>`);
    await page.evaluate(() => window.core.image.select(window.core.root.querySelector('img')));
    const c = await clip(page, 'copy', 'body');
    expect(c.prevented).toBe(true);
    expect(c.html).toBe(`<img src="${IMG}" alt="k">`);
    await clip(page, 'cut', 'body');
    expect(await html(page)).toBe('<p>ab</p>');
  });

  test('10. 문단~갤러리 제목 맨 앞 선택: 빈 갤러리가 복사되지 않는다', async ({ page }) => {
    await setHTML(page, `<p>a</p><div data-type="gallery" data-layout="justify"><p data-role="title">제목</p></div><p>b</p>`);
    await page.evaluate(() => {
      const r = document.createRange();
      r.setStart(window.core.root.querySelector('p').firstChild, 0);
      r.setEnd(window.core.root.querySelector('p[data-role="title"]').firstChild, 0);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    const c = await clip(page);
    expect(c.html).not.toContain('gallery');
    expect(c.text).toBe('a');
  });

  test('11. 갤러리 제목 입력 → undo → redo 복원', async ({ page }) => {
    await setHTML(page, '<div data-type="gallery" data-layout="justify"><p data-role="title">가</p></div><p>b</p>');
    await page.evaluate(() => {
      const t = window.core.root.querySelector('p[data-role="title"]');
      t.focus();
      const r = document.createRange();
      r.setStart(t.firstChild, 1); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.keyboard.type('나');
    await page.evaluate(() => window.core.history.push());
    const typed = await html(page);
    expect(typed).toContain('가나');
    await exec(page, 'undo');
    expect(await page.evaluate(() => [window.core.history.undoStack.length, window.core.history.redoStack.length])).toEqual([0, 1]);
    await exec(page, 'redo');
    expect(await html(page)).toBe(typed);
  });

  test.describe('13. 남은 것', () => {
    const THREE = '<table><colgroup><col style="width: 10%"><col style="width: 20%"><col style="width: 70%"></colgroup><tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table><p>x</p>';
    test('열 범위 이동: 두 열이 함께, col 도', async ({ page }) => {
      await setHTML(page, THREE);
      await dragCells(page, 'tr:nth-child(1) td:nth-child(2)', 'tr:nth-child(2) td:nth-child(3)');
      await page.evaluate(() => window.core.table.moveColumn(-1));
      expect(await page.evaluate(() => Array.from(window.core.root.querySelector('tr').cells).map((c) => c.textContent).join(''))).toBe('231');
      expect(await page.evaluate(() => Array.from(window.core.root.querySelectorAll('col')).map((c) => c.style.width).join())).toBe('20%,70%,10%');
      await dragCells(page, 'tr:nth-child(1) td:nth-child(1)', 'tr:nth-child(2) td:nth-child(2)');
      await page.evaluate(() => window.core.table.moveColumn(1));
      expect(await page.evaluate(() => Array.from(window.core.root.querySelector('tr').cells).map((c) => c.textContent).join(''))).toBe('123');
    });

    test('범위 안 병합이 있으면 열 이동 메뉴 비활성', async ({ page }) => {
      await setHTML(page, '<table><tbody><tr><td>1</td><td rowspan="2">2</td><td>3</td></tr><tr><td>4</td><td>6</td></tr></tbody></table><p>x</p>');
      await caret(page, 'td:nth-child(1)', 0);
      const d = await page.evaluate(() => window.core.table.getMenuItems()[1].children.filter((i) => /이동/.test(i.label ?? '')).map((i) => i.disabled));
      expect(d).toEqual([true, true]);
    });

    test('표 크기·서식 팝업도 바깥 스크롤에 닫힌다', async ({ page }) => {
      await page.evaluate(() => { document.documentElement.style.height = '4000px'; });
      for (const [cmd, sel] of [['table', '.jm-gridpicker'], ['format', '.jm-formatpicker']]) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator(`.jm-btn[data-cmd="${cmd}"]`).click();
        await expect(page.locator(sel)).toBeVisible();
        await page.evaluate((s) => document.querySelector(s).dispatchEvent(new Event('scroll')), sel);
        await expect(page.locator(sel)).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 50));
        await page.waitForFunction((s) => document.querySelector(s).hidden, sel);
      }
    });
  });
});
