/**
 * 단계 1 — 퍼블 구조 정책의 정제(Sanitizer) 테스트
 * - 픽스처 test/fixtures/publisher/*.html 을 구조 정책으로 정제하면 expected/ 와 같은 DOM (서버 HtmlSanitizer 도 같은 파일로 비교)
 * - class 토큰 규칙, 플러그인 블록 예외, 허용 태그 한계, 정책을 끄면 지금 규칙
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open } from './helpers.js';

const FIXTURES = 'test/fixtures/publisher';
const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.html'));

test.beforeEach(async ({ page }) => { await open(page, ''); });

/**
 * 페이지 안에서 정제 후 정규화한 DOM 문자열 (속성 이름순, 태그 사이 공백 무시)
 * @param {object|null} cfg 구조 정책 설정 (null 이면 끔)
 */
async function cleanCanon(page, html, cfg = { enabled: true }) {
  return page.evaluate(([h, c]) => {
    const canon = (x) => {
      const t = document.createElement('template');
      t.innerHTML = x;
      t.content.querySelectorAll('*').forEach((el) => {
        const a = [...el.attributes].map((at) => [at.name, at.value]).sort(([p], [q]) => p.localeCompare(q));
        a.forEach(([n]) => el.removeAttribute(n)); a.forEach(([n, v]) => el.setAttribute(n, v));
      });
      return t.innerHTML.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    };
    const pol = c ? window.JM.makeStructurePolicy(c) : null;
    const out = window.JM.Sanitizer.clean(h, pol);
    return { out: canon(out), twice: canon(window.JM.Sanitizer.clean(out, pol)) === canon(out), canonOf: (s) => s };
  }, [html, cfg]);
}

/** 정규화만 (페이지에서 같은 방식) */
async function canon(page, html) {
  return page.evaluate((h) => {
    const t = document.createElement('template');
    t.innerHTML = h;
    t.content.querySelectorAll('*').forEach((el) => {
      const a = [...el.attributes].map((at) => [at.name, at.value]).sort(([p], [q]) => p.localeCompare(q));
      a.forEach(([n]) => el.removeAttribute(n)); a.forEach(([n, v]) => el.setAttribute(n, v));
    });
    return t.innerHTML.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  }, html);
}

test.describe('픽스처: 구조 정책으로 정제하면 expected 와 같다', () => {
  for (const f of files) {
    test(f, async ({ page }) => {
      const src = fs.readFileSync(`${FIXTURES}/${f}`, 'utf8');
      const exp = fs.readFileSync(`${FIXTURES}/expected/${f}`, 'utf8');
      const r = await cleanCanon(page, src);
      expect(r.out).toBe(await canon(page, exp));
      expect(r.twice).toBe(true); // 두 번 정제해도 같음
      // expected 는 원본에서 링크 target·rel 강제만 다름 (구조·class 는 그대로)
      expect(r.out.replace(/ rel="noopener noreferrer" target="_blank"/g, '')).toBe(await canon(page, src));
    });
  }
});

test('정책을 끄면 지금 규칙: class 제거, div→p, 구조 태그는 벗김', async ({ page }) => {
  const r = await cleanCanon(page, '<section class="a"><div class="b">글</div><dl><dt>t</dt><dd>d</dd></dl></section>', null);
  expect(r.out).toBe('<p>글</p>td');
});

test.describe('class 토큰 규칙', () => {
  test('에디터 예약 이름(jm-*, is-selected 등)은 항상 제거, is-active 는 남김', async ({ page }) => {
    const r = await cleanCanon(page, '<p class="jm-x is-selected is-empty tab is-active needs-sel">a</p>');
    expect(r.out).toBe('<p class="tab is-active">a</p>');
  });

  test('형식에 맞지 않는 토큰 제거, 중복 제거', async ({ page }) => {
    const r = await cleanCanon(page, '<p class="ok 1bad b@d ok 한글 x-y_z">a</p>');
    expect(r.out).toBe('<p class="ok x-y_z">a</p>');
  });

  test('classAllow(정확한 이름·접두어)와 classDeny', async ({ page }) => {
    const r = await cleanCanon(page, '<div class="tit-h3 tit-sub box-gray other btn-admin">a</div>',
      { enabled: true, classAllow: ['tit-*', 'box-gray', 'btn-*'], classDeny: ['btn-admin'] });
    expect(r.out).toBe('<div class="tit-h3 tit-sub box-gray">a</div>');
  });

  test('class 만 있는 빈 span(아이콘)은 남김, class 가 모두 걸러진 span 은 벗김', async ({ page }) => {
    const r = await cleanCanon(page, '<p><span class="ico ico-edu"></span><span class="jm-x">글</span></p>');
    expect(r.out).toBe('<p><span class="ico ico-edu"></span>글</p>');
  });
});

test.describe('구조 태그·속성', () => {
  test('설정해도 허용 한계 밖의 태그(script·form·iframe)는 열리지 않음', async ({ page }) => {
    const r = await cleanCanon(page, '<form class="f"><p>a</p></form><script>alert(1)</script><iframe src="https://x"></iframe>',
      { enabled: true, tags: ['form', 'script', 'iframe', 'section'] });
    expect(r.out).toBe('<p>a</p>');
  });

  test('구조 태그에도 위험 속성(on*, id, data-*)은 남지 않고 style 은 허용 속성만', async ({ page }) => {
    const r = await cleanCanon(page, '<section id="s" onclick="x()" data-x="1" style="color: red; position: fixed" class="c"><p>a</p></section>');
    expect(r.out).toBe('<section class="c" style="color: red"><p>a</p></section>');
  });

  test('th[scope] 는 허용 값만, caption 허용', async ({ page }) => {
    const r = await cleanCanon(page, '<table><caption>표</caption><tbody><tr><th scope="col">a</th><th scope="x">b</th></tr></tbody></table>');
    expect(r.out).toBe('<table><caption>표</caption><tbody><tr><th scope="col">a</th><th>b</th></tr></tbody></table>');
  });

  test('b·i·strike 별칭은 그대로 strong·em·s 로', async ({ page }) => {
    const r = await cleanCanon(page, '<div class="x"><b>a</b><i>b</i><strike>c</strike></div>');
    expect(r.out).toBe('<div class="x"><strong>a</strong><em>b</em><s>c</s></div>');
  });
});

test.describe('플러그인 블록은 예외 (지금 규칙)', () => {
  test('구조 안의 갤러리·버튼 블록은 class 없이 정해진 형식으로', async ({ page }) => {
    const r = await cleanCanon(page, '<section class="s"><div data-type="gallery" data-layout="justify" class="g"><p data-role="title" class="t">제목</p><img src="/a.jpg" class="i"></div>'
      + '<div data-type="buttons" data-align="center" class="b"><a href="https://a.example" data-role="button" data-style="primary" class="x">A</a></div></section>');
    expect(r.out).toBe('<section class="s"><div data-layout="justify" data-type="gallery"><p data-role="title">제목</p><img src="/a.jpg"></div>'
      + '<div data-align="center" data-type="buttons"><a data-role="button" data-style="primary" href="https://a.example" rel="noopener noreferrer" target="_blank">A</a></div></section>');
  });

  test('배치 블록 글 칸 안의 class 도 제거 (플러그인 저장 형식과 같게)', async ({ page }) => {
    const r = await cleanCanon(page, '<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image"></div><div data-cell="text"><p class="lead">글</p></div></div>');
    expect(r.out).toContain('<div data-cell="text"><p>글</p></div>');
  });
});

test.describe('클라이언트·서버 일치 보정 (서버 StructureSanitizerTest 와 같은 입력·기대)', () => {
  test('플러그인 안의 구조 태그는 벗기고 div 는 p 로 (정책 없이)', async ({ page }) => {
    const r = await cleanCanon(page, '<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image"></div>'
      + '<div data-cell="text"><div class="x">글</div><p>앞<dl><dt>용어</dt><dd>설명</dd></dl></p></div></div>');
    expect(r.out).toBe('<div data-preset="side" data-type="layout" data-variant="left"><div data-cell="image"></div><div data-cell="text"><p>글</p><p>앞</p>용어설명<p></p></div></div>');
  });

  test('tags: [] 는 구조 태그 없음 (class 는 허용)', async ({ page }) => {
    const r = await cleanCanon(page, '<section class="s"><p class="p">a</p></section>', { enabled: true, tags: [] });
    expect(r.out).toBe('<p class="p">a</p>');
  });

  test('class 구분자가 nbsp 여도 토큰으로 나눈다, 64자 넘는 토큰·지나치게 긴 정규식은 무시', async ({ page }) => {
    const r = await cleanCanon(page, `<p class="foo\u00a0bar ${'a'.repeat(65)}">a</p>`, { enabled: true, classPattern: `^(${'x|'.repeat(120)}[a-z]+)$` });
    expect(r.out).toBe('<p class="foo bar">a</p>');
  });

  test('최상위 공백 텍스트는 지운다 (정규화 없이 비교)', async ({ page }) => {
    const out = await page.evaluate(() => window.JM.Sanitizer.clean('<span class="a">A</span> <span class="b">B</span>', window.JM.makeStructurePolicy({ enabled: true })));
    expect(out).toBe('<span class="a">A</span><span class="b">B</span>');
  });
});

