import { describe, it } from 'vitest';
import { cases } from '../../fixtures/cases.js';

describe('render', () => {
  it.todo('텍스트 VNode를 Text 노드로 만든다');
  it.todo('요소 VNode의 속성과 자식을 DOM으로 만든다');
  for (const { name } of cases) {
    it.todo(`fixtures: ${name} - render(domToVdom(html))의 innerHTML이 원본과 같다`);
  }
});
