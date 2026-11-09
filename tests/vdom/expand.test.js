import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render, diff, patch, domToVdom } from '../../src/lib/index.js';
import { expand } from '../../src/lib/vdom/expand.js';

const INVALID = /^\[mini-react\] 잘못된 입력: .+/;

afterEach(() => {
  vi.restoreAllMocks();
});

// 객체를 깊게 얼린다. 얼린 입력을 수정하려 하면 (ESM은 strict mode라) TypeError가 난다.
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// 펼친 결과에 함수 type(컴포넌트 VNode)이 남아 있지 않은지 확인한다.
function expectHostTree(vnode) {
  expect(typeof vnode.type).toBe('string');
  if (vnode.type === '#text') return;
  for (const child of vnode.props.children) expectHostTree(child);
}

const Item = ({ label }) => h('li', { class: 'item' }, label);
const List = ({ items }) => h('ul', { class: 'list' }, items.map((id) => h(Item, { key: id, label: id })));
const Card = ({ title, children }) => h('section', null, h('h2', null, title), children);

describe('expand - 6.2 펼치기', () => {
  it('중첩 컴포넌트를 펼친 결과는 같은 구조를 문자열 type h로 직접 쓴 결과와 같다', () => {
    const App = ({ title }) =>
      h('div', { id: 'app' },
        h('h1', null, title),
        h(List, { items: ['a', 'b'] }),
        h(Card, { title: '카드' }, h('p', null, '본문')));

    const expected = h('div', { id: 'app' },
      h('h1', null, '제목'),
      h('ul', { class: 'list' },
        h('li', { key: 'a', class: 'item' }, 'a'),
        h('li', { key: 'b', class: 'item' }, 'b')),
      h('section', null, h('h2', null, '카드'), h('p', null, '본문')));

    const result = expand(h(App, { title: '제목' }));
    expect(result).toEqual(expected);
    expectHostTree(result);
  });

  it('컴포넌트는 h에 넘긴 props와 정규화된 children을 받아 호출된다', () => {
    const fn = () => {};
    const Spy = vi.fn(() => h('div', null));
    expand(h(Spy, { n: 3, onInc: fn, key: 'k' }, 'x', h('b', null)));
    expect(Spy).toHaveBeenCalledTimes(1);
    const [props] = Spy.mock.calls[0];
    expect(props.n).toBe(3);
    expect(props.onInc).toBe(fn);
    expect(props.children).toEqual([{ type: '#text', value: 'x' }, h('b', null)]);
  });

  it('한 번 펼칠 때 각 컴포넌트 VNode는 정확히 1회 호출된다', () => {
    const Leaf = vi.fn(({ label }) => h('li', null, label));
    expand(h('ul', null, h(Leaf, { label: 'a' }), h(Leaf, { label: 'b' })));
    expect(Leaf).toHaveBeenCalledTimes(2);
  });

  it('컴포넌트가 없는 요소 VNode는 같은 구조 그대로 나온다', () => {
    const vnode = h('div', { class: 'a' }, h('p', null, 'x'), 'y');
    expect(expand(vnode)).toEqual(h('div', { class: 'a' }, h('p', null, 'x'), 'y'));
  });

  it('E-8 컴포넌트가 컴포넌트를 반환하면 요소가 나올 때까지 계속 펼친다', () => {
    const Inner = ({ label }) => h('span', null, label);
    const Middle = ({ label }) => h(Inner, { label: `${label}!` });
    const Outer = () => h(Middle, { label: '안녕' });
    expect(expand(h(Outer, null))).toEqual(h('span', null, '안녕!'));
  });

  it('펼친 결과는 render에 그대로 넣을 수 있다 (계약 1장 형식)', () => {
    const vnode = h('div', null, h(List, { items: ['a', 'b'] }));
    const dom = render(expand(vnode));
    const direct = render(h('div', null, h('ul', { class: 'list' },
      h('li', { key: 'a', class: 'item' }, 'a'),
      h('li', { key: 'b', class: 'item' }, 'b'))));
    expect(dom.outerHTML).toBe(direct.outerHTML);
  });

  it('펼친 결과는 diff / patch에 그대로 넣을 수 있다', () => {
    const Label = ({ text }) => h('p', { class: 'label' }, text);
    const oldTree = expand(h('div', null, h(Label, { text: '이전' })));
    const newTree = expand(h('div', null, h(Label, { text: '다음' })));
    const container = document.createElement('div');
    const dom = render(oldTree);
    container.appendChild(dom);
    const p = dom.firstChild;
    const result = patch(dom, diff(oldTree, newTree));
    expect(domToVdom(result)).toEqual(newTree);
    expect(result.firstChild).toBe(p);
  });
});

describe('expand - 6.2 key 전파', () => {
  it('h("ul", null, [h(Item, { key: "a" }), h(Item, { key: "b" })])를 펼치면 li의 key가 "a", "b"', () => {
    const Row = () => h('li', null, '행');
    const result = expand(h('ul', null, [h(Row, { key: 'a' }), h(Row, { key: 'b' })]));
    expect(result.props.children.map((li) => li.key)).toEqual(['a', 'b']);
  });

  it('E-12 컴포넌트 key와 펼친 요소의 key가 둘 다 있으면 컴포넌트 key를 쓴다', () => {
    const Row = () => h('li', { key: 'inner' }, '행');
    expect(expand(h(Row, { key: 'outer' })).key).toBe('outer');
  });

  it('컴포넌트 key가 없으면 펼친 요소의 key를 그대로 둔다', () => {
    const Row = () => h('li', { key: 'inner' }, '행');
    expect(expand(h(Row, null)).key).toBe('inner');
    const Plain = () => h('li', null, '행');
    expect(expand(h(Plain, null)).key).toBeNull();
  });

  it('컴포넌트가 컴포넌트를 반환할 때 가장 바깥 컴포넌트의 key가 최상위 요소 key가 된다', () => {
    const Inner = () => h('li', null, '행');
    const Outer = () => h(Inner, { key: 'middle' });
    expect(expand(h(Outer, { key: 'outer' })).key).toBe('outer');
    expect(expand(h(Outer, null)).key).toBe('middle');
  });

  it('key를 전파해도 컴포넌트가 반환한 VNode는 수정하지 않는다 (새 객체)', () => {
    const shared = deepFreeze(h('li', { key: 'inner' }, '행'));
    const Row = () => shared;
    let result;
    expect(() => { result = expand(h(Row, { key: 'outer' })); }).not.toThrow();
    expect(result.key).toBe('outer');
    expect(shared.key).toBe('inner');
  });

  it('컴포넌트 key 목록을 재정렬해 diff / patch하면 각 항목 DOM을 재사용한다', () => {
    const Row = ({ label }) => h('li', null, label);
    const view = (ids) => h('ul', null, ids.map((id) => h(Row, { key: id, label: id })));
    const oldTree = expand(view(['a', 'b', 'c']));
    const newTree = expand(view(['c', 'a', 'b']));
    const container = document.createElement('div');
    const ul = render(oldTree);
    container.appendChild(ul);
    const before = Object.fromEntries(Array.from(ul.children, (li) => [li.textContent, li]));
    const result = patch(ul, diff(oldTree, newTree));
    expect(Array.from(result.children, (li) => li.textContent)).toEqual(['c', 'a', 'b']);
    for (const li of result.children) expect(li).toBe(before[li.textContent]);
  });
});

describe('expand - E-7 잘못된 반환값', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['문자열', '텍스트'],
    ['숫자', 42],
    ['배열', [h('li', null)]],
    ['일반 객체', { a: 1 }],
    ['텍스트 VNode', { type: '#text', value: 'x' }],
  ])('컴포넌트가 %s를 반환하면 잘못된 입력 에러', (_name, value) => {
    const Bad = () => value;
    expect(() => expand(h(Bad, null))).toThrow(INVALID);
    expect(() => expand(h(Bad, null))).toThrow(TypeError);
  });

  it('깊은 곳의 자식 컴포넌트가 잘못된 값을 반환해도 에러', () => {
    const Bad = () => null;
    expect(() => expand(h('div', null, h('section', null, h(Bad, null))))).toThrow(INVALID);
  });

  it('컴포넌트가 던진 에러는 그대로 전달된다', () => {
    const boom = new Error('컴포넌트 내부 에러');
    const Throws = () => { throw boom; };
    expect(() => expand(h('div', null, h(Throws, null)))).toThrow(boom);
  });
});

describe('expand - 입력 미수정', () => {
  it('입력 VNode 트리(컴포넌트 props·children 포함)를 수정하지 않는다', () => {
    const vnode = deepFreeze(h('div', { id: 'root' },
      h(List, { items: ['a', 'b'] }),
      h(Card, { title: '카드', key: 'c' }, h('p', null, '본문'))));
    let result;
    expect(() => { result = expand(vnode); }).not.toThrow();
    expect(vnode.props.children[0].type).toBe(List);
    expect(vnode.props.children[1].type).toBe(Card);
    expect(result).not.toBe(vnode);
    expect(result.props.children[0].type).toBe('ul');
  });

  it('같은 입력을 두 번 펼쳐도 같은 결과가 나온다 (자식은 같은 props면 같은 화면)', () => {
    const vnode = h('div', null, h(List, { items: ['a', 'b'] }));
    expect(expand(vnode)).toEqual(expand(vnode));
  });
});
