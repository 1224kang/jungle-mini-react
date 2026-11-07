import { describe, test, expect } from 'vitest';
import { StateHistory } from '../src/app/history.js';

describe('StateHistory', () => {
  test('처음에는 초기 상태 하나만 있다', () => {
    const history = new StateHistory('A');
    expect(history.current).toBe('A');
    expect(history.length).toBe(1);
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
  });

  test('push 후 뒤로가기 / 앞으로가기로 이동한다', () => {
    const history = new StateHistory('A');
    history.push('B');
    history.push('C');

    expect(history.back()).toBe('B');
    expect(history.back()).toBe('A');
    expect(history.back()).toBeNull();
    expect(history.current).toBe('A');

    expect(history.forward()).toBe('B');
    expect(history.forward()).toBe('C');
    expect(history.forward()).toBeNull();
  });

  test('뒤로간 상태에서 push하면 이후 기록은 사라진다', () => {
    const history = new StateHistory('A');
    history.push('B');
    history.push('C');
    history.back();
    history.back();

    history.push('D');

    expect(history.current).toBe('D');
    expect(history.length).toBe(2);
    expect(history.canForward()).toBe(false);
    expect(history.back()).toBe('A');
  });
});
