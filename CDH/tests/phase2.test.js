// @vitest-environment jsdom
// Phase 2 단위 테스트: 속성(이벤트 등) · useState · useEffect · useMemo · Hook 규칙 · FunctionComponent · 자식 컴포넌트 · batching
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, createDOM, diff, applyPatches, FunctionComponent, useState, useEffect, useMemo } from '../src/mini-react.js';

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root');
});

const tick = () => Promise.resolve(); // queueMicrotask 로 예약된 batching 갱신이 먼저 실행됩니다
const mountOf = (v) => {
  const m = document.createElement('div');
  m.appendChild(createDOM(v));
  return m;
};
// batch: false → setState 마다 바로 그립니다 (await 없이 확인하기 쉬움)
const mountSync = (fn, props) => new FunctionComponent(fn, { props, batch: false }).mount(root);

describe('2-0 속성: 이벤트, value, boolean, className', () => {
  it('onClick 은 click 이벤트에 연결되고 속성으로는 남지 않는다', () => {
    const fn = vi.fn();
    const m = mountOf(h('button', { onClick: fn }, '누르기'));
    m.firstChild.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(m.firstChild.hasAttribute('onclick')).toBe(false);
  });
  it('핸들러를 바꾸는 패치 후에는 최신 함수만 불린다', () => {
    const a = vi.fn();
    const b = vi.fn();
    const oldV = h('button', { onClick: a });
    const m = mountOf(oldV);
    applyPatches(m, diff(oldV, h('button', { onClick: b })));
    m.firstChild.click();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it('핸들러를 지우면 더 이상 불리지 않는다', () => {
    const fn = vi.fn();
    const oldV = h('button', { onClick: fn });
    const m = mountOf(oldV);
    applyPatches(m, diff(oldV, h('button')));
    m.firstChild.click();
    expect(fn).not.toHaveBeenCalled();
  });
  it('문자열 핸들러(onclick="...")는 무시한다 (코드 실행 방지)', () => {
    const m = mountOf(h('button', { onclick: 'window.__hacked = 1' }));
    m.firstChild.click();
    expect(window.__hacked).toBeUndefined();
  });
  it('value / checked 는 DOM 프로퍼티로 들어가고, 패치로도 바뀐다', () => {
    const oldV = h('div', null, h('input', { value: 'a' }), h('input', { type: 'checkbox', checked: true }));
    const m = mountOf(oldV);
    const [text, check] = m.querySelectorAll('input');
    expect([text.value, check.checked]).toEqual(['a', true]);
    text.value = 'a사용자가침'; // 사용자가 친 뒤에도 패치가 덮어쓴다
    applyPatches(m, diff(oldV, h('div', null, h('input', { value: 'b' }), h('input', { type: 'checkbox', checked: false }))));
    expect([text.value, check.checked]).toEqual(['b', false]);
  });
  it('숫자 value 는 글자로, <select value> 는 option 이 만들어진 뒤에 선택된다', () => {
    expect(mountOf(h('input', { value: 3 })).firstChild.value).toBe('3');
    const sel = mountOf(h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
    expect(sel.firstChild.value).toBe('b');
  });
  it('disabled true → 속성 있음, false → 없음 ("false" 글자가 남지 않는다)', () => {
    const oldV = h('button', { disabled: true });
    const m = mountOf(oldV);
    expect(m.firstChild.hasAttribute('disabled')).toBe(true);
    applyPatches(m, diff(oldV, h('button', { disabled: false })));
    expect(m.firstChild.hasAttribute('disabled')).toBe(false);
  });
  it('null / undefined 속성은 만들지 않고, className 은 class 가 된다', () => {
    const m = mountOf(h('div', { title: null, id: undefined, className: 'a b' }));
    expect(m.firstChild.attributes.length).toBe(1);
    expect(m.firstChild.getAttribute('class')).toBe('a b');
  });
});

describe('2-3 useState', () => {
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
  it('함수는 매번 새로 실행되지만 상태는 hooks 배열에 남는다', () => {
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
  });
  it('useState 여러 개는 호출 순서(칸 번호)로 구분된다', () => {
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
  it('같은 값(Object.is)이면 다시 그리지 않는다 (NaN 포함)', () => {
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
  it('setter 는 렌더가 바뀌어도 같은 함수다', () => {
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
  it('객체 상태는 새 객체로 바꿔야 갱신된다 (같은 객체를 고치기만 하면 무시)', () => {
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
  it('렌더 중에 setState 를 부르면 오류 (무한 루프 방지)', () => {
    expect(() =>
      mountSync(() => {
        const [n, setN] = useState(0);
        setN(n + 1);
        return h('p');
      })
    ).toThrow(/렌더 중/);
  });
});

describe('2-3 useEffect', () => {
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
  it('deps 없음 = 매 렌더, [] = 처음 한 번, [a] = a 가 바뀔 때만', () => {
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
    const counts = () => [always, once, onA].map((f) => f.mock.calls.length);
    expect(counts()).toEqual([1, 1, 1]);
    setB(1);
    expect(counts()).toEqual([2, 1, 1]);
    setA(1);
    expect(counts()).toEqual([3, 1, 2]);
  });
  it('cleanup 은 다음 effect 실행 전, 그리고 unmount 때 불린다', () => {
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
  it('deps 가 안 바뀌면 cleanup 도 불리지 않는다', () => {
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
  it('함수가 아닌 반환값(Promise 등)은 cleanup 으로 취급하지 않는다', () => {
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
  it('NaN deps 는 Object.is 로 같은 값 취급', () => {
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

describe('2-3 useMemo', () => {
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
  it('deps 를 생략하면 매 렌더 계산, [] 이면 한 번만', () => {
    let set;
    const every = vi.fn(() => 1);
    const once = vi.fn(() => 1);
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      useMemo(every);
      useMemo(once, []);
      return h('p', null, n);
    });
    set(1);
    set(2);
    expect([every.mock.calls.length, once.mock.calls.length]).toEqual([3, 1]);
  });
  it('deps 를 빠뜨리면 옛 값이 남는다 (stale)', () => {
    let set;
    mountSync(() => {
      const [n, setN] = useState(1);
      set = setN;
      return h('p', null, useMemo(() => n * 2, [])); // n 을 빠뜨림
    });
    set(5);
    expect(root.textContent).toBe('2');
  });
});

describe('2-3 Hook 규칙 (과제 제약)', () => {
  it('렌더 밖에서 Hook 을 부르면 오류', () => {
    expect(() => useState(0)).toThrow(/렌더하는 동안에만/);
    expect(() => useEffect(() => {})).toThrow(/렌더하는 동안에만/);
    expect(() => useMemo(() => 1, [])).toThrow(/렌더하는 동안에만/);
  });
  it('자식 컴포넌트에서 Hook 을 부르면 오류 (상태는 루트에만)', () => {
    const Child = () => {
      useState(0);
      return h('span');
    };
    expect(() => mountSync(() => h('div', null, h(Child)))).toThrow(/루트 컴포넌트에서만/);
  });
  it('effect 안에서 Hook 을 부르면 오류', () => {
    expect(() =>
      mountSync(() => {
        useEffect(() => {
          useState(0);
        }, []);
        return h('p');
      })
    ).toThrow(/렌더하는 동안에만/);
  });
  it('조건부 Hook 은 칸이 밀린다 (왜 Hook 을 조건문에 쓰면 안 되는지)', () => {
    let setOn;
    let conditional;
    let n;
    mountSync(() => {
      const [on, set] = useState(false);
      setOn = set;
      if (on) [conditional] = useState('조건부'); // ← 일부러 규칙 위반
      [n] = useState(100);
      return h('p', null, String(on));
    });
    expect(n).toBe(100);
    setOn(true);
    expect(conditional).toBe(100); // '조건부' 가 아니라, 원래 n 이 쓰던 1번 칸의 값(100)이 나온다
  });
});

describe('2-2 FunctionComponent', () => {
  it('hooks 배열, mount(), update() 를 가진다', () => {
    const c = new FunctionComponent(() => h('p'));
    expect(Array.isArray(c.hooks)).toBe(true);
    expect(typeof c.mount).toBe('function');
    expect(typeof c.update).toBe('function');
  });
  it('mount 는 container 의 옛 내용을 대체하고, props 를 루트 함수에 전달한다', () => {
    root.innerHTML = '<i>옛것</i>';
    new FunctionComponent(({ name }) => h('p', { id: 'a' }, `안녕 ${name}`), { props: { name: '미니' } }).mount(root);
    expect(root.innerHTML).toBe('<p id="a">안녕 미니</p>');
  });
  it('mount 하기 전에 update 하면 오류 (그릴 container 가 없음)', () => {
    expect(() => new FunctionComponent(() => h('p')).update()).toThrow();
  });
});

describe('2-2 Phase 1 연결: 바뀐 부분만 DOM 에 반영', () => {
  function counterApp(options = {}) {
    const api = {};
    api.c = new FunctionComponent(
      () => {
        const [n, setN] = useState(0);
        const [label, setLabel] = useState('카운터');
        api.setN = setN;
        api.setLabel = setLabel;
        return h('section', { className: 'box' }, h('h1', null, label), h('p', null, `n=${n}`), h('button', { onClick: () => setN((x) => x + 1) }, '+'));
      },
      { batch: false, ...options }
    );
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
  it('onCommit 은 mount 와 update 마다 불리고, 패치와 건드린 노드를 알려 준다', () => {
    const onCommit = vi.fn();
    const { setN } = counterApp({ onCommit });
    setN(1);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls[0][0].isMount).toBe(true);
    const second = onCommit.mock.calls[1][0];
    expect(second.isMount).toBe(false);
    expect(second.patches.map((p) => p.op)).toContain('TEXT');
    expect(second.touched.map((n) => n.textContent)).toEqual(['n=1']); // <p> 의 글자만 건드림
  });
  it('클릭 → setState → 부분 갱신', () => {
    counterApp();
    root.querySelector('button').click();
    root.querySelector('button').click();
    expect(root.querySelector('p').textContent).toBe('n=2');
  });
  it('핸들러가 최신 상태를 본다 (오래된 클로저 문제 없음)', () => {
    const seen = [];
    mountSync(() => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => (seen.push(n), setN(n + 1)) }, n);
    });
    for (let i = 0; i < 3; i++) root.firstChild.click();
    expect(seen).toEqual([0, 1, 2]);
  });
  it('루트 태그가 바뀌면 통째로 교체된다', () => {
    let set;
    mountSync(() => {
      const [on, setOn] = useState(false);
      set = setOn;
      return on ? h('section', null, 'B') : h('div', null, 'A');
    });
    set(true);
    expect(root.innerHTML).toBe('<section>B</section>');
  });
  it('루트가 글자여도 동작한다', () => {
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      return `n${n}`;
    });
    set(1);
    expect(root.textContent).toBe('n1');
  });
  it('key 리스트: 순서 변경 / 앞쪽 삽입 / 전체 삭제에서 노드를 재사용한다', () => {
    let set;
    mountSync(() => {
      const [items, setItems] = useState(['a', 'b', 'c']);
      set = setItems;
      return h('ul', null, items.map((t) => h('li', { key: t }, t)));
    });
    const [la, lb, lc] = root.querySelectorAll('li');
    set(['c', 'a', 'b']);
    expect([...root.querySelectorAll('li')]).toEqual([lc, la, lb]);
    set(['x', 'c', 'b']);
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['x', 'c', 'b']);
    expect(root.querySelectorAll('li')[1]).toBe(lc);
    set([]);
    expect(root.querySelectorAll('li').length).toBe(0);
  });
  it('입력창: 글자를 쳐도 같은 <input> 노드가 유지되고 상태와 화면이 같다', () => {
    mountSync(() => {
      const [text, setText] = useState('');
      return h('div', null, h('input', { value: text, onInput: (e) => setText(e.target.value) }), h('p', null, `길이 ${text.length}`));
    });
    const input = root.querySelector('input');
    input.value = '안녕하세요';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('안녕하세요');
    expect(root.querySelector('p').textContent).toBe('길이 5');
  });
});

describe('2-1 자식 컴포넌트 (상태 없이 props 만)', () => {
  const Item = ({ text, done }) => h('li', { className: done ? 'done' : '' }, text);
  const List = ({ items }) => h('ul', null, items.map((i) => h(Item, { key: i.id, ...i })));

  it('props 와 children 이 전달된다', () => {
    const Card = ({ title, children }) => h('div', { className: 'card' }, h('h2', null, title), children);
    mountSync(() => h(Card, { title: '제목' }, h('p', null, '내용'), '끝'));
    expect(root.innerHTML).toBe('<div class="card"><h2>제목</h2><p>내용</p>끝</div>');
  });
  it('컴포넌트에 준 key 가 결과 요소로 옮겨져 순서 변경을 재사용으로 처리한다', () => {
    let set;
    mountSync(() => {
      const [items, setItems] = useState([{ id: 1, text: 'a' }, { id: 2, text: 'b' }]);
      set = setItems;
      return h(List, { items });
    });
    const [first, second] = root.querySelectorAll('li');
    set([{ id: 2, text: 'b' }, { id: 1, text: 'a' }]);
    const after = root.querySelectorAll('li');
    expect(after[0]).toBe(second);
    expect(after[1]).toBe(first);
  });
  it('null 을 돌려주는 자식은 아무것도 그리지 않는다', () => {
    const Nothing = () => null;
    mountSync(() => h('p', null, h(Nothing), '뒤'));
    expect(root.innerHTML).toBe('<p>뒤</p>');
  });
  it('조건부 자식이 나타났다 사라져도 위치가 맞다', () => {
    let set;
    mountSync(() => {
      const [on, setOn] = useState(false);
      set = setOn;
      return h('div', null, h('i', null, 'x'), on && h('b', null, 'y'), h('u', null, 'z'));
    });
    set(true);
    expect(root.innerHTML).toBe('<div><i>x</i><b>y</b><u>z</u></div>');
    set(false);
    expect(root.innerHTML).toBe('<div><i>x</i><u>z</u></div>');
  });
  it('숫자 0 도 그려진다', () => {
    mountSync(() => h('p', null, 0, ' / ', 7));
    expect(root.textContent).toBe('0 / 7');
  });
  it('props 객체를 바꾸지 않는다 (순수)', () => {
    const props = { items: [{ id: 1, text: 'a' }] };
    const before = JSON.stringify(props);
    mountSync(() => h(List, props));
    expect(JSON.stringify(props)).toBe(before);
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
  it('batch: false 면 setState 마다 바로 그린다', () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    mountSync(render);
    set(1);
    set(2);
    expect(render).toHaveBeenCalledTimes(3);
  });
  it('이벤트 핸들러 안의 setState 여러 번도 렌더 1번', async () => {
    const render = vi.fn();
    new FunctionComponent(() => {
      const [n, setN] = useState(0);
      const [m, setM] = useState(0);
      render();
      return h('button', { onClick: () => (setN(n + 1), setM(m + 1)) }, `${n},${m}`);
    }).mount(root);
    root.firstChild.click();
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('1,1');
  });
  it('unmount 직전에 예약된 갱신은 실행되지 않는다', async () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    const c = new FunctionComponent(render).mount(root);
    set(1);
    c.unmount();
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe('unmount / 타이머 / 오류', () => {
  it('unmount 하면 DOM 이 비워지고 이후 setState 는 무시된다 (두 번 불러도 안전)', () => {
    let set;
    const render = vi.fn(() => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    });
    const c = mountSync(render);
    c.unmount();
    expect(root.innerHTML).toBe('');
    expect(() => set(1)).not.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
    expect(() => c.unmount()).not.toThrow();
  });
  it('타이머 effect: cleanup 으로 interval 이 정리된다', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const c = mountSync(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        const id = setInterval(() => (ticks++, setN((x) => x + 1)), 1000);
        return () => clearInterval(id);
      }, []);
      return h('p', null, n);
    });
    vi.advanceTimersByTime(3000);
    expect(root.textContent).toBe('3');
    c.unmount();
    vi.advanceTimersByTime(3000);
    expect(ticks).toBe(3);
    vi.useRealTimers();
  });
  it('렌더 함수가 던져도 다음 갱신은 정상 동작한다', () => {
    let set;
    mountSync(() => {
      const [n, setN] = useState(0);
      set = setN;
      if (n === 1) throw new Error('렌더 오류');
      return h('p', null, n);
    });
    expect(() => set(1)).toThrow('렌더 오류');
    set(2);
    expect(root.textContent).toBe('2');
  });
  it('XSS: 글자는 태그로 해석되지 않는다', () => {
    mountSync(() => h('p', null, '<img src=x onerror=alert(1)>'));
    expect(root.querySelector('img')).toBeNull();
  });
});
