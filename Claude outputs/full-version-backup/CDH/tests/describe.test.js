// 패치 설명 테스트: 화면의 "이번 패치" 목록이 어떤 글을 만드는지 확인합니다.
import { describe, it, expect } from 'vitest';
import { h } from '../src/lib/vdom/vnode.js';
import { diff } from '../src/lib/reconcile/diff.js';
import { describePatches } from '../src/lib/reconcile/describe.js';

const li = (k) => h('li', { key: k }, k);
const lines = (a, b) => describePatches(a, diff(a, b));

describe('describePatches', () => {
  it('변화가 없으면 빈 목록', () => {
    expect(lines(h('p', {}, 'a'), h('p', {}, 'a'))).toEqual([]);
  });

  it('TEXT / PROPS 는 옛 트리 경로를 보여 준다', () => {
    const old = h('div', { class: 'a' }, h('p', {}, 'hi'));
    const next = h('div', { class: 'b' }, h('p', {}, 'yo'));
    const r = lines(old, next);
    expect(r.map((l) => l.op)).toEqual(['PROPS', 'TEXT']);
    expect(r[0].text).toContain('class="b"');
    expect(r[1].text).toContain('<div> > <p> > "hi"');
  });

  it('태그 변경은 REPLACE', () => {
    const r = lines(h('div', {}, h('h2', {}, 'x')), h('div', {}, h('h3', {}, 'x')));
    expect(r.map((l) => l.op)).toEqual(['REPLACE']);
    expect(r[0].text).toContain('<h3>');
  });

  it('항목 추가 / 삭제는 CREATE / REMOVE', () => {
    expect(lines(h('ul', {}, li('A')), h('ul', {}, li('A'), li('B'))).map((l) => l.op)).toEqual(['CREATE']);
    expect(lines(h('ul', {}, li('A'), li('B')), h('ul', {}, li('A'))).map((l) => l.op)).toEqual(['REMOVE']);
  });

  it('순서가 바뀌면 MOVE', () => {
    const r = lines(h('ul', {}, li('A'), li('B'), li('C')), h('ul', {}, li('B'), li('C'), li('A')));
    expect(r.map((l) => l.op)).toEqual(['MOVE']);
    expect(r[0].text).toContain('0 → 2');
  });
});
