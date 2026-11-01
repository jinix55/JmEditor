/**
 * 글·표가 망가지던 경우: 블록 경계의 Delete·Backspace, 세로 병합이 있는 표의 행·열 작업, 구조 경계를 넘는 한글 조합
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret, canonical } from './helpers.js';

const T = (rows) => `<table><tbody>${rows}</tbody></table>`;
const TABLE = T('<tr><td>x</td></tr>');
const YT = '<div data-type="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe></div>';
const BTN = '<div data-type="buttons" data-align="center"><a href="/x" data-role="button">버튼</a></div>';
const GAL = '<div data-type="gallery" data-layout="justify"><p data-role="title">제목</p><img src="/a.png" alt=""></div>';

/** 표 칸 범위 선택 후 병합 (드래그) */
async function dragMerge(page, from, to) {
  const c = page.locator('.jm-editor td');
  const a = await c.nth(from).boundingBox();
  const b = await c.nth(to).boundingBox();
  await page.mouse.move(a.x + 20, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => window.core.table.mergeCells());
}

/** 칸 텍스트로 커서 두기 */
const caretCell = (page, text) => page.evaluate((t) => {
  const td = Array.from(document.querySelectorAll('.jm-editor td')).find((c) => c.textContent === t);
  const r = document.createRange();
  r.selectNodeContents(td);
  r.collapse(true);
  window.core.root.focus();
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  window.core.sel.save();
}, text);

test.describe('블록 경계 삭제', () => {
  for (const [name, block] of [['표', TABLE], ['유튜브', YT], ['버튼', BTN], ['갤러리', GAL]]) {
    test(`${name} 앞 문단 끝 Delete: 글과 블록이 그대로`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<p>abc</p>${block}`);
      const before = await html(page);
      expect(await page.locator('.jm-editor [contenteditable="false"]').count()).toBeGreaterThan(0); // 샘플 블록이 정제에서 살아남았는지
      await caret(page, 'p', -1);
      await page.keyboard.press('Delete');
      expect(await html(page)).toBe(before);
      await page.keyboard.type('Z');
      expect(await html(page)).toContain('<p>abcZ</p>');
    });

    test(`${name}: 앞뒤에 문단이 있을 때 양쪽 경계 삭제`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<p>z</p>${block}<p>abc</p>`);
      const before = await html(page);
      expect(await page.locator('.jm-editor [contenteditable="false"]').count()).toBeGreaterThan(0);
      await page.evaluate(() => {
        const ps = document.querySelectorAll('.jm-editor > p');
        const r = document.createRange();
        r.setStart(ps[ps.length - 1].firstChild, 0);
        r.collapse(true);
        window.core.root.focus();
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        window.core.sel.save();
      });
      await page.keyboard.press('Backspace');
      expect(await html(page)).toBe(before);
      await page.evaluate(() => {
        const p = document.querySelector('.jm-editor > p');
        const r = document.createRange();
        r.setStart(p.firstChild, 1);
        r.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        window.core.sel.save();
      });
      await page.keyboard.press('Delete');
      expect(await html(page)).toBe(before);
    });

    test(`${name} 뒤 문단 맨 앞 Backspace: 글과 블록이 그대로`, async ({ page }) => {
      await open(page);
      await setHTML(page, `${block}<p>abc</p>`);
      const before = await html(page);
      expect(await page.locator('.jm-editor [contenteditable="false"]').count()).toBeGreaterThan(0); // 샘플 블록이 정제에서 살아남았는지
      await page.evaluate(() => {
        const ps = document.querySelectorAll('.jm-editor > p');
        const p = ps[ps.length - 1];
        const r = document.createRange();
        r.setStart(p.firstChild, 0);
        r.collapse(true);
        window.core.root.focus();
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        window.core.sel.save();
      });
      await page.keyboard.press('Backspace');
      expect(await html(page)).toBe(before);
    });
  }

  /** 조건에 맞는 요소 안의 위치로 커서 */
  const place = (page, sel, offset = 0) => page.evaluate(([q, o]) => {
    const el = document.querySelector(q);
    const r = document.createRange();
    r.setStart(el.firstChild?.nodeType === 3 ? el.firstChild : el, o);
    r.collapse(true);
    window.core.root.focus();
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    window.core.sel.save();
  }, [sel, offset]);

  for (const [name, doc, sel, key] of [
    ['컨테이너의 마지막 빈 문단 Backspace', `${TABLE}<div class="a"><p><br></p></div><p>abc</p>`, '.jm-editor .a p', 'Backspace'],
    ['컨테이너의 마지막 빈 문단 Delete', `<p>abc</p><section class="a"><p><br></p></section>${TABLE}`, '.jm-editor .a p', 'Delete'],
  ]) {
    test(`${name}: 구조와 커서 자리가 남는다`, async ({ page }) => {
      await open(page, '?structure=1');
      await setHTML(page, doc);
      await place(page, sel);
      await page.keyboard.press(key);
      await expect(page.locator('.jm-editor .a p')).toHaveCount(1);
    });
  }

  test('인용·목록 안의 유일한 빈 문단 Delete: 빈 껍데기가 저장되지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p>abc</p><blockquote><p><br></p></blockquote>${TABLE}`);
    await place(page, '.jm-editor blockquote p');
    await page.keyboard.press('Delete');
    expect(await html(page)).not.toContain('<blockquote></blockquote>');
  });

  test('글과 표 사이의 빈 문단은 글 끝 Delete 로 지워진다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p>abc</p><p><br></p>${TABLE}`);
    await caret(page, 'p', -1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(`<p>abc</p>${TABLE}`);
    await page.keyboard.type('Z');
    expect(await html(page)).toContain('<p>abcZ</p>');
  });

  test('블록 뒤 빈 목록 항목 Backspace: 목록을 벗어난다', async ({ page }) => {
    await open(page);
    await setHTML(page, `${TABLE}<ul><li><br></li></ul><p>abc</p>`);
    await place(page, '.jm-editor li');
    await page.keyboard.press('Backspace');
    const h = await html(page);
    expect(h).not.toContain('<ul>');
    expect(h).toContain('<table');
    expect(h).toContain('<p>abc</p>');
  });

  for (const [name, doc, sel] of [
    ['줄바꿈', `<p>abc\n</p>${TABLE}`, 'p'],
    ['공백', `<p>abc </p>${TABLE}`, 'p'],
    ['목록 항목', `<ul><li>abc\n</li></ul>${TABLE}`, 'li'],
  ]) {
    test(`글 뒤에 ${name}이 있어도 표 앞 Delete 로 글이 사라지지 않는다`, async ({ page }) => {
      await open(page);
      await setHTML(page, doc);
      await place(page, `.jm-editor ${sel}`, 3);
      await page.keyboard.press('Delete');
      expect(await html(page)).toContain('abc');
      await page.keyboard.press('Alt+Delete');
      expect(await html(page)).toContain('abc');
    });
  }

  test('줄 끝까지 지우기(deleteHardLineForward)도 표 앞 글을 지우지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p>abc</p>${TABLE}`);
    await caret(page, 'p', -1);
    const prevented = await page.evaluate(() => {
      const results = {};
      for (const inputType of ['deleteHardLineForward', 'deleteSoftLineForward', 'deleteWordForward', 'deleteContentForward']) {
        const e = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
        window.core.root.dispatchEvent(e);
        results[inputType] = e.defaultPrevented;
      }
      return results;
    });
    expect(Object.values(prevented)).toEqual([true, true, true, true]);
    expect(await html(page)).toContain('<p>abc</p>');
  });

  test('글 중간 Delete·일반 문단 합치기는 그대로', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p>abc</p>${TABLE}`);
    await caret(page, 'p', 1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toContain('<p>ac</p>');
    await setHTML(page, '<p>abc</p><p>def</p>');
    await caret(page, 'p', -1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('표 앞 빈 문단: 앞에 글이 있으면 지워지고 커서가 앞 문단 끝으로', async ({ page }) => {
    await open(page);
    await setHTML(page, `<p>abc</p><p><br></p>${TABLE}`);
    await page.evaluate(() => {
      const p = document.querySelectorAll('.jm-editor > p')[1];
      const r = document.createRange();
      r.setStart(p, 0);
      r.collapse(true);
      window.core.root.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      window.core.sel.save();
    });
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(`<p>abc</p>${TABLE}`);
    await page.keyboard.type('Z');
    expect(await html(page)).toContain('<p>abcZ</p>');
  });

  test('블록 사이 유일한 빈 문단은 남는다 (커서 둘 자리)', async ({ page }) => {
    await open(page);
    await setHTML(page, `${TABLE}<p><br></p>${TABLE}`);
    await page.evaluate(() => {
      const p = document.querySelector('.jm-editor > p');
      const r = document.createRange();
      r.setStart(p, 0);
      r.collapse(true);
      window.core.root.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      window.core.sel.save();
    });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    expect((await html(page)).match(/<table/g)).toHaveLength(2);
    await page.keyboard.type('Z');
    expect(await html(page)).toContain('<p>Z</p>');
  });

  test('표 칸 안의 Delete·Backspace 는 칸 안에서 동작', async ({ page }) => {
    await open(page);
    await setHTML(page, T('<tr><td>abc</td><td>def</td></tr>'));
    await caretCell(page, 'abc');
    await page.keyboard.press('Delete');
    expect(await html(page)).toContain('<td>bc</td>');
  });
});

test.describe('세로 병합이 있는 표', () => {
  test('두 행 전체 병합: 남은 행이 밀리지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, T('<tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr><tr><td>e</td><td>f</td></tr>'));
    await dragMerge(page, 0, 3);
    const h = await html(page);
    expect(h).not.toContain('rowspan');
    expect(h).toContain('colspan="2"');
    expect(h).toContain('<tr><td>e</td><td>f</td></tr>');
    await expect(page.locator('.jm-editor tr')).toHaveCount(2);
  });

  test('열 삭제 후 빈 행이 사라지면 rowspan 도 줄어 아래 행이 안 밀린다', async ({ page }) => {
    await open(page);
    await setHTML(page, T('<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td><td>e</td></tr>'));
    await caretCell(page, 'b');
    await page.evaluate(() => window.core.table.deleteColumn());
    expect(await html(page)).toBe(T('<tr><td>a</td></tr><tr><td>d</td></tr>'));
  });

  test('세로 병합 열은 이동을 거부하고 메뉴도 비활성', async ({ page }) => {
    await open(page);
    const src = T('<tr><td rowspan="2">a</td><td>b</td><td>x</td></tr><tr><td>c</td><td>y</td></tr><tr><td>d</td><td>e</td><td>z</td></tr>');
    await setHTML(page, src);
    const before = await html(page);
    await caretCell(page, 'a');
    await page.evaluate(() => window.core.table.moveColumn(1));
    expect(await html(page)).toBe(before);
    await caretCell(page, 'b'); // 옆 열이 병합이면 그쪽으로도 안 됨
    await page.evaluate(() => window.core.table.moveColumn(-1));
    expect(await html(page)).toBe(before);
    const disabled = await page.evaluate(() => {
      const flat = (list) => list.flatMap((i) => [i, ...(i.children ? flat(i.children) : [])]);
      return flat(window.core.table.getMenuItems(null)).filter((i) => /왼쪽으로 이동|오른쪽으로 이동/.test(i.label || '')).map((i) => [i.label, !!i.disabled]);
    });
    expect(disabled.length).toBeGreaterThan(0);
    disabled.filter(([l]) => l.includes('왼쪽')).forEach(([, d]) => expect(d).toBe(true));
    await caretCell(page, 'b'); // 병합 없는 두 열끼리는 이동 가능
    await page.evaluate(() => window.core.table.moveColumn(1));
    expect(await html(page)).toContain('<td>x</td><td>b</td>');
  });
});

test.describe('구조 경계를 넘는 한글 조합', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP 입력은 Chromium 전용');

  /** 두 요소에 걸쳐 선택 후 한글 조합 입력 */
  async function compose(page, sel1, off1, sel2, off2) {
    await page.evaluate(([a, x, b, y]) => {
      const r = document.createRange();
      r.setStart(document.querySelector(`.jm-editor ${a}`).firstChild, x);
      r.setEnd(document.querySelector(`.jm-editor ${b}`).firstChild, y);
      window.core.root.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      window.core.sel.save();
    }, [sel1, off1, sel2, off2]);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '하' });
  }

  test('dt~dd 선택: dd 가 남는다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<dl><dt>abc</dt><dd>def</dd></dl>');
    await compose(page, 'dt', 1, 'dd', 1);
    expect(await canonical(page)).toBe('<dl><dt>a하</dt><dd>ef</dd></dl>');
  });

  test('구조 컨테이너 두 개에 걸친 선택: 둘 다 남는다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<div class="a"><p>abc</p></div><div class="b"><p>def</p></div>');
    await compose(page, '.a p', 1, '.b p', 1);
    const h = await canonical(page);
    expect(h).toContain('class="a"');
    expect(h).toContain('class="b"');
    expect(h).toContain('a하');
    expect(h).toContain('ef');
  });

  test('한 문단 안 선택 위 조합은 지금처럼 바뀐다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>abcdef</p>');
    await page.evaluate(() => {
      const t = document.querySelector('.jm-editor p').firstChild;
      const r = document.createRange();
      r.setStart(t, 1);
      r.setEnd(t, 3);
      window.core.root.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      window.core.sel.save();
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '하' });
    expect(await html(page)).toBe('<p>a하def</p>');
  });
});
