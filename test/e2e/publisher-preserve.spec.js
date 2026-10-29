/**
 * 퍼블 HTML 보존 2차 — 기본 설정(구조 모드 켬)에서 퍼블 마크업이 그대로 남는지
 * - 기본 태그 19개(nav·h4 등), 링크·속성·id·picture 등은 이후 태스크가 같은 파일에 덧붙임
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, canonical, exec, select, caret } from './helpers.js';

test.beforeEach(async ({ page }) => { await open(page, '?structure=1'); });

test('기본 설정: nav 안 링크와 h4 가 그대로 남는다', async ({ page }) => {
  await setHTML(page, '<nav class="tabs"><a class="tab is-active" href="#p1">A</a><a class="tab" href="#p2">B</a></nav><section class="s"><h4 class="t">소제목</h4></section>');
  expect(await canonical(page)).toBe('<nav class="tabs"><a class="tab is-active" href="#p1">A</a><a class="tab" href="#p2">B</a></nav><section class="s"><h4 class="t">소제목</h4></section>');
});

test('링크 종류별 새 창 규칙', async ({ page }) => {
  await setHTML(page, '<p><a href="#x" target="_blank">a</a><a href="tel:02-000-0000">b</a><a href="MAILTO:a@b.c">c</a><a href="/in">d</a><a href="https://e.com">e</a><a href="&nbsp;#y">f</a></p>');
  const links = await page.evaluate(() => {
    const tpl = document.createElement('template');
    tpl.innerHTML = window.ed.getHTML();
    return [...tpl.content.querySelectorAll('a')].map((a) => [a.getAttribute('target'), a.getAttribute('rel')]);
  });
  expect(links).toEqual([[null, null], [null, null], [null, null], ['_blank', 'noopener noreferrer'], ['_blank', 'noopener noreferrer'], [null, null]]); // 앞 NBSP 는 trim 후 판정 (서버도 같게)
});

test('링크 명령으로 #앵커를 넣으면 새 창 아님, 주소를 바꾸면 규칙이 따라간다', async ({ page }) => {
  await setHTML(page, '<p>안녕하세요</p>');
  await select(page, 'p', 0, 2);
  await exec(page, 'link', '#p1');
  expect(await html(page)).not.toContain('target');
  await select(page, 'a', 0, 1);
  await exec(page, 'link', 'https://e.com');
  expect(await html(page)).toContain('target="_blank"');
  await select(page, 'a', 0, 1);
  await exec(page, 'link', 'tel:1');
  expect(await html(page)).not.toContain('target');
});

test('버튼 블록 tel 링크는 새 창 아님', async ({ page }) => {
  await setHTML(page, '<div data-type="buttons"><a href="tel:1" data-role="button">전화</a><a href="https://e.com" data-role="button">외부</a></div>');
  const links = await page.evaluate(() => {
    const tpl = document.createElement('template');
    tpl.innerHTML = window.ed.getHTML();
    return [...tpl.content.querySelectorAll('a')].map((a) => a.getAttribute('target'));
  });
  expect(links).toEqual([null, '_blank']);
});

/**
 * 페이지 안에서 Sanitizer.clean 실행 (policy: 'on' 구조 모드 / 'off' 끔) — 결과 문자열과 두 번 정제 결과를 함께 돌려줌
 */
async function clean(page, html, policy = 'on') {
  return page.evaluate(([h, p]) => {
    const pol = p === 'on' ? window.JM.makeStructurePolicy({ enabled: true }) : null;
    const out = window.JM.Sanitizer.clean(h, pol);
    return { out, twice: window.JM.Sanitizer.clean(out, pol) === out };
  }, [html, policy]);
}

const PIC_IMG = '<img src="/a.png" alt="a">';
for (const policy of ['on', 'off']) {
  test.describe(`picture·loading 정제 (구조 ${policy})`, () => {
    /** 입력 → 기대 출력, 두 번 정제해도 같아야 함 */
    const same = async (page, html, exp = html) => {
      const r = await clean(page, html, policy);
      expect(r.out).toBe(exp);
      expect(r.twice).toBe(true);
    };

    test('picture 보존', async ({ page }) => {
      await same(page, '<p><picture><source media="(max-width: 767px)" srcset="/a-mo.png"><img src="/a.png" alt="a" loading="lazy"></picture></p>');
    });
    test('img 없는 picture 는 버림', async ({ page }) => {
      await same(page, '<p>x<picture><source srcset="/a-mo.png"></picture></p>', '<p>x</p>');
    });
    test('source 없으면 img 만', async ({ page }) => {
      await same(page, `<p><picture>${PIC_IMG}</picture></p>`, `<p>${PIC_IMG}</p>`);
    });
    test('img 뒤 source·다른 자식은 버림', async ({ page }) => {
      await same(page, `<p><picture><source srcset="/m.png">${PIC_IMG}<source srcset="/x.png"><span>t</span></picture></p>`, `<p><picture><source srcset="/m.png">${PIC_IMG}</picture></p>`);
    });
    test('source 5개면 앞 4개', async ({ page }) => {
      const s = (n) => `<source srcset="/${n}.png">`;
      await same(page, `<picture>${s(1)}${s(2)}${s(3)}${s(4)}${s(5)}${PIC_IMG}</picture>`, `<picture>${s(1)}${s(2)}${s(3)}${s(4)}${PIC_IMG}</picture>`);
    });
    test('srcset 규칙에 어긋난 source 만 버림', async ({ page }) => {
      const bad = [
        'javascript:alert(1)', ' JavaScript:alert(1)', '/a.png, javascript:alert(1)', '/a.png 1x, javascript:alert(1) 2x',
        'data:text/html;base64,AA', 'data:image/png;base64,AA 1x, /b.png 2x', '/b.png 2x, data:image/png;base64,AA 1x',
        '/a.png 1x, /b.png 2x, /c.png 3x, /d.png 4x, /e.png 5x', '/a.png 1y', '/a.png 1x 2x', '/a.png,/b.png', '/a.png\n1x', '/a\t.png', '',
        'vbscript:x', '//ok.com/a.png, java\tscript:x',
      ];
      for (const b of bad) {
        const r = await clean(page, `<p><picture><source srcset="${b.replace(/"/g, '&quot;')}">${PIC_IMG}</picture></p>`, policy);
        expect(r.out, `srcset=${JSON.stringify(b)}`).toBe(`<p>${PIC_IMG}</p>`);
      }
    });
    test('srcset 정상값은 정규화해 남김 (대문자 프로토콜·앞뒤 공백·서술자)', async ({ page }) => {
      const ok = [
        ['  HTTPS://e.com/a.png 2x  ', 'HTTPS://e.com/a.png 2x'],
        ['/a.png 480w ,  /b.png 800w', '/a.png 480w, /b.png 800w'],
        ['/a.png 1.5x, /b.png', '/a.png 1.5x, /b.png'],
        ['DATA:image/png;base64,AA', 'DATA:image/png;base64,AA'],
        ['data:image/png;base64,AA 2x', 'data:image/png;base64,AA 2x'],
      ];
      for (const [i, o] of ok) {
        await same(page, `<picture><source srcset="${i}">${PIC_IMG}</picture>`, `<picture><source srcset="${o}">${PIC_IMG}</picture>`);
      }
    });
    test('media url( 이나 이상한 문자는 source 를 버림', async ({ page }) => {
      for (const m of ['(min-width:0) url(x)', '(min-width:0) URL (x)', '(a){}', 'x"y', 'a'.repeat(201)]) {
        const r = await clean(page, `<picture><source media="${m.replace(/"/g, '&quot;')}" srcset="/m.png">${PIC_IMG}</picture>`, policy);
        expect(r.out, `media=${m.slice(0, 30)}`).toBe(PIC_IMG);
      }
    });
    test('type 이상값은 속성만 지움', async ({ page }) => {
      await same(page, `<picture><source srcset="/m.png" type="text/html">${PIC_IMG}</picture>`, `<picture><source srcset="/m.png">${PIC_IMG}</picture>`);
      await same(page, `<picture><source srcset="/m.png" type="image/webp">${PIC_IMG}</picture>`);
    });
    test('source 의 다른 속성·onerror 는 지움', async ({ page }) => {
      await same(page, `<picture onclick="x()"><source srcset="/m.png" onerror="x()" sizes="1px" id="q">${PIC_IMG}</picture>`, `<picture><source srcset="/m.png">${PIC_IMG}</picture>`);
    });
    test('img loading 은 lazy·eager 만', async ({ page }) => {
      await same(page, '<p><img src="/a.png" loading="lazy"><img src="/b.png" loading="eager"></p>');
      await same(page, '<p><img src="/a.png" loading="auto"><img src="/b.png" loading="LAZY"></p>', '<p><img src="/a.png"><img src="/b.png"></p>');
    });
    test('갤러리·슬라이드·배치 이미지 칸 안 picture 는 img 로', async ({ page }) => {
      const pic = '<picture><source srcset="/m.png"><img src="/g.png"></picture>';
      await same(page, `<div data-type="gallery">${pic}</div>`, '<div data-type="gallery"><img src="/g.png"></div>');
      await same(page, `<div data-type="slider">${pic}</div>`, '<div data-type="slider" data-interval="3000" data-ratio="16:9" data-indicator="dots" data-indicator-pos="bottom-center" data-width="100" data-align="center"><img src="/g.png"></div>');
      const r = await clean(page, `<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image">${pic}</div><div data-cell="text"><p>글</p>${pic}</div></div>`, policy);
      expect(r.out).toBe('<div data-type="layout" data-preset="side" data-variant="left"><div data-cell="image"><img src="/g.png"></div><div data-cell="text"><p>글</p></div></div>');
    });
    test('갤러리 picture 에 img 가 둘이어도 첫 장만', async ({ page }) => {
      await same(page, '<div data-type="gallery"><picture><source srcset="/m.png"><img src="/1.png"><img src="/2.png"></picture></div>', '<div data-type="gallery"><img src="/1.png"></div>');
    });
    test('picture 밖 source 는 남지 않음', async ({ page }) => {
      await same(page, '<p>x<source srcset="javascript:alert(1)" media="url(//evil)" type="text/html"></p>', '<p>x</p>');
      await same(page, '<table><tbody><tr><td><source srcset="//evil.com/t.png"></td></tr></tbody></table>', '<table><tbody><tr><td></td></tr></tbody></table>');
    });
    test('표 칸 안 picture 도 보존', async ({ page }) => {
      const p = '<picture><source srcset="/m.png"><img src="/a.png"></picture>';
      await same(page, `<table><tbody><tr><td>${p}</td></tr></tbody></table>`);
    });
  });
}

test('구조 모드: picture class 는 토큰 검사 후 남고, 끔에서는 사라진다', async ({ page }) => {
  const h = `<picture class="pic jm-x is-selected"><source srcset="/m.png" class="no">${PIC_IMG}</picture>`;
  expect((await clean(page, h, 'on')).out).toBe(`<picture class="pic"><source srcset="/m.png">${PIC_IMG}</picture>`);
  expect((await clean(page, h, 'off')).out).toBe(`<picture><source srcset="/m.png">${PIC_IMG}</picture>`);
});

test('picture 왕복: setHTML → getHTML 같음, 이미지 선택 표시(jm-img-selected)는 남지 않음', async ({ page }) => {
  // canonical 은 속성을 이름순으로 정렬하므로 기대값도 그 순서로 쓴다
  const h = '<p><picture><source media="(max-width: 767px)" srcset="/a-mo.png"><img alt="a" loading="lazy" src="/a.png"></picture></p>';
  await setHTML(page, h);
  expect(await canonical(page)).toBe(h);
  await page.click('picture img');
  expect(await page.evaluate(() => document.querySelector('picture img').classList.contains('jm-img-selected'))).toBe(true);
  expect(await canonical(page)).toBe(h);
});

/**
 * id·aria·아이콘 i (구조 모드) — cfg 로 정책을 직접 준다 (null 이면 구조 모드 끔)
 */
async function cleanWith(page, html, cfg = { enabled: true }) {
  return page.evaluate(([h, c]) => {
    const pol = c ? window.JM.makeStructurePolicy(c) : null;
    const out = window.JM.Sanitizer.clean(h, pol);
    return { out, twice: window.JM.Sanitizer.clean(out, pol) === out };
  }, [html, cfg]);
}

test.describe('id·aria·아이콘 i (구조 모드)', () => {
  test('id·aria 보존', async ({ page }) => {
    const h = '<section id="h2021" class="p" aria-labelledby="h2021Tit"><h3 id="h2021Tit">제목</h3></section>';
    const r = await cleanWith(page, h);
    expect(r.out).toBe('<section class="p" id="h2021" aria-labelledby="h2021Tit"><h3 id="h2021Tit">제목</h3></section>');
    expect(r.twice).toBe(true);
    await setHTML(page, h);
    expect(await canonical(page)).toBe('<section aria-labelledby="h2021Tit" class="p" id="h2021"><h3 id="h2021Tit">제목</h3></section>');
  });

  test('금지 id: jm-·예약 전역·형식 위반은 지우고 흔한 퍼블 id 는 남김', async ({ page }) => {
    for (const id of ['jm-x', 'JM-x', 'JmEditorConfig', 'JmEditor', 'JmViewer', 'JM', 'kakao', 'daum', 'EyeDropper', '1abc', 'a b', ' a', 'a\n', 'a\u00a0', 'a\ufeff', '', 'a'.repeat(65), '한글', 'a.b']) {
      const r = await cleanWith(page, `<p id="${id}">a</p>`);
      expect(r.out, `id=${JSON.stringify(id)}`).toBe('<p>a</p>');
    }
    for (const id of ['history', 'location', 'content', 'jmx', 'Daum', 'kakaoMap', 'a'.repeat(64)]) {
      expect((await cleanWith(page, `<p id="${id}">a</p>`)).out).toBe(`<p id="${id}">a</p>`);
    }
    const deny = { enabled: true, idDeny: ['gnb', 'site-*'] };
    expect((await cleanWith(page, '<div id="gnb">a</div><div id="site-top">b</div><div id="history">c</div><div id="location">d</div>', deny)).out)
      .toBe('<div>a</div><div>b</div><div id="history">c</div><div id="location">d</div>');
  });

  test('중복 id 는 첫 번째만 (대소문자가 다르면 다른 id)', async ({ page }) => {
    const r = await cleanWith(page, '<section id="a"><p id="a">1</p></section><p id="A">2</p><p id="a">3</p>');
    expect(r.out).toBe('<section id="a"><p>1</p></section><p id="A">2</p><p>3</p>');
  });

  test('aria 값 검사', async ({ page }) => {
    // 출력 순서는 aria-labelledby·aria-describedby·aria-label·aria-hidden
    const ok = '<p aria-describedby="a b" aria-label="설명" aria-hidden="true">x</p>';
    expect((await cleanWith(page, '<p aria-hidden="true" aria-label="설명" aria-describedby="a  b">x</p>')).out).toBe(ok);
    const bad = [
      'aria-hidden="false"', 'aria-hidden="TRUE"', 'aria-hidden=""',
      `aria-labelledby="${'t1 t2 t3 t4 t5 t6 t7 t8 t9'}"`, 'aria-labelledby="1a"', 'aria-labelledby=""', 'aria-describedby="a,b"',
      `aria-label="${'a'.repeat(201)}"`, 'aria-label="a&#10;b"', 'aria-label=""', 'aria-label="\u00a0"', 'aria-live="polite"', 'role="button"', 'aria-controls="x"',
    ];
    for (const a of bad) expect((await cleanWith(page, `<p ${a}>x</p>`)).out, a).toBe('<p>x</p>');
    expect((await cleanWith(page, '<p aria-labelledby="t1 t2 t3 t4 t5 t6 t7 t8">x</p>')).out).toBe('<p aria-labelledby="t1 t2 t3 t4 t5 t6 t7 t8">x</p>');
  });

  test('아이콘 i: class 있고 글이 없으면 i, 그 밖은 em', async ({ page }) => {
    const r = await cleanWith(page, '<p><i class="ico ph ph-plant"></i>글 <i>기울임</i></p>');
    expect(r.out).toBe('<p><i class="ico ph ph-plant"></i>글 <em>기울임</em></p>');
    expect(r.twice).toBe(true);
    expect((await cleanWith(page, '<p><i class="ico jm-x" id="q" aria-hidden="true" style="color: red" onclick="x()"> </i><i class="ico">a</i><i class="jm-x"></i></p>')).out)
      .toBe('<p><i class="ico" aria-hidden="true"> </i><em class="ico">a</em><em></em></p>'); // 글이 있으면 em (구조 모드라 class 는 남음)
  });

  test('아이콘 i: aria-hidden="true" 만 남고 id·다른 aria 는 없음', async ({ page }) => {
    const r = await cleanWith(page, '<p><i class="ico" aria-hidden="true"></i><i class="ico" aria-hidden="false" aria-label="x" aria-labelledby="t" id="q"></i></p>');
    expect(r.out).toBe('<p><i class="ico" aria-hidden="true"></i><i class="ico"></i></p>');
    expect(r.twice).toBe(true);
    await setHTML(page, '<p><i class="ico ph-arrow" aria-hidden="true"></i>더보기</p>');
    expect(await canonical(page)).toBe('<p><i aria-hidden="true" class="ico ph-arrow"></i>더보기</p>');
  });

  test('script 안 글도 글로 본다 → em', async ({ page }) => {
    expect((await cleanWith(page, '<p><i class="ico"><script>a</script></i></p>')).out).toBe('<p><em class="ico"></em></p>');
  });

  test('picture·div→p·span 에도 id 유지 (서버와 같은 입력)', async ({ page }) => {
    expect((await cleanWith(page, '<picture id="pc" aria-label="그림"><source srcset="/m.png"><img src="/a.png" id="im"></picture>')).out)
      .toBe('<picture id="pc" aria-label="그림"><source srcset="/m.png"><img id="im" src="/a.png"></picture>'); // 구조 속성(class·id·aria)이 먼저
    expect((await cleanWith(page, '<div id="d" aria-hidden="true">a</div>', { enabled: true, tags: ['section'] })).out).toBe('<p id="d" aria-hidden="true">a</p>');
    expect((await cleanWith(page, '<p><span id="loc">a</span><span aria-label="x">b</span><span>c</span></p>')).out)
      .toBe('<p><span id="loc">a</span><span aria-label="x">b</span>c</p>');
  });

  test('플러그인 블록 안에서는 id·aria 없음', async ({ page }) => {
    expect((await cleanWith(page, '<div data-type="buttons" id="b"><a href="/x" data-role="button" id="c" aria-label="x">a</a></div>')).out)
      .toBe('<div data-type="buttons" data-align="center"><a href="/x" data-role="button" target="_blank" rel="noopener noreferrer" data-style="primary">a</a></div>');
  });

  test('꺼진 모드: id·aria 없음, i 는 em, picture·loading 은 남음', async ({ page }) => {
    await open(page, '?structure=0');
    await setHTML(page, '<p id="h2021" aria-labelledby="t" aria-hidden="true"><i class="ico ph"></i>글 <i>기울임</i><picture><source srcset="/m.png"><img src="/a.png" loading="lazy"></picture></p>');
    expect(await canonical(page)).toBe('<p><em></em>글 <em>기울임</em><picture><source srcset="/m.png"><img loading="lazy" src="/a.png"></picture></p>');
  });

  test('편집 중 id 숨김: 본문 요소가 페이지 id 와 겹치지 않음', async ({ page }) => {
    const pageId = await page.evaluate(() => window.ed.container?.id || document.querySelector('[id]').id);
    expect(pageId).toBe('editor');
    await setHTML(page, `<section id="${pageId}"><p id="x1">a</p></section>`);
    const r = await page.evaluate((id) => ({
      inRoot: window.core.root.querySelector('[id]'),
      byId: window.core.root.contains(document.getElementById(id)),
      x1: document.getElementById('x1'),
    }), pageId);
    expect(r).toEqual({ inRoot: null, byId: false, x1: null });
    expect(await canonical(page)).toBe(`<section id="${pageId}"><p id="x1">a</p></section>`);
  });

  test('편집 중 생긴 중복 id: Enter 로 나눠도 저장에는 한 번', async ({ page }) => {
    await setHTML(page, '<h4 id="a">가나</h4>');
    await caret(page, 'h4', 1);
    await page.keyboard.press('Enter');
    // 편집 DOM 에는 보관 속성이 복제돼 둘 (나뉜 두 h4 모두) — 저장할 때 첫 번째만
    expect(await page.evaluate(() => window.core.root.querySelectorAll('[data-jm-id="a"]').length)).toBe(2);
    const out = await html(page);
    expect(out.match(/id="a"/g)).toHaveLength(1);
  });

  test('HTML 보기·되돌리기 id 유지', async ({ page }) => {
    const h = '<section id="s1"><p id="p1">가나</p></section>';
    await setHTML(page, h);
    await page.evaluate(() => { window.ed.setMode('html'); window.ed.setMode('editor'); });
    expect(await canonical(page)).toBe(h);
    await caret(page, '#s1 p, [data-jm-id="p1"]', 2);
    await page.keyboard.type('다');
    expect(await canonical(page)).toBe('<section id="s1"><p id="p1">가나다</p></section>');
    await page.evaluate(() => window.core.exec('undo'));
    expect(await canonical(page)).toBe(h);
    expect(await page.evaluate(() => window.core.root.querySelector('[id]'))).toBe(null);
  });

  test('미리보기에서도 본문 id 는 document 에 id 로 없음', async ({ page }) => {
    await setHTML(page, '<section id="pv1"><p id="pv2">a</p></section>');
    await page.evaluate(() => window.ed.setMode('preview'));
    const r = await page.evaluate(() => ({
      byId: [document.getElementById('pv1'), document.getElementById('pv2')],
      named: [typeof window.pv1, typeof window.pv2],
      kept: window.ed.previewPane.querySelectorAll('[data-jm-id]').length,
    }));
    expect(r).toEqual({ byId: [null, null], named: ['undefined', 'undefined'], kept: 2 });
    expect(await canonical(page)).toBe('<section id="pv1"><p id="pv2">a</p></section>'); // 저장 HTML 은 그대로
  });

  test('서식 미리보기에서도 서식 id 는 document 에 id 로 없음', async ({ page }) => {
    await page.evaluate(async () => {
      window.ed.formatPicker.formats = [{ name: 'f', description: '', html: '<section id="fmt1"><h4 id="fmt2">제목</h4></section>' }];
      await window.ed.formatPicker.openAt(window.ed.buttons.format);
    });
    const r = await page.evaluate(() => ({
      byId: [document.getElementById('fmt1'), document.getElementById('fmt2')],
      kept: window.ed.formatPicker.el.querySelectorAll('[data-jm-id]').length,
    }));
    expect(r).toEqual({ byId: [null, null], kept: 2 });
  });

  test('플러그인 블록 안 런타임 id 는 편집 중 commit 에도 그대로, 저장 형식은 지금처럼', async ({ page }) => {
    await page.route(/dmaps\.daum\.net|kakao/, (r) => r.abort()); // 지도 스크립트는 받지 않음
    await setHTML(page, '<div data-type="map" data-timestamp="1792762389634" data-key="3rt3v4p5vvx" data-height="400"></div><div data-type="gallery"><img src="/g.png"></div>');
    const before = await html(page);
    await page.evaluate(() => {
      const add = (sel, id) => { const d = document.createElement('div'); d.id = id; window.core.root.querySelector(sel).appendChild(d); return d; };
      // 지도 런타임처럼 캔버스(jm-map-canvas) 안에 id 요소
      const canvas = window.core.root.querySelector('div[data-type="map"] > .jm-map-canvas') || add('div[data-type="map"]', '');
      canvas.removeAttribute('id'); canvas.className = 'jm-map-canvas';
      const root = document.createElement('div'); root.id = 'daumRoughmapContainer1792762389634'; canvas.appendChild(root);
      add('div[data-type="gallery"]', 'rtGallery');
      window.core.commit();
    });
    const r = await page.evaluate(() => [!!document.getElementById('daumRoughmapContainer1792762389634'), !!document.getElementById('rtGallery'), window.core.root.querySelectorAll('[data-jm-id]').length]);
    expect(r).toEqual([true, true, 0]);
    const after = await html(page);
    expect(after).not.toContain('data-jm-id');
    expect(after.replace(/<div id="rtGallery"><\/div>/, '')).toBe(before); // 지도 캔버스는 저장 때 버림(지금 규칙), 갤러리는 getHTML 이 정제하지 않아 넣은 요소가 그대로(id 그대로)
  });
});
