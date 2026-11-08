import { expect, it } from 'vitest';
import { h, diff, patch, domToVdom } from '../../../src/lib/index.js';
import { mount } from '../phase1/helpers.js';
import { countMutations } from './helpers.js';

it('places adjacent creations before an already created new sibling (sections 5, 7, 8)', () => {
  const item = (key) => h('li', { key }, key);
  const old = h('ul', null, item('A'), item('B'));
  const next = h('ul', null, item('X'), item('Y'), item('A'), item('B'), item('Z'));
  const { root } = mount(old);
  const [a, b] = root.children;
  const patches = diff(old, next);
  const creates = patches.filter((p) => p.type === 'CREATE');
  expect(creates).toEqual([
    { type: 'CREATE', path: [4], node: next.props.children[4], before: null },
    { type: 'CREATE', path: [1], node: next.props.children[1], before: { old: 0 } },
    { type: 'CREATE', path: [0], node: next.props.children[0], before: { new: 1 } },
  ]);
  const result = patch(root, patches);
  expect(result.children[2]).toBe(a);
  expect(result.children[3]).toBe(b);
  expect(domToVdom(result)).toEqual(next);
});

it('resolves a move anchor before earlier removals shift old indices (sections 5, 7, 8)', () => {
  const list = (keys) => h('ul', null, ...keys.map((key) => h('li', { key }, key)));
  const old = list(['A', 'B', 'C', 'D', 'E']);
  const next = list(['D', 'B', 'X', 'E']);
  const { root } = mount(old);
  const before = Array.from(root.children);
  const result = patch(root, diff(old, next));
  expect(result.children[0]).toBe(before[3]);
  expect(result.children[1]).toBe(before[1]);
  expect(result.children[3]).toBe(before[4]);
  expect(before[0].parentNode).toBeNull();
  expect(before[2].parentNode).toBeNull();
  expect(domToVdom(result)).toEqual(next);
});

it.each([
  ['unresolved move path', { type: 'MOVE', path: [9], index: 0, before: null }],
  ['unresolved old anchor', { type: 'MOVE', path: [0], index: 0, before: { old: 9 } }],
])('rejects %s before applying any earlier patch (sections 5, 11)', (_name, invalid) => {
  const vnode = h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B'));
  const { container, root } = mount(vnode);
  const before = Array.from(root.childNodes);
  const observer = countMutations(container);
  try {
    expect(() => patch(root, [
      { type: 'REMOVE', path: [1] }, invalid,
    ])).toThrow(/^\[mini-react\] 잘못된 입력: /);
    expect(observer.counts).toEqual({ moves: 0, inserts: 0, removes: 0, attributes: 0, text: 0 });
  } finally { observer.restore(); }
  before.forEach((node, index) => expect(root.childNodes[index]).toBe(node));
  expect(domToVdom(root)).toEqual(vnode);
});
