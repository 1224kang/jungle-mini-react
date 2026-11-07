// @vitest-environment jsdom
// VNode 생성 · 실제 DOM ↔ VNode · HTML 문자열 · VNode → DOM 테스트
import { describe, it, expect } from 'vitest';
import { h, countNodes } from '../src/lib/vdom/vnode.js';
import { parseHTML, vnodeToHTML, prettyHTML, domToVNode, stripBlankNodes } from '../src/lib/vdom/convert.js';
import { createDOM } from '../src/lib/dom/create.js';

describe('h', () => {
  it('숫자는 문자열로, null / false 는 버린다', () => {
    expect(h('p', null, 1, null, 'a', false)).toEqual({
      type: 'p',
      props: {},
      children: ['1', 'a'],
    });
  });

  it('배열 자식은 펼친다', () => {
    expect(h('ul', {}, ['a', 'b'], 'c').children).toEqual(['a', 'b', 'c']);
  });
});

describe('실제 DOM → VNode (parseHTML)', () => {
  it('요소, 속성, 텍스트를 변환하고 공백 텍스트는 버린다', () => {
    const v = parseHTML('<ul class="l">\n  <li>사과</li>\n</ul>');
    expect(v).toEqual({
      type: 'ul',
      props: { class: 'l' },
      children: [{ type: 'li', props: {}, children: ['사과'] }],
    });
  });
});

describe('VNode → HTML 문자열 → VNode 왕복', () => {
  it('직렬화 후 다시 읽으면 같은 VNode 가 된다', () => {
    const v = h('div', { id: 'x' }, h('p', {}, 'hi'), h('img', { src: 'a.png' }));
    expect(parseHTML(vnodeToHTML(v))).toEqual(v);
  });

  it('특수문자를 이스케이프한다', () => {
    expect(vnodeToHTML(h('p', {}, '<b>&'))).toBe('<p>&lt;b&gt;&amp;</p>');
  });
});

describe('VNode → 실제 DOM (createDOM)', () => {
  it('outerHTML 이 기대한 HTML 과 같다', () => {
    const v = h('div', { id: 'x' }, h('span', {}, 'hi'));
    expect(createDOM(v).outerHTML).toBe('<div id="x"><span>hi</span></div>');
  });

  it('key 도 속성으로 남긴다 (DOM 왕복 때 키를 잃지 않기 위해)', () => {
    const el = createDOM(h('li', { key: 'a' }, 'x'));
    expect(el.getAttribute('key')).toBe('a');
    expect(domToVNode(el).props.key).toBe('a');
  });

  it('텍스트 VNode 는 텍스트 노드가 된다', () => {
    expect(createDOM('안녕').nodeType).toBe(3);
  });
});

describe('로드 단계: 실제 영역 DOM → VNode', () => {
  const sample = `
    <article class="card">
      <h2>장보기</h2>
      <!-- 주석은 버린다 -->
      <ul><li key="a">사과</li><li key="b">바나나</li></ul>
    </article>`;

  it('stripBlankNodes 후 VNode 자식 인덱스가 DOM childNodes 인덱스와 같다', () => {
    const box = document.createElement('div');
    box.innerHTML = sample;
    stripBlankNodes(box);
    const root = box.firstElementChild;
    const v = domToVNode(root);
    expect(v.children.length).toBe(root.childNodes.length);
    expect(v.children.map((c) => c.type)).toEqual(['h2', 'ul']);
    expect(root.childNodes[1].nodeName).toBe('UL');
  });

  it('countNodes 는 요소와 텍스트를 모두 센다', () => {
    expect(countNodes(h('ul', {}, h('li', {}, 'a'), h('li', {}, 'b')))).toBe(5);
  });

  it('다양한 태그(링크, 버튼, 굵게, 목록)를 변환한다', () => {
    const v = parseHTML('<div><a href="x">l</a><button type="button">b</button><b>t</b></div>');
    expect(v.children.map((c) => c.type)).toEqual(['a', 'button', 'b']);
    expect(v.children[0].props).toEqual({ href: 'x' });
  });
});

describe('prettyHTML', () => {
  it('요소만 자식이면 줄바꿈, 텍스트가 섞이면 한 줄, 다시 읽으면 같은 VNode', () => {
    const v = h('div', { id: 'r' }, h('p', {}, '오늘: ', h('b', {}, '3')), h('ul', {}, h('li', { key: 'a' }, 'x')));
    const html = prettyHTML(v);
    expect(html).toContain('\n');
    expect(html).toContain('<p>오늘: <b>3</b></p>');
    expect(parseHTML(html)).toEqual(v);
  });
});
