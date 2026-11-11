import { h } from '../../lib/index.js';
import { TABLE_Y, WORLD } from '../config.js';
import { OVERLAPS } from '../logic/camera.js';
import { Bowl } from './Bowl.js';
import { Grain } from './Grain.js';
import { translate } from './format.js';

/**
 * 게임 보드: 960×540 창으로 월드(2880×1080)의 일부만 보여 준다.
 * 월드 층은 카메라 위치만큼 반대로 옮기는 transform 하나로 움직인다. 그래서 카메라 구간을 옮겨도 잡곡의 위치 값은 그대로다.
 * 잡곡은 어디에 있든(그릇 안 · 테이블 · 공중) 모두 월드 층의 자식이라, 장소가 바뀌어도 DOM 부모는 바뀌지 않는다.
 */
export function Board({ camera, grains, bowl, heldId, shakes, onPointerDown, onPointerMove, onPointerUp }) {
  return h(
    'div',
    {
      // 흔들 때마다 클래스를 번갈아 바꿔 CSS 애니메이션이 처음부터 다시 돌게 한다. (타이머 없이)
      class: shakes === 0 ? 'board' : `board shake-${shakes % 2 === 1 ? 'a' : 'b'}`,
      onpointerdown: onPointerDown,
      onpointermove: onPointerMove,
      onpointerup: onPointerUp,
      onpointercancel: onPointerUp,
      onlostpointercapture: onPointerUp,
    },
    h(
      'div',
      {
        class: 'world',
        style: `width: ${WORLD.width}px; height: ${WORLD.height}px; ${translate(-camera.x, -camera.y)}`,
      },
      h('div', { class: 'table', style: `top: ${TABLE_Y}px` }),
      // 이웃한 카메라 구간이 겹치는 곳. 여기에 내려놓은 잡곡은 구간을 옮겨도 보여서 다시 집을 수 있다.
      OVERLAPS.map((zone) => h('div', { class: 'zone', style: `left: ${zone.left}px; width: ${zone.right - zone.left}px; top: ${TABLE_Y}px` })),
      h(Bowl, { side: 'left', bowl }),
      h(Bowl, { side: 'right' }),
      grains.map((grain) => h(Grain, { key: grain.id, grain, held: grain.id === heldId })),
    ),
  );
}
