/** diff/patch 검증용 케이스. before/after는 단일 루트 요소를 가진 HTML 문자열이다. */
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
];
