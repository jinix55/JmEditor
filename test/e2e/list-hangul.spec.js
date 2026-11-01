/**
 * 한글 번호 목록: 브라우저 기본 번호와 counter 번호가 겹치지 않고, 가나다·ㄱㄴㄷ 이 구분된다 (편집·조회 화면)
 */
import { test, expect } from '@playwright/test';
import { open, setHTML } from './helpers.js';

/** 첫 li 의 기본 번호 형식과 ::before 내용 */
const marker = (page, scope) => page.evaluate((sel) => {
  const li = document.querySelector(`${sel} li`);
  return { type: getComputedStyle(li).listStyleType, before: getComputedStyle(li, '::before').content };
}, scope);

test.describe('한글 번호 목록', () => {
  for (const type of ['hangul', 'hangul-consonant']) {
    test(`${type}: 번호가 하나만 나온다 (편집 화면)`, async ({ page }) => {
      await open(page);
      await setHTML(page, `<ol style="list-style-type: ${type}"><li>하나</li><li>둘</li></ol>`);
      const m = await marker(page, '.jm-editor');
      expect(m.type).toBe('none');
      expect(m.before).toContain(`counter(jm-hangul, ${type})`); // 숫자로 나오지 않게
    });

    test(`${type}: 조회 화면도 같다`, async ({ page }) => {
      await open(page);
      await page.evaluate((t) => {
        const d = document.createElement('div');
        d.className = 'jm-content';
        d.innerHTML = `<ol style="list-style-type: ${t}"><li>하나</li></ol>`;
        document.body.appendChild(d);
      }, type);
      const m = await marker(page, '.jm-content');
      expect(m.type).toBe('none');
      expect(m.before).toContain(`counter(jm-hangul, ${type})`);
    });
  }

  test('안쪽 숫자 목록은 영향받지 않는다', async ({ page }) => {
    await open(page);
    await setHTML(page, '<ol style="list-style-type: hangul"><li>하나<ol><li>안쪽</li></ol></li></ol>');
    const inner = await page.evaluate(() => {
      const li = document.querySelector('.jm-editor ol ol li');
      return { type: getComputedStyle(li).listStyleType, before: getComputedStyle(li, '::before').content };
    });
    expect(inner.type).toBe('decimal');
    expect(inner.before).toBe('none');
  });
});
