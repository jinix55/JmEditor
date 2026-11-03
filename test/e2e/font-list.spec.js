/**
 * 글꼴 목록 정리 — 툴바 9개, 저장 값에 대체 글꼴(나눔고딕·나눔명조·Pretendard), 목록 밖 글꼴은 Pretendard 로,
 * 목록 메뉴는 각 글꼴로 그려 보여 준다. 글꼴 파일은 선택형 jm-editor.fonts.css 에서
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, select, exec } from './helpers.js';

const FONTS = ['Pretendard', '맑은 고딕', 'Noto Sans KR', 'Noto Sans', 'Roboto', '굴림', '돋움', '바탕', '궁서'];

/** span 하나를 정제한 결과 */
const cleanSpan = (page, family) => page.evaluate((f) => window.JM.Sanitizer.clean(`<span style="font-family:${f}">a</span>`), family);
/** 저장 style 값 */
const styled = (value) => `<span style="font-family: ${value.replaceAll('"', '&quot;')}">a</span>`;

test.describe('글꼴 목록 정리', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('툴바 목록은 정한 9개, 순서대로', async ({ page }) => {
    await setHTML(page, '<p>글자</p>');
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    const items = await page.getByRole('menuitemradio').allTextContents();
    expect(items.filter((t) => FONTS.includes(t))).toEqual(FONTS);
    for (const old of ['함초롬바탕', '한컴바탕', 'HY헤드라인M', 'Arial', 'Times New Roman', 'Apple SD Gothic Neo']) expect(items).not.toContain(old);
  });

  test('목록 메뉴는 각 글꼴로 그려 보여 준다', async ({ page }) => {
    await setHTML(page, '<p>글자</p>');
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    const fonts = await page.getByRole('menuitemradio').evaluateAll((els) => els.map((e) => [e.textContent, e.style.fontFamily]));
    for (const name of FONTS) expect(fonts.find(([t]) => t === name)?.[1]).toContain(name);
    expect(fonts.find(([t]) => t === '바탕')[1]).toContain('Nanum Myeongjo');
  });

  test('저장 값에 대체 글꼴을 붙인다', async ({ page }) => {
    const expected = {
      Pretendard: '"Pretendard", sans-serif',
      '맑은 고딕': '"맑은 고딕", "Pretendard", sans-serif',
      'Noto Sans KR': '"Noto Sans KR", "Pretendard", sans-serif',
      'Noto Sans': '"Noto Sans", "Pretendard", sans-serif',
      Roboto: '"Roboto", "Pretendard", sans-serif',
      굴림: '"굴림", "Nanum Gothic", "Pretendard", sans-serif',
      돋움: '"돋움", "Nanum Gothic", "Pretendard", sans-serif',
      바탕: '"바탕", "Nanum Myeongjo", "Pretendard", serif',
      궁서: '"궁서", "Pretendard", sans-serif',
    };
    for (const [name, value] of Object.entries(expected)) expect(await cleanSpan(page, `'${name}'`)).toBe(styled(value));
  });

  test('툴바로 고른 글꼴도 같은 저장 값', async ({ page }) => {
    await setHTML(page, '<p>가나다</p>');
    await select(page, 'p', 0, 2);
    await exec(page, 'fontFamily', '바탕');
    expect(await html(page)).toBe('<p><span style="font-family: &quot;바탕&quot;, &quot;Nanum Myeongjo&quot;, &quot;Pretendard&quot;, serif">가나</span>다</p>');
  });

  test('목록 밖 글꼴은 Pretendard 로 바꾸고, 일반 패밀리·키워드만 있으면 지운다', async ({ page }) => {
    const pretendard = styled('"Pretendard", sans-serif');
    for (const f of ['함초롬바탕', "'HCR Batang'", 'Arial,sans-serif', "'Comic Sans MS'", "'Times New Roman'", 'HY헤드라인M']) expect(await cleanSpan(page, f)).toBe(pretendard);
    for (const f of ['serif', 'sans-serif,monospace', 'inherit']) expect(await cleanSpan(page, f)).toBe('a');
    expect(await page.evaluate(() => window.JM.Sanitizer.clean('<font face="Arial">a</font>'))).toBe(pretendard);
    expect(await cleanSpan(page, "'없는 글꼴',굴림")).toBe(styled('"굴림", "Nanum Gothic", "Pretendard", sans-serif')); // 목록 글꼴이 있으면 그것
  });

  test('-webkit- 일반 패밀리·default 는 글꼴로 치지 않고 지운다', async ({ page }) => {
    for (const f of ['-webkit-standard', '-webkit-body', '-webkit-pictograph', 'default']) expect(await cleanSpan(page, f)).toBe('a');
  });

  test('목록에 Pretendard 가 없으면 목록 밖 글꼴은 지운다 (빈 목록 = 글꼴 끔)', async ({ page }) => {
    const out = await page.evaluate(() => {
      const { Sanitizer } = window.JM;
      const src = '<span style="font-family:Arial">a</span><span style="font-family:굴림">b</span>';
      return [Sanitizer.clean(src, null, []), Sanitizer.clean(src, null, ['굴림'])];
    });
    expect(out).toEqual(['ab', 'a<span style="font-family: &quot;굴림&quot;, &quot;Nanum Gothic&quot;, &quot;Pretendard&quot;, sans-serif">b</span>']);
  });

  test('문단을 합칠 때 브라우저가 끼워 넣은 글꼴 span 은 풀린다 (Pretendard 로 남지 않음)', async ({ page }) => {
    await page.addStyleTag({ content: '.jm-editor h2 { font-family: "Courier New"; }' });
    await setHTML(page, '<p>aaa</p><h2>bbb</h2>');
    await page.evaluate(() => {
      const t = window.core.root.querySelector('h2').firstChild;
      const r = document.createRange(); r.setStart(t, 0); r.collapse(true);
      window.core.root.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await page.keyboard.press('Backspace');
    expect(await html(page)).not.toContain('font-family');
  });

  test('영문 별칭은 한글 이름으로', async ({ page }) => {
    expect(await cleanSpan(page, 'Gulim')).toBe(styled('"굴림", "Nanum Gothic", "Pretendard", sans-serif'));
    expect(await cleanSpan(page, 'Dotum')).toBe(styled('"돋움", "Nanum Gothic", "Pretendard", sans-serif'));
    expect(await cleanSpan(page, 'Batang')).toBe(styled('"바탕", "Nanum Myeongjo", "Pretendard", serif'));
    expect(await cleanSpan(page, 'Gungsuh')).toBe(styled('"궁서", "Pretendard", sans-serif'));
    expect(await cleanSpan(page, "'Malgun Gothic'")).toBe(styled('"맑은 고딕", "Pretendard", sans-serif'));
  });

  test('두 번 정제해도 같다', async ({ page }) => {
    const twice = await page.evaluate(() => {
      const { Sanitizer } = window.JM;
      return ['바탕', 'Gulim', 'Arial', 'Pretendard', 'Roboto'].map((f) => {
        const once = Sanitizer.clean(`<p><span style="font-family:${f}">a</span></p>`);
        return once === Sanitizer.clean(once);
      });
    });
    expect(twice).toEqual([true, true, true, true, true]);
  });

  test('글꼴 파일은 선택형 fonts.css 에만 (기본 CSS 는 외부 요청 없음)', async ({ page }) => {
    const [fonts, core] = await page.evaluate(() => Promise.all(['/src/styles/jm-editor.fonts.css', '/src/styles/jm-editor.css'].map((u) => fetch(u).then((r) => r.text()))));
    expect(fonts).toContain('cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/');
    for (const f of ['Nanum+Gothic', 'Nanum+Myeongjo', 'Noto+Sans+KR', 'Noto+Sans:', 'Roboto']) expect(fonts).toContain(f);
    expect(core).not.toMatch(/@import|url\(["']?https?:/); // data: SVG 안의 xmlns 주소는 요청이 아님
  });
});
