import { describe, it, expect, vi, afterEach } from 'vitest';
import { FunctionComponent, h, mount, useState, useEffect, useMemo } from '../../src/lib/index.js';
import {
  INVALID,
  createContainer,
  cleanupContainers,
  flushMicrotasks,
  observeMutations,
  click,
} from './helpers.js';

const MINI_REACT_ERROR = /^\[mini-react\] .+/;

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

// 루트 App: count를 보여 주고 버튼 핸들러는 테스트가 넘긴 함수를 setCount와 함께 부른다.
function counterApp(handler = (set) => set((c) => c + 1)) {
  const App = vi.fn(() => {
    const [count, setCount] = useState(0);
    return h('div', null,
      h('span', { class: 'count' }, count),
      h('button', { onclick: () => handler(setCount) }, '누르기'));
  });
  return App;
}

describe('FunctionComponent - 생성자 (FR-020, §5.3)', () => {
  it('컴포넌트 VNode로 인스턴스를 만든다', () => {
    const instance = new FunctionComponent(h(counterApp(), null));
    expect(instance).toBeInstanceOf(FunctionComponent);
  });

  it.each([
    ['요소 VNode', h('div', null)],
    ['null', null],
    ['undefined', undefined],
    ['문자열', 'App'],
    ['함수 그 자체', () => h('p', null)],
    ['텍스트 VNode', { type: '#text', value: 'x' }],
    ['일반 객체', { a: 1 }],
  ])('컴포넌트 VNode가 아니면(%s) 잘못된 입력 에러', (_name, vnode) => {
    expect(() => new FunctionComponent(vnode)).toThrow(INVALID);
    expect(() => new FunctionComponent(vnode)).toThrow(TypeError);
  });

  it('생성만 해서는 컴포넌트를 호출하지 않는다 (렌더는 mount에서)', () => {
    const App = counterApp();
    new FunctionComponent(h(App, null));
    expect(App).not.toHaveBeenCalled();
  });
});

describe('FunctionComponent - hooks 배열', () => {
  it('mount 전에도 hooks는 배열이다', () => {
    const instance = new FunctionComponent(h(counterApp(), null));
    expect(Array.isArray(instance.hooks)).toBe(true);
  });

  it('첫 렌더 후 hooks에는 루트가 부른 Hook 수만큼 슬롯이 들어 있다', () => {
    const App = () => {
      const [a] = useState(1);
      useState('b');
      useEffect(() => {});
      const m = useMemo(() => a * 2, [a]);
      return h('p', null, m);
    };
    const instance = new FunctionComponent(h(App, null)).mount(createContainer());
    expect(Array.isArray(instance.hooks)).toBe(true);
    expect(instance.hooks).toHaveLength(4);
  });

  it('갱신 후에도 hooks 슬롯 수는 그대로다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useState('고정');
      return h('p', null, count);
    };
    const instance = new FunctionComponent(h(App, null)).mount(createContainer());
    setCount(1);
    await flushMicrotasks();
    expect(instance.hooks).toHaveLength(2);
  });

  it('Hook을 쓰지 않는 루트는 hooks가 빈 배열이다', () => {
    const instance = new FunctionComponent(h(() => h('p', null), null)).mount(createContainer());
    expect(instance.hooks).toEqual([]);
  });
});

describe('FunctionComponent - mount(container)', () => {
  it('화면을 그리고 인스턴스 자신을 반환한다', () => {
    const container = createContainer();
    container.append('이전');
    const instance = new FunctionComponent(h(counterApp(), null));
    expect(instance.mount(container)).toBe(instance);
    expect(container.childNodes).toHaveLength(1);
    expect(container.querySelector('.count').textContent).toBe('0');
  });

  it('루트 컴포넌트는 vnode의 props를 받아 1회 호출된다', () => {
    const App = vi.fn(({ title }) => h('h1', null, title));
    const container = createContainer();
    new FunctionComponent(h(App, { title: '제목' })).mount(container);
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('<h1>제목</h1>');
  });

  it('mount 직후 effect가 실행된다', () => {
    const effect = vi.fn();
    const App = () => {
      useEffect(effect, []);
      return h('p', null);
    };
    new FunctionComponent(h(App, null)).mount(createContainer());
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null', null],
    ['일반 객체', {}],
    ['Text 노드', document.createTextNode('x')],
  ])('container가 Element가 아니면(%s) 잘못된 입력 에러', (_name, container) => {
    const instance = new FunctionComponent(h(counterApp(), null));
    expect(() => instance.mount(container)).toThrow(INVALID);
  });

  it('두 번째 mount는 에러이고 처음 그린 화면은 그대로다', () => {
    const App = counterApp();
    const first = createContainer();
    const second = createContainer();
    second.append('두 번째');
    const instance = new FunctionComponent(h(App, null)).mount(first);
    const dom = first.firstChild;
    expect(() => instance.mount(second)).toThrow(MINI_REACT_ERROR);
    expect(() => instance.mount(first)).toThrow(MINI_REACT_ERROR);
    expect(first.firstChild).toBe(dom);
    expect(second.textContent).toBe('두 번째');
    expect(App).toHaveBeenCalledTimes(1);
  });

  it('unmount한 인스턴스를 다시 mount하면 에러', () => {
    const instance = new FunctionComponent(h(counterApp(), null)).mount(createContainer());
    instance.unmount();
    const container = createContainer();
    expect(() => instance.mount(container)).toThrow(MINI_REACT_ERROR);
    expect(container.childNodes).toHaveLength(0);
  });

  it('첫 렌더 에러는 mount가 던지고 컨테이너는 그대로다 (E-13)', () => {
    const Child = () => {
      useState(0);
      return h('span', null);
    };
    const App = () => h('div', null, h(Child, null));
    const container = createContainer();
    const old = document.createElement('b');
    container.appendChild(old);
    expect(() => new FunctionComponent(h(App, null)).mount(container)).toThrow(INVALID);
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(old);
  });
});

describe('FunctionComponent - update()', () => {
  it('직접 부르면 동기로 다시 그려 호출 직후 DOM이 현재 상태를 반영한다', () => {
    const external = { label: '처음' };
    const App = vi.fn(() => h('p', null, external.label));
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    const p = container.firstChild;
    external.label = '다음';
    instance.update();
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe('<p>다음</p>');
    expect(container.firstChild).toBe(p);
  });

  it('setState 직후 update()를 직접 부르면 바로 반영되고, 예약된 마이크로태스크는 다시 렌더하지 않는다', async () => {
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', null, count);
    });
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    setCount(5);
    expect(container.textContent).toBe('0');
    instance.update();
    expect(container.textContent).toBe('5');
    expect(App).toHaveBeenCalledTimes(2);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('5');
  });

  it('상태 변경 없이 직접 부르면 루트는 다시 호출되지만 DOM 변경은 0회다', () => {
    const App = counterApp();
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    const span = container.querySelector('.count');
    const mutations = observeMutations(container);
    instance.update();
    expect(App).toHaveBeenCalledTimes(2);
    expect(mutations.records()).toHaveLength(0);
    mutations.disconnect();
    expect(container.querySelector('.count')).toBe(span);
  });

  it('mount 전에 부르면 에러 없이 아무것도 하지 않는다', () => {
    const App = counterApp();
    const instance = new FunctionComponent(h(App, null));
    expect(() => instance.update()).not.toThrow();
    expect(App).not.toHaveBeenCalled();
  });

  it('unmount 후에 부르면 에러 없이 아무것도 하지 않는다', () => {
    const App = counterApp();
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    instance.unmount();
    expect(() => instance.update()).not.toThrow();
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('직접 update()에서도 deps가 바뀐 effect는 cleanup → effect 순으로 실행되고, 그대로인 effect는 실행되지 않는다', () => {
    const external = { value: 1 };
    const log = [];
    const App = () => {
      useEffect(() => {
        log.push(`effect ${external.value}`);
        return () => log.push(`cleanup ${external.value}`);
      }, [external.value]);
      useEffect(() => {
        log.push('한번');
      }, []);
      return h('p', null, external.value);
    };
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    expect(log).toEqual(['effect 1', '한번']);
    log.length = 0;

    instance.update();
    expect(log).toEqual([]);

    external.value = 2;
    instance.update();
    expect(log).toEqual(['cleanup 2', 'effect 2']);
    expect(container.textContent).toBe('2');
  });

  it('직접 update()에서 렌더 에러가 나면 동기로 던지고 DOM은 이전 그대로다', () => {
    const external = { extra: false };
    const App = () => {
      useState(0);
      if (external.extra) useState(1);
      return h('p', null, '화면');
    };
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    const p = container.firstChild;
    external.extra = true;
    expect(() => instance.update()).toThrow(INVALID);
    expect(container.firstChild).toBe(p);
    expect(container.innerHTML).toBe('<p>화면</p>');
  });
});

describe('FunctionComponent - 배칭과 update() (FR-005 유지)', () => {
  it('한 핸들러에서 setState 3회 → 마이크로태스크 후 update()가 정확히 1회 호출된다', async () => {
    const App = counterApp((set) => {
      set((c) => c + 1);
      set((c) => c + 1);
      set((c) => c + 1);
    });
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    const update = vi.spyOn(instance, 'update');

    click(container.querySelector('button'));
    expect(update).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.count').textContent).toBe('3');

    await flushMicrotasks();
    expect(update).toHaveBeenCalledTimes(1);
    expect(App).toHaveBeenCalledTimes(2);
  });

  it('같은 값만 넣으면 update()는 호출되지 않는다', async () => {
    const App = counterApp((set) => {
      set(0);
      set((c) => c);
    });
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    const update = vi.spyOn(instance, 'update');
    click(container.querySelector('button'));
    await flushMicrotasks();
    expect(update).not.toHaveBeenCalled();
  });

  it('unmount 전에 예약된 갱신은 unmount 뒤에 update()를 부르지 않거나, 불러도 아무것도 하지 않는다', async () => {
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', null, count);
    });
    const container = createContainer();
    const instance = new FunctionComponent(h(App, null)).mount(container);
    setCount(1);
    instance.unmount();
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });
});

describe('mount(vnode, container) 함수와의 호환 (FR-015)', () => {
  it('컴포넌트 VNode를 mount하면 FunctionComponent 인스턴스를 반환한다', () => {
    const container = createContainer();
    const app = mount(h(counterApp(), null), container);
    expect(app).toBeInstanceOf(FunctionComponent);
    expect(Array.isArray(app.hooks)).toBe(true);
    expect(app.hooks).toHaveLength(1);
    expect(container.querySelector('.count').textContent).toBe('0');
  });

  it('반환된 인스턴스의 unmount()는 cleanup을 실행하고 컨테이너를 비운다', () => {
    const cleanup = vi.fn();
    const App = () => {
      useEffect(() => cleanup, []);
      return h('p', null);
    };
    const container = createContainer();
    const app = mount(h(App, null), container);
    app.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
    expect(() => app.unmount()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('반환된 인스턴스의 update()를 직접 부를 수 있다', () => {
    const external = { label: 'a' };
    const container = createContainer();
    const app = mount(h(() => h('p', null, external.label), null), container);
    external.label = 'b';
    app.update();
    expect(container.innerHTML).toBe('<p>b</p>');
  });

  it('요소 VNode를 mount하면 여전히 unmount를 가진 객체를 반환한다', () => {
    const container = createContainer();
    const app = mount(h('ul', null, h('li', null, 'a')), container);
    expect(typeof app.unmount).toBe('function');
    app.unmount();
    expect(container.childNodes).toHaveLength(0);
  });
});
