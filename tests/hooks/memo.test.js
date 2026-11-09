import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, useState, useMemo } from '../../src/lib/index.js';
import { INVALID, createContainer, cleanupContainers, flushMicrotasks } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

// 루트 App: a, b 상태를 갖고, depsOf(a, b)를 deps로 compute 결과를 기억한다.
function setup(depsOf) {
  let calls = 0;
  const compute = vi.fn(() => ({ id: ++calls }));
  const values = [];
  let setA;
  let setB;
  const App = vi.fn(() => {
    const [a, sa] = useState(0);
    const [b, sb] = useState(0);
    setA = sa;
    setB = sb;
    const value = useMemo(compute, depsOf(a, b));
    values.push(value);
    return h('p', null, `${a}-${b}-${value.id}`);
  });
  const container = createContainer();
  mount(h(App, null), container);
  return { compute, values, App, container, setA: (v) => setA(v), setB: (v) => setB(v) };
}

describe('useMemo - 계산 결과 재사용 (FR-012, NFR-001)', () => {
  it('첫 렌더에서 compute를 1회 호출하고 그 결과를 같은 렌더에서 돌려준다', () => {
    const { compute, values, container } = setup((a) => [a]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(values[0]).toEqual({ id: 1 });
    expect(container.textContent).toBe('0-0-1');
  });

  it('관련 없는 상태만 바뀐 갱신에서는 compute 호출 0회, 같은 결과 참조를 반환한다', async () => {
    const { compute, values, App, setB } = setup((a) => [a]);
    setB(1);
    await flushMicrotasks();
    setB(2);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(3);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(values[1]).toBe(values[0]);
    expect(values[2]).toBe(values[0]);
  });

  it('deps 값이 바뀌면 compute를 1회 다시 호출하고 새 결과를 반환한다', async () => {
    const { compute, values, container, setA } = setup((a) => [a]);
    setA(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(values[1]).not.toBe(values[0]);
    expect(container.textContent).toBe('1-0-2');
  });

  it('deps 원소 중 하나라도 바뀌면 다시 계산한다', async () => {
    const { compute, setA, setB } = setup((a, b) => [a, b]);
    setB(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(2);
    setA(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('deps 길이가 바뀌면 다시 계산한다', async () => {
    const { compute, values, setB } = setup((a, b) => (b === 0 ? [a] : [a, 1]));
    setB(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(values[1]).not.toBe(values[0]);
  });

  it('deps가 []이면 다시 계산하지 않는다', async () => {
    const { compute, setA, setB } = setup(() => []);
    setA(1);
    await flushMicrotasks();
    setB(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('deps 비교는 Object.is로 한다 (NaN은 같은 값, 같은 객체 참조는 같은 값)', async () => {
    const obj = { a: 1 };
    const { compute, setB } = setup(() => [NaN, obj]);
    setB(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('compute는 인자 없이 호출되고, 반환값을 그대로 돌려준다 (undefined 포함)', () => {
    const compute = vi.fn(() => undefined);
    let value = 'unset';
    const App = () => {
      value = useMemo(compute, []);
      return h('p', null);
    };
    mount(h(App, null), createContainer());
    expect(compute).toHaveBeenCalledWith();
    expect(value).toBeUndefined();
  });

  it('useMemo로 기억한 값을 props로 자식에게 넘길 수 있다', async () => {
    const List = ({ items }) => h('ul', null, items.map((x) => h('li', { key: x }, x)));
    let setFilter;
    let setOther;
    const compute = vi.fn();
    const App = () => {
      const [filter, sf] = useState('a');
      const [other, so] = useState(0);
      setFilter = sf;
      setOther = so;
      const items = useMemo(() => {
        compute();
        return ['a1', 'a2', 'b1'].filter((x) => x.startsWith(filter));
      }, [filter]);
      return h('div', null, h(List, { items }), h('i', null, other));
    };
    const container = createContainer();
    mount(h(App, null), container);
    setOther(1);
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(container.querySelector('ul').textContent).toBe('a1a2');
    setFilter('b');
    await flushMicrotasks();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(container.querySelector('ul').textContent).toBe('b1');
  });
});

describe('useMemo - 규칙 (FR-013)', () => {
  it.each([
    ['누락', undefined],
    ['null', null],
    ['문자열', 'a'],
    ['숫자', 1],
    ['일반 객체', { length: 0 }],
  ])('E-6 deps가 %s이면 잘못된 입력 에러, 컨테이너는 그대로', (_name, deps) => {
    const App = () => {
      const v = deps === undefined ? useMemo(() => 1) : useMemo(() => 1, deps);
      return h('p', null, v);
    };
    const container = createContainer();
    const old = document.createElement('span');
    container.appendChild(old);
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expect(container.firstChild).toBe(old);
  });

  it('E-1 자식 컴포넌트에서 useMemo를 부르면 에러', () => {
    const Child = () => {
      const v = useMemo(() => 1, []);
      return h('span', null, v);
    };
    const App = () => h('div', null, h(Child, null));
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
  });

  it('E-2 렌더 밖에서 useMemo를 부르면 에러', () => {
    expect(() => useMemo(() => 1, [])).toThrow(INVALID);
  });
});
