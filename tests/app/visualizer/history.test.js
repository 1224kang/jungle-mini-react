import { describe, it, expect } from 'vitest';
import {
  createHistory,
  addChild,
  parentOf,
  forwardTarget,
  siblingsOf,
  getNode,
  summarize,
} from '../../../src/app/visualizer/history.js';
import { parseHtml } from '../../../src/app/visualizer/engine.js';
import { diff } from '../../../src/lib/index.js';

const v = (text) => parseHtml(`<div><p>${text}</p></div>`);
const step = (history, parentId, text) => {
  const from = history.nodes[parentId].vnode;
  const to = v(text);
  return addChild(history, parentId, to, diff(from, to));
};

describe('history', () => {
  it('루트는 id 1, 초기 요약, 자식 없음', () => {
    const h = createHistory(v('a'));
    expect(h.rootId).toBe(1);
    expect(h.nextId).toBe(2);
    expect(getNode(h, 1)).toMatchObject({ id: 1, parentId: null, patchCount: 0, summary: '초기', children: [] });
    expect(getNode(h, 1).html).toContain('<p>a</p>');
    expect(parentOf(h, 1)).toBeNull();
  });

  it('1 -> 2 -> 3 순서로 번호가 붙는다', () => {
    let h = createHistory(v('a'));
    let r = step(h, 1, 'b');
    h = r.history;
    expect(r.id).toBe(2);
    r = step(h, 2, 'c');
    h = r.history;
    expect(r.id).toBe(3);
    expect(parentOf(h, 3)).toBe(2);
    expect(parentOf(h, 2)).toBe(1);
    expect(getNode(h, 2).summary).toBe('TEXT 1');
  });

  it('2로 돌아가 실행하면 4가 2의 두 번째 자식이 된다 (3은 그대로)', () => {
    let h = createHistory(v('a'));
    h = step(h, 1, 'b').history;
    h = step(h, 2, 'c').history;
    const r = step(h, 2, 'd');
    h = r.history;
    expect(r.id).toBe(4);
    expect(getNode(h, 2).children).toEqual([3, 4]);
    expect(getNode(h, 3)).not.toBeNull();
    expect(siblingsOf(h, 4)).toEqual([3, 4]);
    expect(siblingsOf(h, 1)).toEqual([1]);
  });

  it('forwardTarget: 자식이 정확히 1개일 때만 값이 있다', () => {
    let h = createHistory(v('a'));
    expect(forwardTarget(h, 1)).toBeNull(); // 자식 0개
    h = step(h, 1, 'b').history;
    expect(forwardTarget(h, 1)).toBe(2); // 자식 1개
    expect(forwardTarget(h, 2)).toBeNull();
    h = step(h, 1, 'c').history;
    expect(forwardTarget(h, 1)).toBeNull(); // 분기: 자식 2개
  });

  it('불변 업데이트: 이전 히스토리 객체는 바뀌지 않는다', () => {
    const h1 = createHistory(v('a'));
    const h2 = step(h1, 1, 'b').history;
    expect(h1.nextId).toBe(2);
    expect(h1.nodes[1].children).toEqual([]);
    expect(h2.nodes[1].children).toEqual([2]);
  });

  it('없는 부모에는 붙일 수 없다', () => {
    expect(() => addChild(createHistory(v('a')), 9, v('b'), [])).toThrow();
  });

  it('summarize: 종류별 개수, 비면 빈 문자열', () => {
    expect(summarize([])).toBe('');
    const a = parseHtml('<ul><li data-key="a">A</li><li data-key="b">B</li></ul>');
    const b = parseHtml('<ul><li data-key="b">B2</li><li data-key="c">C</li></ul>');
    expect(summarize(diff(a, b))).toMatch(/(REMOVE 1|CREATE 1|TEXT 1)/);
  });

  it('변경 없는 Patch 목록이면 요약이 "변경 없음" (App은 이 경우 노드를 만들지 않는다)', () => {
    const h = addChild(createHistory(v('a')), 1, v('a'), []).history;
    expect(getNode(h, 2).summary).toBe('변경 없음');
  });
});
