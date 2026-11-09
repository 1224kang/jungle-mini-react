import { describe, it, expect } from 'vitest';
import { h, diff, patch } from '../../../src/lib/index.js';
import { mount, expectTree, observeMutations } from './helpers.js';

describe('phase1 attributes', () => {
  it.each([
    ['add', {}, { title: 'new' }, { title: 'new' }, []],
    ['change', { class: 'off' }, { class: 'on' }, { class: 'on' }, []],
    ['remove', { id: 'old' }, {}, {}, ['id']],
    ['style string', { style: 'color: red' }, { style: 'color: blue' }, { style: 'color: blue' }, []],
    ['HTML names and boolean attributes', { disabled: '', 'aria-label': 'old' }, { class: 'on', 'aria-label': 'new' }, { class: 'on', 'aria-label': 'new' }, ['disabled']],
  ])('%s yields PROPS set/remove and matching DOM attributes', (_, before, after, set, remove) => {
    const old = h('button', before, 'same');
    const next = h('button', after, 'same');
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'PROPS', path: [], set, remove }]);
    const { root } = mount(old);
    expect(patch(root, patches)).toBe(root);
    expectTree(root, next);
  });

  it('equal props and children cause zero DOM mutations', () => {
    const make = () => h('div', { class: 'box', style: 'color: red' }, h('p', { title: 'same' }, 'text'));
    const old = make();
    const { root, container } = mount(old);
    const patches = diff(old, make());
    expect(patches).toEqual([]);
    const observation = observeMutations(container);
    try {
      expect(patch(root, patches)).toBe(root);
      expect(observation.calls).toEqual([]);
    } finally { observation.restore(); }
  });
});
