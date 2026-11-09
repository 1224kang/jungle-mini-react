import { describe, it, expect } from 'vitest';
import { domToVdom, render, diff, patch } from '../../src/lib/index.js';
import { parseHtml } from '../../src/playground/verify/parse.js';
import { serialize } from '../../src/playground/verify/serialize.js';
import { createHistory } from '../../src/playground/verify/history.js';
import { takeSnapshot, compareSnapshots, collectNodes } from '../../src/playground/verify/domStats.js';
import { cases } from '../../fixtures/cases.js';

const SAMPLE = `<div class="card" id="demo">
  <h3 class="title">할 일 목록</h3>
  <p class="desc">텍스트, <strong>중첩</strong>, <em title="t">속성</em></p>
  <ul class="todo">
    <li data-key="apple" class="item">사과</li>
    <li data-key="milk" class="item done">우유</li>
    <li data-key="bread" class="item">빵</li>
  </ul>
  <input id="memo" type="text">
  <section><div><span>깊은</span> <span>중첩</span></div></section>
</div>`;

const parse = (html) => parseHtml(html, document).vnode;

/** 페이지와 같은 순서: 현재 VNode를 render해 마운트하고, 이후에는 patch로만 갱신한다. */
function mount(vnode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = render(vnode);
  container.appendChild(root);
  return root;
}

const edits = {
  '텍스트 수정': (s) => s.replace('사과', '사과 두 개'),
  'class 변경': (s) => s.replace('class="desc"', 'class="desc on"'),
  '리스트 추가': (s) => s.replace('<li data-key="bread" class="item">빵</li>', '<li data-key="bread" class="item">빵</li><li data-key="egg">달걀</li>'),
  '리스트 삭제': (s) => s.replace(/<li data-key="milk"[^\n]*<\/li>/, ''),
  'key 순서 뒤집기': (s) => s.replace(/(<li data-key="apple"[^\n]*<\/li>)(\s*)(<li data-key="milk"[^\n]*<\/li>)(\s*)(<li data-key="bread"[^\n]*<\/li>)/, '$5$2$3$4$1'),
  '루트 교체': () => '<section><p>새 루트</p></section>',
  '속성 삭제 + 중첩 변경': (s) => s.replace(' id="demo"', '').replace('<span>깊은</span>', '<b>굵게</b>'),
};

describe('실제 영역 patch 후 다시 VNode로 변환한 결과 == 새 VNode', () => {
  it.each(Object.entries(edits))('%s', (_name, edit) => {
    const oldV = parse(SAMPLE);
    const newV = parse(edit(SAMPLE));
    const root = mount(oldV);
    const patched = patch(root, diff(oldV, newV));
    expect(domToVdom(patched)).toEqual(newV);
  });

  it.each(cases.map((c) => [c.name, c.before, c.after]))('fixture %s', (_name, before, after) => {
    const oldV = parse(before);
    const newV = parse(after);
    const patched = patch(mount(oldV), diff(oldV, newV));
    expect(domToVdom(patched)).toEqual(newV);
  });

  it('textarea 직렬화 HTML을 거쳐도 같다 (serialize → parse → diff → patch)', () => {
    const oldV = parse(SAMPLE);
    const newV = parse(edits['key 순서 뒤집기'](serialize(oldV)));
    const patched = patch(mount(oldV), diff(oldV, newV));
    expect(domToVdom(patched)).toEqual(newV);
  });

  it('히스토리를 따라 여러 번 앞뒤로 patch해도 매번 일치한다', () => {
    const hist = createHistory(parse(SAMPLE));
    let root = mount(hist.current());
    let src = SAMPLE;
    for (const edit of Object.values(edits).slice(0, 5)) {
      src = edit(src);
      const next = parse(src);
      root = patch(root, diff(hist.current(), next));
      hist.push(next);
      expect(domToVdom(root)).toEqual(hist.current());
    }
    while (hist.canBack) {
      const prev = hist.peek(-1);
      root = patch(root, diff(hist.current(), prev));
      hist.back();
      expect(domToVdom(root)).toEqual(hist.current());
    }
    while (hist.canForward) {
      const next = hist.peek(1);
      root = patch(root, diff(hist.current(), next));
      hist.forward();
      expect(domToVdom(root)).toEqual(hist.current());
    }
  });
});

describe('DOM 노드 재사용 집계', () => {
  it('텍스트 하나 수정: 모든 노드 재사용, 생성·제거 0', () => {
    const oldV = parse(SAMPLE);
    const root = mount(oldV);
    const total = collectNodes(root).length;
    const snap = takeSnapshot(root);
    const patched = patch(root, diff(oldV, parse(edits['텍스트 수정'](SAMPLE))));
    const r = compareSnapshots(snap, patched);
    expect([r.reused.length, r.created.length, r.removed.length]).toEqual([total, 0, 0]);
  });

  it('key 순서 변경: 새로 만든 노드 0, li 객체가 그대로 재사용되고 MOVE가 생성된다', () => {
    const oldV = parse(SAMPLE);
    const newV = parse(edits['key 순서 뒤집기'](SAMPLE));
    const root = mount(oldV);
    const lis = [...root.querySelectorAll('li')];
    const snap = takeSnapshot(root);
    const patches = diff(oldV, newV);
    expect(patches.some((p) => p.type === 'MOVE')).toBe(true);
    const patched = patch(root, patches);
    const r = compareSnapshots(snap, patched);
    expect(r.created).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
    expect([...patched.querySelectorAll('li')]).toEqual([...lis].reverse());
  });

  it('리스트 삭제/추가: li와 텍스트 2개 노드가 제거/생성된다', () => {
    const oldV = parse(SAMPLE);
    const root = mount(oldV);
    const snap = takeSnapshot(root);
    const patched = patch(root, diff(oldV, parse(edits['리스트 삭제'](SAMPLE))));
    expect(compareSnapshots(snap, patched).removed).toHaveLength(2);

    const v2 = parse(edits['리스트 삭제'](SAMPLE));
    const v3 = parse(edits['리스트 추가'](edits['리스트 삭제'](SAMPLE)));
    const snap2 = takeSnapshot(patched);
    const patched2 = patch(patched, diff(v2, v3));
    expect(compareSnapshots(snap2, patched2).created).toHaveLength(2);
  });

  it('input 값은 다른 부분을 patch해도 유지된다', () => {
    const oldV = parse(SAMPLE);
    const root = mount(oldV);
    const input = root.querySelector('input');
    input.value = '사용자 입력';
    const patched = patch(root, diff(oldV, parse(edits['class 변경'](SAMPLE))));
    expect(patched.querySelector('input')).toBe(input);
    expect(input.value).toBe('사용자 입력');
  });

  it('루트가 교체되면 재사용 0, 이전 노드는 모두 제거로 집계된다', () => {
    const oldV = parse(SAMPLE);
    const root = mount(oldV);
    const snap = takeSnapshot(root);
    const patched = patch(root, diff(oldV, parse(edits['루트 교체'](SAMPLE))));
    const r = compareSnapshots(snap, patched);
    expect(r.reused).toHaveLength(0);
    expect(r.removed).toHaveLength(snap.list.length);
    expect(r.created).toHaveLength(collectNodes(patched).length);
  });
});
