// @vitest-environment jsdom
// Patch 테스트: 패치를 적용한 결과가 "새 VNode 를 바로 그린 것"과 같은지 확인합니다.
import { describe, it, expect } from 'vitest';
import { h } from '../src/lib/vdom/vnode.js';
import { createDOM } from '../src/lib/dom/create.js';
import { diff } from '../src/lib/reconcile/diff.js';
import { applyPatches } from '../src/lib/reconcile/patch.js';

function mountOf(v) {
  const m = document.createElement('div');
  m.appendChild(createDOM(v));
  return m;
}

// 옛 VNode 로 만든 DOM 에 패치를 적용하고, 결과 mount 를 돌려줍니다.
function run(oldV, newV) {
  const m = mountOf(oldV);
  applyPatches(m, diff(oldV, newV));
  return m;
}

function expectSameAsFresh(oldV, newV) {
  const m = run(oldV, newV);
  expect(m.innerHTML).toBe(createDOM(newV).outerHTML);
  return m;
}

describe('패치 적용: 기본 케이스', () => {
  it('텍스트 변경', () => {
    expectSameAsFresh(h('p', {}, 'hi'), h('p', {}, 'hello'));
  });

  it('속성 설정과 제거', () => {
    expectSameAsFresh(h('p', { class: 'a', id: 'x' }, 't'), h('p', { class: 'b' }, 't'));
  });

  it('루트 타입 변경 (REPLACE)', () => {
    expectSameAsFresh(h('div', {}, 'a'), h('span', {}, 'a'));
  });

  it('중첩 자식의 텍스트 변경', () => {
    expectSameAsFresh(
      h('div', {}, h('p', {}, h('b', {}, 'a'))),
      h('div', {}, h('p', {}, h('b', {}, 'z')))
    );
  });

  it('뒤에 자식 추가와 뒤 자식 제거', () => {
    expectSameAsFresh(h('ul', {}, h('li', {}, 'a')), h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b')));
    expectSameAsFresh(h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b')), h('ul', {}, h('li', {}, 'a')));
  });

  it('위치 리스트에서 가운데 자식 타입이 바뀌면 교체된다', () => {
    expectSameAsFresh(
      h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b'), h('li', {}, 'c')),
      h('ul', {}, h('li', {}, 'a'), h('span', {}, 'b'), h('li', {}, 'c'))
    );
  });
});

describe('패치 적용: touched (일부만 건드렸는지)', () => {
  it('텍스트 하나만 바뀌면 건드린 노드는 1개', () => {
    const old = h('div', {}, h('p', {}, 'a'), h('p', {}, 'b'), h('p', {}, 'c'));
    const m = mountOf(old);
    const { touched } = applyPatches(m, diff(old, h('div', {}, h('p', {}, 'a'), h('p', {}, 'B'), h('p', {}, 'c'))));
    expect(touched.size).toBe(1);
    expect(m.textContent).toBe('aBc');
  });

  it('바뀐 게 없으면 아무것도 건드리지 않는다', () => {
    const v = h('div', {}, h('p', {}, 'a'));
    const m = mountOf(v);
    const first = m.firstChild;
    const { touched } = applyPatches(m, diff(v, v));
    expect(touched.size).toBe(0);
    expect(m.firstChild).toBe(first);
  });

  it('바뀌지 않은 형제 DOM 노드는 그대로 유지된다', () => {
    const old = h('div', {}, h('p', {}, 'a'), h('p', {}, 'b'));
    const m = mountOf(old);
    const keep = m.firstChild.children[0];
    applyPatches(m, diff(old, h('div', {}, h('p', {}, 'a'), h('span', {}, 'b'))));
    expect(m.firstChild.children[0]).toBe(keep);
    expect(m.firstChild.children[1].tagName).toBe('SPAN');
  });
});

describe('패치 적용: 키 리스트와 DOM 노드 재사용', () => {
  const list = (keys) => h('ul', {}, ...keys.map((k) => h('li', { key: k }, 't' + k)));

  it('A,B,C → B,C,A: 결과가 맞고, 이동한 노드는 같은 DOM 객체다', () => {
    const old = list(['A', 'B', 'C']);
    const m = mountOf(old);
    const before = new Map(Array.from(m.firstElementChild.children).map((el) => [el.textContent, el]));

    applyPatches(m, diff(old, list(['B', 'C', 'A'])));

    expect(m.innerHTML).toBe(createDOM(list(['B', 'C', 'A'])).outerHTML);
    const after = Array.from(m.firstElementChild.children);
    expect(after.map((el) => el.textContent)).toEqual(['tB', 'tC', 'tA']);
    for (const el of after) expect(el).toBe(before.get(el.textContent));
  });

  it('A,B,C,D → D,A,B,C 와 A,C,B,D 도 맞게 된다', () => {
    expectSameAsFresh(list(['A', 'B', 'C', 'D']), list(['D', 'A', 'B', 'C']));
    expectSameAsFresh(list(['A', 'B', 'C', 'D']), list(['A', 'C', 'B', 'D']));
  });

  it('키 리스트 앞에 추가해도 기존 노드는 남는다', () => {
    const old = list(['A', 'B']);
    const m = mountOf(old);
    const a = m.firstElementChild.children[0];
    applyPatches(m, diff(old, list(['X', 'A', 'B'])));
    expect(m.innerHTML).toBe(createDOM(list(['X', 'A', 'B'])).outerHTML);
    expect(m.firstElementChild.children[1]).toBe(a);
  });

  it('무작위 키 리스트 300개 조합: 항상 새 VNode 를 바로 그린 것과 같다', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const shuffle = (xs) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const pool = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

    for (let t = 0; t < 300; t++) {
      const oldKeys = shuffle(pool).slice(0, Math.floor(rand() * 9));
      const newKeys = shuffle(pool).slice(0, Math.floor(rand() * 9));
      const old = list(oldKeys);
      const next = list(newKeys);

      const m = mountOf(old);
      const before = new Map(Array.from(m.firstElementChild.children).map((el) => [el.textContent, el]));
      applyPatches(m, diff(old, next));

      expect(m.innerHTML, `case ${t}: ${oldKeys} -> ${newKeys}`).toBe(createDOM(next).outerHTML);
      for (const el of Array.from(m.firstElementChild.children)) {
        const kept = before.get(el.textContent);
        if (kept) expect(el).toBe(kept);
      }
    }
  });
});
