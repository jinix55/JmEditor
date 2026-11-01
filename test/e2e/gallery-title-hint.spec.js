/**
 * 갤러리 제목 칸의 안내: 비어 있을 때 사용법을 보여 주고 저장 내용에는 들어가지 않는다
 */
import { test, expect } from '@playwright/test';
import { open, setHTML, html } from './helpers.js';

test('빈 갤러리 제목에 사용법 안내, 저장 HTML 에는 없음', async ({ page }) => {
  await open(page);
  await setHTML(page, '<div data-type="gallery" data-layout="justify"><img src="/a.png" alt=""></div>');
  const title = page.locator('.jm-gallery-layer p[data-role="title"]');
  await expect(title).toHaveAttribute('data-placeholder', /드래그로 순서 변경/);
  expect(await html(page)).not.toContain('드래그');
  expect(await html(page)).not.toContain('data-placeholder');
});

test('데모 샘플 갤러리는 안내가 제목 글자가 아니라 placeholder 로 보인다', async ({ page }) => {
  await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
  await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
  const title = page.locator('.jm-gallery-layer p[data-role="title"]').first();
  await expect(title).toHaveText('');
  await expect(title).toHaveAttribute('data-placeholder', /드래그로 순서 변경/);
  await expect(page.locator('.jm-editor')).not.toContainText('헤더의');
});

test('슬라이드 제목 안내도 placeholder, 데모 샘플에 고정 글자 없음', async ({ page }) => {
  await page.route(/fonts\.googleapis\.com\/css2/, (route) => route.abort());
  await page.route(/youtube(-nocookie)?\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '' }));
  await page.goto('/examples/demo/index.html', { waitUntil: 'domcontentloaded' });
  const title = page.locator('.jm-slider-layer p[data-role="title"]').first();
  await expect(title).toHaveText('');
  await expect(title).toHaveAttribute('data-placeholder', /전환 간격/);
  await expect(page.locator('.jm-editor')).not.toContainText('자동 전환');
  await expect(page.locator('#out, .out').first()).not.toContainText('전환 간격');
});
