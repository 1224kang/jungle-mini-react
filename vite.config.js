import { defineConfig } from 'vitest/config';

// 개발 서버에서 `/`로 들어오면 데모 앱(src/app)을 보여 준다. 주소창은 `/` 그대로다.
// 나머지 경로(/index.html 페이지 목록, /src/playground/verify/ 등)는 그대로 둔다.
function appAtRoot() {
  return {
    name: 'app-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = req.url.split('?');
        if (path === '/') req.url = '/src/app/' + (query ? `?${query}` : '');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [appAtRoot()],
  test: {
    environment: 'jsdom',
  },
});
