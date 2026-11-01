/**
 * 재점검 후속 기능 수정: 목록·인용 안 블록 삽입, 파일 드롭, 업로드 실패 안내, save·load, 되돌리기 커서,
 * HTML 보기 이력, 전체 선택 삭제, 붙여넣기 class 정리, destroy, 접근성 속성, 글자 크기·글꼴 버튼 표시
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open, setHTML, html, caret, select, exec, paste, canonical } from './helpers.js';

/** 표만 비교하기 쉽게: 저장 HTML 의 표 내용을 <table/> 로 줄인다 */
const shortTable = (h) => h.replace(/<table[\s\S]*?<\/table>/g, '<table/>');

/**
 * 드롭 이벤트 흉내. 기본 동작이 취소됐으면 true
 * @param {import('@playwright/test').Page} page
 * @param {{selector?: string, files?: Array<{name: string, type: string}>, data?: Record<string,string>}} opts
 */
async function drop(page, { selector = 'p', files = [], data = {} }) {
  return page.evaluate(([sel, fs, d]) => {
    const target = window.core.root.querySelector(sel) || window.core.root;
    const rect = target.getBoundingClientRect();
    const dt = new DataTransfer();
    fs.forEach((f) => dt.items.add(new File(['x'], f.name, { type: f.type })));
    Object.entries(d).forEach(([k, v]) => dt.setData(k, v));
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: rect.left + 2, clientY: rect.top + rect.height / 2 });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, [selector, files, data]);
}

/** 안내 문구를 window.notes 에 모으고 업로드 함수를 넣는다 (fail 이면 거부) */
async function stubUpload(page, fail) {
  await page.evaluate((f) => {
    window.notes = [];
    window.core.options.notify = (m) => window.notes.push(m);
    window.core.options.uploadImage = f ? async () => { throw new Error('서버 오류'); } : async () => '/a.png';
  }, fail);
}

test.describe('1. 목록·인용 안 블록 삽입', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('목록 항목에서 표를 넣으면 목록 뒤', async ({ page }) => {
    await setHTML(page, '<ol><li>하나</li><li>둘</li></ol>');
    await caret(page, 'li', 1);
    await exec(page, 'table', { rows: 1, cols: 1 });
    expect(shortTable(await html(page))).toBe('<ol><li>하나</li><li>둘</li></ol><table/><p><br></p>');
  });

  test('중첩 목록에서도 가장 바깥 목록 뒤', async ({ page }) => {
    await setHTML(page, '<ul><li>가<ul><li>나</li></ul></li><li>다</li></ul>');
    await caret(page, 'ul ul li', 1);
    await exec(page, 'table', { rows: 1, cols: 1 });
    expect(shortTable(await html(page))).toBe('<ul><li>가<ul><li>나</li></ul></li><li>다</li></ul><table/><p><br></p>');
  });

  test('인용 안에서 표를 넣으면 인용 뒤', async ({ page }) => {
    await setHTML(page, '<blockquote>인용</blockquote><p>뒤</p>');
    await caret(page, 'blockquote', 1);
    await exec(page, 'table', { rows: 1, cols: 1 });
    expect(shortTable(await html(page))).toBe('<blockquote>인용</blockquote><table/><p><br></p><p>뒤</p>');
  });

  test('다른 블록(서식)도 같은 기준: 중첩 목록의 바깥 뒤', async ({ page }) => {
    await setHTML(page, '<ul><li>가<ul><li>나</li></ul></li></ul>');
    await caret(page, 'ul ul li', 1);
    await exec(page, 'format', '<h2>서식</h2>');
    expect(await html(page)).toBe('<ul><li>가<ul><li>나</li></ul></li></ul><h2>서식</h2><p><br></p>');
  });

  test('표 안에서 표를 넣으면 그 표 바로 뒤 (서식 삽입과 같은 기준)', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>칸</td></tr></tbody></table><p>끝</p>');
    await caret(page, 'td', 1);
    await exec(page, 'table', { rows: 1, cols: 1 });
    expect(shortTable(await html(page))).toBe('<table/><table/><p><br></p><p>끝</p>');
  });
});

test.describe('2. 파일 드롭', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await setHTML(page, '<p>첫째</p><p id="two">둘째</p><p>셋째</p>');
    await stubUpload(page, false);
  });

  test('이미지는 드롭한 지점의 블록 뒤에 들어간다 (커서 위치가 아니라)', async ({ page }) => {
    await caret(page, 'p', 1); // 커서는 첫째 문단
    expect(await drop(page, { selector: 'p:nth-child(2)', files: [{ name: 'a.png', type: 'image/png' }] })).toBe(true);
    await expect.poll(() => html(page)).toContain('<img');
    const out = await html(page);
    expect(out.indexOf('둘째')).toBeLessThan(out.indexOf('<img'));
    expect(out.indexOf('<img')).toBeLessThan(out.indexOf('셋째'));
  });

  test('이미지가 아닌 파일: 기본 동작을 막고(페이지 이탈 방지) 안내, 내용 그대로', async ({ page }) => {
    const before = await html(page);
    expect(await drop(page, { files: [{ name: 'a.pdf', type: 'application/pdf' }] })).toBe(true);
    expect(await page.evaluate(() => window.notes.length)).toBe(1);
    expect(await html(page)).toBe(before);
  });

  test('외부 HTML 드롭은 막는다', async ({ page }) => {
    const before = await html(page);
    expect(await drop(page, { data: { 'text/html': '<b onclick="x()">외부</b>', 'text/plain': '외부' } })).toBe(true);
    expect(await html(page)).toBe(before);
  });
});

test.describe('3. 업로드 실패 안내', () => {
  test.beforeEach(async ({ page }) => { await open(page); await stubUpload(page, true); });

  const lastNote = (page) => page.evaluate(() => window.notes.at(-1));
  const fileArg = 'new File(["x"], "a.png", { type: "image/png" })';

  test('insertImageFile: 안내, 내용 그대로', async ({ page }) => {
    await setHTML(page, '<p>글</p>');
    const before = await html(page);
    await page.evaluate(`window.core.insertImageFile(${fileArg})`);
    expect(await lastNote(page)).toContain('서버 오류');
    expect(await html(page)).toBe(before);
  });

  test('슬라이드 addFiles: 안내, 내용 그대로', async ({ page }) => {
    await setHTML(page, '<div data-type="slider" data-interval="3000" data-ratio="16:9"><p data-role="title">t</p></div>');
    const before = await html(page);
    await page.evaluate(`window.core.slider.addFiles(window.core.root.querySelector('[data-type=slider]'), [${fileArg}])`);
    expect(await lastNote(page)).toContain('서버 오류');
    expect(await html(page)).toBe(before);
  });

  test('이미지 교체: 안내, 내용 그대로', async ({ page }) => {
    await setHTML(page, '<p><img src="/a.png" alt="a"></p>');
    const before = await html(page);
    await page.evaluate(`window.core.image.replace(window.core.root.querySelector('img'), ${fileArg})`);
    expect(await lastNote(page)).toContain('서버 오류');
    expect(await html(page)).toBe(before);
  });
});

test.describe('4. save·load', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('저장 중 다시 부르면 같은 Promise, POST 는 한 번', async ({ page }) => {
    const r = await page.evaluate(async () => {
      let posts = 0;
      let done;
      window.ed.api = { create: () => { posts++; return new Promise((res) => { done = () => res({ id: 7 }); }); } };
      const a = window.ed.save();
      const b = window.ed.save();
      const same = a === b;
      await Promise.resolve();
      done();
      await a;
      // 끝난 뒤의 저장은 새 요청 (id 가 생겨 update)
      window.ed.api.update = async () => { posts++; return { id: 7 }; };
      await window.ed.save();
      return { same, posts };
    });
    expect(r).toEqual({ same: true, posts: 2 });
  });

  test('저장 실패 뒤에는 다시 저장할 수 있다', async ({ page }) => {
    const r = await page.evaluate(async () => {
      let n = 0;
      window.ed.api = { create: async () => { if (++n === 1) throw new Error('x'); return { id: 1 }; } };
      const first = await window.ed.save().catch((e) => e.message);
      const second = await window.ed.save();
      return { first, id: second.id };
    });
    expect(r).toEqual({ first: 'x', id: 1 });
  });

  test('load 실패: onError 로 전달, 처리되지 않은 거부 없음', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const rejected = [];
      window.addEventListener('unhandledrejection', (e) => rejected.push(String(e.reason)));
      const api = new window.JM.JmEditorApi({ baseUrl: '/x' });
      api.get = async () => { throw new Error('없음'); };
      const errs = [];
      const box = document.createElement('div');
      document.body.appendChild(box);
      const ed = new window.JM.JmToolbarEditor(box, { api, contentId: 1, onError: (e) => errs.push(e.message) });
      await new Promise((res) => setTimeout(res, 50));
      const direct = await ed.load(2);
      await new Promise((res) => setTimeout(res, 50));
      return { errs, rejected, direct: direct ?? null };
    });
    expect(r).toEqual({ errs: ['없음', '없음'], rejected: [], direct: null });
  });

  test('load 실패에 onError 가 없으면 notify', async ({ page }) => {
    const notes = await page.evaluate(async () => {
      const api = new window.JM.JmEditorApi({ baseUrl: '/x' });
      api.get = async () => { throw new Error('없음'); };
      const out = [];
      const box = document.createElement('div');
      document.body.appendChild(box);
      const ed = new window.JM.JmToolbarEditor(box, { api, notify: (m) => out.push(m) });
      await ed.load(1);
      return out;
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('없음');
  });
});

test.describe('5. 되돌리기·HTML 모드', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('되돌리기 뒤 커서는 고치던 자리에 (문서 끝으로 튀지 않음)', async ({ page }) => {
    await setHTML(page, '<p>가나</p><p>다라</p><p>마바</p>');
    await caret(page, 'p', -1);
    await page.keyboard.type('X');
    expect(await html(page)).toBe('<p>가나X</p><p>다라</p><p>마바</p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>가나</p><p>다라</p><p>마바</p>');
    await page.keyboard.type('Y');
    expect(await html(page)).toBe('<p>가나Y</p><p>다라</p><p>마바</p>');
  });

  test('다시 실행 뒤에도 같은 자리, 문단 중간 오프셋 유지', async ({ page }) => {
    await setHTML(page, '<p>가<strong>나다</strong>라</p><p>끝</p>');
    await caret(page, 'strong', 1);
    await page.keyboard.type('X');
    await page.evaluate(() => new Promise(requestAnimationFrame)); // selectionchange 가 지나가게
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.keyboard.type('Y');
    expect(await html(page)).toBe('<p>가<strong>나YX다</strong>라</p><p>끝</p>'); // 되돌리기·다시 실행 모두 변경 시작점
  });

  test('블록이 사라지는 되돌리기도 오류 없이 커서를 둔다', async ({ page }) => {
    await setHTML(page, '<p>가</p>');
    await caret(page, 'p', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('나');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.type('다');
    expect(await html(page)).toContain('다');
  });

  test('HTML 보기 왕복: 이전 이력이 남고, 소스 편집도 한 단계로 되돌린다', async ({ page }) => {
    await setHTML(page, '<p>원본</p>');
    await caret(page, 'p', -1);
    await page.keyboard.type('A');
    await page.evaluate(() => {
      window.ed.setMode('html');
      window.ed.source.value = '<p>소스</p>';
      window.ed.setMode('editor');
    });
    expect(await html(page)).toBe('<p>소스</p>');
    await exec(page, 'undo');
    expect(await html(page)).toBe('<p>원본A</p>');
    await exec(page, 'undo');
    expect(await html(page)).toBe('<p>원본</p>');
    await exec(page, 'redo');
    await exec(page, 'redo');
    expect(await html(page)).toBe('<p>소스</p>');
  });

  test('HTML 보기를 고치지 않고 왕복하면 되돌리기 단계가 늘지 않는다', async ({ page }) => {
    await setHTML(page, '<ul><li>가</li></ul><p>나</p>');
    await caret(page, 'p', -1);
    await page.keyboard.type('A');
    await exec(page, 'undo'); // 위 입력을 지움 → 빈 스택
    await page.evaluate(() => { window.ed.setMode('html'); window.ed.setMode('editor'); });
    expect(await page.evaluate(() => window.core.history.undoStack.length)).toBe(0);
    expect(await html(page)).toBe('<ul><li>가</li></ul><p>나</p>');
  });

  test('외부 setHTML 은 지금처럼 이력을 새로 시작한다', async ({ page }) => {
    await setHTML(page, '<p>가</p>');
    await caret(page, 'p', -1);
    await page.keyboard.type('A');
    await setHTML(page, '<p>새 글</p>');
    await exec(page, 'undo');
    expect(await html(page)).toBe('<p>새 글</p>');
  });
});

test.describe('6. 전체 선택 후 삭제 (구조 모드)', () => {
  test.beforeEach(async ({ page }) => { await open(page, '?structure=1'); });

  const blocks = [
    '<table><tbody><tr><td>칸</td></tr></tbody></table>',
    '<div data-type="gallery" data-layout="justify"><p data-role="title">갤러리</p></div>',
    '<div data-type="youtube" data-width="100" data-align="center"><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="v"></iframe></div>',
    '<div data-type="slider" data-interval="3000" data-ratio="16:9"><p data-role="title">슬라이드</p></div>',
    '<div data-type="buttons" data-align="center"><a href="https://a.example" data-role="button" data-style="primary">버튼</a></div>',
    '<div data-type="layout" data-preset="side"><div data-cell="text"><p>글</p></div></div>',
    '<div data-type="map" data-ratio="16:9"></div>',
  ].join('');

  test('플러그인 블록은 지우고 구조 컨테이너는 글만 비운다', async ({ page }) => {
    await page.route(/youtube-nocookie/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await setHTML(page, `<section class="s"><p>본문</p></section>${blocks}<p>끝</p>`);
    await page.locator('.jm-editor section p').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    const out = await html(page);
    expect(out).toContain('<section class="s"><p><br></p></section>');
    expect(out).not.toMatch(/<table|data-type|본문|끝/);
    expect(await page.evaluate(() => window.core.root.querySelector('[class*="-layer"]'))).toBeNull();
  });

  test('문서 맨 앞이 표여도 지운다, 이어서 입력할 수 있고 되돌리면 복원된다', async ({ page }) => {
    const src = '<table><tbody><tr><td>칸</td></tr></tbody></table><section class="s"><p>본문</p></section>';
    await setHTML(page, src);
    await page.locator('.jm-editor section p').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<section class="s"><p><br></p></section>');
    await page.keyboard.type('새');
    expect(await html(page)).toContain('새');
    await exec(page, 'undo');
    await exec(page, 'undo');
    expect(await html(page)).toContain('<table');
  });

  test('구조 컨테이너 안의 블록이 지워져 비면 빈 문단이 남는다', async ({ page }) => {
    await setHTML(page, '<section class="s"><table><tbody><tr><td>칸</td></tr></tbody></table></section><section class="t"><p>본문</p></section>');
    await page.locator('.jm-editor section.t p').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<section class="s"><p><br></p></section><section class="t"><p><br></p></section>');
  });

  test('일부만 걸친 표는 지우지 않는다', async ({ page }) => {
    await setHTML(page, '<section class="a"><p>A1</p></section><table><tbody><tr><td>칸가</td><td>칸나</td></tr></tbody></table>');
    await page.evaluate(() => {
      const r = document.createRange();
      r.setStart(window.core.root.querySelector('p').firstChild, 1);
      r.setEnd(window.core.root.querySelector('td').firstChild, 1);
      window.core.root.focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.keyboard.press('Backspace');
    expect(await html(page)).toContain('<table');
  });

  test('셀 안 전체 선택 후 삭제는 표를 남긴다', async ({ page }) => {
    await setHTML(page, '<section class="a"><p>A</p></section><table><tbody><tr><td>칸가</td><td>칸나</td></tr></tbody></table>');
    await page.locator('.jm-editor td').first().click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    expect(await html(page)).toContain('칸나');
  });
});

test.describe('7. 붙여넣기 class 정리', () => {
  const dirty = '<p class="MsoNormal keep Apple-style-span font5 xl65">글</p><h2 class="xl1">제목</h2>';

  test('붙여넣기: 오피스·애플 class 토큰만 빠진다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<p>기존</p>');
    await caret(page, 'p', -1);
    await paste(page, { htmlData: dirty.replace('<p ', '<p style="mso-x:1" ') });
    const out = await html(page);
    expect(out).toContain('<p class="keep">글</p>');
    expect(out).toContain('<h2>제목</h2>');
  });

  test('setHTML 은 그대로 둔다', async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, dirty);
    expect(await html(page)).toBe(dirty);
  });

  test('HTML 보기도 그대로 둔다', async ({ page }) => {
    await open(page, '?structure=1');
    await page.evaluate((h) => { window.ed.setMode('html'); window.ed.source.value = h; window.ed.setMode('editor'); }, dirty);
    expect(await html(page)).toBe(dirty);
  });
});

test.describe('8. 작은 수정', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('아이콘 버튼 title 은 tip, tip 이 없으면 label', async ({ page }) => {
    const title = (cmd) => page.locator(`.jm-btn[data-cmd="${cmd}"]`).getAttribute('title');
    expect(await title('undo')).toBe('실행 취소 (Ctrl+Z)');
    expect(await title('quote')).toBe('인용 (스타일 선택)');
    expect(await title('table')).toBe('표 삽입');
    expect(await title('youtube')).toBe('유튜브');
  });

  test('굵게 토글 후 입력 없이 저장하면 빈 태그가 없다', async ({ page }) => {
    await setHTML(page, '<p>글</p>');
    await caret(page, 'p', -1);
    await exec(page, 'bold');
    await exec(page, 'italic');
    expect(await html(page)).toBe('<p>글</p>');
    await page.keyboard.type('굵');
    expect(await html(page)).toBe('<p>글<strong><em>굵</em></strong></p>');
  });

  test('destroy: 편집 속성·클래스·타이머·툴바 DOM 을 지운다', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const box = document.createElement('div');
      document.body.appendChild(box);
      const changes = [];
      const ed = new window.JM.JmToolbarEditor(box, { placeholder: '입력', onChange: (h) => changes.push(h) });
      const root = ed.editor.root;
      root.innerHTML = '<p>글</p>';
      ed.editor.history.pushDebounced(10);
      const history = ed.editor.history;
      const before = history.undoStack.length;
      ed.destroy();
      await new Promise((res) => setTimeout(res, 40));
      return {
        editable: root.hasAttribute('contenteditable'),
        cls: root.className,
        role: root.getAttribute('role'),
        placeholder: root.dataset.placeholder ?? null,
        pushed: history.undoStack.length - before,
        boxChildren: box.children.length,
        boxCls: box.classList.contains('jm-container'),
      };
    });
    expect(r).toEqual({ editable: false, cls: '', role: null, placeholder: null, pushed: 0, boxChildren: 0, boxCls: false });
  });

  test('코어 단독 destroy 뒤에도 root 내용은 남고 편집은 꺼진다', async ({ page }) => {
    const r = await page.evaluate(() => {
      const wrap = document.createElement('div');
      const el = document.createElement('div');
      wrap.appendChild(el);
      document.body.appendChild(wrap);
      const core = new window.JM.JmEditor(el, {});
      core.setHTML('<p>글</p>');
      core.destroy();
      return { html: core.getHTML(), editable: el.isContentEditable, gap: wrap.querySelector('.jm-gap') };
    });
    expect(r).toEqual({ html: '<p>글</p>', editable: false, gap: null });
  });

  test('표만 있는 문서를 넣으면 뒤에 커서 둘 문단이 생긴다, 다시 넣어도 늘지 않는다', async ({ page }) => {
    await setHTML(page, '<table><tbody><tr><td>칸</td></tr></tbody></table>');
    expect(await page.locator('.jm-editor > p').count()).toBe(1);
    await page.evaluate(() => window.ed.setHTML(window.ed.getHTML()));
    expect(await page.locator('.jm-editor > p').count()).toBe(1);
  });
});

test.describe('9. 접근성 기본 속성', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  test('툴바 role·aria-label, 편집 영역 role·aria-multiline·aria-label', async ({ page }) => {
    for (const bar of await page.locator('.jm-toolbar').all()) {
      await expect(bar).toHaveAttribute('role', 'toolbar');
      expect(await bar.getAttribute('aria-label')).toBeTruthy();
    }
    const root = page.locator('.jm-editor');
    await expect(root).toHaveAttribute('role', 'textbox');
    await expect(root).toHaveAttribute('aria-multiline', 'true');
    await expect(root).toHaveAttribute('aria-label', '내용을 입력하세요');
  });

  test('토글 버튼 aria-pressed 가 상태를 따른다, 모드 버튼도', async ({ page }) => {
    const bold = page.locator('.jm-btn[data-cmd="bold"]');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await setHTML(page, '<p><strong>굵</strong>보통</p>');
    await caret(page, 'strong', 1);
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await caret(page, 'p', 1, 1);
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-cmd="modeEditor"]')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.ed.setMode('html'));
    await expect(page.locator('[data-cmd="modeHtml"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-cmd="modeEditor"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('저장 HTML 에 새 속성이 섞이지 않는다', async ({ page }) => {
    await setHTML(page, '<p>글</p>');
    expect(await html(page)).toBe('<p>글</p>');
  });
});

test.describe('12. 글꼴·글자 크기·줄 높이·자간 보존', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  const families = ['Roboto', '한컴바탕', 'Apple SD Gothic Neo', 'Helvetica Neue'];
  for (const f of families) {
    test(`기본 글꼴 ${f} 가 남는다`, async ({ page }) => {
      await setHTML(page, `<p style="font-family:'${f}'">a</p>`);
      expect(await html(page)).toContain(f);
    });
  }

  test('HelveticaNeue 는 Helvetica Neue 로, 툴바 목록에도 있다', async ({ page }) => {
    await setHTML(page, '<p style="font-family:HelveticaNeue,sans-serif">a</p>');
    expect(await page.locator('.jm-editor p').evaluate((el) => el.style.fontFamily)).toContain('Helvetica Neue');
    expect(await page.evaluate(() => window.core.fontFamilies)).toEqual(expect.arrayContaining(families));
  });

  test('줄 높이·자간을 지닌 span 이 입력 뒤에도 벗겨지지 않는다', async ({ page }) => {
    await setHTML(page, '<p><span style="line-height:1.5;letter-spacing:0.5px">글</span></p>');
    await caret(page, 'span', 1);
    await page.keyboard.type('자');
    expect(await html(page)).toBe('<p><span style="line-height: 1.5; letter-spacing: 0.5px">글자</span></p>');
  });
});

test.describe('13. 셀 테두리 얇은 폭', () => {
  test('0.50pt 는 0.67px 로 남고 실제 표에서 폭이 0 이 아니다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<table><tbody><tr><td style="border-top:solid #000000 0.50pt">칸</td></tr></tbody></table>');
    expect(await html(page)).toContain('border-top: 0.67px solid #000000');
    const w = await page.locator('.jm-editor td').evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(w).toBeGreaterThan(0);
  });
});

test.describe('11. 글자 크기·글꼴 버튼 표시', () => {
  const label = (page, cmd) => page.locator(`.jm-btn[data-cmd="${cmd}"] .jm-btn-select-label`);

  test.beforeEach(async ({ page }) => { await open(page); });

  test('처음부터 실제 크기·글꼴을 보여 준다, 제목은 지금처럼 본문', async ({ page }) => {
    await expect(label(page, 'fontSize')).toHaveText(/^\d+px$/);
    await expect(label(page, 'fontFamily')).not.toHaveText('글꼴');
    await expect(label(page, 'heading')).toHaveText('본문');
  });

  test('값이 없는 글자는 사이트 CSS 의 크기·글꼴을 보여 준다', async ({ page }) => {
    await page.evaluate(() => { window.core.root.style.fontSize = '17px'; window.core.root.style.fontFamily = 'Arial'; });
    await setHTML(page, '<p>보통</p>');
    await caret(page, 'p', 1);
    await expect(label(page, 'fontSize')).toHaveText('17px');
    await expect(label(page, 'fontFamily')).toHaveText('Arial');
  });

  test('목록에 기본 항목이 없고, 현재 값이 선택되어 있다', async ({ page }) => {
    await page.evaluate(() => { window.core.root.style.fontSize = '17px'; window.core.root.style.fontFamily = 'Arial'; });
    await setHTML(page, '<p>보통</p>');
    await caret(page, 'p', 1);
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    const items = page.locator('.jm-listmenu .jm-ctxmenu-item');
    await expect(items.filter({ hasText: '기본' })).toHaveCount(0);
    const texts = await items.allTextContents();
    expect(texts.map((t) => parseInt(t, 10))).toEqual([...texts.map((t) => parseInt(t, 10))].sort((x, y) => x - y)); // 17px 도 순서대로
    await expect(page.getByRole('menuitemradio', { name: '17px', checked: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    await expect(items.filter({ hasText: '기본' })).toHaveCount(0);
    await expect(page.getByRole('menuitemradio', { name: 'Arial', exact: true, checked: true })).toBeVisible();
  });

  test('지정 안 했을 때의 값을 고르면 지정을 해제한다 (기본값을 저장하지 않음)', async ({ page }) => {
    await page.evaluate(() => { window.core.root.style.fontSize = '16px'; window.core.root.style.fontFamily = 'Arial'; });
    await setHTML(page, '<p><span style="font-size:24px;font-family:바탕">글자</span></p>');
    await select(page, 'span', 0, 2);
    await expect(label(page, 'fontSize')).toHaveText('24px');
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await page.getByRole('menuitemradio', { name: '16px', exact: true }).click();
    expect(await html(page)).not.toContain('font-size');
    await expect(label(page, 'fontSize')).toHaveText('16px');
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    await page.getByRole('menuitemradio', { name: 'Arial', exact: true }).click();
    expect(await html(page)).not.toContain('font-family');
    await expect(label(page, 'fontFamily')).toHaveText('Arial');
  });

  test('다른 값을 고르면 지금처럼 지정된다', async ({ page }) => {
    await setHTML(page, '<p>글자</p>');
    await select(page, 'p', 0, 2);
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await page.getByRole('menuitemradio', { name: '28px', exact: true }).click();
    expect(await html(page)).toContain('font-size: 28px');
  });

  test('제목 안에서는 제목 크기를 보여 주고, 그 크기를 고르면 지정을 지운다', async ({ page }) => {
    await setHTML(page, '<h1><span style="font-size:14px">제목</span></h1>');
    const size = await page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.querySelector('.jm-editor h1')).fontSize)) + 'px');
    await select(page, 'span', 0, 2);
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await page.getByRole('menuitemradio', { name: size, exact: true }).click();
    expect(await html(page)).not.toContain('font-size');
    await expect(label(page, 'fontSize')).toHaveText(size);
  });

  test('목록에 없는 사이트 글꼴도 표시·선택되고, 알 수 없으면 브라우저 글꼴', async ({ page }) => {
    await page.evaluate(() => { window.core.root.style.fontFamily = 'Verdana, sans-serif'; });
    await setHTML(page, '<p><span style="font-family:바탕">글자</span></p>');
    await select(page, 'span', 0, 2);
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    await page.getByRole('menuitemradio', { name: 'Verdana', exact: true }).click();
    expect(await html(page)).not.toContain('font-family');
    await expect(label(page, 'fontFamily')).toHaveText('Verdana');
    await page.evaluate(() => { window.core.root.style.fontFamily = 'serif'; });
    await setHTML(page, '<p><span style="font-family:바탕">글자</span></p>');
    await select(page, 'span', 0, 2);
    await page.locator('.jm-btn[data-cmd="fontFamily"]').click();
    await page.getByRole('menuitemradio', { name: '브라우저 글꼴', exact: true }).click();
    expect(await html(page)).not.toContain('font-family');
    await expect(label(page, 'fontFamily')).toHaveText('브라우저 글꼴');
  });

  test('제목 목록은 큰 글자부터: 제목 1 → 본문', async ({ page }) => {
    await page.locator('.jm-btn[data-cmd="heading"]').click();
    expect(await page.locator('.jm-listmenu .jm-ctxmenu-item').allTextContents()).toEqual(['제목 1', '제목 2', '제목 3', '제목 4', '제목 5', '제목 6', '본문']);
  });

  for (const q of ['?structure=0', '?structure=1']) {
    test(`제목 4~6: 적용·표시·저장, 본문으로 복귀, 크기는 내림차순 ${q}`, async ({ page }) => {
      await open(page, q);
      const sizes = [];
      for (const n of [1, 2, 3, 4, 5, 6]) {
        await setHTML(page, '<p>글자</p>');
        await caret(page, 'p', 1);
        await page.locator('.jm-btn[data-cmd="heading"]').click();
        await page.getByRole('menuitemradio', { name: `제목 ${n}`, exact: true }).click();
        await expect(label(page, 'heading')).toHaveText(`제목 ${n}`);
        expect(await html(page)).toBe(`<h${n}>글자</h${n}>`);
        sizes.push(await page.locator(`.jm-editor h${n}`).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)));
      }
      const body = await page.evaluate(() => parseFloat(getComputedStyle(window.core.root).fontSize));
      sizes.forEach((v, i) => { if (i) expect(v).toBeLessThan(sizes[i - 1]); });
      expect(sizes[5]).toBeGreaterThanOrEqual(body);
      await page.locator('.jm-btn[data-cmd="heading"]').click();
      await page.getByRole('menuitemradio', { name: '본문', exact: true }).click();
      expect(await html(page)).toBe('<p>글자</p>');
    });
  }

  test('제목 5 끝 Enter 는 문단, 다시 정제해도 유지', async ({ page }) => {
    await setHTML(page, '<h5 style="text-align:center">제목</h5>');
    expect(await html(page)).toContain('<h5 style="text-align: center">');
    await caret(page, 'h5', -1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('본문');
    expect(await html(page)).toContain('</h5><p>본문</p>');
  });

  test('지정된 글자에 커서를 두면 그 값', async ({ page }) => {
    await setHTML(page, '<p><span style="font-size:14px;font-family:\'맑은 고딕\'">글자</span></p>');
    await caret(page, 'span', 1);
    await expect(label(page, 'fontSize')).toHaveText('14px');
    await expect(label(page, 'fontFamily')).toHaveText('맑은 고딕');
  });

  test('긴 글꼴 이름은 말줄임으로 버튼 폭을 넘지 않는다', async ({ page }) => {
    await setHTML(page, '<p><span style="font-family:\'Times New Roman\'">글자</span></p>');
    await caret(page, 'span', 1);
    const el = label(page, 'fontFamily');
    await expect(el).toHaveText('Times New Roman');
    const m = await el.evaluate((n) => ({ w: n.clientWidth, sw: n.scrollWidth, ov: getComputedStyle(n).textOverflow }));
    expect(m.ov).toBe('ellipsis');
    expect(m.w).toBeLessThanOrEqual(84);
  });

  test('없는 글꼴은 건너뛰고 실제 적용되는 글꼴을 표시, 저장 내용은 그대로', async ({ page }) => {
    await page.evaluate(() => { window.core.root.style.fontFamily = '"없는글꼴테스트", Arial, sans-serif'; });
    await setHTML(page, '<p>글</p>');
    await caret(page, 'p', 1);
    await expect(label(page, 'fontFamily')).toHaveText('Arial');
    expect(await html(page)).not.toContain('font-family');
  });

  test('데모 툴바도 기본 항목 없이 실제 값 표시', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.jm-btn[data-cmd="fontSize"] .jm-btn-select-label')).toHaveText(/^\d+px$/);
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await expect(page.locator('.jm-listmenu .jm-ctxmenu-item').filter({ hasText: '기본' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const size = await page.locator('.jm-btn[data-cmd="fontSize"] .jm-btn-select-label').textContent();
    const pick = size === '28px' ? '32px' : '28px';
    await page.evaluate(() => { const root = document.querySelector('.jm-editor'); root.innerHTML = '<p>글자</p>'; root.focus(); getSelection().selectAllChildren(root.firstChild); });
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await page.getByRole('menuitemradio', { name: pick, exact: true }).click();
    await expect(page.locator('.jm-editor p span')).toHaveCSS('font-size', pick);
    await page.locator('.jm-btn[data-cmd="fontSize"]').click();
    await page.getByRole('menuitemradio', { name: size, exact: true }).click();
    await expect(page.locator('.jm-editor p span[style*="font-size"]')).toHaveCount(0);
  });

  test('데모 툴바도 같은 표시·접근성 속성', async ({ page }) => {
    await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
    await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.jm-btn[data-cmd="fontSize"] .jm-btn-select-label')).toHaveText(/^\d+px$/);
    await expect(page.locator('.jm-btn[data-cmd="fontFamily"] .jm-btn-select-label')).not.toHaveText('글꼴');
    await expect(page.locator('#toolbar')).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('.jm-btn[data-cmd="bold"]')).toHaveAttribute('aria-pressed', /true|false/);
    await expect(page.locator('.jm-btn[data-cmd="undo"]')).toHaveAttribute('title', '실행 취소 (Ctrl+Z)');
  });
});

test.describe('리뷰 수정: 전체 선택', () => {
  const T = '<table><tbody><tr><td>칸</td></tr></tbody></table>';
  const Y = '<div data-type="youtube" data-width="100" data-align="center"><iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="v"></iframe></div>';
  const selectAllKey = async (page) => { await page.locator('.jm-editor').focus(); await page.keyboard.press('ControlOrMeta+a'); };
  const marked = (page) => page.locator('.jm-all-selected').count();

  test.beforeEach(async ({ page }) => {
    await page.route(/youtube-nocookie/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
    await open(page, '?structure=1');
  });

  test('앞뒤 블록에 선택 표시, 저장 HTML 에는 없고 커서를 옮기면 해제', async ({ page }) => {
    await setHTML(page, `${T}<p>x</p>${T}`);
    await caret(page, 'p', 1);
    await selectAllKey(page);
    expect(await marked(page)).toBe(2);
    expect(await html(page)).not.toContain('jm-all-selected');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => marked(page)).toBe(0);
  });

  test('표·유튜브 혼합: 지우고 되돌리면 복구', async ({ page }) => {
    const src = `${T}<p>x</p>${Y}`;
    await setHTML(page, src);
    const before = await html(page);
    await caret(page, 'p', 1);
    await selectAllKey(page);
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe('<p><br></p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe(before);
  });

  test('복사는 블록까지 전체 HTML, 잘라내기는 지운다', async ({ page }) => {
    await setHTML(page, `${T}<p>x</p>${T}`);
    await caret(page, 'p', 1);
    await selectAllKey(page);
    const fire = (type) => page.evaluate((t) => {
      const dt = new DataTransfer();
      const ev = new ClipboardEvent(t, { clipboardData: dt, bubbles: true, cancelable: true });
      window.core.root.dispatchEvent(ev);
      return { h: dt.getData('text/html'), t: dt.getData('text/plain'), p: ev.defaultPrevented };
    }, type);
    const c = await fire('copy');
    expect(c.p).toBe(true);
    expect(c.h.match(/<table/g)).toHaveLength(2);
    expect(c.t).toContain('x');
    const x = await fire('cut');
    expect(x.h.match(/<table/g)).toHaveLength(2);
    expect(await html(page)).toBe('<p><br></p>');
  });

  for (const q of ['?structure=1', '?structure=0']) {
    test(`블록만 있는 문서 ${q}: Backspace·Delete 가 지운다`, async ({ page }) => {
      await open(page, q);
      for (const key of ['Backspace', 'Delete']) {
        await setHTML(page, Y);
        await selectAllKey(page);
        await page.keyboard.press(key);
        expect(await html(page)).toBe('<p><br></p>');
      }
    });

    test(`입력·붙여넣기로 대체해도 양끝 블록까지 ${q}`, async ({ page }) => {
      await open(page, q);
      await setHTML(page, `${T}<p>x</p>${T}`);
      await caret(page, 'p', 1);
      await selectAllKey(page);
      await page.keyboard.type('새');
      expect(await html(page)).toBe('<p>새</p>');
      await setHTML(page, `${T}<p>x</p>${T}`);
      await caret(page, 'p', 1);
      await selectAllKey(page);
      await paste(page, { text: '붙임' });
      expect(await html(page)).toBe('<p>붙임<br></p>'.replace('<br>', ''));
    });
  }

  test('구조 안 유튜브만: 지우고 구조는 남는다', async ({ page }) => {
    await setHTML(page, `<section class="s">${Y}</section>`);
    await selectAllKey(page);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe('<section class="s"><p><br></p></section>');
  });
});

test.describe('리뷰 수정: 자동 문단', () => {
  const T = '<table><tbody><tr><td>칸</td></tr></tbody></table>';
  test('불러오기만 하면 저장 내용이 그대로, 글을 입력하면 일반 문단', async ({ page }) => {
    await open(page);
    await setHTML(page, T);
    expect(await html(page)).toBe(T);
    expect(await page.locator('.jm-editor > p').count()).toBe(1);
    await page.locator('.jm-editor > p').click();
    await page.keyboard.type('글');
    expect(await html(page)).toBe(`${T}<p>글</p>`);
  });
});

test.describe('리뷰 수정: 되돌리기 커서', () => {
  /** 커서의 블록 번호·블록 안 글자 수 */
  const pos = (page) => page.evaluate(() => {
    const r = getSelection().getRangeAt(0);
    const b = window.core.sel.getBlock();
    const pre = document.createRange();
    pre.setStart(b, 0); pre.setEnd(r.startContainer, r.startOffset);
    return [Array.from(window.core.root.children).indexOf(b), pre.toString().length];
  });
  const settle = (page) => page.evaluate(() => new Promise(requestAnimationFrame));

  test.beforeEach(async ({ page }) => { await open(page); });

  test('중간 입력 되돌리기: 입력한 자리', async ({ page }) => {
    await setHTML(page, '<p>가나다라마바</p>');
    await caret(page, 'p', 3);
    await page.keyboard.type('XYZ');
    await settle(page);
    await exec(page, 'undo');
    expect(await pos(page)).toEqual([0, 3]);
    await exec(page, 'redo');
    expect(await pos(page)).toEqual([0, 3]);
  });

  test('지움 되돌리기: 지운 자리', async ({ page }) => {
    await setHTML(page, '<p>가나다라마바</p>');
    await caret(page, 'p', 3);
    await page.keyboard.press('Delete');
    await settle(page);
    await exec(page, 'undo');
    expect(await pos(page)).toEqual([0, 3]);
  });

  test('Enter 되돌리기: 앞 문단의 나눈 자리', async ({ page }) => {
    await setHTML(page, '<p>가나다라</p>');
    await caret(page, 'p', 2);
    await page.keyboard.press('Enter');
    await settle(page);
    await exec(page, 'undo');
    expect(await pos(page)).toEqual([0, 2]);
  });

  test('글이 같은 되돌리기(서식)는 커서 글자 위치 유지', async ({ page }) => {
    await setHTML(page, '<p>가나</p><p>다라</p>');
    await select(page, 'p:nth-child(1)', 0, 1);
    await exec(page, 'bold');
    await settle(page);
    await exec(page, 'undo');
    expect((await pos(page))[0]).toBe(0);
  });
});

test.describe('리뷰 수정: 붙여넣기 class 는 오피스 흔적이 있을 때만', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '?structure=1');
    await setHTML(page, '<p>기존</p>');
    await caret(page, 'p', -1);
  });

  test('퍼블 class font14·xl12 는 남고, Mso·Apple 은 항상 빠진다', async ({ page }) => {
    await paste(page, { htmlData: '<p class="font14 xl12 MsoNormal Apple-span">글</p>' });
    expect(await html(page)).toContain('<p class="font14 xl12">글</p>');
  });

  for (const mark of ['style="mso-x:1"', 'xmlns:o="urn:schemas-microsoft-com:office:office"', '<meta name=ProgId content=Excel.Sheet>']) {
    test(`오피스 흔적 ${mark.slice(0, 16)} 이면 xl·font 도 빠진다`, async ({ page }) => {
      const src = mark.startsWith('<meta') ? `${mark}<p class="font14 xl12 keep">글</p>` : mark.startsWith('xmlns') ? `<html ${mark}><body><p class="font14 xl12 keep">글</p></body></html>` : `<p ${mark} class="font14 xl12 keep">글</p>`;
      await paste(page, { htmlData: src });
      expect(await html(page)).toContain('<p class="keep">글</p>');
    });
  }
});

test.describe('리뷰 수정: 드롭 지점 보관', () => {
  test.beforeEach(async ({ page }) => { await open(page); });

  /** 업로드를 끝낼 함수 window.finish 를 두고 그 사이 커서를 옮길 수 있게 한다 */
  const deferUpload = (page) => page.evaluate(() => {
    window.notes = [];
    window.core.options.notify = (m) => window.notes.push(m);
    window.core.options.uploadImage = () => new Promise((res) => { window.finish = () => res('/a.png'); });
  });

  test('업로드 중 커서를 옮겨도 드롭한 자리에 들어간다', async ({ page }) => {
    await setHTML(page, '<p>첫째</p><p>둘째</p><p>셋째</p>');
    await deferUpload(page);
    await drop(page, { selector: 'p:nth-child(2)', files: [{ name: 'a.png', type: 'image/png' }] });
    await caret(page, 'p:nth-child(3)', 1);
    await page.waitForFunction(() => window.finish);
    await page.evaluate(() => window.finish());
    await expect.poll(() => html(page)).toContain('<img');
    const out = await html(page);
    expect(out.indexOf('<img')).toBeLessThan(out.indexOf('셋째'));
    expect(out.indexOf('둘째')).toBeLessThan(out.indexOf('<img'));
  });

  test('긴 문단 중간에 놓으면 문단을 나눠 그 지점에', async ({ page }) => {
    await setHTML(page, '<p>가나다라마바</p>');
    await deferUpload(page);
    const done = await page.evaluate(() => {
      // 좌표로 글 가운데 지점을 찾는다
      const t = window.core.root.querySelector('p').firstChild;
      const r = document.createRange(); r.setStart(t, 3); r.setEnd(t, 4);
      const b = r.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      window.core.root.querySelector('p').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: b.left + 1, clientY: b.top + b.height / 2 }));
      return true;
    });
    expect(done).toBe(true);
    await page.waitForFunction(() => window.finish);
    await page.evaluate(() => window.finish());
    await expect.poll(() => html(page)).toContain('<img');
    expect((await html(page)).replace(/<img[^>]*>/, '<img>')).toBe('<p>가나다</p><p><img></p><p>라마바</p>');
  });
});

test.describe('리뷰 수정: 코어 destroy·픽스처 회귀', () => {
  test('코어 destroy 후 root 에 편집 표시·핸들이 없다', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const wrap = document.createElement('div');
      const el = document.createElement('div');
      wrap.appendChild(el);
      document.body.appendChild(wrap);
      const core = new window.JM.JmEditor(el, {});
      core.setHTML('<table><tbody><tr><td>칸</td></tr></tbody></table><p>글</p>');
      core.destroy();
      return { ce: el.querySelector('[contenteditable]'), handle: el.querySelector('.jm-block-handle'), table: !!el.querySelector('table') };
    });
    expect(r).toEqual({ ce: null, handle: null, table: true });
  });

  for (const f of fs.readdirSync('test/fixtures/publisher').filter((n) => n.endsWith('.html'))) {
    test(`픽스처 ${f}: 입력·Enter 뒤에도 입력 부분 외 class·구조 그대로`, async ({ page }) => {
      await open(page, '?structure=1');
      await setHTML(page, fs.readFileSync(`test/fixtures/publisher/${f}`, 'utf8'));
      const before = await canonical(page);
      const count = () => page.evaluate(() => {
        const tpl = document.createElement('template');
        tpl.innerHTML = window.ed.getHTML();
        const m = {};
        tpl.content.querySelectorAll('*').forEach((el) => { const k = `${el.tagName}.${el.getAttribute('class') || ''}`; m[k] = (m[k] || 0) + 1; });
        return m;
      });
      const base = await count();
      const sel = await page.evaluate(() => {
        const list = Array.from(window.core.root.querySelectorAll('p, h2, h3, dd, li'));
        const el = list.find((e) => e.isContentEditable && e.textContent.trim() && !e.closest('td,th'));
        el?.setAttribute('data-pick', '1');
        return !!el;
      });
      expect(sel).toBe(true);
      await caret(page, '[data-pick]', -1);
      await page.evaluate(() => window.core.root.querySelector('[data-pick]').removeAttribute('data-pick'));
      await page.keyboard.type('뷁');
      expect((await canonical(page)).replace('뷁', '')).toBe(before);
      await page.keyboard.press('Enter');
      const after = await count();
      let added = 0;
      for (const [k, n] of Object.entries(after)) added += Math.max(0, n - (base[k] || 0));
      for (const [k, n] of Object.entries(base)) expect(after[k] ?? 0, k).toBeGreaterThanOrEqual(n);
      expect(added).toBeLessThanOrEqual(2);
    });
  }
});
