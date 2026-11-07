// CDH/standalone.html 을 만듭니다: 서버 없이 더블클릭으로 열 수 있는 단일 파일.
// 사용: node CDH/build-standalone.mjs   (esbuild 필요: npx 로 자동 설치)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const js = (
  await build({ entryPoints: [join(dir, 'src/app/main.js')], bundle: true, format: 'iife', write: false, minify: false })
).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dir, 'src/app/styles.css'), 'utf8');

let html = readFileSync(join(dir, 'index.html'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="./src/app/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/app/main.js"></script>', `<script>\n${js}\n</script>`);
writeFileSync(join(dir, 'standalone.html'), html);
console.log('standalone.html 생성 완료');
