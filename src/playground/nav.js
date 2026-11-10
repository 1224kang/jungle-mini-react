// 데모 페이지 공용 nav. 페이지 목록은 여기 한 곳에서만 관리한다.
// 각 페이지는 <nav id="site-nav"></nav> 와 이 파일 import만 있으면 된다.
// 메인 화면(src/app)은 PAGES만 가져가 Mini React로 직접 그린다.
// 아직 공개하지 않는 페이지(플레이그라운드, Hooks 예제, 시각화)는 목록에 넣지 않는다.
export const HOME = { href: '/src/app/', label: 'Mini React' };
export const PAGES = [{ href: '/src/playground/verify/', label: 'Patch 검증' }];

const normalize = (p) => (p.endsWith('/') ? p : p + '/');

const nav = document.getElementById('site-nav');
if (nav) {
  const here = normalize(location.pathname.replace(/index\.html$/, ''));
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', '사이트 메뉴');

  const home = document.createElement('a');
  home.href = HOME.href;
  home.textContent = HOME.label;
  home.className = 'site-nav-home';
  nav.append(home);

  for (const page of PAGES) {
    const a = document.createElement('a');
    a.href = page.href;
    a.textContent = page.label;
    if (normalize(page.href) === here) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
}
