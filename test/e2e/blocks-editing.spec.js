/**
 * 단계 0 회귀 테스트 (블록 안 편집) — 표 셀·갤러리 제목·배치 글 칸·블록 헤더 입력란·전체 삭제·단락 추가 줄
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html, caret, exec } from './helpers.js';

test.beforeEach(async ({ page, context, browserName }) => {
  // 실제 클립보드(Ctrl+V) 테스트용 권한 — WebKit 은 이 권한을 지원하지 않아 해당 테스트는 건너뜀
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
});

/** 실제 클립보드가 필요한 테스트는 chromium 에서만 */
const needsClipboard = (browserName) => test.skip(browserName !== 'chromium', '실제 클립보드 권한은 chromium 에서만 지원');

/** 기본 서식(SAMPLE_FORMATS)의 id 로 서식 삽입 */
async function insertFormat(page, id) {
  await page.evaluate((fid) => window.core.exec('format', window.JM.SAMPLE_FORMATS.find((x) => x.id === fid).html), id);
}

test('표 셀: 입력·Tab 이동·마지막 셀에서 Tab 하면 행 추가', async ({ page }) => {
  await setHTML(page, '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>');
  await caret(page, 'td', 0);
  await page.keyboard.type('A');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B');
  expect(await page.evaluate(() => Array.from(window.core.root.querySelectorAll('td')).slice(0, 2).map((t) => t.textContent))).toEqual(['A', 'B']);
  await caret(page, 'tr:last-child td:last-child', 0);
  await page.keyboard.press('Tab');
  expect((await html(page)).match(/<tr/g).length).toBe(3);
  expect(await html(page)).not.toContain('jm-table');
});

test('갤러리 제목: 입력 후 Enter 는 줄바꿈 없이 끝내고, 여러 줄 붙여넣기는 한 줄로', async ({ page, browserName }) => {
  needsClipboard(browserName);
  await setHTML(page, '<p>앞</p>');
  await caret(page, 'p', -1);
  await insertFormat(page, 'image-gallery');
  const title = page.locator('.jm-editor div[data-type="gallery"] > p[data-role="title"]');
  await title.click();
  await page.keyboard.type('사진첩');
  await page.keyboard.press('Enter');
  expect(await html(page)).toContain('<p data-role="title">사진첩</p>');
  await title.click();
  await page.keyboard.press('End');
  await page.evaluate(() => navigator.clipboard.writeText(' 둘째\n셋째'));
  await page.keyboard.press('ControlOrMeta+v');
  expect(await html(page)).toContain('<p data-role="title">사진첩 둘째 셋째</p>');
});

test('배치 블록 글 칸: 입력·Enter 로 칸 안에서 문단이 나뉜다', async ({ page }) => {
  await setHTML(page, '<p>앞</p>');
  await caret(page, 'p', -1);
  await insertFormat(page, 'layout-side');
  const cell = page.locator('.jm-editor div[data-cell="text"] p').first();
  await cell.click();
  await page.keyboard.press('ControlOrMeta+a'); // 칸 안 글자만 선택
  await page.keyboard.type('첫 문단');
  await page.keyboard.press('Enter');
  await page.keyboard.type('둘째 문단');
  expect(await html(page)).toMatch(/<div data-cell="text"><p>첫 문단<\/p><p>둘째 문단<\/p><\/div>/);
});

test('버튼 헤더 주소 입력란: 실제 붙여넣기는 입력란에만 들어가고 본문은 그대로', async ({ page, browserName }) => {
  needsClipboard(browserName);
  await setHTML(page, '<p>앞</p>');
  await caret(page, 'p', -1);
  await insertFormat(page, 'buttons');
  const before = await html(page);
  await page.locator('.jm-editor a[data-role="button"]').first().click(); // 버튼 선택
  const url = page.locator('.jm-buttons-url');
  await url.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(() => navigator.clipboard.writeText('https://jinix.example/apply'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(url).toHaveValue('https://jinix.example/apply');
  const after = await html(page);
  expect(after).toContain('href="https://jinix.example/apply"');
  expect(after.replace('https://jinix.example/apply', 'https://example.com')).toBe(before); // 주소 말고는 그대로
});

test('표 셀에서 전체 선택하면 그 셀만 선택된다', async ({ page }) => {
  await setHTML(page, '<p>앞</p><table><tbody><tr><td>가나</td><td>다라</td></tr></tbody></table><p>뒤</p>');
  await page.locator('.jm-editor td').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('X');
  const h = await html(page);
  expect(h).toContain('<p>앞</p>');
  expect(h).toContain('<p>뒤</p>');
  expect(h).toMatch(/<td>X<\/td><td>다라<\/td>/);
});

test('전체 선택 후 지우고 입력하면 빈 문서에서 새로 시작', async ({ page }) => {
  await setHTML(page, '<h2>제목</h2><p>하나</p><ul><li>둘</li></ul>');
  await caret(page, 'p', 1);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('새 글');
  expect(await html(page)).toMatch(/^<(p|h2)>새 글<\/(p|h2)>$/);
});

test('붙어 있는 블록 사이 「＋ 단락 추가」로 문단을 넣는다', async ({ page }) => {
  await setHTML(page, '<div data-type="buttons" data-align="center"><a href="https://a.example" data-role="button" data-style="primary">A</a></div><div data-type="buttons" data-align="center"><a href="https://b.example" data-role="button" data-style="primary">B</a></div>');
  const second = page.locator('.jm-editor > .jm-buttons-layer').nth(1);
  const box = await second.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 1); // 두 블록 경계
  const gap = page.locator('.jm-gap-insert');
  await expect(gap).toBeVisible();
  await gap.click();
  await page.keyboard.type('사이 글');
  expect(await html(page)).toMatch(/A<\/a><\/div><p>사이 글<\/p><div data-type="buttons"/);
});
