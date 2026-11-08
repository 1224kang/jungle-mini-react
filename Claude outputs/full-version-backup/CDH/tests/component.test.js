// @vitest-environment jsdom
// FunctionComponent: mount / update / unmount, 자식 컴포넌트, Phase 1 diff·patch 연결, batching
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, FunctionComponent, useState, useEffect } from '../src/lib/index.js';
import { expand, resolveTree } from '../src/lib/component/resolve.js';

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root');
});

const tick = () => new Promise((r) => queueMicrotask(r));

describe('FunctionComponent 기본', () => {
  it('hooks 배열, mount(), update() 를 가진다', () => {
    const c = new FunctionComponent(() => h('p'));
    expect(Array.isArray(c.hooks)).toBe(true);
    expect(typeof c.mount).toBe('function');
    expect(typeof c.update).toBe('function');
  });

  it('mount 는 container 에 DOM 을 그리고 container 의 옛 내용을 대체한다', () => {
    root.innerHTML = '<i>옛것</i>';
    new FunctionComponent(() => h('p', { id: 'a' }, '안녕')).mount(root);
    expect(root.innerHTML).toBe('<p id="a">안녕</p>');
  });

  it('함수가 아니면 TypeError, 두 번 mount 하면 오류, mount 전 update 는 오류', () => {
    expect(() => new FunctionComponent(null)).toThrow(TypeError);
    const c = new FunctionComponent(() => h('p'));
    expect(() => c.update()).toThrow(/mount/);
    c.mount(root);
    expect(() => c.mount(root)).toThrow(/이미/);
    expect(() => new FunctionComponent(() => h('p')).mount(null)).toThrow(TypeError);
  });

  it('props 를 루트 함수에 전달하고 update(newProps) 로 바꿀 수 있다', () => {
    const c = new FunctionComponent(({ name }) => h('p', null, `hi ${name}`), { props: { name: 'a' } });
    c.mount(root);
    expect(root.textContent).toBe('hi a');
    c.update({ name: 'b' });
    expect(root.textContent).toBe('hi b');
  });
});

describe('Phase 1 연결: 바뀐 부분만 DOM 에 반영', () => {
  function counterApp() {
    const api = {};
    api.c = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      const [label, setLabel] = useState('카운터');
      api.setN = setN;
      api.setLabel = setLabel;
      return h(
        'section',
        { className: 'box' },
        h('h1', null, label),
        h('p', null, `n=${n}`),
        h('button', { onClick: () => setN((x) => x + 1) }, '+')
      );
    }, { batch: false });
    api.c.mount(root);
    return api;
  }

  it('상태가 바뀌어도 기존 DOM 노드를 재사용한다 (전체를 다시 그리지 않음)', () => {
    const { setN } = counterApp();
    const section = root.firstChild;
    const h1 = section.querySelector('h1');
    const p = section.querySelector('p');
    setN(1);
    expect(root.firstChild).toBe(section);
    expect(section.querySelector('h1')).toBe(h1);
    expect(section.querySelector('p')).toBe(p);
    expect(p.textContent).toBe('n=1');
  });

  it('lastCommit 에는 실제로 바뀐 노드만 들어 있다', () => {
    const { c, setN } = counterApp();
    setN(1);
    const ops = c.lastCommit.patches.map((p) => p.op);
    expect(ops).toContain('TEXT');
    expect(c.lastCommit.touched.size).toBe(1); // <p> 의 글자만
    expect([...c.lastCommit.touched][0].textContent).toBe('n=1');
  });

  it('onCommit 콜백이 mount 와 update 마다 불린다', () => {
    const onCommit = vi.fn();
    let set;
    new FunctionComponent(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    }, { batch: false, onCommit }).mount(root);
    set(1);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls[0][0].isMount).toBe(true);
    expect(onCommit.mock.calls[1][0].isMount).toBe(false);
    expect(onCommit.mock.calls[1][0].renderCount).toBe(2);
  });

  it('클릭 → setState → 부분 갱신', () => {
    counterApp();
    root.querySelector('button').click();
    root.querySelector('button').click();
    expect(root.querySelector('p').textContent).toBe('n=2');
  });

  it('핸들러가 최신 상태를 본다 (오래된 클로저 문제 없음)', () => {
    let seen = [];
    new FunctionComponent(() => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => { seen.push(n); setN(n + 1); } }, n);
    }, { batch: false }).mount(root);
    root.firstChild.click();
    root.firstChild.click();
    root.firstChild.click();
    expect(seen).toEqual([0, 1, 2]);
  });

  it('루트 태그가 바뀌면 통째로 교체된다', () => {
    let set;
    new FunctionComponent(() => {
      const [on, setOn] = useState(false);
      set = setOn;
      return on ? h('section', null, 'B') : h('div', null, 'A');
    }, { batch: false }).mount(root);
    set(true);
    expect(root.innerHTML).toBe('<section>B</section>');
  });

  it('루트가 글자(string)여도 동작한다', () => {
    let set;
    new FunctionComponent(() => {
      const [n, setN] = useState(0);
      set = setN;
      return `n${n}`;
    }, { batch: false }).mount(root);
    expect(root.textContent).toBe('n0');
    set(1);
    expect(root.textContent).toBe('n1');
  });

  it('key 가 있는 리스트: 순서를 바꿔도 노드를 재사용하고, 앞쪽 삽입/삭제가 맞다', () => {
    let set;
    new FunctionComponent(() => {
      const [items, setItems] = useState(['a', 'b', 'c']);
      set = setItems;
      return h('ul', null, items.map((t) => h('li', { key: t }, t)));
    }, { batch: false }).mount(root);
    const [la, lb, lc] = root.querySelectorAll('li');
    set(['c', 'a', 'b']);
    const after = [...root.querySelectorAll('li')];
    expect(after.map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
    expect(after).toEqual([lc, la, lb]);
    set(['x', 'c', 'b']);
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['x', 'c', 'b']);
    expect(root.querySelectorAll('li')[1]).toBe(lc);
    set([]);
    expect(root.querySelectorAll('li').length).toBe(0);
  });

  it('입력창: 글자를 쳐도 같은 <input> 노드가 유지되고(포커스 유지) 상태와 화면이 같다', () => {
    new FunctionComponent(() => {
      const [text, setText] = useState('');
      return h('div', null,
        h('input', { value: text, onInput: (e) => setText(e.target.value) }),
        h('p', null, `길이 ${text.length}`));
    }, { batch: false }).mount(root);
    const input = root.querySelector('input');
    input.value = '안녕하세요';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('안녕하세요');
    expect(root.querySelector('p').textContent).toBe('길이 5');
  });
});

describe('자식 컴포넌트 (Stateless, props 만)', () => {
  const Item = ({ text, done }) => h('li', { className: done ? 'done' : '' }, text);
  const List = ({ items }) => h('ul', null, items.map((i) => h(Item, { key: i.id, ...i })));

  it('props 와 children 이 전달된다', () => {
    const Card = ({ title, children }) => h('div', { className: 'card' }, h('h2', null, title), children);
    new FunctionComponent(() => h(Card, { title: '제목' }, h('p', null, '내용'), '끝')).mount(root);
    expect(root.innerHTML).toBe('<div class="card"><h2>제목</h2><p>내용</p>끝</div>');
  });

  it('리스트 항목 컴포넌트의 key 가 결과 요소로 옮겨져 순서 변경을 재사용으로 처리한다', () => {
    let set;
    new FunctionComponent(() => {
      const [items, setItems] = useState([{ id: 1, text: 'a' }, { id: 2, text: 'b' }]);
      set = setItems;
      return h(List, { items });
    }, { batch: false }).mount(root);
    const [first, second] = root.querySelectorAll('li');
    set([{ id: 2, text: 'b' }, { id: 1, text: 'a' }]);
    const after = root.querySelectorAll('li');
    expect(after[0]).toBe(second);
    expect(after[1]).toBe(first);
  });

  it('null / false 를 돌려주는 자식은 DOM 에 남지 않고, 배열(프래그먼트)은 펼쳐진다', () => {
    const Nothing = () => null;
    const Two = () => [h('i', null, 1), h('b', null, 2)];
    new FunctionComponent(() => h('p', null, h(Nothing), false, h(Two))).mount(root);
    expect(root.innerHTML).toBe('<p><i>1</i><b>2</b></p>');
  });

  it('조건부 자식이 나타났다 사라져도 위치가 맞다', () => {
    let set;
    new FunctionComponent(() => {
      const [on, setOn] = useState(false);
      set = setOn;
      return h('div', null, h('i', null, 'x'), on && h('b', null, 'y'), h('u', null, 'z'));
    }, { batch: false }).mount(root);
    set(true);
    expect(root.innerHTML).toBe('<div><i>x</i><b>y</b><u>z</u></div>');
    set(false);
    expect(root.innerHTML).toBe('<div><i>x</i><u>z</u></div>');
  });

  it('숫자 0 은 그려지고, 숫자는 글자로 바뀐다', () => {
    new FunctionComponent(() => h('p', null, 0, ' / ', 7)).mount(root);
    expect(root.textContent).toBe('0 / 7');
  });

  it('루트가 요소를 0개 / 2개 반환하면 오류', () => {
    expect(() => resolveTree(null)).toThrow(/하나의/);
    expect(() => resolveTree([h('a'), h('b')])).toThrow(/하나의/);
  });

  it('렌더할 수 없는 값은 TypeError', () => {
    expect(() => expand({ foo: 1 })).toThrow(TypeError);
  });

  it('입력 VNode 를 바꾸지 않는다 (순수)', () => {
    const Comp = ({ children }) => h('div', { key: 'k' }, children);
    const tree = h('section', null, h(Comp, { key: 'kk' }, h('i')));
    const snapshot = JSON.stringify(tree);
    expand(tree);
    expect(JSON.stringify(tree)).toBe(snapshot);
  });
});

describe('batching (선택 과제)', () => {
  it('같은 틱의 setState 여러 번은 렌더 1번으로 합쳐진다', async () => {
    let setA, setB;
    const render = vi.fn(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      return h('p', null, a + b);
    });
    new FunctionComponent(render).mount(root);
    setA(1);
    setB(2);
    setA((x) => x + 10);
    expect(render).toHaveBeenCalledTimes(1); // 아직 그리기 전
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('13');
  });

  it('flush() 로 바로 반영할 수 있다', () => {
    let set;
    const c = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    }).mount(root);
    set(3);
    c.flush();
    expect(root.textContent).toBe('3');
  });

  it('batch: false 면 setState 마다 바로 그린다', () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    new FunctionComponent(render, { batch: false }).mount(root);
    set(1);
    set(2);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('배치 대기 중에 update() 를 부르면 한 번만 그린다', async () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    const c = new FunctionComponent(render).mount(root);
    set(1);
    c.update();
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('이벤트 핸들러 안에서 setState 를 여러 번 불러도 렌더 1번', async () => {
    const render = vi.fn();
    new FunctionComponent(() => {
      const [n, setN] = useState(0);
      const [m, setM] = useState(0);
      render();
      return h('button', { onClick: () => { setN(n + 1); setM(m + 1); } }, `${n},${m}`);
    }).mount(root);
    root.firstChild.click();
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('1,1');
  });
});

describe('unmount / 비동기 / 방어', () => {
  it('unmount 하면 DOM 이 비워지고 이후 setState 는 무시된다', () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    const c = new FunctionComponent(render, { batch: false }).mount(root);
    c.unmount();
    expect(root.innerHTML).toBe('');
    expect(() => set(1)).not.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
    c.unmount(); // 두 번 불러도 안전
  });

  it('타이머 effect: cleanup 으로 interval 이 정리된다', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const c = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        const id = setInterval(() => { ticks++; setN((x) => x + 1); }, 1000);
        return () => clearInterval(id);
      }, []);
      return h('p', null, n);
    }, { batch: false }).mount(root);
    vi.advanceTimersByTime(3000);
    expect(root.textContent).toBe('3');
    c.unmount();
    vi.advanceTimersByTime(3000);
    expect(ticks).toBe(3);
    vi.useRealTimers();
  });

  it('렌더 함수가 던지면 update 도 던지지만 컴포넌트는 계속 쓸 수 있다', () => {
    let set;
    const c = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      set = setN;
      if (n === 1) throw new Error('렌더 오류');
      return h('p', null, n);
    }, { batch: false }).mount(root);
    expect(() => set(1)).toThrow('렌더 오류');
    expect(c.phase).toBe('idle');
    set(2);
    expect(root.textContent).toBe('2');
  });

  it('XSS: 글자는 textContent 로 들어가 태그로 해석되지 않는다', () => {
    new FunctionComponent(() => h('p', null, '<img src=x onerror=alert(1)>')).mount(root);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
