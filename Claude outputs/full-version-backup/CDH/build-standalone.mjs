// CDH/standalone.html (Phase 1) 과 CDH/standalone-phase2.html (Phase 2) 를 만듭니다: 서버 없이 더블클릭으로 열 수 있는 단일 파일.
// 사용: node CDH/build-standalone.mjs   (esbuild 필요: npx 로 자동 설치)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

async function bundle(entry) {
  const out = await build({ entryPoints: [join(dir, entry)], bundle: true, format: 'iife', write: false, minify: false });
  return out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}
const read = (file) => readFileSync(join(dir, file), 'utf8');

// Phase 1
{
  let html = read('index.html');
  html = html
    .replace('<link rel="stylesheet" href="./src/app/styles.css">', `<style>\n${read('src/app/styles.css')}\n</style>`)
    .replace('<script type="module" src="./src/app/main.js"></script>', `<script>\n${await bundle('src/app/main.js')}\n</script>`);
  writeFileSync(join(dir, 'standalone.html'), html);
  console.log('standalone.html 생성 완료');
}

// Phase 2 (스타일은 Phase 1 것 + Phase 2 것)
{
  let html = read('phase2.html');
  html = html
    .replace('<link rel="stylesheet" href="./src/app/styles.css">', `<style>\n${read('src/app/styles.css')}\n${read('src/app2/styles.css')}\n</style>`)
    .replace('<link rel="stylesheet" href="./src/app2/styles.css">\n', '')
    .replace('<script type="module" src="./src/app2/main.js"></script>', `<script>\n${await bundle('src/app2/main.js')}\n</script>`);
  writeFileSync(join(dir, 'standalone-phase2.html'), html);
  console.log('standalone-phase2.html 생성 완료');
}
