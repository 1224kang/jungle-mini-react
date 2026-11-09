import { describe, it, expect } from 'vitest';
import { h, diff, domToVdom } from '../../src/lib/index.js';
import { cases } from '../../fixtures/cases.js';

// diff는 순수 함수이므로 VNode 객체 두 개만으로 테스트한다. (fixture 파싱에만 DOM 사용)
const parse = (html) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return domToVdom(holder.firstElementChild);
};
const types = (patches) => patches.map((p) => p.type);

describe('diff', () => {
  it('같은 트리면 빈 배열을 반환한다', () => {
    const v = h('div', { class: 'a' }, h('p', null, 'x'), h('ul', null, h('li', { key: 'k' }, 'y')));
    expect(diff(v, structuredClone(v))).toEqual([]);
  });

  it('텍스트가 다르면 TEXT 패치를 만든다', () => {
    expect(diff(h('p', null, '안녕'), h('p', null, '잘가'))).toEqual([{ type: 'TEXT', path: [0], value: '잘가' }]);
  });

  it('속성이 추가/변경/삭제되면 PROPS 패치를 만든다', () => {
    const patches = diff(h('p', { id: 'a', class: 'off' }), h('p', { class: 'on', title: 't' }));
    expect(patches).toEqual([{ type: 'PROPS', path: [], set: { class: 'on', title: 't' }, remove: ['id'] }]);
  });

  it('태그가 다르면 REPLACE 패치를 만든다', () => {
    const next = h('div', null, h('h1', null, '글'));
    expect(diff(h('div', null, h('p', null, '글')), next)).toEqual([
      { type: 'REPLACE', path: [0], node: next.props.children[0] },
    ]);
  });

  it('자식이 늘면 CREATE, 줄면 REMOVE 패치를 만든다', () => {
    const one = h('ul', null, h('li', null, '1'));
    const two = h('ul', null, h('li', null, '1'), h('li', null, '2'));
    expect(types(diff(one, two))).toEqual(['CREATE']);
    expect(diff(one, two)[0]).toMatchObject({ path: [1], before: null });
    expect(diff(two, one)).toEqual([{ type: 'REMOVE', path: [1] }]);
  });

  it('key가 같은 자식의 순서가 바뀌면 MOVE 패치를 만든다', () => {
    const li = (k) => h('li', { key: k }, k);
    expect(types(diff(h('ul', null, li('a'), li('b'), li('c')), h('ul', null, li('b'), li('c'), li('a'))))).toEqual(['MOVE']);
  });

  it('입력 VNode를 수정하지 않는다', () => {
    const a = parse(cases[0].before);
    const b = parse(cases[0].after);
    const snapshot = JSON.stringify([a, b]);
    diff(a, b);
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });

  it.each(cases)('fixtures: $name — 같은 입력이면 같은 결과, 변경이 있으면 1개 이상', ({ before, after }) => {
    const a = parse(before);
    const b = parse(after);
    const patches = diff(a, b);
    expect(diff(a, b)).toEqual(patches);
    expect(diff(a, a)).toEqual([]);
    expect(patches.length > 0).toBe(JSON.stringify(a) !== JSON.stringify(b));
  });
});
