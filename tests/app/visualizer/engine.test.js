import { describe, it, expect } from 'vitest';
import { parseHtml, toHtml } from '../../../src/app/visualizer/engine.js';
import { SCENARIOS } from '../../../src/app/visualizer/scenarios.js';
import { diff } from '../../../src/lib/index.js';

const roundTrip = (html) => {
  const v = parseHtml(html);
  const back = parseHtml(toHtml(v));
  expect(back).toEqual(v);
  expect(diff(v, back)).toEqual([]);
};

describe('toHtml 왕복: parseHtml(toHtml(v))가 v와 같다', () => {
  it.each([
    ['pre 안의 요소 자식', '<pre><b>x</b></pre>'],
    ['pre 안의 줄바꿈 텍스트', '<pre><code><span>if</span>\n  <span>run</span>()</code></pre>'],
    ['pre가 줄바꿈으로 시작', '<pre>\n\nabc</pre>'],
    ['textarea', '<div><textarea>a\n  b</textarea></div>'],
    ['style/script', '<div><style>a {\n  color: red;\n}</style><script>var a = 1;\n</script></div>'],
    ['섞인 텍스트', '<p>a <b>b</b> c</p>'],
    ['void 요소', '<div><input type="checkbox"><br><img src="a.png"></div>'],
    ['key 있는 목록', '<ul><li data-key="a">A</li><li data-key="b"><b>B</b></li></ul>'],
    ['중첩', '<div><section><h3>t</h3><ul><li>1</li><li>2</li></ul></section></div>'],
    ['빈 요소', '<div><span></span></div>'],
  ])('%s', (_name, html) => roundTrip(html));

  it('두 예제의 before / after', () => {
    for (const s of SCENARIOS) {
      roundTrip(s.before);
      roundTrip(s.after);
    }
  });
});
