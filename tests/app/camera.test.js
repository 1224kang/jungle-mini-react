import { describe, it, expect } from 'vitest';
import { BOWL_CENTER, CAMERA, VIEW, WORLD } from '../../src/app/config.js';
import { INITIAL_CAMERA, OVERLAPS, SECTIONS, sectionOf, shiftCamera, toWorld } from '../../src/app/logic/camera.js';
import { bowlBox } from '../../src/app/logic/world.js';

describe('카메라 구간', () => {
  it('구간은 640px 간격으로 4개, 월드 밖을 보여 주지 않는다', () => {
    expect(SECTIONS).toEqual([0, 640, 1280, 1920]);
    expect(SECTIONS.at(-1) + VIEW.width).toBe(WORLD.width);
    expect(CAMERA.step).toBeLessThan(VIEW.width);
  });

  it('이웃한 구간은 320px 겹친다 (잡곡을 내려놓고 다시 집는 자리)', () => {
    expect(OVERLAPS).toEqual([
      { left: 640, right: 960 },
      { left: 1280, right: 1600 },
      { left: 1920, right: 2240 },
    ]);
    OVERLAPS.forEach((zone, i) => {
      // 겹치는 곳은 두 구간 모두에서 보인다
      for (const x of [SECTIONS[i], SECTIONS[i + 1]]) {
        expect(zone.left).toBeGreaterThanOrEqual(x);
        expect(zone.right).toBeLessThanOrEqual(x + VIEW.width);
      }
    });
  });

  it('겹치는 곳에 그릇 벽이 걸치지 않는다 (내려놓을 테이블이 비어 있다)', () => {
    for (const side of ['left', 'right']) {
      const box = bowlBox(side);
      for (const zone of OVERLAPS) expect(box.outerRight < zone.left || box.outerLeft > zone.right).toBe(true);
    }
  });

  it('첫 구간에서 왼쪽 그릇이, 마지막 구간에서 오른쪽 그릇이 보인다', () => {
    expect(INITIAL_CAMERA).toEqual({ x: 0, y: CAMERA.y });
    expect(BOWL_CENTER.left).toBeLessThan(VIEW.width);
    expect(BOWL_CENTER.right).toBeGreaterThan(SECTIONS.at(-1));
  });
});

describe('구간 옮기기', () => {
  it('D는 오른쪽, A는 왼쪽으로 한 구간씩. 높이는 그대로', () => {
    const second = shiftCamera(INITIAL_CAMERA, 1);
    expect(second).toEqual({ x: 640, y: CAMERA.y });
    expect(sectionOf(second)).toBe(1);
    expect(shiftCamera(second, -1)).toEqual(INITIAL_CAMERA);
  });

  it('끝 구간에서 밖으로 가려 하면 같은 객체를 돌려준다 (렌더 0회)', () => {
    expect(shiftCamera(INITIAL_CAMERA, -1)).toBe(INITIAL_CAMERA);
    const last = { x: SECTIONS.at(-1), y: CAMERA.y };
    expect(shiftCamera(last, 1)).toBe(last);
  });

  it('D를 세 번 누르면 마지막 구간이다', () => {
    let camera = INITIAL_CAMERA;
    for (let i = 0; i < 3; i++) camera = shiftCamera(camera, 1);
    expect(camera.x).toBe(1920);
  });
});

describe('포인터의 월드 좌표', () => {
  it('월드 좌표 = 화면 좌표 + 카메라 위치', () => {
    expect(toWorld({ x: 50, y: 60 }, { x: 640, y: 400 })).toEqual({ x: 690, y: 460 });
  });
});
