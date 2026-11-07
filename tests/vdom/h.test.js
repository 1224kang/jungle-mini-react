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

  it('3장 컴포넌트 (type이 함수) → 에러', () => {
    expect(() => h(() => null, null)).toThrow(unsupported);
  });

  it('3장 함수 이벤트 핸들러 (props 값이 함수) → 에러', () => {
    expect(() => h('button', { onclick: () => {} })).toThrow(unsupported);
  });
});
