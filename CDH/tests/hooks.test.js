// @vitest-environment jsdom
// useState / useEffect / useMemo 단위 테스트 (FunctionComponent 와 함께 동작)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, FunctionComponent, useState, useEffect, useMemo } from '../src/lib/index.js';

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root');
});

// 테스트에서 setter 를 밖으로 꺼내 쓰기 위한 도우미
function mountSync(fn, props) {
  return new FunctionComponent(fn, { props, batch: false }).mount(root);
}

describe('useState', () => {
  it('초기값을 돌려주고, setState 후 화면이 바뀐다', () => {
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, `n=${n}`);
    });
    expect(root.textContent).toBe('n=0');
    set(5);
    expect(root.textContent).toBe('n=5');
  });

  it('함수는 매번 새로 실행되지만 상태는 hooks 배열에 유지된다', () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(10);
      set = setN;
      return h('p', null, n);
    });
    const c = mountSync(render);
    set(11);
    set(12);
    expect(render).toHaveBeenCalledTimes(3);
    expect(c.hooks[0].value).toBe(12);
    expect(root.textContent).toBe('12');
  });

  it('여러 개의 useState 는 호출 순서(칸 번호)로 구분된다', () => {
    let setA, setB;
    mountSync(() => {
      const [a, sa] = useState('a');
      const [b, sb] = useState('b');
      setA = sa;
      setB = sb;
      return h('p', null, a, b);
    });
    setB('B');
    expect(root.textContent).toBe('aB');
    setA('A');
    expect(root.textContent).toBe('AB');
  });

  it('함수형 업데이트는 최신 값을 받는다', () => {
    let set;
    const c = mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    set((x) => x + 1);
    set((x) => x + 1);
    expect(c.hooks[0].value).toBe(2);
  });

  it('같은 값(Object.is)으로 바꾸면 다시 그리지 않는다 (NaN 포함)', () => {
    let set;
    const render = vi.fn(() => {
      const [v, setV] = useState(NaN);
      set = setV;
      return h('p', null, String(v));
    });
    mountSync(render);
    set(NaN);
    expect(render).toHaveBeenCalledTimes(1);
    set(1);
    set(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('setter 는 렌더가 바뀌어도 같은 함수 (참조 유지)', () => {
    const setters = [];
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      setters.push(setN);
      set = setN;
      return h('p', null, n);
    });
    set(1);
    expect(setters[0]).toBe(setters[1]);
  });

  it('초기값에 함수를 주면 처음 한 번만 실행한다 (lazy init)', () => {
    let set;
    const init = vi.fn(() => 42);
    mountSync(() => {
      const [n, setN] = useState(init);
      set = setN;
      return h('p', null, n);
    });
    set(1);
    expect(init).toHaveBeenCalledTimes(1);
    expect(root.textContent).toBe('1');
  });

  it('객체/배열 상태는 새 참조로 바꿔야 갱신된다 (같은 객체를 고치면 무시)', () => {
    let set, state;
    const render = vi.fn(() => {
      const [s, setS] = useState({ n: 0 });
      set = setS;
      state = s;
      return h('p', null, s.n);
    });
    mountSync(render);
    state.n = 1;
    set(state);
    expect(render).toHaveBeenCalledTimes(1);
    set({ n: 2 });
    expect(root.textContent).toBe('2');
  });

  it('렌더 중 setState 는 렌더를 버리고 다시 실행한다 (파생 상태)', () => {
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      if (n < 3) setN(n + 1);
      return h('p', null, n);
    });
    mountSync(render);
    expect(root.textContent).toBe('3');
    expect(render).toHaveBeenCalledTimes(4);
  });

  it('렌더 중 setState 가 끝나지 않으면 오류로 멈춘다', () => {
    expect(() =>
      mountSync(() => {
        const [n, setN] = useState(0);
        setN(n + 1);
        return h('p');
      })
    ).toThrow(/너무 많이/);
  });
});

describe('useEffect', () => {
  it('렌더가 끝나고 DOM 이 그려진 뒤에 실행된다', () => {
    let seen = null;
    mountSync(() => {
      useEffect(() => {
        seen = root.textContent;
      });
      return h('p', null, '그려짐');
    });
    expect(seen).toBe('그려짐');
  });

  it('deps 가 없으면 매 렌더, [] 이면 처음 한 번, [x] 이면 x 가 바뀔 때만', () => {
    let setA, setB;
    const always = vi.fn();
    const once = vi.fn();
    const onA = vi.fn();
    mountSync(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      useEffect(always);
      useEffect(once, []);
      useEffect(onA, [a]);
      return h('p', null, a, b);
    });
    expect([always, once, onA].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    setB(1);
    expect([always, once, onA].map((f) => f.mock.calls.length)).toEqual([2, 1, 1]);
    setA(1);
    expect([always, once, onA].map((f) => f.mock.calls.length)).toEqual([3, 1, 2]);
  });

  it('정리(cleanup) 함수는 다음 effect 실행 전, 그리고 unmount 때 불린다', () => {
    const log = [];
    let set;
    const c = mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useEffect(() => {
        log.push(`run${n}`);
        return () => log.push(`clean${n}`);
      }, [n]);
      return h('p', null, n);
    });
    set(1);
    set(2);
    c.unmount();
    expect(log).toEqual(['run0', 'clean0', 'run1', 'clean1', 'run2', 'clean2']);
  });

  it('여러 effect: 바뀐 것들의 cleanup 이 전부 끝난 뒤 새 effect 들이 실행된다', () => {
    const log = [];
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useEffect(() => {
        log.push(`A${n}`);
        return () => log.push(`cleanA${n}`);
      }, [n]);
      useEffect(() => {
        log.push(`B${n}`);
        return () => log.push(`cleanB${n}`);
      }, [n]);
      return h('p');
    });
    log.length = 0;
    set(1);
    expect(log).toEqual(['cleanA0', 'cleanB0', 'A1', 'B1']);
  });

  it('deps 가 안 바뀐 effect 의 cleanup 은 불리지 않는다', () => {
    const clean = vi.fn();
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useEffect(() => clean, []);
      return h('p', null, n);
    });
    set(1);
    expect(clean).not.toHaveBeenCalled();
  });

  it('effect 안에서 setState 하면 이어서 한 번 더 그린다', () => {
    const render = vi.fn();
    mountSync(() => {
      const [n, setN] = useState(0);
      render();
      useEffect(() => {
        setN(5);
      }, []);
      return h('p', null, n);
    });
    expect(root.textContent).toBe('5');
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('deps 없이 effect 에서 항상 다른 값을 setState 하면 무한 루프를 막는다', () => {
    expect(() =>
      mountSync(() => {
        const [n, setN] = useState(0);
        useEffect(() => {
          setN(n + 1);
        });
        return h('p', null, n);
      })
    ).toThrow(/너무 많이/);
  });

  it('effect 하나가 던져도 나머지 effect 는 실행되고 오류는 다시 던져진다', () => {
    const second = vi.fn();
    expect(() =>
      mountSync(() => {
        useEffect(() => {
          throw new Error('boom');
        }, []);
        useEffect(second, []);
        return h('p');
      })
    ).toThrow('boom');
    expect(second).toHaveBeenCalled();
  });

  it('Promise 등 함수가 아닌 반환값은 cleanup 으로 취급하지 않는다', () => {
    let set;
    const c = mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useEffect(() => Promise.resolve(), [n]);
      return h('p', null, n);
    });
    expect(() => set(1)).not.toThrow();
    expect(() => c.unmount()).not.toThrow();
  });

  it('deps 가 배열이 아니면 TypeError', () => {
    expect(() =>
      mountSync(() => {
        useEffect(() => {}, 'x');
        return h('p');
      })
    ).toThrow(TypeError);
  });

  it('NaN deps 는 Object.is 로 비교해 같은 값으로 본다', () => {
    const fx = vi.fn();
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useEffect(fx, [NaN]);
      return h('p', null, n);
    });
    set(1);
    expect(fx).toHaveBeenCalledTimes(1);
  });
});

describe('useMemo', () => {
  it('deps 가 같으면 계산을 건너뛰고 같은 값을 돌려준다', () => {
    let setA, setB;
    const factory = vi.fn((a) => ({ double: a * 2 }));
    const values = [];
    mountSync(() => {
      const [a, sa] = useState(1);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      const m = useMemo(() => factory(a), [a]);
      values.push(m);
      return h('p', null, m.double, b);
    });
    setB(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(values[1]).toBe(values[0]);
    setA(2);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('41');
  });

  it('deps 를 생략하면 매 렌더 다시 계산한다', () => {
    let set;
    const factory = vi.fn(() => 1);
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useMemo(factory);
      return h('p', null, n);
    });
    set(1);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('[] 이면 한 번만 계산한다', () => {
    let set;
    const factory = vi.fn(() => 1);
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useMemo(factory, []);
      return h('p', null, n);
    });
    set(1);
    set(2);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('deps 를 빠뜨리면 옛 값이 남는다 (stale)', () => {
    let set;
    mountSync(() => {
      const [n, setN] = useState(1);
      set = setN;
      const doubled = useMemo(() => n * 2, []); // n 을 빠뜨림
      return h('p', null, doubled);
    });
    set(5);
    expect(root.textContent).toBe('2');
  });

  it('factory 가 함수가 아니면 TypeError', () => {
    expect(() =>
      mountSync(() => {
        useMemo(42, []);
        return h('p');
      })
    ).toThrow(TypeError);
  });
});

describe('Hook 규칙', () => {
  it('렌더 밖에서 Hook 을 부르면 오류', () => {
    expect(() => useState(0)).toThrow(/렌더되는 동안에만/);
    expect(() => useEffect(() => {})).toThrow(/렌더되는 동안에만/);
    expect(() => useMemo(() => 1, [])).toThrow(/렌더되는 동안에만/);
  });

  it('자식 컴포넌트에서 Hook 을 부르면 오류 (상태는 루트에만)', () => {
    const Child = () => {
      useState(0);
      return h('span');
    };
    expect(() => mountSync(() => h('div', null, h(Child)))).toThrow(/루트 컴포넌트에서만/);
  });

  it('effect 콜백 안에서 Hook 을 부르면 오류', () => {
    expect(() =>
      mountSync(() => {
        useEffect(() => {
          useState(0);
        }, []);
        return h('p');
      })
    ).toThrow(/렌더되는 동안에만/);
  });

  it('조건부 Hook: 다음 렌더에 Hook 이 늘어나면 오류', () => {
    let set;
    const c = mountSync(() => {
      const [on, setOn] = useState(false);
      set = setOn;
      if (on) useState(1);
      return h('p', null, String(on));
    });
    expect(() => set(true)).toThrow(/더 많이/);
    expect(c.hookCount).toBe(1);
  });

  it('조건부 Hook: 다음 렌더에 Hook 이 줄어들면 오류', () => {
    let set;
    mountSync(() => {
      const [on, setOn] = useState(true);
      set = setOn;
      if (on) useState(1);
      return h('p', null, String(on));
    });
    expect(() => set(false)).toThrow(/적게/);
  });

  it('같은 칸에 다른 종류 Hook 이 오면 오류', () => {
    let set;
    mountSync(() => {
      const [on, setOn] = useState(true);
      set = setOn;
      if (on) useMemo(() => 1, []);
      else useEffect(() => {}, []);
      return h('p');
    });
    expect(() => set(false)).toThrow(/순서/);
  });

  it('첫 렌더가 오류로 실패하면 hooks 가 비워져 다시 mount 할 수 있다', () => {
    let fail = true;
    const c = new FunctionComponent(() => {
      useState(1);
      if (fail) throw new Error('첫 렌더 실패');
      return h('p', null, 'ok');
    }, { batch: false });
    expect(() => c.mount(root)).toThrow('첫 렌더 실패');
    expect(c.hooks).toEqual([]);
    fail = false;
    c.mount(root);
    expect(root.textContent).toBe('ok');
  });
});
