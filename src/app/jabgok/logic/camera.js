import { CAMERA, VIEW, WORLD } from '../config.js';

// 카메라: { x, y }. 화면 왼쪽 위의 월드 좌표다. 카메라는 정해진 구간에만 멈춰 있고, A · D로 한 구간씩 옮긴다.
// 모두 순수 함수다.

/**
 * 구간별 카메라 x. 구간 폭은 화면 너비(960)이고 CAMERA.step(640)씩 떨어져 있어, 이웃한 구간은 320px이 겹친다.
 * 잡곡을 든 채로는 구간을 넘을 수 없으므로, 겹치는 곳에 내려놓고 구간을 옮긴 뒤 다시 집는다.
 */
export const SECTIONS = Object.freeze(
  Array.from({ length: Math.floor((WORLD.width - VIEW.width) / CAMERA.step) + 1 }, (_, i) => i * CAMERA.step),
);

/** 이웃한 두 구간이 겹치는 곳(둘 다에서 보이는 곳)의 월드 x 범위. 잡곡을 내려놓는 자리다. */
export const OVERLAPS = Object.freeze(
  SECTIONS.slice(1).map((x, i) => Object.freeze({ left: x, right: SECTIONS[i] + VIEW.width })),
);

export const INITIAL_CAMERA = Object.freeze({ x: SECTIONS[0], y: CAMERA.y });

/** 카메라가 있는 구간 번호 (0부터). */
export const sectionOf = (camera) => SECTIONS.indexOf(camera.x);

/**
 * 카메라를 한 구간 옮긴다. 끝 구간에서 밖으로 가려 하면 받은 객체를 그대로 돌려준다. → 렌더 0회
 * @param {{x: number, y: number}} camera
 * @param {-1|1} direction -1 = 왼쪽(A), 1 = 오른쪽(D)
 */
export function shiftCamera(camera, direction) {
  const next = SECTIONS[sectionOf(camera) + direction];
  return next === undefined ? camera : { x: next, y: camera.y };
}

/** 화면 좌표의 포인터를 월드 좌표로 바꾼다. 월드 좌표 = 화면 좌표 + 카메라 위치. */
export function toWorld(screen, camera) {
  return { x: screen.x + camera.x, y: screen.y + camera.y };
}
