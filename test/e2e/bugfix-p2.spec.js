/**
 * 2순위 버그 수정 회귀 테스트 — 범위 블록 명령, li·인용 판정, 인라인 끄기, 다크 변수, 정제, 표·이미지·메뉴·단축키, 붙여넣기
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret, exec, paste } from './helpers.js';

/** 첫 selector 요소 처음 ~ 마지막 selector 요소 끝까지 선택 */
async function selectAcross(page, selector) {
  await page.evaluate((sel) => {
    const els = window.core.root.querySelectorAll(sel);
    const r = document.createRange();
    r.setStart(els[0].firstChild, 0);
    const last = els[els.length - 1].firstChild;
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

const state = (page) => page.evaluate(() => window.core.commands.getState());
const THREE = '<p>a</p><p>b</p><p>c</p>';
const IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

test.describe('1. 범위 안 글 블록 모두', () => {
  test.beforeEach(async ({ page }) => { await open(page); await setHTML(page, THREE); await selectAcross(page, 'p'); });

  test('h2 를 모두에, 다시 누르면 모두 문단으로', async ({ page }) => {
    await exec(page, 'h2');
    expect(await html(page)).toBe('<h2>a</h2><h2>b</h2><h2>c</h2>');
    await exec(page, 'h2');
    expect(await html(page)).toBe(THREE);
  });

  test('ul 은 한 목록으로, 다시 누르면 해제', async ({ page }) => {
    await exec(page, 'ul');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
    await exec(page, 'ul');
    expect(await html(page)).toBe(THREE);
  });

  test('quote 를 모두에, 다시 누르면 모두 해제', async ({ page }) => {
    await exec(page, 'quote');
    expect(await html(page)).toBe('<blockquote>a</blockquote><blockquote>b</blockquote><blockquote>c</blockquote>');
    await exec(page, 'quote');
    expect(await html(page)).toBe(THREE);
  });

  test('alignCenter 를 모두에', async ({ page }) => {
    await exec(page, 'alignCenter');
    expect((await html(page)).replace(/;"/g, '"')).toBe('<p style="text-align: center">a</p><p style="text-align: center">b</p><p style="text-align: center">c</p>');
  });

  test('다음 문단 맨 앞에서 끝나는 선택은 그 문단을 건드리지 않는다', async ({ page }) => {
    await page.evaluate(() => {
      const ps = window.core.root.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[0].firstChild, 0); r.setEnd(ps[1].firstChild, 0);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await exec(page, 'h2');
    expect(await html(page)).toBe('<h2>a</h2><p>b</p><p>c</p>');
  });
});

test.describe('2. li 직속 p 는 li 로 판정', () => {
  test('ul 토글이 중첩되지 않고 해제, getState.list', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li><p>a</p></li></ul>');
    await caret(page, 'p', 1);
    expect((await state(page)).list).toBe('ul');
    await exec(page, 'ul');
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('빈 li 안 p 에서 Enter 면 문단으로 (div 안 생김)', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li>x</li><li><p><br></p></li></ul>');
    await caretIn(page, 'li:nth-child(2) p');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>x</li></ul><p><br></p>');
  });
});

test.describe('3. 조상 blockquote 까지 판정', () => {
  const Q = '<blockquote><p>a</p><p>b</p></blockquote>';
  test.beforeEach(async ({ page }) => { await open(page); await setHTML(page, Q); await caret(page, 'p', 1); });

  test('토글은 중첩하지 않고 푼다', async ({ page }) => {
    await exec(page, 'quote');
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
  });

  test('quote(null) 은 풀고 getState.quote 는 스타일', async ({ page }) => {
    expect((await state(page)).quote).toBe('line');
    await exec(page, 'quote', null);
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
  });

  test('스타일 지정은 바깥 인용에', async ({ page }) => {
    await exec(page, 'quote', 'box');
    expect(await html(page)).toBe('<blockquote data-style="box"><p>a</p><p>b</p></blockquote>');
  });
});

test.describe('4. 커서에서 인라인 끄기', () => {
  test('글자 중간에서 끄면 태그를 나눈다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong>abcdef</strong></p>');
    await caret(page, 'strong', 3);
    await exec(page, 'bold');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p><strong>abc</strong>X<strong>def</strong></p>');
  });

  test('굵게만 끄면 기울임은 유지', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong><em>abc</em></strong></p>');
    await caret(page, 'em', 3);
    await exec(page, 'bold');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p><strong><em>abc</em></strong><em>X</em></p>');
  });
});

test('5. 다크 변수: 미리보기 p·td·th, 서식 이름 글자색', async ({ page }) => {
  await open(page);
  await setHTML(page, '<p>a</p><table><tbody><tr><th>h</th><td>d</td></tr></tbody></table>');
  const r = await page.evaluate(() => {
    document.documentElement.style.setProperty('--jm-text', 'rgb(1, 2, 3)');
    window.ed.setMode('preview');
    const pane = window.ed.previewPane;
    const color = (el) => getComputedStyle(el).color;
    const picker = document.createElement('div');
    picker.className = 'jm-formatpicker';
    picker.innerHTML = '<span class="jm-formatpicker-name">n</span>';
    document.body.appendChild(picker);
    const out = {
      container: color(window.ed.container), p: color(pane.querySelector('p')), td: color(pane.querySelector('td')), th: color(pane.querySelector('th')),
      name: color(picker.firstChild),
    };
    picker.remove();
    return out;
  });
  expect(r).toEqual({ container: 'rgb(1, 2, 3)', p: 'rgb(1, 2, 3)', td: 'rgb(1, 2, 3)', th: 'rgb(1, 2, 3)', name: 'rgb(1, 2, 3)' });
});

test('6. 전체 문서 붙여넣기: title·textarea·select 글 버림', async ({ page }) => {
  await open(page);
  await setHTML(page, '<p>x</p>');
  await caret(page, 'p', 1);
  await paste(page, { htmlData: '<html><head><title>제목글</title></head><body><p>본문</p><textarea>ta</textarea><select><option>op</option></select></body></html>' });
  const out = await html(page);
  expect(out).toContain('본문');
  for (const bad of ['제목글', 'ta', 'op']) expect(out).not.toContain(bad);
});

test.describe('7. thead 와 tbody 사이 행 이동 금지', () => {
  const T = '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>';
  const moveItems = (page) => page.evaluate(() => {
    const row = window.core.table.getMenuItems().find((i) => i.label === '행');
    return { up: row.children.find((i) => i.label === '위로 이동').disabled, down: row.children.find((i) => i.label === '아래로 이동').disabled };
  });
  test.beforeEach(async ({ page }) => { await open(page); await setHTML(page, T); });

  test('tbody 첫 행 위로: 오류 없이 그대로, 메뉴 비활성', async ({ page }) => {
    await caret(page, 'tbody td', 0);
    expect((await moveItems(page)).up).toBe(true);
    await page.evaluate(() => window.core.table.moveRow(-1));
    expect(await html(page)).toBe(T);
  });

  test('thead 행 아래로: 그대로, 메뉴 비활성', async ({ page }) => {
    await caret(page, 'th', 0);
    expect((await moveItems(page)).down).toBe(true);
    await page.evaluate(() => window.core.table.moveRow(1));
    expect(await html(page)).toBe(T);
  });

  test('같은 구역 안 이동은 그대로 된다', async ({ page }) => {
    await caret(page, 'tbody tr:nth-child(2) td', 0);
    expect((await moveItems(page)).up).toBe(false);
    await page.evaluate(() => window.core.table.moveRow(-1));
    expect(await html(page)).toContain('<tbody><tr><td>2</td></tr><tr><td>1</td></tr></tbody>');
  });
});

test('8. 행 높이 끌기: col 과 빈 style 을 남기지 않는다', async ({ page }) => {
  await open(page);
  await setHTML(page, '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>');
  const b = await page.locator('.jm-editor td').first().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 30, { steps: 3 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  const out = await html(page);
  expect(out).toMatch(/<tr style="height: \d+(\.\d+)?px;?">/);
  expect(out).not.toContain('<col');
  expect(out).toMatch(/^<table>/);
});

test.describe('9. colspan 표의 열 경계', () => {
  const T = '<table><colgroup><col style="width: 10%"><col style="width: 40%"><col style="width: 50%"></colgroup><tbody><tr><td colspan="2">a</td><td>b</td></tr></tbody></table>';
  test.beforeEach(async ({ page }) => { await open(page); await setHTML(page, T); });
  const edge = async (page) => { const b = await page.locator('.jm-editor td').first().boundingBox(); return [b.x + b.width - 2, b.y + b.height / 2]; };

  test('눌렀다 떼기만 하면 변경 없음', async ({ page }) => {
    const before = await html(page);
    const [x, y] = await edge(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    expect(await html(page)).toBe(before);
  });

  test('끌면 기존 비율에서 움직인다 (첫 열 10% 유지)', async ({ page }) => {
    const [x, y] = await edge(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y, { steps: 2 });
    await page.mouse.up();
    const pct = await page.evaluate(() => [...document.querySelectorAll('.jm-editor col')].map((c) => parseFloat(c.style.width)));
    expect(pct[0]).toBeCloseTo(10, 0);
    expect(pct[1]).toBeGreaterThan(41);
    expect(pct[2]).toBeLessThan(49);
  });
});

test('10. picture 안 이미지 손잡이: 본문 폭 기준', async ({ page }) => {
  await open(page);
  await setHTML(page, `<p><picture><source media="(max-width: 767px)" srcset="https://example.com/m.png"><img src="${IMG}" style="width: 30%"></picture></p>`);
  await page.locator('.jm-editor img').click();
  const h = await page.locator('.jm-img-resize').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 10, h.y + h.height / 2, { steps: 2 });
  await page.mouse.up();
  const w = await page.evaluate(() => parseInt(document.querySelector('.jm-editor img').style.width, 10));
  expect(w).toBeGreaterThanOrEqual(30);
  expect(w).toBeLessThan(35);
});

test('11. 포커스 없는 에디터에서 이미지 클릭 후 Delete', async ({ page }) => {
  await open(page);
  await setHTML(page, `<p>a</p><p><img src="${IMG}" style="width: 30%"></p>`);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.locator('.jm-editor img').click();
  await page.keyboard.press('Delete');
  expect(await html(page)).not.toContain('<img');
});

test('12. 셀 우클릭 → 셀 배경색 → HEX Enter 적용', async ({ page }) => {
  await open(page);
  await setHTML(page, '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  await page.locator('.jm-editor td').nth(1).click({ button: 'right' });
  await page.locator('.jm-ctxmenu-item', { hasText: '셀 배경색' }).click();
  await page.locator('.jm-colorpicker-hex').fill('#112233');
  await page.locator('.jm-colorpicker-hex').press('Enter');
  expect(await html(page)).toMatch(/<td>a<\/td><td style="background-color: rgb\(17, 34, 51\);?">b<\/td>/);
});

test('13. 낮은 화면: 메뉴 안 휠 스크롤로 닫히지 않고 바깥 스크롤엔 닫힌다', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 160 });
  await open(page);
  const r = await page.evaluate(async () => {
    const menu = window.core.menu;
    menu.open(10, 10, Array.from({ length: 30 }, (_, i) => ({ label: `항목 ${i}`, action() {} })));
    const scrollable = menu.el.scrollHeight > menu.el.clientHeight;
    return { scrollable };
  });
  expect(r.scrollable).toBe(true);
  await page.mouse.move(40, 40);
  await page.mouse.wheel(0, 40);
  await page.waitForFunction(() => window.core.menu.el.scrollTop > 0);
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.core.menu.el.hidden)).toBe(false);
  await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); });
  expect(await page.evaluate(() => window.core.menu.el.hidden)).toBe(true);
});

test.describe('14. 입력란 안 단축키', () => {
  test('블록 헤더 입력란 Ctrl+Z·Ctrl+B 는 문서에 안 간다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>a</p>');
    await caret(page, 'p', 1);
    await exec(page, 'map');
    const before = await page.evaluate(() => window.core.root.querySelectorAll('.jm-map-layer').length);
    expect(before).toBe(1);
    const input = page.locator('.jm-map-layer input').first();
    await input.click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+b');
    expect(await page.evaluate(() => window.core.root.querySelectorAll('.jm-map-layer').length)).toBe(1);
    expect(await page.evaluate(() => window.core.root.querySelector('strong'))).toBeNull();
  });
});

test('15. 공백 있는 단일 항목 목록 해제 시 빈 ul 안 남김', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.core.root.innerHTML = '<ul>\n<li>only</li>\n</ul>'; });
  await caret(page, 'li', 2);
  await exec(page, 'ul');
  const inner = await page.evaluate(() => window.core.root.innerHTML);
  expect(inner).not.toContain('<ul');
  expect(inner).toContain('<p>only</p>');
});

test.describe('16. 빈 중첩 항목 Enter', () => {
  test('상위 목록의 새 항목으로', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li>a<ul><li>b</li><li><br></li></ul></li></ul>');
    await caretIn(page, 'ul ul li:nth-child(2)');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  });

  test('뒤 항목은 새 항목의 하위로, 하나뿐이면 중첩 목록을 지운다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li>a<ul><li><br></li><li>z</li></ul></li></ul>');
    await caretIn(page, 'ul ul li');
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<ul><li>a</li><li><br><ul><li>z</li></ul></li></ul>');
  });
});

test.describe('17. 목록·인용 안 여러 줄 붙여넣기', () => {
  test('li 는 항목으로 나눈다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li>xy</li></ul>');
    await caret(page, 'li', 1);
    await paste(page, { text: 'l1\nl2' });
    expect(await html(page)).toBe('<ul><li>x</li><li>l1</li><li>l2</li><li>y</li></ul>');
  });

  test('빈 li 는 줄 수만큼 항목', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li><br></li></ul>');
    await caretIn(page, 'li');
    await paste(page, { text: 'l1\nl2' });
    expect(await html(page)).toBe('<ul><li>l1</li><li>l2</li></ul>');
  });

  test('글만 있는 인용은 줄바꿈으로', async ({ page }) => {
    await open(page);
    await setHTML(page, '<blockquote>xy</blockquote>');
    await caret(page, 'blockquote', 1);
    await paste(page, { text: 'l1\nl2' });
    expect(await html(page)).toBe('<blockquote>xl1<br>l2y</blockquote>');
  });

  test('인용에 표를 붙이면 인용을 나눈다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<blockquote>xy</blockquote>');
    await caret(page, 'blockquote', 1);
    await paste(page, { htmlData: '<table><tbody><tr><td>t</td></tr></tbody></table>' });
    expect(await html(page)).toBe('<blockquote>x</blockquote><table><tbody><tr><td>t</td></tr></tbody></table><blockquote>y</blockquote>');
  });
});

test('18. 폭 360: 이미지 도구 막대가 화면 안', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await setHTML(page, `<p><br></p><p><br></p><p><img src="${IMG}" style="width: 50%"></p>`);
  await page.locator('.jm-editor img').click();
  const b = await page.locator('.jm-imgbar').boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(360);
});

test.describe('리뷰 1. 플러그인 제목은 블록 명령 대상이 아니다', () => {
  for (const type of ['gallery', 'slider']) {
    for (const cmd of ['h2', 'ul', 'ol', 'quote']) {
      test(`${type} 전체 선택 후 ${cmd}: 제목 유지`, async ({ page }) => {
        await open(page);
        await setHTML(page, `<p>a</p><div data-type="${type}"><p data-role="title">T</p><img src="${IMG}"></div><p>b</p>`);
        expect(await html(page)).toContain('>T<');
        await caret(page, 'p', 0);
        await page.keyboard.press('Control+a');
        await exec(page, cmd);
        const out = await html(page);
        expect(out).toContain('<p data-role="title">T</p>');
        await setHTML(page, out);
        expect(await html(page)).toContain('>T<');
      });
    }
    test(`${type} 제목에 커서만 두고 h2·ul·quote: 그대로`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<div data-type="${type}"><p data-role="title">T</p><img src="${IMG}"></div>`);
      const before = await html(page);
      await caret(page, '[data-role="title"]', 1);
      for (const cmd of ['h2', 'ul', 'quote']) await exec(page, cmd);
      expect(await html(page)).toBe(before);
    });
  }

  test('배치 글 칸 p 는 범위 명령 대상', async ({ page }) => {
    await open(page);
    await setHTML(page, '<div data-type="layout" data-layout="2"><div data-cell="text"><p>c</p></div><div data-cell="text"><p>d</p></div></div>');
    await caret(page, '[data-cell="text"] p', 1);
    await exec(page, 'h2');
    expect(await html(page)).toContain('<h2>c</h2>');
  });
});

test('리뷰 2. 여러 줄 인용 끝 붙여넣기: 기존 br 유지', async ({ page }) => {
  await open(page);
  await setHTML(page, '<blockquote>줄1<br>줄2</blockquote>');
  await caret(page, 'blockquote', -1, 1);
  await paste(page, { text: 'x\ny' });
  expect(await html(page)).toBe('<blockquote>줄1<br>줄2x<br>y</blockquote>');
});

test('리뷰 4. 구조 모드: 중첩 목록 전체 해제', async ({ page }) => {
  await open(page);
  await setHTML(page, '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  await page.evaluate(() => {
    const lis = window.core.root.querySelectorAll('li');
    const r = document.createRange();
    r.setStart(lis[0].firstChild, 0); r.setEnd(lis[2].firstChild, 1);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await exec(page, 'ul');
  expect(await html(page)).toBe('<p>a</p><p>b</p><p>c</p>');
});

test.describe('리뷰 5. li 직속 p 정렬·class', () => {
  test('가운데 정렬 후 해제해도 정렬 유지', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li><p>a</p></li></ul>');
    await caret(page, 'p', 1);
    await exec(page, 'alignCenter');
    await exec(page, 'ul');
    expect((await html(page)).replace(/;"/g, '"')).toBe('<p style="text-align: center">a</p>');
  });
  test('li class 가 문단으로', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.core.root.innerHTML = '<ul><li class="k"><p>a</p></li></ul>'; });
    await caret(page, 'p', 1);
    await exec(page, 'ul');
    expect(await html(page)).toBe('<p class="k">a</p>');
  });
  test('p 의 자체 정렬을 getState.align 이 읽는다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li><p style="text-align: center">a</p></li></ul>');
    await caret(page, 'p', 1);
    expect((await state(page)).align).toBe('center');
  });
});

test.describe('리뷰 6. 끄기 뒤 빈 인라인·링크', () => {
  test('링크 안에서 굵게 끄면 링크는 하나, 빈 a 없음', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong><a href="https://a.com">abcd</a></strong></p>');
    await caret(page, 'a', 2);
    await exec(page, 'bold');
    const out = await html(page);
    expect(out.match(/<a /g)).toHaveLength(1);
    expect(out).toContain('<strong>ab</strong><strong>cd</strong>');
    expect(out).not.toMatch(/<a[^>]*><\/a>/);
  });
  test('링크 안에서 끄고 입력하면 링크 안 굵지 않은 글', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong><a href="https://a.com">abcd</a></strong></p>');
    await caret(page, 'a', 2);
    await exec(page, 'bold');
    await page.keyboard.type('X');
    expect(await html(page)).toContain('<strong>ab</strong>X<strong>cd</strong></a>');
  });
  test('span 안에서 끄면 빈 span 없음', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p><strong><span style="color: red">abcd</span></strong></p>');
    await caret(page, 'span', 2);
    await exec(page, 'bold');
    expect(await html(page)).not.toMatch(/<span[^>]*><\/span>/);
    expect((await page.evaluate(() => window.ed.getHTML())).replace(/<[^>]+>/g, '')).toBe('abcd');
  });
});

test('리뷰 7. 포커스 없는 에디터: 이미지 클릭 후 입력은 이미지 옆', async ({ page }) => {
  await open(page);
  await setHTML(page, `<p>a</p><p><img src="${IMG}" style="width: 30%"></p>`);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.locator('.jm-editor img').click();
  await page.keyboard.type('X');
  expect(await html(page)).toMatch(/^<p>a<\/p><p><img[^>]*>X<\/p>$/);
});

test.describe('리뷰 8', () => {
  test('li>p 둘 해제 후 범위 유지', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ul><li><p>a</p><p>b</p></li></ul>');
    await selectAcross(page, 'p');
    await exec(page, 'ul');
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
    expect(await page.evaluate(() => getSelection().toString().replace(/\s+/g, ''))).toBe('ab');
  });
  test('글+문단을 인용에 붙이면 줄바꿈', async ({ page }) => {
    await open(page);
    await setHTML(page, '<blockquote>q</blockquote>');
    await caret(page, 'blockquote', 1);
    await paste(page, { htmlData: 'u<p>x</p>' });
    expect(await html(page)).toBe('<blockquote>qu<br>x</blockquote>');
  });
});

test('리뷰 3. 닫히지 않은 태그 제거는 선형 시간', async ({ page }) => {
  await open(page);
  const ms = await page.evaluate(() => {
    const big = '<textarea><title><select>'.repeat(30000);
    const t = performance.now();
    window.JM.Sanitizer.clean(big, null);
    return performance.now() - t;
  });
  expect(ms).toBeLessThan(3000);
});

test('리뷰 3. div 안 닫히지 않은 textarea: 글 유지', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => window.JM.Sanitizer.clean('<div><textarea>t</div><p>b</p>', null));
  expect(out).toContain('t');
  expect(out).toContain('<p>b</p>');
});
