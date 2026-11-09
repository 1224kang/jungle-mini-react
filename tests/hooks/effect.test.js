import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, useState, useEffect } from '../../src/lib/index.js';
import {
  INVALID,
  createContainer,
  cleanupContainers,
  flushMicrotasks,
  captureMicrotaskErrors,
  click,
} from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

describe('useEffect - DOM 반영 후 실행 (FR-009, TD-006)', () => {
  it('첫 렌더의 effect는 mount 안에서 DOM이 컨테이너에 반영된 뒤 실행된다', () => {
    const container = createContainer();
    const seen = [];
    const App = () => {
      useEffect(() => {
        seen.push(container.innerHTML);
      });
      return h('p', null, '처음');
    };
    mount(h(App, null), container);
    expect(seen).toEqual(['<p>처음</p>']);
  });

  it('갱신 후 effect 안에서 읽은 DOM은 이미 새 상태를 반영한다', async () => {
    const container = createContainer();
    const seen = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => {
        seen.push([count, container.querySelector('.count').textContent]);
      });
      return h('p', { class: 'count' }, count);
    };
    mount(h(App, null), container);
    setCount(1);
    await flushMicrotasks();
    expect(seen).toEqual([[0, '0'], [1, '1']]);
  });

  it('effect는 렌더 중에는 실행되지 않고 루트 호출이 끝난 뒤 실행된다', () => {
    const log = [];
    const Child = () => {
      log.push('자식 렌더');
      return h('span', null);
    };
    const App = () => {
      log.push('루트 렌더 시작');
      useEffect(() => {
        log.push('effect');
      });
      log.push('루트 렌더 끝');
      return h('div', null, h(Child, null));
    };
    mount(h(App, null), createContainer());
    expect(log).toEqual(['루트 렌더 시작', '루트 렌더 끝', '자식 렌더', 'effect']);
  });

  it('useEffect는 undefined를 반환한다', () => {
    let result = 'unset';
    const App = () => {
      result = useEffect(() => {});
      return h('p', null);
    };
    mount(h(App, null), createContainer());
    expect(result).toBeUndefined();
  });
});

describe('useEffect - deps에 따른 실행 횟수 (FR-009)', () => {
  function setup(depsOf) {
    const effect = vi.fn();
    let setA;
    let setB;
    const App = vi.fn(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      useEffect(effect, depsOf(a, b));
      return h('p', null, `${a}-${b}`);
    });
    mount(h(App, null), createContainer());
    return { effect, App, setA: (v) => setA(v), setB: (v) => setB(v) };
  }

  it('deps를 생략하면 매 렌더 후 실행된다', async () => {
    const { effect, App, setA, setB } = setup(() => undefined);
    expect(effect).toHaveBeenCalledTimes(1);
    setA(1);
    await flushMicrotasks();
    setB(1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(3);
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('deps가 []이면 첫 렌더 후 1회만 실행된다', async () => {
    const { effect, App, setA, setB } = setup(() => []);
    setA(1);
    await flushMicrotasks();
    setB(1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(3);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('deps 값이 바뀐 렌더에서만 다시 실행된다 (관련 없는 상태만 바뀌면 실행 안 함)', async () => {
    const { effect, App, setA, setB } = setup((a) => [a]);
    expect(effect).toHaveBeenCalledTimes(1);
    setB(1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenCalledTimes(1);
    setA(1);
    await flushMicrotasks();
    expect(effect).toHaveBeenCalledTimes(2);
    setB(2);
    await flushMicrotasks();
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('deps 원소 중 하나라도 바뀌면 다시 실행된다', async () => {
    const { effect, setA, setB } = setup((a, b) => [a, b]);
    setB(1);
    await flushMicrotasks();
    expect(effect).toHaveBeenCalledTimes(2);
    setA(1);
    await flushMicrotasks();
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('deps 비교는 Object.is로 한다 (NaN은 같은 값)', async () => {
    const effect = vi.fn();
    let setOther;
    const App = vi.fn(() => {
      const [other, set] = useState(0);
      setOther = set;
      useEffect(effect, [NaN]);
      return h('p', null, other);
    });
    mount(h(App, null), createContainer());
    setOther(1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('같은 값만 넣어 렌더가 일어나지 않으면 effect도 실행되지 않는다', async () => {
    const { effect, App, setA } = setup(() => undefined);
    setA(0);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(1);
  });
});

describe('useEffect - 정리 작업 (FR-010)', () => {
  it('다시 실행하기 전에 이전 실행이 반환한 cleanup이 먼저 실행된다', async () => {
    const log = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => {
        log.push(`effect ${count}`);
        return () => log.push(`cleanup ${count}`);
      }, [count]);
      return h('p', null, count);
    };
    mount(h(App, null), createContainer());
    setCount(1);
    await flushMicrotasks();
    setCount(2);
    await flushMicrotasks();
    expect(log).toEqual(['effect 0', 'cleanup 0', 'effect 1', 'cleanup 1', 'effect 2']);
  });

  it('실행 대상 effect들의 cleanup을 선언 순서로 모두 실행한 뒤 effect를 선언 순서로 실행한다', async () => {
    const log = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => {
        log.push(`effect A${count}`);
        return () => log.push(`cleanup A${count}`);
      });
      useEffect(() => {
        log.push(`effect B${count}`);
        return () => log.push(`cleanup B${count}`);
      });
      return h('p', null, count);
    };
    mount(h(App, null), createContainer());
    expect(log).toEqual(['effect A0', 'effect B0']);
    log.length = 0;
    setCount(1);
    await flushMicrotasks();
    expect(log).toEqual(['cleanup A0', 'cleanup B0', 'effect A1', 'effect B1']);
  });

  it('실행 대상이 아닌 effect의 cleanup은 실행하지 않는다', async () => {
    const log = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => {
        log.push('effect 한번');
        return () => log.push('cleanup 한번');
      }, []);
      useEffect(() => {
        log.push(`effect 매번${count}`);
        return () => log.push(`cleanup 매번${count}`);
      });
      return h('p', null, count);
    };
    mount(h(App, null), createContainer());
    log.length = 0;
    setCount(1);
    await flushMicrotasks();
    expect(log).toEqual(['cleanup 매번0', 'effect 매번1']);
  });

  it('effect가 함수가 아닌 값을 반환하면 cleanup 없이 넘어간다 (다음 실행에 에러 없음)', async () => {
    const effect = vi.fn(() => undefined);
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(effect);
      return h('p', null, count);
    };
    mount(h(App, null), createContainer());
    const capture = captureMicrotaskErrors();
    setCount(1);
    await flushMicrotasks();
    capture.restore();
    expect(capture.errors).toEqual([]);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('cleanup이 실행될 때도 DOM은 이미 새 상태를 반영한다 (patch 직후 실행)', async () => {
    const container = createContainer();
    const seen = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => () => seen.push(container.textContent));
      return h('p', null, count);
    };
    mount(h(App, null), container);
    setCount(1);
    await flushMicrotasks();
    expect(seen).toEqual(['1']);
  });
});

describe('useEffect - effect 안의 상태 변경 (FR-011)', () => {
  it('effect 안에서 setState를 여러 번 부르면 다음 마이크로태스크에 렌더 1회', async () => {
    const container = createContainer();
    const App = vi.fn(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      useEffect(() => {
        setA(1);
        setB((x) => x + 1);
        setB((x) => x + 1);
      }, []);
      return h('p', null, `${a}-${b}`);
    });
    mount(h(App, null), container);
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('0-0');
    await Promise.resolve();
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('1-2');
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
  });

  it('갱신 후 effect에서 바꾼 상태도 배칭되어 1회 더 렌더된다', async () => {
    const container = createContainer();
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      const [double, setDouble] = useState(0);
      setCount = set;
      useEffect(() => {
        setDouble(count * 2);
        setDouble(count * 2);
      }, [count]);
      return h('p', null, `${count}/${double}`);
    });
    mount(h(App, null), container);
    setCount(3);
    await flushMicrotasks();
    expect(container.textContent).toBe('3/6');
    // mount 1회 + count 갱신 1회 + effect발 갱신 1회
    expect(App).toHaveBeenCalledTimes(3);
  });

  it('E-11 매 렌더 상태를 바꾸는 effect는 연속 갱신이 50회를 넘으면 에러로 멈춘다', async () => {
    const capture = captureMicrotaskErrors();
    const App = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        setN((x) => x + 1);
      });
      return h('p', null, n);
    });
    mount(h(App, null), createContainer());
    await flushMicrotasks(300);
    const calls = App.mock.calls.length;
    await flushMicrotasks(50);
    capture.restore();

    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0]).toBeInstanceOf(TypeError);
    expect(capture.errors[0].message).toMatch(INVALID);
    expect(calls).toBeGreaterThanOrEqual(50);
    expect(calls).toBeLessThanOrEqual(60);
    // 에러 뒤에는 더 이상 갱신이 이어지지 않는다
    expect(App).toHaveBeenCalledTimes(calls);
  });

  it('effect 밖(이벤트)에서 시작한 갱신은 연속 횟수를 0으로 초기화한다 (50회 넘게 클릭해도 에러 없음)', async () => {
    const container = createContainer();
    const App = () => {
      const [count, setCount] = useState(0);
      const [double, setDouble] = useState(0);
      useEffect(() => {
        setDouble(count * 2);
      }, [count]);
      return h('button', { onclick: () => setCount((c) => c + 1) }, `${count}/${double}`);
    };
    mount(h(App, null), container);
    const capture = captureMicrotaskErrors();
    for (let i = 0; i < 60; i++) {
      click(container.querySelector('button'));
      await flushMicrotasks();
    }
    capture.restore();
    expect(capture.errors).toEqual([]);
    expect(container.textContent).toBe('60/120');
  });
});

describe('useEffect - 규칙 (FR-013)', () => {
  it.each([
    ['문자열', 'a'],
    ['숫자', 1],
    ['일반 객체', { length: 0 }],
  ])('E-6 deps가 배열이 아니면(%s) 잘못된 입력 에러', (_name, deps) => {
    const App = () => {
      useEffect(() => {}, deps);
      return h('p', null);
    };
    const container = createContainer();
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expect(container.childNodes).toHaveLength(0);
  });

  it('E-1 자식 컴포넌트에서 useEffect를 부르면 에러', () => {
    const Child = () => {
      useEffect(() => {});
      return h('span', null);
    };
    const App = () => h('div', null, h(Child, null));
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
  });

  it('E-2 렌더 밖에서 useEffect를 부르면 에러', () => {
    expect(() => useEffect(() => {})).toThrow(INVALID);
  });

  it('E-13 첫 렌더가 실패하면 effect는 실행되지 않는다', () => {
    const effect = vi.fn();
    const Bad = () => null;
    const App = () => {
      useEffect(effect);
      return h('div', null, h(Bad, null));
    };
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
    expect(effect).not.toHaveBeenCalled();
  });
});
