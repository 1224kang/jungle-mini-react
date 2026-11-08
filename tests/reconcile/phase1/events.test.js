import { describe, it, expect, vi } from 'vitest';
import { h, render, diff, patch } from '../../../src/lib/index.js';

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('phase1 event handlers', () => {
  it.each(['onclick', 'onClick'])('%s functions are preserved and rendered with addEventListener, without attributes', (name) => {
    const handler = vi.fn();
    const vnode = h('button', { [name]: handler }, 'click');
    expect(vnode.props[name]).toBe(handler);
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const set = vi.spyOn(Element.prototype, 'setAttribute');
    try {
      const root = render(vnode);
      expect(add.mock.calls.some((args, i) => add.mock.contexts[i] === root && args[0] === 'click' && args[1] === handler)).toBe(true);
      expect(set.mock.calls.filter((args) => args[0].toLowerCase().startsWith('on'))).toEqual([]);
      expect(root.hasAttribute('onclick')).toBe(false);
      click(root);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally { add.mockRestore(); set.mockRestore(); }
  });

  it('replacing a handler calls only the new handler once', () => {
    const previous = vi.fn();
    const current = vi.fn();
    const old = h('button', { onclick: previous });
    const next = h('button', { onclick: current });
    const root = render(old);
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'PROPS', path: [], set: { onclick: current }, remove: [] }]);
    expect(patch(root, patches)).toBe(root);
    click(root);
    expect(previous).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute('onclick')).toBe(false);
  });

  it('removing a handler leaves no registered callback', () => {
    const handler = vi.fn();
    const old = h('button', { onclick: handler });
    const root = render(old);
    const next = h('button', null);
    expect(diff(old, next)).toEqual([{ type: 'PROPS', path: [], set: {}, remove: ['onclick'] }]);
    patch(root, diff(old, next));
    click(root);
    expect(handler).not.toHaveBeenCalled();
    expect(root.hasAttribute('onclick')).toBe(false);
  });

  it('the same function produces no listener or attribute changes', () => {
    const handler = vi.fn();
    const old = h('button', { onclick: handler });
    const root = render(old);
    const spies = [vi.spyOn(root, 'addEventListener'), vi.spyOn(root, 'removeEventListener'),
      vi.spyOn(root, 'setAttribute'), vi.spyOn(root, 'removeAttribute')];
    try {
      const patches = diff(old, h('button', { onclick: handler }));
      expect(patches).toEqual([]);
      expect(patch(root, patches)).toBe(root);
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      click(root);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally { spies.forEach((spy) => spy.mockRestore()); }
  });

  it('string to function removes the inline attribute and registers the function', () => {
    const handler = vi.fn();
    const old = h('button', { onclick: 'void 0' });
    const next = h('button', { onclick: handler });
    const root = render(old);
    expect(root.getAttribute('onclick')).toBe('void 0');
    patch(root, diff(old, next));
    expect(root.hasAttribute('onclick')).toBe(false);
    click(root);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('function to string removes the listener and writes a normal attribute', () => {
    const handler = vi.fn();
    const old = h('button', { onclick: handler });
    const next = h('button', { onclick: 'void 0' });
    const root = render(old);
    patch(root, diff(old, next));
    expect(root.getAttribute('onclick')).toBe('void 0');
    click(root);
    expect(handler).not.toHaveBeenCalled();
  });

  it('adding a function during patch uses a listener without writing an event attribute', () => {
    const handler = vi.fn();
    const old = h('button', null);
    const root = render(old);
    const set = vi.spyOn(root, 'setAttribute');
    try {
      patch(root, diff(old, h('button', { onClick: handler })));
      expect(set).not.toHaveBeenCalled();
      expect(root.hasAttribute('onclick')).toBe(false);
      click(root);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally { set.mockRestore(); }
  });
});
