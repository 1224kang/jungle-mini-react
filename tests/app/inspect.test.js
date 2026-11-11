import { describe, it, expect } from 'vitest';
import { h, diff, mount } from '../../src/lib/index.js';
import {
  EMPTY_REPORT,
  IDLE_FRAME,
  countDomNodes,
  countMutations,
  countPatches,
  countVNodes,
  describeCounts,
  flatten,
  nextReport,
  toHtml,
} from '../../src/app/logic/inspect.js';

const Item = ({ label }) => h('li', { class: 'item' }, label);
const List = ({ items }) => h('ul', null, items.map((label) => h(Item, { key: label, label })));
const frame = (over = {}) => ({ counts: {}, mutations: 0, ms: null, ...over });

describe('flatten: 컴포넌트 없는 트리 만들기', () => {
  it('컴포넌트를 펼치고 key를 최상위 요소로 옮긴다', () => {
    expect(flatten(h(List, { items: ['a', 'b'] }))).toEqual(
      h('ul', null, h('li', { class: 'item', key: 'a' }, 'a'), h('li', { class: 'item', key: 'b' }, 'b')),
    );
  });

  it('라이브러리가 실제로 그린 DOM과 같은 구조다 (예측 트리 = 화면 트리)', () => {
    const container = document.createElement('div');
    mount(h(List, { items: ['a', 'b', 'c'] }), container);
    expect(container.innerHTML).toBe(toHtml(flatten(h(List, { items: ['a', 'b', 'c'] }))));
  });

  it('입력을 수정하지 않는다', () => {
    const vnode = h(List, { items: ['a'] });
    const copy = JSON.stringify(vnode);
    flatten(vnode);
    expect(JSON.stringify(vnode)).toBe(copy);
  });
});

describe('patch · DOM 변경 세기', () => {
  it('patch를 종류별로 센다', () => {
    const before = flatten(h(List, { items: ['a', 'b', 'c'] }));
    const after = flatten(h(List, { items: ['b', 'c', 'a', 'd'] }));
    const counts = countPatches(diff(before, after));
    expect(counts).toEqual({ CREATE: 1, MOVE: 1 });
    expect(describeCounts(counts)).toBe('CREATE 1 + MOVE 1');
    expect(describeCounts({})).toBe('');
  });

  it('이동은 1건, 추가 · 삭제 · 속성 · 텍스트도 각 1건으로 센다 (patch 수와 같게)', () => {
    const root = document.createElement('ul');
    root.innerHTML = '<li>a</li><li>b</li><li>c</li>';
    document.body.appendChild(root);
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });

    root.appendChild(root.firstChild); // 이동: 빠졌다가 다시 들어감
    expect(countMutations(observer.takeRecords())).toBe(1);

    root.appendChild(document.createElement('li')); // 추가
    root.firstChild.remove(); // 삭제
    root.lastChild.setAttribute('class', 'x'); // 속성
    root.children[0].firstChild.nodeValue = 'z'; // 텍스트
    expect(countMutations(observer.takeRecords())).toBe(4);

    observer.disconnect();
    root.remove();
  });

  it('노드 수를 센다 (요소 + 텍스트)', () => {
    const tree = flatten(h(List, { items: ['a', 'b'] }));
    expect(countVNodes(tree)).toBe(5);
    const container = document.createElement('div');
    mount(h(List, { items: ['a', 'b'] }), container);
    expect(countDomNodes(container.firstChild)).toBe(5);
  });

  it('toHtml: 값을 이스케이프하고 이벤트 핸들러는 뺀다', () => {
    const html = toHtml(h('p', { title: 'a"b', onclick: () => {} }, '1 < 2 & 3'));
    expect(html).toBe('<p title="a&quot;b">1 &lt; 2 &amp; 3</p>');
  });
});

describe('nextReport: 프레임 기록 → 보고서', () => {
  it('변경이 있는 프레임은 직전 값과 장면 기록에 남는다', () => {
    const report = nextReport(EMPTY_REPORT, frame({ counts: { PROPS: 1 }, mutations: 1, ms: 0.4 }), null);
    expect(report.last).toEqual({ total: 1, kinds: 'PROPS 1', mutations: 1 });
    expect(report.log).toEqual([{ total: 1, kinds: 'PROPS 1', mutations: 1, frames: 1 }]);
    expect(report.ms).toBe(0.4);
  });

  it('같은 장면이 이어지면 프레임 수만 늘고, 장면이 바뀌면 맨 앞에 쌓인다 (최대 6개)', () => {
    let report = EMPTY_REPORT;
    for (let i = 0; i < 3; i++) report = nextReport(report, frame({ counts: { PROPS: 1 }, mutations: 1 }), null);
    expect(report.log).toEqual([{ total: 1, kinds: 'PROPS 1', mutations: 1, frames: 3 }]);

    report = nextReport(report, frame({ counts: { MOVE: 1, CREATE: 1 }, mutations: 2 }), null);
    expect(report.log.map((entry) => entry.kinds)).toEqual(['MOVE 1 + CREATE 1', 'PROPS 1']);

    for (let i = 2; i < 12; i++) report = nextReport(report, frame({ counts: { PROPS: i }, mutations: i }), null);
    expect(report.log).toHaveLength(6);
  });

  it('게임 영역이 그대로인 프레임이 이어지면 같은 보고서를 돌려준다 (렌더가 이어지지 않음)', () => {
    const active = nextReport(EMPTY_REPORT, frame({ counts: { PROPS: 1 }, mutations: 1 }), null);
    const idle = nextReport(active, frame(), null);
    expect(idle.last).toBe(IDLE_FRAME);
    expect(idle.log).toBe(active.log);
    expect(nextReport(idle, frame(), null)).toBe(idle);
    expect(nextReport(EMPTY_REPORT, frame(), null)).toBe(EMPTY_REPORT);
  });

  it('전체 다시 그리기 기록은 모드가 켜져 있을 때만 담는다', () => {
    const on = nextReport(EMPTY_REPORT, frame(), { ms: 0.5, nodes: 46 });
    expect(on.naive).toEqual({ ms: 0.5, nodes: 46 });
    expect(nextReport(on, frame(), null).naive).toBeNull();
  });
});
