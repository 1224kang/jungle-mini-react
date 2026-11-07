import { describe, it, expect } from 'vitest';
import { render } from '../../src/lib/dom/render.js';
import { h } from '../../src/lib/vdom/h.js';

// 2.4 render(vnode)
describe('render', () => {
  it('2.4 텍스트 VNode → createTextNode', () => {
    const node = render({ type: '#text', value: 'hi' });
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.data).toBe('hi');
  });

  it('2.4 텍스트 값은 HTML로 해석하지 않는다', () => {
    const node = render(h('p', null, '<b>x</b>'));
    expect(node.childNodes).toHaveLength(1);
    expect(node.firstChild.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe('<b>x</b>');
  });

  it('2.4 요소 VNode → createElement', () => {
    const node = render(h('section', null));
    expect(node.nodeType).toBe(Node.ELEMENT_NODE);
    expect(node.localName).toBe('section');
    expect(node.childNodes).toHaveLength(0);
  });

  it('2.4 속성 → getAttributes 후 setAttribute (children은 속성이 아님)', () => {
    const node = render(h('label', { class: 'a', for: 'x', 'data-id': '1', 'aria-label': '닫기' }));
    expect(node.getAttributeNames().sort()).toEqual(['aria-label', 'class', 'data-id', 'for']);
    expect(node.getAttribute('for')).toBe('x');
    expect(node.hasAttribute('children')).toBe(false);
  });

  it('2.4 1.2 불리언 속성 "" → 값 없는 속성', () => {
    expect(render(h('button', { disabled: true })).outerHTML).toBe('<button disabled=""></button>');
  });

  it('2.4 1.2 style, 이벤트 속성은 문자열 그대로 setAttribute', () => {
    const node = render(h('p', { style: 'color: red; margin: 0', onclick: 'alert(1)' }));
    expect(node.getAttribute('style')).toBe('color: red; margin: 0');
    expect(node.getAttribute('onclick')).toBe('alert(1)');
  });

  it('2.4 1.3 key → data-key 속성', () => {
    expect(render(h('li', { key: 'a' })).getAttribute('data-key')).toBe('a');
  });

  it('2.4 1.3 key가 null이면 data-key를 쓰지 않는다', () => {
    expect(render(h('li', null)).hasAttribute('data-key')).toBe(false);
  });

  it('2.4 자식 → 재귀 후 appendChild (순서 유지)', () => {
    const node = render(h('ul', null, h('li', { key: '1' }, 'A'), ' ', h('li', null, h('b', null, 'B'))));
    expect(node.outerHTML).toBe('<ul><li data-key="1">A</li> <li><b>B</b></li></ul>');
  });

  it('2.4 공백 텍스트도 그대로 만든다 (pre)', () => {
    expect(render(h('pre', null, '\n  a\n')).firstChild.data).toBe('\n  a\n');
  });

  it('2.4 render는 넘겨받은 VNode를 수정하지 않는다', () => {
    const v = h('div', { class: 'a', key: 'k' }, 'x', h('b', null));
    const copy = structuredClone(v);
    render(v);
    expect(v).toEqual(copy);
  });

  it('2.4 매번 새 노드를 만든다', () => {
    const v = h('p', null, 'x');
    expect(render(v)).not.toBe(render(v));
  });
});
