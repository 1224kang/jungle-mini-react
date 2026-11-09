// Diff 테스트 (DOM 없이 순수 객체로 검증)
import { describe, it, expect } from 'vitest';
import { h } from '../src/lib/vdom/vnode.js';
import { diff } from '../src/lib/reconcile/diff.js';

const li = (k) => h('li', { key: k }, k);

describe('diff: 루트와 텍스트', () => {
  it('같으면 패치가 없다', () => {
    expect(diff(h('p', {}, 'hi'), h('p', {}, 'hi'))).toEqual([]);
  });

  it('텍스트만 다르면 TEXT 하나', () => {
    expect(diff(h('p', {}, 'hi'), h('p', {}, 'hello'))).toEqual([
      { op: 'TEXT', path: [0], value: 'hello' },
    ]);
  });

  it('타입이 다르면 루트 REPLACE', () => {
    const next = h('span', {}, 'x');
    expect(diff(h('div', {}), next)).toEqual([{ op: 'REPLACE', path: [], value: next }]);
  });
});

describe('diff: 속성', () => {
  it('바뀐 속성은 set, 없어진 속성은 remove', () => {
    expect(diff(h('p', { class: 'a', id: 'x' }), h('p', { class: 'b' }))).toEqual([
      { op: 'PROPS', path: [], set: { class: 'b' }, remove: ['id'] },
    ]);
  });
});

describe('diff: 자식 (위치 매칭)', () => {
  it('뒤에 자식이 늘면 CHILDREN 계획에 create 하나', () => {
    const next = h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b'));
    expect(diff(h('ul', {}, h('li', {}, 'a')), next)).toEqual([
      {
        op: 'CHILDREN',
        path: [],
        plan: [{ from: 0, moved: false }, { create: h('li', {}, 'b') }],
      },
    ]);
  });

  it('뒤 자식이 줄면 REMOVE 하나와 CHILDREN', () => {
    const old = h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b'));
    expect(diff(old, h('ul', {}, h('li', {}, 'a')))).toEqual([
      { op: 'REMOVE', path: [1] },
      { op: 'CHILDREN', path: [], plan: [{ from: 0, moved: false }] },
    ]);
  });

  it('자식의 타입이 바뀌면 그 자리에서 REPLACE (CHILDREN 없음)', () => {
    const next = h('span', {}, 'b');
    const r = diff(h('div', {}, h('p', {}, 'a'), h('p', {}, 'b')), h('div', {}, h('p', {}, 'a'), next));
    expect(r).toEqual([{ op: 'REPLACE', path: [1], value: next }]);
  });

  it('자식 안의 텍스트 변경은 자식 경로로 내려간다', () => {
    const old = h('div', {}, h('p', {}, 'a'));
    const next = h('div', {}, h('p', {}, 'b'));
    expect(diff(old, next)).toEqual([{ op: 'TEXT', path: [0, 0], value: 'b' }]);
  });
});

describe('diff: 키 리스트 (레슨 0003, 0004)', () => {
  it('앞에 추가하면 create 하나, 나머지는 짝 유지', () => {
    const r = diff(h('ul', {}, li('A'), li('B')), h('ul', {}, li('X'), li('A'), li('B')));
    const plan = r.find((p) => p.op === 'CHILDREN').plan;
    expect(plan).toEqual([
      { create: li('X') },
      { from: 0, moved: false },
      { from: 1, moved: false },
    ]);
  });

  it('A,B,C → B,C,A 는 A 하나만 이동', () => {
    const r = diff(h('ul', {}, li('A'), li('B'), li('C')), h('ul', {}, li('B'), li('C'), li('A')));
    const plan = r.find((p) => p.op === 'CHILDREN').plan;
    expect(plan.map((p) => p.from)).toEqual([1, 2, 0]);
    expect(plan.map((p) => p.moved)).toEqual([false, false, true]);
  });

  it('A,B,C,D → D,A,B,C 는 A,B,C 가 이동 (최소가 아님, 레슨 0004 Q2)', () => {
    const r = diff(
      h('ul', {}, li('A'), li('B'), li('C'), li('D')),
      h('ul', {}, li('D'), li('A'), li('B'), li('C'))
    );
    const plan = r.find((p) => p.op === 'CHILDREN').plan;
    expect(plan.map((p) => p.moved)).toEqual([false, true, true, true]);
  });

  it('같은 키 순서면 CHILDREN 이 없다', () => {
    const r = diff(h('ul', {}, li('A'), li('B')), h('ul', {}, li('A'), li('B')));
    expect(r).toEqual([]);
  });
});
