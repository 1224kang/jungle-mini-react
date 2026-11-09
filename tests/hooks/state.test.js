import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, domToVdom, mount, useState } from '../../src/lib/index.js';
import { createContainer, cleanupContainers, flushMicrotasks, observeMutations, click } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

describe('useState - 상태 변경과 유지 (FR-003, FR-004)', () => {
  it('setState(값)으로 바꾸면 마이크로태스크 후 화면이 새 상태를 반영한다', async () => {
    let setText;
    const App = () => {
      const [text, set] = useState('처음');
      setText = set;
      return h('p', null, text);
    };
    const container = createContainer();
    mount(h(App, null), container);
    setText('다음');
    await flushMicrotasks();
    expect(container.innerHTML).toBe('<p>다음</p>');
  });

  it('다시 그려져도 루트의 다른 상태는 유지된다', async () => {
    let setA;
    const App = () => {
      const [a, set] = useState(1);
      const [b] = useState('유지');
      setA = set;
      return h('p', null, `${a}-${b}`);
    };
    const container = createContainer();
    mount(h(App, null), container);
    setA(2);
    await flushMicrotasks();
    expect(container.textContent).toBe('2-유지');
    setA((x) => x + 1);
    await flushMicrotasks();
    expect(container.textContent).toBe('3-유지');
  });

  it('지연 초기값 함수는 갱신 렌더에서 다시 호출되지 않는다', async () => {
    const init = vi.fn(() => 10);
    let setN;
    const App = () => {
      const [n, set] = useState(init);
      setN = set;
      return h('p', null, n);
    };
    const container = createContainer();
    mount(h(App, null), container);
    setN((x) => x + 1);
    await flushMicrotasks();
    setN((x) => x + 1);
    await flushMicrotasks();
    expect(container.textContent).toBe('12');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('갱신 렌더에서 useState는 초기값 인자를 무시하고 저장된 값을 반환한다', async () => {
    let setN;
    let seen = [];
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      seen.push(n);
      return h('p', null, n);
    };
    mount(h(App, null), createContainer());
    setN(5);
    await flushMicrotasks();
    expect(seen).toEqual([0, 5]);
  });

  it('setState 함수는 렌더마다 같은 참조다', async () => {
    const setters = [];
    const App = () => {
      const [n, set] = useState(0);
      const [, setOther] = useState('x');
      setters.push([set, setOther]);
      return h('p', null, n);
    };
    mount(h(App, null), createContainer());
    setters[0][0](1);
    await flushMicrotasks();
    setters[0][0](2);
    await flushMicrotasks();
    expect(setters).toHaveLength(3);
    for (const [set, setOther] of setters) {
      expect(set).toBe(setters[0][0]);
      expect(setOther).toBe(setters[0][1]);
    }
    expect(setters[0][0]).not.toBe(setters[0][1]);
  });

  it('갱신 결과 DOM은 같은 구조를 직접 쓴 h 결과와 같다', async () => {
    let setItems;
    const Item = ({ label }) => h('li', null, label);
    const App = () => {
      const [items, set] = useState(['a']);
      setItems = set;
      return h('ul', null, items.map((id) => h(Item, { key: id, label: id })));
    };
    const container = createContainer();
    mount(h(App, null), container);
    setItems((prev) => [...prev, 'b', 'c']);
    await flushMicrotasks();
    expect(domToVdom(container.firstChild)).toEqual(
      h('ul', null, h('li', { key: 'a' }, 'a'), h('li', { key: 'b' }, 'b'), h('li', { key: 'c' }, 'c')));
  });

  it('루트 요소 type이 바뀌어도 컨테이너에는 새 루트 하나만 남고, 이후 갱신도 이어진다', async () => {
    let setOn;
    const App = () => {
      const [on, set] = useState(false);
      setOn = set;
      return on ? h('section', null, '켜짐') : h('p', null, '꺼짐');
    };
    const container = createContainer();
    mount(h(App, null), container);
    setOn(true);
    await flushMicrotasks();
    expect(container.innerHTML).toBe('<section>켜짐</section>');
    setOn(false);
    await flushMicrotasks();
    expect(container.innerHTML).toBe('<p>꺼짐</p>');
  });
});

describe('useState - 같은 값이면 다시 그리지 않음 (FR-004, NFR-001)', () => {
  it('같은 값으로 setState하면 루트 호출 0회, DOM 변경 0회', async () => {
    let setN;
    const App = vi.fn(() => {
      const [n, set] = useState(1);
      setN = set;
      return h('p', null, n);
    });
    const container = createContainer();
    mount(h(App, null), container);
    const p = container.firstChild;
    const mutations = observeMutations(container);

    setN(1);
    setN((x) => x);
    await flushMicrotasks();

    expect(App).toHaveBeenCalledTimes(1);
    expect(mutations.records()).toHaveLength(0);
    mutations.disconnect();
    expect(container.firstChild).toBe(p);
  });

  it('같은지 판단은 Object.is로 한다 (NaN → NaN은 같은 값, 같은 객체 참조도 같은 값)', async () => {
    const obj = { a: 1 };
    let setNum;
    let setObj;
    const App = vi.fn(() => {
      const [num, s1] = useState(NaN);
      const [o, s2] = useState(obj);
      setNum = s1;
      setObj = s2;
      return h('p', null, String(num), o.a);
    });
    mount(h(App, null), createContainer());
    setNum(NaN);
    setObj(obj);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(1);
  });

  it('내용이 같아도 새 객체면 다른 값으로 보고 다시 그린다', async () => {
    let setObj;
    const App = vi.fn(() => {
      const [o, set] = useState({ a: 1 });
      setObj = set;
      return h('p', null, o.a);
    });
    mount(h(App, null), createContainer());
    setObj({ a: 1 });
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
  });
});

describe('Lifting State Up - 자식은 props로 받은 변경 함수를 호출 (US-003, FR-008)', () => {
  it('자식이 props로 받은 setState를 이벤트에서 호출하면 루트 상태가 바뀌고 화면이 갱신된다', async () => {
    const Display = ({ count }) => h('span', { class: 'count' }, count);
    const Controls = ({ onChange }) => h('button', { onclick: () => onChange((c) => c + 1) }, '+1');
    const App = () => {
      const [count, setCount] = useState(0);
      return h('div', null, h(Display, { count }), h(Controls, { onChange: setCount }));
    };
    const container = createContainer();
    mount(h(App, null), container);
    const button = container.querySelector('button');

    click(button);
    await flushMicrotasks();
    expect(container.querySelector('.count').textContent).toBe('1');

    click(container.querySelector('button'));
    await flushMicrotasks();
    expect(container.querySelector('.count').textContent).toBe('2');
    expect(container.querySelector('button')).toBe(button);
  });

  it('갱신마다 루트부터 다시 호출하고, 각 자식은 한 갱신에 1회씩 호출된다 (FR-006, FR-017)', async () => {
    const Display = vi.fn(({ count }) => h('span', null, count));
    const Static = vi.fn(() => h('em', null, '고정'));
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', null, h(Display, { count }), h(Static, null));
    });
    mount(h(App, null), createContainer());
    setCount(1);
    await flushMicrotasks();
    expect(App).toHaveBeenCalledTimes(2);
    expect(Display).toHaveBeenCalledTimes(2);
    expect(Static).toHaveBeenCalledTimes(2);
  });

  it('자식은 렌더 사이에 아무것도 기억하지 않는다: 같은 props면 같은 화면', async () => {
    const Label = ({ text }) => h('b', null, text);
    let setOther;
    const App = () => {
      const [other, set] = useState(0);
      setOther = set;
      return h('div', null, h(Label, { text: '같음' }), h('i', null, other));
    };
    const container = createContainer();
    mount(h(App, null), container);
    const before = container.querySelector('b');
    setOther(1);
    await flushMicrotasks();
    expect(container.querySelector('b')).toBe(before);
    expect(container.querySelector('b').outerHTML).toBe('<b>같음</b>');
  });
});

describe('DOM 보존 (FR-007, 001 승계)', () => {
  it('갱신 후 바뀌지 않은 요소는 같은 DOM 객체이고 input 값과 포커스가 유지된다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', null,
        h('input', { id: 'name' }),
        h('p', { class: 'count' }, count),
        h('footer', null, '고정'));
    };
    const container = createContainer();
    mount(h(App, null), container);
    const root = container.firstChild;
    const input = container.querySelector('#name');
    const p = container.querySelector('.count');
    const footer = container.querySelector('footer');
    input.value = '입력 중';
    input.focus();

    setCount(1);
    await flushMicrotasks();

    expect(container.firstChild).toBe(root);
    expect(container.querySelector('#name')).toBe(input);
    expect(container.querySelector('.count')).toBe(p);
    expect(container.querySelector('footer')).toBe(footer);
    expect(p.textContent).toBe('1');
    expect(input.value).toBe('입력 중');
    expect(document.activeElement).toBe(input);
  });

  it('h(Item, { key }) 목록을 재정렬하면 각 항목 DOM이 유지되고 항목 안 input 값도 보존된다', async () => {
    const Item = ({ label }) => h('li', null, h('input', null), h('span', null, label));
    let setOrder;
    const App = () => {
      const [order, set] = useState(['a', 'b', 'c']);
      setOrder = set;
      return h('ul', null, order.map((id) => h(Item, { key: id, label: id })));
    };
    const container = createContainer();
    mount(h(App, null), container);
    const ul = container.firstChild;
    const byLabel = {};
    for (const li of ul.children) {
      const label = li.querySelector('span').textContent;
      byLabel[label] = li;
      li.querySelector('input').value = `값-${label}`;
    }

    setOrder(['c', 'a', 'b']);
    await flushMicrotasks();

    const labels = Array.from(ul.children, (li) => li.querySelector('span').textContent);
    expect(labels).toEqual(['c', 'a', 'b']);
    for (const li of ul.children) {
      const label = li.querySelector('span').textContent;
      expect(li).toBe(byLabel[label]);
      expect(li.querySelector('input').value).toBe(`값-${label}`);
    }
  });

  it('항목을 추가·삭제해도 남은 key 항목의 DOM은 유지된다', async () => {
    const Item = ({ label }) => h('li', null, label);
    let setOrder;
    const App = () => {
      const [order, set] = useState(['a', 'b', 'c']);
      setOrder = set;
      return h('ul', null, order.map((id) => h(Item, { key: id, label: id })));
    };
    const container = createContainer();
    mount(h(App, null), container);
    const ul = container.firstChild;
    const [a, , c] = ul.children;

    setOrder(['c', 'd', 'a']);
    await flushMicrotasks();

    expect(Array.from(ul.children, (li) => li.textContent)).toEqual(['c', 'd', 'a']);
    expect(ul.children[0]).toBe(c);
    expect(ul.children[2]).toBe(a);
  });
});
