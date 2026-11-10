// Diff · Patch 시각화 페이지. 페이지 UI는 Mini React(h · mount · Hooks)로 그린다.
// "무대(stage)"는 시각화 대상인 별도 DOM이다. 페이지 diff가 건드리지 않도록 자식 없는 고정 요소로 두고,
// 그 안은 engine.js가 domToVdom · diff · patch로 직접 다룬다.
// 규칙(docs/contracts.md 6장): Hook은 루트(App)에서만 쓰고, 자식은 props만 받는 순수 함수다.
import { h, mount, useState, useEffect, diff } from '../../lib/index.js';
import { PageShell } from '../shared/layout.js';
import { useSidebar } from '../shared/useSidebar.js';
import { SCENARIOS, findScenario } from './scenarios.js';
import { parseHtml, renderStage, patchStage, flashChanges, describePatch } from './engine.js';
import { annotate, pathKey } from './annotate.js';
import { createHistory, addChild, parentOf, forwardTarget, siblingsOf } from './history.js';

const PATCH_TYPES = ['CREATE', 'REMOVE', 'REPLACE', 'TEXT', 'PROPS', 'MOVE'];
// 이 페이지 안에서는 .vz 아래 CSS가 t-text(노랑) · t-props(파랑)로 바꿔 쓴다. (visualizer.css)
const KIND_OF = { CREATE: 'create', REMOVE: 'remove', REPLACE: 'replace', TEXT: 'text', PROPS: 'props', MOVE: 'move' };
const KIND_LABEL = { create: 'CREATE', remove: 'REMOVE', replace: 'REPLACE', text: 'TEXT', props: 'PROPS', move: 'MOVE' };
const PRIORITY = ['remove', 'create', 'replace', 'move', 'text', 'props']; // 노드 상자 색을 정할 때의 우선순위
const ms = (v) => (v < 0.1 ? '<0.1ms' : `${v.toFixed(1)}ms`);
const cleanMessage = (error) => String(error?.message ?? error).replace(/^\[mini-react\]\s*/, '');

/** 표시 종류 -> 색 클래스. 교체는 이전 트리에서는 삭제색, 이후 트리에서는 생성색. */
function colorClass(kind, side) {
  if (kind === 'replace') return side === 'old' ? 't-remove' : 't-create';
  return `t-${kind}`;
}

const RESULT_BADGE = { run: 'Patch 실행', nav: '히스토리 이동 비교', noop: '변경 없음', error: '실패' };

/* ---------- 자식 컴포넌트 (상태 없음) ---------- */

function Intro() {
  return h(
    'section',
    { class: 'page-intro' },
    h(
      'div',
      { class: 'container' },
      h('p', { class: 'eyebrow' }, 'Visualizer'),
      h('h1', null, 'Diff · Patch 시각화'),
      h(
        'p',
        { class: 'lead' },
        'HTML을 고치고 Patch를 누르면 Mini React가 두 화면을 비교해 바뀐 부분만 실제 DOM에 반영합니다. ',
        '이전·이후 VNode 트리에서 무엇이 바뀌었는지, 실행 기록을 오가며 확인해 보세요.',
      ),
    ),
  );
}

function ScenarioTabs({ activeId, onSelect }) {
  return h(
    'div',
    { class: 'scenarios', role: 'group', 'aria-label': '예제' },
    SCENARIOS.map((s) =>
      h(
        'button',
        {
          key: s.id,
          type: 'button',
          class: s.id === activeId ? 'scenario active' : 'scenario',
          'aria-pressed': String(s.id === activeId),
          onclick: () => onSelect(s.id),
        },
        s.label,
      ),
    ),
  );
}

function Hint({ scenario }) {
  return h(
    'p',
    { class: 'hint' },
    h('span', { class: 'hint-types' }, scenario.expect.map((t) => h('span', { key: t, class: `badge-type t-${KIND_OF[t]}` }, t))),
    h('span', null, scenario.hint),
  );
}

function PreviewPanel({ id, html }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'stage-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'stage-title' }, h('span', { class: 'step' }, 'Preview'), `지금 화면 #${id}`),
      h('span', { class: 'panel-note' }, '실제 DOM · patch()로만 바뀜'),
    ),
    // 무대: 자식을 선언하지 않으므로 페이지 diff는 이 안을 비교하지 않는다.
    h('div', { key: 'stage', id: 'vz-stage', class: 'stage' }),
    h('pre', { class: 'code', 'aria-label': '지금 화면의 HTML' }, h('code', null, html)),
  );
}

/** 히스토리 그래프의 한 노드와 그 아래 가지. 재귀하는 일반 함수(컴포넌트 아님). */
function historyItem(hist, id, selectedId, onSelect) {
  const node = hist.nodes[id];
  const selected = id === selectedId;
  return h(
    'li',
    { key: String(id) },
    h(
      'button',
      {
        type: 'button',
        class: selected ? 'hnode selected' : 'hnode',
        'data-hid': String(id),
        'aria-current': selected ? 'true' : null,
        title: node.parentId === null ? '처음 상태' : `#${node.parentId}에서 Patch ${node.patchCount}개`,
        onclick: () => onSelect(id),
      },
      h('span', { class: 'hn-id' }, `#${id}`),
      h('span', { class: 'hn-meta' }, node.parentId === null ? '초기' : `Patch ${node.patchCount}개`),
      node.parentId === null ? null : h('span', { class: 'hn-sum' }, node.summary),
    ),
    node.children.length > 0
      ? h('ul', null, node.children.map((childId) => historyItem(hist, childId, selectedId, onSelect)))
      : null,
  );
}

function HistoryPanel({ hist, selectedId, onSelect }) {
  const parentId = parentOf(hist, selectedId);
  const forwardId = forwardTarget(hist, selectedId);
  const branching = hist.nodes[selectedId].children.length > 1;

  // 그래프 안에서 방향키로 포커스를 옮긴다. 선택은 Enter/Space(버튼 기본 동작)로 한다.
  const onKeyDown = (event) => {
    const button = event.target.closest ? event.target.closest('[data-hid]') : null;
    if (!button) return;
    const id = Number(button.getAttribute('data-hid'));
    const siblings = siblingsOf(hist, id);
    const at = siblings.indexOf(id);
    const to = {
      ArrowLeft: parentOf(hist, id),
      ArrowRight: hist.nodes[id].children[0] ?? null,
      ArrowUp: siblings[at - 1] ?? null,
      ArrowDown: siblings[at + 1] ?? null,
    }[event.key];
    if (to === undefined || to === null) return;
    event.preventDefault();
    const next = document.querySelector(`[data-hid="${to}"]`);
    if (next) next.focus();
  };

  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'history-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'history-title' }, h('span', { class: 'step' }, 'History'), '실행 기록'),
      h('span', { class: 'panel-note' }, '노드를 누르면 그 상태로 이동'),
    ),
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', disabled: parentId === null, onclick: () => onSelect(parentId) },
        '← 뒤로',
      ),
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', disabled: forwardId === null, onclick: () => onSelect(forwardId) },
        '앞으로 →',
      ),
      branching ? h('span', { class: 'panel-note' }, '분기: 그래프에서 선택') : null,
    ),
    h(
      'div',
      { class: 'hist-scroll', onkeydown: onKeyDown },
      h('ul', { class: 'tree hist-tree', 'aria-label': '실행 기록 그래프' }, historyItem(hist, hist.rootId, selectedId, onSelect)),
    ),
  );
}

function EditorPanel({ text, editorKey, onSubmit, onReset }) {
  return h(
    'form',
    { class: 'panel', 'aria-labelledby': 'editor-title', onsubmit: onSubmit },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'editor-title' }, h('span', { class: 'step' }, 'After'), '바꿀 화면'),
      h('span', { class: 'panel-note' }, '지금 선택한 상태에서 출발합니다'),
    ),
    h(
      'textarea',
      {
        key: editorKey,
        name: 'after',
        class: 'editor',
        spellcheck: 'false',
        autocomplete: 'off',
        'aria-label': '바꿀 화면의 HTML',
        onkeydown: (event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form.requestSubmit();
          }
        },
      },
      text,
    ),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Patch 실행'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: onReset }, '처음 상태로'),
      h('span', { class: 'kbd-hint' }, h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'Enter')),
    ),
  );
}

/* ---------- VNode 트리 비교 ---------- */

const uniqueKinds = (marks) => [...new Set(marks.map((m) => m.kind))];

function primaryKind(marks) {
  return PRIORITY.find((k) => marks.some((m) => m.kind === k));
}

/** 속성 하나를 `name="value"`로. 바뀐 속성은 강조하고, 이 쪽에 없으면 (없음)으로 보여 준다. */
function attrItem(name, value, changed) {
  const text = value === undefined ? `${name} (없음)` : value === '' ? name : `${name}="${value}"`;
  return h('span', { key: name, class: changed ? 'vt-attr changed t-props' : 'vt-attr' }, text);
}

/** VNode 하나와 그 아래 가지를 li로 그린다. 재귀하는 일반 함수(컴포넌트 아님). */
function treeItem(vnode, path, ctx) {
  const key = pathKey(path);
  const own = ctx.marks.get(key) ?? [];
  const lead = primaryKind(own);
  const boxClass = lead ? `vt-box marked ${colorClass(lead, ctx.side)}` : 'vt-box';
  const badges = uniqueKinds(own).map((kind) =>
    h('span', { key: kind, class: `badge-type ${colorClass(kind, ctx.side)}` }, KIND_LABEL[kind]),
  );
  const liKey = path.length === 0 ? 'root' : String(path.at(-1));

  if (vnode.type === '#text') {
    const changed = own.some((m) => m.kind === 'text');
    return h(
      'li',
      { key: liKey },
      h(
        'div',
        { class: boxClass },
        h('span', { class: changed ? 'vt-text changed t-text' : 'vt-text' }, `"${vnode.value}"`),
        badges,
      ),
    );
  }

  const { children: kids, ...attrs } = vnode.props;
  const changedNames = new Set(own.filter((m) => m.kind === 'props').flatMap((m) => m.names));
  const attrItems = Object.entries(attrs)
    .filter(([, v]) => typeof v === 'string')
    .map(([name, value]) => attrItem(name, value, changedNames.has(name)));
  for (const name of changedNames) if (!Object.hasOwn(attrs, name)) attrItems.push(attrItem(name, undefined, true));

  const foldKey = `${ctx.side}:${key}`;
  const folded = kids.length > 0 && ctx.collapsed.includes(foldKey);
  const hidden = folded
    ? [...ctx.marks.keys()].filter((k) => (path.length === 0 ? k !== '' : k.startsWith(`${key}.`))).length
    : 0;

  return h(
    'li',
    { key: liKey },
    h(
      'div',
      { class: boxClass },
      kids.length > 0
        ? h(
            'button',
            {
              type: 'button',
              class: 'vt-toggle',
              'aria-expanded': String(!folded),
              'aria-label': `<${vnode.type}> ${folded ? '펼치기' : '접기'}`,
              onclick: () => ctx.onToggle(foldKey),
            },
            folded ? '▸' : '▾',
          )
        : null,
      h('code', { class: 'vt-tag' }, `<${vnode.type}>`),
      vnode.key !== null ? h('span', { class: 'vt-key' }, `key="${vnode.key}"`) : null,
      attrItems,
      badges,
      hidden > 0 ? h('span', { class: 'badge-type vt-hidden' }, `변경 ${hidden}`) : null,
    ),
    kids.length > 0 && !folded ? h('ul', null, kids.map((child, i) => treeItem(child, [...path, i], ctx))) : null,
  );
}

function TreeColumn({ title, id, vnode, marks, side, collapsed, onToggle }) {
  return h(
    'div',
    { class: 'vt-col' },
    h('h3', { class: 'sub' }, `${title} · #${id}`),
    h('ul', { class: 'tree vt', 'aria-label': `${title} VNode 트리` }, treeItem(vnode, [], { side, marks, collapsed, onToggle })),
    h(
      'details',
      { class: 'vnode' },
      h('summary', null, 'JSON으로 보기'),
      h('pre', { class: 'code' }, h('code', null, JSON.stringify(vnode, null, 2))),
    ),
  );
}

function Legend() {
  return h(
    'span',
    { class: 'legend', 'aria-label': '강조 색' },
    h('span', { class: 'dot t-create' }, '생성'),
    h('span', { class: 'dot t-remove' }, '삭제'),
    h('span', { class: 'dot t-move' }, '이동'),
    h('span', { class: 'dot t-text' }, '텍스트'),
    h('span', { class: 'dot t-props' }, '속성'),
    h('span', { class: 'dot-pair' }, h('span', { class: 'dot t-remove' }, '교체'), h('span', { class: 'dot t-create' }, '이전 → 이후')),
  );
}

function ComparePanel({ result, collapsed, onToggle }) {
  const head = (extra) =>
    h(
      'header',
      { class: 'panel-head' },
      h(
        'h2',
        { id: 'compare-title' },
        h('span', { class: 'step' }, 'Diff'),
        '이전 · 이후 비교',
        result ? h('span', { class: `badge-type vk-${result.kind}` }, RESULT_BADGE[result.kind]) : null,
        extra,
      ),
      result && result.kind !== 'error' ? h(Legend, null) : null,
    );

  if (!result) {
    return h(
      'section',
      { class: 'panel', 'aria-labelledby': 'compare-title' },
      head(null),
      h('p', { class: 'empty' }, 'After를 고치고 Patch를 실행하면 이전·이후 트리가 여기에 나란히 나옵니다.'),
    );
  }
  if (result.kind === 'error') {
    return h(
      'section',
      { class: 'panel', 'aria-labelledby': 'compare-title', 'aria-live': 'polite' },
      head(null),
      h('p', { class: 'form-error', role: 'alert' }, result.message),
    );
  }
  const range = result.kind === 'noop' ? `#${result.toId}` : `#${result.fromId} → #${result.toId}`;
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'compare-title', 'aria-live': 'polite' },
    head(h('span', { class: 'range' }, range)),
    result.kind === 'noop'
      ? h('p', { class: 'panel-note' }, '바뀐 것이 없어 Patch가 0개입니다. DOM도 전혀 건드리지 않았고 기록에도 남기지 않았습니다.')
      : null,
    h(
      'div',
      { class: 'vt-cols' },
      h(TreeColumn, { title: '이전 트리', id: result.fromId, vnode: result.oldV, marks: result.marks.old, side: 'old', collapsed, onToggle }),
      h(TreeColumn, { title: '이후 트리', id: result.toId, vnode: result.newV, marks: result.marks.new, side: 'new', collapsed, onToggle }),
    ),
  );
}

/* ---------- Patch 목록 ---------- */

function Pipeline({ timing }) {
  const step = (no, fn, label, value) =>
    h(
      'li',
      { key: fn, class: 'pipe-step' },
      h('span', { class: 'pipe-no' }, no),
      h('code', null, fn),
      h('span', { class: 'pipe-label' }, label),
      h('span', { class: 'pipe-ms' }, timing ? ms(value) : '–'),
    );
  return h(
    'ol',
    { class: 'pipeline', 'aria-label': '처리 단계' },
    step('1', 'domToVdom', 'HTML → VNode', timing?.parse),
    step('2', 'diff', 'VNode 비교 → Patch[]', timing?.diff),
    step('3', 'patch', 'Patch → 실제 DOM', timing?.patch),
  );
}

function Stats({ stats, count }) {
  const item = (key, label, value, cls) =>
    h('div', { key, class: `stat ${cls}` }, h('dt', null, label), h('dd', null, String(value)));
  const before = stats.reused + stats.removed;
  return h(
    'div',
    { class: 'stats-wrap' },
    h(
      'dl',
      { class: 'stats' },
      item('count', 'Patch', count, ''),
      item('reused', '재사용한 노드', stats.reused, 't-keep'),
      item('created', '새로 만든 노드', stats.created, 't-create'),
      item('removed', '지운 노드', stats.removed, 't-remove'),
    ),
    h('p', { class: 'compare' }, `innerHTML로 통째로 바꿨다면 노드 ${before}개를 지우고 ${stats.total}개를 새로 만들었을 겁니다.`),
  );
}

function TypeCounts({ rows }) {
  return h(
    'div',
    { class: 'type-counts' },
    PATCH_TYPES.map((t) => {
      const n = rows.filter((r) => r.type === t).length;
      return h('span', { key: t, class: n ? `badge-type t-${KIND_OF[t]}` : 'badge-type off' }, `${t} ${n}`);
    }),
  );
}

function PatchRows({ rows }) {
  return h(
    'ol',
    { class: 'patches' },
    rows.map((row) =>
      h(
        'li',
        { key: String(row.id), class: 'patch-row' },
        h('span', { class: 'patch-no' }, String(row.id + 1)),
        h('span', { class: `badge-type t-${KIND_OF[row.type]}` }, row.type),
        h(
          'div',
          { class: 'patch-main' },
          h('div', { class: 'patch-line' }, h('span', { class: 'patch-target' }, row.target), h('code', { class: 'patch-path' }, `[${row.path.join(', ')}]`)),
          h('div', { class: 'patch-basis' }, row.basis),
          row.details.map((line, i) => h('div', { key: String(i), class: 'patch-detail' }, line)),
        ),
      ),
    ),
  );
}

function PatchPanel({ result }) {
  let body;
  if (!result) body = h('p', { class: 'empty' }, 'Patch를 실행하면 여기에 Patch 목록이 나옵니다.');
  else if (result.kind === 'error') body = h('p', { class: 'empty' }, 'Patch를 만들지 못했습니다. 위 오류를 확인하고 After를 고쳐 다시 실행해 보세요.');
  else if (result.kind === 'noop') body = h('p', { class: 'empty' }, 'Patch 0개 · 바뀐 것이 없습니다.');
  else
    body = h(
      'div',
      { class: 'patch-body' },
      result.kind === 'run' ? h(Pipeline, { timing: result.timing }) : null,
      result.kind === 'run' ? h(Stats, { stats: result.stats, count: result.rows.length }) : null,
      result.kind === 'nav'
        ? h('p', { class: 'panel-note' }, `#${result.fromId}에서 #${result.toId}로 옮기려고 diff · patch를 다시 실행한 결과입니다. (Patch ${result.rows.length}개)`)
        : null,
      h(TypeCounts, { rows: result.rows }),
      result.rows.length === 0 ? h('p', { class: 'empty' }, '두 상태가 같아 Patch가 0개입니다.') : h(PatchRows, { rows: result.rows }),
    );
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'patches-title' },
    h('header', { class: 'panel-head' }, h('h2', { id: 'patches-title' }, h('span', { class: 'step' }, 'Patch'), 'Patch 목록')),
    body,
  );
}

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

const stageEl = () => document.getElementById('vz-stage');
let stageRoot = null; // 무대의 루트 DOM 노드. patch가 루트를 교체하면 새 노드로 바뀐다.

const initialId = findScenario(new URLSearchParams(location.search).get('s')).id;

/** 예제 하나를 처음 상태로 만든다: 히스토리 루트 = 예제 before, 편집기 = 예제 after. */
function initModel(scenarioId) {
  const scenario = findScenario(scenarioId);
  const hist = createHistory(parseHtml(scenario.before));
  return { scenarioId: scenario.id, hist, selectedId: hist.rootId, result: null, editorText: scenario.after, collapsed: [] };
}

function App() {
  const nav = useSidebar(); // 사이드바 열림 상태. Hook이므로 루트에서 부른다.
  const [model, setModel] = useState(() => ({ ...initModel(initialId), editorVersion: 0 }));
  const { scenarioId, hist, selectedId, result, editorText, editorVersion, collapsed } = model;

  const scenario = findScenario(scenarioId);
  const selected = hist.nodes[selectedId];
  const currentHtml = selected.html;

  // 첫 화면의 무대를 그린다. 이후 무대는 이벤트 핸들러가 직접 갱신한다.
  useEffect(() => {
    stageRoot = renderStage(stageEl(), selected.vnode);
  }, []);

  // 고른 예제를 주소에 남겨 공유·새로고침해도 유지되게 한다. 예전 ?s= 값은 새 id로 바뀐다.
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('s', scenarioId);
    history.replaceState(null, '', url);
    document.title = `${scenario.label} · Diff 시각화 · Mini React`;
  }, [scenarioId]);

  const load = (id) => {
    const fresh = initModel(id);
    stageRoot = renderStage(stageEl(), fresh.hist.nodes[fresh.hist.rootId].vnode);
    setModel((prev) => ({ ...fresh, editorVersion: prev.editorVersion + 1 })); // 편집기 key가 바뀌어 새 내용으로 교체된다
  };

  /** 무대를 선택 스냅샷과 다시 맞춘다. patch가 어떤 이유로든 실패했을 때의 안전장치. */
  const resync = (vnode) => {
    stageRoot = renderStage(stageEl(), vnode);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const text = event.currentTarget.elements.after.value;
    const from = selected.vnode;
    let next;
    let patches;
    let marks;
    let staged = false;
    try {
      const t0 = performance.now();
      next = parseHtml(text);
      const parse = performance.now() - t0;
      patches = diff(from, next);
      if (patches.length === 0) {
        // 변경 없음: 무대도 기록도 건드리지 않는다.
        setModel((prev) => ({
          ...prev,
          collapsed: [],
          result: { kind: 'noop', fromId: selectedId, toId: selectedId, oldV: from, newV: from, marks: { old: new Map(), new: new Map() }, rows: [] },
        }));
        return;
      }
      marks = annotate(from, next, patches); // 분리된 DOM에서 미리 실행해 보므로 무대는 그대로다
      let run;
      try {
        run = patchStage(stageEl(), stageRoot, from, next);
      } catch (error) {
        resync(from);
        throw error;
      }
      stageRoot = run.root;
      staged = true; // 이제부터 무대는 새 화면이다. 이후 단계가 실패하면 catch에서 무대를 되돌린다.
      try {
        flashChanges(run.changes);
      } catch {
        /* 강조는 장식이다. 실패해도 patch 결과의 반영(기록 · 선택)을 막지 않는다. */
      }

      const added = addChild(hist, selectedId, next, patches);
      setModel((prev) => ({
        ...prev,
        hist: added.history,
        selectedId: added.id,
        collapsed: [],
        result: {
          kind: 'run',
          fromId: selectedId,
          toId: added.id,
          oldV: from,
          newV: next,
          marks,
          rows: patches.map((p, i) => ({ id: i, type: p.type, path: p.path, ...describePatch(p, from) })),
          stats: run.stats,
          timing: { parse, ...run.timing },
        },
      }));
    } catch (error) {
      // 실패: 입력(편집기)과 선택 상태는 그대로 두고 오류만 보여 준다. 무대가 이미 바뀌었다면 선택 스냅샷으로 되돌린다.
      if (staged) resync(from);
      setModel((prev) => ({ ...prev, collapsed: [], result: { kind: 'error', message: cleanMessage(error) } }));
    }
  };

  /** 히스토리의 다른 노드로 이동한다. 무대는 diff(보던 상태, 새 상태) + patch로 옮긴다. */
  const goTo = (id) => {
    if (id === null || id === selectedId || !hist.nodes[id]) return;
    const from = selected.vnode;
    const to = hist.nodes[id];
    let result;
    try {
      const patches = diff(from, to.vnode);
      const marks = annotate(from, to.vnode, patches);
      let run;
      try {
        run = patchStage(stageEl(), stageRoot, from, to.vnode);
      } catch (error) {
        resync(to.vnode);
        throw error;
      }
      stageRoot = run.root;
      try {
        flashChanges(run.changes);
      } catch {
        /* 강조는 장식이다. 실패해도 이동 결과를 막지 않는다. */
      }
      result = {
        kind: 'nav',
        fromId: selectedId,
        toId: id,
        oldV: from,
        newV: to.vnode,
        marks,
        rows: patches.map((p, i) => ({ id: i, type: p.type, path: p.path, ...describePatch(p, from) })),
      };
    } catch (error) {
      resync(to.vnode);
      result = { kind: 'error', message: cleanMessage(error) };
    }
    // 편집기는 이동한 상태의 HTML로 바꾼다(key가 바뀌어 textarea가 새로 만들어진다).
    setModel((prev) => ({ ...prev, selectedId: id, result, collapsed: [], editorText: to.html, editorVersion: prev.editorVersion + 1 }));
  };

  const onToggle = (foldKey) =>
    setModel((prev) => ({
      ...prev,
      collapsed: prev.collapsed.includes(foldKey) ? prev.collapsed.filter((k) => k !== foldKey) : [...prev.collapsed, foldKey],
    }));

  return h(
    PageShell,
    { nav },
    h(Intro, null),
    h(
      'section',
      { class: 'page-body vz' },
      h(
        'div',
        { class: 'container vz-stack' },
        h(ScenarioTabs, { activeId: scenarioId, onSelect: load }),
        h(Hint, { scenario }),
        h(
          'div',
          { class: 'vz-grid' },
          h(PreviewPanel, { id: selectedId, html: currentHtml }),
          h(HistoryPanel, { hist, selectedId, onSelect: goTo }),
        ),
        h(EditorPanel, {
          text: editorText,
          editorKey: `after-${scenarioId}-${editorVersion}`,
          onSubmit,
          onReset: () => load(scenarioId),
        }),
        h(ComparePanel, { result, collapsed, onToggle }),
        h(PatchPanel, { result }),
      ),
    ),
  );
}

mount(h(App), document.getElementById('app'));
