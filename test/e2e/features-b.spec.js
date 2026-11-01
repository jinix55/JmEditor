/**
 * 기능 묶음 B — 줄 간격, 글자 수, 링크 새 창 선택, 위·아래 첨자, 찾기·바꾸기, 자동 alt 정리, hr 분할 상한
 * 정제 공통 사례는 test/fixtures/legacy/cases.txt (legacy-format.spec.js 가 비교), 여기서는 편집 동작을 본다
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html as rawHtml, caret, select, exec, expectRoundTrip } from './helpers.js';

/** 저장 HTML — 브라우저가 style 끝에 붙이는 세미콜론은 빼고 비교한다 */
async function html(page) {
  return (await rawHtml(page)).replace(/(style="[^"]*);"/g, '$1"');
}

/** 1×1 PNG 파일 */
const PNG = { name: 'photo-1234.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };

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

/** 옵션을 준 두 번째 에디터 만들기 (window.ed2) */
async function secondEditor(page, options) {
  await page.evaluate((o) => {
    const div = document.createElement('div');
    div.id = 'editor2';
    document.body.appendChild(div);
    window.ed2 = new window.JM.JmToolbarEditor(div, o);
  }, options);
}

test.beforeEach(async ({ page }) => { await open(page); });

test.describe('줄 간격', () => {
  test('선택한 모든 블록(p·제목·li·인용)에 적용하고 왕복해도 남는다', async ({ page }) => {
    await setHTML(page, '<p>a</p><h2>b</h2><ul><li>c</li></ul><blockquote>d</blockquote>');
    await selectAcross(page, 'p', 0, 'blockquote', 1);
    await exec(page, 'lineHeight', '1.5');
    expect(await html(page)).toBe('<p style="line-height: 1.5">a</p><h2 style="line-height: 1.5">b</h2><ul><li style="line-height: 1.5">c</li></ul><blockquote style="line-height: 1.5">d</blockquote>');
    const a = await html(page);
    await page.evaluate(() => window.ed.setHTML(window.ed.getHTML()));
    expect(await html(page)).toBe(a);
  });

  test('null 은 해제, 잘못된 값은 무시한다', async ({ page }) => {
    await setHTML(page, '<p style="line-height: 2; text-align: center">a</p>');
    await caret(page, 'p', 0);
    await exec(page, 'lineHeight', 'url(x);color:red');
    expect(await html(page)).toContain('line-height: 2');
    await exec(page, 'lineHeight', null);
    expect(await html(page)).toBe('<p style="text-align: center">a</p>');
  });

  test('목록 항목 직속 문단의 값도 함께 해제되고, 갤러리 제목은 대상이 아니다', async ({ page }) => {
    await setHTML(page, '<ul><li style="line-height: 2"><p style="line-height: 1.5">a</p></li></ul>');
    await caret(page, 'li p', 0);
    await exec(page, 'lineHeight', null);
    expect(await html(page)).toBe('<ul><li><p>a</p></li></ul>');
    await setHTML(page, '<div data-type="gallery" data-layout="justify"><p data-role="title">제목</p><img src="/a.png" alt=""></div>');
    await caret(page, '[data-role=title]', 1);
    await exec(page, 'lineHeight', '2');
    expect(await html(page)).not.toContain('line-height');
  });

  test('툴바: 실제 값을 보여 주고, 고른 값은 굵게, 지정 안 했을 때의 값을 고르면 해제', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await page.addStyleTag({ content: '.jm-editor p { line-height: 1.6 }' });
    await caret(page, 'p', 0);
    const btn = page.locator('.jm-btn[data-cmd=lineHeight]');
    await expect(btn).toHaveText('1.6');
    await btn.click();
    await expect(page.locator('.jm-listmenu .jm-ctxmenu-item')).toHaveText(['1', '1.2', '1.5', '1.6', '1.8', '2']);
    await expect(page.locator('.jm-listmenu .is-checked')).toHaveText('1.6');
    await page.locator('.jm-listmenu .jm-ctxmenu-item', { hasText: '1.8' }).click();
    expect(await html(page)).toBe('<p style="line-height: 1.8">a</p>');
    await expect(btn).toHaveText('1.8');
    await btn.click();
    await expect(page.locator('.jm-listmenu .is-checked')).toHaveText('1.8');
    await page.locator('.jm-listmenu .jm-ctxmenu-item', { hasText: '1.6' }).click();
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('되돌리기 한 번에 전체가 돌아온다', async ({ page }) => {
    await setHTML(page, '<p>a</p><p>b</p>');
    await selectAcross(page, 'p', 0, 'p:last-child', 1);
    await exec(page, 'lineHeight', '2');
    await exec(page, 'undo');
    expect(await html(page)).toBe('<p>a</p><p>b</p>');
  });
});

test.describe('글자 수', () => {
  test('기본은 꺼짐', async ({ page }) => {
    await expect(page.locator('.jm-charcount')).toHaveCount(0);
  });

  test('getTextLength: 공백 포함, ZWSP·헤더 제외, 표·제목 포함', async ({ page }) => {
    await setHTML(page, '<h2>제목</h2><p>a b</p><table><tbody><tr><td>칸</td></tr></tbody></table><div data-type="gallery" data-layout="justify"><p data-role="title">갤</p><img src="/a.png" alt="긴 대체 글"></div>');
    expect(await page.evaluate(() => window.core.getTextLength())).toBe(7);
    expect(await page.evaluate(() => window.ed.getTextLength())).toBe(7);
    await caret(page, 'h2', 0);
    await exec(page, 'bold'); // 커서용 ZWSP
    expect(await page.evaluate(() => window.core.getTextLength())).toBe(7);
    await setHTML(page, '');
    expect(await page.evaluate(() => window.core.getTextLength())).toBe(0);
  });

  test('블록 사이 줄바꿈은 세지 않아 HTML 보기와 편집 값이 같다', async ({ page }) => {
    const src = '<ul><li>a<ul><li>b</li></ul></li></ul><table><tbody><tr><td>c</td></tr></tbody></table><p>d e</p>';
    await setHTML(page, src);
    const a = await page.evaluate(() => window.ed.getTextLength());
    await page.evaluate(() => window.ed.setMode('html'));
    expect(await page.evaluate(() => window.ed.getTextLength())).toBe(a);
    expect(a).toBe(6);
  });

  test('표시·max 경고·입력 안 막음·HTML 모드·destroy', async ({ page }) => {
    await secondEditor(page, { charCount: { max: 3 }, initialHTML: '<p>ab</p>' });
    const count = page.locator('#editor2 .jm-charcount');
    await expect(count).toHaveText('2 / 3자');
    await expect(count).not.toHaveClass(/is-over/);
    await page.locator('#editor2 .jm-editor p').click();
    await page.keyboard.press('End');
    await page.keyboard.type('cd');
    await expect(count).toHaveText('4 / 3자');
    await expect(count).toHaveClass(/is-over/);
    expect(await page.evaluate(() => window.ed2.getHTML())).toBe('<p>abcd</p>');
    await page.evaluate(() => window.ed2.setMode('html'));
    await page.locator('#editor2 .jm-source').fill('<p>x<script>alert(1)</script></p>');
    await expect(count).toHaveText('1 / 3자');
    await page.evaluate(() => window.ed2.destroy());
    await expect(page.locator('.jm-charcount')).toHaveCount(0);
  });

  test('true 면 상한 없이 숫자만, 이상한 max 는 무시', async ({ page }) => {
    await secondEditor(page, { charCount: true, initialHTML: '<p>ab</p>' });
    await expect(page.locator('#editor2 .jm-charcount')).toHaveText('2자');
    await page.evaluate(() => { window.ed2.destroy(); });
    await secondEditor(page, { charCount: { max: 'x' }, initialHTML: '<p>ab</p>' });
    await expect(page.locator('#editor2 .jm-charcount').last()).toHaveText('2자');
  });
});

test.describe('링크 새 창 선택', () => {
  /** 툴바 링크 입력줄 열기 */
  const openLink = async (page) => { await page.locator('.jm-btn[data-cmd=link]').click(); return page.locator('.jm-inputbar-newwin input'); };

  test('API: 기존 exec(link, url) 는 그대로, newWindow:false 는 _self, true 는 _blank', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await select(page, 'p', 0, 1);
    await exec(page, 'link', 'https://a.com');
    expect(await html(page)).toContain('target="_blank" rel="noopener noreferrer"');
    await caret(page, 'a', 0);
    await page.evaluate(() => window.core.exec('link', 'https://a.com', { newWindow: false }));
    expect(await html(page)).toBe('<p><a target="_self" href="https://a.com">a</a>bc</p>');
    await expectRoundTrip(page);
    await caret(page, 'a', 0);
    await exec(page, 'link', 'https://b.com'); // 주소만 고치면 고른 값 유지
    expect(await html(page)).toContain('target="_self"');
    await caret(page, 'a', 0);
    await page.evaluate(() => window.core.exec('link', 'https://a.com', { newWindow: true }));
    expect(await html(page)).toContain('target="_blank" rel="noopener noreferrer"');
  });

  test('#·tel:·mailto: 는 newWindow 값과 상관없이 target 없음', async ({ page }) => {
    for (const url of ['#x', 'tel:010', 'mailto:a@b.c']) {
      for (const newWindow of [true, false]) {
        await setHTML(page, '<p>abc</p>');
        await select(page, 'p', 0, 1);
        await page.evaluate(([u, n]) => window.core.exec('link', u, { newWindow: n }), [url, newWindow]);
        const out = await html(page);
        expect(out).not.toContain('target=');
        expect(out).not.toContain('rel=');
      }
    }
  });

  test('입력줄: 새 링크는 체크, 해제하면 같은 창, 다시 열면 상태 반영', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await select(page, 'p', 0, 1);
    const box = await openLink(page);
    await expect(box).toBeVisible();
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.locator('.jm-inputbar-input').fill('https://a.com');
    await page.locator('.jm-inputbar-ok').click();
    expect(await html(page)).toContain('target="_self"');
    await caret(page, 'a', 0);
    await openLink(page);
    await expect(box).not.toBeChecked();
    await page.locator('.jm-inputbar-cancel').click();
    await expect(box).toBeHidden();
  });

  test('입력줄: 앵커 주소면 꺼지고, 외부 주소로 바꾸면 켜진다', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await select(page, 'p', 0, 1);
    const box = await openLink(page);
    await page.locator('.jm-inputbar-input').fill('#top');
    await expect(box).toBeDisabled();
    await expect(box).not.toBeChecked();
    await page.locator('.jm-inputbar-input').fill('https://a.com');
    await expect(box).toBeEnabled();
    await expect(box).toBeChecked();
  });

  test('유튜브 입력줄에는 체크박스가 없다', async ({ page }) => {
    await setHTML(page, '<p>abc</p>');
    await caret(page, 'p', 0);
    await page.locator('.jm-btn[data-cmd=youtube]').click();
    await expect(page.locator('.jm-inputbar-newwin')).toBeHidden();
  });
});

test.describe('위·아래 첨자', () => {
  test('범위에 적용하고 서로 배타, 다시 누르면 해제', async ({ page }) => {
    await setHTML(page, '<p>abcd</p>');
    await select(page, 'p', 1, 3);
    await exec(page, 'sub');
    expect(await html(page)).toBe('<p>a<sub>bc</sub>d</p>');
    await exec(page, 'sup');
    expect(await html(page)).toBe('<p>a<sup>bc</sup>d</p>');
    await expectRoundTrip(page);
    await select(page, 'sup', 0, 2);
    await exec(page, 'sup');
    expect(await html(page)).toBe('<p>abcd</p>');
  });

  test('커서 토글: 입력에 적용되고 끄면 나오며, 다른 쪽을 켜면 옮겨 간다', async ({ page }) => {
    await setHTML(page, '<p>x</p>');
    await caret(page, 'p', 1);
    const typed = async (t) => { await page.keyboard.type(t); await page.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); };
    await exec(page, 'sup');
    await typed('a');
    await exec(page, 'sub');
    await typed('b');
    await exec(page, 'sub');
    await typed('c');
    expect(await html(page)).toBe('<p>x<sup>a</sup><sub>b</sub>c</p>');
  });

  test('입력 없이 빠져나가면 빈 태그가 남지 않는다', async ({ page }) => {
    await setHTML(page, '<p>x</p>');
    await caret(page, 'p', 1);
    await exec(page, 'sup');
    expect(await html(page)).toBe('<p>x</p>');
  });

  test('버튼 상태 표시', async ({ page }) => {
    await setHTML(page, '<p>a<sub>b</sub><sup>c</sup></p>');
    await caret(page, 'sub', 1);
    await expect(page.locator('.jm-btn[data-cmd=sub]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.jm-btn[data-cmd=sup]')).toHaveAttribute('aria-pressed', 'false');
    await caret(page, 'sup', 1);
    await expect(page.locator('.jm-btn[data-cmd=sup]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('서식 지우기에 포함되고, 어느 모드에서든 정제 뒤 남으며 루트에서도 한 문단', async ({ page }) => {
    await setHTML(page, '<sup>1</sup> 각주');
    expect(await html(page)).toBe('<p><sup>1</sup> 각주</p>');
    await select(page, 'sup', 0, 1);
    await exec(page, 'clearFormat');
    expect(await html(page)).toBe('<p>1 각주</p>');
  });

  test('갤러리 제목 안에서도 남는다 (플러그인 안 규칙)', async ({ page }) => {
    await setHTML(page, '<div data-type="gallery" data-layout="justify"><p data-role="title">H<sub>2</sub>O</p><img src="/a.png" alt=""></div>');
    expect(await html(page)).toContain('H<sub>2</sub>O');
  });
});

test.describe('찾기·바꾸기', () => {
  /** 입력줄 열고 찾을 말 넣기 */
  const openFind = async (page, q) => {
    await page.locator('.jm-btn[data-cmd=find]').click();
    await page.locator('.jm-find-query').fill(q);
  };
  const count = (page) => page.locator('.jm-find-count');

  test('태그에 걸친 글자를 찾고, 바꾸면 첫 글자의 서식을 따른다', async ({ page }) => {
    await setHTML(page, '<p><strong>ab</strong>c</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'abc');
    await expect(count(page)).toHaveText('1/1');
    await page.locator('.jm-find-replace').fill('XY');
    await page.locator('.jm-find-one').click();
    expect(await html(page)).toBe('<p><strong>XY</strong></p>');
  });

  test('걸친 뒤쪽이 비면 빈 태그를 남기지 않는다', async ({ page }) => {
    await setHTML(page, '<p>a<em>b</em><u>c</u>d</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'bc');
    await page.locator('.jm-find-replace').fill('Z');
    await page.locator('.jm-find-one').click();
    expect(await html(page)).toBe('<p>a<em>Z</em>d</p>');
  });

  test('블록을 넘어 찾지 않고, 표 칸·제목·갤러리 제목은 찾는다, 블록 제어 글자·br 건너뛰기는 안 한다', async ({ page }) => {
    await setHTML(page, '<p>ab</p><p>cd</p><p>a<br>b</p>');
    expect(await page.evaluate(() => window.core.find.search('bc'))).toBe(0);
    expect(await page.evaluate(() => window.core.find.search('ab'))).toBe(1);
    await setHTML(page, '<h2>k</h2><table><tbody><tr><td>k</td></tr></tbody></table><div data-type="gallery" data-layout="justify"><p data-role="title">k</p><img src="/a.png" alt="k"></div><p>k</p>');
    expect(await page.evaluate(() => window.core.find.search('k'))).toBe(4);
    const header = await page.evaluate(() => { // 레이어 헤더(편집 불가)의 글자는 찾지 않는다
      const t = window.core.root.querySelector('.jm-gallery-layer [contenteditable="false"] button, .jm-gallery-header button')?.textContent?.trim();
      return t ? window.core.find.search(t.slice(0, 2)) : 0;
    });
    expect(header).toBe(0);
  });

  test('대소문자 구분·이전·다음·일치 수', async ({ page }) => {
    await setHTML(page, '<p>Foo foo FOO</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'foo');
    await expect(count(page)).toHaveText('1/3');
    await page.locator('.jm-find-next').click();
    await expect(count(page)).toHaveText('2/3');
    await page.locator('.jm-find-prev').click();
    await page.locator('.jm-find-prev').click();
    await expect(count(page)).toHaveText('3/3');
    await page.locator('.jm-find-case').check();
    await expect(count(page)).toHaveText('1/1');
  });

  test('사용자 입력은 글자 그대로 (정규식 아님), 빈 말·일치 없음은 안전', async ({ page }) => {
    await setHTML(page, '<p>a.c abc (x</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'a.c');
    await expect(count(page)).toHaveText('1/1');
    await page.locator('.jm-find-query').fill('(x');
    await expect(count(page)).toHaveText('1/1');
    await page.locator('.jm-find-query').fill('');
    await expect(count(page)).toHaveText('');
    for (const b of ['next', 'prev', 'one', 'all']) await page.locator(`.jm-find-${b}`).click();
    await page.locator('.jm-find-query').fill('없는말');
    await expect(count(page)).toHaveText('0/0');
    for (const b of ['next', 'prev', 'one', 'all']) await page.locator(`.jm-find-${b}`).click();
    expect(await html(page)).toBe('<p>a.c abc (x</p>');
  });

  test('모두 바꾸기: 되돌리기 1단계, 바꾼 말에 찾을 말이 있어도 한 번만, 앞선 입력은 따로', async ({ page }) => {
    await setHTML(page, '<p>aa aa</p><table><tbody><tr><td>aa</td></tr></tbody></table><h2>aa</h2>');
    await caret(page, 'p', 0);
    await page.keyboard.type('Z');
    await openFind(page, 'aa');
    await page.locator('.jm-find-replace').fill('aaa');
    await page.locator('.jm-find-all').click();
    const after = await html(page);
    expect(after).toContain('<p>Zaaa aaa</p>');
    expect(after).toContain('<td>aaa</td>');
    expect(after).toContain('<h2>aaa</h2>');
    await exec(page, 'undo');
    expect(await html(page)).toContain('<p>Zaa aa</p>');
    await exec(page, 'redo');
    expect(await html(page)).toBe(after);
  });

  test('바꿀 말은 글자로만 (XSS 없음)', async ({ page }) => {
    await setHTML(page, '<p>aa</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'aa');
    await page.locator('.jm-find-replace').fill('<img src=x onerror=alert(1)>');
    await page.locator('.jm-find-all').click();
    expect(await html(page)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(await page.evaluate(() => window.core.root.querySelector('img'))).toBeNull();
  });

  test('빈 말로 바꾸면 지우고, 비는 블록은 커서 자리를 남긴다', async ({ page }) => {
    await setHTML(page, '<p>aa</p><p>b</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'aa');
    await page.locator('.jm-find-all').click();
    expect(await html(page)).toBe('<p><br></p><p>b</p>');
  });

  test('버튼 글자를 빈 말로 바꾸면 그 항목을 지우고, 버튼이 없어지면 블록도 지운다', async ({ page }) => {
    await setHTML(page, '<div data-type="buttons" data-align="left"><a href="/x" data-role="button" data-style="primary">aa</a><a href="/y" data-role="button" data-style="primary">b</a></div><p>c</p>');
    await page.evaluate(() => { window.core.find.search('aa'); window.core.find.replaceAll(''); });
    expect(await page.evaluate(() => window.core.root.querySelectorAll('a[data-role=button]').length)).toBe(1);
    expect(await html(page)).not.toContain('></a><a');
    await page.evaluate(() => { window.core.find.search('b'); window.core.find.replaceAll(''); });
    expect(await html(page)).toBe('<p><br></p><p>c</p>');
  });

  test('한 개씩 바꾸면 다음 일치로 간다', async ({ page }) => {
    await setHTML(page, '<p>a a a</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'a');
    await page.locator('.jm-find-replace').fill('a1');
    await page.locator('.jm-find-one').click();
    await expect(count(page)).toHaveText('2/3');
    await page.locator('.jm-find-one').click();
    expect(await html(page)).toBe('<p>a1 a1 a</p>');
  });

  test('저장 HTML 에 흔적이 없고, 닫으면 강조가 사라지며 커서가 돌아온다', async ({ page }) => {
    await setHTML(page, '<p>hello world</p>');
    await caret(page, 'p', 3);
    await openFind(page, 'o');
    await expect(count(page)).toHaveText('1/2');
    expect(await html(page)).toBe('<p>hello world</p>');
    const supported = await page.evaluate(() => !!window.CSS?.highlights);
    if (supported) expect(await page.evaluate(() => CSS.highlights.get('jm-find').size)).toBe(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.jm-findbar')).toBeHidden();
    if (supported) expect(await page.evaluate(() => CSS.highlights.has('jm-find') && CSS.highlights.get('jm-find').size)).toBeFalsy();
    const r = await page.evaluate(() => { const s = getSelection(); return [document.activeElement === window.core.root, s.anchorNode.data, s.anchorOffset]; });
    expect(r).toEqual([true, 'hello world', 3]);
  });

  test('Highlight 미지원이면 현재 일치만 선택 표시', async ({ page }) => {
    await page.evaluate(() => { Object.defineProperty(CSS, 'highlights', { value: undefined, configurable: true }); });
    await setHTML(page, '<p>foo bar foo</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'bar');
    await page.locator('.jm-find-next').click();
    expect(await page.evaluate(() => getSelection().toString())).toBe('bar');
  });

  test('Ctrl+F·Ctrl+H 는 에디터 포커스에서만 입력줄을 연다', async ({ page }) => {
    await setHTML(page, '<p>hello</p>');
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(page.locator('.jm-findbar')).toBeHidden();
    await select(page, 'p', 0, 2);
    await page.keyboard.press('Control+f');
    await expect(page.locator('.jm-findbar')).toBeVisible();
    await expect(page.locator('.jm-find-query')).toHaveValue('he');
    await expect(page.locator('.jm-find-query')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+h');
    await expect(page.locator('.jm-find-replace')).toBeFocused();
  });

  test('HTML·미리보기 모드에서는 비활성, 전환하면 닫힌다', async ({ page }) => {
    await setHTML(page, '<p>aa</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'aa');
    await page.evaluate(() => window.ed.setMode('html'));
    await expect(page.locator('.jm-findbar')).toBeHidden();
    await expect(page.locator('.jm-btn[data-cmd=find]')).toBeDisabled();
    await page.locator('.jm-source').press('Control+f').catch(() => {});
    await expect(page.locator('.jm-findbar')).toBeHidden();
    await page.evaluate(() => window.ed.setMode('editor'));
    await expect(page.locator('.jm-btn[data-cmd=find]')).toBeEnabled();
  });

  test('되돌리기로 내용이 바뀌면 일치를 다시 센다, destroy 뒤 강조가 남지 않는다', async ({ page }) => {
    await setHTML(page, '<p>aa aa</p>');
    await caret(page, 'p', 0);
    await openFind(page, 'aa');
    await page.locator('.jm-find-replace').fill('b');
    await page.locator('.jm-find-all').click();
    await expect(count(page)).toHaveText('0/0');
    await exec(page, 'undo');
    await expect(count(page)).toHaveText('1/2');
    await page.evaluate(() => window.ed.destroy());
    if (await page.evaluate(() => !!window.CSS?.highlights)) expect(await page.evaluate(() => CSS.highlights.has('jm-find') && CSS.highlights.get('jm-find').size)).toBeFalsy();
    await expect(page.locator('.jm-findbar')).toHaveCount(0);
  });
});

test.describe('자동 alt 정리', () => {
  test('갤러리·슬라이드·배치에 올린 사진의 alt 는 빈 값 (파일명 아님)', async ({ page }) => {
    await setHTML(page, '<p>x</p>');
    await caret(page, 'p', 1);
    await exec(page, 'gallery');
    await page.evaluate(() => { window.core.gallery.pendingGallery = window.core.root.querySelector('div[data-type=gallery]'); });
    await page.evaluate(() => { window.__in = window.core.gallery.fileInput; });
    await (await page.evaluateHandle(() => window.core.gallery.fileInput)).asElement().setInputFiles(PNG);
    await page.waitForFunction(() => window.core.root.querySelector('div[data-type=gallery] img'));
    await caret(page, 'p', 0);
    await exec(page, 'slider');
    await page.evaluate(() => { window.core.slider.pending = window.core.root.querySelector('div[data-type=slider]'); });
    await (await page.evaluateHandle(() => window.core.slider.fileInput)).asElement().setInputFiles(PNG);
    await page.waitForFunction(() => window.core.root.querySelector('div[data-type=slider] img'));
    await caret(page, 'p', 0);
    await exec(page, 'layout', 'side');
    await page.evaluate(() => { window.core.layout.pendingCell = window.core.root.querySelector('div[data-type=layout] [data-cell=image]'); });
    await (await page.evaluateHandle(() => window.core.layout.fileInput)).asElement().setInputFiles(PNG);
    await page.waitForFunction(() => window.core.root.querySelector('div[data-type=layout] img'));
    const out = await html(page);
    expect(out).not.toContain('photo-1234');
    expect(out.match(/<img [^>]*>/g).every((t) => t.includes('alt=""'))).toBe(true);
  });

  test('저장돼 있는 alt 는 유지', async ({ page }) => {
    await setHTML(page, '<div data-type="gallery" data-layout="justify"><img src="/a.png" alt="옛 설명"></div>');
    expect(await html(page)).toContain('alt="옛 설명"');
  });

  test('이미지 교체: 쓴 대체 글은 유지, 빈 값이면 빈 값', async ({ page }) => {
    for (const [src, want] of [['<p><img src="/a.png" alt="쓴 글" width="40" height="40"></p>', 'alt="쓴 글"'], ['<p><img src="/a.png" alt="" width="40" height="40"></p>', 'alt=""']]) {
      await setHTML(page, src);
      await page.click('.jm-editor img', { force: true });
      await page.locator('body > input[type=file]').first().setInputFiles(PNG);
      await page.waitForFunction(() => window.core.root.querySelector('img').src.startsWith('data:'));
      expect(await html(page)).toContain(want);
    }
  });
});

test.describe('hr 분할 상한', () => {
  test('strong 200단계 + hr 2만 개가 2초 안에 끝나고 글은 남으며 멱등', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { Sanitizer, makeStructurePolicy } = window.JM;
      const src = `${'<strong>'.repeat(200)}글${'<hr>'.repeat(20000)}자${'</strong>'.repeat(200)}`;
      const results = [makeStructurePolicy({ enabled: true }), null].map((pol) => {
        const t = performance.now();
        const out = Sanitizer.clean(src, pol);
        const ms = performance.now() - t;
        const box = document.createElement('div');
        box.innerHTML = out;
        return { ms, hr: box.querySelectorAll('hr').length, strong: box.querySelectorAll('strong').length, text: box.textContent, same: Sanitizer.clean(out, pol) === out };
      });
      return results;
    });
    for (const x of r) {
      expect(x.ms).toBeLessThan(2000);
      expect(x.hr).toBe(0);
      expect(x.strong).toBe(200);
      expect(x.text).toBe('글자');
      expect(x.same).toBe(true);
    }
  });

  test('복제 총량 상한: 8단계 hr 이 많아도 복제 수가 1만을 넘지 않고 멱등', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { Sanitizer } = window.JM;
      const src = `${'<u>'.repeat(8)}${'a<hr>'.repeat(5000)}z${'</u>'.repeat(8)}`;
      const t = performance.now();
      const out = Sanitizer.clean(src, null);
      const ms = performance.now() - t;
      const box = document.createElement('div');
      box.innerHTML = out;
      return { ms, u: box.querySelectorAll('u').length, nested: box.querySelectorAll('u hr').length, text: box.textContent.length, same: Sanitizer.clean(out, null) === out };
    });
    expect(r.ms).toBeLessThan(2000);
    expect(r.u).toBeLessThanOrEqual(10000 + 8);
    expect(r.nested).toBe(0);
    expect(r.text).toBe(5001);
    expect(r.same).toBe(true);
  });
});

test.describe('데모', () => {
  test.describe.configure({ timeout: 60000 });
  test.beforeEach(async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
  });

  test('데모 툴바에 새 도구가 있고 글자 수가 켜져 있다', async ({ page }) => {
    for (const c of ['lineHeight', 'sub', 'sup', 'find']) await expect(page.locator(`.jm-btn[data-cmd=${c}]`)).toHaveCount(1);
    await expect(page.locator('.jm-charcount')).toHaveText(/^[\d,]+자$/);
    await expect(page.locator('#linkNewWin')).toBeHidden();
  });

  test('데모 찾기·바꾸기·링크 체크박스가 동작한다', async ({ page }) => {
    await page.locator('.jm-btn[data-cmd=find]').click();
    await page.locator('.jm-find-query').fill('공지사항');
    await expect(page.locator('.jm-find-count')).toHaveText('1/1');
    await page.locator('.jm-find-replace').fill('알림');
    await page.locator('.jm-find-all').click();
    await expect(page.locator('#html')).toContainText('알림 작성 샘플');
    await page.keyboard.press('Escape');
    await page.locator('.jm-editor h2').click();
    await page.locator('.jm-btn[data-cmd=link]').click();
    await expect(page.locator('#linkNewWin')).toBeChecked();
  });
});

test.describe('리뷰 지적 수정', () => {
  test('스타일 없는 span·font 가 글과 블록을 감싸도 정제가 터지지 않는다', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { Sanitizer, makeStructurePolicy } = window.JM;
      const on = makeStructurePolicy({ enabled: true });
      return ['<span>x<hr>y</span>', '<span>x<p>y</p></span>', '<font>x<div>y</div></font>', '<span class="k">x<hr>y</span>'].map((src) => Sanitizer.clean(src, on));
    });
    expect(r).toEqual(['x<hr>y', 'x<p>y</p>', 'x<div>y</div>', 'x<hr>y']);
  });

  test('ZWSP 가 있어도 아이콘이 든 링크·span 은 저장에 남는다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<p><a href="/x"><i class="ico"></i></a> t</p><p><span class="k"><i class="ico"></i></span>u</p>');
    const out = await page.evaluate(() => {
      window.core.root.querySelectorAll('a, span.k').forEach((el) => el.appendChild(document.createTextNode('\u200B')));
      return window.core.getHTML();
    });
    expect(out).toContain('<i class="ico"></i></a> t');
    expect(out).toContain('<span class="k"><i class="ico"></i></span>u');
  });

  test('빈 글자 서식만 든 커서 자리 태그는 여전히 지운다', async ({ page }) => {
    await setHTML(page, '<p>a</p>');
    await page.evaluate(() => { window.core.root.querySelector('p').insertAdjacentHTML('beforeend', '<strong><em>\u200B</em></strong>'); });
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('아이콘을 사이에 둔 글의 서식 지우기·굵게 해제에서 아이콘이 남는다', async ({ page }) => {
    await open(page, '?structure=1');
    for (const cmd of ['clearFormat', 'bold']) {
      await setHTML(page, '<p><strong>a<i class="ico"></i>b</strong></p>');
      await page.evaluate(() => {
        const r = document.createRange();
        r.selectNodeContents(window.core.root.querySelector('strong'));
        window.core.root.focus();
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await exec(page, cmd);
      expect(await html(page)).toContain('<i class="ico"></i>');
    }
  });

  test('찾기: 일치가 13만 개여도 터지지 않고 상한을 표시하며, 모두 바꾸기는 전부 바꾼다', async ({ page }) => {
    test.setTimeout(60000);
    await setHTML(page, `<p>${'a '.repeat(130000)}</p>`);
    await page.locator('.jm-btn[data-cmd=find]').click();
    await page.locator('.jm-find-query').fill('a');
    await expect(page.locator('.jm-find-count')).toHaveText('1/10000개 이상');
    await page.locator('.jm-find-replace').fill('bb');
    await page.locator('.jm-find-all').click();
    await expect(page.locator('.jm-find-count')).toHaveText('0/0');
    const r = await page.evaluate(() => [window.core.getTextLength(), window.core.getHTML().includes('a ')]);
    expect(r[1]).toBe(false);
    expect(r[0]).toBeGreaterThanOrEqual(390000 - 1);
  });

  test('찾기 강조가 실패해도 편집과 알림은 막히지 않는다', async ({ page }) => {
    await setHTML(page, '<p>aa</p>');
    await caret(page, 'p', 0);
    await page.evaluate(() => { window.core.find.search('a'); });
    const r = await page.evaluate(() => {
      const orig = window.Range.prototype.compareBoundaryPoints;
      window.Range.prototype.compareBoundaryPoints = () => { throw new RangeError('x'); };
      try { window.core.exec('bold'); return 'ok'; } catch (e) { return e.message; } finally { window.Range.prototype.compareBoundaryPoints = orig; }
    });
    expect(r).toBe('ok');
  });

  test('줄 간격: 표 칸 직접 글은 칸에, 왕복해도 남는다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>a</td><th>b</th></tr></tbody></table>');
    await caret(page, 'td', 0);
    await exec(page, 'lineHeight', '1.5');
    await caret(page, 'th', 0);
    await exec(page, 'lineHeight', '2');
    expect(await html(page)).toContain('<td style="line-height: 1.5">a</td><th style="line-height: 2">b</th>');
    await page.evaluate(() => window.ed.setHTML(window.ed.getHTML()));
    expect(await html(page)).toContain('<td style="line-height: 1.5">a</td>');
    await caret(page, 'td', 0);
    await exec(page, 'lineHeight', null);
    expect(await html(page)).toContain('<td>a</td>');
  });

  test('줄 간격: 구조 모드의 글만 있는 div 에도', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<div class="d">a</div>');
    await caret(page, 'div.d', 0);
    await exec(page, 'lineHeight', '1.8');
    expect(await html(page)).toBe('<div class="d" style="line-height: 1.8">a</div>');
  });

  test('들여쓰기 버튼: 표 칸에서는 꺼지고 칸 안 목록과 표 밖에서는 켜진다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>a</td><td><ul><li>x</li><li>y</li></ul></td></tr></tbody></table><p>b</p>');
    const indent = page.locator('.jm-btn[data-cmd=indent]');
    const outdent = page.locator('.jm-btn[data-cmd=outdent]');
    await caret(page, 'td', 0);
    await expect(indent).toBeDisabled();
    await expect(outdent).toBeDisabled();
    await caret(page, 'li:last-child', 0);
    await expect(indent).toBeEnabled();
    await indent.click();
    expect(await html(page)).toContain('<li>x<ul><li>y</li></ul></li>');
    await caret(page, 'p', 0);
    await expect(indent).toBeEnabled();
  });

  test('찾기: 항목 안 문단끼리는 이어 찾지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li><p>aa</p><p>bb</p></li></ul>');
    expect(await page.evaluate(() => window.core.find.search('ab'))).toBe(0);
    expect(await page.evaluate(() => window.core.find.search('aa'))).toBe(1);
  });

  test('찾기: 빈 말로 바꿔도 아이콘 있는 링크는 남는다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<p><a href="/1"><i class="ico"></i>ab</a>c</p>');
    await page.evaluate(() => { window.core.find.search('ab'); window.core.find.replaceAll(''); });
    expect(await html(page)).toContain('<i class="ico"></i></a>c');
  });

  test('맨 끝 hr 뒤에 자동 문단을 두고, 비어 있으면 저장하지 않으며, 입력은 뒤로 들어간다', async ({ page }) => {
    await setHTML(page, '<p>a</p><hr>');
    expect(await html(page)).toBe('<p>a</p><hr>');
    await page.evaluate(() => { const r = window.core.root; const s = getSelection(); const g = document.createRange(); g.selectNodeContents(r.lastElementChild); g.collapse(true); r.focus(); s.removeAllRanges(); s.addRange(g); });
    expect(await page.evaluate(() => window.core.root.lastElementChild.tagName)).toBe('P');
    await page.keyboard.type('x');
    expect(await html(page)).toBe('<p>a</p><hr><p>x</p>');
  });

  test('블록 줄 간격을 지정·해제하면 안쪽 span 의 값도 지운다', async ({ page }) => {
    await setHTML(page, '<p style="line-height: 2"><span style="line-height: 3">a</span></p>');
    await caret(page, 'span', 0);
    await exec(page, 'lineHeight', null);
    expect(await html(page)).toBe('<p>a</p>');
    await setHTML(page, '<p><span style="line-height: 3; color: red">a</span></p>');
    await caret(page, 'span', 0);
    await exec(page, 'lineHeight', '1.5');
    expect(await html(page)).toBe('<p style="line-height: 1.5"><span style="color: red">a</span></p>');
  });

  test('글자 수: 블록 안 가장자리 소스 공백은 세지 않는다', async ({ page }) => {
    const n = await page.evaluate(() => window.JM.JmEditor.countText('<section>\n   <span class="a">x</span>\n</section>'));
    expect(n).toBe(1);
    expect(await page.evaluate(() => window.JM.JmEditor.countText('<p><span>a</span> <span>b</span></p>'))).toBe(3);
  });

  test('찾기 입력줄 안 Ctrl+F 는 찾을 말 칸을 선택한다', async ({ page }) => {
    await setHTML(page, '<p>aa</p>');
    await caret(page, 'p', 0);
    await page.locator('.jm-btn[data-cmd=find]').click();
    await page.locator('.jm-find-query').fill('aa');
    await page.locator('.jm-find-replace').focus();
    await page.keyboard.press('Control+f');
    await expect(page.locator('.jm-find-query')).toBeFocused();
    expect(await page.evaluate(() => { const i = document.querySelector('.jm-find-query'); return [i.selectionStart, i.selectionEnd]; })).toEqual([0, 2]);
  });
});
