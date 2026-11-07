import { describe, it } from 'vitest';
import { cases } from '../../fixtures/cases.js';

describe('domToVdom', () => {
  it.todo('텍스트 노드를 { type: "#text", value }로 변환한다');
  it.todo('속성과 자식을 VNode로 변환한다');
  for (const { name } of cases) {
    it.todo(`fixtures: ${name} - before/after HTML을 VNode로 변환한다`);
  }
});
