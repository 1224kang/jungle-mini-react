import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, useState, useEffect, useMemo } from '../../src/lib/index.js';
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

// 컨테이너에 기존 내용을 넣어 두고, mount 실패 후 그대로인지 확인할 수 있게 한다.
function containerWithOldContent() {
  const container = createContainer();
  const old = document.createElement('span');
  old.textContent = '이전 화면';
  container.appendChild(old);
  return { container, old };
}

function expectUnchanged(container, old) {
  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(old);
  expect(container.innerHTML).toBe('<span>이전 화면</span>');
}

describe('Hook 규칙 - 사용 위치 (FR-013, D-007)', () => {
  it('E-1 자식 컴포넌트 안에서 Hook을 부르면 mount가 잘못된 입력 에러를 던진다', () => {
    const Child = () => {
      const [v] = useState(0);
      return h('span', null, v);
    };
    const App = () => h('div', null, h(Child, null));
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
  });

  it('E-1 루트에서도 Hook을 쓰고 자식에서도 쓰면 에러 (자식은 props만 쓰는 순수 함수)', () => {
    const Child = () => {
      useState(1);
      return h('span', null);
    };
    const App = () => {
      const [v] = useState(0);
      return h('div', null, v, h(Child, null));
    };
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
  });

  it('E-1 루트가 바로 반환한 컴포넌트(E-8)도 자식이므로 Hook을 쓰면 에러', () => {
    const Inner = () => {
      useState(0);
      return h('p', null);
    };
    const App = () => h(Inner, null);
    expect(() => mount(h(App, null), createContainer())).toThrow(INVALID);
  });

  it('E-1 요소 VNode를 mount했을 때 그 안의 컴포넌트가 Hook을 부르면 에러 (루트 컴포넌트가 없음)', () => {
    const Child = () => {
      useState(0);
      return h('li', null);
    };
    expect(() => mount(h('ul', null, h(Child, null)), createContainer())).toThrow(INVALID);
  });

  it('E-2 렌더 밖(최상위 코드)에서 Hook을 부르면 잘못된 입력 에러', () => {
    expect(() => useState(0)).toThrow(INVALID);
    expect(() => useState(0)).toThrow(TypeError);
  });

  it('E-2 mount가 끝난 뒤 루트 밖에서 부른 Hook도 에러 (컨텍스트는 루트 호출 동안만 열림)', () => {
    const App = () => {
      useState(0);
      return h('p', null);
    };
    mount(h(App, null), createContainer());
    expect(() => useState(0)).toThrow(INVALID);
  });

  it('E-2 이벤트 핸들러 안에서 Hook을 부르면 에러', () => {
    let caught = null;
    const App = () => {
      useState(0);
      const onclick = () => {
        try {
          useState(1);
        } catch (error) {
          caught = error;
        }
      };
      return h('button', { onclick }, '누르기');
    };
    const container = createContainer();
    mount(h(App, null), container);
    click(container.querySelector('button'));
    expect(caught).toBeInstanceOf(TypeError);
    expect(caught.message).toMatch(INVALID);
  });

  it('E-2 setTimeout 콜백 안에서 Hook을 부르면 에러', async () => {
    const App = () => {
      useState(0);
      return h('p', null);
    };
    mount(h(App, null), createContainer());
    const error = await new Promise((resolve) => {
      setTimeout(() => {
        try {
          useState(0);
          resolve(null);
        } catch (e) {
          resolve(e);
        }
      }, 0);
    });
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toMatch(INVALID);
  });
});

describe('Hook 규칙 - E-13 첫 렌더 에러', () => {
  it('루트 컴포넌트가 던진 에러는 mount가 동기로 던지고 컨테이너는 그대로다', () => {
    const boom = new Error('루트 에러');
    const App = () => {
      useState(0);
      throw boom;
    };
    const { container, old } = containerWithOldContent();
    expect(() => mount(h(App, null), container)).toThrow(boom);
    expectUnchanged(container, old);
  });

  it('자식 컴포넌트의 Hook 에러(E-1)도 컨테이너를 바꾸지 않는다', () => {
    const Child = () => {
      useState(0);
      return h('span', null);
    };
    const App = () => h('div', null, h(Child, null));
    const { container, old } = containerWithOldContent();
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expectUnchanged(container, old);
  });

  it('자식 컴포넌트의 잘못된 반환값(E-7)도 mount가 던지고 컨테이너는 그대로다', () => {
    const Bad = () => null;
    const App = () => {
      useState(0);
      return h('div', null, h(Bad, null));
    };
    const { container, old } = containerWithOldContent();
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expectUnchanged(container, old);
  });

  it('루트 컴포넌트의 잘못된 반환값(E-7)도 mount가 던지고 컨테이너는 그대로다', () => {
    const App = () => {
      useState(0);
      return '문자열';
    };
    const { container, old } = containerWithOldContent();
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expectUnchanged(container, old);
  });

  it('루트 렌더 중 에러가 나도 Hook 컨텍스트는 닫힌다 (이후 렌더 밖 Hook은 여전히 에러)', () => {
    const App = () => {
      useState(0);
      throw new Error('중간 실패');
    };
    expect(() => mount(h(App, null), createContainer())).toThrow('중간 실패');
    expect(() => useState(0)).toThrow(INVALID);
  });

  it('첫 렌더가 실패해도 다른 컨테이너에 새 앱을 정상적으로 mount할 수 있다', () => {
    const Bad = () => {
      useState(0);
      throw new Error('실패');
    };
    expect(() => mount(h(Bad, null), createContainer())).toThrow('실패');
    const App = () => {
      const [v] = useState('정상');
      return h('p', null, v);
    };
    const container = createContainer();
    mount(h(App, null), container);
    expect(container.innerHTML).toBe('<p>정상</p>');
  });
});

describe('Hook 규칙 - E-5 렌더 중 setState', () => {
  it('첫 렌더 중 setState를 부르면 mount가 잘못된 입력 에러를 던지고 컨테이너는 그대로다', () => {
    const App = () => {
      const [v, setV] = useState(0);
      setV(1);
      return h('p', null, v);
    };
    const { container, old } = containerWithOldContent();
    expect(() => mount(h(App, null), container)).toThrow(INVALID);
    expectUnchanged(container, old);
  });

  it('갱신 렌더 중 setState를 부르면 에러가 나고 DOM은 이전 그대로다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      if (count === 1) set(2);
      return h('p', null, count);
    };
    const container = createContainer();
    mount(h(App, null), container);
    const p = container.firstChild;

    const capture = captureMicrotaskErrors();
    setCount(1);
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0].message).toMatch(INVALID);
    expect(container.firstChild).toBe(p);
    expect(container.innerHTML).toBe('<p>0</p>');
  });
});

describe('Hook 규칙 - E-3 렌더마다 Hook 개수가 달라짐', () => {
  it.each([
    ['늘어나면', 0, 1],
    ['줄어들면', 1, 0],
  ])('두 번째 렌더에서 Hook 개수가 %s 에러가 나고 DOM은 이전 그대로다', async (_name, first, second) => {
    let setExtra;
    const App = () => {
      const [extra, set] = useState(first);
      setExtra = set;
      if (extra === 1) useState('추가');
      return h('p', { class: 'v' }, extra);
    };
    const container = createContainer();
    mount(h(App, null), container);
    const p = container.firstChild;
    expect(p.textContent).toBe(String(first));

    const capture = captureMicrotaskErrors();
    setExtra(second);
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0]).toBeInstanceOf(TypeError);
    expect(capture.errors[0].message).toMatch(INVALID);
    expect(container.firstChild).toBe(p);
    expect(container.innerHTML).toBe(`<p class="v">${first}</p>`);
  });

  it('Hook 개수 에러가 난 뒤에도 렌더 밖 Hook 호출은 여전히 에러 (컨텍스트가 닫힘)', async () => {
    let setExtra;
    const App = () => {
      const [extra, set] = useState(0);
      setExtra = set;
      if (extra === 1) useState('추가');
      return h('p', null, extra);
    };
    mount(h(App, null), createContainer());
    const capture = captureMicrotaskErrors();
    setExtra(1);
    await flushMicrotasks();
    capture.restore();
    expect(capture.errors).toHaveLength(1);
    expect(() => useState(0)).toThrow(INVALID);
  });
});

describe('Hook 규칙 - E-4 같은 순서의 Hook 종류가 바뀜', () => {
  it.each([
    ['useState → useMemo', (mode) => (mode === 0 ? useState('x') : useMemo(() => 'x', []))],
    ['useMemo → useEffect', (mode) => (mode === 0 ? useMemo(() => 'x', []) : useEffect(() => {}))],
    ['useEffect → useState', (mode) => (mode === 0 ? useEffect(() => {}) : useState('x'))],
  ])('두 번째 렌더에서 %s로 바뀌면 에러가 나고 DOM은 이전 그대로다', async (_name, conditionalHook) => {
    let setMode;
    const App = () => {
      const [mode, set] = useState(0);
      setMode = set;
      conditionalHook(mode);
      return h('p', { class: 'mode' }, mode);
    };
    const container = createContainer();
    mount(h(App, null), container);
    const p = container.firstChild;
    expect(container.innerHTML).toBe('<p class="mode">0</p>');

    const capture = captureMicrotaskErrors();
    setMode(1);
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0]).toBeInstanceOf(TypeError);
    expect(capture.errors[0].message).toMatch(INVALID);
    expect(container.firstChild).toBe(p);
    expect(container.innerHTML).toBe('<p class="mode">0</p>');
  });
});
