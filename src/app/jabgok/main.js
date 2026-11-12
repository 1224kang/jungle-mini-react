import { h, mount } from '../../lib/index.js';
import { PageShell } from '../shared/layout.js';
import { useSidebar } from '../shared/useSidebar.js';
import { App } from './App.js';

function GamePage() {
  const nav = useSidebar();
  return h(PageShell, { nav }, h('div', { class: 'game-page', id: 'game-page' }));
}

const siteRoot = document.getElementById('site-root');
mount(h(GamePage), siteRoot);

// 공통 레이아웃은 빈 자리만 렌더링하고, 게임은 그 안에 별도 루트로 마운트한다.
const content = document.getElementById('game-content');
document.getElementById('game-page').append(content.content.cloneNode(true));
mount(h(App), document.getElementById('app'));

// 메뉴 버튼의 Space는 기본 버튼 동작으로 처리하고 게임의 흔들기까지 전달하지 않는다.
siteRoot.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target.closest('.menu-toggle')) event.stopPropagation();
});
