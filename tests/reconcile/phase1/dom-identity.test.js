import { describe, it, expect } from 'vitest';
import { h, diff, patch } from '../../../src/lib/index.js';
import { mount, expectTree } from './helpers.js';

describe('phase1 DOM identity', () => {
  it.each([null, 'stable'])('same type and key %s preserve element and text objects at the same position', (key) => {
    const old = h('div', { class: 'old' }, h('p', { key, title: 'old' }, 'old'));
    const next = h('div', { class: 'new' }, h('p', { key, title: 'new' }, 'new'));
    const { root } = mount(old);
    const child = root.firstChild;
    const text = child.firstChild;
    expect(patch(root, diff(old, next))).toBe(root);
    expect(root.firstChild).toBe(child);
    expect(child.firstChild).toBe(text);
    expectTree(root, next);
  });

  it.each(['sibling text', 'parent attribute'])('an unmoved input preserves user value and focus after %s changes', (change) => {
    const input = () => h('input', { key: 'input', type: 'text', value: 'initial' });
    const old = h('div', { class: 'old' }, input(), h('span', null, 'old'));
    const next = h('div', { class: change === 'parent attribute' ? 'new' : 'old' },
      input(), h('span', null, change === 'sibling text' ? 'new' : 'old'));
    const { root, container } = mount(old);
    document.body.appendChild(container);
    try {
      const field = root.firstChild;
      field.value = 'user typed';
      field.focus();
      expect(document.activeElement).toBe(field);
      expect(patch(root, diff(old, next))).toBe(root);
      expect(root.firstChild).toBe(field);
      expect(field.value).toBe('user typed');
      expect(field.getAttribute('value')).toBe('initial');
      expect(document.activeElement).toBe(field);
      expectTree(root, next);
    } finally { container.remove(); }
  });
});
