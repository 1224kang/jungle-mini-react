import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 배포할 페이지들. 새 페이지를 만들면 여기에도 한 줄 추가한다.
const PAGES = [
  'src/app/index.html',
  'src/app/visualizer/index.html',
  'src/app/components/index.html',
  'src/app/jabgok/index.html',
  'src/playground/index.html',
  'src/playground/verify/index.html',
];

// `/`로 들어오면 데모 앱(src/app)을 보여 준다. 주소창은 `/` 그대로다.
// - 개발 서버: 요청 경로를 /src/app/ 으로 바꿔 준다.
//   나머지 경로(/index.html 페이지 목록, /src/playground/verify/ 등)는 그대로 둔다.
// - 빌드: dist/src/app/index.html 을 dist/index.html 로 복사한다.
function appAtRoot() {
  let outDir;
  return {
    name: 'app-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = req.url.split('?');
        if (path === '/') req.url = '/src/app/' + (query ? `?${query}` : '');
        next();
      });
    },
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (this.meta.watchMode) return;
      try {
        copyFileSync(resolve(outDir, 'src/app/index.html'), resolve(outDir, 'index.html'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error; // 빌드가 아닐 때(테스트 등)는 복사할 파일이 없다
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages는 '/<저장소 이름>/' 아래에 올라간다. 배포 워크플로가 BASE_PATH로 알려 준다.
  base: process.env.BASE_PATH || '/',
  plugins: [appAtRoot()],
  build: {
    rollupOptions: {
      input: PAGES,
    },
  },
  test: {
    environment: 'jsdom',
  },
});
