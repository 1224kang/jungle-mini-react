import { expect, vi } from 'vitest';
import { render, domToVdom } from '../../../src/lib/index.js';

export function mount(vnode) {
  const container = document.createElement('div');
  const root = render(vnode);
  container.appendChild(root);
  return { container, root };
}

export function expectTree(root, vnode) {
  expect(domToVdom(root)).toEqual(vnode);
  expect(root.outerHTML).toBe(render(vnode).outerHTML);
}

// Count only operations targeting nodes present before patch, including text nodes.
// Building detached replacement subtrees is outside this measurement.
export function observeMutations(container) {
  const existing = new Set([container]);
  const visit = (node) => {
    existing.add(node);
    node.childNodes.forEach(visit);
  };
  visit(container);
  const calls = [];
  const spies = [];
  const wrap = (prototype, name, access) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor || (access ? !descriptor.set : typeof descriptor.value !== 'function')) return;
    const original = access ? descriptor.set : descriptor.value;
    const spy = access ? vi.spyOn(prototype, name, 'set') : vi.spyOn(prototype, name);
    spy.mockImplementation(function (...args) {
      if (existing.has(this)) calls.push({ name, target: this, args });
      return original.apply(this, args);
    });
    spies.push(spy);
  };
  for (const proto of [Node.prototype, Element.prototype, CharacterData.prototype]) {
    for (const name of ['insertBefore', 'appendChild', 'removeChild', 'replaceChild',
      'setAttribute', 'removeAttribute', 'remove', 'replaceWith', 'before', 'after']) wrap(proto, name);
    for (const name of ['textContent', 'nodeValue']) wrap(proto, name, true);
  }
  return { calls, restore: () => spies.reverse().forEach((spy) => spy.mockRestore()) };
}
