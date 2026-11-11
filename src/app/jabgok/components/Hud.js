import { h } from '../../../lib/index.js';
import { formatTime, translate } from './format.js';

/** 미니맵: 월드 전체 · 카메라 위치 · 두 그릇. 카메라 표시만 transform으로 움직인다. */
function minimapView(camera, bowl, minimap) {
  return h(
    'div',
    { class: 'minimap', style: minimap.style, 'aria-label': '미니맵' },
    h('div', { class: 'minimap__table', style: minimap.tableStyle }),
    minimap.bowls.map((mark) =>
      h('div', {
        class: `minimap__bowl minimap__bowl--${mark.side}`,
        // 잡곡 그릇은 옮긴 만큼 표시도 옮긴다
        style: mark.side === 'left' ? `${mark.style}; ${translate((bowl.x - mark.x) * minimap.scale, (bowl.y - mark.y) * minimap.scale)}` : mark.style,
      })),
    h('div', {
      class: 'minimap__view',
      style: `${minimap.viewStyle}; ${translate(camera.x * minimap.scale, camera.y * minimap.scale)}`,
    }),
  );
}

const stat = (name, label, value) =>
  h('div', { class: `hud__item hud__item--${name}` }, h('span', { class: 'hud__label' }, label), h('strong', { class: 'hud__value' }, value));

/**
 * 상단 HUD: 남은 시간, 점수 / 목표, 미니맵, 왼쪽 그릇에 남은 알, 떨어뜨린 횟수.
 * 시계는 텍스트 노드 하나라 1초에 한 번 TEXT patch 1건만 나온다.
 * @param {object} props minimap은 App이 월드 크기에서 한 번 계산한 배치(createMinimap)
 */
export function Hud({ timeLeft, score, goal, remaining, drops, camera, bowl, minimap }) {
  return h(
    'header',
    { class: 'hud' },
    stat('time', '남은 시간', formatTime(timeLeft)),
    h(
      'div',
      { class: 'hud__item hud__item--score' },
      h('span', { class: 'hud__label' }, '점수'),
      h('strong', { class: 'hud__value' }, String(score)),
      h('span', { class: 'hud__goal' }, `/ 목표 ${goal}점`),
    ),
    h('div', { class: 'hud__item hud__item--map' }, h('span', { class: 'hud__label' }, '미니맵'), minimapView(camera, bowl, minimap)),
    stat('remaining', '왼쪽 그릇에 남은 알', `${remaining}알`),
    stat('drops', '떨어뜨린 횟수', `${drops}회`),
  );
}
