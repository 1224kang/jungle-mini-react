import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render, diff, patch, domToVdom } from '../../../src/lib/index.js';
import { mount } from '../phase1/helpers.js';
import { countMutations } from './helpers.js';

const list = (keys, keyed = true) => h('ul', null,
  ...keys.map((key) => h('li', keyed ? { key } : null, key)));
const order = (root) => Array.from(root.children, (node) => node.textContent);
const tree = (root, vnode) => expect(domToVdom(root)).toEqual(vnode);
afterEach(() => vi.restoreAllMocks());

describe('phase2: lastPlacedIndex move counts (sections 5, 7, 8)', () => {
  it.each([
    ['identical', ['A', 'B', 'C', 'D'], 0, 0, 0],
    ['append', ['A', 'B', 'C', 'D', 'E'], 0, 1, 0],
    ['prepend', ['E', 'A', 'B', 'C', 'D'], 0, 1, 0],
    ['remove middle', ['A', 'B', 'D'], 0, 0, 1],
    ['first to last', ['B', 'C', 'D', 'A'], 1, 0, 0],
    ['last to first', ['D', 'A', 'B', 'C'], 3, 0, 0],
    ['reverse', ['D', 'C', 'B', 'A'], 3, 0, 0],
  ])('%s', (_name, keys, moves, inserts, removes) => {
    const old = list(['A', 'B', 'C', 'D']);
    const next = list(keys);
    const { container, root } = mount(old);
    const identities = new Map(Array.from(root.children, (node) => [node.textContent, node]));
    const observer = countMutations(container);
    let result;
    try {
      result = patch(root, diff(old, next));
      expect(observer.counts).toEqual({ moves, inserts, removes, attributes: 0, text: 0 });
    } finally { observer.restore(); }
    expect(order(result)).toEqual(keys);
    Array.from(result.children).forEach((node) => {
      if (identities.has(node.textContent)) expect(node).toBe(identities.get(node.textContent));
    });
    tree(result, next);
  });
});

it('keys preserve logical identity; unkeyed same-type children preserve positions (sections 6–8)', () => {
  for (const keyed of [true, false]) {
    const old = list(['A', 'B', 'C', 'D'], keyed);
    const next = list(['D', 'A', 'B', 'C'], keyed);
    const { container, root } = mount(old);
    const before = Array.from(root.children);
    const observer = countMutations(container);
    let result;
    try {
      result = patch(root, diff(old, next));
      expect(observer.counts).toEqual({ moves: keyed ? 3 : 0, inserts: 0, removes: 0,
        attributes: 0, text: keyed ? 0 : 4 });
    } finally { observer.restore(); }
    const expected = keyed ? [before[3], before[0], before[1], before[2]] : before;
    Array.from(result.children).forEach((node, index) => expect(node).toBe(expected[index]));
    if (!keyed) expect(result.children[0]).not.toBe(before[3]);
    tree(result, next);
  }
});

it('same key with different type removes and creates rather than reusing (sections 6–8)', () => {
  const old = h('div', null, h('p', { key: 'a' }, 'old'), h('i', { key: 'b' }, 'stay'));
  const next = h('div', null, h('section', { key: 'a' }, 'new'), h('i', { key: 'b' }, 'stay'));
  const { root } = mount(old);
  const [removed, survivor] = root.children;
  const patches = diff(old, next);
  expect(patches).toContainEqual({ type: 'REMOVE', path: [0] });
  expect(patches).toContainEqual({ type: 'CREATE', path: [0], node: next.props.children[0], before: { old: 1 } });
  const result = patch(root, patches);
  expect(result.children[0]).not.toBe(removed);
  expect(removed.parentNode).toBeNull();
  expect(result.children[1]).toBe(survivor);
  tree(result, next);
});

it('pairs unkeyed children and text in appearance order among reordered keys (section 7)', () => {
  const old = h('div', null, h('b', { key: 'a' }, 'A'), h('span', null, 'one'),
    'old text', h('b', { key: 'b' }, 'B'), h('span', null, 'two'));
  const next = h('div', null, h('b', { key: 'b' }, 'B'), h('span', null, 'first'),
    h('b', { key: 'a' }, 'A'), 'new text', h('span', null, 'second'));
  const { root } = mount(old);
  const before = Array.from(root.childNodes);
  const result = patch(root, diff(old, next));
  [3, 1, 0, 2, 4].forEach((oldIndex, index) => expect(result.childNodes[index]).toBe(before[oldIndex]));
  tree(result, next);
});

it('does not search past a mismatched first unused unkeyed type (section 7)', () => {
  const old = h('div', null, h('span', null, 'first'), h('i', { key: 'k' }), h('em', null, 'later'));
  const next = h('div', null, h('em', null, 'created'), h('i', { key: 'k' }),
    h('span', null, 'reused'), h('em', null, 'also reused'));
  const { root } = mount(old);
  const [span, keyed, em] = root.children;
  const result = patch(root, diff(old, next));
  expect(result.children[0]).not.toBe(em);
  expect(result.children[1]).toBe(keyed);
  expect(result.children[2]).toBe(span);
  expect(result.children[3]).toBe(em);
  tree(result, next);
});

it('patches removed/changed props and text inside moved keyed nodes (sections 5–8)', () => {
  const item = (key, props, text) => h('li', { key, ...props }, h('span', null, text));
  const old = h('ul', null, item('a', { title: 'obsolete', class: 'old' }, 'old A'), item('b', {}, 'B'));
  const next = h('ul', null, item('b', {}, 'B'), item('a', { class: 'new' }, 'new A'));
  const { root } = mount(old);
  const a = root.children[0];
  const inner = a.firstChild;
  const text = inner.firstChild;
  const result = patch(root, diff(old, next));
  expect(result.children[1]).toBe(a);
  expect(a.firstChild).toBe(inner);
  expect(inner.firstChild).toBe(text);
  expect(a.hasAttribute('title')).toBe(false);
  tree(result, next);
});

it('resolves nested keyed lists using old paths inside moved parents (sections 5, 7, 8)', () => {
  const group = (key, keys) => h('section', { key }, list(keys));
  const old = h('div', null, group('x', ['A', 'B', 'C', 'D']), group('y', ['P', 'Q']));
  const next = h('div', null, group('y', ['Q', 'R', 'P']), group('x', ['D', 'B', 'A']));
  const { root } = mount(old);
  const parents = new Map(Array.from(root.children, (node) => [node.getAttribute('data-key'), node]));
  const children = new Map(Array.from(root.querySelectorAll('li'), (node) => [node.textContent, node]));
  const result = patch(root, diff(old, next));
  for (const parent of result.children) expect(parent).toBe(parents.get(parent.getAttribute('data-key')));
  for (const child of result.querySelectorAll('li')) {
    if (children.has(child.textContent)) expect(child).toBe(children.get(child.textContent));
  }
  expect(children.get('C').parentNode).toBeNull();
  tree(result, next);
});

it('duplicate keys warn at creation but diff/patch do not warn or throw (sections 7, 8, 11)', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const old = list(['A', 'A', 'B']);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockClear();
  const next = list(['B', 'A', 'A', 'C']);
  expect(warn).toHaveBeenCalledTimes(1);
  const { root } = mount(old);
  warn.mockClear();
  let result;
  expect(() => { result = patch(root, diff(old, next)); }).not.toThrow();
  expect(warn).not.toHaveBeenCalled();
  expect(order(result)).toEqual(['B', 'A', 'A', 'C']);
  tree(result, next);
});

it('keeps focus and user value on an unmoved keyed input through sibling changes (section 8)', () => {
  const input = () => h('input', { key: 'field', value: 'initial' });
  const sibling = (key) => h('span', { key }, key);
  let vnode = h('div', null, input(), sibling('a'), sibling('b'));
  const container = document.createElement('div');
  let root = render(vnode);
  container.appendChild(root);
  document.body.appendChild(container);
  try {
    const field = root.firstChild;
    field.value = 'user typed';
    field.focus();
    expect(document.activeElement).toBe(field);
    for (const keys of [['b', 'a'], ['c', 'b', 'a'], ['c', 'a']]) {
      const next = h('div', null, input(), ...keys.map(sibling));
      const patches = diff(vnode, next);
      expect(patches.some((p) => p.type === 'MOVE' && p.path.length === 1 && p.path[0] === 0)).toBe(false);
      root = patch(root, patches);
      expect(root.firstChild).toBe(field);
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe('user typed');
      tree(root, next);
      vnode = next;
    }
  } finally { container.remove(); }
});

it('keeps user value and identity on a moved keyed input (sections 7, 8)', () => {
  const field = () => h('input', { key: 'field', value: 'initial' });
  const other = () => h('span', { key: 'other' }, 'other');
  const old = h('div', null, field(), other());
  const next = h('div', null, other(), field());
  const { root } = mount(old);
  const input = root.firstChild;
  input.value = 'user typed';
  const patches = diff(old, next);
  expect(patches).toContainEqual({ type: 'MOVE', path: [0], index: 1, before: null });
  const result = patch(root, patches);
  expect(result.lastChild).toBe(input);
  expect(input.value).toBe('user typed');
  tree(result, next);
});
