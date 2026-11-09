import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, domToVdom, mount, useState } from '../../src/lib/index.js';
import { INVALID, createContainer, cleanupContainers } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

describe('mount - 8.1 첫 렌더', () => {
  it('mount(h(App), container)는 App을 펼친 결과를 컨테이너에 그린다', () => {
    const Title = ({ text }) => h('h1', null, text);
    const Item = ({ label }) => h('li', null, label);
    const App = () =>
      h('div', { id: 'app' },
        h(Title, { text: '목록' }),
        h('ul', null, ['a', 'b'].map((id) => h(Item, { key: id, label: id }))));
    const container = createContainer();
    mount(h(App, null), container);

    expect(container.childNodes).toHaveLength(1);
    expect(domToVdom(container.firstChild)).toEqual(
      h('div', { id: 'app' },
        h('h1', null, '목록'),
        h('ul', null, h('li', { key: 'a' }, 'a'), h('li', { key: 'b' }, 'b'))));
  });

  it('컨테이너의 기존 자식은 새 화면으로 교체된다', () => {
    const container = createContainer();
    container.append(document.createElement('span'), '이전 텍스트', document.createElement('b'));
    const App = () => h('p', null, '새 화면');
    mount(h(App, null), container);
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild.outerHTML).toBe('<p>새 화면</p>');
  });

  it('첫 렌더는 동기로 끝난다 (mount가 반환된 직후 화면이 그려져 있다)', () => {
    const container = createContainer();
    mount(h(() => h('p', null, '즉시'), null), container);
    expect(container.textContent).toBe('즉시');
  });

  it('mount는 unmount 함수를 가진 객체를 반환한다', () => {
    const container = createContainer();
    const app = mount(h(() => h('p', null, 'x'), null), container);
    expect(typeof app.unmount).toBe('function');
  });

  it('루트 컴포넌트는 h에 넘긴 props와 children을 받는다', () => {
    const App = vi.fn(({ title, children }) => h('section', null, h('h2', null, title), children));
    const container = createContainer();
    mount(h(App, { title: '제목' }, h('p', null, '본문')), container);
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.firstChild.outerHTML).toBe('<section><h2>제목</h2><p>본문</p></section>');
  });

  it('첫 렌더에서 루트와 각 자식 컴포넌트는 1회씩 호출된다', () => {
    const Child = vi.fn(() => h('span', null, 'c'));
    const App = vi.fn(() => h('div', null, h(Child, null)));
    mount(h(App, null), createContainer());
    expect(App).toHaveBeenCalledTimes(1);
    expect(Child).toHaveBeenCalledTimes(1);
  });

  it('E-8 루트 컴포넌트가 다른 컴포넌트를 바로 반환해도 그린다', () => {
    const Inner = () => h('p', null, '안쪽');
    const App = () => h(Inner, null);
    const container = createContainer();
    mount(h(App, null), container);
    expect(container.innerHTML).toBe('<p>안쪽</p>');
  });

  it('요소 VNode를 mount하면 Hook 없이 한 번 그리기만 한다', () => {
    const container = createContainer();
    container.append('이전');
    const app = mount(h('ul', null, h('li', null, 'a')), container);
    expect(container.innerHTML).toBe('<ul><li>a</li></ul>');
    expect(typeof app.unmount).toBe('function');
  });

  it('요소 VNode 안의 자식 컴포넌트도 펼쳐서 그린다', () => {
    const Item = ({ label }) => h('li', null, label);
    const container = createContainer();
    mount(h('ul', null, h(Item, { label: 'a' })), container);
    expect(container.innerHTML).toBe('<ul><li>a</li></ul>');
  });
});

describe('mount - 입력 검사', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['일반 객체', {}],
    ['Text 노드', document.createTextNode('x')],
  ])('container가 Element가 아니면(%s) 잘못된 입력 에러', (_name, container) => {
    expect(() => mount(h('p', null), container)).toThrow(INVALID);
  });

  it.each([
    ['null', null],
    ['문자열', 'App'],
    ['함수 그 자체', () => h('p', null)],
    ['일반 객체', { a: 1 }],
  ])('vnode가 VNode가 아니면(%s) 잘못된 입력 에러, 컨테이너는 그대로', (_name, vnode) => {
    const container = createContainer();
    const old = document.createElement('span');
    container.appendChild(old);
    expect(() => mount(vnode, container)).toThrow(INVALID);
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(old);
  });
});

describe('useState - 첫 렌더 초기값 (FR-003)', () => {
  it('useState(0)은 첫 렌더에 [0, setState 함수]를 반환한다', () => {
    let result;
    const App = () => {
      result = useState(0);
      return h('p', null, result[0]);
    };
    const container = createContainer();
    mount(h(App, null), container);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(0);
    expect(typeof result[1]).toBe('function');
    expect(container.textContent).toBe('0');
  });

  it('useState(() => 5)는 지연 초기값 함수를 1회 호출하고 그 결과 5를 반환한다', () => {
    const init = vi.fn(() => 5);
    let value;
    const App = () => {
      [value] = useState(init);
      return h('p', null, value);
    };
    const container = createContainer();
    mount(h(App, null), container);
    expect(value).toBe(5);
    expect(init).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('5');
  });

  it('함수가 아닌 초기값(객체·배열·null)은 그대로 저장한다', () => {
    const obj = { a: 1 };
    const arr = [1, 2];
    let values;
    const App = () => {
      values = [useState(obj)[0], useState(arr)[0], useState(null)[0]];
      return h('p', null, 'x');
    };
    mount(h(App, null), createContainer());
    expect(values[0]).toBe(obj);
    expect(values[1]).toBe(arr);
    expect(values[2]).toBeNull();
  });

  it('루트 컴포넌트는 상태를 여러 개 선언할 수 있다', () => {
    const App = () => {
      const [a] = useState('가');
      const [b] = useState(() => '나');
      const [c] = useState(3);
      return h('p', null, a, b, c);
    };
    const container = createContainer();
    mount(h(App, null), container);
    expect(container.textContent).toBe('가나3');
  });

  it('루트 상태 값을 props로 자식에게 넘겨 그린다 (Lifting State Up)', () => {
    const Display = ({ count }) => h('span', { class: 'count' }, count);
    const App = () => {
      const [count] = useState(7);
      return h('div', null, h(Display, { count }));
    };
    const container = createContainer();
    mount(h(App, null), container);
    expect(container.innerHTML).toBe('<div><span class="count">7</span></div>');
  });
});
