// standalone.html 을 만듭니다: 서버 없이 더블클릭으로 열 수 있는 단일 파일 (CSS 와 JS 를 HTML 안에 넣음).
// 사용: node CDH/build-standalone.mjs   (esbuild 필요: npm i -D esbuild 또는 npx 로 설치)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(dir, file), 'utf8');

const bundle = await build({ entryPoints: [join(dir, 'src/main.js')], bundle: true, format: 'iife', write: false });
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = read('index.html')
  .replace('<link rel="stylesheet" href="./src/styles.css">', `<style>\n${read('src/styles.css')}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', `<script>\n${js}\n</script>`);
writeFileSync(join(dir, 'standalone.html'), html);
console.log('standalone.html 생성 완료');
