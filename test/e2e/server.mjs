/**
 * 테스트용 정적 서버 — 저장소 루트를 그대로 내보낸다 (의존성 없음). Playwright webServer 가 띄운다.
 *   node test/e2e/server.mjs [포트=5179]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const PORT = Number(process.argv[2] || process.env.PORT || 5179);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; } // 저장소 밖 접근 차단
    const target = (await stat(file)).isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`test server http://localhost:${PORT}`));
