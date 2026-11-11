import { h } from '../../../lib/index.js';
import { GRAIN_TYPES } from '../config.js';
import { DeadZone } from './DeadZone.js';
import { translate } from './format.js';

/**
 * 잡곡 한 알. 콩 · 팥 · 쌀 · 조는 같은 컴포넌트에 크기만 다르게 넘긴 것이다.
 * 위치는 style의 transform 하나로 정하므로, 움직이는 프레임의 DOM 변경은 이 알의 style 1건뿐이다.
 * @param {{grain: object, held: boolean}} props grain = { id, type, x, y, vy, where, rot? }
 */
export function Grain({ grain, held }) {
  const { diameter } = GRAIN_TYPES[grain.type];
  const falling = grain.where === 'falling' ? ' is-falling' : '';
  // 땅에 닿아 있던 시간에 따라 1초마다 한 단계씩 어두워지고, 5초면 썩는다.
  const rot = grain.where === 'rotten' ? ' is-rotten' : grain.rot ? ` rot-${grain.rot}` : '';
  return h(
    'div',
    {
      class: `grain grain--${grain.type}${falling}${rot}`,
      style: `width: ${diameter}px; height: ${diameter}px; ${translate(grain.x - diameter / 2, grain.y - diameter / 2)}`,
    },
    held && h(DeadZone, { grain }),
  );
}
