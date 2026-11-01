/**
 * 보안 핫픽스 — 공백 정규식(H1), 깊은 중첩(H2), exec 속성 주입(H3), API id 인코딩(H4), 이미지·링크 주소 검사(H5)
 * 입력·기대값은 서버 JmEditor-server 의 SecurityHotfixTest 와 같다 (클라이언트·서버 결과가 같아야 함).
 */
import { test, expect } from '@playwright/test';
import { open, html } from './helpers.js';

const DEEP_LIMIT_MS = 2000;

test.beforeEach(async ({ page }) => { await open(page, '?structure=1'); });

/** 구조 정책으로 정제하고 걸린 시간과 결과를 돌려준다 */
function clean(page, input) {
  return page.evaluate((h) => {
    const s = performance.now();
    const out = window.JM.Sanitizer.clean(h, window.core.structure);
    return { out, ms: performance.now() - s };
  }, input);
}

/** n 겹으로 감싼 문자열 */
const nest = (n, tag, inner) => `<${tag}>`.repeat(n) + inner + `</${tag}>`.repeat(n);

test.describe('H1 공백 정규식·길이 상한', () => {
  test('공백 100만 자 href·srcset 이 1초 안에 끝나고 길이 상한으로 버려진다', async ({ page }) => {
    const sp = ' '.repeat(1_000_000);
    const a = await clean(page, `<p><a href="${sp}/a${sp}">x</a></p>`);
    expect(a.ms).toBeLessThan(1000);
    expect(a.out).toBe('<p><a target="_blank" rel="noopener noreferrer">x</a></p>');
    const s = await clean(page, `<picture><source srcset="${sp}/m.png${sp}"><img src="/a.png"></picture>`);
    expect(s.ms).toBeLessThan(1000);
    expect(s.out).toBe('<img src="/a.png">');
  });

  test('href 는 8192자까지, srcset 도 8192자까지 (data: 는 예외)', async ({ page }) => {
    const ok = `/${'a'.repeat(8191)}`;
    const over = `/${'a'.repeat(8192)}`;
    expect((await clean(page, `<p><a href="${ok}">x</a></p>`)).out).toContain(`href="${ok}"`);
    expect((await clean(page, `<p><a href="${over}">x</a></p>`)).out).not.toContain('href=');
    const pic = (v) => `<picture><source srcset="${v}"><img src="/a.png"></picture>`;
    expect((await clean(page, pic(ok))).out).toContain('<source');
    expect((await clean(page, pic(over))).out).not.toContain('<source');
    const data = `data:image/png;base64,${'A'.repeat(9000)}`;
    expect((await clean(page, pic(data))).out).toContain('<source');
  });
});

test.describe('H2 깊은 중첩', () => {
  test('div 중첩 100만 자가 2초 안에 끝나고 안의 글이 남는다', async ({ page }) => {
    const input = `${'<div>'.repeat(200_000)}글자`;
    const r = await clean(page, input);
    expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
    expect(r.out).toContain('글자');
    expect(r.out.match(/<div>/g).length).toBe(256);
  });

  test('setHTML 도 깊은 중첩에서 2초 안에 끝난다', async ({ page }) => {
    const ms = await page.evaluate((input) => {
      const s = performance.now();
      window.ed.setHTML(input);
      return performance.now() - s;
    }, `${'<div>'.repeat(200_000)}글자`);
    expect(ms).toBeLessThan(DEEP_LIMIT_MS);
    expect(await html(page)).toContain('글자');
  });

  test('다른 태그·글이 섞인 깊은 중첩도 빠르고 글이 모두 남는다', async ({ page }) => {
    const r = await clean(page, '<section><span style="color:red">가'.repeat(30_000));
    expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
    expect(r.out.match(/가/g).length).toBe(30_000);
  });

  test('깊이 256 은 그대로, 257 번째부터 벗긴다', async ({ page }) => {
    const ok = nest(256, 'div', '글');
    expect((await clean(page, ok)).out).toBe(ok);
    expect((await clean(page, nest(257, 'div', '글'))).out).toBe(ok);
    expect((await clean(page, nest(256, 'div', '<strong>글</strong>'))).out).toBe(ok);
  });

  for (const [name, input] of [
    ['깨진 주석', `<!-->${'<div>'.repeat(60_000)}끝`],
    ['= 뒤 따옴표', `<div a==">${'<div>'.repeat(60_000)}끝`],
    ['object 가 막는 닫는 태그', `${'<div><object></div>'.repeat(60_000)}끝`],
  ]) {
    test(`스캔 우회 입력도 2초 안: ${name}`, async ({ page }) => {
      const r = await clean(page, input);
      expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
      if (!input.includes('object')) expect(r.out).toContain('끝'); // object 는 안의 내용째 버린다 (기존 규칙)
    });
  }

  test('표 중첩이 깊어도 호출 스택이 넘치지 않고 글이 남는다', async ({ page }) => {
    const r = await clean(page, `${'<table><tr><td>'.repeat(60_000)}끝`);
    expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
    expect(r.out).toContain('끝');
  });

  /** 큰 정상 문서: 저절로 닫히는 태그·서식 태그로 한도에 닿지 않아야 한다 */
  for (const [name, input, tag, n] of [
    ['p 3만', '<p>x'.repeat(30_000), 'p', 30_000],
    ['li 3만', `<ul>${'<li>x'.repeat(30_000)}</ul>`, 'li', 30_000],
    ['tr·td 3만', `<table>${'<tr><td>x'.repeat(30_000)}</table>`, 'td', 30_000],
    ['td 6칸 1만', `<table>${'<tr><td>a<td>b<td>c<td>d<td>e<td>f'.repeat(10_000)}</table>`, 'td', 60_000],
    ['닫힌 tr 1만', `<table>${'<tr><td>a<td>b<td>c</tr>'.repeat(10_000)}</table>`, 'td', 30_000],
    ['font 안 닫은 p 3만', '<p><font>a</p>'.repeat(30_000), 'p', 30_000],
    ['font 안 닫은 div 3만', '<div><font>a</div>'.repeat(30_000), 'div', 30_000],
    ['font 안 닫은 td 3만', `<table><tr>${'<td><font>a</td>'.repeat(30_000)}</table>`, 'td', 30_000],
  ]) {
    test(`큰 정상 문서의 태그가 유지된다: ${name}`, async ({ page }) => {
      const r = await page.evaluate(([h, t]) => {
        const tpl = document.createElement('template');
        tpl.innerHTML = window.JM.Sanitizer.clean(`${h}<h2>끝</h2>`, window.core.structure);
        return { n: tpl.content.querySelectorAll(t).length, h2: tpl.content.querySelectorAll('h2').length, last: tpl.content.querySelector('h2')?.textContent };
      }, [input, tag]);
      expect(r.n).toBeGreaterThanOrEqual(n);
      expect(r.h2).toBe(1);
      expect(r.last).toBe('끝');
    });
  }

  for (const [name, input] of Object.entries({
    font: '<font>x'.repeat(60_000),
    'font p': '<font><p>x'.repeat(60_000),
    'font div': '<font><div></div>'.repeat(60_000),
    'td table': '<td><table>'.repeat(60_000),
  })) {
    test(`서식 태그 공격 입력도 2초 안: ${name}`, async ({ page }) => {
      const r = await clean(page, input);
      console.log('TIME', name, Math.round(r.ms));
      expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
    });
  }

  // 닫는 태그로 집계를 속이는 변형: 2초는 못 맞추지만 한도로 묶여 커지지 않는다 (회귀 방지용 넉넉한 값)
  for (const [name, input] of Object.entries({
    '닫는 p 만': '<font></p>'.repeat(60_000),
    '빈 p 뒤 font': '<p></p><font></p>'.repeat(60_000),
    'p 를 닫는 div': '<p><div></div><font></p>'.repeat(60_000),
    '빈 td 뒤 font': '<td></td><font></td>'.repeat(60_000),
  })) {
    test(`집계를 속이는 변형도 한도로 묶인다: ${name}`, async ({ page }) => {
      const r = await clean(page, input);
      console.log('TIME', name, Math.round(r.ms));
      expect(r.ms).toBeLessThan(10_000);
    });
  }

  test('닫는 태그까지 있는 깊은 중첩도 2초 안', async ({ page }) => {
    const r = await clean(page, `${'<div>'.repeat(100_000)}끝${'</div>'.repeat(100_000)}`);
    expect(r.ms).toBeLessThan(DEEP_LIMIT_MS);
    expect(r.out).toContain('끝');
  });

  test('닫히지 않은 font 가 쌓인 옛 글의 뒤 제목이 유지된다', async ({ page }) => {
    const r = await clean(page, `${'<p><font>a</p>'.repeat(600)}<h2>끝</h2>`);
    expect(r.out).toContain('<h2>끝</h2>');
  });

  for (const [name, input, keep] of [
    ['주석', `<!--${'<div>'.repeat(600)}--><h2>끝</h2>`, '<h2>끝</h2>'],
    ['textarea', `<textarea>${'<div>'.repeat(600)}</textarea><h2>끝</h2>`, '<h2>끝</h2>'],
    ['속성값', `<p title="${'<div'.repeat(600)}">글</p><h2>끝</h2>`, '<p>글</p><h2>끝</h2>'],
  ]) {
    test(`${name} 안의 div 600개는 문서를 건드리지 않는다`, async ({ page }) => {
      expect((await clean(page, input)).out).toContain(keep);
    });
  }

  test('막힌 태그가 많아도(p·li 는 자동으로 닫힘) 문단이 그대로다', async ({ page }) => {
    const input = '<p>가</p><p>나'.repeat(600);
    const r = await clean(page, input);
    expect(r.out.match(/<p>/g).length).toBe(1200);
  });
});

test.describe('H3 exec 속성 주입', () => {
  const PAYLOAD = '"><img src=x onerror="window.__pwned=1">';
  const cases = [
    ['buttons', { align: PAYLOAD }],
    ['slider', { interval: PAYLOAD, ratio: PAYLOAD }],
    ['gallery', PAYLOAD],
    ['layout', { preset: PAYLOAD, variant: PAYLOAD }],
    ['layout', PAYLOAD],
    ['map', PAYLOAD],
    ['map', `{timestamp:"1234567890", key:"${PAYLOAD}"}`],
    ['youtube', PAYLOAD],
    ['table', { rows: 1, cols: 1, header: PAYLOAD }],
    ['format', PAYLOAD],
    ['heading', PAYLOAD],
    ['ul', PAYLOAD],
    ['quote', PAYLOAD],
    ['color', PAYLOAD],
    ['fontSize', PAYLOAD],
    ['link', PAYLOAD],
    ['image', { src: 'x', alt: PAYLOAD }],
  ];
  for (const [name, value] of cases) {
    test(`${name} ${JSON.stringify(value).slice(0, 24)}: 실행·onerror 없음`, async ({ page }) => {
      await page.evaluate(() => { window.core.options.notify = () => {}; window.ed.setHTML('<p>글</p>'); window.core.root.focus(); });
      await page.evaluate(([n, v]) => window.core.exec(n, v), [name, value]);
      await page.waitForTimeout(50);
      expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
      expect(await page.evaluate(() => window.core.root.querySelector('[onerror]'))).toBeNull();
      expect(await page.evaluate(() => window.core.getHTML())).not.toMatch(/<[^>]*\sonerror=/i);
    });
  }

  test('허용 값은 그대로 쓰고, 어긋나면 기본값', async ({ page }) => {
    await page.evaluate(() => window.core.root.focus());
    await page.evaluate(() => window.core.exec('buttons', { align: 'right' }));
    await page.evaluate(() => window.core.exec('slider', { interval: 5000, ratio: '4:3' }));
    await page.evaluate(() => window.core.exec('buttons', { align: 'evil' }));
    await page.evaluate(() => window.core.exec('slider', { interval: 99999999, ratio: 'evil' }));
    const out = await page.evaluate(() => {
      const b = [...window.core.root.querySelectorAll('div[data-type=buttons]')].map((x) => x.dataset.align);
      const s = [...window.core.root.querySelectorAll('div[data-type=slider]')].map((x) => [x.dataset.interval, x.dataset.ratio].join('|'));
      return { b: b.sort(), s: s.sort() };
    });
    expect(out.b).toEqual(['center', 'right']);
    expect(out.s).toEqual(['3000|16:9', '5000|4:3']);
  });
});

test.describe('H4 API id 인코딩', () => {
  test('get·update 가 id 를 경로 한 칸으로 인코딩한다', async ({ page }) => {
    const urls = await page.evaluate(async () => {
      const seen = [];
      const api = new window.JM.JmEditorApi({ fetch: async (u) => { seen.push(u); return new Response('{}', { status: 200 }); } });
      await api.update('../../admin/users/1', { title: 't', content: 'c' });
      await api.get('a/b?c#d');
      await api.get(7);
      return seen;
    });
    expect(urls).toEqual([
      '/api/editor/contents/..%2F..%2Fadmin%2Fusers%2F1',
      '/api/editor/contents/a%2Fb%3Fc%23d',
      '/api/editor/contents/7',
    ]);
  });

  test('id 가 . .. 이면 요청 전에 거부한다', async ({ page }) => {
    const r = await page.evaluate(async () => {
      let calls = 0;
      const api = new window.JM.JmEditorApi({ fetch: async () => { calls++; return new Response('{}', { status: 200 }); } });
      const msgs = [];
      for (const run of [() => api.get('.'), () => api.get('..'), () => api.update('..', {})]) msgs.push(await run().then(() => 'ok', () => 'rejected'));
      return { calls, msgs };
    });
    expect(r).toEqual({ calls: 0, msgs: ['rejected', 'rejected', 'rejected'] });
  });
});

test.describe('H5 이미지·링크 주소', () => {
  const BAD_IMG = ['/\\evil.png', '/\tb/evil.png', 'https:evil.png', '//evil.png', 'http:/evil.png', 'javascript:alert(1)', 'data:text/html;base64,AA=='];
  for (const src of BAD_IMG) {
    test(`img src·srcset 제거: ${JSON.stringify(src)}`, async ({ page }) => {
      const r = await page.evaluate((v) => {
        const t = document.createElement('template');
        const img = document.createElement('img'); img.setAttribute('src', v);
        const pic = document.createElement('picture');
        const so = document.createElement('source'); so.setAttribute('srcset', v);
        pic.append(so, document.createElement('img'));
        t.content.append(img, pic);
        return window.JM.Sanitizer.clean(t.innerHTML, window.core.structure);
      }, src);
      expect(r).not.toContain('src="');
      expect(r).not.toContain('srcset');
      expect(r).not.toContain('<source');
    });
  }

  for (const href of ['//evil', '/\\evil', '\\\\evil', '/\t/evil', 'http:/evil']) {
    test(`href 제거: ${JSON.stringify(href)}`, async ({ page }) => {
      const r = await page.evaluate((v) => {
        const a = document.createElement('a'); a.setAttribute('href', v); a.textContent = 'x';
        return window.JM.Sanitizer.clean(a.outerHTML, window.core.structure);
      }, href);
      expect(r).not.toContain('href');
    });
  }

  test('안전한 주소는 유지', async ({ page }) => {
    for (const src of ['/uploads/a.png', 'https://a.b/c.png', 'HTTP://a.b/c.png', 'data:image/png;base64,AA==']) {
      expect((await clean(page, `<img src="${src}">`)).out).toBe(`<img src="${src}">`);
      expect((await clean(page, `<picture><source srcset="${src}"><img src="/a.png"></picture>`)).out).toContain('<source');
    }
  });

  /** uploadImage 가 돌려주는 주소를 바꾼 에디터로 파일을 넣어 본다 */
  const tryUpload = (page, url, run) => page.evaluate(async ([u, r]) => {
    const notes = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const core = new window.JM.JmEditor(host, { uploadImage: async () => u, notify: (m) => notes.push(m) });
    core.setHTML('<p>글</p>');
    host.focus();
    const file = new File([new Uint8Array(8)], 'a.png', { type: 'image/png' });
    if (r === 'insert') await core.insertImageFile(file);
    if (r === 'slider') {
      core.exec('slider', {});
      await core.slider.addFiles(host.querySelector('div[data-type=slider]'), [file]);
    }
    if (r === 'replace') {
      core.setHTML('<p><img src="/old.png"></p>');
      await core.image.replace(host.querySelector('img'), file);
    }
    return { html: core.getHTML(), notes };
  }, [url, run]);

  for (const way of ['insert', 'slider']) {
    test(`uploadImage 가 javascript: 를 돌려주면 삽입 안 되고 알림 (${way})`, async ({ page }) => {
      const r = await tryUpload(page, 'javascript:alert(1)', way);
      expect(r.html).not.toContain('<img');
      expect(r.html).not.toContain('javascript:');
      expect(r.notes.length).toBe(1);
    });
  }

  test('uploadImage 가 javascript: 를 돌려주면 이미지 교체 안 됨', async ({ page }) => {
    const r = await tryUpload(page, 'javascript:alert(1)', 'replace');
    expect(r.html).toContain('src="/old.png"');
    expect(r.notes.length).toBe(1);
  });

  test('uploadImage 가 안전한 주소면 삽입', async ({ page }) => {
    const r = await tryUpload(page, '/uploads/a.png', 'insert');
    expect(r.html).toContain('src="/uploads/a.png"');
    expect(r.notes).toEqual([]);
  });

  test('uploadImage 의 this 는 원본 옵션이고, 생성 후 원본 옵션을 바꾸면 반영된다', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const options = { base: '/one/', async uploadImage() { return `${this.base}a.png`; }, notify: () => {} };
      const core = new window.JM.JmEditor(host, options);
      const first = await core.options.uploadImage(new File([], 'a.png'));
      options.base = '/two/';
      const second = await core.options.uploadImage(new File([], 'a.png'));
      options.uploadImage = async () => '/three.png';
      const third = await core.options.uploadImage(new File([], 'a.png'));
      const notes = [];
      options.notify = (m) => notes.push(m);
      core.exec('image', { src: 'javascript:alert(1)' });
      return { first, second, third, notes: notes.length };
    });
    expect(r).toEqual({ first: '/one/a.png', second: '/two/a.png', third: '/three.png', notes: 1 });
  });

  test("exec('image') 는 위험한 주소를 넣지 않고 알린다", async ({ page }) => {
    const r = await page.evaluate(() => {
      const notes = [];
      window.core.options.notify = (m) => notes.push(m);
      window.core.root.focus();
      window.core.exec('image', { src: 'javascript:alert(1)' });
      return { notes, n: window.core.root.querySelectorAll('img').length };
    });
    expect(r.n).toBe(0);
    expect(r.notes.length).toBe(1);
  });

  test('JmEditorApi.uploadImage 는 위험한 주소면 거부한다', async ({ page }) => {
    const msg = await page.evaluate(async () => {
      const api = new window.JM.JmEditorApi({ fetch: async () => new Response('{"url":"javascript:alert(1)"}', { status: 200 }) });
      return api.uploadImage(new File([new Uint8Array(1)], 'a.png')).then(() => 'ok', (e) => e.message);
    });
    expect(msg).toContain('주소');
  });
});
