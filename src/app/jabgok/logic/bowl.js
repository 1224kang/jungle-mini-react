import { BOWL, BOWL_CENTER, GRAVITY, LABEL, TABLE_Y, WORLD } from '../config.js';
import { follow } from './grains.js';
import { bowlBox } from './world.js';

// 잡곡 그릇(왼쪽 그릇)은 아래 "잡곡 그릇" 글자 중 "곡"의 ㅗ 꼭지를 잡아 통째로 들고 옮길 수 있다. 담긴 잡곡은 함께 움직이고, 땅에 닿지 않아 썩지 않는다.
// 그릇: { x, y, vy, held }. x는 가운데, y는 밑변의 월드 좌표다. 테이블 위에서는 y = TABLE_Y. 모두 순수 함수다.

const HALF = BOWL.width / 2;
const GAP = 1;

export const INITIAL_BOWL = Object.freeze({ x: BOWL_CENTER.left, y: TABLE_Y, vy: 0, held: false });

/**
 * 이름표("잡곡 그릇" 글자)의 좌표. 그릇 밑변 바로 아래 가운데에 붙어 있다.
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function labelBox(bowl) {
  const top = bowl.y + LABEL.gap;
  return { left: bowl.x - LABEL.width / 2, right: bowl.x + LABEL.width / 2, top, bottom: top + LABEL.height };
}

/**
 * "곡"의 ㅗ에서 위로 튀어나온 꼭지의 좌표. 그릇은 여기만 잡을 수 있다.
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function stubBox(bowl) {
  const { stub } = LABEL;
  const left = bowl.x + stub.x;
  const top = bowl.y + LABEL.gap + stub.y;
  return { left, right: left + stub.width, top, bottom: top + stub.height };
}

/** 월드 좌표의 점이 그 꼭지 위(둘레 margin 포함)에 있는가. 글자의 다른 곳, 그릇의 벽이나 안쪽은 잡히지 않는다. */
export function hitsStub(bowl, point) {
  const box = stubBox(bowl);
  const { margin } = LABEL.stub;
  return (
    point.x >= box.left - margin &&
    point.x <= box.right + margin &&
    point.y >= box.top - margin &&
    point.y <= box.bottom + margin
  );
}

/** 그릇이 월드 밖으로 나가거나 오른쪽 그릇과 겹치지 않게 x를 막는다. */
function clampX(x) {
  const max = Math.min(WORLD.width - HALF, bowlBox('right').outerLeft - HALF - GAP);
  return Math.min(Math.max(x, HALF), max);
}

const dropped = (bowl) => ({ ...bowl, vy: 0, held: false });

/**
 * 그릇의 한 프레임.
 * - 들고 있을 때: 잡은 지점(grip)이 포인터를 따라오게 움직인다. 잡곡과 같은 따라오기(8%, 최대 180px/초)다.
 *   포인터가 잡은 지점에서 LABEL.deadRadius보다 멀어지면 그 자리에서 떨어진다.
 * - 떨어질 때: 중력으로 곧장 내려가 테이블 면에서 멈춘다.
 * 움직임이 없으면 받은 객체를 그대로 돌려준다. → 렌더 0회
 * @param {{x: number, y: number, vy: number, held: boolean}} bowl
 * @param {{x: number, y: number, gripX: number, gripY: number}|null} pointer 포인터의 월드 좌표와 잡은 지점(그릇 기준 오프셋)
 * @param {number} dt 프레임 간격(ms)
 */
export function stepBowl(bowl, pointer, dt) {
  if (bowl.held) {
    if (!pointer) return dropped(bowl);
    const targetX = pointer.x - pointer.gripX;
    const targetY = pointer.y - pointer.gripY;
    if (Math.hypot(targetX - bowl.x, targetY - bowl.y) > LABEL.deadRadius) return dropped(bowl);
    const moved = follow(bowl.x, bowl.y, targetX, targetY, dt);
    const x = clampX(moved.x);
    const y = Math.min(Math.max(moved.y, BOWL.height), TABLE_Y);
    if (x === bowl.x && y === bowl.y) return bowl;
    return { ...bowl, x, y };
  }
  if (bowl.y >= TABLE_Y) return bowl;
  const seconds = dt / 1000;
  const vy = bowl.vy + GRAVITY * seconds;
  const y = bowl.y + vy * seconds;
  return y >= TABLE_Y ? { ...bowl, y: TABLE_Y, vy: 0 } : { ...bowl, y, vy };
}

/** 그릇이 (dx, dy)만큼 움직일 때 담긴 잡곡(where = left)도 함께 옮긴다. 움직임이 없거나 담긴 것이 없으면 같은 배열. */
export function carryInBowl(grains, dx, dy) {
  if ((dx === 0 && dy === 0) || !grains.some((grain) => grain.where === 'left')) return grains;
  return grains.map((grain) => (grain.where === 'left' ? { ...grain, x: grain.x + dx, y: grain.y + dy } : grain));
}
