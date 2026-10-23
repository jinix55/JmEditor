/**
 * 단계 4 — 구조 모드의 키 입력·범위 삭제·붙여넣기·잘라내기 (기본 모드는 regression.spec 이 그대로 확인)
 * - Enter: dt·dd·캡션·글만 있는 div 는 줄바꿈(br), p·제목·목록은 지금처럼
 * - Backspace/Delete: 다른 구조 컨테이너·dt/dd 경계는 합치지 않음, 같은 컨테이너 안 문단은 합침
 * - 경계를 넘는 선택: 삭제·입력·Enter·붙여넣기·잘라내기 모두 글자만 지우고 구조는 남김
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open, setHTML, html, caret, paste } from './helpers.js';

const fixture = (f) => fs.readFileSync(`test/fixtures/publisher/${f}`, 'utf8');

test.beforeEach(async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '?structure=1');
});

/** 두 요소의 첫 텍스트 노드에 걸친 선택 */
async function selectAcross(page, a, ao, b, bo) {
  await page.evaluate(([sa, oa, sb, ob]) => {
    const tn = (sel) => document.createTreeWalker(window.core.root.querySelector(sel), NodeFilter.SHOW_TEXT).nextNode();
    const r = document.createRange();
    r.setStart(tn(sa), oa); r.setEnd(tn(sb), ob);
    window.core.root.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [a, ao, b, bo]);
}

test.describe('Enter', () => {
  test('dd 중간 Enter 는 줄바꿈, dd 를 복제하지 않음', async ({ page }) => {
    await setHTML(page, '<dl><dt>a</dt><dd>가나다</dd></dl>');
    await caret(page, 'dd', 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<dl><dt>a</dt><dd>가<br>X나다</dd></dl>');
  });

  test('dd 끝 Enter 후 입력하면 다음 줄에', async ({ page }) => {
    await setHTML(page, '<dl><dt>a</dt><dd>가</dd></dl>');
    await caret(page, 'dd', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('X');
    expect(await html(page)).toMatch(/^<dl><dt>a<\/dt><dd>가<br>X(<br>)?<\/dd><\/dl>$/);
  });

  test('글만 있는 div(퍼블)·figcaption 도 줄바꿈', async ({ page }) => {
    await setHTML(page, '<div class="box">한 줄</div><figure><img src="/a.png" alt="a"><figcaption>설명</figcaption></figure>');
    await caret(page, '.box', 1);
    await page.keyboard.press('Enter');
    await caret(page, 'figcaption', 1);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<div class="box">한<br> 줄</div><figure><img src="/a.png" alt="a"><figcaption>설<br>명</figcaption></figure>');
  });

  test('구조 안의 p 는 지금처럼 문단으로 나뉜다 (class 는 브라우저가 복제)', async ({ page }) => {
    await setHTML(page, '<section class="s"><p class="lead">가나</p></section>');
    await caret(page, '.lead', 1);
    await page.keyboard.press('Enter');
    expect(await html(page)).toBe('<section class="s"><p class="lead">가</p><p class="lead">나</p></section>');
  });
});

test.describe('Backspace·Delete', () => {
  test('dd 처음 Backspace 는 dt 와 합치지 않음', async ({ page }) => {
    await setHTML(page, '<dl><dt>용어</dt><dd>설명</dd></dl>');
    await caret(page, 'dd', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<dl><dt>용어</dt><dd>설명</dd></dl>');
  });

  test('dt 끝 Delete 도 합치지 않음', async ({ page }) => {
    await setHTML(page, '<dl><dt>용어</dt><dd>설명</dd></dl>');
    await caret(page, 'dt', -1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<dl><dt>용어</dt><dd>설명</dd></dl>');
  });

  test('다른 section 의 문단끼리는 합치지 않고, 같은 section 안 문단은 합친다', async ({ page }) => {
    await setHTML(page, '<section class="a"><p>A</p></section><section class="b"><p>B</p><p>C</p></section>');
    await caret(page, '.b p', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<section class="a"><p>A</p></section><section class="b"><p>B</p><p>C</p></section>');
    await caret(page, '.b p:nth-child(2)', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<section class="a"><p>A</p></section><section class="b"><p>BC</p></section>');
  });

  test('글 중간의 Backspace 는 그대로 한 글자 지움', async ({ page }) => {
    await setHTML(page, '<dl><dt>용어</dt><dd>설명</dd></dl>');
    await caret(page, 'dd', 1);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<dl><dt>용어</dt><dd>명</dd></dl>');
  });
});

test.describe('경계를 넘는 선택', () => {
  const two = '<section class="a"><p>A1</p></section><section class="b"><p>B1</p></section>';

  test('삭제하면 글자만 지우고 두 section 은 남는다', async ({ page }) => {
    await setHTML(page, two);
    await selectAcross(page, '.a p', 1, '.b p', 1);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<section class="a"><p>A</p></section><section class="b"><p>1</p></section>');
    await page.keyboard.type('X'); // 커서는 지운 자리(앞쪽)
    expect(await html(page)).toBe('<section class="a"><p>AX</p></section><section class="b"><p>1</p></section>');
  });

  test('선택 위에 입력해도 구조 유지, 되돌리면 원래대로', async ({ page }) => {
    await setHTML(page, two);
    await selectAcross(page, '.a p', 1, '.b p', 1);
    await page.keyboard.type('Z');
    expect(await html(page)).toBe('<section class="a"><p>AZ</p></section><section class="b"><p>1</p></section>');
    await page.evaluate(() => window.core.exec('undo'));
    expect(await html(page)).toBe(two);
  });

  test('dt~dd 에 걸친 삭제·글이 전부 지워진 블록에는 빈 줄(br)', async ({ page }) => {
    await setHTML(page, '<dl><dt>용어</dt><dd>설명</dd></dl>');
    await selectAcross(page, 'dt', 0, 'dd', 2);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<dl><dt><br></dt><dd><br></dd></dl>');
  });

  test('걸친 선택에 붙여넣기: 구조를 지운 뒤 그 자리에 넣는다', async ({ page }) => {
    await setHTML(page, two);
    await selectAcross(page, '.a p', 1, '.b p', 1);
    await paste(page, { text: '붙임' });
    expect(await html(page)).toBe('<section class="a"><p>A붙임</p></section><section class="b"><p>1</p></section>');
  });

  test('잘라내기: 클립보드에 들어가고 구조는 남는다 (chromium)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', '실제 클립보드 권한은 chromium 에서만');
    await setHTML(page, two);
    await selectAcross(page, '.a p', 1, '.b p', 1);
    await page.keyboard.press('ControlOrMeta+x');
    expect(await html(page)).toBe('<section class="a"><p>A</p></section><section class="b"><p>1</p></section>');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\s+/g, '')).toBe('1B');
  });

  test('퍼블 샘플 전체 선택 후 삭제해도 구조·class 는 남는다', async ({ page }) => {
    await setHTML(page, fixture('history.html'));
    await page.locator('.jm-editor h3').first().click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    const h = await html(page);
    expect(h).toContain('<div class="history-wrap"><div class="history-year"><h3 class="year"><br></h3><dl class="history-list"><dt><br></dt><dd><br></dd>');
    expect(h).not.toMatch(/2026|교육/);
  });
});

test.describe('Codex 단계 4 검토 반영', () => {
  /** 키 없이 오는 입력(모바일 가상 키보드처럼) — beforeinput 만 보낸다. 취소됐으면 true */
  async function fireInput(page, inputType) {
    return page.evaluate((t) => {
      const ev = new InputEvent('beforeinput', { inputType: t, bubbles: true, cancelable: true });
      window.core.root.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, inputType);
  }

  test('키보드 없이 온 삭제·문단 나누기 입력도 같은 규칙 (dd 처음 삭제 취소, dd 안 문단 나누기는 줄바꿈)', async ({ page }) => {
    await setHTML(page, '<dl><dt>용어</dt><dd>설명</dd></dl>');
    await caret(page, 'dd', 0);
    expect(await fireInput(page, 'deleteContentBackward')).toBe(true);
    await caret(page, 'dd', 1);
    expect(await fireInput(page, 'insertParagraph')).toBe(true);
    expect(await html(page)).toBe('<dl><dt>용어</dt><dd>설<br>명</dd></dl>');
  });

  test('dd 안의 줄바꿈 바로 뒤 Backspace 는 그 줄바꿈을 지운다 (dt 경계로 오인하지 않음)', async ({ page }) => {
    await setHTML(page, '<dl><dt>A</dt><dd><br>B</dd></dl>');
    await caret(page, 'dd', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<dl><dt>A</dt><dd>B</dd></dl>');
  });

  test('앞이 블록 레이어(표·버튼)면 레이어 안 글자를 이웃으로 보지 않는다', async ({ page }) => {
    await setHTML(page, '<section class="a"><div data-type="buttons" data-align="center"><a href="https://a.example" data-role="button" data-style="primary">버튼</a></div><p>본문</p></section>');
    await caret(page, '.a p', 0);
    const merges = await page.evaluate(() => {
      const p = window.core.root.querySelector('.a p');
      return window.core.sel.adjacentTextBlock(p, false);
    });
    expect(merges).toBeNull();
  });

  test('<br> 만 있던 가운데 블록도 지운 뒤 빈 줄(br)이 남는다', async ({ page }) => {
    await setHTML(page, '<section class="a"><p>A</p></section><section class="b"><p><br></p></section><section class="c"><p>B</p></section>');
    await selectAcross(page, '.a p', 0, '.c p', 1);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<section class="a"><p><br></p></section><section class="b"><p><br></p></section><section class="c"><p><br></p></section>');
  });
});

