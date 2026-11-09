import { describe, it, expect, vi, afterEach } from 'vitest';
import { h } from '../../src/lib/vdom/h.js';

const text = (value) => ({ type: '#text', value });
const el = (type, props = {}, children = [], key = null) => ({
  type,
  key,
  props: { ...props, children },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('h - 1.1 모양', () => {
  it('1.1 요소 VNode는 { type, key, props: { children } } 모양이다', () => {
    expect(h('div', { class: 'box' })).toEqual(el('div', { class: 'box' }));
  });

  it('1.1 자식이 없으면 children은 []이다', () => {
    expect(h('br', null).props.children).toEqual([]);
  });

  it('1.1 텍스트 자식은 { type: "#text", value } 모양이다 (key, props 없음)', () => {
    const [child] = h('p', null, 'hi').props.children;
    expect(child).toStrictEqual({ type: '#text', value: 'hi' });
  });

  it('2.3 type은 소문자로 바꾼다', () => {
    expect(h('DIV', null).type).toBe('div');
  });

  it('2.3 예약 타입 "#text"는 잘못된 입력으로 거부한다 (회귀)', () => {
    expect(() => h('#text', null, 'hello')).toThrow(/^\[mini-react\] 잘못된 입력: .+/);
  });

  it('2.3 소문자로 바꾼 뒤 검사하므로 "#TEXT"도 거부한다 (회귀)', () => {
    expect(() => h('#TEXT', null, 'hello')).toThrow(/^\[mini-react\] 잘못된 입력: .+/);
  });

  it('2.3 예약 타입 거부 후에도 정상 태그 소문자 변환과 문자열 자식의 텍스트 VNode 생성은 그대로', () => {
    expect(h('SPAN', null, 'hello')).toEqual(el('span', {}, [text('hello')]));
  });

  it('2.3 type이 빈 문자열이거나 문자열이 아니면 에러', () => {
    expect(() => h('', null)).toThrow('[mini-react] 잘못된 입력');
    expect(() => h(1, null)).toThrow('[mini-react] 잘못된 입력');
    expect(() => h(null, null)).toThrow('[mini-react] 잘못된 입력');
  });
});

describe('h - 1.2 props 표', () => {
  it('1.2 이름: HTML 속성 이름을 그대로 둔다 (class, for, data-id, aria-label)', () => {
    const props = { class: 'a', for: 'x', 'data-id': '1', 'aria-label': '닫기' };
    expect(h('label', props).props).toEqual({ ...props, children: [] });
  });

  it('1.2 이름 "__proto__"도 일반 속성으로 보존한다 (JSON.parse로 만든 own property, 회귀)', () => {
    const props = JSON.parse('{"__proto__":"x"}');
    const v = h('div', props);
    expect(Object.hasOwn(v.props, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(v.props, '__proto__').value).toBe('x');
    expect(Object.getPrototypeOf(v.props)).toBe(Object.prototype);
    expect(Object.keys(v.props).sort()).toEqual(['__proto__', 'children']);
    // 입력 props는 수정하지 않는다
    expect(Object.keys(props)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(props, '__proto__').value).toBe('x');
  });

  it('1.2 계산된 프로퍼티 ["__proto__"]도 값 변환 규칙대로 보존한다 (회귀)', () => {
    const v = h('div', { ['__proto__']: 1, class: 'a' });
    expect(Object.getOwnPropertyDescriptor(v.props, '__proto__').value).toBe('1');
    expect(v.props.class).toBe('a');
  });

  it('1.2 값: 항상 문자열 (maxlength: 10 → "10")', () => {
    expect(h('input', { maxlength: 10 }).props.maxlength).toBe('10');
  });

  it('1.2 불리언 속성: true → "", false는 키 자체가 없음', () => {
    const v = h('button', { disabled: true, hidden: false });
    expect(v.props).toEqual({ disabled: '', children: [] });
    expect('hidden' in v.props).toBe(false);
  });

  it('1.2 style: 문자열 그대로', () => {
    expect(h('p', { style: 'color: red; margin: 0' }).props.style).toBe('color: red; margin: 0');
  });

  it('1.2 이벤트 속성: 문자열이면 일반 속성으로 취급', () => {
    expect(h('button', { onclick: 'alert(1)' }).props.onclick).toBe('alert(1)');
  });
});

describe('h - 1.3 key', () => {
  it('1.3 key는 최상위에 두고 props에 넣지 않는다', () => {
    const v = h('li', { key: 'a', class: 'x' });
    expect(v.key).toBe('a');
    expect('key' in v.props).toBe(false);
  });

  it('1.3 key가 없으면 null', () => {
    expect(h('li', null).key).toBeNull();
    expect(h('li', { key: undefined }).key).toBeNull();
    expect(h('li', { key: null }).key).toBeNull();
  });

  it('1.3 data-key도 key로 옮기고 props에서 제거한다 (domToVdom과 같은 결과)', () => {
    const v = h('li', { 'data-key': 'a' });
    expect(v.key).toBe('a');
    expect('data-key' in v.props).toBe(false);
  });

  it('1.3 key와 data-key를 함께 주면 에러', () => {
    expect(() => h('li', { key: 'a', 'data-key': 'b' })).toThrow('[mini-react] 잘못된 입력');
  });

  it('1.3 형제끼리 key가 중복이면 console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h('ul', null, h('li', { key: 'a' }), h('li', { key: 'a' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('a');
  });

  it('1.3 key가 고유하거나 null이면 경고하지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h('ul', null, h('li', { key: 'a' }), h('li', { key: 'b' }), h('li', null), h('li', null));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('h - 2.3 props', () => {
  it('2.3 props가 null 또는 undefined이면 {}로 처리한다', () => {
    expect(h('div', null)).toEqual(el('div'));
    expect(h('div', undefined)).toEqual(el('div'));
  });

  it('2.3 key를 문자열로 바꾼다 (key: 1 → "1")', () => {
    expect(h('li', { key: 1 }).key).toBe('1');
  });

  it('2.3 key가 문자열·숫자가 아니면 에러', () => {
    expect(() => h('li', { key: {} })).toThrow('[mini-react] 잘못된 입력');
    expect(() => h('li', { key: true })).toThrow('[mini-react] 잘못된 입력');
  });

  it('2.3 값 변환: 숫자 → 문자열, true → "", false/null/undefined → 키 제거', () => {
    const v = h('input', { size: 3, required: true, a: false, b: null, c: undefined });
    expect(v.props).toEqual({ size: '3', required: '', children: [] });
  });

  it('2.3 객체(배열 포함) 값은 에러', () => {
    expect(() => h('p', { style: { color: 'red' } })).toThrow('[mini-react] 잘못된 입력');
    expect(() => h('p', { class: ['a'] })).toThrow('[mini-react] 잘못된 입력');
  });

  it('2.3 넘겨받은 props 객체를 수정하지 않는다', () => {
    const props = Object.freeze({ key: 1, class: 'a', disabled: true, children: Object.freeze(['x']) });
    expect(() => h('div', props)).not.toThrow();
    expect(props).toEqual({ key: 1, class: 'a', disabled: true, children: ['x'] });
  });
});

describe('h - 2.3 children 표', () => {
  it('2.3 나머지 인자가 있으면 인자를 쓴다 (props.children 무시)', () => {
    expect(h('p', { children: ['x'] }, 'y').props.children).toEqual([text('y')]);
  });

  it('2.3 나머지 인자가 없으면 props.children을 쓴다', () => {
    expect(h('p', { children: ['x', h('b', null)] }).props.children).toEqual([text('x'), el('b')]);
    expect(h('p', { children: 'x' }).props.children).toEqual([text('x')]);
  });

  it('2.3 문자열 → 텍스트 노드, "" → 버림', () => {
    expect(h('p', null, 'a').props.children).toEqual([text('a')]);
    expect(h('p', null, '').props.children).toEqual([]);
  });

  it('2.3 숫자 → 문자열 텍스트 노드, 0도 남김', () => {
    expect(h('p', null, 0).props.children).toEqual([text('0')]);
    expect(h('p', null, 42).props.children).toEqual([text('42')]);
  });

  it('2.3 null, undefined, true, false → 버림', () => {
    expect(h('p', null, null, undefined, true, false).props.children).toEqual([]);
  });

  it('2.3 배열은 깊이에 상관없이 평탄화', () => {
    const v = h('ul', null, [h('li', null), [[h('li', null)], [[[h('li', null)]]]]]);
    expect(v.props.children).toEqual([el('li'), el('li'), el('li')]);
  });

  it('2.3 VNode 객체는 그대로 사용', () => {
    const child = h('b', { key: 'k' }, 'x');
    expect(h('p', null, child).props.children[0]).toEqual(child);
  });

  it('2.3 그 외 (함수, 일반 객체 등) → 에러', () => {
    expect(() => h('p', null, () => {})).toThrow('[mini-react] 잘못된 입력');
    expect(() => h('p', null, { a: 1 })).toThrow('[mini-react] 잘못된 입력');
    expect(() => h('p', null, Symbol('s'))).toThrow('[mini-react] 잘못된 입력');
  });

  it('2.3 공백 규칙(②③)을 적용하지 않는다: h("p", null, "\\n  ")은 공백 텍스트를 유지', () => {
    expect(h('p', null, '\n  ').props.children).toEqual([text('\n  ')]);
  });

  it('2.3 문자열은 trim 없이 그대로 쓴다', () => {
    expect(h('p', null, '  a  ').props.children).toEqual([text('  a  ')]);
  });

  it('2.3 문서 예시: h("ul", { class: "list", key: 1 }, [h("li", null, "A"), null, false], 0, "a", "b")', () => {
    expect(h('ul', { class: 'list', key: 1 }, [h('li', null, 'A'), null, false], 0, 'a', 'b')).toEqual({
      type: 'ul',
      key: '1',
      props: {
        class: 'list',
        children: [
          { type: 'li', key: null, props: { children: [{ type: '#text', value: 'A' }] } },
          { type: '#text', value: '0ab' },
        ],
      },
    });
  });
});

describe('h - 2.1 공통 규칙', () => {
  it('④ 인접한 텍스트는 하나로 합친다', () => {
    expect(h('p', null, 'a', 'b', 1).props.children).toEqual([text('ab1')]);
  });

  it('④ 텍스트 VNode도 문자열과 합친다 (넘겨받은 VNode는 수정하지 않음)', () => {
    const t = Object.freeze(text('b'));
    expect(h('p', null, 'a', t, 'c').props.children).toEqual([text('abc')]);
    expect(t).toEqual(text('b'));
  });

  it('④ 버려지는 값 사이의 텍스트도 합친다', () => {
    expect(h('p', null, 'a', null, false, '', 'b').props.children).toEqual([text('ab')]);
  });

  it('④ 요소를 사이에 둔 텍스트는 합치지 않는다', () => {
    expect(h('p', null, 'a', h('br', null), 'b').props.children).toEqual([text('a'), el('br'), text('b')]);
  });
});

describe('h - 3장 범위 밖', () => {
  const unsupported = /^\[mini-react\] 지원하지 않음: .+ \(Phase 1 범위 밖\)$/;

  it('3장 컴포넌트 (type이 함수)는 에러가 아니라 컴포넌트 VNode를 만든다 (6장)', () => {
    const Comp = () => h('div', null);
    expect(() => h(Comp, null)).not.toThrow();
    expect(h(Comp, null)).toEqual({ type: Comp, key: null, props: { children: [] } });
  });

  it('3장 on으로 시작하지 않는 함수 prop → 에러', () => {
    expect(() => h('button', { handler: () => {} })).toThrow(unsupported);
  });

  it('6: a function prop named exactly on is unsupported', () => {
    expect(() => h('div', { on: () => {} })).toThrow(unsupported);
  });

  it('3장 on* 함수 prop은 그대로 보존한다', () => {
    const handler = () => {};
    expect(h('button', { onclick: handler }).props.onclick).toBe(handler);
  });
});

describe('h - 6장 컴포넌트 VNode', () => {
  const Item = (props) => h('li', null, props.label);

  it('6.1 문서 예시: h(Fn, { n: 1, onX: f, key: "a" }, "x") → { type: Fn, key: "a", props: { n: 1, onX: f, children } }', () => {
    const Fn = () => h('div', null);
    const f = () => {};
    expect(h(Fn, { n: 1, onX: f, key: 'a' }, 'x')).toStrictEqual({
      type: Fn,
      key: 'a',
      props: { n: 1, onX: f, children: [{ type: '#text', value: 'x' }] },
    });
  });

  it('6.1 type은 넘겨받은 함수 그대로다 (소문자 변환 등 없음)', () => {
    expect(h(Item, null).type).toBe(Item);
  });

  it('6.1 props 값을 변환하지 않는다: 숫자·불리언·함수·객체·배열을 그대로 둔다', () => {
    const fn = () => {};
    const obj = { a: 1 };
    const arr = [1, 2];
    const v = h(Item, { n: 10, zero: 0, yes: true, no: false, render: fn, onInc: fn, style: obj, list: arr, label: '라벨' });
    expect(v.props.n).toBe(10);
    expect(v.props.zero).toBe(0);
    expect(v.props.yes).toBe(true);
    expect(v.props.no).toBe(false);
    expect(v.props.render).toBe(fn);
    expect(v.props.onInc).toBe(fn);
    expect(v.props.style).toBe(obj);
    expect(v.props.list).toBe(arr);
    expect(v.props.label).toBe('라벨');
  });

  it('6.1 on으로 시작하지 않는 이름의 함수 prop도 에러 없이 그대로 둔다 (요소와 다름)', () => {
    const handler = () => {};
    expect(() => h(Item, { handler })).not.toThrow();
    expect(h(Item, { handler }).props.handler).toBe(handler);
  });

  it('6.1 key는 최상위로 옮기고 props에 넣지 않는다', () => {
    const v = h(Item, { key: 'a', label: 'x' });
    expect(v.key).toBe('a');
    expect('key' in v.props).toBe(false);
  });

  it('6.1 key가 없으면 null, 숫자 key는 문자열로 바꾼다 (요소와 같은 규칙)', () => {
    expect(h(Item, null).key).toBeNull();
    expect(h(Item, { key: null }).key).toBeNull();
    expect(h(Item, { key: 1 }).key).toBe('1');
  });

  it('6.1 data-key도 key로 옮기고 props에서 제거한다', () => {
    const v = h(Item, { 'data-key': 'b' });
    expect(v.key).toBe('b');
    expect('data-key' in v.props).toBe(false);
  });

  it('6.1 key와 data-key를 함께 주거나 key가 문자열·숫자가 아니면 에러 (요소와 같은 규칙)', () => {
    expect(() => h(Item, { key: 'a', 'data-key': 'b' })).toThrow(/^\[mini-react\] 잘못된 입력: .+/);
    expect(() => h(Item, { key: {} })).toThrow(/^\[mini-react\] 잘못된 입력: .+/);
  });

  it('6.1 children은 요소와 같은 규칙으로 정규화한다 (평탄화, 버림, 숫자 → 텍스트, 인접 텍스트 병합)', () => {
    const v = h(Item, null, ['a', [1, null]], false, h('b', null), '', 'c');
    expect(v.props.children).toEqual([text('a1'), el('b'), text('c')]);
  });

  it('6.1 나머지 인자가 없으면 props.children을 정규화해서 쓴다', () => {
    expect(h(Item, { children: ['x', 'y'] }).props.children).toEqual([text('xy')]);
    expect(h(Item, { children: 'x' }).props.children).toEqual([text('x')]);
  });

  it('6.1 나머지 인자가 있으면 props.children 대신 인자를 쓴다', () => {
    expect(h(Item, { children: ['x'] }, 'y').props.children).toEqual([text('y')]);
  });

  it('6.1 자식이 없으면 children은 []이다', () => {
    expect(h(Item, { label: 'a' }).props).toEqual({ label: 'a', children: [] });
  });

  it('6.1 요소의 자식으로 컴포넌트 VNode를 그대로 넣을 수 있다', () => {
    const child = h(Item, { key: '1' });
    const v = h('ul', null, child);
    expect(v.props.children).toHaveLength(1);
    expect(v.props.children[0]).toEqual(child);
    expect(v.props.children[0].type).toBe(Item);
    expect(v.props.children[0].key).toBe('1');
  });

  it('6.1 배열로 넘긴 컴포넌트 VNode 목록도 자식이 된다 (items.map 패턴)', () => {
    const v = h('ul', null, ['a', 'b'].map((id) => h(Item, { key: id, label: id })));
    expect(v.props.children.map((c) => [c.type, c.key])).toEqual([[Item, 'a'], [Item, 'b']]);
  });

  it('6.1 컴포넌트 VNode를 사이에 둔 텍스트는 합치지 않는다', () => {
    const v = h('p', null, 'a', h(Item, null), 'b');
    expect(v.props.children).toHaveLength(3);
    expect(v.props.children[0]).toEqual(text('a'));
    expect(v.props.children[1].type).toBe(Item);
    expect(v.props.children[2]).toEqual(text('b'));
  });

  it('6.1 컴포넌트 VNode의 자식으로 컴포넌트 VNode를 넣을 수 있다', () => {
    const inner = h(Item, { label: 'in' });
    expect(h(Item, null, inner).props.children[0]).toEqual(inner);
  });

  it('6.1 h()는 컴포넌트 함수를 호출하지 않는다 (펼치기는 나중)', () => {
    const Spy = vi.fn(() => h('div', null));
    h(Spy, { a: 1 });
    h('div', null, h(Spy, null));
    expect(Spy).not.toHaveBeenCalled();
  });

  it('6.1 넘겨받은 props 객체를 수정하지 않는다', () => {
    const list = Object.freeze([1, 2]);
    const props = Object.freeze({ key: 'k', n: 1, list, children: Object.freeze(['x']) });
    let v;
    expect(() => { v = h(Item, props); }).not.toThrow();
    expect(props).toEqual({ key: 'k', n: 1, list: [1, 2], children: ['x'] });
    expect(v.props).not.toBe(props);
    expect(v.props.list).toBe(list);
  });

  it('6.1 문자열 type의 기존 규칙은 그대로다 (값 변환, 객체 값·on* 아닌 함수 prop 거부)', () => {
    expect(h('input', { size: 3, required: true, hidden: false }).props).toEqual({ size: '3', required: '', children: [] });
    expect(() => h('p', { style: { color: 'red' } })).toThrow('[mini-react] 잘못된 입력');
    expect(() => h('button', { handler: () => {} })).toThrow('[mini-react] 지원하지 않음');
  });
});
