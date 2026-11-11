import { describe, it, expect } from 'vitest';
import { BOWL, LABEL, ROT, TABLE_Y } from '../../../src/app/jabgok/config.js';
import { INITIAL_BOWL, carryInBowl, hitsStub, labelBox, stepBowl, stubBox } from '../../../src/app/jabgok/logic/bowl.js';
import { onGround, pickGrain, radiusOf, step, stepRot, summarize } from '../../../src/app/jabgok/logic/grains.js';
import { bowlBox, landingOf, surfaceY, touchesWall } from '../../../src/app/jabgok/logic/world.js';

const FRAME = 1000 / 60;
const grain = (over = {}) => ({ id: 'a', type: 'rice', x: 1000, y: 400, vy: 0, where: 'floor', ...over });
const lifted = { x: 1000, y: 700, vy: 0, held: true };
const at = (x, y) => ({ x, y, gripX: 0, gripY: 0 });

describe('썩기: 땅에 5초', () => {
  const r = radiusOf('rice');
  const onTable = grain({ y: TABLE_Y - r });

  it('땅 = 테이블 면. 테이블에 놓인 잡곡과, 들고 끄는 중이라도 테이블에 붙어 있는 잡곡', () => {
    expect(onGround(onTable)).toBe(true);
    expect(onGround(grain({ where: 'held', y: TABLE_Y - r }))).toBe(true);
    expect(onGround(grain({ where: 'held', y: TABLE_Y - r - 3 }))).toBe(false);
    expect(onGround(grain({ where: 'falling', y: TABLE_Y - r }))).toBe(false);
    for (const where of ['left', 'right', 'rotten']) expect(onGround(grain({ where }))).toBe(false);
    // 그릇 안쪽 바닥은 땅이 아니다
    const left = bowlBox('left');
    expect(onGround(grain({ where: 'held', x: left.cx, y: left.floorY - r }))).toBe(false);
  });

  it('닿아 있던 시간이 5초가 되면 썩는다. 그 전에는 1초마다 한 단계씩 어두워진다', () => {
    let grains = [onTable];
    let times = {};
    const levels = [];
    for (let ms = 0; ms < 4900; ms += 100) {
      ({ grains, times } = stepRot(grains, times, 100));
      levels.push(grains[0].rot ?? 0);
    }
    expect(grains[0].where).toBe('floor');
    expect([...new Set(levels)]).toEqual([0, 1, 2, 3, 4]);
    ({ grains, times } = stepRot(grains, times, 100));
    expect(grains[0]).toMatchObject({ where: 'rotten', rot: ROT.levels });
  });

  it('단계가 그대로인 프레임은 같은 배열을 돌려준다 (렌더는 1초에 한 번)', () => {
    const grains = [onTable];
    const first = stepRot(grains, {}, FRAME);
    expect(first.grains).toBe(grains);
    expect(first.times.a).toBeCloseTo(FRAME, 10);
  });

  it('땅에 닿은 잡곡이 없으면 받은 값을 그대로 돌려준다', () => {
    const grains = [grain({ where: 'left' }), grain({ id: 'b', where: 'right' })];
    const times = {};
    const next = stepRot(grains, times, FRAME);
    expect(next.grains).toBe(grains);
    expect(next.times).toBe(times);
  });

  it('닿은 시간은 합쳐서 센다: 들었다 놓아도 이어진다', () => {
    let state = stepRot([onTable], {}, 3000);
    const raised = [{ ...state.grains[0], where: 'held', y: 500 }];
    state = stepRot(raised, state.times, 60000); // 들고 있는 동안은 세지 않는다
    expect(state.grains).toBe(raised);
    state = stepRot([{ ...raised[0], where: 'floor', y: TABLE_Y - r }], state.times, 2000);
    expect(state.grains[0].where).toBe('rotten');
  });

  it('들고 땅에 끄는 중에도 썩는다', () => {
    const dragged = [grain({ where: 'held', y: TABLE_Y - r })];
    expect(stepRot(dragged, {}, 5000).grains[0].where).toBe('rotten');
  });

  it('썩은 잡곡은 잡을 수 없고 점수가 아니다', () => {
    const rotten = [grain({ where: 'rotten', y: TABLE_Y - r })];
    expect(pickGrain(rotten, { x: 1000, y: TABLE_Y - r })).toBe(-1);
    expect(summarize(rotten)).toMatchObject({ score: 0, rotten: 1 });
    expect(step(rotten, { x: 1000, y: 400 }, FRAME)).toBe(rotten);
  });
});

describe('잡곡 그릇: 이름표 글자', () => {
  it('이름표는 그릇 밑변 바로 아래 가운데에 있다', () => {
    expect(labelBox(INITIAL_BOWL)).toEqual({
      left: INITIAL_BOWL.x - LABEL.width / 2,
      right: INITIAL_BOWL.x + LABEL.width / 2,
      top: TABLE_Y + LABEL.gap,
      bottom: TABLE_Y + LABEL.gap + LABEL.height,
    });
  });

  it('"곡"의 ㅗ 꼭지는 글자 칸 안, 가운데에서 조금 왼쪽에 있는 2 × 2.5px이다', () => {
    const label = labelBox(INITIAL_BOWL);
    const stub = stubBox(INITIAL_BOWL);
    expect(stub).toEqual({ left: 350, right: 352, top: TABLE_Y + 23, bottom: TABLE_Y + 25.5 });
    expect(stub.left).toBeGreaterThan(label.left);
    expect(stub.right).toBeLessThan(INITIAL_BOWL.x);
    expect(stub.top).toBeGreaterThan(label.top);
    expect(stub.bottom).toBeLessThan(label.bottom);
  });

  it('꼭지만 잡힌다 (둘레 1px까지). 글자의 다른 곳 · 그릇의 벽 · 안쪽 · 바닥은 잡히지 않는다', () => {
    const box = bowlBox('left');
    const label = labelBox(INITIAL_BOWL);
    const stub = stubBox(INITIAL_BOWL);
    expect(hitsStub(INITIAL_BOWL, { x: 351, y: TABLE_Y + 24 })).toBe(true);
    expect(hitsStub(INITIAL_BOWL, { x: stub.left - 1, y: stub.top - 1 })).toBe(true);
    expect(hitsStub(INITIAL_BOWL, { x: stub.right + 1, y: stub.bottom + 1 })).toBe(true);
    expect(hitsStub(INITIAL_BOWL, { x: stub.left - 1.1, y: stub.top })).toBe(false);
    expect(hitsStub(INITIAL_BOWL, { x: stub.left, y: stub.bottom + 1.1 })).toBe(false);
    // 같은 글자 칸의 다른 곳: "잡", "곡"의 받침, "그릇", 칸 가운데
    for (const x of [label.left + 26, 351 + 20, 351 + 34, INITIAL_BOWL.x]) {
      expect(hitsStub(INITIAL_BOWL, { x, y: label.top + 13 })).toBe(false);
    }
    expect(hitsStub(INITIAL_BOWL, { x: 351, y: label.top + 19 })).toBe(false); // "곡"의 받침 ㄱ
    expect(hitsStub(INITIAL_BOWL, { x: 351, y: label.top + 3 })).toBe(false); // "곡"의 위 ㄱ
    expect(hitsStub(INITIAL_BOWL, { x: box.outerRight - 5, y: box.rimY + 8 })).toBe(false); // 벽
    expect(hitsStub(INITIAL_BOWL, { x: box.cx, y: box.floorY - 5 })).toBe(false); // 안쪽
    expect(hitsStub(INITIAL_BOWL, { x: box.cx, y: TABLE_Y - 3 })).toBe(false); // 바닥
  });

  it('옮긴 그릇의 꼭지는 그릇을 따라간다', () => {
    const moved = { x: 900, y: 600, vy: 0, held: false };
    expect(hitsStub(moved, { x: 891, y: 600 + LABEL.gap + 12 })).toBe(true);
    expect(hitsStub(moved, { x: 351, y: TABLE_Y + 24 })).toBe(false);
  });
});

describe('잡곡 그릇: 들고 옮기기', () => {
  it('들면 포인터를 따라온다 (잡곡과 같은 따라오기)', () => {
    const next = stepBowl(lifted, at(1010, 700), 16.7);
    expect(next.held).toBe(true);
    expect(next.x).toBeCloseTo(1000.8, 10);
    expect(stepBowl(lifted, at(1000, 700), FRAME)).toBe(lifted);
  });

  it('잡은 지점(grip)이 포인터를 따라간다', () => {
    expect(stepBowl(lifted, { x: 1140, y: 570, gripX: 140, gripY: -130 }, FRAME)).toBe(lifted);
  });

  it('포인터가 30px보다 멀어지면 그 자리에서 떨어지고, 중력으로 테이블에 내려앉는다', () => {
    let bowl = stepBowl(lifted, at(1000 + LABEL.deadRadius + 0.1, 700), FRAME);
    expect(bowl).toMatchObject({ held: false, x: 1000, y: 700 });
    expect(stepBowl(lifted, at(1000 + LABEL.deadRadius, 700), FRAME).held).toBe(true);
    for (let i = 0; i < 60; i++) bowl = stepBowl(bowl, null, FRAME);
    expect(bowl).toMatchObject({ y: TABLE_Y, vy: 0 });
    expect(stepBowl(bowl, null, FRAME)).toBe(bowl);
  });

  it('포인터가 없으면(null) 들고 있던 그릇은 떨어진다', () => {
    expect(stepBowl(lifted, null, FRAME).held).toBe(false);
  });

  it('테이블 아래로 내려가지 않고, 오른쪽 그릇과 겹치지 않는다', () => {
    expect(stepBowl({ ...lifted, y: TABLE_Y }, at(1000, TABLE_Y + 20), FRAME).y).toBe(TABLE_Y);

    const right = bowlBox('right');
    let bowl = { x: right.outerLeft - BOWL.width / 2 - 5, y: 600, vy: 0, held: true };
    for (let i = 0; i < 300 && bowl.held; i++) bowl = stepBowl(bowl, at(bowl.x + 20, 600), FRAME);
    expect(bowl.x + BOWL.width / 2).toBeLessThan(right.outerLeft);
  });

  it('그릇이 움직이면 담긴 잡곡(left)도 함께 움직인다. 담긴 것이 없으면 같은 배열', () => {
    const grains = [grain({ where: 'left' }), grain({ id: 'b', where: 'floor' })];
    const next = carryInBowl(grains, 5, -3);
    expect(next[0]).toMatchObject({ x: 1005, y: 397, where: 'left' });
    expect(next[1]).toBe(grains[1]);
    expect(carryInBowl(grains, 0, 0)).toBe(grains);
    expect(carryInBowl([grains[1]], 5, 5)).toEqual([grains[1]]);
  });
});

describe('옮겨진 그릇과 잡곡', () => {
  const moved = { x: 1000, y: TABLE_Y, vy: 0, held: false };
  const r = radiusOf('rice');

  it('벽 · 바닥 판정이 그릇을 따라간다 (처음 자리는 빈 테이블이 된다)', () => {
    const box = bowlBox('left', moved);
    expect(box).toMatchObject({ cx: 1000, outerLeft: 870, outerRight: 1130, floorY: TABLE_Y - BOWL.wall });
    expect(touchesWall(box.outerLeft + 5, TABLE_Y - 50, r, moved)).toBe(true);
    expect(touchesWall(INITIAL_BOWL.x - BOWL.width / 2 + 5, TABLE_Y - 50, r, moved)).toBe(false);
    expect(surfaceY(1000, moved)).toBe(box.floorY);
    expect(surfaceY(INITIAL_BOWL.x, moved)).toBe(TABLE_Y);
  });

  it('옮겨진 그릇 위에서 놓으면 그릇에 담기고, 처음 자리 위에서 놓으면 테이블에 떨어진다', () => {
    expect(landingOf(1000, r, moved)).toMatchObject({ where: 'left', y: TABLE_Y - BOWL.wall - r });
    expect(landingOf(INITIAL_BOWL.x, r, moved)).toMatchObject({ where: 'floor', y: TABLE_Y - r });
  });

  it('공중에 들린 그릇에도 담긴다. 그릇 아래에서 떨어지는 잡곡은 테이블로 간다', () => {
    let grains = [grain({ where: 'falling', x: 1010, y: 450 })];
    for (let i = 0; i < 120 && grains[0].where === 'falling'; i++) grains = step(grains, null, FRAME, lifted);
    expect(grains[0]).toMatchObject({ where: 'left', x: 1010, y: lifted.y - BOWL.wall - r });

    let below = [grain({ where: 'falling', x: 1010, y: 760 })];
    for (let i = 0; i < 120 && below[0].where === 'falling'; i++) below = step(below, null, FRAME, lifted);
    expect(below[0]).toMatchObject({ where: 'floor', y: TABLE_Y - r });
  });

  it('그릇에 담긴 잡곡은 땅에 닿은 것이 아니라 썩지 않는다', () => {
    const inside = [grain({ where: 'left', x: 1000, y: TABLE_Y - BOWL.wall - r })];
    expect(stepRot(inside, {}, 60000, moved).grains).toBe(inside);
  });
});
