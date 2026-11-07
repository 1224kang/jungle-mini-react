import { describe, it } from 'vitest';
import { cases } from '../../fixtures/cases.js';

describe('patch', () => {
  it.todo('CREATE / REMOVE / REPLACE / TEXT / PROPS 패치를 각각 DOM에 반영한다');
  for (const { name } of cases) {
    it.todo(`fixtures: ${name} - patch 적용 후 innerHTML이 after와 같다`);
  }
});
