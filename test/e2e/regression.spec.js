/**
 * 단계 0 회귀 테스트 — 지금 기능이 그대로 동작하는지 (퍼블 구조 작업 전후로 모두 통과해야 함)
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret, select, exec, paste, expectRoundTrip } from './helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test.describe('입력·문단', () => {
  test('글자를 치고 Enter 로 문단이 나뉜다', async ({ page }) => {
    await page.locator('.jm-editor').click();
    await page.keyboard.type('첫 줄');
    await page.keyboard.press('Enter');
    await page.keyboard.type('둘째 줄');
    expect(await html(page)).toBe('<p>첫 줄</p><p>둘째 줄</p>');
  });

  test('문단 처음에서 Backspace 로 앞 문단과 합쳐진다', async ({ page }) => {
    await setHTML(page, '<p>가나</p><p>다라</p>');
    await caret(page, 'p:nth-child(2)', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>가나다라</p>');
    await page.keyboard.type('X'); // 합친 경계에 커서가 남아 있어야 함
    expect(await html(page)).toBe('<p>가나X다라</p>');
  });

  test('문단 끝에서 Delete 로 다음 문단을 당겨 온다 (커서 유지)', async ({ page }) => {
    await setHTML(page, '<p>가나</p><p>다라</p>');
    await caret(page, 'p:nth-child(1)', -1);
    await page.keyboard.press('Delete');
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>가나X다라</p>');
  });

  test('문단을 합쳐도 허용된 글자색 span 은 남는다', async ({ page }) => {
    await setHTML(page, '<p>가</p><p><span style="color: rgb(255, 0, 0);">나</span>다</p>');
    await caret(page, 'p:nth-child(2) span', 0);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p>가<span style="color: rgb(255, 0, 0);">나</span>다</p>');
    await exec(page, 'undo');
    expect((await html(page)).replace(/;"/g, '"')).toBe('<p>가</p><p><span style="color: rgb(255, 0, 0)">나</span>다</p>'); // style 끝 ; 표기는 무시
  });

  test('제목 끝에서 Enter 하면 다음 줄은 문단', async ({ page }) => {
    await setHTML(page, '<h2>제목</h2>');
    await caret(page, 'h2', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('본문');
    expect(await html(page)).toBe('<h2>제목</h2><p>본문</p>');
  });
});

test.describe('글자 서식', () => {
  test('굵게 (선택 + 단축키)', async ({ page }) => {
    await setHTML(page, '<p>가나다라</p>');
    await select(page, 'p', 1, 3);
    await page.keyboard.press('ControlOrMeta+b');
    expect(await html(page)).toBe('<p>가<strong>나다</strong>라</p>');
  });

  test('글자색·배경색·해제', async ({ page }) => {
    await setHTML(page, '<p>가나다라</p>');
    await select(page, 'p', 0, 2);
    await exec(page, 'color', '#ff0000');
    expect(await html(page)).toBe('<p><span style="color: rgb(255, 0, 0);">가나</span>다라</p>');
    await select(page, 'span', 0, 2);
    await exec(page, 'color', null);
    expect(await html(page)).toBe('<p>가나다라</p>');
  });

  test('글자 크기: 단어 가운데 커서면 단어 전체, 기본으로 해제', async ({ page }) => {
    await setHTML(page, '<p>hello world</p>');
    await caret(page, 'p', 8);
    await exec(page, 'fontSize', '24px');
    expect(await html(page)).toBe('<p>hello <span style="font-size: 24px;">world</span></p>');
    await caret(page, 'span', 2);
    await exec(page, 'fontSize', null);
    expect(await html(page)).toBe('<p>hello world</p>');
  });

  test('링크 넣기·허용되지 않는 주소 거부', async ({ page }) => {
    await setHTML(page, '<p>사이트</p>');
    await select(page, 'p', 0, 3);
    await exec(page, 'link', 'https://example.com');
    expect(await html(page)).toMatch(/<a [^>]*href="https:\/\/example\.com"[^>]*>사이트<\/a>/);
    await select(page, 'a', 0, 3);
    expect(await exec(page, 'link', 'javascript:alert(1)')).toBe(false);
  });
});

test.describe('블록 서식', () => {
  test('제목 단계 바꾸기 (툴바 목록)', async ({ page }) => {
    await setHTML(page, '<p>제목글</p>');
    await caret(page, 'p', 1);
    await page.locator('[data-cmd="heading"]').click();
    await page.locator('.jm-listmenu .jm-ctxmenu-item', { hasText: '제목 2' }).click();
    expect(await html(page)).toBe('<h2>제목글</h2>');
    await expect(page.locator('[data-cmd="heading"]')).toHaveText('제목 2');
  });

  test('인용 스타일 적용·해제', async ({ page }) => {
    await setHTML(page, '<p>인용문</p>');
    await caret(page, 'p', 1);
    await exec(page, 'quote', 'box');
    expect(await html(page)).toBe('<blockquote data-style="box">인용문</blockquote>');
    await exec(page, 'quote', null);
    expect(await html(page)).toBe('<p>인용문</p>');
  });

  test('목록 만들기와 빈 항목 Enter 로 탈출', async ({ page }) => {
    await setHTML(page, '<p>항목1</p>');
    await caret(page, 'p', -1);
    await exec(page, 'ul');
    await page.keyboard.press('Enter');
    await page.keyboard.type('항목2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('끝');
    expect(await html(page)).toBe('<ul><li>항목1</li><li>항목2</li></ul><p>끝</p>');
  });

  test('가운데 정렬', async ({ page }) => {
    await setHTML(page, '<p>정렬</p>');
    await caret(page, 'p', 1);
    await exec(page, 'alignCenter');
    expect(await html(page)).toBe('<p style="text-align: center;">정렬</p>');
  });
});

test.describe('표·블록 플러그인', () => {
  test('표 삽입 (2×2, 머리글)', async ({ page }) => {
    await setHTML(page, '<p>앞</p>');
    await caret(page, 'p', -1);
    await exec(page, 'table', { rows: 2, cols: 2, header: true });
    const h = await html(page);
    expect(h).toMatch(/<table[^>]*>/);
    expect((h.match(/<tr/g) || []).length).toBe(2);
    await expectRoundTrip(page);
  });

  for (const id of ['image-gallery', 'slider', 'buttons', 'layout-side', 'layout-one', 'map']) {
    test(`서식 삽입: ${id} (레이어 감싸기·저장 형식·왕복)`, async ({ page }) => {
      await setHTML(page, '<p>앞</p>');
      await caret(page, 'p', -1);
      const type = await page.evaluate((fid) => {
        const f = window.JM.SAMPLE_FORMATS.find((x) => x.id === fid);
        window.core.exec('format', f.html);
        return f.html.match(/data-type="(\w+)"/)[1];
      }, id);
      const h = await html(page);
      expect(h).toContain(`data-type="${type}"`);
      expect(h).not.toMatch(/jm-[a-z-]*layer|contenteditable/); // 편집용 레이어는 저장에 남지 않음
      await expectRoundTrip(page);
    });
  }

  test('유튜브 주소로 영상 블록', async ({ page }) => {
    await setHTML(page, '<p>앞</p>');
    await caret(page, 'p', -1);
    // 예시 영상: Big Buck Bunny © Blender Foundation (CC BY 3.0)
    expect(await exec(page, 'youtube', 'https://youtu.be/aqz-KE-bpKQ')).toBeTruthy();
    expect(await html(page)).toContain('src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"');
  });

  test('지도 퍼가기 코드를 본문에 붙여 넣으면 지도 블록', async ({ page }) => {
    await setHTML(page, '<p>앞</p>');
    await caret(page, 'p', -1);
    await paste(page, { text: '<div id="daumRoughmapContainer1792762389634" class="root_daum_roughmap"></div>\n<script>new daum.roughmap.Lander({"timestamp" : "1792762389634","key" : "3rt3v4p5vvx"}).render();</script>' });
    expect(await html(page)).toContain('data-type="map" data-provider="kakao-roughmap" data-timestamp="1792762389634" data-key="3rt3v4p5vvx"');
  });
});

test.describe('붙여넣기·정제', () => {
  test('여러 줄 글자는 줄마다 문단', async ({ page }) => {
    await setHTML(page, '<p><br></p>');
    await caret(page, 'p', 0);
    await paste(page, { text: '하나\n둘\n셋' });
    expect(await html(page)).toBe('<p>하나</p><p>둘</p><p>셋</p>');
  });

  test('HTML 붙여넣기에서 스크립트·이벤트 속성 제거', async ({ page }) => {
    await setHTML(page, '<p><br></p>');
    await caret(page, 'p', 0);
    await paste(page, { htmlData: '<p onclick="x()">안전<script>alert(1)</script><img src="x" onerror="alert(1)"></p>' });
    const h = await html(page);
    expect(h).toContain('안전');
    expect(h).not.toMatch(/script|onclick|onerror/);
  });

  test('Sanitizer: 위험한 주소·속성 제거', async ({ page }) => {
    const out = await page.evaluate(() => window.JM.Sanitizer.clean(
      '<a href="javascript:alert(1)">a</a><img src="data:text/html;base64,xx"><p style="position:fixed;color:red">b</p><iframe src="https://evil.example"></iframe>'));
    expect(out).not.toMatch(/javascript:|data:text|position|iframe/);
    expect(out).toContain('color: red');
  });
});

test.describe('되돌리기·모드', () => {
  test('되돌리기·다시 실행', async ({ page }) => {
    await setHTML(page, '<p>가나다</p>');
    await select(page, 'p', 0, 3);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<p><strong>가나다</strong></p>');
    await exec(page, 'undo');
    expect(await html(page)).toBe('<p>가나다</p>');
    await exec(page, 'redo');
    expect(await html(page)).toBe('<p><strong>가나다</strong></p>');
  });

  test('HTML 보기에서 고친 내용이 정제되어 반영', async ({ page }) => {
    await setHTML(page, '<p>원래</p>');
    await page.evaluate(() => {
      window.ed.setMode('html');
      window.ed.source.value = '<h2>바뀜</h2><script>alert(1)</script><p>본문</p>';
      window.ed.setMode('editor');
    });
    expect(await html(page)).toBe('<h2>바뀜</h2><p>본문</p>');
  });

  test('미리보기에서는 편집되지 않고 저장 HTML 이 보인다', async ({ page }) => {
    await setHTML(page, '<p>미리보기 글</p>');
    await page.evaluate(() => window.ed.setMode('preview'));
    await expect(page.locator('.jm-preview-pane')).toContainText('미리보기 글');
    await expect(page.locator('.jm-preview-pane')).not.toHaveAttribute('contenteditable', 'true');
  });
});

test.describe('placeholder', () => {
  /** 루트 ::before 에 placeholder 글이 보이는지 */
  const shown = (page) => page.evaluate(() => getComputedStyle(window.core.root, '::before').content !== 'none');

  test('비었을 때만 보이고, 글 뒤에 줄바꿈(br)만 남아도 다시 나타나지 않는다', async ({ page }) => {
    await setHTML(page, '');
    expect(await shown(page)).toBe(true);
    await page.locator('.jm-editor').click();
    await page.keyboard.type('가나다');
    expect(await shown(page)).toBe(false);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('x');
    expect(await shown(page)).toBe(false);
    await setHTML(page, '<p>글<br></p>');
    expect(await shown(page)).toBe(false);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await shown(page)).toBe(true); // 다 지우면 다시 보임
    await page.evaluate(() => window.core.exec('undo'));
    expect(await shown(page)).toBe(false);
  });

  test('한글 조합 중 첫 글자부터 사라진다', async ({ page }) => {
    await setHTML(page, '');
    await page.locator('.jm-editor').click();
    await page.evaluate(() => {
      const r = window.core.root;
      r.dispatchEvent(new CompositionEvent('compositionstart'));
      r.querySelector('p').textContent = 'ㄱ';
      r.dispatchEvent(new InputEvent('input', { isComposing: true }));
    });
    expect(await shown(page)).toBe(false);
  });
});
