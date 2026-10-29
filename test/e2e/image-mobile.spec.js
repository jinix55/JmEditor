/**
 * 모바일 이미지(picture > source[media] + img) 추가·교체·삭제 — ImageCommands
 * - 하네스는 uploadImage 없이 만들어 base64(data:) 로 들어간다.
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, exec } from './helpers.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MQ = '(max-width: 767px)';

test.beforeEach(async ({ page }) => { await open(page); });

/** 1px PNG File 을 만들어 ImageCommands 메서드를 부른다 */
async function call(page, method, imgSel = 'img', name = 'm.png') {
  await page.evaluate(async ([m, sel, n, b64]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bin], n, { type: 'image/png' });
    const img = window.core.root.querySelector(sel);
    await window.core.image[m](img, file);
  }, [method, imgSel, name, PNG]);
}

test('모바일 추가: picture 로 감싸고 source 를 img 앞에 둔다', async ({ page }) => {
  await setHTML(page, '<p><img src="/a.png" alt="a"></p>');
  await call(page, 'addMobile');
  const out = await html(page);
  expect(out).toMatch(/^<p><picture><source media="\(max-width: 767px\)" srcset="data:image\/png;base64,[^"]+"><img src="\/a\.png" alt="a"><\/picture><\/p>$/);
});

test('base64 모바일 왕복', async ({ page }) => {
  await setHTML(page, '<p><img src="/a.png" alt="a"></p>');
  await call(page, 'addMobile');
  const a = await html(page);
  await setHTML(page, a);
  expect(await html(page)).toBe(a);
});

test('옵션 mobileMedia 반영', async ({ page }) => {
  const out = await page.evaluate(async (b64) => {
    const host = document.createElement('div');
    document.body.append(host);
    const ed = new window.JM.JmEditor(host, { image: { mobileMedia: '(max-width: 600px)' } });
    ed.setHTML('<p><img src="/a.png" alt="a"></p>');
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'm.png', { type: 'image/png' });
    await ed.image.addMobile(ed.root.querySelector('img'), file);
    return ed.root.querySelector('source').getAttribute('media');
  }, PNG);
  expect(out).toBe('(max-width: 600px)');
});

test('모바일 교체: 첫 source srcset 만 바뀐다', async ({ page }) => {
  await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m1.png" type="image/webp"><source media="(max-width: 1023px)" srcset="/m2.png"><img src="/a.png" alt="a"></picture></p>');
  await call(page, 'replaceMobile');
  const r = await page.evaluate(() => [...window.core.root.querySelectorAll('source')].map((s) => [s.getAttribute('media'), s.getAttribute('srcset').slice(0, 22), s.getAttribute('type')]));
  expect(r).toEqual([[MQ, 'data:image/png;base64,', null], ['(max-width: 1023px)', '/m2.png', null]]);
});

test('모바일 삭제: source 1개면 picture 를 벗기고, 2개면 첫 것만 지운다', async ({ page }) => {
  await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m1.png"><img src="/a.png" alt="a"></picture></p>');
  await page.evaluate(() => window.core.image.removeMobile(window.core.root.querySelector('img')));
  expect(await html(page)).toBe('<p><img src="/a.png" alt="a"></p>');
  await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m1.png"><source media="(max-width: 1023px)" srcset="/m2.png"><img src="/a.png" alt="a"></picture></p>');
  await page.evaluate(() => window.core.image.removeMobile(window.core.root.querySelector('img')));
  expect(await html(page)).toBe('<p><picture><source media="(max-width: 1023px)" srcset="/m2.png"><img src="/a.png" alt="a"></picture></p>');
});

test('PC 교체 시 source 유지, img src 만 바뀐다', async ({ page }) => {
  await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m1.png"><img src="/a.png" alt="a"></picture></p>');
  await call(page, 'replace');
  const r = await page.evaluate(() => {
    const p = window.core.root.querySelector('picture');
    return [p.querySelector('source').getAttribute('srcset'), p.querySelector('img').getAttribute('src').slice(0, 22)];
  });
  expect(r).toEqual(['/m1.png', 'data:image/png;base64,']);
});

test('이미지 삭제 시 picture 통째로', async ({ page }) => {
  await setHTML(page, '<p>앞<picture><source media="(max-width: 767px)" srcset="/m1.png"><img src="/a.png" alt="a"></picture></p>');
  await page.evaluate(() => window.core.image.remove(window.core.root.querySelector('img')));
  expect(await html(page)).toBe('<p>앞</p>');
});

test('모바일 추가 되돌리기', async ({ page }) => {
  await setHTML(page, '<p><img src="/a.png" alt="a"></p>');
  await call(page, 'addMobile');
  expect(await html(page)).toContain('<picture>');
  await exec(page, 'undo');
  expect(await html(page)).toBe('<p><img src="/a.png" alt="a"></p>');
});

test('도구 막대 버튼: picture 안 img 와 일반 img 에서 다르게 보인다', async ({ page }) => {
  await setHTML(page, '<p><picture><source media="(max-width: 767px)" srcset="/m1.png"><img src="/a.png" alt="a"></picture></p><p><img src="/b.png" alt="b"></p>');
  const btn = (t) => page.locator('.jm-imgbar-btn', { hasText: t });
  await page.evaluate(() => window.core.image.select(window.core.root.querySelectorAll('img')[0]));
  await expect(btn('모바일 교체')).toBeVisible();
  await expect(btn('모바일 삭제')).toBeVisible();
  await expect(btn('모바일 추가')).toBeHidden();
  await page.evaluate(() => window.core.image.select(window.core.root.querySelectorAll('img')[1]));
  await expect(btn('모바일 추가')).toBeVisible();
  await expect(btn('모바일 교체')).toBeHidden();
  await expect(btn('모바일 삭제')).toBeHidden();
});

test.describe('picture 옆 입력: 글이 picture 안으로 들어가 저장 때 사라지지 않게', () => {
  const PIC = `<picture><source media="${MQ}" srcset="/m.png"><img src="/a.png" alt="a"></picture>`;

  /** 커서를 노드 위치에 둔다 (fn 이 [container, offset] 을 돌려줌) */
  async function place(page, fn) {
    await page.evaluate((src) => {
      const [c, o] = new Function('root', `return (${src})(root)`)(window.core.root);
      const r = document.createRange(); r.setStart(c, o); r.collapse(true);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, fn.toString());
  }

  test('picture 끝에서 입력: picture 뒤 글로 남고 이어 입력해도 같은 자리', async ({ page }) => {
    await setHTML(page, `<p>앞${PIC}</p>`);
    await place(page, (root) => { const p = root.querySelector('p'); return [p, p.childNodes.length]; });
    await page.keyboard.type('끝글');
    expect(await html(page)).toBe(`<p>앞${PIC}끝글</p>`);
    // 화면 DOM 도 같은 모양 (picture 안에 글 없음)
    expect(await page.evaluate(() => window.core.root.querySelector('picture').textContent)).toBe('');
  });

  test('picture 뒤 글 앞에서 Backspace: 글이 picture 안으로 들어가지 않는다', async ({ page }) => {
    await setHTML(page, `<p>앞${PIC}뒤</p>`);
    await place(page, (root) => [root.querySelector('p').lastChild, 0]);
    await page.keyboard.press('Backspace');
    const out = await html(page);
    expect(out).toContain('뒤');
    expect(out).not.toMatch(/뒤<\/picture>/);
    expect(await page.evaluate(() => window.core.root.querySelector('picture')?.textContent ?? '')).toBe('');
  });

  test('getHTML 은 picture 안 img 뒤 글을 picture 뒤로 옮겨 저장한다 (편집 DOM 이 어긋나도)', async ({ page }) => {
    await setHTML(page, `<p>앞${PIC}</p>`);
    await page.evaluate(() => window.core.root.querySelector('picture').append('뒤글'));
    expect(await html(page)).toBe(`<p>앞${PIC}뒤글</p>`);
  });
});

/**
 * 옵션을 준 새 에디터로 모바일 추가·교체를 부른다 — 알림(notify)·경고(console.warn)를 모아 돌려준다
 * @param {object} opts { url: uploadImage 가 돌려줄 주소, media: image.mobileMedia, html, method }
 */
async function withEditor(page, { url, media, html: h = '<p><img src="/a.png" alt="a"></p>', method = 'addMobile' }) {
  return page.evaluate(async ([u, m, hh, meth, b64]) => {
    const host = document.createElement('div');
    document.body.append(host);
    const notes = [];
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    let ed;
    try {
      ed = new window.JM.JmEditor(host, { image: m === undefined ? undefined : { mobileMedia: m }, notify: (t) => notes.push(t), uploadImage: async () => u });
    } finally { console.warn = warn; }
    ed.setHTML(hh);
    const before = ed.getHTML();
    if (u !== undefined) {
      const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'm.png', { type: 'image/png' });
      await ed.image[meth](ed.root.querySelector('img'), file);
    }
    return { before, after: ed.getHTML(), notes, warns, media: ed.image.mobileMedia };
  }, [url, media, h, method, PNG]);
}

test('모바일 추가: 업로드 주소에 공백·쉼표가 있으면 인코딩해 넣는다', async ({ page }) => {
  const r = await withEditor(page, { url: '/up/a b,c.png' });
  expect(r.after).toBe('<p><picture><source media="(max-width: 767px)" srcset="/up/a%20b%2Cc.png"><img src="/a.png" alt="a"></picture></p>');
  expect(r.notes).toEqual([]);
});

test('모바일 추가·교체: 쓸 수 없는 주소(상대 경로)면 알리고 내용은 그대로', async ({ page }) => {
  const r = await withEditor(page, { url: 'up/a.png' });
  expect(r.after).toBe(r.before);
  expect(r.notes.length).toBe(1);
  const pic = '<p><picture><source media="(max-width: 767px)" srcset="/m1.png"><img src="/a.png" alt="a"></picture></p>';
  const r2 = await withEditor(page, { url: 'javascript:x', html: pic, method: 'replaceMobile' });
  expect(r2.after).toBe(pic);
  expect(r2.notes.length).toBe(1);
});

test('옵션 mobileMedia 가 규칙에 어긋나면 기본값 + 경고', async ({ page }) => {
  const r = await withEditor(page, { media: 'screen and url(x)' });
  expect(r.media).toBe('(max-width: 767px)');
  expect(r.warns.length).toBe(1);
  const ok = await withEditor(page, { media: '(max-width: 600px)' });
  expect(ok.media).toBe('(max-width: 600px)');
  expect(ok.warns).toEqual([]);
});
