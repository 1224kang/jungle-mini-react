/** diff/patch 및 VNode 생성 검증용 케이스. before/after는 단일 루트 요소를 가진 HTML 문자열이다. */
export const cases = [
  {
    name: '텍스트 변경',
    before: '<div><p>안녕</p></div>',
    after: '<div><p>잘가</p></div>',
  },
  {
    name: '속성 추가',
    before: '<div><p>글</p></div>',
    after: '<div><p class="on">글</p></div>',
  },
  {
    name: '속성 변경',
    before: '<div><p class="off">글</p></div>',
    after: '<div><p class="on">글</p></div>',
  },
  {
    name: '속성 삭제',
    before: '<div><p class="on" id="a">글</p></div>',
    after: '<div><p class="on">글</p></div>',
  },
  {
    name: '태그 교체',
    before: '<div><p>글</p></div>',
    after: '<div><h1>글</h1></div>',
  },
  {
    name: '자식 추가',
    before: '<ul><li>1</li></ul>',
    after: '<ul><li>1</li><li>2</li></ul>',
  },
  {
    name: '자식 삭제',
    before: '<ul><li>1</li><li>2</li></ul>',
    after: '<ul><li>1</li></ul>',
  },
  {
    name: '중첩 변경',
    before: '<div><section><ul><li>a</li><li>b</li></ul></section></div>',
    after: '<div><section><ul><li>a</li><li class="x">c</li></ul></section></div>',
  },
  {
    name: '변경 없음',
    before: '<div><p class="a">같음</p></div>',
    after: '<div><p class="a">같음</p></div>',
  },
  // ── 아래는 VNode 생성 규칙(docs/contracts.md 1~2장) 검증용 케이스 ──
  {
    name: '들여쓰기된 목록',
    before: '<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>',
    after: '<ul>\n  <li>A</li>\n  <li>B</li>\n  <li>C</li>\n</ul>',
  },
  {
    name: '같은 줄 공백이 있는 인라인 요소',
    before: '<p><span>a</span> <span>b</span></p>',
    after: '<p><span>a</span> <span>c</span></p>',
  },
  {
    name: '주석이 낀 텍스트',
    before: '<p>a<!-- 주석 -->b</p>',
    after: '<p>a<!-- 주석 -->c</p>',
  },
  {
    name: 'pre 안의 들여쓰기',
    before: '<pre>\n  line1\n    line2\n</pre>',
    after: '<pre>\n  line1\n    line3\n</pre>',
  },
  {
    name: '문법 강조 코드 블록 (pre > code > span)',
    before: '<pre><code><span>if</span>\n  <span>run</span>()</code></pre>',
    after: '<pre><code><span>if</span>\n  <span>stop</span>()</code></pre>',
  },
  {
    name: '불리언 속성',
    before: '<div><input type="checkbox" disabled><button disabled>확인</button></div>',
    after: '<div><input type="checkbox"><button>확인</button></div>',
  },
  {
    name: 'data-key가 있는 목록',
    before: '<ul><li data-key="a">A</li><li data-key="b">B</li></ul>',
    after: '<ul><li data-key="b">B</li><li data-key="a">A</li></ul>',
  },
  {
    name: '자식이 없는 요소 (br, input)',
    before: '<div><br><input type="text"></div>',
    after: '<div><input type="text"><br></div>',
  },
  {
    name: 'style 속성',
    before: '<p style="color: red; margin: 0">글</p>',
    after: '<p style="color: blue">글</p>',
  },
  {
    name: '처리 순서: 주석 사이 공백이 글자와 이어짐',
    before: '<p>a<!-- -->\n <!-- -->b</p>',
    after: '<p>a<!-- -->\n <!-- -->c</p>',
  },
  {
    name: '처리 순서: 주석 뒤 줄바꿈 텍스트',
    before: '<p>a<!-- c -->\n b</p>',
    after: '<p>a<!-- c -->\n c</p>',
  },
  {
    name: '처리 순서: 주석 사이 공백만 있음',
    before: '<div><span>x</span><!-- -->\n  <!-- --><span>y</span></div>',
    after: '<div><span>x</span><!-- -->\n  <!-- --><span>z</span></div>',
  },
];
