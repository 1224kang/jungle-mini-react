import { describe, it, expect } from 'vitest';
import { FLING, GRAIN_TYPES, TABLE_Y } from '../../../src/app/jabgok/config.js';
import {
  countMisses,
  createGrains,
  deadRadiusOf,
  fling,
  follow,
  grab,
  pickGrain,
  radiusOf,
  release,
  step,
  summarize,
} from '../../../src/app/jabgok/logic/grains.js';
import { RIM_Y, bowlBox, landingOf, touchesWall } from '../../../src/app/jabgok/logic/world.js';

const FRAME = 1000 / 60;
const grain = (over = {}) => ({ id: 'a', type: 'rice', x: 1000, y: 400, vy: 0, where: 'floor', ...over });
/** 월드 좌표의 포인터 */
const pointerAt = (x, y) => ({ x, y });
const right = bowlBox('right');
const left = bowlBox('left');

describe('잡곡 배치', () => {
  it('40알, 종류별 개수가 기획서와 같고 모두 왼쪽 그릇에 있다', () => {
    const grains = createGrains(7);
    expect(grains).toHaveLength(40);
    for (const [type, spec] of Object.entries(GRAIN_TYPES)) {
      expect(grains.filter((g) => g.type === type)).toHaveLength(spec.count);
    }
    expect(grains.every((g) => g.where === 'left')).toBe(true);
    expect(new Set(grains.map((g) => g.id)).size).toBe(40);
  });

  it('같은 시드에서 같은 배치, 다른 시드에서 다른 배치', () => {
    expect(createGrains(42)).toEqual(createGrains(42));
    expect(createGrains(42)).not.toEqual(createGrains(43));
  });

  it('판 번호가 다르면 id가 모두 바뀐다 (다시 하기 때 key가 바뀜)', () => {
    const first = new Set(createGrains(1, 0).map((g) => g.id));
    expect(createGrains(1, 1).some((g) => first.has(g.id))).toBe(false);
  });

  it('더미는 그릇 안에 있고(벽 · 림에 닿지 않음) 서로 겹치지 않는다', () => {
    for (const seed of [1, 2, 3, 99]) {
      const grains = createGrains(seed);
      for (const g of grains) {
        const r = radiusOf(g.type);
        expect(g.x - r).toBeGreaterThan(left.innerLeft);
        expect(g.x + r).toBeLessThan(left.innerRight);
        expect(g.y - r).toBeGreaterThan(RIM_Y);
        expect(g.y + r).toBeLessThanOrEqual(left.floorY + 1e-9);
        expect(touchesWall(g.x, g.y, r)).toBe(false);
      }
      for (let i = 0; i < grains.length; i++) {
        for (let j = i + 1; j < grains.length; j++) {
          const gap = Math.hypot(grains[i].x - grains[j].x, grains[i].y - grains[j].y);
          expect(gap).toBeGreaterThanOrEqual(radiusOf(grains[i].type) + radiusOf(grains[j].type) - 1e-6);
        }
      }
    }
  });
});

describe('잡기 판정', () => {
  it('반지름 + 2px는 잡히고, + 2.01px는 안 잡힌다 (쌀: 6px)', () => {
    const grains = [grain()];
    expect(pickGrain(grains, { x: 1006, y: 400 })).toBe(0);
    expect(pickGrain(grains, { x: 1006.01, y: 400 })).toBe(-1);
  });

  it('겹친 곳을 누르면 위에 그려진(배열 뒤쪽) 잡곡 1알만 잡는다', () => {
    const grains = [grain({ id: 'a' }), grain({ id: 'b', x: 1003 })];
    expect(pickGrain(grains, { x: 1001, y: 400 })).toBe(1);
  });

  it('오른쪽 그릇에 들어간 잡곡 · 떨어지는 잡곡은 잡을 수 없다', () => {
    expect(pickGrain([grain({ where: 'right' })], { x: 1000, y: 400 })).toBe(-1);
    expect(pickGrain([grain({ where: 'falling' })], { x: 1000, y: 400 })).toBe(-1);
    expect(pickGrain([grain({ where: 'left' })], { x: 1000, y: 400 })).toBe(0);
  });

  it('잡은 잡곡은 배열 끝으로 옮겨지고 held가 된다. 입력은 수정하지 않는다', () => {
    const grains = [grain({ id: 'a' }), grain({ id: 'b' }), grain({ id: 'c' })];
    const next = grab(grains, 0);
    expect(next.map((g) => g.id)).toEqual(['b', 'c', 'a']);
    expect(next[2].where).toBe('held');
    expect(grains[0].where).toBe('floor');
  });
});

describe('데드존', () => {
  it('데드존 지름은 잡곡 지름의 3배 (쌀 반지름 12px, 조 7.5px)', () => {
    expect(deadRadiusOf('bean')).toBe(21);
    expect(deadRadiusOf('redbean')).toBe(15);
    expect(deadRadiusOf('rice')).toBe(12);
    expect(deadRadiusOf('millet')).toBe(7.5);
  });

  it('포인터가 중심에서 12px이면 따라오고, 12.01px이면 그 자리에서 떨어진다', () => {
    const held = [grain({ where: 'held' })];
    const inside = step(held, pointerAt(1012, 400), FRAME);
    expect(inside[0].where).toBe('held');
    expect(inside[0].x).toBeGreaterThan(1000);

    const outside = step(held, pointerAt(1012.01, 400), FRAME);
    expect(outside[0]).toMatchObject({ where: 'falling', x: 1000, y: 400, vy: 0 });
  });

  it('포인터가 없으면(null) 든 잡곡은 떨어진다', () => {
    expect(step([grain({ where: 'held' })], null, FRAME)[0].where).toBe('falling');
  });
});

describe('따라오기', () => {
  it('16.7ms에 남은 거리의 8%만큼 이동한다', () => {
    const moved = follow(0, 0, 10, 0, 16.7);
    expect(moved.x).toBeCloseTo(0.8, 10);
    expect(moved.y).toBe(0);
  });

  it('이동량이 16.5ms × 2번과 33ms × 1번에서 같다 (프레임 간격과 무관)', () => {
    const once = follow(0, 0, 10, 0, 33);
    const half = follow(0, 0, 10, 0, 16.5);
    const twice = follow(half.x, half.y, 10, 0, 16.5);
    expect(twice.x).toBeCloseTo(once.x, 10);
  });

  it('16ms × 2번과 33ms × 1번의 이동량이 거의 같다', () => {
    const once = follow(0, 0, 10, 0, 33);
    const half = follow(0, 0, 10, 0, 16);
    const twice = follow(half.x, half.y, 10, 0, 16);
    expect(Math.abs(twice.x - once.x)).toBeLessThan(0.05);
  });

  it('최대 180px/초에서 잘린다', () => {
    const moved = follow(0, 0, 1000, 0, 16.7);
    expect(moved.x).toBeCloseTo((180 * 16.7) / 1000, 10);
  });

  it('멈춘 포인터에 약 0.5초 뒤 도착한다 (남은 거리 10% 미만)', () => {
    let pos = { x: 0, y: 0 };
    for (let i = 0; i < 30; i++) pos = follow(pos.x, pos.y, 10, 0, FRAME);
    expect(10 - pos.x).toBeLessThan(1);
  });

  it('도착한 뒤에는 같은 배열을 돌려준다 (렌더 0회)', () => {
    const held = [grain({ where: 'held' })];
    expect(step(held, pointerAt(1000, 400), FRAME)).toBe(held);
  });

  it('아무도 잡지 않았고 떨어지는 것도 없으면 같은 배열을 돌려준다', () => {
    const grains = createGrains(5);
    expect(step(grains, pointerAt(500, 500), FRAME)).toBe(grains);
  });

  it('든 잡곡은 월드에 고정이다: 포인터가 멀어지면 따라오기 속도로만 쫓아간다', () => {
    const held = [grain({ where: 'held' })];
    const next = step(held, pointerAt(1010, 400), 16.7);
    expect(next[0].where).toBe('held');
    expect(next[0].x).toBeCloseTo(1000.8, 10);
  });

  it('구간이 바뀌어 포인터가 데드존을 벗어나면 그 자리에서 떨어진다', () => {
    const held = [grain({ where: 'held' })];
    const next = step(held, pointerAt(1030, 400), FRAME);
    expect(next[0]).toMatchObject({ where: 'falling', x: 1000, y: 400 });
  });

  it('든 잡곡은 테이블 면 아래로 내려가지 않는다', () => {
    const r = radiusOf('rice');
    const held = [grain({ where: 'held', y: TABLE_Y - r })];
    const next = step(held, pointerAt(1000, TABLE_Y + 5), FRAME);
    expect(next).toBe(held);
  });
});

describe('그릇 벽', () => {
  it('든 잡곡이 그릇 벽에 닿으면 그 자리에서 떨어진다', () => {
    const r = radiusOf('bean');
    // 오른쪽 그릇 왼쪽 벽 바로 바깥, 림보다 낮은 높이에서 벽 쪽으로 끈다.
    let grains = [grain({ type: 'bean', where: 'held', x: right.outerLeft - r - 3, y: RIM_Y + 40 })];
    for (let i = 0; i < 120 && grains[0].where === 'held'; i++) {
      grains = step(grains, pointerAt(grains[0].x + 12, RIM_Y + 40), FRAME);
    }
    expect(grains[0].where).toBe('falling');
    expect(grains[0].x).toBeLessThan(right.outerLeft);
    expect(grains[0].x).toBeGreaterThanOrEqual(right.outerLeft - r - 1e-6);
  });

  it('벽을 넘을 만큼 들어 올리면 닿지 않는다', () => {
    const r = radiusOf('bean');
    const held = [grain({ type: 'bean', where: 'held', x: right.outerLeft - r - 3, y: RIM_Y - r - 5 })];
    let grains = held;
    for (let i = 0; i < 300; i++) grains = step(grains, pointerAt(grains[0].x + 12, RIM_Y - r - 5), FRAME);
    expect(grains[0].where).toBe('held');
    expect(grains[0].x).toBeGreaterThan(right.innerLeft);
  });

  it('긴 프레임(50ms)에 크게 움직여도 벽을 건너뛰지 않는다', () => {
    const r = radiusOf('bean');
    const held = [grain({ type: 'bean', where: 'held', x: right.outerLeft - r - 2, y: RIM_Y + 40 })];
    const next = step(held, pointerAt(right.outerLeft + 12, RIM_Y + 40), 50);
    expect(next[0].where).toBe('falling');
    expect(next[0].x).toBeLessThan(right.innerLeft);
  });
});

describe('낙하와 착지', () => {
  /** 멈출 때까지 프레임을 돌리고 걸린 시간(초)을 돌려준다. */
  function fall(start) {
    let grains = [start];
    let frames = 0;
    while (grains[0].where === 'falling' && frames < 1000) {
      grains = step(grains, null, FRAME);
      frames += 1;
    }
    return { grain: grains[0], seconds: frames / 60 };
  }

  it('300px 높이에서 떨어지면 약 0.58초 걸린다 (중력 1800px/s²)', () => {
    const r = radiusOf('rice');
    const { grain: landed, seconds } = fall(grain({ where: 'falling', x: 1400, y: TABLE_Y - r - 300 }));
    expect(landed.where).toBe('floor');
    expect(seconds).toBeGreaterThan(0.54);
    expect(seconds).toBeLessThan(0.62);
  });

  it('곧장 아래로 떨어진다 (x는 그대로) · 테이블 면에 닿으면 바닥', () => {
    const r = radiusOf('rice');
    const { grain: landed } = fall(grain({ where: 'falling', x: 1400, y: 300 }));
    expect(landed).toMatchObject({ where: 'floor', x: 1400, y: TABLE_Y - r, vy: 0 });
  });

  it('오른쪽 그릇 안쪽 바닥에 닿으면 득점 (right)', () => {
    const r = radiusOf('millet');
    const { grain: landed } = fall(grain({ type: 'millet', where: 'falling', x: right.cx, y: RIM_Y - 30 }));
    expect(landed).toMatchObject({ where: 'right', x: right.cx, y: right.floorY - r });
  });

  it('왼쪽 그릇 위에서 떨어지면 다시 왼쪽 그릇 (left)', () => {
    const { grain: landed } = fall(grain({ where: 'falling', x: left.cx, y: RIM_Y - 30 }));
    expect(landed.where).toBe('left');
  });

  it('림 위: 중심이 림 안쪽이면 그릇 안, 바깥쪽이면 테이블', () => {
    const r = radiusOf('bean');
    const rimMiddle = right.outerLeft + (right.innerLeft - right.outerLeft) / 2;

    const inside = fall(grain({ type: 'bean', where: 'falling', x: rimMiddle + 1, y: RIM_Y - 40 })).grain;
    expect(inside.where).toBe('right');
    expect(inside.x).toBeGreaterThanOrEqual(right.innerLeft + r);
    expect(touchesWall(inside.x, inside.y, r)).toBe(false);

    const outside = fall(grain({ type: 'bean', where: 'falling', x: rimMiddle - 1, y: RIM_Y - 40 })).grain;
    expect(outside.where).toBe('floor');
    expect(outside.x).toBeLessThanOrEqual(right.outerLeft - r);
    expect(outside.y).toBe(TABLE_Y - r);
    expect(touchesWall(outside.x, outside.y, r)).toBe(false);
  });

  it('landingOf: 그릇에서 먼 곳은 x 그대로 테이블', () => {
    expect(landingOf(1400, 4)).toMatchObject({ x: 1400, y: TABLE_Y - 4, where: 'floor' });
  });

  it('놓기: 들고 있던 잡곡만 falling이 되고, 없으면 같은 배열', () => {
    const grains = [grain({ id: 'a' }), grain({ id: 'b', where: 'held' })];
    const next = release(grains, 'b');
    expect(next[1]).toMatchObject({ where: 'falling', vy: 0 });
    expect(next[0]).toBe(grains[0]);
    expect(release(grains, 'a')).toBe(grains);
    expect(release(grains, 'none')).toBe(grains);
  });
});

describe('집계', () => {
  it('점수는 오른쪽 그릇에 들어간 잡곡만 센다', () => {
    const grains = [
      grain({ id: '1', type: 'bean', where: 'right' }),
      grain({ id: '2', type: 'millet', where: 'right' }),
      grain({ id: '3', type: 'millet', where: 'falling' }),
      grain({ id: '4', type: 'rice', where: 'left' }),
      grain({ id: '5', type: 'redbean', where: 'floor' }),
      grain({ id: '6', type: 'redbean', where: 'held' }),
    ];
    expect(summarize(grains)).toEqual({
      score: 4,
      moved: 2,
      remaining: 1,
      rotten: 0,
      byType: { bean: 1, redbean: 0, rice: 0, millet: 1 },
    });
  });

  it('전체를 옮기면 80점이다', () => {
    const all = createGrains(1).map((g) => ({ ...g, where: 'right' }));
    expect(summarize(all).score).toBe(80);
  });

  it('떨어뜨린 횟수: 오른쪽 그릇이 아닌 곳에 멈춘 잡곡만 센다', () => {
    const before = [grain({ id: '1', where: 'falling' }), grain({ id: '2', where: 'falling' }), grain({ id: '3', where: 'falling' })];
    const after = [grain({ id: '1', where: 'floor' }), grain({ id: '2', where: 'right' }), grain({ id: '3', where: 'falling' })];
    expect(countMisses(before, after)).toBe(1);
  });
});

describe('흔들기: 잡곡 날리기', () => {
  /** 정해진 값을 차례로 돌려주는 가짜 난수 */
  const sequence = (...values) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it('들고 있던 잡곡 · 테이블 위의 잡곡 · 잡곡 그릇 안의 잡곡이 날아간다. 오른쪽 그릇 · 썩은 잡곡은 그대로', () => {
    const grains = [
      grain({ id: 'held', where: 'held' }),
      grain({ id: 'floor', where: 'floor' }),
      grain({ id: 'left', where: 'left' }),
      grain({ id: 'right', where: 'right' }),
      grain({ id: 'rotten', where: 'rotten' }),
    ];
    const next = fling(grains, sequence(0.5));
    expect(next.map((g) => g.where)).toEqual(['falling', 'falling', 'falling', 'right', 'rotten']);
    expect(next[3]).toBe(grains[3]);
    // 들고 있던 잡곡만 "떨어뜨린 횟수"로 센다
    expect(next.map((g) => g.flung)).toEqual([false, true, true, undefined, undefined]);
    expect(grains[0].where).toBe('held'); // 입력은 그대로
  });

  it('날아갈 잡곡이 없으면 같은 배열을 돌려준다', () => {
    const grains = [grain({ where: 'rotten' }), grain({ id: 'b', where: 'right' })];
    expect(fling(grains, sequence(0.5))).toBe(grains);
  });

  it('방향과 힘은 난수로 정한다: 힘은 250~750px/s, 방향은 위쪽', () => {
    const one = [grain({ where: 'held' })];
    const weakLeft = fling(one, sequence(0, 0))[0];
    expect(Math.hypot(weakLeft.vx, weakLeft.vy)).toBeCloseTo(FLING.min, 6);
    expect(weakLeft.vx).toBeLessThan(0);
    expect(weakLeft.vy).toBeLessThan(0);

    const strongRight = fling(one, sequence(0.999, 0.999))[0];
    expect(Math.hypot(strongRight.vx, strongRight.vy)).toBeGreaterThan(FLING.max - 2);
    expect(strongRight.vx).toBeGreaterThan(0);
    expect(strongRight.vy).toBeLessThan(0);

    const straightUp = fling(one, sequence(0.5, 0.5))[0];
    expect(straightUp.vx).toBeCloseTo(0, 6);
    expect(straightUp.vy).toBeCloseTo(-(FLING.min + FLING.max) / 2, 6);
  });

  it('잡곡마다 방향과 힘이 다르다', () => {
    const grains = [grain({ id: 'a', where: 'floor' }), grain({ id: 'b', where: 'floor' })];
    const [a, b] = fling(grains, sequence(0.1, 0.2, 0.8, 0.9));
    expect(a.vx).not.toBeCloseTo(b.vx, 3);
    expect(Math.hypot(a.vx, a.vy)).not.toBeCloseTo(Math.hypot(b.vx, b.vy), 3);
  });

  it('날아간 잡곡은 포물선을 그리며 옆으로 옮겨져 떨어진다', () => {
    const r = radiusOf('rice');
    let grains = [grain({ where: 'falling', x: 1400, y: TABLE_Y - r, vx: 300, vy: -600 })];
    let top = grains[0].y;
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) {
      grains = step(grains, null, FRAME);
      top = Math.min(top, grains[0].y);
    }
    expect(top).toBeLessThan(TABLE_Y - r - 80); // 위로 솟았다가
    expect(grains[0]).toMatchObject({ where: 'floor', y: TABLE_Y - r, vx: 0, vy: 0 });
    expect(grains[0].x).toBeGreaterThan(1400 + 150); // 옆으로 날아가 떨어진다
  });

  it('날아가다 그릇 벽에 닿으면 옆 속도를 잃고 그 자리에서 떨어진다 (벽을 뚫지 않는다)', () => {
    const r = radiusOf('rice');
    let grains = [grain({ where: 'falling', x: right.outerLeft - 40, y: RIM_Y + 60, vx: 600, vy: -100 })];
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) grains = step(grains, null, FRAME);
    expect(grains[0].where).toBe('floor');
    expect(grains[0].x).toBeLessThan(right.outerLeft);
    expect(touchesWall(grains[0].x, grains[0].y, r)).toBe(false);
  });

  it('그릇 위로 날아들면 그릇에 담긴다 (오른쪽 그릇이면 득점)', () => {
    let grains = [grain({ where: 'falling', x: right.outerLeft - 60, y: RIM_Y - 40, vx: 400, vy: -200 })];
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) grains = step(grains, null, FRAME);
    expect(grains[0].where).toBe('right');
  });

  it('월드 끝을 넘어가지 않는다', () => {
    const r = radiusOf('rice');
    let grains = [grain({ where: 'falling', x: 20, y: 600, vx: -700, vy: -700 })];
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) {
      grains = step(grains, null, FRAME);
      expect(grains[0].x).toBeGreaterThanOrEqual(r);
      expect(grains[0].y).toBeGreaterThanOrEqual(r);
    }
    expect(grains[0].where).toBe('floor');
  });

  it('잡곡 그릇 안의 잡곡은 같은 난수에서도 0.4배로 약하게 날아간다', () => {
    const grains = [grain({ id: 'floor', where: 'floor' }), grain({ id: 'left', where: 'left' })];
    const [onTable, inBowl] = fling(grains, sequence(0.5, 0.5));
    expect(Math.hypot(onTable.vx, onTable.vy)).toBeCloseTo(500, 6);
    expect(Math.hypot(inBowl.vx, inBowl.vy)).toBeCloseTo(500 * FLING.bowlScale, 6);
    // 가장 세게 곧장 위로 날아도 림(그릇 높이 140px)을 넘지 못한다
    expect((FLING.max * FLING.bowlScale) ** 2 / (2 * 1800)).toBeLessThan(140 - 60);
  });

  it('아주 빠르게 날아가도(한 프레임에 30px 넘게) 그릇 벽을 건너뛰지 않는다', () => {
    const r = radiusOf('millet');
    let grains = [grain({ type: 'millet', where: 'falling', x: right.outerLeft - 300, y: RIM_Y + 70, vx: 2200, vy: -50 })];
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) grains = step(grains, null, 50);
    expect(grains[0].where).toBe('floor');
    expect(grains[0].x).toBeLessThan(right.outerLeft);
    expect(touchesWall(grains[0].x, grains[0].y, r)).toBe(false);
  });

  it('잡곡 그릇 안에서 옆으로 날아간 잡곡은 안쪽 벽에 막혀 그릇 안에 다시 떨어진다', () => {
    let grains = [grain({ where: 'falling', x: left.cx, y: left.floorY - 4, vx: 1500, vy: -100 })];
    for (let i = 0; i < 300 && grains[0].where === 'falling'; i++) grains = step(grains, null, FRAME);
    expect(grains[0].where).toBe('left');
    expect(grains[0].x).toBeLessThan(left.innerRight);
  });

  it('흔들기로 날아간 잡곡도 테이블에 떨어지면 떨어뜨린 횟수로 센다. 있던 그릇에 도로 담기면 세지 않는다', () => {
    const before = [
      grain({ id: '1', where: 'falling', flung: true }),
      grain({ id: '2', where: 'falling', flung: true }),
      grain({ id: '3', where: 'falling', flung: true }),
      grain({ id: '4', where: 'falling', flung: false }),
      grain({ id: '5', where: 'falling' }),
    ];
    const after = [
      { ...before[0], where: 'floor' }, // 그릇 밖 테이블: 센다
      { ...before[1], where: 'left' }, // 그릇에 도로 담김: 세지 않는다
      { ...before[2], where: 'right' }, // 득점: 세지 않는다
      { ...before[3], where: 'left' }, // 들고 있다가 놓친 것: 센다
      { ...before[4], where: 'floor' },
    ];
    expect(countMisses(before, after)).toBe(3);
  });
});
