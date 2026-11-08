// State History 테스트 (레슨 0006 과 같은 규칙)
import { describe, it, expect } from 'vitest';
import { StateHistory } from '../src/app/history.js';

describe('StateHistory', () => {
  it('중간에서 저장하면 앞 기록을 버린다', () => {
    const h = new StateHistory('A');
    h.push('B');
    h.push('C');
    h.back();
    h.push('D');
    expect(h.items).toEqual(['A', 'B', 'D']);
    expect(h.cursor).toBe(2);
  });

  it('맨 앞에서 뒤로가기는 아무 일도 없다', () => {
    const h = new StateHistory('A');
    expect(h.back()).toBe('A');
    expect(h.cursor).toBe(0);
  });

  it('저장은 복사해서 한다 (나중에 원본을 고쳐도 기록은 그대로)', () => {
    const v = { type: 'div', props: { class: 'a' }, children: [] };
    const h = new StateHistory(v);
    h.push(v);
    v.props.class = 'changed';
    expect(h.items[1].props.class).toBe('a');
  });

  it('꺼낸 값을 고쳐도 기록은 바뀌지 않는다', () => {
    const h = new StateHistory({ type: 'p', props: {}, children: ['x'] });
    h.current().children.push('y');
    expect(h.items[0].children).toEqual(['x']);
  });

  it('함수가 든 props 는 복사할 수 없어 에러 (DataCloneError)', () => {
    const h = new StateHistory('A');
    expect(() => h.push({ type: 'button', props: { onClick: () => 1 }, children: [] })).toThrow();
  });
});
