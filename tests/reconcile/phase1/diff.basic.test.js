import { describe, it, expect } from 'vitest';
import { h, diff, patch } from '../../../src/lib/index.js';
import { mount, expectTree } from './helpers.js';

describe('phase1 basic comparison', () => {
  it('identical independent trees produce no patches', () => {
    const make = () => h('div', { class: 'box' }, h('p', { key: 'a' }, 'same'));
    expect(diff(make(), make())).toEqual([]);
  });

  it('text changes produce a TEXT patch at the old path', () => {
    const old = h('div', null, h('p', null, 'old'));
    const next = h('div', null, h('p', null, 'new'));
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'TEXT', path: [0, 0], value: 'new' }]);
    const { root } = mount(old);
    expectTree(patch(root, patches), next);
  });

  it('different child tags produce only REPLACE without descendant patches', () => {
    const old = h('div', null, h('p', { id: 'old' }, h('b', null, 'old')));
    const child = h('section', { class: 'new' }, h('i', null, 'new'));
    expect(diff(old, h('div', null, child))).toEqual([{ type: 'REPLACE', path: [0], node: child }]);
  });

  it('different keys at the same position produce only REPLACE', () => {
    const old = h('div', null, h('p', { key: 'a' }, 'old'));
    const child = h('p', { key: 'b' }, 'new');
    const next = h('div', null, child);
    expect(diff(old, next)).toEqual([{ type: 'REPLACE', path: [0], node: child }]);
    const { root } = mount(old);
    const previous = root.firstChild;
    const result = patch(root, diff(old, next));
    expect(result.firstChild).not.toBe(previous);
    expect(result.firstChild.getAttribute('data-key')).toBe('b');
    expectTree(result, next);
  });

  it.each(['tag', 'key'])('root %s difference returns the new root and replaces it in its parent', (kind) => {
    const old = h('div', { key: 'a' }, h('p', null, 'old'));
    const next = h(kind === 'tag' ? 'section' : 'div', { key: kind === 'key' ? 'b' : 'a' }, 'new');
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'REPLACE', path: [], node: next }]);
    const { root, container } = mount(old);
    const result = patch(root, patches);
    expect(result).not.toBe(root);
    expect(root.parentNode).toBeNull();
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(result);
    expectTree(result, next);
  });

  it('diff leaves both input trees unchanged', () => {
    const old = h('div', { id: 'old' }, h('p', { key: 'a' }, 'old'), h('i', null, 'remove'));
    const next = h('div', { class: 'new' }, h('p', { key: 'a' }, 'new'));
    const oldCopy = structuredClone(old);
    const nextCopy = structuredClone(next);
    diff(old, next);
    expect(old).toEqual(oldCopy);
    expect(next).toEqual(nextCopy);
  });
});
