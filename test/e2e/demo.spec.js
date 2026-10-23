/**
 * 데모(examples/demo/index.html — src 를 한 파일로 합친 단독 페이지)가 뜨는지.
 * 합칠 때 스크립트 안에 「<!--」「<script」 같은 글자가 들어가면 HTML 파서가 스크립트를 끊어 에디터가 안 생긴다.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 데모는 src 전체를 한 파일에 담아 커서, 테스트를 동시에 많이 돌리면 늦게 뜰 수 있음
test.describe.configure({ timeout: 60000 });

// 테스트 대상이 아닌 외부 자원은 네트워크에 맡기지 않는다 (상태에 따라 늦게 뜨거나, 유튜브 플레이어가 자체 오류를 냄)
// - 데모 글꼴(Google Fonts) 요청은 막고, 예시 본문의 유튜브 iframe 은 빈 페이지로 응답
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
  await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
});

test('데모 페이지에서 에디터와 툴바가 생기고 오류가 없다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' }); // 외부 글꼴 응답을 기다리지 않음
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  expect(await page.locator('.jm-toolbar [data-cmd]').count()).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('데모 스크립트 안에 HTML 파서를 흔드는 글자가 없다', () => {
  const html = fs.readFileSync('examples/demo/index.html', 'utf8');
  const body = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  for (const bad of ['<!--', '<script', '</script']) expect(body.includes(bad), bad).toBe(false);
});

test('데모 기본(구조 켜짐): 퍼블 샘플을 불러오면 구조·class 가 그대로 저장 결과에 나온다', async ({ page }) => {
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' }); // 외부 글꼴 응답을 기다리지 않음
  await expect(page.locator('#structState')).toHaveText('퍼블 구조 모드: 켜짐');
  await page.locator('#pubSample').selectOption('연혁');
  const out = (await page.locator('#html').textContent()).replace(/>\s+</g, '><');
  expect(out).toContain('<div class="history-wrap"><div class="history-year"><h3 class="year">2026</h3><dl class="history-list">');
});

test('데모 ?structure=0(구조 꺼짐)에서 퍼블 샘플을 불러오면 예전 규칙대로 구조가 정리된다', async ({ page }) => {
  await page.goto('/examples/demo/index.html?structure=0', { waitUntil: 'domcontentloaded' }); // 외부 글꼴 응답을 기다리지 않음
  await expect(page.locator('#structState')).toHaveText('퍼블 구조 모드: 꺼짐');
  await page.locator('#pubSample').selectOption('연혁');
  await expect(page.locator('#html')).not.toContainText('class=');
});

test('데모에 넣은 에디터 CSS 는 src/styles/jm-editor.css 와 같다 (따로 고쳐 어긋나지 않게)', () => {
  const html = fs.readFileSync('examples/demo/index.html', 'utf8');
  const a = html.indexOf('*/', html.indexOf('/* @@jm-editor.css 시작')) + 2;
  const b = html.indexOf('/* @@jm-editor.css 끝 */');
  expect(html.slice(a, b).trim()).toBe(fs.readFileSync('src/styles/jm-editor.css', 'utf8').trim());
});

test('데모 색 테마 패널: 테마를 고르거나 색을 바꾸면 테마 변수가 바뀌고 CSS 를 보여 준다', async ({ page }) => {
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' }); // 외부 글꼴 응답을 기다리지 않음
  const v = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  await page.locator('#themePreset').selectOption('기본(파랑)');
  expect(await v('--jm-accent')).toBe('#1d4ed8'); // 라이브러리 기본값
  await page.locator('#themePreset').selectOption('다크');
  expect(await v('--jm-bg')).toBe('#1d2124');
  await page.locator('#pick--jm-accent').evaluate((i) => { i.value = '#c026d3'; i.dispatchEvent(new Event('input')); });
  expect(await v('--jm-accent')).toBe('#c026d3');
  await page.locator('#themeCss').click();
  await expect(page.locator('#themeCssOut')).toContainText('--jm-accent: #c026d3;');
});

