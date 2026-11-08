import { describe, it, expect } from 'vitest';
import { h, render, diff, patch } from '../../../src/lib/index.js';
import { mount, observeMutations } from './helpers.js';

const prefix = /^\[mini-react\] 잘못된 입력/;
function expectInvalid(action) {
  expect(action).toThrow(TypeError);
  expect(action).toThrow(prefix);
}

describe('phase1 public input errors and atomic validation', () => {
  it.each([null, undefined, 0, 'div', true, () => {}])('diff rejects non-object argument %s in either position', (invalid) => {
    const valid = h('div', null);
    expectInvalid(() => diff(invalid, valid));
    expectInvalid(() => diff(valid, invalid));
  });

  it.each([{}, { type: 1 }, { type: null }])('diff rejects an object without a string type: %j', (invalid) => {
    const valid = h('div', null);
    expectInvalid(() => diff(invalid, valid));
    expectInvalid(() => diff(valid, invalid));
  });

  it.each([null, undefined, {}, 'div', 1])('patch rejects non-Node root %s', (invalid) => {
    expectInvalid(() => patch(invalid, []));
  });

  it.each([null, undefined, {}, 'patches', 1])('patch rejects non-array patches %s', (invalid) => {
    const root = render(h('div', null));
    expectInvalid(() => patch(root, invalid));
  });

  it('empty patches return the original root with zero DOM mutations', () => {
    const { root, container } = mount(h('div', { id: 'same' }, h('p', null, 'same')));
    const before = container.innerHTML;
    const observation = observeMutations(container);
    try {
      expect(patch(root, [])).toBe(root);
      expect(observation.calls).toEqual([]);
      expect(container.innerHTML).toBe(before);
    } finally { observation.restore(); }
  });

  it.each([
    ['missing target', { type: 'TEXT', path: [7, 0], value: 'invalid' }],
    ['missing CREATE parent', { type: 'CREATE', path: [7, 0], node: h('b', null), before: null }],
    ['missing before.old', { type: 'CREATE', path: [1], node: h('b', null), before: { old: 7 } }],
    ['unknown type', { type: 'UNKNOWN', path: [] }],
  ])('%s throws before even an earlier valid patch changes the DOM', (_, invalidPatch) => {
    const { root, container } = mount(h('div', { id: 'old' }, h('p', null, 'same')));
    const child = root.firstChild;
    const before = container.innerHTML;
    const observation = observeMutations(container);
    try {
      const patches = [{ type: 'PROPS', path: [], set: { id: 'new' }, remove: [] }, invalidPatch];
      expectInvalid(() => patch(root, patches));
      expect(observation.calls).toEqual([]);
      expect(container.innerHTML).toBe(before);
      expect(container.firstChild).toBe(root);
      expect(root.firstChild).toBe(child);
    } finally { observation.restore(); }
  });

  it('root REPLACE rejects a detached root without changing it', () => {
    const root = render(h('div', { id: 'old' }, 'same'));
    const before = root.outerHTML;
    expectInvalid(() => patch(root, [{ type: 'REPLACE', path: [], node: h('section', null, 'new') }]));
    expect(root.parentNode).toBeNull();
    expect(root.outerHTML).toBe(before);
  });
});
