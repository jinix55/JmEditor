/**
 * 단계 3 — 편집 명령의 속성 규칙: 태그를 바꿔도 정렬·class 유지, 목록 분할·종류 변경 규칙, 캡션 안 이미지, h4~h6
 * (기본 모드에서 고친 기존 버그 포함 — 정렬이 사라지던 것, 목록을 나누면 유형·번호가 사라지던 것)
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html as rawHtml, caret, exec, paste } from './helpers.js';

/** style 끝 ; 표기(브라우저마다 다름)는 무시하고 비교 */
const html = async (page) => (await rawHtml(page)).replace(/;"/g, '"');

test.describe('기본 모드', () => {
  test.beforeEach(async ({ page }) => { await open(page, '?structure=0'); });

  test('문단 → 제목 → 인용 → 문단으로 바꿔도 정렬은 그대로', async ({ page }) => {
    await setHTML(page, '<p style="text-align: center;">가운데</p>');
    await caret(page, 'p', 1);
    await exec(page, 'heading', 'h2');
    expect(await html(page)).toBe('<h2 style="text-align: center">가운데</h2>');
    await exec(page, 'quote', 'box');
    expect(await html(page)).toBe('<blockquote style="text-align: center" data-style="box">가운데</blockquote>');
    await exec(page, 'quote', null);
    expect(await html(page)).toBe('<p style="text-align: center">가운데</p>');
  });

  test('번호 목록 가운데 항목을 빼면 뒤 목록은 같은 유형·이어지는 번호', async ({ page }) => {
    await setHTML(page, '<ol start="3" style="list-style-type: lower-alpha;"><li>1</li><li>2</li><li>3</li></ol>');
    await caret(page, 'li:nth-child(2)', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol style="list-style-type: lower-alpha" start="3"><li>1</li></ol><p>2</p><ol style="list-style-type: lower-alpha" start="5"><li>3</li></ol>');
  });

  test('첫 항목을 빼면 뒤 목록 번호는 원래대로 이어진다 (start 기본 1 → 2)', async ({ page }) => {
    await setHTML(page, '<ol><li>1</li><li>2</li></ol>');
    await caret(page, 'li', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<p>1</p><ol start="2"><li>2</li></ol>');
  });

  test('start="0" 목록의 첫 항목을 빼면 뒤 목록은 1 부터 (start 생략)', async ({ page }) => {
    await setHTML(page, '<ol start="0"><li>a</li><li>b</li></ol>');
    await caret(page, 'li', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<p>a</p><ol><li>b</li></ol>');
  });

  test('항목에 붙은 목록 유형 style 은 문단으로 옮기지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li style="list-style-type: square; text-align: center;">a</li></ul>');
    await caret(page, 'li', 0);
    await exec(page, 'ul');
    expect(await html(page)).toBe('<p style="text-align: center">a</p>');
  });

  test('목록 종류를 바꾸면 이전 유형은 지우고 새 종류 기본으로', async ({ page }) => {
    await setHTML(page, '<ul style="list-style-type: square;"><li>1</li></ul>');
    await caret(page, 'li', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><li>1</li></ol>');
  });

  test('h3 끝에서 Enter 하면 다음 줄은 문단 (기존 동작)', async ({ page }) => {
    await setHTML(page, '<h3>제목</h3>');
    await caret(page, 'h3', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('본문');
    expect(await html(page)).toBe('<h3>제목</h3><p>본문</p>');
  });
});

test.describe('구조 모드', () => {
  test.beforeEach(async ({ page }) => { await open(page, '?structure=1'); });

  test('class·정렬이 있는 문단을 제목·인용·목록으로 바꿔도 class·정렬 유지', async ({ page }) => {
    await setHTML(page, '<div class="box"><p class="lead" style="text-align: right;">글</p></div>');
    await caret(page, '.lead', 1);
    await exec(page, 'heading', 'h2');
    expect(await html(page)).toBe('<div class="box"><h2 class="lead" style="text-align: right">글</h2></div>');
    await exec(page, 'quote', 'quote');
    expect(await html(page)).toBe('<div class="box"><blockquote class="lead" style="text-align: right" data-style="quote">글</blockquote></div>');
    await exec(page, 'quote', null);
    await exec(page, 'ul');
    expect(await html(page)).toBe('<div class="box"><ul><li class="lead" style="text-align: right">글</li></ul></div>');
    await exec(page, 'ul');
    expect(await html(page)).toBe('<div class="box"><p class="lead" style="text-align: right">글</p></div>');
  });

  test('class 있는 목록을 나누거나 종류를 바꿔도 목록 class 유지', async ({ page }) => {
    await setHTML(page, '<ul class="list-dot"><li>1</li><li>2</li><li>3</li></ul>');
    await caret(page, 'li:nth-child(2)', 0);
    await exec(page, 'ul');
    expect(await html(page)).toBe('<ul class="list-dot"><li>1</li></ul><p>2</p><ul class="list-dot"><li>3</li></ul>');
    await caret(page, 'ul:last-of-type li', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ul class="list-dot"><li>1</li></ul><p>2</p><ol class="list-dot"><li>3</li></ol>');
  });

  test('표 캡션 안에서 이미지를 넣으면 표 뒤에 (표 구조 유지)', async ({ page }) => {
    await setHTML(page, '<table class="t"><caption>표 제목</caption><tbody><tr><td>a</td></tr></tbody></table>');
    await caret(page, 'caption', 1);
    await exec(page, 'image', { src: '/x.png', alt: 'x' });
    expect(await html(page)).toMatch(/^<table class="t"><caption>표 제목<\/caption><tbody><tr><td>a<\/td><\/tr><\/tbody><\/table><p><img src="\/x\.png" alt="x"><\/p>/);
  });

  test('목록 안에 li 가 아닌 요소가 섞여 있어도 번호는 li 만 센다', async ({ page }) => {
    await setHTML(page, '<ol><div class="x">머리</div><li>A</li><li>B</li></ol>');
    await caret(page, 'li', 0);
    await exec(page, 'ol');
    expect(await html(page)).toBe('<ol><div class="x">머리</div></ol><p>A</p><ol start="2"><li>B</li></ol>');
  });

  test('figcaption 안의 문단에서 이미지를 넣어도 figure 뒤에', async ({ page }) => {
    await setHTML(page, '<figure><img src="/a.png" alt="a"><figcaption><p>설명</p></figcaption></figure>');
    await caret(page, 'figcaption p', 1);
    await exec(page, 'image', { src: '/x.png', alt: 'x' });
    expect(await html(page)).toMatch(/<\/figcaption><\/figure><p><img src="\/x\.png" alt="x"><\/p>/);
  });

  test('그림 설명(figcaption) 안에서 이미지를 넣으면 figure 뒤에', async ({ page }) => {
    await setHTML(page, '<figure class="f"><img src="/a.png" alt="a"><figcaption>설명</figcaption></figure>');
    await caret(page, 'figcaption', 1);
    await exec(page, 'image', { src: '/x.png', alt: 'x' });
    expect(await html(page)).toMatch(/^<figure class="f"><img src="\/a\.png" alt="a"><figcaption>설명<\/figcaption><\/figure><p><img src="\/x\.png" alt="x"><\/p>/);
  });

  test('h4(허용 시) 끝 Enter 는 다음 줄 문단, 가운데 여러 문단 붙여넣기는 제목을 나눈다', async ({ page }) => {
    await open(page, '?structure=1');
    await page.evaluate(() => {
      // h4 를 허용한 정책으로 다시 만든 에디터
      document.getElementById('editor').innerHTML = '';
      window.ed.destroy();
      window.ed = new window.JM.JmToolbarEditor(document.getElementById('editor'), { structure: { enabled: true, tags: ['section', 'div', 'h4'] } });
      window.core = window.ed.editor;
    });
    await setHTML(page, '<section class="s"><h4 class="t">소제목</h4></section>');
    await caret(page, 'h4', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('본문');
    expect(await html(page)).toBe('<section class="s"><h4 class="t">소제목</h4><p>본문</p></section>');
    await caret(page, 'h4', 1);
    await paste(page, { htmlData: '<p>A</p><p>B</p>' });
    expect(await html(page)).toBe('<section class="s"><h4 class="t">소</h4><p>A</p><p>B</p><h4 class="t">제목</h4><p>본문</p></section>');
  });
});
