// @vitest-environment jsdom
// Phase 1 단위 테스트: Virtual DOM 변환 · Diff · Patch · State History
import { describe, it, expect } from 'vitest';
import { h, domToVNode, removeBlankNodes, createDOM, diff, applyPatches, StateHistory } from '../src/mini-react.js';

// ── 도우미 ──
function parse(html) {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}
function mountOf(vnode) {
  const mount = document.createElement('div');
  mount.appendChild(createDOM(vnode));
  return mount;
}
// oldV 를 그린 뒤 newV 로 패치하고 결과 DOM 을 돌려줍니다.
function patchBetween(oldV, newV) {
  const mount = mountOf(oldV);
  const touched = applyPatches(mount, diff(oldV, newV));
  return { mount, touched };
}
// 결과가 "newV 를 바로 그린 것" 과 같은지
function expectSameAsFresh(oldV, newV) {
  const { mount } = patchBetween(oldV, newV);
  expect(mount.innerHTML).toBe(mountOf(newV).innerHTML);
}
const li = (key, text = key) => h('li', { key }, text);
const ul = (...keys) => h('ul', null, keys.map((k) => li(k)));

describe('1-1 Virtual DOM: h()', () => {
  it('{ type, props, children } 모양을 만든다', () => {
    expect(h('p', { id: 'a' }, '안녕')).toEqual({ type: 'p', props: { id: 'a' }, children: ['안녕'] });
  });
  it('숫자는 글자로, null / undefined / 불리언은 버린다 (0 은 남는다)', () => {
    expect(h('p', null, 0, 7, null, undefined, false, true, '끝').children).toEqual(['0', '7', '끝']);
  });
  it('배열 자식은 펼친다', () => {
    expect(h('ul', null, [h('li'), [h('li')]]).children).toHaveLength(2);
  });
});

describe('1-1 실제 DOM → Virtual DOM: domToVNode', () => {
  it('요소, 속성, 글자를 변환하고 공백 글자와 주석은 버린다', () => {
    const box = parse('<p id="a" class="x">안녕 <b>!</b>\n  <!-- 주석 --> </p>');
    expect(domToVNode(box.firstChild)).toEqual({
      type: 'p',
      props: { id: 'a', class: 'x' },
      children: ['안녕 ', { type: 'b', props: {}, children: ['!'] }],
    });
  });
  it('removeBlankNodes 후에는 VNode 자식 인덱스가 DOM childNodes 인덱스와 같다', () => {
    const box = parse('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
    removeBlankNodes(box);
    const vnode = domToVNode(box.firstChild);
    expect(box.firstChild.childNodes.length).toBe(vnode.children.length);
    expect(box.firstChild.childNodes[1].textContent).toBe('b');
  });
  it('텍스트 노드는 문자열이 된다', () => {
    expect(domToVNode(document.createTextNode('글자'))).toBe('글자');
  });
});

describe('1-2 Virtual DOM → 실제 DOM: createDOM', () => {
  it('요소, 속성, 자식을 만든다', () => {
    expect(mountOf(h('a', { href: '/x' }, '링크', h('b', null, '!'))).innerHTML).toBe('<a href="/x">링크<b>!</b></a>');
  });
  it('key 도 속성으로 남긴다 (DOM → VNode 왕복에서 key 를 잃지 않도록)', () => {
    const mount = mountOf(li('a'));
    expect(mount.firstChild.getAttribute('key')).toBe('a');
    expect(domToVNode(mount.firstChild).props.key).toBe('a');
  });
  it('DOM → VNode → DOM 왕복이 같은 HTML 을 만든다', () => {
    const box = parse('<div class="c"><h1>제목</h1><p>본문 <i>강조</i></p><img src="a.png"></div>');
    expect(mountOf(domToVNode(box.firstChild)).innerHTML).toBe(box.innerHTML);
  });
  it('HTML 글자는 태그로 해석되지 않는다 (XSS 방지)', () => {
    const mount = mountOf(h('p', null, '<img src=x onerror=alert(1)>'));
    expect(mount.querySelector('img')).toBeNull();
  });
});

describe('1-3 Diff: 루트와 글자', () => {
  it('같으면 패치가 없다', () => {
    expect(diff(h('p', { a: 1 }, '글', h('b')), h('p', { a: 1 }, '글', h('b')))).toEqual([]);
  });
  it('글자만 다르면 TEXT 하나 (경로는 옛 트리 기준)', () => {
    expect(diff(h('p', null, 'a'), h('p', null, 'b'))).toEqual([{ op: 'TEXT', path: [0], value: 'b' }]);
  });
  it('루트 타입이 다르면 루트 REPLACE', () => {
    const next = h('section');
    expect(diff(h('div'), next)).toEqual([{ op: 'REPLACE', path: [], value: next }]);
  });
  it('글자 ↔ 요소는 REPLACE', () => {
    expect(diff(h('p', null, '글'), h('p', null, h('b')))).toMatchObject([{ op: 'REPLACE', path: [0] }]);
  });
  it('diff 는 입력 트리를 바꾸지 않는다', () => {
    const a = h('ul', null, [li('a'), li('b')]);
    const b = h('ul', null, [li('b'), li('x')]);
    const before = JSON.stringify([a, b]);
    diff(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

describe('1-3 Diff: 속성', () => {
  it('바뀐/추가된 속성은 set, 없어진 속성은 remove', () => {
    expect(diff(h('a', { href: 'x', title: 't' }), h('a', { href: 'y', id: 'i' }))).toEqual([
      { op: 'PROPS', path: [], set: { href: 'y', id: 'i' }, remove: ['title'] },
    ]);
  });
  it('속성 변화는 자식 경로 안에서도 찾는다', () => {
    expect(diff(h('div', null, h('a', { href: 'x' })), h('div', null, h('a', { href: 'y' })))).toMatchObject([
      { op: 'PROPS', path: [0], set: { href: 'y' } },
    ]);
  });
});

describe('1-3 Diff: 자식 (key 없이 위치로 짝짓기)', () => {
  it('뒤에 자식이 늘면 CHILDREN 계획에 create', () => {
    expect(diff(h('ul', null, h('li', null, 'a')), h('ul', null, h('li', null, 'a'), h('li', null, 'b')))).toEqual([
      { op: 'CHILDREN', path: [], plan: [{ from: 0 }, { create: h('li', null, 'b') }] },
    ]);
  });
  it('뒤 자식이 줄면 REMOVE 하나 (CHILDREN 은 필요 없음)', () => {
    expect(diff(h('ul', null, h('li'), h('li')), h('ul', null, h('li')))).toEqual([{ op: 'REMOVE', path: [1] }]);
  });
  it('자식의 태그가 바뀌면 그 자리에서 REPLACE', () => {
    expect(diff(h('div', null, h('b')), h('div', null, h('i')))).toMatchObject([{ op: 'REPLACE', path: [0] }]);
  });
  it('깊은 곳의 글자 변경은 깊은 경로로 내려간다', () => {
    const a = h('div', null, h('p', null, h('b', null, 'x')));
    const b = h('div', null, h('p', null, h('b', null, 'y')));
    expect(diff(a, b)).toEqual([{ op: 'TEXT', path: [0, 0, 0], value: 'y' }]);
  });
});

describe('1-3 Diff: key 리스트', () => {
  it('앞에 추가하면 create 하나, 나머지는 짝 유지 (REMOVE 없음)', () => {
    const patches = diff(ul('a', 'b'), ul('x', 'a', 'b'));
    expect(patches).toHaveLength(1);
    expect(patches[0].plan.map((p) => ('create' in p ? 'new' : p.from))).toEqual(['new', 0, 1]);
  });
  it('순서가 바뀌면 plan 이 새 순서를 담는다', () => {
    const [c] = diff(ul('a', 'b', 'c'), ul('c', 'a', 'b'));
    expect(c.op).toBe('CHILDREN');
    expect(c.plan.map((p) => p.from)).toEqual([2, 0, 1]);
  });
  it('같은 key 순서면 패치가 없다', () => {
    expect(diff(ul('a', 'b', 'c'), ul('a', 'b', 'c'))).toEqual([]);
  });
  it('가운데 key 가 사라지면 REMOVE 만 (나머지 순서 유지)', () => {
    expect(diff(ul('a', 'b', 'c'), ul('a', 'c'))).toEqual([{ op: 'REMOVE', path: [1] }]);
  });
  it('key 가 같은 항목 안의 글자 변경은 옛 위치 경로로 나온다', () => {
    const patches = diff(ul('a', 'b'), h('ul', null, [li('b', 'B!'), li('a')]));
    expect(patches[0]).toEqual({ op: 'TEXT', path: [1, 0], value: 'B!' });
  });
  it('중복 key 가 있어도 죽지 않는다', () => {
    expect(() => expectSameAsFresh(ul('a', 'a'), ul('a', 'a', 'a'))).not.toThrow();
  });
  it('key 있는 자식과 없는 자식이 섞여도 죽지 않고 결과가 맞다', () => {
    expectSameAsFresh(h('div', null, li('a'), h('p', null, '글')), h('div', null, h('p', null, '글'), li('a'), h('i')));
  });
});

describe('1-4 Patch: 기본 케이스 (결과가 바로 그린 것과 같다)', () => {
  it('글자 변경', () => expectSameAsFresh(h('p', null, 'a'), h('p', null, 'b')));
  it('속성 설정과 제거', () => {
    const { mount } = patchBetween(h('a', { href: 'x', title: 't' }), h('a', { href: 'y' }));
    expect(mount.firstChild.getAttribute('href')).toBe('y');
    expect(mount.firstChild.hasAttribute('title')).toBe(false);
  });
  it('루트 태그 변경', () => expectSameAsFresh(h('div', null, '글'), h('section', { id: 's' }, '글')));
  it('가운데 자식의 태그 변경', () => {
    expectSameAsFresh(h('div', null, h('a'), h('b', null, 'x'), h('c')), h('div', null, h('a'), h('i', null, 'x'), h('c')));
  });
  it('뒤에 추가 / 뒤에서 삭제', () => {
    expectSameAsFresh(h('ul', null, h('li', null, '1')), h('ul', null, h('li', null, '1'), h('li', null, '2'), h('li', null, '3')));
    expectSameAsFresh(h('ul', null, h('li'), h('li'), h('li')), h('ul', null, h('li')));
  });
  it('글자 → 요소, 요소 → 글자', () => {
    expectSameAsFresh(h('p', null, '글', h('b')), h('p', null, h('i'), '글'));
  });
  it('자식을 전부 지우고 다시 채운다', () => {
    expectSameAsFresh(ul('a', 'b'), h('ul'));
    expectSameAsFresh(h('ul'), ul('a', 'b'));
  });
  it('깊은 트리의 여러 곳이 동시에 바뀐다', () => {
    expectSameAsFresh(
      h('div', { id: 'a' }, h('h1', null, '제목'), h('ul', null, h('li', null, '1'), h('li', null, '2')), h('p', null, '끝')),
      h('div', { id: 'b' }, h('h1', null, '새 제목'), h('ul', null, h('li', null, '1')), h('footer', null, '끝'))
    );
  });
});

describe('1-4 Patch: 바뀐 곳만 건드린다', () => {
  it('글자 하나만 바뀌면 건드린 노드는 1개', () => {
    const { touched } = patchBetween(h('div', null, h('p', null, 'a'), h('p', null, 'b')), h('div', null, h('p', null, 'a'), h('p', null, 'B')));
    expect(touched).toHaveLength(1);
    expect(touched[0].textContent).toBe('B');
  });
  it('바뀐 게 없으면 아무것도 건드리지 않는다', () => {
    const v = h('div', null, h('p', null, 'a'));
    expect(patchBetween(v, v).touched).toEqual([]);
  });
  it('바뀌지 않은 형제 DOM 노드는 그 객체 그대로 남는다', () => {
    const oldV = h('div', null, h('p', null, 'a'), h('p', null, 'b'));
    const mount = mountOf(oldV);
    const [p0, p1] = mount.firstChild.childNodes;
    applyPatches(mount, diff(oldV, h('div', null, h('p', null, 'a'), h('p', null, 'B'))));
    expect(mount.firstChild.childNodes[0]).toBe(p0);
    expect(mount.firstChild.childNodes[1]).toBe(p1); // <p> 자체도 그대로, 안의 글자만 바뀜
  });
  it('이벤트 핸들러만 바뀐 PROPS 는 건드린 노드로 세지 않지만 최신 함수로 교체된다', () => {
    const calls = [];
    const oldV = h('button', { onClick: () => calls.push('old') });
    const mount = mountOf(oldV);
    const touched = applyPatches(mount, diff(oldV, h('button', { onClick: () => calls.push('new') })));
    mount.firstChild.click();
    expect(calls).toEqual(['new']);
    expect(touched).toEqual([]);
  });
});

describe('1-4 Patch: key 리스트와 DOM 노드 재사용', () => {
  it('a,b,c → b,c,a : 결과가 맞고 노드는 재사용된다', () => {
    const mount = mountOf(ul('a', 'b', 'c'));
    const [a, b, c] = mount.querySelectorAll('li');
    applyPatches(mount, diff(ul('a', 'b', 'c'), ul('b', 'c', 'a')));
    expect([...mount.querySelectorAll('li')]).toEqual([b, c, a]);
  });
  it('a,b,c,d → d,a,b,c 와 a,c,b,d', () => {
    expectSameAsFresh(ul('a', 'b', 'c', 'd'), ul('d', 'a', 'b', 'c'));
    expectSameAsFresh(ul('a', 'b', 'c', 'd'), ul('a', 'c', 'b', 'd'));
  });
  it('앞에 추가해도 기존 노드는 그대로 남는다', () => {
    const mount = mountOf(ul('a', 'b'));
    const [a, b] = mount.querySelectorAll('li');
    applyPatches(mount, diff(ul('a', 'b'), ul('x', 'a', 'b')));
    const now = [...mount.querySelectorAll('li')];
    expect(now.map((n) => n.textContent)).toEqual(['x', 'a', 'b']);
    expect(now[1]).toBe(a);
    expect(now[2]).toBe(b);
  });
  it('삭제 + 이동 + 추가 + 글자 변경이 한꺼번에', () => {
    const oldV = ul('a', 'b', 'c', 'd');
    const newV = h('ul', null, [li('d'), li('x', '새것'), li('a', 'A!'), li('c')]);
    expectSameAsFresh(oldV, newV);
  });
  it('key 항목의 태그가 바뀌어도 위치가 맞다', () => {
    expectSameAsFresh(
      h('ul', null, [h('li', { key: 'a' }, 'a'), h('li', { key: 'b' }, 'b')]),
      h('ul', null, [h('li', { key: 'b' }, 'b'), h('p', { key: 'a' }, 'a')])
    );
  });
  it('무작위 key 리스트 300개: 항상 새 트리를 바로 그린 것과 같고, 같은 key 의 노드는 재사용된다', () => {
    let seed = 12345;
    const rand = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const pick = () => {
      const keys = [...'abcdefgh'].filter(() => rand(2));
      for (let i = keys.length - 1; i > 0; i--) {
        const j = rand(i + 1);
        [keys[i], keys[j]] = [keys[j], keys[i]];
      }
      return keys;
    };
    for (let n = 0; n < 300; n++) {
      const [oldKeys, newKeys] = [pick(), pick()];
      const oldV = ul(...oldKeys);
      const mount = mountOf(oldV);
      const before = new Map([...mount.querySelectorAll('li')].map((el) => [el.getAttribute('key'), el]));
      applyPatches(mount, diff(oldV, ul(...newKeys)));
      expect(mount.innerHTML, `${oldKeys} → ${newKeys}`).toBe(mountOf(ul(...newKeys)).innerHTML);
      for (const el of mount.querySelectorAll('li')) {
        const old = before.get(el.getAttribute('key'));
        if (old) expect(el).toBe(old);
      }
    }
  });
});

describe('1-5 StateHistory', () => {
  const v = (t) => h('p', null, t);
  it('push 하면 커서가 끝으로 가고, back / forward 로 오간다', () => {
    const history = new StateHistory(v('a'));
    history.push(v('b'));
    history.push(v('c'));
    expect(history.back()).toEqual(v('b'));
    expect(history.back()).toEqual(v('a'));
    expect(history.forward()).toEqual(v('b'));
  });
  it('중간에서 저장하면 앞쪽 기록을 버린다', () => {
    const history = new StateHistory(v('a'));
    history.push(v('b'));
    history.push(v('c'));
    history.back();
    history.push(v('x'));
    expect(history.items).toEqual([v('a'), v('b'), v('x')]);
    expect(history.forward()).toEqual(v('x')); // 더 갈 곳이 없음
  });
  it('맨 앞에서 back, 맨 뒤에서 forward 는 아무 일도 없다', () => {
    const history = new StateHistory(v('a'));
    expect(history.back()).toEqual(v('a'));
    expect(history.forward()).toEqual(v('a'));
    expect(history.cursor).toBe(0);
  });
  it('저장할 때와 꺼낼 때 복사하므로 나중에 원본을 고쳐도 기록은 그대로', () => {
    const src = v('a');
    const history = new StateHistory(src);
    src.children[0] = '바뀜';
    history.current().children[0] = '또 바뀜';
    expect(history.current()).toEqual(v('a'));
  });
});
