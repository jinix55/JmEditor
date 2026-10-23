/**
 * 데모(examples/demo/index.html — src 를 한 파일로 합친 단독 페이지)가 뜨는지.
 * 합칠 때 스크립트 안에 「<!--」「<script」 같은 글자가 들어가면 HTML 파서가 스크립트를 끊어 에디터가 안 생긴다.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('데모 페이지에서 에디터와 툴바가 생기고 오류가 없다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/examples/demo/index.html');
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
  await page.goto('/examples/demo/index.html');
  await expect(page.locator('#structState')).toHaveText('퍼블 구조 모드: 켜짐');
  await page.locator('#pubSample').selectOption('연혁');
  const out = (await page.locator('#html').textContent()).replace(/>\s+</g, '><');
  expect(out).toContain('<div class="history-wrap"><div class="history-year"><h3 class="year">2026</h3><dl class="history-list">');
});

test('데모 ?structure=0(구조 꺼짐)에서 퍼블 샘플을 불러오면 예전 규칙대로 구조가 정리된다', async ({ page }) => {
  await page.goto('/examples/demo/index.html?structure=0');
  await expect(page.locator('#structState')).toHaveText('퍼블 구조 모드: 꺼짐');
  await page.locator('#pubSample').selectOption('연혁');
  await expect(page.locator('#html')).not.toContainText('class=');
});

