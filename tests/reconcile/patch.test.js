import { describe, it, expect } from 'vitest';
import { h, render, diff, patch, domToVdom } from '../../src/lib/index.js';
import { cases } from '../../fixtures/cases.js';

const parse = (html) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return domToVdom(holder.firstElementChild);
};

/** old VNode를 render해 부모에 붙이고, diff 결과를 patch한 루트를 돌려준다. */
function apply(oldV, newV) {
  const container = document.createElement('div');
  const root = render(oldV);
  container.appendChild(root);
  return { container, before: root, after: patch(root, diff(oldV, newV)) };
}

describe('patch', () => {
  it('CREATE / REMOVE / REPLACE / TEXT / PROPS 패치를 각각 DOM에 반영한다', () => {
    const oldV = h('div', { id: 'a' }, h('p', null, '글'), h('span', null, 'x'), h('b', null, '지움'));
    const newV = h('div', { class: 'on' }, h('p', null, '새 글'), h('em', null, 'x'), h('i', null, '추가'), h('u', null, '끝'));
    const patches = diff(oldV, newV);
    expect(new Set(patches.map((p) => p.type))).toEqual(new Set(['PROPS', 'TEXT', 'REPLACE', 'CREATE']));
    const { before, after } = apply(oldV, newV);
    expect(after).toBe(before);
    expect(domToVdom(after)).toEqual(newV);

    const removed = apply(oldV, h('div', { id: 'a' }, h('p', null, '글')));
    expect(removed.after.childNodes).toHaveLength(1);
  });

  it('바뀌지 않은 노드는 같은 DOM 객체를 유지한다', () => {
    const oldV = h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B'));
    const newV = h('ul', null, h('li', { key: 'b' }, 'B'), h('li', { key: 'a' }, 'A2'));
    const container = document.createElement('div');
    const root = render(oldV);
    container.appendChild(root);
    const [liA, liB] = root.children;
    patch(root, diff(oldV, newV));
    expect([...root.children]).toEqual([liB, liA]);
    expect(liA.textContent).toBe('A2');
  });

  it('빈 patch 목록이면 아무것도 하지 않고 루트를 그대로 돌려준다', () => {
    const root = render(h('p', null, 'x'));
    expect(patch(root, [])).toBe(root);
  });

  it.each(cases)('fixtures: $name - patch 적용 후 DOM이 after와 같다', ({ before, after }) => {
    const oldV = parse(before);
    const newV = parse(after);
    const { container, after: root } = apply(oldV, newV);
    expect(domToVdom(root)).toEqual(newV);
    expect(container.firstChild).toBe(root);
  });
});
