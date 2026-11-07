import { describe, it } from 'vitest';
import { cases } from '../../fixtures/cases.js';

// diff는 순수 함수이므로 VNode 객체 두 개만으로 테스트한다. (DOM 불필요)
describe('diff', () => {
  it.todo('같은 트리면 빈 배열을 반환한다');
  it.todo('텍스트가 다르면 TEXT 패치를 만든다');
  it.todo('속성이 추가/변경/삭제되면 PROPS 패치를 만든다');
  it.todo('태그가 다르면 REPLACE 패치를 만든다');
  it.todo('자식이 늘면 CREATE, 줄면 REMOVE 패치를 만든다');
  for (const { name } of cases) {
    it.todo(`fixtures: ${name}`);
  }
});
