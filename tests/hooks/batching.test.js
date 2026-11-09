import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, useState } from '../../src/lib/index.js';
import { createContainer, cleanupContainers, flushMicrotasks, observeMutations, click } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

// 루트 App: count를 보여 주고, 버튼 핸들러는 테스트가 넘긴 함수를 setCount와 함께 부른다.
function mountCounter(handler) {
  const App = vi.fn(() => {
    const [count, setCount] = useState(0);
    return h('div', null,
      h('span', { class: 'count' }, count),
      h('button', { onclick: () => handler(setCount) }, '누르기'));
  });
  const container = createContainer();
  mount(h(App, null), container);
  const read = () => container.querySelector('.count').textContent;
  const press = () => click(container.querySelector('button'));
  return { App, container, read, press };
}

describe('갱신 배칭 (FR-005, D-002, TD-005)', () => {
  it('한 핸들러에서 setCount(c => c + 1)을 3번 부르면 마이크로태스크 후 +3, 루트 호출은 1회', async () => {
    const { App, read, press } = mountCounter((setCount) => {
      setCount((c) => c + 1);
      setCount((c) => c + 1);
      setCount((c) => c + 1);
    });
    expect(App).toHaveBeenCalledTimes(1);

    press();
    // 마이크로태스크 한 번 대기로 확인할 수 있어야 한다 (NFR-003, TD-012)
    await Promise.resolve();

    expect(read()).toBe('3');
    expect(App).toHaveBeenCalledTimes(2);

    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
  });

  it('갱신은 핸들러가 끝난 뒤에 일어난다: 동기 구간에서는 루트가 다시 호출되지 않고 화면도 이전 값이다', () => {
    const { App, read, press } = mountCounter((setCount) => {
      setCount((c) => c + 1);
      setCount((c) => c + 1);
    });
    press();
    expect(App).toHaveBeenCalledTimes(1);
    expect(read()).toBe('0');
  });

  it('함수형 업데이트는 앞선 변경이 반영된 값을 받는다 (값 설정과 섞어도 누락 없음)', async () => {
    const seen = [];
    const { App, read, press } = mountCounter((setCount) => {
      setCount(10);
      setCount((c) => { seen.push(c); return c + 1; });
      setCount((c) => { seen.push(c); return c * 2; });
    });
    press();
    await flushMicrotasks();
    expect(seen).toEqual([10, 11]);
    expect(read()).toBe('22');
    expect(App).toHaveBeenCalledTimes(2);
  });

  it('여러 상태를 한 핸들러에서 바꿔도 렌더는 1회이고 화면은 마지막 상태와 일치한다', async () => {
    const App = vi.fn(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState('x');
      const onclick = () => {
        setA(1);
        setB((v) => v + 'y');
        setA(2);
      };
      return h('div', null, h('p', null, `${a}${b}`), h('button', { onclick }, '누르기'));
    });
    const container = createContainer();
    mount(h(App, null), container);
    click(container.querySelector('button'));
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.querySelector('p').textContent).toBe('2xy');
  });

  it('핸들러 밖(같은 동기 작업)에서 부른 setState도 묶여서 1회만 렌더한다', async () => {
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', null, count);
    });
    const container = createContainer();
    mount(h(App, null), container);
    for (let i = 0; i < 5; i++) setCount((c) => c + 1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('5');
  });

  it('서로 다른 작업(마이크로태스크 대기를 사이에 둔 두 번의 클릭)은 각각 1회씩 렌더한다', async () => {
    const { App, read, press } = mountCounter((setCount) => {
      setCount((c) => c + 1);
      setCount((c) => c + 1);
    });
    press();
    await flushMicrotasks();
    press();
    await flushMicrotasks();
    expect(read()).toBe('4');
    expect(App).toHaveBeenCalledTimes(3);
  });

  it('갱신 예약은 queueMicrotask로 하며 한 작업에서 1번만 예약한다', async () => {
    const spy = vi.spyOn(globalThis, 'queueMicrotask');
    const { press } = mountCounter((setCount) => {
      setCount((c) => c + 1);
      setCount((c) => c + 1);
      setCount((c) => c + 1);
    });
    spy.mockClear();
    press();
    expect(spy).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
  });

  it('값이 0 → 1 → 0으로 돌아오면 렌더는 1회 일어나지만 DOM 변경은 0회다 (8.2)', async () => {
    const { App, container, read, press } = mountCounter((setCount) => {
      setCount(1);
      setCount(0);
    });
    const span = container.querySelector('.count');
    const mutations = observeMutations(container);
    press();
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    // 버튼의 인라인 onclick은 리스너만 교체하므로 DOM 변경 기록(MutationObserver)에는 남지 않는다.
    expect(mutations.records()).toHaveLength(0);
    mutations.disconnect();
    expect(container.querySelector('.count')).toBe(span);
    expect(read()).toBe('0');
  });

  it('같은 값만 여러 번 넣으면 렌더 0회 (NFR-001)', async () => {
    const { App, read, press } = mountCounter((setCount) => {
      setCount(0);
      setCount((c) => c);
      setCount(0);
    });
    press();
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(1);
    expect(read()).toBe('0');
  });
});
