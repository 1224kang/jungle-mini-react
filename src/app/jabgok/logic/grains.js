import { DEADZONE_RATIO, FLING, FOLLOW, GRAB_MARGIN, GRAIN_TYPES, GRAVITY, ROT, TABLE_Y, WORLD } from '../config.js';
import { bowlBox, clampToWorld, landingOf, surfaceY, touchesWall } from './world.js';

// 잡곡 판정은 모두 순수 함수다. DOM·시계·난수에 기대지 않아 브라우저 없이 경계값까지 테스트한다.
// 잡곡: { id, type, x, y, vy, where, rot? }. x·y는 중심의 월드 좌표,
// where = left · held · falling · floor · right · rotten. rot은 썩어 가는 단계(0~5).

/** 더미가 퍼지는 폭(그릇 중심에서 ±px). 벽에 닿지 않게 안쪽 폭보다 좁다. */
const PILE_SPREAD = 95;

/** 한 알을 놓을 때 살펴보는 후보 자리 수. */
const PILE_TRIES = 4;

/** 남은 거리가 이보다 작으면 도착으로 본다. (끝없이 이어지는 미세 이동으로 렌더가 생기지 않게) */
const ARRIVE = 0.01;

export const radiusOf = (type) => GRAIN_TYPES[type].diameter / 2;

/** 데드존 반지름 = 잡곡 지름 × 3 ÷ 2. (쌀: 12px) */
export const deadRadiusOf = (type) => (GRAIN_TYPES[type].diameter * DEADZONE_RATIO) / 2;

/** 시드 하나로 같은 수열을 내는 난수 (mulberry32). */
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 왼쪽 그릇에 잡곡 40알을 더미로 쌓는다. 같은 시드면 같은 배치다.
 * 한 알씩 위에서 곧장 떨어뜨려, 바닥이나 먼저 놓인 알에 처음 닿는 높이에 놓는다. (겹치지 않음)
 * 한 알을 빼도 나머지는 무너지지 않는다. (단순화: 잡곡끼리는 서로 밀지 않는다)
 * @param {number} seed 배치 시드
 * @param {number} [round] 판 번호. id에 넣어 다시 하기 때 key가 모두 바뀌게 한다.
 * @returns {object[]} 잡곡 배열 (뒤쪽일수록 위에 그려진다)
 */
export function createGrains(seed, round = 0) {
  const random = createRandom(seed);
  const types = Object.entries(GRAIN_TYPES).flatMap(([type, spec]) => new Array(spec.count).fill(type));
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  const box = bowlBox('left');
  const placed = [];
  /** 중심 x에서 곧장 떨어뜨렸을 때 멈추는 중심 y. */
  const restAt = (x, r) => {
    let y = box.floorY - r;
    for (const other of placed) {
      const reach = r + radiusOf(other.type);
      const dx = Math.abs(x - other.x);
      if (dx < reach) y = Math.min(y, other.y - Math.sqrt(reach * reach - dx * dx));
    }
    return y;
  };
  types.forEach((type, n) => {
    const r = radiusOf(type);
    // 후보 자리 몇 곳 중 가장 낮은 곳에 놓는다. 한 줄로 높이 솟지 않고 옆으로 퍼진 더미가 된다.
    let best = null;
    for (let i = 0; i < PILE_TRIES; i++) {
      const x = Math.round((box.cx + (random() + random() - 1) * PILE_SPREAD) * 10) / 10;
      const y = restAt(x, r);
      if (best === null || y > best.y) best = { x, y };
    }
    placed.push({ id: `g${round}-${n}`, type, x: best.x, y: best.y, vy: 0, where: 'left' });
  });
  return placed;
}

/** 잡을 수 있는 곳: 왼쪽 그릇과 테이블. 오른쪽 그릇에 들어간 잡곡과 썩은 잡곡은 잡을 수 없다. */
const canGrab = (grain) => grain.where === 'left' || grain.where === 'floor';

/**
 * 누른 지점에서 잡을 잡곡을 고른다. 위에 그려진(배열 뒤쪽) 잡곡부터 판정해 1알만 고른다.
 * 판정: 누른 지점과 잡곡 중심의 거리 ≤ 반지름 + 2px.
 * @param {object[]} grains
 * @param {{x: number, y: number}} point 월드 좌표
 * @returns {number} 잡곡의 배열 인덱스, 없으면 -1
 */
export function pickGrain(grains, point) {
  for (let i = grains.length - 1; i >= 0; i--) {
    const grain = grains[i];
    if (!canGrab(grain)) continue;
    const reach = radiusOf(grain.type) + GRAB_MARGIN;
    if (Math.hypot(point.x - grain.x, point.y - grain.y) <= reach) return i;
  }
  return -1;
}

/** index의 잡곡을 잡는다. 맨 위에 그려지도록 배열 끝으로 옮긴다. (key가 같아 DOM 노드는 재사용된다) */
export function grab(grains, index) {
  const next = grains.filter((_, i) => i !== index);
  next.push({ ...grains[index], vy: 0, where: 'held' });
  return next;
}

/** 들고 있는 잡곡(id)을 그 자리에서 놓는다. 들고 있지 않으면 같은 배열을 돌려준다. */
export function release(grains, id) {
  const index = grains.findIndex((grain) => grain.id === id && grain.where === 'held');
  if (index === -1) return grains;
  const next = grains.slice();
  next[index] = drop(grains[index]);
  return next;
}

const drop = (grain) => ({ ...grain, vx: 0, vy: 0, where: 'falling', flung: false });

/**
 * 한 프레임의 따라오기 이동. 이동 비율 k = 1 - (1 - 0.08)^(dt / 16.7)이라 프레임 간격이 달라도 속도가 같다.
 * 이동량은 k × 남은 거리를 180 × dt / 1000 px에서 자른다.
 * @returns {{x: number, y: number}} 새 중심. 이미 도착했으면 받은 좌표 그대로.
 */
export function follow(x, y, targetX, targetY, dt) {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance < ARRIVE) return { x, y };
  const k = 1 - (1 - FOLLOW.ratio) ** (dt / FOLLOW.frame);
  const move = Math.min(k * distance, (FOLLOW.maxSpeed * dt) / 1000);
  return { x: x + (dx / distance) * move, y: y + (dy / distance) * move };
}

/** (x0, y0)에서 (x1, y1)로 가는 길에 벽에 처음 닿는 지점. 닿지 않으면 null. (빠른 이동이 벽을 건너뛰지 않게 잘게 나눠 본다) */
function firstWallTouch(x0, y0, x1, y1, r, bowl) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / Math.max(r, 2)));
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (touchesWall(x, y, r, bowl)) return { x, y };
  }
  return null;
}

/**
 * 든 잡곡의 한 프레임.
 * 잡곡은 월드에 고정돼 있고 마우스로만 옮긴다. (카메라 구간을 옮기면 들고 있던 잡곡은 떨어진다)
 * 1) 포인터가 데드존 밖이면 그 자리에서 떨어진다.
 * 2) 포인터를 향해 따라온다. (최대 180px/초)
 * 3) 가는 길에 그릇 벽에 닿으면 그 자리에서 떨어진다.
 */
function stepHeld(grain, pointer, dt, bowl) {
  if (!pointer) return drop(grain);
  const r = radiusOf(grain.type);
  const deadRadius = pointer.deadRadius ?? deadRadiusOf(grain.type);
  if (Math.hypot(pointer.x - grain.x, pointer.y - grain.y) > deadRadius) return drop(grain);

  const moved = follow(grain.x, grain.y, pointer.x, pointer.y, dt);
  const next = clampToWorld(moved.x, moved.y, r, bowl);
  const touch = firstWallTouch(grain.x, grain.y, next.x, next.y, r, bowl);
  if (touch) return drop({ ...grain, ...touch });
  if (next.x === grain.x && next.y === grain.y) return grain;
  return { ...grain, ...next };
}

/**
 * 떨어지는 잡곡의 한 프레임. 중력 1800px/s²로 곧장 아래로 떨어지고, 면에 닿으면 멈춘다. (구르기·튀김 없음)
 * 림 높이에 닿을 때 벽에 걸쳐 있으면 중심이 림 안쪽인지 바깥쪽인지에 따라 벽 옆으로 비켜 떨어진다.
 */
function stepFalling(grain, dt, bowl) {
  const r = radiusOf(grain.type);
  const seconds = dt / 1000;
  let vy = grain.vy + GRAVITY * seconds;
  let y = grain.y + vy * seconds;
  if (y < r) {
    // 월드 천장에 닿으면 위로 가던 속도를 잃는다
    y = r;
    vy = 0;
  }

  // 날아가는 잡곡(흔들기)은 옆으로도 움직인다. 그릇 벽이나 월드 끝에 닿으면 옆 속도를 잃고 그 자리에서 곧장 떨어진다.
  // 한 프레임에 수십 px씩 날아가므로, 가는 길을 잘게 나눠 벽을 건너뛰지 않게 한다.
  let vx = grain.vx ?? 0;
  let x = grain.x;
  if (vx !== 0) {
    const targetX = Math.min(Math.max(grain.x + vx * seconds, r), WORLD.width - r);
    if (targetX !== grain.x + vx * seconds) vx = 0; // 월드 끝
    const steps = Math.max(1, Math.ceil(Math.hypot(targetX - grain.x, y - grain.y) / Math.max(r, 2)));
    let reachedY = grain.y;
    for (let i = 1; i <= steps; i++) {
      const sx = grain.x + ((targetX - grain.x) * i) / steps;
      const sy = grain.y + ((y - grain.y) * i) / steps;
      if (touchesWall(sx, sy, r, bowl)) {
        vx = 0;
        break;
      }
      x = sx;
      reachedY = sy;
    }
    y = reachedY;
  }

  const landing = landingOf(x, r, bowl, grain.y);
  if (y >= landing.y) return { ...grain, x: landing.x, y: landing.y, vx: 0, vy: 0, where: landing.where, flung: false };
  if (vx === 0 && y + r >= landing.rimY) x = landing.x;
  return { ...grain, x, y, vx, vy };
}

/**
 * 흔들기: 들고 있던 잡곡, 테이블에 놓인 잡곡, 잡곡 그릇에 담긴 잡곡이 저마다 무작위 방향(위쪽 반원) · 무작위 힘으로 날아간다.
 * 잡곡 그릇에 담긴 잡곡은 훨씬 약하게 날아간다. 오른쪽 그릇에 들어간 잡곡과 썩은 잡곡은 그대로다. 날아갈 잡곡이 없으면 같은 배열을 돌려준다.
 * 들고 있지 않던 잡곡에는 flung 표시를 한다. 이런 잡곡은 테이블에 떨어졌을 때만 "떨어뜨린 횟수"로 센다.
 * @param {object[]} grains
 * @param {() => number} random 0 이상 1 미만의 난수를 내는 함수 (순수 함수로 두려고 밖에서 받는다)
 */
export function fling(grains, random) {
  let next = null;
  for (let i = 0; i < grains.length; i++) {
    const grain = grains[i];
    if (grain.where !== 'held' && grain.where !== 'floor' && grain.where !== 'left') continue;
    const angle = Math.PI * (1.1 + 0.8 * random()); // 198° ~ 342°: 화면에서 위쪽
    // 잡곡 그릇 안의 잡곡은 덜 흔들린다
    const scale = grain.where === 'left' ? FLING.bowlScale : 1;
    const speed = (FLING.min + (FLING.max - FLING.min) * random()) * scale;
    next ??= grains.slice();
    next[i] = {
      ...grain,
      where: 'falling',
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      flung: grain.where !== 'held',
    };
  }
  return next ?? grains;
}

/**
 * 한 프레임을 진행한다. 따라오기, 데드존 판정, 낙하 진행, 착지 판정이 모두 여기에 있다.
 * 누구도 잡지 않았고 떨어지는 것도 없으면(또는 움직임이 없으면) 받은 배열을 그대로 돌려준다. → 렌더 0회
 * @param {object[]} grains
 * @param {object|null} pointer 포인터: { x, y } 월드 좌표,
 *   deadRadius(생략하면 잡곡 종류에서 계산). null이면 든 잡곡은 떨어진다.
 * @param {number} dt 프레임 간격(ms)
 * @param {{x: number, y: number}} [bowl] 왼쪽 그릇의 위치 (가운데 x, 밑변 y). 생략하면 처음 자리.
 * @returns {object[]} 새 잡곡 배열 (순서는 그대로)
 */
export function step(grains, pointer, dt, bowl) {
  let next = null;
  for (let i = 0; i < grains.length; i++) {
    const grain = grains[i];
    let moved = grain;
    if (grain.where === 'held') moved = stepHeld(grain, pointer, dt, bowl);
    else if (grain.where === 'falling') moved = stepFalling(grain, dt, bowl);
    if (moved !== grain) {
      next ??= grains.slice();
      next[i] = moved;
    }
  }
  return next ?? grains;
}

/** 땅(테이블 면)에 닿아 있는가. 테이블에 놓인 잡곡, 그리고 들고 끄는 중이라도 테이블 면에 붙어 있는 잡곡. */
export function onGround(grain, bowl) {
  if (grain.where === 'floor') return true;
  if (grain.where !== 'held') return false;
  return surfaceY(grain.x, bowl, grain.y) === TABLE_Y && grain.y >= TABLE_Y - radiusOf(grain.type) - 0.5;
}

/**
 * 썩기를 한 프레임 진행한다. 땅에 닿아 있던 시간의 합이 ROT.limit(5초)을 넘으면 썩는다(where = rotten).
 * 닿은 시간은 times(잡곡 id → ms)에 따로 쌓고, 잡곡의 rot(0~4, 1초마다 한 단계)이 바뀔 때만 잡곡을 새로 만든다.
 * 그래서 땅에 잡곡이 놓여 있어도 렌더는 1초에 한 번뿐이다. 땅에 닿은 잡곡이 없으면 받은 값을 그대로 돌려준다.
 * @param {object[]} grains
 * @param {Object<string, number>} times 잡곡 id → 땅에 닿아 있던 시간의 합(ms)
 * @param {number} dt 프레임 간격(ms)
 * @returns {{grains: object[], times: Object<string, number>}}
 */
export function stepRot(grains, times, dt, bowl) {
  let nextGrains = null;
  let nextTimes = null;
  for (let i = 0; i < grains.length; i++) {
    const grain = grains[i];
    if (!onGround(grain, bowl)) continue;
    nextTimes ??= { ...times };
    const elapsed = (nextTimes[grain.id] ?? 0) + dt;
    nextTimes[grain.id] = elapsed;
    const rotten = elapsed >= ROT.limit;
    const rot = Math.min(ROT.levels - 1, Math.floor((elapsed / ROT.limit) * ROT.levels));
    if (!rotten && rot === (grain.rot ?? 0)) continue;
    nextGrains ??= grains.slice();
    nextGrains[i] = rotten
      ? { ...grain, rot: ROT.levels, vy: 0, y: TABLE_Y - radiusOf(grain.type), where: 'rotten' }
      : { ...grain, rot };
  }
  return { grains: nextGrains ?? grains, times: nextTimes ?? times };
}

/** 이번 프레임에 오른쪽 그릇이 아닌 곳에 떨어져 멈춘 잡곡 수 (= 떨어뜨린 횟수의 증가분). 두 배열은 순서가 같아야 한다. */
export function countMisses(before, after) {
  let misses = 0;
  for (let i = 0; i < after.length; i++) {
    if (before[i].where !== 'falling') continue;
    // 흔들기로 날아간 잡곡은 테이블에 떨어졌을 때만 센다. (있던 그릇에 도로 담기면 떨어뜨린 것이 아니다)
    if (after[i].where === 'floor' || (after[i].where === 'left' && !before[i].flung)) misses += 1;
  }
  return misses;
}

/**
 * 점수 · 옮긴 개수 · 왼쪽 그릇에 남은 알 · 종류별 집계.
 * @returns {{score: number, moved: number, remaining: number, byType: Object<string, number>}}
 */
export function summarize(grains) {
  const byType = Object.fromEntries(Object.keys(GRAIN_TYPES).map((type) => [type, 0]));
  let score = 0;
  let moved = 0;
  let remaining = 0;
  let rotten = 0;
  for (const grain of grains) {
    if (grain.where === 'left') remaining += 1;
    if (grain.where === 'rotten') rotten += 1;
    if (grain.where !== 'right') continue;
    moved += 1;
    score += GRAIN_TYPES[grain.type].points;
    byType[grain.type] += 1;
  }
  return { score, moved, remaining, rotten, byType };
}
