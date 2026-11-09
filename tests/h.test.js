import { describe, test, expect } from 'vitest';
import { h, createElement, createTextNode } from '../src/lib/index.js';

describe('h: VNode 만들기', () => {
  test('문자열·숫자 자식은 텍스트 VNode가 된다', () => {
    expect(h('p', { class: 'a' }, '값: ', 3)).toEqual(
      createElement('p', { class: 'a' }, [createTextNode('값: '), createTextNode('3')]),
    );
  });

  test('props가 null이어도 빈 객체로 만든다', () => {
    expect(h('div', null).props).toEqual({});
  });

  test('배열 자식은 펼치고, null·false·true·undefined는 건너뛴다', () => {
    const vnode = h('ul', null, [h('li', null, 'a'), [h('li', null, 'b')]], null, false, true, undefined);
    expect(vnode.children.map((li) => li.children[0].text)).toEqual(['a', 'b']);
  });

  test('함수 type(자식 컴포넌트)은 props와 children을 받아 바로 VNode로 펼쳐진다', () => {
    const Greeting = ({ name, children }) => h('p', null, `안녕 ${name}`, children);
    expect(h(Greeting, { name: '민서' }, '!')).toEqual(
      createElement('p', {}, [createTextNode('안녕 민서'), createTextNode('!')]),
    );
  });

  test('자식 컴포넌트가 null을 반환하면 부모 자식 목록에서 빠진다', () => {
    const Nothing = () => null;
    expect(h('div', null, h(Nothing), 'x').children).toEqual([createTextNode('x')]);
  });
});
