// @vitest-environment jsdom
// dom/props.js: 이벤트 핸들러, value/checked, boolean, style, className 처리 (createDOM + PROPS 패치 경로)
import { describe, it, expect, vi } from 'vitest';
import { h } from '../src/lib/vdom/vnode.js';
import { createDOM } from '../src/lib/dom/create.js';
import { diff } from '../src/lib/reconcile/diff.js';
import { applyPatches } from '../src/lib/reconcile/patch.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountOf(vnode) {
  const mount = document.createElement('div');
  mount.appendChild(createDOM(vnode));
  return mount;
}

function patchTo(mount, oldV, newV) {
  return applyPatches(mount, diff(oldV, newV));
}

describe('이벤트 핸들러', () => {
  it('onClick 은 click 이벤트에 연결되고 속성으로는 남지 않는다', () => {
    const fn = vi.fn();
    const m = mountOf(h('button', { onClick: fn }, '누르기'));
    m.firstChild.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(m.firstChild.hasAttribute('onclick')).toBe(false);
    expect(m.firstChild.hasAttribute('onClick')).toBe(false);
  });

  it('리렌더로 핸들러가 바뀌면 최신 함수만 불리고 addEventListener 는 한 번만 한다', () => {
    const a = vi.fn();
    const b = vi.fn();
    const m = mountOf(h('button', { onClick: a }));
    const spy = vi.spyOn(m.firstChild, 'addEventListener');
    patchTo(m, h('button', { onClick: a }), h('button', { onClick: b }));
    m.firstChild.click();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('핸들러만 바뀐 패치는 touched(깜빡임 대상)에 넣지 않는다', () => {
    const m = mountOf(h('button', { onClick: () => {} }));
    const { touched } = patchTo(m, h('button', { onClick: () => {} }), h('button', { onClick: () => {} }));
    expect(touched.size).toBe(0);
  });

  it('핸들러를 지우면(undefined / 키 삭제) 더 이상 불리지 않는다', () => {
    const fn = vi.fn();
    const m = mountOf(h('button', { onClick: fn }));
    patchTo(m, h('button', { onClick: fn }), h('button', {}));
    m.firstChild.click();
    expect(fn).not.toHaveBeenCalled();
  });

  it('소문자 onclick 도 함수면 핸들러로 취급한다', () => {
    const fn = vi.fn();
    const m = mountOf(h('button', { onclick: fn }));
    m.firstChild.click();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onChange 는 텍스트 입력에서는 input 이벤트, 체크박스에서는 change 이벤트', () => {
    const onText = vi.fn();
    const onCheck = vi.fn();
    const m = mountOf(h('div', {}, h('input', { onChange: onText }), h('input', { type: 'checkbox', onChange: onCheck })));
    const [text, check] = m.querySelectorAll('input');
    text.dispatchEvent(new Event('input', { bubbles: true }));
    check.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('같은 이벤트에 걸린 핸들러 두 개(onChange + onInput)가 모두 불린다', () => {
    const a = vi.fn();
    const b = vi.fn();
    const m = mountOf(h('input', { onChange: a, onInput: b }));
    m.firstChild.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('value / checked (제어 컴포넌트)', () => {
  it('value 는 DOM 프로퍼티로 들어간다', () => {
    const m = mountOf(h('input', { value: '안녕' }));
    expect(m.firstChild.value).toBe('안녕');
  });

  it('value 패치는 프로퍼티를 바꾼다 (사용자가 친 뒤에도 반영)', () => {
    const m = mountOf(h('input', { value: 'a' }));
    m.firstChild.value = 'a사용자가침';
    patchTo(m, h('input', { value: 'a' }), h('input', { value: 'b' }));
    expect(m.firstChild.value).toBe('b');
  });

  it('핸들러가 상태를 안 바꾸면 사용자가 친 글자를 되돌린다', async () => {
    const m = mountOf(h('input', { value: '고정', onInput: () => {} }));
    m.firstChild.value = '바뀜';
    m.firstChild.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(m.firstChild.value).toBe('고정');
  });

  it('checked 는 프로퍼티로, 숫자 value 는 문자열로', () => {
    const m = mountOf(h('div', {}, h('input', { type: 'checkbox', checked: true }), h('input', { value: 3 })));
    const [c, n] = m.querySelectorAll('input');
    expect(c.checked).toBe(true);
    expect(n.value).toBe('3');
  });

  it('<select value> 는 option 이 만들어진 뒤에 선택된다', () => {
    const v = h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B'));
    const m = mountOf(v);
    expect(m.firstChild.value).toBe('b');
  });

  it('value 와 같은 패치에서 option 이 새로 생겨도 select 값이 맞춰진다', () => {
    const oldV = h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'));
    const newV = h('select', { value: 'c' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'c' }, 'C'));
    const m = mountOf(oldV);
    patchTo(m, oldV, newV);
    expect(m.firstChild.value).toBe('c');
  });
});

describe('boolean / className / style', () => {
  it('disabled true → 속성 있음, false → 속성 없음 ("false" 글자가 남지 않는다)', () => {
    const m = mountOf(h('button', { disabled: true }));
    expect(m.firstChild.hasAttribute('disabled')).toBe(true);
    patchTo(m, h('button', { disabled: true }), h('button', { disabled: false }));
    expect(m.firstChild.hasAttribute('disabled')).toBe(false);
  });

  it('null / undefined 속성은 만들지 않는다', () => {
    const m = mountOf(h('div', { title: null, id: undefined }));
    expect(m.firstChild.attributes.length).toBe(0);
  });

  it('className → class, htmlFor → for', () => {
    const m = mountOf(h('label', { className: 'a b', htmlFor: 'x' }));
    expect(m.firstChild.getAttribute('class')).toBe('a b');
    expect(m.firstChild.getAttribute('for')).toBe('x');
  });

  it('aria-* / data-* 는 boolean 도 글자로 남긴다', () => {
    const m = mountOf(h('div', { 'aria-pressed': false, 'data-on': true }));
    expect(m.firstChild.getAttribute('aria-pressed')).toBe('false');
    expect(m.firstChild.getAttribute('data-on')).toBe('true');
  });

  it('style 객체는 cssText 로 바뀌고, 내용이 같으면 패치가 없다', () => {
    const a = h('div', { style: { backgroundColor: 'red', opacity: 0.5 } });
    const m = mountOf(a);
    expect(m.firstChild.style.backgroundColor).toBe('red');
    expect(m.firstChild.style.opacity).toBe('0.5');
    expect(diff(a, h('div', { style: { backgroundColor: 'red', opacity: 0.5 } }))).toEqual([]);
    patchTo(m, a, h('div', { style: { backgroundColor: 'blue' } }));
    expect(m.firstChild.style.backgroundColor).toBe('blue');
    expect(m.firstChild.style.opacity).toBe('');
  });

  it('속성 제거 패치 (class 를 지움)', () => {
    const m = mountOf(h('p', { className: 'x' }));
    patchTo(m, h('p', { className: 'x' }), h('p', {}));
    expect(m.firstChild.hasAttribute('class')).toBe(false);
  });
});

describe('describePatches: 이벤트 핸들러 표시', () => {
  it('핸들러만 바뀐 PROPS 는 HANDLER 로, 섞여 있으면 PROPS 로 표시한다', async () => {
    const { describePatches } = await import('../src/lib/reconcile/describe.js');
    const a = h('button', { onClick: () => {}, title: 'a' });
    const onlyHandler = describePatches(a, diff(a, h('button', { onClick: () => {}, title: 'a' })));
    expect(onlyHandler).toHaveLength(1);
    expect(onlyHandler[0].op).toBe('HANDLER');
    expect(onlyHandler[0].text).toContain('onClick=ƒ');
    const mixed = describePatches(a, diff(a, h('button', { onClick: () => {}, title: 'b' })));
    expect(mixed[0].op).toBe('PROPS');
  });
});
