import { describe, it, expect } from 'vitest';
import { h, diff, patch } from '../../../src/lib/index.js';
import { mount, expectTree } from './helpers.js';

describe('phase1 children by index', () => {
  it('appends remaining children in forward order with before null', () => {
    const first = h('li', null, 'A');
    const second = h('li', null, h('b', null, 'B'));
    const third = h('li', null, 'C');
    const old = h('ul', null, first);
    const next = h('ul', null, first, second, third);
    expect(diff(old, next)).toEqual([
      { type: 'CREATE', path: [1], node: second, before: null },
      { type: 'CREATE', path: [2], node: third, before: null },
    ]);
    const { root } = mount(old);
    expectTree(patch(root, diff(old, next)), next);
  });

  it('removes multiple trailing children using old paths without descendant patches', () => {
    const first = h('li', null, 'A');
    const old = h('ul', null, first, h('li', null, h('b', null, 'B')), h('li', null, 'C'));
    const next = h('ul', null, first);
    const patches = diff(old, next);
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'REMOVE', path: [1] }, { type: 'REMOVE', path: [2] },
    ]));
    const { root } = mount(old);
    expectTree(patch(root, patches), next);
  });

  it('updates nested text and props at old child paths', () => {
    const old = h('div', null, h('section', null, h('p', { class: 'off' }, 'old')));
    const next = h('div', null, h('section', null, h('p', { class: 'on' }, 'new')));
    const patches = diff(old, next);
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'PROPS', path: [0, 0], set: { class: 'on' }, remove: [] },
      { type: 'TEXT', path: [0, 0, 0], value: 'new' },
    ]));
    const { root } = mount(old);
    expectTree(patch(root, patches), next);
  });

  it('creates and removes a sole text child', () => {
    const empty = h('p', null);
    const text = h('p', null, 'hello');
    const create = diff(empty, text);
    expect(create).toEqual([{ type: 'CREATE', path: [0], node: { type: '#text', value: 'hello' }, before: null }]);
    const { root } = mount(empty);
    expectTree(patch(root, create), text);
    const remove = diff(text, empty);
    expect(remove).toEqual([{ type: 'REMOVE', path: [0] }]);
    expectTree(patch(root, remove), empty);
  });

  it('counts text nodes in paths for mixed element and text children', () => {
    const old = h('p', null, 'before', h('b', { title: 'old' }, 'bold'), 'after');
    const next = h('p', null, 'start', h('b', { title: 'new' }, 'bold'), 'end');
    const patches = diff(old, next);
    expect(patches).toHaveLength(3);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'TEXT', path: [0], value: 'start' },
      { type: 'PROPS', path: [1], set: { title: 'new' }, remove: [] },
      { type: 'TEXT', path: [2], value: 'end' },
    ]));
    const { root } = mount(old);
    expectTree(patch(root, patches), next);
  });

  it('replaces only a middle child whose type changes', () => {
    const first = h('span', null, 'first');
    const last = h('span', null, 'last');
    const old = h('div', null, first, h('p', null, h('b', null, 'old')), last);
    const middle = h('section', null, h('i', null, 'new'));
    const next = h('div', null, first, middle, last);
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'REPLACE', path: [1], node: middle }]);
    const { root } = mount(old);
    const nodes = [...root.childNodes];
    expect(patch(root, patches)).toBe(root);
    expect(root.childNodes[0]).toBe(nodes[0]);
    expect(root.childNodes[1]).not.toBe(nodes[1]);
    expect(root.childNodes[2]).toBe(nodes[2]);
    expectTree(root, next);
  });

  it.each(['text to element', 'element to text'])('%s replaces the child at its index', (direction) => {
    const element = h('b', null, 'bold');
    const old = h('p', null, direction === 'text to element' ? 'text' : element);
    const next = h('p', null, direction === 'text to element' ? element : 'text');
    expect(diff(old, next)).toEqual([{ type: 'REPLACE', path: [0], node: next.props.children[0] }]);
    const { root } = mount(old);
    expectTree(patch(root, diff(old, next)), next);
  });
});
