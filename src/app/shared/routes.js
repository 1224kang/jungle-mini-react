// 사이트 페이지 목록. 이 파일 한 곳에서만 관리한다.
// app은 HTML · 바닐라 JS · Mini React(src/lib/index.js)만 쓴다. playground는 참조하지 않는다.
// 새 페이지를 만들면 src/app/<이름>/index.html을 두고 NAV에 한 줄 추가한다.

// 사이트가 올라간 경로. 개발 서버에서는 '/', GitHub Pages에서는 '/<저장소 이름>/'이다.
// 페이지 주소는 항상 BASE를 앞에 붙여 만든다.
export const BASE = import.meta.env.BASE_URL;

export const PATHS = {
  visualizer: BASE + 'src/app/visualizer/',
  components: BASE + 'src/app/components/',
  jabgok: BASE + 'src/app/jabgok/',
};

export const HOME = { href: BASE, label: 'Mini React' };

/** 사이드바 목차: 그룹 제목 아래 페이지들 */
export const NAV = [
  {
    title: 'How it works',
    pages: [
      { href: PATHS.visualizer, label: 'Virtual DOM · Diff · Patch' },
      { href: PATHS.components, label: 'Component · State · Hooks' },
    ],
  },
  {
    title: 'Demo',
    pages: [{ href: PATHS.jabgok, label: '잡곡 옮기기 (게임)' }],
  },
];

export const REPO = { href: 'https://github.com/1224kang/jungle-mini-react', label: 'GitHub' };

// '/a/b/index.html'과 '/a/b'를 '/a/b/'로 맞춰 비교한다.
export const normalizePath = (path) => {
  const p = path.replace(/index\.html$/, '');
  return p.endsWith('/') ? p : p + '/';
};
