/**
 * 옛 글 이관·붙여넣기 — 옛 형식 변환, 표 셀 테두리, 글꼴, 엑셀·워드 붙여넣기
 * 변환 사례는 test/fixtures/legacy/cases.txt (서버 LegacyFormatTest 와 같은 파일)
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open, setHTML, html, select, exec, caret, paste } from './helpers.js';

/**
 * 공통 사례 읽기
 * @returns {Array<{input: string, expected: string, keepClass: boolean}>}
 */
function readCases() {
  const out = [];
  let input = null;
  fs.readFileSync('test/fixtures/legacy/cases.txt', 'utf8').split('\n').forEach((line) => {
    if (line.startsWith('< ')) input = line.slice(2);
    else if (line === '>' || line.startsWith('> ')) {
      const raw = line.slice(2);
      const keepClass = raw.startsWith('@CLASS ');
      out.push({ input, expected: keepClass ? raw.slice(7) : raw, keepClass });
    }
  });
  return out;
}

/** 페이지 안 정제: 정책 켬·끔 각각의 결과, 두 번 정제 결과, 기대값을 같은 방식으로 정규화해 돌려준다 */
async function runCases(page, cases) {
  return page.evaluate((list) => {
    const canon = (x) => {
      const t = document.createElement('template');
      t.innerHTML = x;
      t.content.querySelectorAll('*').forEach((el) => {
        const a = [...el.attributes].map((at) => [at.name, at.value]).sort(([p], [q]) => p.localeCompare(q));
        a.forEach(([n]) => el.removeAttribute(n)); a.forEach(([n, v]) => el.setAttribute(n, v));
      });
      return t.innerHTML;
    };
    const { Sanitizer, makeStructurePolicy } = window.JM;
    const on = makeStructurePolicy({ enabled: true });
    return list.map(({ input, expected, keepClass }) => {
      const a = Sanitizer.clean(input, on);
      const b = Sanitizer.clean(input, null);
      return {
        input,
        on: canon(a), onTwice: canon(Sanitizer.clean(a, on)),
        off: canon(b), offTwice: canon(Sanitizer.clean(b, null)),
        expectedOn: canon(expected),
        expectedOff: canon(keepClass ? expected.replace(/ class="[^"]*"/g, '') : expected),
      };
    });
  }, cases);
}

test.describe('옛 형식 변환 (공통 사례)', () => {
  test.beforeEach(async ({ page }) => { await open(page, ''); });

  test('사례 전체: 켬·끔 기대값과 같고 두 번 정제해도 같다', async ({ page }) => {
    const cases = readCases();
    expect(cases.length).toBeGreaterThan(50);
    for (const r of await runCases(page, cases)) {
      expect(r.on, `켬: ${r.input}`).toBe(r.expectedOn);
      expect(r.onTwice, `켬 두 번: ${r.input}`).toBe(r.on);
      expect(r.off, `끔: ${r.input}`).toBe(r.expectedOff);
      expect(r.offTwice, `끔 두 번: ${r.input}`).toBe(r.off);
    }
  });

  test('div: 끔이면 p 로 바뀌어도 style·굵기는 유지', async ({ page }) => {
    const r = await page.evaluate(() => {
      const src = '<div style="font-size:10pt;font-weight:bold">a</div>';
      return [window.JM.Sanitizer.clean(src, window.JM.makeStructurePolicy({ enabled: true })), window.JM.Sanitizer.clean(src, null)];
    });
    expect(r).toEqual(['<div style="font-size: 13px"><strong>a</strong></div>', '<p style="font-size: 13px"><strong>a</strong></p>']);
  });

  test('플러그인 블록은 굵기 감싸기로 형식이 깨지지 않는다', async ({ page }) => {
    const out = await page.evaluate(() => window.JM.Sanitizer.clean('<div data-type="buttons" style="font-weight:bold"><a href="/x" data-role="button" style="font-weight:bold">a</a></div>', null));
    expect(out).toContain('<div data-type="buttons" data-align="center"><a href="/x" data-role="button"');
  });

  test('아주 긴 값·많은 선언도 빠르다 (이차 시간 없음)', async ({ page }) => {
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      const { clean } = window.JM.Sanitizer;
      const sp = ' '.repeat(1000000);
      clean(`<span style="color:${sp}red${sp}">a</span>`);
      clean(`<span style="font-family:${"'".repeat(1000000)}">a</span>`);
      clean(`<table><tr><td style="border:${'1px '.repeat(250000)}">a</td></tr></table>`);
      clean(`<span style="${'color:red;'.repeat(100000)}">a</span>`);
      clean(`<p style="font-weight:bold">${'<span>a</span>'.repeat(50000)}</p>`);
      clean('<span style="font-weight:bold">'.repeat(5000));
      clean('<div style="font-weight:bold">a'.repeat(5000));
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(5000);
  });

  test('글꼴 허용 목록: 인자·설정 파일·별칭', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { Sanitizer } = window.JM;
      const src = '<span style="font-family:Arial,\'맑은 고딕\'">a</span>';
      const own = Sanitizer.clean(src, null, ['맑은 고딕']);
      const none = Sanitizer.clean(src, null, []);
      window.JmEditorConfig = { font: { families: ['Malgun Gothic', 'bad"name'] } };
      const cfg = [Sanitizer.clean('<span style="font-family:malgun gothic">a</span>'), Sanitizer.clean('<span style="font-family:\'bad&quot;name\'">a</span>')];
      delete window.JmEditorConfig;
      return { own, none, cfg };
    });
    expect(r.own).toBe('<span style="font-family: &quot;맑은 고딕&quot;">a</span>');
    expect(r.none).toBe('a');
    expect(r.cfg).toEqual(['<span style="font-family: &quot;Malgun Gothic&quot;">a</span>', 'a']);
  });
});

test.describe('리뷰 수정', () => {
  test('블록을 감싼 font: 편집기에서 서식이 남고 빈 문단이 없다', async ({ page }) => {
    await open(page, '');
    await setHTML(page, '<font color=red><p>a</p><p>b</p></font>');
    expect(await html(page)).toBe('<p><span style="color: red">a</span></p><p><span style="color: red">b</span></p>');
    await setHTML(page, '<font color=red><table><tr><td>a</td></tr></table><p>b</p></font>');
    expect(await page.locator('.jm-editor td').evaluate((el) => getComputedStyle(el.firstElementChild).color)).toBe('rgb(255, 0, 0)');
    await expect(page.locator('.jm-editor > p')).toHaveCount(1);
  });

  test('블록을 감싼 span 의 class·id 는 span 과 함께 사라진다', async ({ page }) => {
    await open(page, '');
    const out = await page.evaluate(() => window.JM.Sanitizer.clean('<span class="x" id="y"><p>a</p></span>', window.JM.makeStructurePolicy({ enabled: true })));
    expect(out).toBe('<p>a</p>');
  });

  test('표 align=center 는 칸 글자를 가운데로 만들지 않고 표만 가운데', async ({ page }) => {
    await open(page, '');
    const r = await page.evaluate(() => {
      const v = document.createElement('div');
      v.className = 'jm-content';
      v.style.width = '800px';
      v.innerHTML = window.JM.Sanitizer.clean('<table align=center style="width:300px"><tr><td>a</td></tr></table>');
      document.body.appendChild(v);
      const t = v.querySelector('table');
      return [getComputedStyle(v.querySelector('td')).textAlign, t.getBoundingClientRect().left - v.getBoundingClientRect().left];
    });
    expect(r[0]).not.toBe('center');
    expect(r[1]).toBe(250);
  });

  test('caption: 켜면 유지, 끄면 표 앞 문단 (굵게여도 두 번 정제해 같음)', async ({ page }) => {
    await open(page, '');
    const r = await page.evaluate(() => {
      const { Sanitizer: S, makeStructurePolicy: m } = window.JM;
      const src = '<table><caption style="font-weight:bold;text-align:center">c</caption><tr><td>a</td></tr></table>';
      const on = m({ enabled: true });
      const a = S.clean(src, on); const b = S.clean(src, null);
      return [a, S.clean(a, on), b, S.clean(b, null), S.clean('<table><caption>c</caption><tr><td>a</td></tr></table>', null)];
    });
    expect(r[0]).toBe('<table><caption><strong>c</strong></caption><tbody><tr><td>a</td></tr></tbody></table>'.replace('<caption>', '<caption style="text-align: center">'));
    expect(r[1]).toBe(r[0]);
    expect(r[2]).toBe('<p style="text-align: center"><strong>c</strong></p><table><tbody><tr><td>a</td></tr></tbody></table>');
    expect(r[3]).toBe(r[2]);
    expect(r[4]).toBe('<p>c</p><table><tbody><tr><td>a</td></tr></tbody></table>');
  });

  test('블록을 감싼 font 를 깊게·많이 쌓아도 빠르다', async ({ page }) => {
    await open(page, '');
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      const { clean } = window.JM.Sanitizer;
      clean('<font color=red><p>a</p>'.repeat(5000));
      clean(`<font color=red>${'<p>a</p>'.repeat(50000)}</font>`);
      clean('<font color=red>'.repeat(5000) + '<p>a</p>');
      clean(`<table>${'<tr><td>a</td></tr>'.repeat(20000)}</table>`.replace('<table>', '<font color=red><table>'));
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(5000);
  });
});

test.describe('구조 모드 픽스처', () => {
  test('legacy.html 은 class 를 남기고 변환된다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<table><tr><td class="xl65" style="font-size:11pt">a</td></tr></table>');
    expect(await html(page)).toContain('class="xl65"');
  });
});

test.describe('표 테두리 화면 적용', () => {
  const CELL = '<table data-border="0"><tr><td style="border:2px solid rgb(255, 0, 0)">a</td><td style="border-top:3px dashed rgb(0, 0, 255)">b</td><td>c</td></tr></table>';
  /** 셀 computed style (td 순서대로) */
  const borders = (page, sel) => page.evaluate((s) => Array.from(document.querySelectorAll(`${s} td`)).map((td) => {
    const c = getComputedStyle(td);
    return [c.borderTopWidth, c.borderTopStyle, c.borderTopColor];
  }), sel);

  test('편집 화면: inline 테두리가 표 기본·data-border=0 규칙을 이긴다', async ({ page }) => {
    await open(page, '');
    await setHTML(page, CELL);
    const r = await borders(page, '.jm-editor');
    expect(r[0]).toEqual(['2px', 'solid', 'rgb(255, 0, 0)']);
    expect(r[1]).toEqual(['3px', 'dashed', 'rgb(0, 0, 255)']);
    expect(r[2][2]).toBe('rgba(0, 0, 0, 0)'); // 테두리 없는 표 규칙은 지정 안 한 셀에만
  });

  test('조회 화면(.jm-content): inline 테두리가 이긴다', async ({ page }) => {
    await open(page, '');
    await page.evaluate((h) => {
      const v = document.createElement('div');
      v.className = 'jm-content';
      v.id = 'view';
      v.innerHTML = window.JM.Sanitizer.clean(h);
      document.body.appendChild(v);
    }, CELL);
    const r = await borders(page, '#view');
    expect(r[0]).toEqual(['2px', 'solid', 'rgb(255, 0, 0)']);
    expect(r[1]).toEqual(['3px', 'dashed', 'rgb(0, 0, 255)']);
  });
});

test.describe('글꼴 도구', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('선택 영역에 적용·상태 표시·해제', async ({ page }) => {
    await setHTML(page, '<p>안녕하세요</p>');
    await select(page, 'p', 0, 2);
    await exec(page, 'fontFamily', '바탕');
    expect(await page.locator('.jm-editor span').evaluate((el) => el.style.fontFamily)).toContain('바탕');
    await caret(page, 'span', 1);
    await expect.poll(() => page.locator('[data-cmd="fontFamily"] .jm-btn-select-label').textContent()).toBe('바탕');
    await select(page, 'span', 0, 2);
    await exec(page, 'fontFamily', null);
    expect(await html(page)).toBe('<p>안녕하세요</p>');
    await expect.poll(() => page.locator('[data-cmd="fontFamily"] .jm-btn-select-label').textContent()).toBe('글꼴');
  });

  test('영문 이름 글꼴도 상태가 맞고 왕복해도 정규화된다', async ({ page }) => {
    await setHTML(page, '<p>word</p>');
    await select(page, 'p', 0, 4);
    await exec(page, 'fontFamily', 'arial');
    await caret(page, 'span', 1);
    await expect.poll(() => page.locator('[data-cmd="fontFamily"] .jm-btn-select-label').textContent()).toBe('Arial');
    const clean = await page.evaluate(() => window.JM.Sanitizer.clean(window.ed.getHTML()));
    expect(clean).toBe('<p><span style="font-family: &quot;Arial&quot;">word</span></p>');
  });

  test('허용 목록 밖 값은 적용되지 않는다', async ({ page }) => {
    await setHTML(page, '<p>안녕</p>');
    await select(page, 'p', 0, 2);
    await exec(page, 'fontFamily', 'Comic Sans MS');
    expect(await html(page)).toBe('<p>안녕</p>');
  });

  test('툴바 목록에서 고른다: 크기 옆, 기본 항목과 설정 목록', async ({ page }) => {
    await setHTML(page, '<p>안녕</p>');
    await select(page, 'p', 0, 2);
    const order = await page.evaluate(() => {
      const size = document.querySelector('[data-cmd="fontSize"]');
      return size.nextElementSibling?.dataset.cmd;
    });
    expect(order).toBe('fontFamily');
    await expect(page.locator('[data-cmd="fontFamily"]')).toHaveAttribute('aria-label', '글꼴');
    await page.locator('[data-cmd="fontFamily"]').click();
    const items = page.locator('.jm-listmenu .jm-ctxmenu-item');
    await expect(items.first()).toContainText('기본');
    await expect(items).toHaveCount(17);
    await page.getByRole('menuitemradio', { name: '돋움', exact: true }).click();
    expect(await html(page)).toContain('돋움');
  });

  test('생성 옵션 font.families 로 목록을 바꾼다, 빈 목록이면 도구를 숨긴다', async ({ page }) => {
    const r = await page.evaluate(() => {
      const mk = (font) => {
        const box = document.createElement('div');
        document.body.appendChild(box);
        return new window.JM.JmToolbarEditor(box, { font });
      };
      const a = mk({ families: ['Arial'] });
      a.editor.setHTML('<p><span style="font-family:Arial">x</span><span style="font-family:굴림">y</span></p>');
      const b = mk({ families: [] });
      return { html: a.editor.getHTML(), list: a.editor.fontFamilies, hidden: b.buttons.fontFamily.hidden };
    });
    expect(r.html).toBe('<p><span style="font-family: &quot;Arial&quot;">x</span>y</p>');
    expect(r.list).toEqual(['Arial']);
    expect(r.hidden).toBe(true);
  });

  test('글꼴 span 은 입력 중 정리(#cleanStraySpans)에 지워지지 않는다', async ({ page }) => {
    await setHTML(page, '<p>안<span style="font-family: &quot;바탕&quot;">녕</span></p>');
    await caret(page, 'span', 1);
    await page.keyboard.type('a');
    expect(await html(page)).toContain('바탕');
  });
});

test.describe('엑셀·파워포인트·워드 붙여넣기', () => {
  /** 클립보드에 글·HTML·PNG 를 함께 넣어 붙여넣기 */
  const pasteWithImage = (page, { text = '', htmlData = '' }) => page.evaluate(([t, h]) => {
    const dt = new DataTransfer();
    if (t) dt.setData('text/plain', t);
    if (h) dt.setData('text/html', h);
    const bin = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    dt.items.add(new File([bin], 'a.png', { type: 'image/png' }));
    window.core.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [text, htmlData]);

  test.beforeEach(async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>x</p>');
    await caret(page, 'p', 1);
  });

  test('html + plain + png → 이미지 없이 표 삽입', async ({ page }) => {
    await pasteWithImage(page, { text: 'a\tb', htmlData: '<table><tr><td>a</td><td>b</td></tr></table>' });
    await expect(page.locator('.jm-editor table td')).toHaveCount(2);
    await page.waitForTimeout(100);
    await expect(page.locator('.jm-editor img')).toHaveCount(0);
  });

  test('plain + png → 글 삽입', async ({ page }) => {
    await pasteWithImage(page, { text: '글자' });
    await expect(page.locator('.jm-editor p')).toContainText('글자');
    await page.waitForTimeout(100);
    await expect(page.locator('.jm-editor img')).toHaveCount(0);
  });

  test('png 만 → 이미지 삽입', async ({ page }) => {
    await pasteWithImage(page, {});
    await expect(page.locator('.jm-editor img')).toHaveCount(1);
  });

  test('엑셀 형식 HTML: 셀 서식 변환, 문서 머리·style·주석은 버림', async ({ page }) => {
    await paste(page, {
      text: '글',
      htmlData: '<html xmlns:o="urn:x"><head><meta charset="utf-8"><style>.xl65{background:red}</style></head><body><!--StartFragment--><table border=0 style="border-collapse:collapse"><tr><td class=xl65 style="border:.5pt solid windowtext;background:#FFFF00;width:48pt;font-size:11.0pt;font-weight:700">글</td></tr></table><!--EndFragment--></body></html>',
    });
    const td = page.locator('.jm-editor td');
    await expect(td).toHaveCount(1);
    const attr = await td.getAttribute('style');
    expect(attr).toContain('border: 0.67px solid windowtext');
    expect(attr).toContain('width: 64px');
    expect(attr).toContain('font-size: 15px');
    await expect(td.locator('strong')).toHaveText('글');
    const bg = await td.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(255, 255, 0)');
    const raw = await html(page);
    expect(raw).not.toContain('.xl65');
    expect(raw).not.toContain('StartFragment');
  });

  /** 엑셀이 클립보드에 넣는 형식 (서식이 머리 style 의 class 에 있다) */
  const excelDoc = (style, body) => `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=Generator content="Microsoft Excel 15"><style><!--${style}--></style></head><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`;
  const excelStyle = `table {mso-displayed-decimal-separator:"\\.";}
    @page {margin:.75in .7in;}
    td {padding-top:1px; color:black; font-size:11.0pt; border:none;}
    .xl65 {mso-style-parent:style0; mso-number-format:"\\#\\,\\#\\#0\;"; border:.5pt solid windowtext; background:#FFFF00; font-weight:700;}
    .xl66 {border-top:.5pt solid windowtext; border-right:none; text-align:center;}
    .font5 {color:red;}
    p.MsoNormal {margin:0;}`;

  test('엑셀 머리 style 의 칸 서식을 살린다: 테두리·배경·굵기·정렬', async ({ page }) => {
    await paste(page, { htmlData: excelDoc(excelStyle, '<table border=0 style="border-collapse:collapse"><tr><td class=xl65>가</td><td class=xl66 style="text-align:right">나</td><td>다</td></tr></table>') });
    const cell = (i) => page.locator('.jm-editor td').nth(i);
    await expect(cell(0)).toHaveCSS('border-top-style', 'solid');
    await expect(cell(0)).toHaveCSS('background-color', 'rgb(255, 255, 0)');
    await expect(cell(0).locator('strong')).toHaveText('가');
    await expect(cell(1)).toHaveCSS('border-top-style', 'solid');
    await expect(cell(1)).toHaveCSS('text-align', 'right'); // 칸에 직접 쓴 값이 우선
    const raw = await html(page);
    expect(raw).not.toContain('xl6');
    expect(raw).not.toContain('mso-');
    expect(raw).not.toContain('color: black'); // 태그 규칙(td)은 옮기지 않음
  });

  test('엑셀 글자 조각(font class)의 색도 살린다, 표 밖 문단 규칙은 옮기지 않는다', async ({ page }) => {
    await paste(page, { htmlData: excelDoc(excelStyle, '<p class=MsoNormal>문단</p><table border=0><tr><td><font class=font5>빨강</font></td></tr></table>') });
    const raw = await html(page);
    expect(raw).toContain('color: red');
    expect(raw).not.toContain('margin');
  });

  test('머리 style 의 위험한 값은 정제에서 지워지고, 오피스가 아닌 글은 옮기지 않는다', async ({ page }) => {
    await page.evaluate(() => { window.__x = 0; });
    await paste(page, { htmlData: excelDoc('.xl1 {background:url(javascript:window.__x=1); color:expression(1); border:1px solid url(x);} .xl2" onclick="x {color:red}', '<table><tr><td class=xl1>가</td></tr></table>') });
    const raw = await html(page);
    expect(raw).not.toMatch(/url\(|expression|onclick/);
    await page.evaluate(() => { window.core.setHTML('<p><br></p>'); });
    await caret(page, 'p', 0);
    await paste(page, { htmlData: '<style>.t{background:red}</style><table><tr><td class="t">가</td></tr></table>' });
    expect(await html(page)).not.toContain('background');
  });

  test('닫히지 않은 주석·긴 style 도 빠르다', async ({ page }) => {
    const ms = await page.evaluate(() => {
      const t = performance.now();
      window.JM.Sanitizer.inlineOfficeStyles('<html xmlns:x="urn:schemas-microsoft-com:office:excel"><style>' + '/*'.repeat(200000) + '.xl1{'.repeat(100000) + '</style><table><tr><td class=xl1>a</td></tr></table></html>');
      return performance.now() - t;
    });
    expect(ms).toBeLessThan(1000);
  });

  test('한글·워드 형식 HTML: font 태그와 글꼴·크기', async ({ page }) => {
    await paste(page, { text: '가', htmlData: '<p class=MsoNormal style="line-height:160%"><font color=red size=5 face="굴림">가</font><span style="font-family:함초롬바탕;font-size:10.0pt;mso-hansi-font-family:함초롬바탕">나</span></p>' });
    const raw = await html(page);
    expect(raw).toContain('color: red');
    expect(raw).toContain('font-size: 24px');
    expect(raw).toContain('굴림');
    expect(raw).toContain('함초롬바탕');
    expect(raw).toContain('font-size: 13px');
    expect(raw).not.toContain('mso-');
    expect(raw).not.toContain('<font');
  });
});

test.describe('데모', () => {
  test('데모 툴바에 글꼴 도구가 있다', async ({ page }) => {
    await page.goto('/examples/demo/index.html');
    await expect(page.locator('[data-cmd="fontFamily"]')).toBeVisible();
    await expect(page.locator('[data-cmd="fontFamily"] .jm-btn-select-label')).toHaveText('글꼴');
  });
});

test.describe('데모 붙여넣기', () => {
  test('엑셀 머리 style 의 테두리가 데모에서도 살아난다', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
    const border = await page.evaluate(async () => {
      const root = document.querySelector('.jm-editor');
      root.focus();
      getSelection().selectAllChildren(root);
      getSelection().collapseToEnd();
      const dt = new DataTransfer();
      dt.setData('text/html', '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style>.xl65{border:1pt solid red}</style></head><body><table border=0 id="zz"><tr><td class=xl65>칸테두리</td></tr></table></body></html>');
      root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
      const td = Array.from(root.querySelectorAll('td')).find((c) => c.textContent === '칸테두리');
      return td && td.style.borderTopColor;
    });
    expect(border).toBe('red');
  });
});
