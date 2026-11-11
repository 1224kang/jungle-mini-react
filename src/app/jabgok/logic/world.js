import { BOWL, BOWL_CENTER, TABLE_Y, VIEW, WORLD } from '../config.js';

/** 벽·바닥에 놓을 때 띄우는 틈(px). 놓인 잡곡을 다시 잡자마자 "벽에 닿음"이 되지 않게 한다. */
const GAP = 1;

/**
 * 그릇 단면의 좌표. 바깥 폭 BOWL.width, 옆벽·바닥 두께 BOWL.wall.
 * 왼쪽 그릇(잡곡 그릇)은 들고 옮길 수 있어서, 옮겨진 위치(bowl)를 넘기면 그 자리의 좌표를 돌려준다.
 * @param {'left'|'right'} side
 * @param {{x: number, y: number}} [bowl] 왼쪽 그릇의 위치 (가운데 x, 밑변 y). 생략하면 처음 자리.
 */
export function bowlBox(side, bowl) {
  const cx = side === 'left' && bowl ? bowl.x : BOWL_CENTER[side];
  const bottom = side === 'left' && bowl ? bowl.y : TABLE_Y;
  const half = BOWL.width / 2;
  return {
    side,
    cx,
    bottom,
    outerLeft: cx - half,
    outerRight: cx + half,
    innerLeft: cx - half + BOWL.wall,
    innerRight: cx + half - BOWL.wall,
    rimY: bottom - BOWL.height, // 림(벽 윗면)
    floorY: bottom - BOWL.wall, // 그릇 안쪽 바닥
  };
}

export const BOWL_BOXES = Object.freeze([bowlBox('left'), bowlBox('right')]);

const boxesFor = (bowl) => (bowl ? [bowlBox('left', bowl), BOWL_BOXES[1]] : BOWL_BOXES);

/** 테이블 위에 놓인 그릇의 림(벽 윗면) y. */
export const RIM_Y = TABLE_Y - BOWL.height;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * 중심 x에서 곧장 떨어진 잡곡이 멈추는 곳.
 * - 중심이 림의 가운데 선보다 안쪽이면 그릇 안(안쪽 바닥), 바깥쪽이면 테이블.
 * - 벽에 걸치는 x는 벽 옆으로 밀어, 잡곡이 벽 속에 놓이지 않게 한다.
 * @param {number} x 잡곡 중심 x
 * @param {number} r 잡곡 반지름
 * @param {{x: number, y: number}} [bowl] 왼쪽 그릇의 위치
 * @param {number} [y] 잡곡 중심 y. 주면 그릇 바닥보다 아래에서 떨어지는 잡곡은 그 그릇에 담기지 않는다. (들린 그릇 아래)
 * @returns {{x: number, y: number, where: 'left'|'right'|'floor', rimY: number}} 멈춘 중심 좌표와 장소, 벽 옆으로 비키는 높이
 */
export function landingOf(x, r, bowl, y) {
  for (const box of boxesFor(bowl)) {
    if (y !== undefined && y > box.floorY - r + 0.5) continue;
    const rimLeft = box.outerLeft + BOWL.wall / 2;
    const rimRight = box.outerRight - BOWL.wall / 2;
    if (x > rimLeft && x < rimRight) {
      return { x: clamp(x, box.innerLeft + r + GAP, box.innerRight - r - GAP), y: box.floorY - r, where: box.side, rimY: box.rimY };
    }
    if (x <= rimLeft && x > box.outerLeft - r - GAP) return { x: box.outerLeft - r - GAP, y: TABLE_Y - r, where: 'floor', rimY: box.rimY };
    if (x >= rimRight && x < box.outerRight + r + GAP) return { x: box.outerRight + r + GAP, y: TABLE_Y - r, where: 'floor', rimY: box.rimY };
  }
  return { x, y: TABLE_Y - r, where: 'floor', rimY: RIM_Y };
}

/**
 * 중심 (x, y) 아래에 있는 면의 y: 그릇 안이면 안쪽 바닥, 아니면 테이블 면. (든 잡곡이 면 아래로 내려가지 않게)
 * y를 주면 그릇 바닥보다 아래에 있는 점은 그 그릇을 지나쳐 테이블 면으로 본다.
 */
export function surfaceY(x, bowl, y) {
  for (const box of boxesFor(bowl)) {
    if (x >= box.innerLeft && x <= box.innerRight && (y === undefined || y <= box.floorY)) return box.floorY;
  }
  return TABLE_Y;
}

/** 원(중심 x·y, 반지름 r)이 그릇 옆벽(림 포함)에 닿는가. */
export function touchesWall(x, y, r, bowl) {
  for (const box of boxesFor(bowl)) {
    if (touchesRect(x, y, r, box, box.outerLeft, box.innerLeft) || touchesRect(x, y, r, box, box.innerRight, box.outerRight)) {
      return true;
    }
  }
  return false;
}

function touchesRect(x, y, r, box, left, right) {
  const dx = x - clamp(x, left, right);
  const dy = y - clamp(y, box.rimY, box.bottom);
  return dx * dx + dy * dy <= r * r;
}

/** 든 잡곡의 중심을 월드 안, 면 위로 제한한다. */
export function clampToWorld(x, y, r, bowl) {
  const cx = clamp(x, r, WORLD.width - r);
  return { x: cx, y: clamp(y, r, surfaceY(cx, bowl, y) - r) };
}

/**
 * 미니맵 배치. 월드 크기에서 한 번만 계산한다.
 * @param {number} [width] 미니맵 너비(px)
 */
export function createMinimap(width = 192) {
  const scale = width / WORLD.width;
  const px = (value) => `${Math.round(value * scale * 10) / 10}px`;
  return {
    scale,
    style: `width: ${px(WORLD.width)}; height: ${px(WORLD.height)}`,
    tableStyle: `top: ${px(TABLE_Y)}`,
    viewStyle: `width: ${px(VIEW.width)}; height: ${px(VIEW.height)}`,
    bowls: BOWL_BOXES.map((box) => ({
      side: box.side,
      x: box.cx,
      y: box.bottom,
      style: `left: ${px(box.outerLeft)}; top: ${px(box.rimY)}; width: ${px(BOWL.width)}; height: ${px(BOWL.height)}`,
    })),
  };
}
