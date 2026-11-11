import { describe, it, expect } from 'vitest';
import { annotate } from '../../../src/app/visualizer/annotate.js';
import { parseHtml } from '../../../src/app/visualizer/engine.js';
import { diff } from '../../../src/lib/index.js';

const run = (before, after) => {
  const a = parseHtml(before);
  const b = parseHtml(after);
  return annotate(a, b);
};
const kinds = (map, key) => (map.get(key) ?? []).map((m) => m.kind).sort();
const keysOf = (map) => [...map.keys()].sort();

describe('annotate: 변경 대상 표시', () => {
  it('변경이 없으면 표시가 없다', () => {
    const r = run('<div><p>a</p></div>', '<div><p>a</p></div>');
    expect(r.old.size).toBe(0);
    expect(r.new.size).toBe(0);
    expect(r.patches).toEqual([]);
  });

  it('TEXT: 양쪽 트리의 같은 텍스트 노드에 표시한다', () => {
    const r = run('<div><p>사과 3개</p></div>', '<div><p>사과 5개</p></div>');
    expect(keysOf(r.old)).toEqual(['0.0']);
    expect(keysOf(r.new)).toEqual(['0.0']);
    expect(kinds(r.old, '0.0')).toEqual(['text']);
    expect(kinds(r.new, '0.0')).toEqual(['text']);
  });

  it('PROPS: 바뀐 속성 이름을 함께 담는다 (설정과 삭제 모두)', () => {
    const r = run('<div><b class="a" title="x">t</b></div>', '<div><b class="a done" id="n">t</b></div>');
    const mark = r.new.get('0')[0];
    expect(mark.kind).toBe('props');
    expect([...mark.names].sort()).toEqual(['class', 'id', 'title']);
    expect(kinds(r.old, '0')).toEqual(['props']);
  });

  it('CREATE: 새 트리에서 새 순서 위치에만 표시한다', () => {
    const r = run('<ul><li data-key="a">a</li></ul>', '<ul><li data-key="a">a</li><li data-key="b">b</li></ul>');
    expect(r.old.size).toBe(0);
    expect(keysOf(r.new)).toEqual(['1']);
    expect(kinds(r.new, '1')).toEqual(['create']);
  });

  it('CREATE: 앞쪽에 끼워 넣어도 새 순서 인덱스를 쓴다', () => {
    const r = run('<ul><li data-key="b">b</li></ul>', '<ul><li data-key="a">a</li><li data-key="b">b</li></ul>');
    expect(keysOf(r.new)).toEqual(['0']);
    expect(kinds(r.new, '0')).toEqual(['create']);
    expect(r.old.size).toBe(0);
  });

  it('REMOVE: 이전 트리에서만 표시한다', () => {
    const r = run('<ul><li data-key="a">a</li><li data-key="b">b</li></ul>', '<ul><li data-key="b">b</li></ul>');
    expect(keysOf(r.old)).toEqual(['0']);
    expect(kinds(r.old, '0')).toEqual(['remove']);
    expect(r.new.size).toBe(0);
  });

  it('REPLACE: 이전 위치와 이후 위치에 각각 표시한다', () => {
    const r = run('<div><p class="n">a</p><i>z</i></div>', '<div><strong class="n">a</strong><i>z</i></div>');
    expect(keysOf(r.old)).toEqual(['0']);
    expect(keysOf(r.new)).toEqual(['0']);
    expect(kinds(r.old, '0')).toEqual(['replace']);
    expect(kinds(r.new, '0')).toEqual(['replace']);
  });

  it('REPLACE: 루트 교체도 표시한다', () => {
    const r = run('<div>a</div>', '<section>a</section>');
    expect(kinds(r.old, '')).toEqual(['replace']);
    expect(kinds(r.new, '')).toEqual(['replace']);
  });

  it('REPLACE 뒤에 형제가 CREATE돼도 위치가 어긋나지 않는다', () => {
    const r = run('<div><p>a</p></div>', '<div><h1>a</h1><span>b</span></div>');
    const newKinds = Object.fromEntries([...r.new].map(([k, v]) => [k, v.map((m) => m.kind)]));
    expect(newKinds['0']).toEqual(['replace']);
    expect(newKinds['1']).toEqual(['create']);
  });

  it('MOVE(keyed): 옮겨진 노드를 old 좌표와 new 좌표에 표시한다', () => {
    const r = run(
      '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>',
      '<ul><li data-key="b">B</li><li data-key="c">C</li><li data-key="a">A</li></ul>',
    );
    expect(keysOf(r.old)).toEqual(['0']); // a는 old 0번째
    expect(keysOf(r.new)).toEqual(['2']); // a는 new 2번째
    expect(kinds(r.old, '0')).toEqual(['move']);
    expect(kinds(r.new, '2')).toEqual(['move']);
  });

  it('MOVE + 옮겨진 노드 안의 TEXT 변경: 새 좌표를 따라간다', () => {
    const r = run(
      '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>',
      '<ul><li data-key="b">B</li><li data-key="c">C</li><li data-key="a">A2</li></ul>',
    );
    expect(kinds(r.old, '0')).toEqual(['move']);
    expect(kinds(r.old, '0.0')).toEqual(['text']); // old: a의 텍스트
    expect(kinds(r.new, '2')).toEqual(['move']);
    expect(kinds(r.new, '2.0')).toEqual(['text']); // new: 옮겨진 a의 텍스트
    expect(r.new.has('0.0')).toBe(false);
  });

  it('한 노드에 MOVE와 PROPS가 함께 붙을 수 있다', () => {
    const r = run(
      '<ul><li data-key="a" class="x">A</li><li data-key="b">B</li></ul>',
      '<ul><li data-key="b">B</li><li data-key="a" class="y">A</li></ul>',
    );
    expect(kinds(r.new, '1')).toEqual(['move', 'props']);
    expect(kinds(r.old, '0')).toEqual(['move', 'props']);
  });

  it('생성 · 삭제 · 이동이 섞여도 각 트리의 좌표가 맞다', () => {
    const before = '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li><li data-key="d">D</li></ul>';
    const after = '<ul><li data-key="x">X</li><li data-key="d">D</li><li data-key="a">A</li><li data-key="c">C</li></ul>';
    const r = run(before, after);
    // b 삭제(old 1)
    expect(kinds(r.old, '1')).toEqual(['remove']);
    // x 생성(new 0)
    expect(kinds(r.new, '0')).toEqual(['create']);
    // 이동: lastPlacedIndex 규칙상 d(old 3)가 먼저 놓이고 a(old 0), c(old 2)가 이동한다
    expect(kinds(r.old, '0')).toEqual(['move']);
    expect(kinds(r.old, '2')).toEqual(['move']);
    expect(kinds(r.new, '2')).toEqual(['move']); // a
    expect(kinds(r.new, '3')).toEqual(['move']); // c
    // d는 재사용만 되고 표시가 없다
    expect(r.old.has('3')).toBe(false);
    expect(r.new.has('1')).toBe(false);
  });

  it('key 없는 재정렬: 이동 없이 자리마다 TEXT가 표시된다', () => {
    const r = run(
      '<ul><li>사과</li><li>우유</li><li>빵</li></ul>',
      '<ul><li>우유</li><li>빵</li><li>사과</li></ul>',
    );
    expect(keysOf(r.old)).toEqual(['0.0', '1.0', '2.0']);
    expect(keysOf(r.new)).toEqual(['0.0', '1.0', '2.0']);
    for (const k of ['0.0', '1.0', '2.0']) expect(kinds(r.new, k)).toEqual(['text']);
  });

  it('표시 개수는 Patch와 일치하고 patches를 주어도 같은 결과다', () => {
    const a = parseHtml('<div><p>a</p><i>1</i></div>');
    const b = parseHtml('<div><p>b</p></div>');
    const patches = diff(a, b);
    const r = annotate(a, b, patches);
    expect(r.patches).toBe(patches);
    const total = [...r.old.values(), ...r.new.values()].flat().length;
    expect(total).toBeGreaterThanOrEqual(patches.length);
  });

  it('입력 VNode를 바꾸지 않는다', () => {
    const a = parseHtml('<ul><li data-key="a">A</li><li data-key="b">B</li></ul>');
    const b = parseHtml('<ul><li data-key="b">B</li><li data-key="a">A</li></ul>');
    const snapshot = JSON.stringify([a, b]);
    annotate(a, b);
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });
});
