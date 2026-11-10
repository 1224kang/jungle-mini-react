// 모든 페이지가 함께 쓰는 레이아웃 컴포넌트.
// 규칙(docs/contracts.md 6장): 상태 없이 props만 받는 순수 함수다. Hook은 각 페이지의 루트에서만 쓴다.
// 사이드바 열림 상태는 각 페이지 루트가 useSidebar()로 갖고, nav prop으로 내려 준다.
import { h } from '../../lib/index.js';
import { HOME, NAV, REPO, normalizePath } from './routes.js';

const SIDEBAR_ID = 'site-sidebar';

/** @param {{ nav: { open: boolean, toggle: () => void } }} props */
export function Header({ nav }) {
  return h(
    'header',
    { class: 'header' },
    h(
      'div',
      { class: 'header-inner' },
      h(
        'button',
        {
          type: 'button',
          class: 'menu-toggle',
          'aria-label': nav.open ? '목차 닫기' : '목차 열기',
          'aria-expanded': String(nav.open),
          'aria-controls': SIDEBAR_ID,
          onclick: nav.toggle,
        },
        h('span', { class: 'bars', 'aria-hidden': 'true' }, h('span', null), h('span', null), h('span', null)),
      ),
      h('a', { class: 'brand', href: HOME.href }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⚛'), HOME.label),
      h(
        'nav',
        { class: 'menu', 'aria-label': '외부 링크' },
        h('a', { href: REPO.href, target: '_blank', rel: 'noopener noreferrer' }, REPO.label),
      ),
    ),
  );
}

/** 목차. 그룹 제목(대문자) 아래에 페이지 링크를 나열하고, 지금 페이지를 강조한다. */
export function Sidebar({ nav, current = location.pathname }) {
  const here = normalizePath(current);
  return h(
    'aside',
    {
      id: SIDEBAR_ID,
      class: nav.open ? 'sidebar open' : 'sidebar',
      'aria-label': '목차',
      inert: !nav.open, // 닫혀 있으면 포커스·클릭이 닿지 않게
    },
    h(
      'nav',
      null,
      NAV.map((group) =>
        h(
          'section',
          { key: group.title, class: 'toc-group' },
          h('h2', { class: 'toc-title' }, group.title),
          h(
            'ul',
            { class: 'toc-list' },
            group.pages.map((page) =>
              h(
                'li',
                { key: page.href },
                h(
                  'a',
                  normalizePath(page.href) === here
                    ? { href: page.href, class: 'toc-link', 'aria-current': 'page' }
                    : { href: page.href, class: 'toc-link' },
                  page.label,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function Footer() {
  return h(
    'footer',
    { class: 'footer' },
    h(
      'div',
      { class: 'container' },
      h('p', null, 'jungle-mini-react · 런타임 의존성 0개, 순수 JavaScript로 만든 Mini React'),
      h('p', null, h('a', { href: REPO.href, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub에서 코드 보기')),
    ),
  );
}

/**
 * 헤더 + 사이드바 + (main + 푸터). children은 main 안에 들어간다.
 * 넓은 화면에서 사이드바가 열리면 본문(page-content)이 옆으로 밀린다. 좁은 화면에서는 배경막과 함께 덮는다.
 * 여닫을 때는 class만 바뀌고 DOM 구조는 그대로다.
 * @param {{ nav: { open: boolean, toggle: () => void, close: () => void }, current?: string, children: any }} props
 */
export function PageShell({ nav, current, children }) {
  return h(
    'div',
    { class: nav.open ? 'page nav-open' : 'page' },
    h(Header, { nav }),
    h(Sidebar, { nav, current }),
    h('div', { class: 'backdrop', 'aria-hidden': 'true', onclick: nav.close }),
    h('div', { class: 'page-content' }, h('main', null, children), h(Footer, null)),
  );
}
