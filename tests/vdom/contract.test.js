// docs/contracts.md 4장 검증 기준: 모든 fixture HTML에 대해 생성 일치와 왕복 불변을 검사한다.
// 통합 테스트이므로 공개 인터페이스(src/lib/index.js)만 사용한다.
import { describe, it, expect } from 'vitest';
import { h, domToVdom, render } from '../../src/lib/index.js';
import { cases } from '../../fixtures/cases.js';

function parse(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  if (div.children.length !== 1) throw new Error(`fixture는 단일 루트 요소여야 함: ${html}`);
  return div.firstElementChild;
}

/**
 * fixture HTML → 같은 구조를 h()로 직접 쓴 것.
 * 공백 규칙(②③)은 domToVdom 전용이므로, h() 쪽에는 정규화된 뒤의 문자열을 직접 넣는다.
 * (HTML 파서는 <pre> 바로 뒤의 첫 줄바꿈을 버린다)
 */
const expected = {
  '<div><p>안녕</p></div>': () => h('div', null, h('p', null, '안녕')),
  '<div><p>잘가</p></div>': () => h('div', null, h('p', null, '잘가')),
  '<div><p>글</p></div>': () => h('div', null, h('p', null, '글')),
  '<div><p class="on">글</p></div>': () => h('div', null, h('p', { class: 'on' }, '글')),
  '<div><p class="off">글</p></div>': () => h('div', null, h('p', { class: 'off' }, '글')),
  '<div><p class="on" id="a">글</p></div>': () => h('div', null, h('p', { class: 'on', id: 'a' }, '글')),
  '<div><h1>글</h1></div>': () => h('div', null, h('h1', null, '글')),
  '<ul><li>1</li></ul>': () => h('ul', null, h('li', null, '1')),
  '<ul><li>1</li><li>2</li></ul>': () => h('ul', null, h('li', null, 1), h('li', null, 2)),
  '<div><section><ul><li>a</li><li>b</li></ul></section></div>': () =>
    h('div', null, h('section', null, h('ul', null, h('li', null, 'a'), h('li', null, 'b')))),
  '<div><section><ul><li>a</li><li class="x">c</li></ul></section></div>': () =>
    h('div', null, h('section', null, h('ul', null, h('li', null, 'a'), h('li', { class: 'x' }, 'c')))),
  '<div><p class="a">같음</p></div>': () => h('div', null, h('p', { class: 'a' }, '같음')),

  // 들여쓰기된 목록 (②: 줄바꿈 공백 버림)
  '<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>': () => h('ul', null, h('li', null, 'A'), h('li', null, 'B')),
  '<ul>\n  <li>A</li>\n  <li>B</li>\n  <li>C</li>\n</ul>': () =>
    h('ul', null, ['A', 'B', 'C'].map((s) => h('li', null, s))),

  // 같은 줄 공백 (②: 남김)
  '<p><span>a</span> <span>b</span></p>': () => h('p', null, h('span', null, 'a'), ' ', h('span', null, 'b')),
  '<p><span>a</span> <span>c</span></p>': () => h('p', null, h('span', null, 'a'), ' ', h('span', null, 'c')),

  // 주석이 낀 텍스트 (①④)
  '<p>a<!-- 주석 -->b</p>': () => h('p', null, 'a', 'b'),
  '<p>a<!-- 주석 -->c</p>': () => h('p', null, 'ac'),

  // pre 안의 들여쓰기 (③)
  '<pre>\n  line1\n    line2\n</pre>': () => h('pre', null, '  line1\n    line2\n'),
  '<pre>\n  line1\n    line3\n</pre>': () => h('pre', null, '  line1\n    line3\n'),

  // 문법 강조 코드 블록 (③ 조상까지 확인)
  '<pre><code><span>if</span>\n  <span>run</span>()</code></pre>': () =>
    h('pre', null, h('code', null, h('span', null, 'if'), '\n  ', h('span', null, 'run'), '()')),
  '<pre><code><span>if</span>\n  <span>stop</span>()</code></pre>': () =>
    h('pre', null, h('code', null, h('span', null, 'if'), '\n  ', h('span', null, 'stop'), '()')),

  // 불리언 속성 (1.2)
  '<div><input type="checkbox" disabled><button disabled>확인</button></div>': () =>
    h('div', null, h('input', { type: 'checkbox', disabled: true }), h('button', { disabled: true }, '확인')),
  '<div><input type="checkbox"><button>확인</button></div>': () =>
    h('div', null, h('input', { type: 'checkbox', disabled: false }), h('button', null, '확인')),

  // data-key가 있는 목록 (1.3)
  '<ul><li data-key="a">A</li><li data-key="b">B</li></ul>': () =>
    h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B')),
  '<ul><li data-key="b">B</li><li data-key="a">A</li></ul>': () =>
    h('ul', null, h('li', { key: 'b' }, 'B'), h('li', { key: 'a' }, 'A')),

  // 자식이 없는 요소
  '<div><br><input type="text"></div>': () => h('div', null, h('br', null), h('input', { type: 'text' })),
  '<div><input type="text"><br></div>': () => h('div', null, h('input', { type: 'text' }), h('br')),

  // style 속성 (1.2)
  '<p style="color: red; margin: 0">글</p>': () => h('p', { style: 'color: red; margin: 0' }, '글'),
  '<p style="color: blue">글</p>': () => h('p', { style: 'color: blue' }, '글'),

  // 처리 순서 ① → ④ → ②
  '<p>a<!-- -->\n <!-- -->b</p>': () => h('p', null, 'a', '\n ', 'b'),
  '<p>a<!-- -->\n <!-- -->c</p>': () => h('p', null, 'a\n c'),
  '<p>a<!-- c -->\n b</p>': () => h('p', null, 'a', '\n b'),
  '<p>a<!-- c -->\n c</p>': () => h('p', null, 'a\n c'),
  '<div><span>x</span><!-- -->\n  <!-- --><span>y</span></div>': () =>
    h('div', null, h('span', null, 'x'), h('span', null, 'y')),
  '<div><span>x</span><!-- -->\n  <!-- --><span>z</span></div>': () =>
    h('div', null, h('span', null, 'x'), h('span', null, 'z')),
};

const htmls = cases.flatMap(({ name, before, after }) => [
  { label: `${name} (before)`, html: before },
  { label: `${name} (after)`, html: after },
]);

describe('4장 검증 기준 (fixtures/cases.js 전체)', () => {
  describe('(1) 생성 일치: h() 결과 === domToVdom() 결과', () => {
    for (const { label, html } of htmls) {
      it(label, () => {
        expect(expected[html], `contract.test.js에 h() 대응이 없음: ${JSON.stringify(html)}`).toBeTypeOf(
          'function',
        );
        expect(domToVdom(parse(html))).toEqual(expected[html]());
      });
    }
  });

  describe('(2) 왕복 불변: domToVdom(render(v)) === v', () => {
    for (const { label, html } of htmls) {
      it(label, () => {
        const v = domToVdom(parse(html));
        expect(domToVdom(render(v))).toEqual(v);
      });
    }
  });

  describe('(2) 왕복 불변: h()로 만든 v도 성립', () => {
    for (const { label, html } of htmls) {
      if (!expected[html]) continue;
      it(label, () => {
        const v = expected[html]();
        expect(domToVdom(render(v))).toEqual(v);
      });
    }
  });

  it('문서 4장 예시: domToVdom(parse(\'<p class="a">hi</p>\')) === h("p", { class: "a" }, "hi")', () => {
    expect(domToVdom(parse('<p class="a">hi</p>'))).toEqual(h('p', { class: 'a' }, 'hi'));
  });
});
