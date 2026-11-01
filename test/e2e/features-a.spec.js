/**
 * 기능 묶음 A — 가로줄, 들여쓰기, 서식 지우기, 이미지 대체 글
 * 정제 공통 사례는 test/fixtures/legacy/cases.txt (legacy-format.spec.js 가 비교), 여기서는 편집 동작과 켬·끔이 갈리는 정제를 본다
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html as rawHtml, caret, select, exec, paste, expectRoundTrip } from './helpers.js';

/** 저장 HTML — 브라우저가 style 끝에 붙이는 세미콜론은 빼고 비교한다 (정제하면 없어지는 차이) */
async function html(page) {
  return (await rawHtml(page)).replace(/(style="[^"]*);"/g, '$1"');
}

/** 1×1 PNG 파일 */
const PNG = { name: 'photo-1234.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };

/** 되돌리기 한 번 뒤 내용 */
async function undoOnce(page) {
  await exec(page, 'undo');
  return html(page);
}

/** 두 지점에 걸친 선택 (각 요소의 첫 글자 노드 기준) */
async function selectAcross(page, a, aOff, b, bOff) {
  await page.evaluate(([s1, o1, s2, o2]) => {
    const text = (s) => document.createTreeWalker(window.core.root.querySelector(s), NodeFilter.SHOW_TEXT).nextNode();
    const r = document.createRange();
    r.setStart(text(s1), o1); r.setEnd(text(s2), o2);
    window.core.root.focus();
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }, [a, aOff, b, bOff]);
}

test.beforeEach(async ({ page }) => { await open(page); });

test.describe('가로줄', () => {
  test('옛 글의 hr 이 속성 없이 남고 왕복해도 같다', async ({ page }) => {
    await setHTML(page, '<p>a</p><hr class="x" id="y" size="2" style="color:red"><p>b</p>');
    expect(await html(page)).toBe('<p>a</p><hr><p>b</p>');
    await expectRoundTrip(page);
  });

  test('구조 모드를 꺼도 켜도 div 안의 hr 이 사라지지 않고 두 번 정제해도 같다', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { Sanitizer, makeStructurePolicy } = window.JM;
      const on = makeStructurePolicy({ enabled: true });
      const src = '<div>a<hr>b</div><div><hr></div>';
      const a = Sanitizer.clean(src, on);
      const b = Sanitizer.clean(src, null);
      return { a, a2: Sanitizer.clean(a, on), b, b2: Sanitizer.clean(b, null) };
    });
    expect(r.a).toBe('<div>a<hr>b</div><div><hr></div>');
    expect(r.a2).toBe(r.a);
    expect(r.b).toBe('<p>a</p><hr><p>b</p><hr>');
    expect(r.b2).toBe(r.b);
  });

  test('hr 이 많아도 정제가 금방 끝난다', async ({ page }) => {
    const ms = await page.evaluate(() => {
      const t = performance.now();
      window.JM.Sanitizer.clean(`<div>${'a<hr>'.repeat(20000)}</div>`, null);
      return performance.now() - t;
    });
    expect(ms).toBeLessThan(3000);
  });

  test('커서 블록 뒤에 넣고 뒤 문단으로 커서를 옮긴다 (되돌리기 한 번)', async ({ page }) => {
    await setHTML(page, '<p>abc</p><p>def</p>');
    await caret(page, 'p', 1);
    await exec(page, 'hr');
    expect(await html(page)).toBe('<p>abc</p><hr><p>def</p>');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>abc</p><hr><p>Xdef</p>');
    await setHTML(page, '<p>abc</p><p>def</p>');
    await caret(page, 'p', 1);
    await exec(page, 'hr');
    expect(await undoOnce(page)).toBe('<p>abc</p><p>def</p>');
  });

  test('문서 끝이면 문단을 만들어 커서를 둔다', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await caret(page, 'p', -1);
    await exec(page, 'hr');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>abc</p><hr><p>X</p>');
  });

  test('목록·인용·표 칸 안이면 그 바깥 뒤에 넣는다', async ({ page }) => {
    await setHTML(page, '<ul><li>a<ul><li>b</li></ul></li></ul><p>c</p>');
    await caret(page, 'ul ul li', 0);
    await exec(page, 'hr');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li></ul></li></ul><hr><p>c</p>');

    await setHTML(page, '<blockquote>a</blockquote><p>c</p>');
    await caret(page, 'blockquote', 0);
    await exec(page, 'hr');
    expect(await html(page)).toBe('<blockquote>a</blockquote><hr><p>c</p>');

    await setHTML(page, '<table><tbody><tr><td>a</td></tr></tbody></table><p>c</p>');
    await caret(page, 'td', 0);
    await exec(page, 'hr');
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td></tr></tbody></table><hr><p>c</p>');
  });

  test('툴바 버튼으로 넣는다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await caret(page, 'p', 0);
    await page.click('.jm-btn[data-cmd="hr"]');
    expect(await html(page)).toBe('<p>a</p><hr><p><br></p>');
  });

  test('화면에 선으로 보이고 조회 화면에서도 같다', async ({ page }) => {
    await setHTML(page, '<p>a</p><hr><p>b</p>');
    const look = (sel) => page.evaluate((s) => {
      const c = getComputedStyle(document.querySelector(s));
      return [c.borderTopStyle, c.borderTopWidth, c.borderLeftStyle, c.marginTop];
    }, sel);
    const editing = await look('.jm-editor hr');
    expect(editing.slice(0, 3)).toEqual(['solid', '1px', 'none']);
    await page.click('.jm-btn[data-cmd="modePreview"]');
    expect(await look('.jm-content hr')).toEqual(editing);
  });

  for (const [name, doc, sel, off, key, want] of [
    ['Backspace: 뒤 문단 맨 앞', '<p>abc</p><hr><p>def</p>', 'p:last-child', 0, 'Backspace', '<p>abc</p><p>def</p>'],
    ['Delete: 앞 문단 맨 끝', '<p>abc</p><hr><p>def</p>', 'p:first-child', -1, 'Delete', '<p>abc</p><p>def</p>'],
    ['Backspace: 빈 문단', '<p>abc</p><hr><p><br></p>', 'p:last-child', 0, 'Backspace', '<p>abc</p><p><br></p>'],
    ['Backspace: 목록 첫 항목', '<hr><ul><li>abc</li></ul>', 'li', 0, 'Backspace', '<ul><li>abc</li></ul>'],
    ['Backspace: 칸 안 글 사이', '<table><tbody><tr><td>abc<hr>def</td></tr></tbody></table><p>x</p>', 'td', 0, null, '<table><tbody><tr><td>abcdef</td></tr></tbody></table><p>x</p>'],
    ['Delete: 항목 안 글 사이', '<ul><li>abc<hr>def</li></ul>', 'li', -1, 'Delete', '<ul><li>abcdef</li></ul>'],
  ]) {
    test(`hr 옆 삭제 키는 선만 지우고 글을 지키며 되돌릴 수 있다 — ${name}`, async ({ page }) => {
      await setHTML(page, doc);
      const before = await html(page);
      if (key) await caret(page, sel, off);
      else await caret(page, sel, 0, 1); // 둘째 글 노드 맨 앞
      await page.keyboard.press(key || 'Backspace');
      expect(await html(page)).toBe(want);
      expect(await undoOnce(page)).toBe(before);
    });
  }

  test('글 안쪽 삭제 키는 hr 을 건드리지 않는다', async ({ page }) => {
    await setHTML(page, '<p>abc</p><hr><p>def</p>');
    await caret(page, 'p:last-child', 1);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>abc</p><hr><p>ef</p>');
  });

  test('붙여넣기의 hr 은 문단을 나누고 들어가 p 안에 끼지 않는다', async ({ page }) => {
    await setHTML(page, '<p>abcd</p>');
    await caret(page, 'p', 2);
    await paste(page, { htmlData: 'x<hr>y' });
    expect(await html(page)).toBe('<p>ab</p><p>x</p><hr><p>y</p><p>cd</p>');
    await expectRoundTrip(page);
  });

  test('hr 을 덮은 구조 범위 삭제는 hr 도 지운다', async ({ page }) => {
    await page.evaluate(() => {
      const core = window.core;
      core.setHTML('<p>abc</p><hr><p>def</p>');
      const ps = core.root.querySelectorAll('p');
      const r = document.createRange();
      r.setStart(ps[0].firstChild, 1); r.setEnd(ps[1].firstChild, 1);
      core.commands.deleteRange(r);
    });
    expect((await html(page)).includes('<hr>')).toBe(false);
  });

  test('hr 만 있는 문서도 경계에서 단락을 추가할 수 있다', async ({ page }) => {
    await setHTML(page, '<hr>');
    const box = await page.locator('.jm-editor hr').boundingBox();
    await page.mouse.move(box.x + 50, box.y + box.height + 8);
    await page.click('.jm-gap-insert');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<hr><p>X</p>');
  });
});

test.describe('들여쓰기', () => {
  test('문단은 40px 씩, 최대 200px, 0 이면 속성을 지운다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await caret(page, 'p', 0);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<p style="margin-left: 40px">a</p>');
    for (let i = 0; i < 6; i++) await exec(page, 'indent');
    expect(await html(page)).toBe('<p style="margin-left: 200px">a</p>');
    for (let i = 0; i < 6; i++) await exec(page, 'outdent');
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('단위가 맞지 않는 값은 다음 40 배수로 간다', async ({ page }) => {
    await setHTML(page, '<p style="margin-left: 30px">a</p><p style="margin-left: 50px">b</p>');
    await caret(page, 'p', 0);
    await exec(page, 'indent');
    await caret(page, 'p:last-child', 0);
    await exec(page, 'outdent');
    expect(await html(page)).toBe('<p style="margin-left: 40px">a</p><p style="margin-left: 40px">b</p>');
  });

  test('선택한 모든 블록에 적용하고 다른 style 은 둔다. 되돌리기 한 번', async ({ page }) => {
    const doc = '<p style="text-align: center">a</p><h2>b</h2><blockquote>c</blockquote><p>d</p>';
    await setHTML(page, doc);
    await selectAcross(page, 'p', 0, 'blockquote', 1);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<p style="text-align: center; margin-left: 40px">a</p><h2 style="margin-left: 40px">b</h2><blockquote style="margin-left: 40px">c</blockquote><p>d</p>');
    expect(await undoOnce(page)).toBe(doc);
  });

  test('목록 항목은 중첩하고 내어쓰면 풀고, 맨 위에서 내어쓰면 문단이 된다', async ({ page }) => {
    await setHTML(page, '<ul><li>a</li><li>b</li><li>c</li></ul>');
    await caret(page, 'li:nth-child(2)', 1);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<ul><li>a<ul><li>bX</li></ul></li><li>c</li></ul>');
    await exec(page, 'outdent');
    expect(await html(page)).toBe('<ul><li>a</li><li>bX</li><li>c</li></ul>');
    await exec(page, 'outdent');
    expect(await html(page)).toBe('<ul><li>a</li></ul><p>bX</p><ul><li>c</li></ul>');
  });

  test('첫 항목은 중첩할 곳이 없어 그대로, 다음 항목은 이미 있는 하위 목록 끝으로', async ({ page }) => {
    await setHTML(page, '<ol><li>a<ol><li>x</li></ol></li><li>b</li></ol>');
    await caret(page, 'li', 0);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<ol><li>a<ol><li>x</li></ol></li><li>b</li></ol>');
    await caret(page, 'ol > li:nth-child(2)', 0);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<ol><li>a<ol><li>x</li><li>b</li></ol></li></ol>');
  });

  test('여러 항목 선택: 함께 중첩·해제되고 순서가 유지되며 되돌리기 한 번', async ({ page }) => {
    const doc = '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>';
    await setHTML(page, doc);
    await selectAcross(page, 'li:nth-child(2)', 0, 'li:nth-child(3)', 1);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
    await selectAcross(page, 'ul ul li:nth-child(1)', 0, 'ul ul li:nth-child(2)', 1);
    await exec(page, 'outdent');
    expect(await html(page)).toBe(doc);
    await exec(page, 'undo');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
  });

  test('내어쓴 항목 뒤의 형제는 그 항목의 하위 목록이 된다', async ({ page }) => {
    await setHTML(page, '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>');
    await caret(page, 'ul ul li', 0);
    await exec(page, 'outdent');
    expect(await html(page)).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>');
  });

  test('Tab·Shift+Tab: 목록 안에서 중첩·해제하고 포커스가 나가지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li>a</li><li>b</li></ul>');
    await caret(page, 'li:last-child', 1);
    await page.keyboard.press('Tab');
    expect(await html(page)).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
    await page.keyboard.press('Shift+Tab');
    expect(await html(page)).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(await page.evaluate(() => document.activeElement === window.core.root)).toBe(true);
  });

  test('Tab: 표 칸에서는 칸 이동(칸 안 목록 포함), 문단에서는 브라우저 기본', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td><ul><li>a</li><li>b</li></ul></td><td>c</td></tr></tbody></table><p>d</p>');
    await caret(page, 'li:last-child', 0);
    await page.keyboard.press('Tab');
    expect(await html(page)).toContain('<ul><li>a</li><li>b</li></ul>');
    await page.keyboard.type('X');
    expect(await html(page)).toContain('<td>cX</td>');

    await setHTML(page, '<p>d</p>');
    await caret(page, 'p', 0);
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      window.core.root.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test('툴바 버튼으로 들여쓰고 내어쓴다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await caret(page, 'p', 0);
    await page.click('.jm-btn[data-cmd="indent"]');
    expect(await html(page)).toBe('<p style="margin-left: 40px">a</p>');
    await page.click('.jm-btn[data-cmd="outdent"]');
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('구조 블록(dt 등)·표 칸 직접 글은 들여쓰지 않고, 표 칸 범위 선택은 칸 안 문단에 적용한다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>a</td><td><p>b</p></td></tr></tbody></table>');
    await caret(page, 'td', 0);
    await exec(page, 'indent');
    expect(await html(page)).toBe('<table><tbody><tr><td>a</td><td><p>b</p></td></tr></tbody></table>');
    await page.evaluate(() => {
      const t = window.core.root.querySelector('table');
      t.querySelectorAll('td').forEach((c) => c.classList.add('is-cell-selected'));
      window.core.table.selection = { table: t, r1: 0, c1: 0, r2: 0, c2: 1, anchorCell: t.querySelector('td') };
    });
    await exec(page, 'indent');
    expect(await html(page)).toContain('<td><p style="margin-left: 40px">b</p></td>');
  });

  test('들여쓴 문단이 왕복·조회에서 그대로다', async ({ page }) => {
    await setHTML(page, '<p style="margin-left: 40px; text-indent: -20px">a</p>');
    await expectRoundTrip(page);
    await page.click('.jm-btn[data-cmd="modePreview"]');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.jm-content p')).marginLeft)).toBe('40px');
  });
});

test.describe('서식 지우기', () => {
  const FULL = '<p><strong><em><u><s>a</s></u></em></strong><span style="color: red; background-color: yellow; font-size: 20px; font-family: &quot;굴림&quot;; letter-spacing: 1px; line-height: 2">b</span></p>';

  test('선택 범위의 글자 서식을 모두 지운다 (되돌리기 한 번)', async ({ page }) => {
    await setHTML(page, FULL);
    const before = await html(page);
    await page.evaluate(() => {
      const p = window.core.root.querySelector('p');
      const r = document.createRange(); r.selectNodeContents(p);
      window.core.root.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p>ab</p>');
    expect(await undoOnce(page)).toBe(before);
  });

  test('선택한 부분만 지우고 나머지 서식은 그대로', async ({ page }) => {
    await setHTML(page, '<p><strong>abcd</strong></p>');
    await select(page, 'strong', 1, 3);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p><strong>a</strong>bc<strong>d</strong></p>');
    expect(await page.evaluate(() => getSelection().toString())).toBe('bc');
  });

  test('접힌 커서면 그 블록 전체, 커서는 제자리, 다른 블록은 그대로', async ({ page }) => {
    await setHTML(page, '<p><strong>ab</strong><em>cd</em></p><p><u>x</u></p>');
    await caret(page, 'em', 1);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p>abcd</p><p><u>x</u></p>');
    await page.keyboard.type('Z');
    expect(await html(page)).toBe('<p>abcZd</p><p><u>x</u></p>');
  });

  test('접힌 커서: 목록 항목의 중첩 목록은 건드리지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li><strong>a</strong><ul><li><strong>b</strong></li></ul></li></ul>');
    await caret(page, 'strong', 0);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<ul><li>a<ul><li><strong>b</strong></li></ul></li></ul>');
  });

  test('링크·이미지·제목 태그·블록 style 은 남는다', async ({ page }) => {
    await setHTML(page, '<h2 style="text-align: center; margin-left: 40px"><strong><a href="/x">ab</a>c</strong><img src="/a.png" alt="i"></h2>');
    await caret(page, 'a', 1);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<h2 style="text-align: center; margin-left: 40px"><a target="_blank" rel="noopener noreferrer" href="/x">ab</a>c<img src="/a.png" alt="i"></h2>');
  });

  test('링크 안 서식을 지워도 링크가 나뉘지 않는다', async ({ page }) => {
    await setHTML(page, '<p><a href="/x">a<strong>b</strong>c</a></p>');
    await caret(page, 'strong', 1);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p><a target="_blank" rel="noopener noreferrer" href="/x">abc</a></p>');
  });

  test('표·블록 레이어를 포함한 범위도 구조가 그대로다', async ({ page }) => {
    const doc = '<p><strong>a</strong></p><table><tbody><tr><td><strong>b</strong></td></tr></tbody></table><div data-type="youtube" data-width="100" data-align="center"><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"></iframe></div><p><em>c</em></p>';
    await setHTML(page, doc);
    await selectAcross(page, 'p', 0, 'p:last-child', 1);
    await exec(page, 'clearFormat');
    const out = await html(page);
    expect(out).toMatch(/^<p>a<\/p><table><tbody><tr><td>b<\/td><\/tr><\/tbody><\/table><div data-type="youtube"/);
    expect(out).toMatch(/<\/div><p>c<\/p>$/);
  });

  test('표 칸 범위 선택: 선택한 칸만 지운다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td><strong>a</strong></td><td><em>b</em></td><td><u>c</u></td></tr></tbody></table>');
    await caret(page, 'td', 0);
    await page.evaluate(() => {
      const t = window.core.root.querySelector('table');
      const cells = t.querySelectorAll('td');
      cells[0].classList.add('is-cell-selected'); cells[1].classList.add('is-cell-selected');
      window.core.table.selection = { table: t, r1: 0, c1: 0, r2: 0, c2: 1, anchorCell: cells[0] };
    });
    await exec(page, 'clearFormat');
    expect(await html(page)).toContain('<td>a</td><td>b</td><td><u>c</u></td>');
  });

  test('툴바 버튼으로 지운다. 지울 것이 없으면 되돌리기 단계가 늘지 않는다', async ({ page }) => {
    await setHTML(page, '<p><strong>a</strong></p>');
    await caret(page, 'strong', 0);
    await page.click('.jm-btn[data-cmd="clearFormat"]');
    expect(await html(page)).toBe('<p>a</p>');
    const n = await page.evaluate(() => window.core.history.undoStack.length);
    await exec(page, 'clearFormat');
    expect(await page.evaluate(() => window.core.history.undoStack.length)).toBe(n);
  });
});

test.describe('서식 지우기 — 구조 모드', () => {
  test.beforeEach(async ({ page: _ }, info) => { test.skip(info.project.metadata?.query === '?structure=0', '구조 모드 전용'); });

  test('class 있는 span 은 class 를 유지하고 font 계열만 지운다, sub·sup 는 벗긴다', async ({ page }) => {
    await setHTML(page, '<p><span class="tit" style="color: red; font-size: 20px">a</span><span class="k">b</span><sup>c</sup><small>d</small></p>');
    await caret(page, 'span', 0);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p><span class="tit">a</span><span class="k">b</span>c<small>d</small></p>');
  });

  test('구조 태그의 hr 은 속성 없이 남고, 구조 안 hr 삽입은 가장 바깥 구조 뒤에', async ({ page }) => {
    await setHTML(page, '<section class="s"><div class="d">a</div></section><p>b</p>');
    await caret(page, '.d', 0);
    await exec(page, 'hr');
    expect(await html(page)).toBe('<section class="s"><div class="d">a</div></section><hr><p>b</p>');
  });
});

test.describe('이미지 대체 글', () => {
  /** 파일 하나를 숨김 파일 입력으로 넣어 이미지가 들어올 때까지 기다린다 */
  async function insertFile(page) {
    await page.locator('.jm-container > input[type=file]').first().setInputFiles(PNG);
    await page.waitForFunction(() => window.core.root.querySelector('img'));
  }

  test('파일로 넣은 이미지의 alt 는 빈 값이다 (파일명 아님)', async ({ page }) => {
    await insertFile(page);
    expect(await html(page)).toMatch(/<img [^>]*alt=""/);
    expect(await html(page)).not.toContain('photo-1234');
  });

  test('교체하면 alt 를 비운다', async ({ page }) => {
    await setHTML(page, '<p><img src="/a.png" alt="옛 설명"></p>');
    await page.click('.jm-editor img', { force: true });
    await page.locator('body > input[type=file]').first().setInputFiles(PNG);
    await page.waitForFunction(() => window.core.root.querySelector('img').src.startsWith('data:'));
    expect(await html(page)).toMatch(/alt=""/);
  });

  for (const [name, doc] of [
    ['일반 img', '<p><img src="/a.png" alt="옛"></p>'],
    ['picture 의 img', '<p><picture><source media="(max-width: 767px)" srcset="/m.png"><img src="/a.png" alt="옛"></picture></p>'],
  ]) {
    test(`도구 막대에서 대체 글을 고친다 — ${name}`, async ({ page }) => {
      await setHTML(page, doc);
      const before = await html(page);
      await page.click('.jm-editor img', { force: true });
      const input = page.locator('.jm-imgbar-alt');
      await expect(input).toHaveValue('옛');
      await input.fill('설명 "글"<b>');
      await input.press('Enter');
      expect(await html(page)).toContain('alt="설명 &quot;글&quot;&lt;b&gt;"');
      expect(await undoOnce(page)).toBe(before);
      await exec(page, 'redo');
      await expectRoundTrip(page);
    });
  }

  test('입력하고 바로 다른 곳을 눌러도 반영되고, 입력 중 Backspace 가 이미지를 지우지 않는다', async ({ page }) => {
    await setHTML(page, `<p><img src="data:image/png;base64,${PNG.buffer.toString('base64')}" alt="" width="40" height="40"></p><p>x</p>`);
    await page.click('.jm-editor img', { force: true });
    const input = page.locator('.jm-imgbar-alt');
    await input.click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('ab');
    await page.click('.jm-editor p:last-child');
    await expect(page.locator('.jm-imgbar')).toBeHidden();
    expect(await html(page)).toContain('alt="ab"');
    const n = await page.evaluate(() => window.core.history.undoStack.length);
    expect(n).toBe(1);
  });

  test('갈아 선택하면 그 이미지의 대체 글을 보여 준다', async ({ page }) => {
    await setHTML(page, '<p><img src="/a.png" alt="가"></p><p><img src="/b.png"></p>');
    await page.click('.jm-editor p:first-child img', { force: true });
    await expect(page.locator('.jm-imgbar-alt')).toHaveValue('가');
    await page.click('.jm-editor p:last-child img', { force: true });
    await expect(page.locator('.jm-imgbar-alt')).toHaveValue('');
  });
});

test('데모 내장 복사본: 툴바 버튼·대체 글 칸이 있고 가로줄·들여쓰기가 동작한다', async ({ page }) => {
  await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
  await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
  for (const cmd of ['hr', 'indent', 'outdent', 'clearFormat']) await expect(page.locator(`[data-cmd="${cmd}"]`).first()).toBeVisible();
  await expect(page.locator('.jm-imgbar-alt')).toHaveCount(1);
  const body = page.locator('[contenteditable="true"]').first();
  const count = () => body.locator('hr').count();
  const before = await count();
  await body.locator('p').first().click();
  await page.locator('[data-cmd="hr"]').first().click();
  expect(await count()).toBe(before + 1);
  await page.locator('[data-cmd="indent"]').first().click();
  await expect(body.locator('p[style*="margin-left: 40px"]')).not.toHaveCount(0);
});
