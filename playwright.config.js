// E2E 테스트 설정 — 저장소 루트를 정적 서버로 띄우고 test/e2e 하네스로 에디터를 실제 브라우저에서 확인한다.
//   npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 20000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5179', trace: 'retain-on-failure' },
  webServer: { command: 'node test/e2e/server.mjs 5179', url: 'http://localhost:5179/test/e2e/harness.html', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }, // 사파리 엔진 — contenteditable 동작 차이 확인
    // 같은 테스트를 구조 모드를 끈 채로 (끈 사이트의 예전 동작이 그대로인지) — 하네스 ?structure=0
    { name: 'chromium-off', use: { ...devices['Desktop Chrome'] }, metadata: { query: '?structure=0' } },
  ],
});
