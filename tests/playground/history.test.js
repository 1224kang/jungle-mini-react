import { describe, it, expect } from 'vitest';
import { createHistory, snapshot, assertPlainVNode } from '../../src/playground/verify/history.js';
import { h, diff, render, patch } from '../../src/lib/index.js';

const v = (text) => h('div', null, h('p', { class: 'a' }, text));

describe('verify 페이지 히스토리', () => {
  it('처음에는 history[0] 하나만 있고 양쪽 이동이 불가능하다', () => {
    const hist = createHistory(v('0'));
    expect(hist.length).toBe(1);
    expect(hist.index).toBe(0);
    expect(hist.canBack).toBe(false);
    expect(hist.canForward).toBe(false);
    expect(hist.current()).toEqual(v('0'));
  });

  it('push하면 마지막에 저장되고 현재 위치가 그곳으로 이동한다', () => {
    const hist = createHistory(v('0'));
    hist.push(v('1'));
    hist.push(v('2'));
    expect(hist.length).toBe(3);
    expect(hist.index).toBe(2);
    expect(hist.current()).toEqual(v('2'));
    expect(hist.canBack).toBe(true);
    expect(hist.canForward).toBe(false);
  });

  it('뒤로/앞으로 이동한다', () => {
    const hist = createHistory(v('0'));
    hist.push(v('1'));
    hist.push(v('2'));
    expect(hist.back()).toEqual(v('1'));
    expect(hist.index).toBe(1);
    expect(hist.canBack).toBe(true);
    expect(hist.canForward).toBe(true);
    expect(hist.back()).toEqual(v('0'));
    expect(hist.forward()).toEqual(v('1'));
    expect(hist.forward()).toEqual(v('2'));
  });

  it('맨 앞에서 뒤로, 맨 뒤에서 앞으로 가면 null을 돌려주고 위치가 그대로다', () => {
    const hist = createHistory(v('0'));
    hist.push(v('1'));
    expect(hist.forward()).toBeNull();
    expect(hist.index).toBe(1);
    hist.back();
    expect(hist.back()).toBeNull();
    expect(hist.index).toBe(0);
    expect(hist.peek(-1)).toBeNull();
    expect(hist.peek(1)).toEqual(v('1'));
  });

  it('중간 위치에서 push하면 그 뒤 기록을 버린다', () => {
    const hist = createHistory(v('0'));
    hist.push(v('1'));
    hist.push(v('2'));
    hist.push(v('3'));
    hist.back();
    hist.back(); // index 1
    hist.push(v('new'));
    expect(hist.length).toBe(3);
    expect(hist.index).toBe(2);
    expect(hist.at(0)).toEqual(v('0'));
    expect(hist.at(1)).toEqual(v('1'));
    expect(hist.at(2)).toEqual(v('new'));
    expect(hist.canForward).toBe(false);
  });

  it('스냅샷은 복사본이며 얼려 있어서 원본·스냅샷 어느 쪽을 바꿔도 서로 영향이 없다', () => {
    const original = v('0');
    const hist = createHistory(original);
    original.props.children[0].props.class = 'changed';
    expect(hist.current().props.children[0].props.class).toBe('a');
    expect(Object.isFrozen(hist.current())).toBe(true);
    expect(Object.isFrozen(hist.current().props.children)).toBe(true);
    expect(() => { hist.current().props.children.push(v('x')); }).toThrow(TypeError);
  });

  it('diff/patch를 실행해도 저장된 이전 스냅샷이 바뀌지 않는다', () => {
    const hist = createHistory(h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B')));
    const before = JSON.stringify(hist.at(0));
    const container = document.createElement('div');
    let root = render(hist.current());
    container.appendChild(root);
    hist.push(h('ul', null, h('li', { key: 'b', class: 'x' }, 'B2'), h('li', { key: 'c' }, 'C')));
    root = patch(root, diff(hist.at(0), hist.at(1)));
    hist.back();
    root = patch(root, diff(hist.at(1), hist.at(0)));
    expect(JSON.stringify(hist.at(0))).toBe(before);
  });

  it('함수(이벤트 핸들러)나 DOM 노드가 들어 있는 VNode는 저장을 거부한다', () => {
    expect(() => snapshot(h('button', { onclick: () => {} }))).toThrow(/props\.onclick/);
    const withDom = { type: 'div', key: null, props: { children: [document.createElement('p')] } };
    expect(() => assertPlainVNode(withDom)).toThrow(/children\[0\]/);
    expect(() => createHistory(withDom)).toThrow(TypeError);
  });
});
