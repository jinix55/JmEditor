/**
 * 단계 2 — 구조 모드에서 편집 화면이 퍼블 구조를 지키는지 (불러오기·저장, 블록 판정, 새 블록 넣는 자리, 중첩 블록)
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open, setHTML, html, canonical, caret, select, exec, paste, expectRoundTrip } from './helpers.js';

const FIXTURES = 'test/fixtures/publisher';
const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.html'));
const fixture = (f) => fs.readFileSync(`${FIXTURES}/${f}`, 'utf8');

test.beforeEach(async ({ page }) => { await open(page, '?structure=1'); });

/** 문자열 HTML 을 helpers.canonical 과 같은 방식으로 정규화 */
async function canonOf(page, h) {
  return page.evaluate((x) => {
    const t = document.createElement('template');
    t.innerHTML = x;
    t.content.querySelectorAll('*').forEach((el) => {
      const a = [...el.attributes].map((at) => [at.name, at.value]).sort(([p], [q]) => p.localeCompare(q));
      a.forEach(([n]) => el.removeAttribute(n)); a.forEach(([n, v]) => el.setAttribute(n, v));
    });
    return t.innerHTML.replace(/>\s+</g, '><').trim();
  }, h);
}

test.describe('불러오기 → 저장: 구조·class 그대로', () => {
  for (const f of files) {
    test(f, async ({ page }) => {
      await setHTML(page, fixture(f));
      expect(await canonical(page)).toBe(await canonOf(page, fs.readFileSync(`${FIXTURES}/expected/${f}`, 'utf8')));
      await expectRoundTrip(page);
    });
  }
});

test('중첩된 문단 끝에서 입력해도 구조는 그대로', async ({ page }) => {
  await setHTML(page, fixture('greeting.html'));
  await caret(page, '.sign .name', -1);
  await page.keyboard.type(' 드림');
  const h = await html(page);
  expect(h).toContain('<p class="sign">협회장 <span class="name">홍길동 드림</span></p>');
  expect(h.startsWith('<section class="sub-greeting">')).toBe(true);
});

test('dd 안의 글: 입력·굵게는 되고, 제목·목록·인용 전환은 dd 를 바꾸지 않는다', async ({ page }) => {
  await setHTML(page, fixture('history.html'));
  await caret(page, 'dd', -1);
  await page.keyboard.type('!');
  await select(page, 'dd', 0, 2);
  await exec(page, 'bold');
  let h = await html(page);
  expect(h).toContain('<dd><strong>교육</strong> 데이터 표준 가이드 발간!</dd>');
  await caret(page, 'dd', 3);
  const before = await html(page);
  await exec(page, 'heading', 'h2');
  await exec(page, 'ul');
  await exec(page, 'quote', 'box');
  expect(await html(page)).toBe(before);
});

test('구조 안에서 표·서식(버튼)을 넣으면 가장 바깥 구조 뒤에 들어간다', async ({ page }) => {
  await setHTML(page, fixture('history.html'));
  await caret(page, 'dd', 2);
  await exec(page, 'table', { rows: 1, cols: 1, header: false });
  let h = await html(page);
  expect(h).toMatch(/^<div class="history-wrap">.*<\/div><table>/); // history-wrap 밖, 바로 뒤
  await setHTML(page, fixture('greeting.html'));
  await caret(page, '.lead', 2);
  await page.evaluate(() => window.core.exec('format', window.JM.SAMPLE_FORMATS.find((x) => x.id === 'buttons').html));
  h = await html(page);
  expect(h).toMatch(/<\/section><div data-type="buttons"/);
});

test('구조 안 문단에서 이미지는 그 자리(같은 구조 안)에 들어간다', async ({ page }) => {
  await setHTML(page, fixture('greeting.html'));
  await caret(page, '.lead', 2);
  await exec(page, 'image', { src: '/x.png', alt: 'x' });
  expect(await html(page)).toMatch(/<div class="txt-area"><p class="lead">.*<\/p><p><img src="\/x\.png" alt="x"><\/p>/);
});

test('구조 안 문단에 여러 문단을 붙여 넣으면 같은 구조 안에 들어간다', async ({ page }) => {
  await setHTML(page, fixture('greeting.html'));
  await caret(page, '.sign', 0);
  await paste(page, { htmlData: '<p>하나</p><p>둘</p>' });
  expect(await html(page)).toMatch(/<div class="txt-area">.*<p>하나<\/p><p>둘<\/p>.*<\/div><\/div><\/section>$/);
});

test('구조 안의 표는 제자리에 두고, 끌기 손잡이를 숨긴다 (루트 표는 그대로)', async ({ page }) => {
  await setHTML(page, fixture('organization.html') + '<table><tbody><tr><td>루트 표</td></tr></tbody></table>');
  const h = await html(page);
  expect(h).toContain('<div class="tbl-wrap"><table class="tbl-basic">');
  const handles = page.locator('.jm-editor .jm-table-handle');
  await expect(handles).toHaveCount(2);
  await expect(handles.nth(0)).toBeHidden(); // 구조 안 표
  await expect(handles.nth(1)).toBeVisible(); // 루트 표
});

test('루트의 느슨한 글자는 지금처럼 문단으로 감싼다', async ({ page }) => {
  await page.evaluate(() => { window.core.root.innerHTML = '글자<section class="a"><p>구조</p></section>'; window.core.commit(); });
  expect(await html(page)).toBe('<p>글자</p><section class="a"><p>구조</p></section>');
});

test.describe('Codex 단계 2 검토 반영', () => {
  test('버튼 글자에 커서를 두고 이미지를 넣어도 버튼 블록 안에 들어가 사라지지 않는다', async ({ page }) => {
    await setHTML(page, '<p>앞</p><div data-type="buttons" data-align="center"><a href="https://a.example" data-role="button" data-style="primary">신청</a></div>');
    await caret(page, 'a[data-role="button"]', 1);
    await exec(page, 'image', { src: '/x.png', alt: 'x' });
    expect(await html(page)).toContain('<img src="/x.png" alt="x">');
  });

  test('구조 안의 표에서 표를 넣으면 그 구조 바로 뒤 (문서 끝이 아니라)', async ({ page }) => {
    await setHTML(page, fixture('organization.html') + '<p>뒤 문단</p>');
    await caret(page, '.tbl-basic td', 1);
    await exec(page, 'table', { rows: 1, cols: 1, header: false });
    expect(await html(page)).toMatch(/<\/section><table><tbody><tr><td><br><\/td><\/tr><\/tbody><\/table><p><br><\/p><p>뒤 문단<\/p>$/);
  });

  test('dd 의 직접 글에서 단어 글자색은 안쪽 p 글자까지 번지지 않는다', async ({ page }) => {
    await setHTML(page, '<dl><dt>t</dt><dd>ab<p>cd</p></dd></dl>');
    await caret(page, 'dd', 1);
    await exec(page, 'color', '#ff0000');
    expect(await html(page)).toBe('<dl><dt>t</dt><dd><span style="color: rgb(255, 0, 0);">ab</span><p>cd</p></dd></dl>');
  });

  test('블록 자식이 있는 li 는 목록 해제하지 않는다', async ({ page }) => {
    await setHTML(page, fixture('business.html'));
    await caret(page, '.biz-tit', 1);
    const before = await html(page);
    await exec(page, 'ul');
    expect(await html(page)).toBe(before);
  });

  test('블록과 섞인 직접 글(div > 글 + p)도 굵게가 된다', async ({ page }) => {
    await setHTML(page, '<section class="s"><div class="d">소개<p>상세</p></div></section>');
    await select(page, '.d', 0, 2);
    await exec(page, 'bold');
    expect(await html(page)).toBe('<section class="s"><div class="d"><strong>소개</strong><p>상세</p></div></section>');
  });
});

test('기본 모드(구조 끔)에서는 중첩된 표도 손잡이가 보인다 (기존 동작)', async ({ page }) => {
  await open(page, '?structure=0');
  await setHTML(page, '<blockquote><table><tbody><tr><td>a</td></tr></tbody></table></blockquote><table><tbody><tr><td>b</td></tr></tbody></table>');
  const handles = page.locator('.jm-editor .jm-table-handle');
  await expect(handles).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(handles.nth(i)).toBeVisible();
});


test.describe('인라인 구조 태그(small·sub·sup)는 블록이 아니라 글자처럼', () => {
  test('sup 끝에서 Enter 는 sup 안 줄바꿈이 아니라 문단 나누기', async ({ page }) => {
    await setHTML(page, '<p>E=mc<sup>2</sup> 공식</p>');
    await caret(page, 'sup', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('X');
    const out = await html(page);
    expect(out).not.toContain('<br>');
    expect(await page.evaluate(() => window.core.root.querySelectorAll('p').length)).toBe(2);
    expect(out.startsWith('<p>E=mc<sup>2</sup></p>')).toBe(true);
  });

  test('루트의 sup 와 뒤 글은 한 문단으로 감싼다', async ({ page }) => {
    await page.evaluate(() => { window.core.root.innerHTML = '<sup>1</sup> 각주'; window.core.commit(); });
    expect(await html(page)).toBe('<p><sup>1</sup> 각주</p>');
    await setHTML(page, '<sup>1</sup> 각주<small>작게</small>');
    expect(await html(page)).toBe('<p><sup>1</sup> 각주<small>작게</small></p>');
  });

  test('small 안 커서: 블록은 바깥 p, 정렬은 p 에', async ({ page }) => {
    await setHTML(page, '<p>작은 <small>글씨</small></p>');
    await caret(page, 'small', 1);
    expect(await page.evaluate(() => window.core.sel.getBlock()?.tagName)).toBe('P');
    await exec(page, 'alignCenter');
    expect(await html(page)).toBe('<p style="text-align: center;">작은 <small>글씨</small></p>');
  });
});

test.describe('루트 인라인 묶기는 small·sub·sup 가 있는 구간만 (그 밖은 예전처럼 노드마다 문단)', () => {
  /** commit 경로(편집 DOM 에 직접 넣고 commit)와 setHTML 경로 결과 */
  async function both(page, h) {
    const viaCommit = await page.evaluate((x) => { window.core.root.innerHTML = x; window.core.commit(); return window.ed.getHTML(); }, h);
    await setHTML(page, h);
    return { viaCommit, viaSet: await html(page) };
  }

  for (const q of ['?structure=1', '?structure=0']) {
    test(`글·strong·이미지는 예전대로 노드마다 문단 ${q}`, async ({ page }) => {
      await open(page, q);
      expect(await both(page, 'a<strong>b</strong>c')).toEqual({ viaCommit: '<p>a</p><p><strong>b</strong></p><p>c</p>', viaSet: '<p>a</p><p><strong>b</strong></p><p>c</p>' });
      expect(await both(page, '<img src="/a.png" alt="a">캡션')).toEqual({ viaCommit: '<p><img src="/a.png" alt="a"></p><p>캡션</p>', viaSet: '<p><img src="/a.png" alt="a"></p><p>캡션</p>' });
    });
  }

  test('구조 켬: <sup>1</sup> 각주 는 commit·setHTML 모두 한 문단, 공백 유지', async ({ page }) => {
    expect(await both(page, '<sup>1</sup> 각주')).toEqual({ viaCommit: '<p><sup>1</sup> 각주</p>', viaSet: '<p><sup>1</sup> 각주</p>' });
    expect(await both(page, '앞 <sub>2</sub> 뒤<section class="s"><p>x</p></section>꼬리'))
      .toEqual({ viaCommit: '<p>앞 <sub>2</sub> 뒤</p><section class="s"><p>x</p></section><p>꼬리</p>', viaSet: '<p>앞 <sub>2</sub> 뒤</p><section class="s"><p>x</p></section><p>꼬리</p>' });
  });

  test('구조 끔: <sup>1</sup> 각주 는 이번 작업 전과 같음 (setHTML 은 sup 를 벗김, commit 은 노드마다 문단)', async ({ page }) => {
    await open(page, '?structure=0');
    expect(await both(page, '<sup>1</sup> 각주')).toEqual({ viaCommit: '<p><sup>1</sup></p><p> 각주</p>', viaSet: '<p>1 각주</p>' });
  });
});
