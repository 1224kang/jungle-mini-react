import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BEST_KEY, GRAIN_TYPES } from '../../src/app/config.js';
import { countMutations } from '../../src/app/logic/inspect.js';
import { RIM_Y, bowlBox } from '../../src/app/logic/world.js';
import {
  cameraOf,
  centerOf,
  findGrain,
  flush,
  frames,
  grabGrain,
  key,
  mountGame,
  observe,
  pointer,
  screenOf,
  setHidden,
  start,
  useFakeClock,
} from './helpers.js';

let game;

beforeEach(() => {
  useFakeClock();
  localStorage.clear();
  game = mountGame();
});

afterEach(() => {
  game.app.unmount();
  setHidden(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const text = (selector) => game.$(selector).textContent;
const held = () => game.$('.deadzone')?.parentElement ?? null;

/** 시작 직후의 갱신(오버레이 제거 · 관찰 패널)이 가라앉을 때까지 기다린다. */
async function startAndSettle() {
  await start(game);
  await frames(6);
}

describe('시작 화면', () => {
  it('잡곡 40알이 왼쪽 그릇에 있고 시작 화면이 보인다', () => {
    expect(game.$$('.grain')).toHaveLength(40);
    expect(game.$$('.bowl')).toHaveLength(2);
    expect(game.$('.overlay--ready')).not.toBeNull();
    expect(text('.hud__item--time .hud__value')).toBe('04:00');
    expect(text('.hud__item--score')).toContain('0/ 목표 60점');
    expect(text('.hud__item--remaining .hud__value')).toBe('40알');
    expect(text('.hud__item--drops .hud__value')).toBe('0회');
    expect(game.$$('.minimap__bowl')).toHaveLength(2);
  });

  it('시작 전에는 잡을 수 없고, 시작하면 오버레이가 사라진다', async () => {
    await grabGrain(game, findGrain(game, 'bean'));
    expect(held()).toBeNull();
    await start(game);
    expect(game.$('.overlay')).toBeNull();
    expect(game.$$('.grain')).toHaveLength(40);
  });

  it('SVG를 쓰지 않는다 (잡곡 · 그릇 · 데드존은 div)', async () => {
    await startAndSettle();
    await grabGrain(game, findGrain(game, 'bean'));
    expect(game.container.querySelector('svg')).toBeNull();
    for (const el of [...game.$$('.grain'), ...game.$$('.bowl'), game.$('.deadzone')]) expect(el.tagName).toBe('DIV');
  });
});

describe('잡기 · 끌기 · 낙하', () => {
  beforeEach(startAndSettle);

  it('잡는 순간: 같은 DOM 노드가 맨 위로 옮겨지고(MOVE 1) 데드존이 생긴다(CREATE 1)', async () => {
    const bean = findGrain(game, 'bean');
    expect(bean.nextElementSibling).not.toBeNull();
    const board = observe(game.$('.board'));
    await grabGrain(game, bean);

    expect(countMutations(board.take())).toBe(2);
    expect(held()).toBe(bean); // key로 재사용된 같은 노드
    expect(bean.nextElementSibling).toBeNull(); // 월드 층의 마지막 자식 = 맨 위
    expect(game.$$('.deadzone')).toHaveLength(1);
    const size = GRAIN_TYPES.bean.diameter * 3;
    expect(game.$('.deadzone').getAttribute('style')).toBe(`width: ${size}px; height: ${size}px`);
    expect(game.$$('.grain')).toHaveLength(40);
    board.disconnect();
  });

  it('잡기 영역 밖을 누르면 아무 일도 없다', async () => {
    const board = observe(game.$('.board'));
    pointer(game, 'pointerdown', { x: 700, y: 100 });
    await flush();
    await frames(2);
    expect(held()).toBeNull();
    expect(board.take()).toHaveLength(0);
    board.disconnect();
  });

  it('한 번에 한 알만 잡는다', async () => {
    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    const other = findGrain(game, 'rice');
    pointer(game, 'pointerdown', screenOf(game, other), { pointerId: 2 });
    await flush();
    expect(game.$$('.deadzone')).toHaveLength(1);
    expect(held()).toBe(bean);
  });

  it('끌기 프레임의 DOM 변경은 든 잡곡의 style 1건뿐이다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await grabGrain(game, bean);
    const board = observe(game.$('.board'));

    // 포인터 이벤트는 위치만 적는다 (setState 없음 → 렌더 없음)
    for (let i = 1; i <= 12; i++) pointer(game, 'pointermove', { x: point.x, y: point.y - i });
    await flush();
    expect(board.take()).toHaveLength(0);

    // 남은 거리 12px의 8%씩 따라온다. 프레임마다 0.5px 넘게 움직이므로 style이 매번 바뀐다.
    for (let i = 0; i < 5; i++) {
      await frames(1);
      const records = board.take();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ type: 'attributes', attributeName: 'style', target: bean });
    }
    board.disconnect();
  });

  it('천천히 끌면 따라오고, 포인터가 멈추면 도착해 렌더가 멎는다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await grabGrain(game, bean);
    const before = centerOf(bean);
    pointer(game, 'pointermove', { x: point.x, y: point.y - 15 });
    await frames(200);
    expect(held()).toBe(bean);
    expect(centerOf(bean).y).toBeCloseTo(before.y - 15, 0);

    const update = vi.spyOn(game.app, 'update');
    await frames(10);
    expect(update).not.toHaveBeenCalled();
  });

  it('빠르게 움직이면(데드존 이탈) 그 자리에서 떨어지고, 떨어뜨린 횟수가 는다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await grabGrain(game, bean);
    const board = observe(game.$('.board'));
    pointer(game, 'pointermove', { x: point.x + 60, y: point.y - 60 });
    await frames(1);

    // 떨어지는 순간: 잡곡의 class PROPS 1건 + 데드존 REMOVE 1건
    const records = board.take();
    expect(countMutations(records)).toBe(2);
    expect(records.some((r) => r.type === 'attributes' && r.attributeName === 'class' && r.target === bean)).toBe(true);
    expect(game.$('.deadzone')).toBeNull();
    expect(bean.classList.contains('is-falling')).toBe(true);

    await frames(40);
    expect(bean.classList.contains('is-falling')).toBe(false);
    expect(text('.hud__item--drops .hud__value')).toBe('1회');
    expect(text('.hud__item--score')).toContain('0/ 목표');
    board.disconnect();
  });

  it('버튼을 떼면 떨어진다. pointercancel · lostpointercapture도 같다', async () => {
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      const bean = findGrain(game, 'bean');
      const point = await grabGrain(game, bean);
      expect(held()).toBe(bean);
      pointer(game, type, point);
      await flush();
      expect(held()).toBeNull();
      await frames(30);
    }
  });

  it('놓자마자(렌더 전에) 다음 프레임이 와도 놓은 잡곡은 떨어진다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await grabGrain(game, bean);
    pointer(game, 'pointermove', { x: point.x, y: point.y - 10 });
    await frames(60);
    const lifted = centerOf(bean).y;

    // 이벤트와 프레임 사이에 마이크로태스크(렌더)가 끼지 않게 동기로 진행한다.
    pointer(game, 'pointerup', point);
    vi.advanceTimersByTime(16);
    await frames(40);

    expect(held()).toBeNull();
    expect(bean.classList.contains('is-falling')).toBe(false);
    expect(centerOf(bean).y).toBeGreaterThan(lifted + 5);
    await grabGrain(game, bean); // 멈춘 잡곡은 다시 잡을 수 있다
    expect(held()).toBe(bean);
  });

  it('잡자마자(렌더 전에) 다음 프레임이 와도 잡은 잡곡을 놓치지 않는다', async () => {
    const bean = findGrain(game, 'bean');
    pointer(game, 'pointerdown', screenOf(game, bean));
    vi.advanceTimersByTime(16);
    await frames(3);
    expect(held()).toBe(bean);
    expect(game.$$('.deadzone')).toHaveLength(1);
  });

  it('아무것도 안 잡은 프레임은 렌더 0회, DOM 변경 0건이다', async () => {
    const update = vi.spyOn(game.app, 'update');
    const all = observe(game.container);
    pointer(game, 'pointermove', { x: 300, y: 200 });
    pointer(game, 'pointermove', { x: 500, y: 100 });
    await frames(30);
    expect(update).not.toHaveBeenCalled();
    expect(all.take()).toHaveLength(0);
    all.disconnect();
  });

  it('잡는 순간의 상태 변경 2개(grains · heldId)는 렌더 1회로 합쳐진다', async () => {
    const update = vi.spyOn(game.app, 'update');
    await grabGrain(game, findGrain(game, 'bean'));
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('카메라 (A · D 구간)', () => {
  beforeEach(startAndSettle);

  it('D를 누르면 한 구간(640px) 오른쪽으로, A를 누르면 되돌아온다. 보드 DOM 변경은 월드 층 style 1건뿐', async () => {
    const board = observe(game.$('.board'));
    key('keydown', 'KeyD');
    await flush();
    const records = board.take();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'attributes', attributeName: 'style', target: game.$('.world') });
    expect(cameraOf(game)).toEqual({ x: 640, y: 400 });

    key('keydown', 'KeyA');
    await flush();
    expect(cameraOf(game)).toEqual({ x: 0, y: 400 });
    board.disconnect();
  });

  it('구간 사이에서는 멈춰 있다: 키를 누르고 있어도(반복 keydown) 한 구간만 가고, 프레임이 지나도 그대로', async () => {
    key('keydown', 'KeyD');
    key('keydown', 'KeyD', { repeat: true });
    key('keydown', 'KeyD', { repeat: true });
    await frames(30);
    expect(cameraOf(game).x).toBe(640);
  });

  it('끝 구간에서는 더 가지 않는다 (렌더 0회)', async () => {
    key('keydown', 'KeyA');
    await flush();
    expect(cameraOf(game).x).toBe(0);
    for (let i = 0; i < 5; i++) key('keydown', 'KeyD');
    await flush();
    expect(cameraOf(game).x).toBe(1920);
    const update = vi.spyOn(game.app, 'update');
    key('keydown', 'KeyD');
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it('W · S는 카메라를 움직이지 않는다', async () => {
    expect(key('keydown', 'KeyW').defaultPrevented).toBe(false);
    key('keydown', 'KeyS');
    await frames(10);
    expect(cameraOf(game)).toEqual({ x: 0, y: 400 });
  });

  it('event.code로 판정한다 (한글 자판의 key 값과 무관). 게임 중 A · D는 preventDefault', async () => {
    const event = key('keydown', 'KeyD', { key: 'ㅇ' });
    expect(event.defaultPrevented).toBe(true);
    await flush();
    expect(cameraOf(game).x).toBe(640);
    expect(key('keydown', 'KeyQ').defaultPrevented).toBe(false);
  });

  it('미니맵의 카메라 표시가 따라 움직인다', async () => {
    const before = game.$('.minimap__view').getAttribute('style');
    key('keydown', 'KeyD');
    await flush();
    expect(game.$('.minimap__view').getAttribute('style')).not.toBe(before);
  });

  it('잡곡을 든 채 구간을 옮기면 잡곡은 실려 가지 않고 그 자리에서 떨어진다', async () => {
    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    const before = centerOf(bean);
    key('keydown', 'KeyD');
    await flush();
    expect(held()).toBeNull();
    await frames(40);
    expect(centerOf(bean).x).toBe(before.x); // 월드에서 제자리
    expect(text('.hud__item--drops .hud__value')).toBe('1회');
  });

  it('A · D를 연타해도 든 잡곡은 한 발짝도 옮겨지지 않는다', async () => {
    const bean = findGrain(game, 'bean');
    const before = centerOf(bean);
    for (let i = 0; i < 6; i++) {
      pointer(game, 'pointerdown', screenOf(game, bean));
      key('keydown', i % 2 === 0 ? 'KeyD' : 'KeyA');
      await frames(2);
    }
    await frames(40);
    expect(centerOf(bean).x).toBe(before.x);
  });

  it('겹치는 곳을 알려 주는 띠가 3개 있다', () => {
    expect(game.$$('.zone')).toHaveLength(3);
  });
});

describe('득점', () => {
  it('들어 올리기 → 겹치는 곳에 내려놓기 → 구간 옮기기 → 다시 집기를 되풀이해 오른쪽 그릇에 넣는다', async () => {
    await startAndSettle();
    const bean = findGrain(game, 'bean');
    const right = bowlBox('right');
    const r = GRAIN_TYPES.bean.diameter / 2;

    /** 든 잡곡을 월드 좌표 (x, y)까지 천천히(프레임당 1px) 끈다. */
    async function dragTo(point, x, y) {
      const target = { x: x - cameraOf(game).x, y: y - cameraOf(game).y };
      while (Math.abs(point.y - target.y) > 0.5) {
        point.y += Math.sign(target.y - point.y) * Math.min(1, Math.abs(target.y - point.y));
        pointer(game, 'pointermove', point);
        await frames(1);
      }
      while (Math.abs(point.x - target.x) > 0.5) {
        point.x += Math.sign(target.x - point.x) * Math.min(1, Math.abs(target.x - point.x));
        pointer(game, 'pointermove', point);
        await frames(1);
      }
      await frames(40);
      expect(held()).toBe(bean);
    }

    async function putDown(point) {
      pointer(game, 'pointerup', point);
      await flush();
      await frames(40);
      expect(held()).toBeNull();
    }

    // 구간 0: 그릇 벽을 넘을 만큼 들어 올려, 구간 1과 겹치는 곳(x 640~960)의 테이블에 내려놓는다
    let point = await grabGrain(game, bean);
    await dragTo(point, 800, RIM_Y - 30);
    await putDown(point);
    expect(centerOf(bean).y).toBe(820 - r);

    // 구간 1 → 2 → 3: 옮긴 뒤에도 잡곡이 화면에 보여 다시 집을 수 있다
    for (const x of [1440, 2080]) {
      key('keydown', 'KeyD');
      await flush();
      const screen = screenOf(game, bean);
      expect(screen.x).toBeGreaterThan(0);
      expect(screen.x).toBeLessThan(960);
      point = await grabGrain(game, bean);
      expect(held()).toBe(bean);
      await dragTo(point, x, 820 - r - 20);
      await putDown(point);
    }

    key('keydown', 'KeyD');
    await flush();
    expect(cameraOf(game).x).toBe(1920);
    point = await grabGrain(game, bean);
    await dragTo(point, right.cx, RIM_Y - 30);
    pointer(game, 'pointerup', point);
    await flush();
    await frames(40);

    expect(text('.hud__item--score .hud__value')).toBe('1');
    expect(text('.hud__item--remaining .hud__value')).toBe('39알');
    expect(text('.hud__item--drops .hud__value')).toBe('3회'); // 내려놓은 3번
    const landed = centerOf(bean);
    expect(landed.x).toBeGreaterThan(right.innerLeft);
    expect(landed.x).toBeLessThan(right.innerRight);
    expect(landed.y).toBe(right.floorY - r);

    // 오른쪽 그릇에 들어간 잡곡은 다시 잡을 수 없다
    await grabGrain(game, bean);
    expect(held()).toBeNull();
  }, 30000);
});

describe('시간 · 결과 · 다시 하기', () => {
  it('HUD 시계는 1초에 한 번, 텍스트 노드만 바뀐다', async () => {
    await startAndSettle();
    const hud = observe(game.$('.hud'));
    await vi.advanceTimersByTimeAsync(1000);
    const records = hud.take();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(text('.hud__item--time .hud__value')).toBe('03:59');
    hud.disconnect();
  });

  it('240초(4분)가 지나면 실패 결과 화면. 들고 있던 잡곡은 득점 없이 그 자리에서 떨어진다', async () => {
    await start(game);
    await vi.advanceTimersByTimeAsync(238_000);
    expect(game.$('.overlay')).toBeNull();
    expect(text('.hud__item--time .hud__value')).toBe('00:02');

    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    expect(held()).toBe(bean);
    await vi.advanceTimersByTimeAsync(2500);

    expect(game.$('.overlay--over')).not.toBeNull();
    expect(text('.overlay__card h2')).toBe('실패');
    expect(game.$('.deadzone')).toBeNull();
    const rows = game.$$('.overlay__row').map((row) => row.textContent);
    expect(rows).toEqual(['점수0점', '옮긴 개수0알', '떨어뜨린 횟수0회', '썩은 알0알', '남은 시간00:00', '최고 점수0점']);

    // 끝난 뒤에는 루프 · 타이머가 멈춘다
    expect(vi.getTimerCount()).toBe(0);
  }, 30000);

  it('다시 하기: 잡곡 key가 모두 바뀌어 새 노드 40개가 된다', async () => {
    await start(game);
    await vi.advanceTimersByTimeAsync(240_500);
    expect(game.$('.overlay--over')).not.toBeNull();
    const oldNodes = new Set(game.$$('.grain'));
    const oldKeys = new Set(game.$$('.grain').map((el) => el.getAttribute('data-key')));

    await start(game); // 다시 하기 버튼
    expect(game.$('.overlay')).toBeNull();
    const grains = game.$$('.grain');
    expect(grains).toHaveLength(40);
    expect(grains.some((el) => oldNodes.has(el) || oldKeys.has(el.getAttribute('data-key')))).toBe(false);
    expect(text('.hud__item--time .hud__value')).toBe('04:00');
    expect(cameraOf(game)).toEqual({ x: 0, y: 400 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(text('.hud__item--time .hud__value')).toBe('03:59');
  }, 30000);

  it('최고 점수를 localStorage에서 읽어 보여 준다', () => {
    game.app.unmount();
    localStorage.setItem(BEST_KEY, '42');
    game = mountGame();
    expect(text('.overlay__best')).toBe('최고 점수 42점');
  });
});

describe('탭 전환 · 정리', () => {
  it('탭이 가려지면 일시정지하고 들고 있던 잡곡은 떨어진다. 돌아오면 이어진다', async () => {
    await startAndSettle();
    await grabGrain(game, findGrain(game, 'bean'));
    expect(held()).not.toBeNull();

    setHidden(true);
    await flush();
    expect(held()).toBeNull();
    const paused = text('.hud__item--time .hud__value');
    await vi.advanceTimersByTimeAsync(5000);
    expect(text('.hud__item--time .hud__value')).toBe(paused);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(text('.hud__item--time .hud__value')).not.toBe(paused);
  });

  it('unmount하면 루프 · 타이머가 멈추고 키 리스너가 떨어진다', async () => {
    await startAndSettle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const removed = vi.spyOn(window, 'removeEventListener');
    const removedFromDocument = vi.spyOn(document, 'removeEventListener');

    game.app.unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(['keydown']);
    expect(removedFromDocument.mock.calls.map(([type]) => type)).toEqual(['visibilitychange']);
    expect(key('keydown', 'KeyD').defaultPrevented).toBe(false);
    await frames(5);
  });
});

describe('관찰 패널', () => {
  beforeEach(startAndSettle);

  it('잡는 순간의 patch 예측(MOVE 1 + CREATE 1, HUD의 남은 알 TEXT 1)과 실제 DOM 변경 수가 같다', async () => {
    await grabGrain(game, findGrain(game, 'bean'));
    await frames(3);
    expect(text('.hud__item--remaining .hud__value')).toBe('39알');
    expect(game.$('.inspector__log li').textContent).toBe('TEXT 1 + MOVE 1 + CREATE 1 · DOM 3건 · 1프레임');
  });

  it('끌기 프레임은 PROPS 1건, 예측과 실제가 일치한다', async () => {
    const point = await grabGrain(game, findGrain(game, 'bean'));
    for (let i = 1; i <= 6; i++) {
      pointer(game, 'pointermove', { x: point.x, y: point.y - i });
      await frames(1);
    }
    const rows = game.$$('.inspector__row').map((row) => row.textContent);
    expect(rows[0]).toBe('프레임당 patch (예측)1건 · PROPS 1');
    expect(rows[1]).toBe('실제 DOM 변경1건 (일치)');
  });

  it('변경이 멎으면 패널도 0건으로 가라앉고 렌더가 멎는다', async () => {
    const point = await grabGrain(game, findGrain(game, 'bean'));
    pointer(game, 'pointerup', point);
    await frames(60);
    expect(game.$$('.inspector__row')[0].textContent).toBe('프레임당 patch (예측)0건');
    const update = vi.spyOn(game.app, 'update');
    await frames(20);
    expect(update).not.toHaveBeenCalled();
  });

  it('접으면 내용이 사라지고, 다시 펼칠 수 있다', async () => {
    const toggle = game.$('.inspector__toggle');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(game.$('.inspector__body')).toBeNull();
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(game.$('.inspector__body')).not.toBeNull();
  });

  it('전체 다시 그리기 비교: 보드 전체를 innerHTML로 매 프레임 새로 그린다', async () => {
    const compare = game.$$('.inspector__toggle')[1];
    compare.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    await frames(3);
    const view = game.$('.naive-view');
    expect(view.querySelectorAll('.grain')).toHaveLength(40);
    const first = view.firstElementChild;
    await frames(1);
    expect(view.firstElementChild).not.toBe(first); // 매 프레임 새 노드
    expect(text('.inspector__compare')).toMatch(/노드 \d+개 새로 만듦/);

    // 비교 칸을 직접 고쳐도 게임 쪽 갱신은 그대로 돈다
    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    await frames(2);
    expect(held()).toBe(bean);
    expect(view.querySelectorAll('.deadzone')).toHaveLength(1);
  });
});

describe('썩기 · 잡곡 그릇 옮기기 · 흔들기', () => {
  beforeEach(startAndSettle);

  /** 잡곡을 잡아 월드 좌표 (x, y)까지 천천히 끈다. 놓지는 않는다. */
  async function carry(el, x, y) {
    const point = await grabGrain(game, el);
    const target = { x: x - cameraOf(game).x, y: y - cameraOf(game).y };
    for (const axis of ['y', 'x']) {
      while (Math.abs(point[axis] - target[axis]) > 0.5) {
        point[axis] += Math.sign(target[axis] - point[axis]) * Math.min(1, Math.abs(target[axis] - point[axis]));
        pointer(game, 'pointermove', point);
        await frames(1);
      }
    }
    await frames(40);
    return point;
  }

  const bowlEl = () => game.$('.bowl--left');
  const bowlLeft = () => Number(/translate\((-?[\d.]+)px/.exec(bowlEl().getAttribute('style'))[1]);
  /** "곡"의 ㅗ 꼭지 가운데의 화면 좌표 (그릇 가운데에서 왼쪽 9px, 그릇 밑변 820 + 틈 12 + 12) */
  const handlePoint = () => ({ x: bowlLeft() + 130 - 9 - cameraOf(game).x, y: 820 + 12 + 12 - cameraOf(game).y });

  it('테이블에 내려놓은 잡곡은 점점 어두워지다가 5초 뒤 썩어, 다시 잡을 수 없다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await carry(bean, 720, RIM_Y - 30);
    pointer(game, 'pointerup', point);
    await flush();
    await frames(60);
    expect(bean.classList.contains('is-rotten')).toBe(false);

    await vi.advanceTimersByTimeAsync(2500);
    expect(bean.className).toMatch(/rot-[1-4]/);
    await vi.advanceTimersByTimeAsync(3500);
    expect(bean.classList.contains('is-rotten')).toBe(true);

    await grabGrain(game, bean);
    expect(held()).toBeNull();
    expect(text('.hud__item--score .hud__value')).toBe('0');
  }, 20000);

  it('잡곡 그릇 아래에 "잡곡 그릇" 글자가 있고, "곡"의 ㅗ 꼭지가 아닌 곳을 누르면 그릇은 잡히지 않는다', async () => {
    expect(game.$('.bowl--left .bowl__label').textContent).toBe('잡곡 그릇');
    expect(game.$('.bowl--right .bowl__label')).toBeNull();
    // 그릇 벽 한가운데, 그릇 바닥, 글자 옆 테이블, 같은 글자의 다른 곳("잡" · "곡"의 받침 · "그릇")
    const others = [{ x: 360 - 22, y: 844 - 400 }, { x: 351, y: 851 - 400 }, { x: 360 + 20, y: 844 - 400 }];
    for (const point of [{ x: 360 + 125, y: 760 - 400 }, { x: 360, y: 815 - 400 }, { x: 360 + 80, y: 845 - 400 }, ...others]) {
      pointer(game, 'pointerdown', point);
      await flush();
      expect(bowlEl().classList.contains('is-held')).toBe(false);
      pointer(game, 'pointerup', point);
      await flush();
    }
  });

  it('"곡"의 ㅗ 꼭지를 잡으면 그릇이 통째로 들리고, 담긴 잡곡 40알이 함께 움직인다. 놓으면 테이블에 내려앉는다', async () => {
    const start = bowlLeft();
    const beans = game.$$('.grain');
    const before = beans.map((el) => centerOf(el));
    const point = handlePoint();
    pointer(game, 'pointerdown', point);
    await flush();
    expect(bowlEl().classList.contains('is-held')).toBe(true);
    expect(game.$('.deadzone')).toBeNull();

    for (let i = 0; i < 80; i++) {
      point.x += 1;
      point.y -= 0.5;
      pointer(game, 'pointermove', point);
      await frames(1);
    }
    await frames(80);
    expect(bowlEl().classList.contains('is-held')).toBe(true);
    expect(bowlLeft()).toBeCloseTo(start + 80, 0);

    pointer(game, 'pointerup', point);
    await flush();
    await frames(40);
    expect(bowlEl().classList.contains('is-held')).toBe(false);
    expect(bowlEl().getAttribute('style')).toContain(`, ${RIM_Y}px)`);
    beans.forEach((el, i) => {
      const now = centerOf(el);
      expect(now.x).toBeCloseTo(before[i].x + 80, 0);
      expect(now.y).toBeCloseTo(before[i].y, 0);
    });
    expect(text('.hud__item--remaining .hud__value')).toBe('40알');
    expect(text('.hud__item--drops .hud__value')).toBe('0회');

    // 그릇에 담긴 채로는 썩지 않는다
    await vi.advanceTimersByTimeAsync(7000);
    expect(game.$$('.grain').some((el) => /rot/.test(el.className))).toBe(false);

    // 옮긴 자리에서도 잡곡을 집을 수 있다
    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    expect(held()).toBe(bean);
  }, 20000);

  it('그릇을 든 채 구간을 옮기면 그릇도 실려 가지 않고 떨어진다', async () => {
    const start = bowlLeft();
    pointer(game, 'pointerdown', handlePoint());
    await flush();
    expect(bowlEl().classList.contains('is-held')).toBe(true);
    key('keydown', 'KeyD');
    await frames(30);
    expect(bowlEl().classList.contains('is-held')).toBe(false);
    expect(bowlLeft()).toBe(start);
  });

  it('포인터가 잡은 곳에서 30px 넘게 멀어지면 그릇을 놓친다', async () => {
    const point = handlePoint();
    pointer(game, 'pointerdown', point);
    await flush();
    pointer(game, 'pointermove', { x: point.x + 60, y: point.y });
    await frames(2);
    expect(bowlEl().classList.contains('is-held')).toBe(false);
  });

  it('스페이스바: 화면이 흔들리고 들고 있던 잡곡이 날아간다', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 곧장 위로, 500px/s
    const bean = findGrain(game, 'bean');
    await grabGrain(game, bean);
    expect(held()).toBe(bean);
    const before = centerOf(bean);
    const board = game.$('.board');
    expect(board.className).toBe('board');

    const event = key('keydown', 'Space');
    await flush();
    expect(event.defaultPrevented).toBe(true); // 페이지가 스크롤되지 않게
    expect(held()).toBeNull();
    expect(board.className).toBe('board shake-a');
    await frames(10);
    expect(bean.classList.contains('is-falling')).toBe(true);
    expect(centerOf(bean).y).toBeLessThan(before.y - 40); // 위로 솟는다

    // 다시 누르면 흔들림이 처음부터 다시 돈다 (클래스가 번갈아 바뀐다). 꾹 누른 반복은 무시
    key('keydown', 'Space', { repeat: true });
    await flush();
    expect(board.className).toBe('board shake-a');
    key('keydown', 'Space');
    await flush();
    expect(board.className).toBe('board shake-b');
    await frames(250);
    expect(bean.classList.contains('is-falling')).toBe(false);
    expect(text('.hud__item--drops .hud__value')).toBe('1회');
  });

  it('스페이스바: 들고 있던 그릇도 떨어진다', async () => {
    pointer(game, 'pointerdown', handlePoint());
    await flush();
    expect(bowlEl().classList.contains('is-held')).toBe(true);
    key('keydown', 'Space');
    await flush();
    expect(bowlEl().classList.contains('is-held')).toBe(false);
  });

  it('스페이스바: 테이블 위의 잡곡과 잡곡 그릇 안의 잡곡도 모두 날아간다', async () => {
    const bean = findGrain(game, 'bean');
    const point = await carry(bean, 720, RIM_Y - 30);
    pointer(game, 'pointerup', point);
    await flush();
    await frames(60);
    const onTable = centerOf(bean);
    expect(text('.hud__item--drops .hud__value')).toBe('1회');

    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 곧장 위로
    key('keydown', 'Space');
    await flush();
    expect(game.$$('.grain.is-falling')).toHaveLength(40);
    await frames(8);
    expect(centerOf(bean).y).toBeLessThan(onTable.y - 30);

    // 테이블에 있던 콩은 다시 테이블에 떨어져 1회 더 센다. 그릇 안의 39알은 곧장 위로 날았다가 도로 담겨 세지 않는다.
    await frames(200);
    expect(game.$$('.grain.is-falling')).toHaveLength(0);
    expect(text('.hud__item--drops .hud__value')).toBe('2회');
    expect(text('.hud__item--remaining .hud__value')).toBe('39알');
  }, 20000);
});
