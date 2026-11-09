import { describe, it, expect } from 'vitest';
import { parseHtml, sanitize } from '../../src/playground/verify/parse.js';
import { serialize } from '../../src/playground/verify/serialize.js';
import { toLogRows } from '../../src/playground/verify/patchLog.js';
import { firstDifference } from '../../src/playground/verify/compare.js';
import { h, diff } from '../../src/lib/index.js';
import { cases } from '../../fixtures/cases.js';

const SAMPLE = `
<div class="card" id="demo" style="padding: 12px">
  <h3 class="title">할 일 목록</h3>
  <p class="desc">텍스트, <strong>중첩</strong>, <em title="t">속성</em> 샘플</p>
  <ul class="todo">
    <li data-key="apple" class="item">사과</li>
    <li data-key="milk" class="item done">우유</li>
  </ul>
  <input id="memo" type="text" placeholder="입력">
  <section><div><span>깊은</span> <span>중첩</span></div></section>
</div>`;

const parse = (html) => parseHtml(html, document).vnode;
const roundTrip = (v) => parse(serialize(v));

describe('HTML → VNode 파싱', () => {
  it('들여쓰기 공백은 domToVdom 규칙대로 버리고, 같은 줄 공백은 남긴다', () => {
    const v = parse(SAMPLE);
    expect(v.props.children.map((c) => c.type)).toEqual(['h3', 'p', 'ul', 'input', 'section']);
    const ul = v.props.children[2];
    expect(ul.props.children.map((li) => li.key)).toEqual(['apple', 'milk']);
    expect(ul.props.children[0].props).not.toHaveProperty('data-key');
    const div = v.props.children[4].props.children[0];
    expect(div.props.children[1]).toEqual({ type: '#text', value: ' ' });
  });

  it('최상위 요소가 정확히 하나가 아니면 에러 (앞뒤 공백·주석은 무시)', () => {
    expect(() => parse('<p>a</p><p>b</p>')).toThrow(/정확히 하나/);
    expect(() => parse('텍스트')).toThrow(/정확히 하나/);
    expect(() => parse('')).toThrow(/정확히 하나/);
    expect(parse('  <!-- c -->\n<p>a</p>\n')).toEqual(h('p', null, 'a'));
  });
});

describe('파싱 → 직렬화 왕복', () => {
  it('샘플 HTML이 같은 구조를 유지한다', () => {
    const v = parse(SAMPLE);
    expect(roundTrip(v)).toEqual(v);
  });

  it.each(cases.flatMap((c) => [[`${c.name} (before)`, c.before], [`${c.name} (after)`, c.after]]))(
    'fixture %s',
    (_name, html) => {
      const v = parse(html);
      expect(roundTrip(v)).toEqual(v);
    },
  );

  it('특수 문자, 불리언 속성, &nbsp;, 주석, pre/textarea 공백과 앞 줄바꿈이 보존된다', () => {
    const html =
      '<div title="a &quot;q&quot; &amp; b"><p>a &lt; b &amp;&amp; c &gt; d&nbsp;e</p><!-- c -->' +
      '<input disabled value="x"><pre>\n\nline1\n  line2</pre><textarea>\n  t</textarea>' +
      '<ul>\n  <li>A</li>\n</ul><p>x\n y</p></div>';
    const v = parse(html);
    expect(roundTrip(v)).toEqual(v);
    const pre = v.props.children.find((c) => c.type === 'pre');
    expect(pre.props.children[0].value).toBe('\nline1\n  line2');
    expect(serialize(v)).toContain('<input disabled value="x">');
  });

  it('들여쓰기 없는 한 줄 직렬화도 같은 VNode로 돌아온다', () => {
    const v = parse(SAMPLE);
    expect(parse(serialize(v, { indent: '' }))).toEqual(v);
  });
});

describe('입력 안전 정책', () => {
  it('script, 인라인 이벤트 속성, javascript: URL, style url(), svg를 제거하고 경고를 돌려준다', () => {
    const { vnode, warnings } = parseHtml(
      '<div><script>alert(1)</script><p onclick="x()" class="a">t</p>' +
        '<a href=" JaVa&#x09;Script:alert(1)">l</a><a href="https://example.com">ok</a>' +
        '<div style="background:url(http://x)">s</div><svg><circle/></svg><iframe srcdoc="x"></iframe></div>',
      document,
    );
    expect(vnode).toEqual(
      h('div', null,
        h('p', { class: 'a' }, 't'),
        h('a', null, 'l'),
        h('a', { href: 'https://example.com' }, 'ok'),
        h('div', null, 's')),
    );
    expect(warnings.join('\n')).toMatch(/script/);
    expect(warnings.join('\n')).toMatch(/onclick/);
    expect(warnings.join('\n')).toMatch(/href/);
    expect(warnings.join('\n')).toMatch(/svg/);
    expect(warnings.join('\n')).toMatch(/iframe/);
  });

  it('루트 자체가 허용되지 않는 태그면 에러', () => {
    expect(() => parse('<script>1</script>')).toThrow(/허용되지 않는/);
    const tpl = document.createElement('template');
    tpl.innerHTML = '<form action="x"><b>t</b></form>';
    expect(() => sanitize(tpl.content.firstElementChild)).toThrow();
  });

  it('template으로 파싱하므로 파싱 중 스크립트·이벤트가 실행되지 않는다', () => {
    globalThis.__ran = 0;
    parseHtml('<div><img src="x" onerror="globalThis.__ran++"><script>globalThis.__ran++</script></div>', document);
    expect(globalThis.__ran).toBe(0);
  });
});

describe('Patch 로그 변환', () => {
  it('명령 종류, 대상, 이전 값 → 새 값을 만든다 (Patch 객체는 수정하지 않음)', () => {
    const a = parse('<ul class="x"><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>');
    const b = parse('<ul class="y"><li data-key="c">C2</li><li data-key="a">A</li><li data-key="d">D</li></ul>');
    const patches = diff(a, b);
    const frozen = JSON.stringify(patches);
    const rows = toLogRows(a, patches);
    expect(JSON.stringify(patches)).toBe(frozen);
    const types = rows.map((r) => r.type);
    expect(types).toContain('PROPS');
    expect(types).toContain('REMOVE');
    expect(types).toContain('CREATE');
    expect(types).toContain('TEXT');
    const props = rows.find((r) => r.type === 'PROPS');
    expect([props.from, props.to]).toEqual(['class="x"', 'class="y"']);
    const text = rows.find((r) => r.type === 'TEXT');
    expect([text.from, text.to]).toEqual(['"C"', '"C2"']);
    expect(rows.map((r) => r.order)).toEqual([...rows.map((r) => r.order)].sort((x, y) => x - y));
  });
});

describe('VNode 비교', () => {
  it('속성 순서는 무시하고 첫 차이 위치를 알려준다', () => {
    expect(firstDifference(h('p', { a: '1', b: '2' }), h('p', { b: '2', a: '1' }))).toBeNull();
    expect(firstDifference(h('p', null, 'x'), h('p', null, 'y'))).toMatchObject({ path: 'root.props.children[0].value' });
    expect(firstDifference(h('p', null), h('p', { id: 'i' }))).toMatchObject({ path: 'root.props.id' });
  });
});
