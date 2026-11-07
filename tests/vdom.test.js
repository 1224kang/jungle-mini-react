import { describe, test, expect } from 'vitest';
import {
  domToVdom,
  containerToVdom,
  htmlToVdom,
  vdomToHtml,
  createDom,
  renderRoot,
  createElement,
  createTextNode,
  createRoot,
} from '../src/lib/index.js';

function containerFrom(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('domToVdom: 실제 DOM → Virtual DOM', () => {
  test('요소의 태그, 속성, 자식을 변환한다', () => {
    const el = containerFrom('<p class="intro" data-id="1">안녕 <b>세상</b></p>').firstChild;
    expect(domToVdom(el)).toEqual(
      createElement('p', { class: 'intro', 'data-id': '1' }, [
        createTextNode('안녕 '),
        createElement('b', {}, [createTextNode('세상')]),
      ]),
    );
  });

  test('태그 이름은 소문자로 저장한다', () => {
    const el = containerFrom('<DIV></DIV>').firstChild;
    expect(domToVdom(el).type).toBe('div');
  });

  test('주석과 script는 무시한다', () => {
    const root = containerToVdom(containerFrom('<!-- 주석 --><p>a</p><script>alert(1)</script>'));
    expect(root.children).toEqual([createElement('p', {}, [createTextNode('a')])]);
  });

  test('줄바꿈이 포함된 공백(들여쓰기)은 무시한다', () => {
    const root = containerToVdom(containerFrom('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>'));
    expect(root.children[0].children).toHaveLength(2);
  });

  test('줄바꿈 없는 공백은 화면에 보이므로 유지한다', () => {
    const root = containerToVdom(containerFrom('<b>a</b> <i>b</i>'));
    expect(root.children).toHaveLength(3);
    expect(root.children[1]).toEqual(createTextNode(' '));
  });

  test('pre 안의 공백은 줄바꿈이 있어도 유지한다', () => {
    const root = containerToVdom(containerFrom('<pre><b>a</b>\n  <b>b</b></pre>'));
    expect(root.children[0].children).toHaveLength(3);
  });

  test('빈 영역은 자식이 없는 루트가 된다', () => {
    expect(containerToVdom(containerFrom(''))).toEqual(createRoot([]));
  });
});

describe('htmlToVdom', () => {
  test('HTML 문자열을 루트 VNode로 변환한다', () => {
    expect(htmlToVdom('<h1>제목</h1>텍스트')).toEqual(
      createRoot([createElement('h1', {}, [createTextNode('제목')]), createTextNode('텍스트')]),
    );
  });
});

describe('createDom / renderRoot: Virtual DOM → 실제 DOM', () => {
  test('VNode로 같은 구조의 DOM을 만든다', () => {
    const vnode = createElement('a', { href: '/x', class: 'link' }, [createTextNode('이동')]);
    const el = createDom(vnode);
    expect(el.outerHTML).toBe('<a href="/x" class="link">이동</a>');
  });

  test('renderRoot는 container의 내용을 VNode 내용으로 교체한다', () => {
    const container = containerFrom('<span>이전</span>');
    renderRoot(container, htmlToVdom('<p>새 내용</p>'));
    expect(container.innerHTML).toBe('<p>새 내용</p>');
  });

  test('변환 → 렌더링 → 다시 변환해도 같은 VNode가 나온다', () => {
    const vdom = htmlToVdom('<div id="a"><p>x <b>y</b></p><input type="text" disabled></div>');
    const container = document.createElement('div');
    renderRoot(container, vdom);
    expect(containerToVdom(container)).toEqual(vdom);
  });
});

describe('vdomToHtml', () => {
  test('자식이 모두 요소이면 들여쓰기한다', () => {
    const vdom = htmlToVdom('<ul><li>a</li><li>b</li></ul>');
    expect(vdomToHtml(vdom)).toBe('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
  });

  test('텍스트가 섞이면 내용을 보존하기 위해 한 줄로 쓴다', () => {
    const vdom = htmlToVdom('<p>안녕 <b>세상</b>!</p>');
    expect(vdomToHtml(vdom)).toBe('<p>안녕 <b>세상</b>!</p>');
  });

  test('특수 문자를 이스케이프한다', () => {
    const vdom = createRoot([createElement('p', { title: 'a"b' }, [createTextNode('1 < 2 & 3')])]);
    expect(vdomToHtml(vdom)).toBe('<p title="a&quot;b">1 &lt; 2 &amp; 3</p>');
  });

  test('닫는 태그가 없는 요소와 빈 속성을 처리한다', () => {
    const vdom = htmlToVdom('<input type="checkbox" checked><br>');
    expect(vdomToHtml(vdom)).toBe('<input type="checkbox" checked>\n<br>');
  });

  test.each([
    '<section class="card"><h3>제목</h3><p>문단 <strong>강조</strong></p><ul><li>a</li><li>b</li></ul></section>',
    '<pre>  공백\n  유지</pre>',
    '<b>a</b> <i>b</i>',
    '텍스트만',
    '',
  ])('htmlToVdom(vdomToHtml(v))는 원래 v와 같다: %s', (html) => {
    const vdom = htmlToVdom(html);
    expect(htmlToVdom(vdomToHtml(vdom))).toEqual(vdom);
  });
});
