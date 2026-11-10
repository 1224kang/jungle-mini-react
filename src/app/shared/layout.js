// 모든 페이지가 함께 쓰는 레이아웃 컴포넌트.
// 규칙(docs/contracts.md 6장): 상태 없이 props만 받는 순수 함수다. Hook은 각 페이지의 루트에서만 쓴다.
import { h } from '../../lib/index.js';
import { HOME, PAGES, REPO, normalizePath } from './routes.js';

/** @param {{ current?: string }} props 현재 페이지 경로. 생략하면 location.pathname */
export function Header({ current = location.pathname } = {}) {
  const here = normalizePath(current);
  return h(
    'header',
    { class: 'header' },
    h(
      'div',
      { class: 'container header-inner' },
      h('a', { class: 'brand', href: HOME.href }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⚛'), HOME.label),
      h(
        'nav',
        { class: 'menu', 'aria-label': '사이트 메뉴' },
        PAGES.map((page) =>
          h(
            'a',
            normalizePath(page.href) === here
              ? { key: page.href, href: page.href, 'aria-current': 'page' }
              : { key: page.href, href: page.href },
            page.label,
          ),
        ),
        h('a', { key: 'repo', href: REPO.href, target: '_blank', rel: 'noopener noreferrer' }, REPO.label),
      ),
    ),
  );
}

export function Footer() {
  return h(
    'footer',
    { class: 'footer' },
    h('div', { class: 'container' }, h('p', null, 'jungle-mini-react · 런타임 의존성 0개, 순수 JavaScript로 만든 Mini React')),
  );
}

/** 헤더 + main + 푸터. children은 main 안에 들어간다. */
export function PageShell({ current, children }) {
  return h('div', { class: 'page' }, h(Header, { current }), h('main', null, children), h(Footer, null));
}
