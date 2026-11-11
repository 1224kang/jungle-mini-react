import { h } from '../../lib/index.js';
import { DEADZONE_RATIO, GRAIN_TYPES } from '../config.js';

/**
 * 데드존 점선 원. 잡곡 중심이 원점이고 지름은 잡곡 지름 × 3이다.
 * 잡힌 동안에만 부모(Grain)가 `held && h(DeadZone, …)`로 그린다. 잡곡의 자식이라 잡곡과 함께 움직인다.
 */
export function DeadZone({ grain }) {
  const size = GRAIN_TYPES[grain.type].diameter * DEADZONE_RATIO;
  return h('div', { class: 'deadzone', style: `width: ${size}px; height: ${size}px` });
}
