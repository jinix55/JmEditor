// 배포본 빌드: dist/ 에 에디터·뷰어 번들과 CSS 를 만든다.  node build.mjs
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const banner = { js: '/* JmEditor | MIT License | (c) 2026 jinix55 | https://github.com/jinix55/JmEditor */' };
mkdirSync('dist', { recursive: true });

// 에디터 전체 (전역 JmEditor.* / ES Module 두 가지)
await build({ entryPoints: ['src/index.js'], bundle: true, minify: true, format: 'iife', globalName: 'JmEditor', outfile: 'dist/jm-editor.min.js', banner, target: ['es2020'] });
await build({ entryPoints: ['src/index.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/jm-editor.esm.js', banner, target: ['es2020'] });
// 뷰어 런타임 (갤러리 배치 + 슬라이드)
await build({ entryPoints: ['src/viewer.js'], bundle: true, minify: true, format: 'iife', globalName: 'JmViewer', outfile: 'dist/jm-viewer.min.js', banner, target: ['es2020'] });
await build({ entryPoints: ['src/viewer.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/jm-viewer.esm.js', banner, target: ['es2020'] });
copyFileSync('src/styles/jm-editor.css', 'dist/jm-editor.css');
// 설정 파일 (업로드 제한 등) — 번들에 넣지 않고 그대로 복사해 빌드 없이 고쳐 쓰게 함
copyFileSync('src/jm-editor.config.js', 'dist/jm-editor.config.js');
console.log('built dist/');
