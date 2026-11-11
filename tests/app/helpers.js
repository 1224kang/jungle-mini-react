import { vi } from 'vitest';
import { h, mount } from '../../src/lib/index.js';
import { App } from '../../src/app/App.js';
import { GRAIN_TYPES } from '../../src/app/config.js';

export const FRAME_MS = 16;

/** 가짜 시계 · requestAnimationFrame을 켠다. (queueMicrotask는 진짜 그대로 둬 배칭 갱신이 돈다) */
export function useFakeClock() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  });
}

/** 예약된 갱신(마이크로태스크)과 MutationObserver 콜백이 끝나게 한다. */
export async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** n 프레임을 진행한다. 프레임마다 갱신이 끝나도록 기다린다. */
export async function frames(n) {
  for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(FRAME_MS);
}

/** 앱을 document에 붙인 컨테이너에 마운트한다. */
export function mountGame(seed = 7) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const app = mount(h(App, { seed }), container);
  const $ = (selector) => container.querySelector(selector);
  const $$ = (selector) => [...container.querySelectorAll(selector)];
  return { app, container, $, $$ };
}

/** 시작(또는 다시 하기) 버튼을 누른다. */
export async function start(game) {
  game.$('.overlay__button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flush();
}

const translateOf = (el) => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.getAttribute('style'));
  return { x: Number(match[1]), y: Number(match[2]) };
};

/** 카메라 위치 (월드 층의 transform에서 읽는다). */
export function cameraOf(game) {
  const { x, y } = translateOf(game.$('.world'));
  return { x: -x || 0, y: -y || 0 };
}

export const typeOf = (el) => /grain--(\w+)/.exec(el.className)[1];

/** 잡곡 요소의 중심 월드 좌표. */
export function centerOf(el) {
  const r = GRAIN_TYPES[typeOf(el)].diameter / 2;
  const { x, y } = translateOf(el);
  return { x: x + r, y: y + r };
}

/** 잡곡 요소의 중심 화면(보드) 좌표. */
export function screenOf(game, el) {
  const center = centerOf(el);
  const camera = cameraOf(game);
  return { x: center.x - camera.x, y: center.y - camera.y };
}

/** 보드에 포인터 이벤트를 보낸다. jsdom의 보드는 크기가 0이라 clientX/Y가 곧 보드 좌표다. */
export function pointer(game, type, point, init = {}) {
  const Ctor = window.PointerEvent ?? window.MouseEvent;
  const event = new Ctor(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    pointerId: 1,
    button: 0,
    ...init,
  });
  if (event.pointerId === undefined) Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  game.$('.board').dispatchEvent(event);
  return event;
}

/** 종류가 type인 잡곡 요소 하나. (잡은 뒤에도 같은 노드가 재사용되는지 볼 수 있게 요소를 돌려준다) */
export function findGrain(game, type) {
  return game.$$('.grain').find((el) => typeOf(el) === type);
}

/** 잡곡의 중심을 눌러 잡는다. */
export async function grabGrain(game, el) {
  const point = screenOf(game, el);
  pointer(game, 'pointerdown', point);
  await flush();
  return point;
}

export function key(type, code, init = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

/** 요소 아래의 DOM 변경 기록을 모은다. take()는 지금까지의 기록을 꺼내고 비운다. */
export function observe(element) {
  let records = [];
  const observer = new MutationObserver((delivered) => records.push(...delivered));
  observer.observe(element, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeOldValue: true,
  });
  return {
    take() {
      const taken = [...records, ...observer.takeRecords()];
      records = [];
      return taken;
    },
    disconnect: () => observer.disconnect(),
  };
}

/** 탭이 가려진 것처럼 만든다. */
export function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}
