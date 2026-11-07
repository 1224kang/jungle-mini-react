import { describe, it, expect, vi, afterEach } from 'vitest';
import { domToVdom } from '../../src/lib/vdom/domToVdom.js';

const text = (value) => ({ type: '#text', value });
const el = (type, props = {}, children = [], key = null) => ({
  type,
  key,
  props: { ...props, children },
});

/** HTML 문자열을 파싱해 컨테이너 div를 돌려준다. (루트의 바깥 조상이 div가 됨) */
function container(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}
/** HTML 문자열의 첫 번째 루트 요소. */
const parse = (html) => container(html).firstElementChild;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('domToVdom - 1.1 모양', () => {
  it('1.1 요소를 { type, key, props: { children } } 로 변환한다', () => {
    expect(domToVdom(parse('<div class="box"></div>'))).toEqual(el('div', { class: 'box' }));
  });

  it('1.1 type은 소문자 태그 이름이다', () => {
    expect(domToVdom(parse('<DIV></DIV>')).type).toBe('div');
  });

  it('1.1 텍스트 자식은 { type: "#text", value } 로 변환한다 (key, props 없음)', () => {
    const [child] = domToVdom(parse('<p>hi</p>')).props.children;
    expect(child).toStrictEqual({ type: '#text', value: 'hi' });
  });
});

describe('domToVdom - 1.2 props 표', () => {
  it('1.2 이름: HTML 속성 이름 그대로 (class, for, data-id, aria-label)', () => {
    const v = domToVdom(parse('<label class="a" for="x" data-id="1" aria-label="닫기"></label>'));
    expect(v.props).toEqual({ class: 'a', for: 'x', 'data-id': '1', 'aria-label': '닫기', children: [] });
  });

  it('1.2 값: 항상 문자열 (maxlength="10" → "10")', () => {
    expect(domToVdom(parse('<input maxlength="10">')).props.maxlength).toBe('10');
  });

  it('1.2 불리언 속성: 있으면 "", 없으면 키 자체가 없음', () => {
    expect(domToVdom(parse('<button disabled></button>')).props).toEqual({ disabled: '', children: [] });
    expect('disabled' in domToVdom(parse('<button></button>')).props).toBe(false);
  });

  it('1.2 style: 문자열 그대로', () => {
    const v = domToVdom(parse('<p style="color: red; margin: 0"></p>'));
    expect(v.props.style).toBe('color: red; margin: 0');
  });

  it('1.2 이벤트 속성: 일반 속성(문자열)으로 취급', () => {
    expect(domToVdom(parse('<button onclick="alert(1)"></button>')).props.onclick).toBe('alert(1)');
  });

  it('1.2 value, checked는 속성으로만 다룬다 (실시간 상태 무시)', () => {
    // (checkbox의 .value는 명세상 속성을 바꾸므로 value는 text input으로 확인)
    const root = parse('<div><input value="a"><input type="checkbox" checked></div>');
    const [text, checkbox] = root.children;
    text.value = 'changed';
    checkbox.checked = false;
    expect(domToVdom(root).props.children).toEqual([
      el('input', { value: 'a' }),
      el('input', { type: 'checkbox', checked: '' }),
    ]);
  });
});

describe('domToVdom - 1.3 key', () => {
  it('1.3 data-key를 읽어 key로 옮기고 props에서는 제거한다', () => {
    const v = domToVdom(parse('<li data-key="a" class="x">A</li>'));
    expect(v.key).toBe('a');
    expect(v.props).toEqual({ class: 'x', children: [text('A')] });
  });

  it('1.3 data-key가 없으면 key는 null', () => {
    expect(domToVdom(parse('<li>A</li>')).key).toBeNull();
  });

  it('1.3 형제끼리 key가 중복이면 console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    domToVdom(parse('<ul><li data-key="a"></li><li data-key="a"></li></ul>'));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('1.3 key가 고유하면 경고하지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    domToVdom(parse('<ul><li data-key="a"></li><li data-key="b"></li><li></li><li></li></ul>'));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('domToVdom - 2.1 공통 규칙', () => {
  it('① 주석은 버린다', () => {
    expect(domToVdom(parse('<div><!-- c --><b></b></div>')).props.children).toEqual([el('b')]);
  });

  it('① 요소와 텍스트만 변환한다 (CDATA/처리 명령 등이 없는 HTML에서는 주석이 대표)', () => {
    const div = document.createElement('div');
    div.append(document.createComment('c'), document.createTextNode('t'), document.createElement('i'));
    expect(domToVdom(div).props.children).toEqual([text('t'), el('i')]);
  });

  it('④ 인접한 텍스트는 하나로 합친다 (DOM API로 만든 인접 Text 노드)', () => {
    const p = document.createElement('p');
    p.append(document.createTextNode('a'), document.createTextNode('b'));
    expect(domToVdom(p).props.children).toEqual([text('ab')]);
  });

  it('④ 빈 문자열 텍스트는 버린다', () => {
    const p = document.createElement('p');
    p.append(document.createTextNode(''), document.createElement('b'), document.createTextNode(''));
    expect(domToVdom(p).props.children).toEqual([el('b')]);
  });

  it('①④ 문서 예시: <p>a<!-- 주석 -->b</p> → "ab"', () => {
    expect(domToVdom(parse('<p>a<!-- 주석 -->b</p>'))).toEqual(el('p', {}, [text('ab')]));
  });
});

describe('domToVdom - 2.2 공백 규칙 ②③', () => {
  it('② 줄바꿈을 포함한 공백 텍스트는 버린다 (문서 예시: 들여쓰기된 ul)', () => {
    expect(domToVdom(parse('<ul>\n  <li>A</li>\n</ul>'))).toEqual(el('ul', {}, [el('li', {}, [text('A')])]));
  });

  it('② 같은 줄 공백은 남긴다 (문서 예시: <span>a</span> <span>b</span>)', () => {
    const v = domToVdom(parse('<p><span>a</span> <span>b</span></p>'));
    expect(v.props.children).toEqual([el('span', {}, [text('a')]), text(' '), el('span', {}, [text('b')])]);
  });

  it('② 글자가 있는 텍스트는 trim하지 않고 그대로 둔다', () => {
    expect(domToVdom(parse('<p>\n  hi\n</p>')).props.children).toEqual([text('\n  hi\n')]);
  });

  it('② 탭·CR·FF도 공백으로 본다', () => {
    const p = document.createElement('p');
    p.append(document.createTextNode('\t\r\n\f '));
    expect(domToVdom(p).props.children).toEqual([]);
  });

  it('② &nbsp;는 글자로 본다 (화면에 보이므로 남김)', () => {
    expect(domToVdom(parse('<p> \n</p>')).props.children).toEqual([text(' \n')]);
  });

  it('③ pre 안쪽은 ②를 적용하지 않는다', () => {
    const pre = document.createElement('pre');
    pre.append(document.createTextNode('\n  '));
    expect(domToVdom(pre).props.children).toEqual([text('\n  ')]);
  });

  it('③ textarea, script, style 안쪽도 ②를 적용하지 않는다', () => {
    for (const tag of ['textarea', 'script', 'style']) {
      const node = document.createElement(tag);
      node.append(document.createTextNode('\n  '));
      expect(domToVdom(node).props.children, tag).toEqual([text('\n  ')]);
    }
  });

  it('③ 조상까지 확인: <pre><code><span>if</span>\\n  <span>run</span>()</code></pre> 의 span 사이 공백 보존', () => {
    const v = domToVdom(parse('<pre><code><span>if</span>\n  <span>run</span>()</code></pre>'));
    expect(v).toEqual(
      el('pre', {}, [
        el('code', {}, [el('span', {}, [text('if')]), text('\n  '), el('span', {}, [text('run')]), text('()')]),
      ]),
    );
  });

  it('③ 루트의 바깥 조상도 확인: pre 안의 span을 루트로 넘겨도 줄바꿈 공백 보존', () => {
    const pre = parse('<pre><span><b>a</b>\n  <b>b</b></span></pre>');
    const span = pre.querySelector('span');
    const expected = el('span', {}, [el('b', {}, [text('a')]), text('\n  '), el('b', {}, [text('b')])]);
    expect(domToVdom(span)).toEqual(expected);
    // 같은 노드는 루트로 넘기든 자식으로 변환되든 결과가 같다
    expect(domToVdom(pre).props.children[0]).toEqual(expected);
  });

  it('③ 예외 태그 밖에서는 ②를 적용한다 (pre의 형제)', () => {
    // HTML 파서는 <pre> 바로 뒤 첫 줄바꿈을 버리므로 줄바꿈을 두 번 쓴다
    const v = domToVdom(parse('<div><pre>\n\n</pre>\n  <p>x</p></div>'));
    expect(v.props.children).toEqual([el('pre', {}, [text('\n')]), el('p', {}, [text('x')])]);
  });
});

describe('domToVdom - 2.2 처리 순서 ① → ④ → ② → 빈 문자열 제거', () => {
  it('<p>a<!-- -->\\n <!-- -->b</p> → 텍스트 하나 "a\\n b"', () => {
    expect(domToVdom(parse('<p>a<!-- -->\n <!-- -->b</p>')).props.children).toEqual([text('a\n b')]);
  });

  it('<p>a<!-- c -->\\n b</p> → 텍스트 하나 "a\\n b"', () => {
    expect(domToVdom(parse('<p>a<!-- c -->\n b</p>')).props.children).toEqual([text('a\n b')]);
  });

  it('<div><span>x</span><!-- -->\\n  <!-- --><span>y</span></div> → 합쳐도 공백뿐이라 버림, span 2개', () => {
    const v = domToVdom(parse('<div><span>x</span><!-- -->\n  <!-- --><span>y</span></div>'));
    expect(v.props.children).toEqual([el('span', {}, [text('x')]), el('span', {}, [text('y')])]);
  });
});

describe('domToVdom - 2.2 ⑤⑥', () => {
  it('⑤ 넘겨받은 Element 자신부터 변환한다 (자식만이 아니라 루트 포함)', () => {
    const v = domToVdom(parse('<section id="s"><p>a</p></section>'));
    expect(v.type).toBe('section');
    expect(v.props.id).toBe('s');
  });

  it('⑤ 자식은 재귀로 처리한다 (깊은 중첩)', () => {
    const v = domToVdom(parse('<div><section><ul><li>a</li></ul></section></div>'));
    expect(v).toEqual(el('div', {}, [el('section', {}, [el('ul', {}, [el('li', {}, [text('a')])])])]));
  });

  it('⑥ 입력 DOM을 수정하지 않는다', () => {
    const root = parse('<div data-key="r">\n  <p>a<!-- c -->b</p>\n  <pre>\n x</pre>\n</div>');
    const p = root.querySelector('p');
    p.append(document.createTextNode(''), document.createTextNode('c'));
    const before = root.outerHTML;
    const nodeCount = (n) => [...n.childNodes].reduce((sum, c) => sum + nodeCount(c), 1);
    const count = nodeCount(root);
    domToVdom(root);
    expect(root.outerHTML).toBe(before);
    expect(nodeCount(root)).toBe(count);
    expect(root.getAttribute('data-key')).toBe('r');
  });
});

describe('domToVdom - 3장 범위 밖', () => {
  const unsupported = /^\[mini-react\] 지원하지 않음: .+ \(Phase 1 범위 밖\)$/;

  it('3장 SVG → 에러 (namespaceURI 확인)', () => {
    expect(() => domToVdom(parse('<svg><circle r="1"></circle></svg>'))).toThrow(unsupported);
  });

  it('3장 자식에 SVG가 있어도 에러', () => {
    expect(() => domToVdom(parse('<div><svg></svg></div>'))).toThrow(unsupported);
  });

  it('3장 MathML → 에러', () => {
    expect(() => domToVdom(parse('<div><math><mi>x</mi></math></div>'))).toThrow(unsupported);
  });

  it('3장 <template> → 에러 (루트, 자식 모두)', () => {
    expect(() => domToVdom(parse('<template><p>a</p></template>'))).toThrow(unsupported);
    expect(() => domToVdom(parse('<div><template></template></div>'))).toThrow(unsupported);
  });

  it('3장 Element가 아닌 입력: Text 노드 → 에러', () => {
    expect(() => domToVdom(document.createTextNode('hi'))).toThrow(unsupported);
  });

  it('3장 Element가 아닌 입력: 주석 노드 → 에러', () => {
    expect(() => domToVdom(document.createComment('c'))).toThrow(unsupported);
  });

  it('3장 Element가 아닌 입력: document → 에러', () => {
    expect(() => domToVdom(document)).toThrow(unsupported);
  });

  it('3장 Element가 아닌 입력: DocumentFragment → 에러', () => {
    expect(() => domToVdom(document.createDocumentFragment())).toThrow(unsupported);
  });

  it('3장 Element가 아닌 입력: null, 일반 객체 → 에러', () => {
    expect(() => domToVdom(null)).toThrow(unsupported);
    expect(() => domToVdom({ nodeType: 1 })).toThrow(unsupported);
  });

  it('3장 에러가 나면 입력 DOM은 그대로다', () => {
    const root = parse('<div><p>a</p><svg></svg></div>');
    const before = root.outerHTML;
    expect(() => domToVdom(root)).toThrow();
    expect(root.outerHTML).toBe(before);
  });
});
