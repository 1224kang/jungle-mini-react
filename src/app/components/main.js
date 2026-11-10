// 컴포넌트 · State · Hooks 페이지. 페이지 UI(인스펙터)는 Mini React 루트 하나로 그린다.
// 관찰 대상인 장바구니 데모(demo.js)는 별도의 루트로 #demo-root에 mount한다.
// #demo-root는 자식을 선언하지 않은 고정 요소라 페이지 diff가 그 안을 건드리지 않는다.
import { h, mount, useState, useEffect, useMemo } from '../../lib/index.js';
import { PageShell } from '../shared/layout.js';
import { useSidebar } from '../shared/useSidebar.js';
import { mountDemo, TREE, HOOK_LABELS } from './demo.js';

const MAX_LOG = 40;
const TYPE_CLASS = { STATE: 't-text', MEMO: 't-props', EFFECT: 't-move' };

/* ---------- 자식 컴포넌트 (상태 없음) ---------- */

function Intro() {
  return h(
    'section',
    { class: 'page-intro' },
    h(
      'div',
      { class: 'container' },
      h('p', { class: 'eyebrow' }, 'Components · State · Hooks'),
      h('h1', null, '컴포넌트와 Hook 들여다보기'),
      h(
        'p',
        { class: 'lead' },
        '왼쪽 장바구니는 Mini React로 만든 작은 앱입니다. 눌러 볼 때마다 어떤 컴포넌트가 다시 호출됐는지, ',
        'Hook 슬롯에 무엇이 저장됐는지, 렌더 한 번에 DOM이 얼마나 바뀌었는지 오른쪽에 그대로 보입니다.',
      ),
    ),
  );
}

const RULES = [
  { id: 'root', title: 'State는 루트에만', body: 'useState · useEffect · useMemo는 루트 App 안에서만 부릅니다. 상태가 한곳에 모입니다.' },
  { id: 'props', title: '자식은 props만', body: '자식 컴포넌트는 받은 props로 화면만 그리는 순수 함수입니다. 바꿀 일은 콜백으로 부모에게 올립니다.' },
  { id: 'batch', title: '모아서 한 번에', body: '한 이벤트 안의 setState는 마이크로태스크까지 모았다가 렌더 한 번으로 반영합니다.' },
];

function Rules() {
  return h(
    'ul',
    { class: 'rules' },
    RULES.map((r, i) =>
      h('li', { key: r.id, class: 'rule' }, h('span', { class: 'rule-no' }, String(i + 1)), h('strong', null, r.title), h('p', null, r.body)),
    ),
  );
}

function DemoPanel({ onRestart }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'demo-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'demo-title' }, h('span', { class: 'step' }, 'App'), '장바구니 데모'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: onRestart }, '처음부터'),
    ),
    // 별도 루트가 mount되는 자리. 자식을 선언하지 않는다.
    h('div', { key: 'demo-root', id: 'demo-root', class: 'demo-stage' }),
    h(
      'p',
      { class: 'tip' },
      h('strong', null, '해 볼 것 '),
      '“모두 +1”은 setState를 품목 수만큼 부르지만 렌더는 1번입니다. “간단히 보기”는 렌더는 되지만 합계(useMemo)는 다시 계산하지 않습니다.',
    ),
  );
}

function Stat({ label, value, sub }) {
  return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value), sub ? h('small', null, sub) : null);
}

function Totals({ totals }) {
  return h(
    'dl',
    { class: 'totals' },
    h(Stat, { label: '렌더', value: String(totals.renders), sub: 'App 호출' }),
    h(Stat, { label: 'setState', value: String(totals.setCalls), sub: '호출 합계' }),
    h(Stat, { label: 'useMemo 계산', value: String(totals.memoRuns), sub: `${totals.renders - totals.memoRuns}번 건너뜀` }),
    h(Stat, { label: 'DOM 변경', value: String(totals.domChanges), sub: '누적 건수' }),
  );
}

function HookSlots({ hooks, prevHooks, renderNo }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'hooks-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'hooks-title' }, h('span', { class: 'step' }, 'app.hooks'), 'Hook 슬롯'),
      h('span', { class: 'panel-note' }, '선언 순서 = 슬롯 번호. 렌더마다 같은 순서로 읽습니다.'),
    ),
    hooks.length === 0
      ? h('p', { class: 'empty' }, '데모를 불러오는 중…')
      : h(
          'ol',
          { class: 'slots' },
          hooks.map((slot) => {
            const label = HOOK_LABELS[slot.index] ?? { name: '?', call: slot.type, note: '' };
            const prev = prevHooks[slot.index];
            const changed = prev && (prev.value !== slot.value || prev.deps !== slot.deps);
            return h(
              'li',
              { key: String(slot.index), class: 'slot' },
              h('span', { class: 'slot-no' }, String(slot.index)),
              h('span', { class: `badge-type ${TYPE_CLASS[slot.type]}` }, label.call),
              h('span', { class: 'slot-name' }, h('strong', null, label.name), h('small', null, label.note)),
              h(
                'code',
                // 바뀐 값은 key를 바꿔 새 요소로 교체해 강조 애니메이션을 다시 재생한다.
                { key: changed ? `v-${renderNo}` : 'v', class: changed ? 'slot-value changed' : 'slot-value' },
                slot.type === 'EFFECT'
                  ? `deps ${slot.deps ?? '없음'}${slot.hasCleanup ? ' · cleanup 있음' : ''}`
                  : slot.value,
              ),
            );
          }),
        ),
  );
}

function TreeNode({ node, calls, renderNo }) {
  const count = calls[node.name] ?? 0;
  return h(
    'li',
    { key: node.name, class: count ? 'tree-node' : 'tree-node idle' },
    h(
      'div',
      { class: 'tree-line' },
      h('code', { class: 'tree-name' }, `<${node.name}${node.many ? ' ×n' : ''}>`),
      node.props.length > 0 && h('span', { class: 'tree-props' }, node.props.join(', ')),
      node.role && h('span', { class: 'tree-role' }, node.role),
      h(
        'span',
        // 호출된 컴포넌트는 렌더마다 key가 바뀌어 배지가 새로 그려지며 깜빡인다.
        { key: count ? `c-${renderNo}` : 'c', class: count ? 'tree-count hit' : 'tree-count' },
        count ? `호출 ${count}회` : '호출 안 됨',
      ),
    ),
    node.children &&
      h('ul', { class: 'tree-children' }, node.children.map((child) => h(TreeNode, { key: child.name, node: child, calls, renderNo }))),
  );
}

function ComponentTree({ calls, renderNo }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'tree-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'tree-title' }, '컴포넌트 트리'),
      h('span', { class: 'panel-note' }, '마지막 렌더 기준 · 이름 옆은 부모가 넘긴 props'),
    ),
    h('ul', { class: 'tree' }, h(TreeNode, { node: TREE, calls, renderNo })),
    h(
      'p',
      { class: 'tip' },
      '상태가 바뀌면 루트부터 모든 컴포넌트 함수가 다시 호출됩니다. 그래도 실제 DOM은 diff가 찾은 부분만 바뀝니다.',
    ),
  );
}

function RenderLog({ log }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'log-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'log-title' }, '렌더 기록'),
      h('span', { class: 'panel-note' }, '최근 순'),
    ),
    log.length === 0
      ? h('p', { class: 'empty' }, '아직 기록이 없습니다.')
      : h(
          'ol',
          { class: 'log' },
          log.map((entry) =>
            h(
              'li',
              { key: String(entry.no), class: 'log-entry' },
              h('div', { class: 'log-head' }, h('span', { class: 'log-no' }, `#${entry.no}`), h('strong', null, entry.action)),
              h(
                'div',
                { class: 'log-facts' },
                h(
                  'span',
                  { class: entry.setCalls > 1 ? 'fact batch' : 'fact' },
                  entry.setCalls === 0 ? 'setState 없이 렌더' : `setState ${entry.setCalls}회 → 렌더 1회`,
                ),
                h('span', { class: 'fact' }, `컴포넌트 호출 ${entry.componentCalls}회`),
                h('span', { class: 'fact' }, `DOM 변경 ${entry.domChanges}건`),
                h('span', { class: entry.memoRan ? 'fact memo' : 'fact skip' }, entry.memoRan ? 'useMemo 다시 계산' : 'useMemo 건너뜀'),
              ),
              entry.effects.length > 0 &&
                h(
                  'ul',
                  { class: 'log-effects' },
                  entry.effects.map((e, i) =>
                    h('li', { key: String(i) }, h('code', null, `useEffect #${e.slot}`), ' ', e.text),
                  ),
                ),
            ),
          ),
        ),
  );
}

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

let demo = null; // 데모 루트 핸들 (unmount용)

function App() {
  const nav = useSidebar(); // 사이드바 열림 상태. Hook이므로 루트에서 부른다.
  const [log, setLog] = useState([]); // 렌더 보고, 최근 순
  const [run, setRun] = useState(0); // "처음부터"를 누를 때마다 증가 → 데모를 다시 mount

  // 데모 mount. run이 바뀌면 cleanup이 이전 데모를 내리고 새로 올린다.
  useEffect(() => {
    let no = 0;
    demo = mountDemo(document.getElementById('demo-root'), (report) => {
      no += 1;
      const componentCalls = Object.values(report.calls).reduce((a, b) => a + b, 0);
      setLog((list) => [{ ...report, no, componentCalls }, ...list].slice(0, MAX_LOG));
    });
    return () => demo.unmount();
  }, [run]);

  const latest = log[0];
  const totals = useMemo(
    () => ({
      renders: latest ? latest.no : 0,
      setCalls: log.reduce((s, e) => s + e.setCalls, 0),
      memoRuns: latest ? latest.memoRuns : 0,
      domChanges: log.reduce((s, e) => s + e.domChanges, 0),
    }),
    [log],
  );

  return h(
    PageShell,
    { nav },
    h(Intro, null),
    h(
      'section',
      { class: 'page-body' },
      h(
        'div',
        { class: 'container' },
        h(Rules, null),
        h(
          'div',
          { class: 'cp-grid' },
          h(DemoPanel, {
            onRestart: () => {
              setLog([]);
              setRun((n) => n + 1);
            },
          }),
          h(
            'div',
            { class: 'cp-side' },
            h(Totals, { totals }),
            h(HookSlots, { hooks: latest?.hooks ?? [], prevHooks: log[1]?.hooks ?? [], renderNo: latest?.no ?? 0 }),
          ),
        ),
        h(
          'div',
          { class: 'cp-grid' },
          h(ComponentTree, { calls: latest?.calls ?? {}, renderNo: latest?.no ?? 0 }),
          h(RenderLog, { log }),
        ),
      ),
    ),
  );
}

mount(h(App), document.getElementById('app'));
