// Diff · Patch 시각화 페이지. 페이지 UI는 Mini React(h · mount · Hooks)로 그린다.
// "무대(stage)"는 시각화 대상인 별도 DOM이다. 페이지 diff가 건드리지 않도록 자식 없는 고정 요소로 두고,
// 그 안은 engine.js가 domToVdom · diff · patch로 직접 다룬다.
// 규칙(docs/contracts.md 6장): Hook은 루트(App)에서만 쓰고, 자식은 props만 받는 순수 함수다.
import { h, mount, useState, useEffect, useMemo } from '../../lib/index.js';
import { PageShell } from '../shared/layout.js';
import { useSidebar } from '../shared/useSidebar.js';
import { SCENARIOS, findScenario } from './scenarios.js';
import { parseHtml, toHtml, renderStage, patchStage, flashChanges, describePatch } from './engine.js';

const PATCH_TYPES = ['CREATE', 'REMOVE', 'REPLACE', 'TEXT', 'PROPS', 'MOVE'];
const KIND_OF = { CREATE: 'create', REMOVE: 'remove', REPLACE: 'create', TEXT: 'text', PROPS: 'props', MOVE: 'move' };
const ms = (v) => (v < 0.1 ? '<0.1ms' : `${v.toFixed(1)}ms`);

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
        '어떤 Patch가 나왔는지, DOM 노드를 몇 개나 다시 썼는지 바로 확인해 보세요.',
      ),
    ),
  );
}

function ScenarioTabs({ activeId, onSelect }) {
  return h(
    'div',
    { class: 'scenarios', role: 'group', 'aria-label': '시나리오' },
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

function StagePanel({ html }) {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'stage-title' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'stage-title' }, h('span', { class: 'step' }, 'Before'), '지금 화면'),
      h('span', { class: 'panel-note' }, '실제 DOM · patch()로만 바뀜'),
    ),
    // 무대: 자식을 선언하지 않으므로 페이지 diff는 이 안을 비교하지 않는다.
    h('div', { key: 'stage', id: 'vz-stage', class: 'stage' }),
    h('pre', { class: 'code', 'aria-label': '지금 화면의 HTML' }, h('code', null, html)),
  );
}

function EditorPanel({ scenario, editorKey, error, onSubmit, onReset }) {
  return h(
    'form',
    { class: 'panel', 'aria-labelledby': 'editor-title', onsubmit: onSubmit },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'editor-title' }, h('span', { class: 'step' }, 'After'), '바꿀 화면'),
      h('span', { class: 'panel-note' }, '자유롭게 고쳐 보세요'),
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
      scenario.after,
    ),
    h('p', { class: error ? 'form-error' : 'form-error empty', role: 'alert' }, error ?? ''),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Patch 실행'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: onReset }, '처음 상태로'),
      h('span', { class: 'kbd-hint' }, h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'Enter')),
    ),
  );
}

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
    h('div', { key, class: `stat ${cls}` }, h('dt', null, label), h('dd', null, stats ? String(value) : '–'));
  const before = stats ? stats.reused + stats.removed : 0;
  return h(
    'div',
    { class: 'stats-wrap' },
    h(
      'dl',
      { class: 'stats' },
      item('count', 'Patch', count, ''),
      item('reused', '재사용한 노드', stats?.reused, 't-keep'),
      item('created', '새로 만든 노드', stats?.created, 't-create'),
      item('removed', '지운 노드', stats?.removed, 't-remove'),
    ),
    h(
      'p',
      { class: 'compare' },
      stats
        ? `innerHTML로 통째로 바꿨다면 노드 ${before}개를 지우고 ${stats.total}개를 새로 만들었을 겁니다.`
        : 'Patch를 실행하면 DOM 노드를 얼마나 재사용했는지 보여 줍니다.',
    ),
  );
}

function PatchList({ result }) {
  if (!result || result.error) {
    return h('p', { class: 'empty' }, 'After를 고치고 Patch를 실행해 보세요.');
  }
  if (result.rows.length === 0) {
    return h('p', { class: 'empty' }, '바뀐 것이 없어 Patch가 0개입니다. DOM도 전혀 건드리지 않았습니다.');
  }
  return h(
    'ol',
    { class: 'patches' },
    result.rows.map((row) =>
      h(
        'li',
        { key: row.id, class: 'patch-row' },
        h('span', { class: 'patch-no' }, String(row.id + 1)),
        h('span', { class: `badge-type t-${KIND_OF[row.type]}` }, row.type),
        h('code', { class: 'patch-path', title: 'old 트리 기준 경로' }, `[${row.path.join(', ')}]`),
        h('span', { class: 'patch-target' }, row.target),
        h('span', { class: 'patch-detail' }, row.detail),
      ),
    ),
  );
}

function TypeCounts({ rows }) {
  return h(
    'div',
    { class: 'type-counts' },
    PATCH_TYPES.map((t) => {
      const n = rows ? rows.filter((r) => r.type === t).length : 0;
      return h('span', { key: t, class: n ? `badge-type t-${KIND_OF[t]}` : 'badge-type off' }, `${t} ${n}`);
    }),
  );
}

function ResultPanel({ result, vnodeJson }) {
  const ok = result && !result.error ? result : null;
  return h(
    'section',
    { class: 'panel result', 'aria-labelledby': 'result-title', 'aria-live': 'polite' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { id: 'result-title' }, '결과'),
      h(
        'span',
        { class: 'legend', 'aria-label': '강조 색' },
        h('span', { class: 'dot t-create' }, '새로 만듦'),
        h('span', { class: 'dot t-move' }, '이동'),
        h('span', { class: 'dot t-text' }, '텍스트'),
        h('span', { class: 'dot t-props' }, '속성'),
      ),
    ),
    h(Pipeline, { timing: ok?.timing }),
    h(Stats, { stats: ok?.stats, count: ok?.rows.length }),
    h('h3', { class: 'sub' }, 'Patch 목록'),
    h(TypeCounts, { rows: ok?.rows }),
    h(PatchList, { result }),
    h(
      'details',
      { class: 'vnode' },
      h('summary', null, '지금 화면의 VNode 보기'),
      h('pre', { class: 'code' }, h('code', null, vnodeJson)),
    ),
  );
}

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

const stageEl = () => document.getElementById('vz-stage');
let stageRoot = null; // 무대의 루트 DOM 노드. patch가 루트를 교체하면 새 노드로 바뀐다.

const initialId = findScenario(new URLSearchParams(location.search).get('s')).id;

function App() {
  const nav = useSidebar(); // 사이드바 열림 상태. Hook이므로 루트에서 부른다.
  const [scenarioId, setScenarioId] = useState(initialId);
  const [current, setCurrent] = useState(() => parseHtml(findScenario(initialId).before));
  const [result, setResult] = useState(null);
  const [editorVersion, setEditorVersion] = useState(0);

  const scenario = findScenario(scenarioId);
  const currentHtml = useMemo(() => toHtml(current), [current]);
  const vnodeJson = useMemo(() => JSON.stringify(current, null, 2), [current]);

  // 첫 화면의 무대를 그린다. 이후 무대는 이벤트 핸들러가 직접 갱신한다.
  useEffect(() => {
    stageRoot = renderStage(stageEl(), current);
  }, []);

  // 고른 시나리오를 주소에 남겨 공유·새로고침해도 유지되게 한다.
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('s', scenarioId);
    history.replaceState(null, '', url);
    document.title = `${scenario.label} · Diff 시각화 · Mini React`;
  }, [scenarioId]);

  const load = (next) => {
    const vnode = parseHtml(next.before);
    stageRoot = renderStage(stageEl(), vnode);
    setScenarioId(next.id);
    setCurrent(vnode);
    setResult(null);
    setEditorVersion((n) => n + 1); // 편집기 key가 바뀌어 새 내용으로 교체된다
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const text = event.currentTarget.elements.after.value;
    try {
      const t0 = performance.now();
      const next = parseHtml(text);
      const parse = performance.now() - t0;

      const run = patchStage(stageEl(), stageRoot, current, next);
      stageRoot = run.root;
      flashChanges(run.changes);

      setCurrent(next);
      setResult({
        rows: run.patches.map((p, i) => ({ id: i, type: p.type, path: p.path, ...describePatch(p, current) })),
        stats: run.stats,
        timing: { parse, ...run.timing },
      });
    } catch (error) {
      setResult({ error: error.message.replace(/^\[mini-react\]\s*/, '') });
    }
  };

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
        h(ScenarioTabs, { activeId: scenarioId, onSelect: (id) => load(findScenario(id)) }),
        h(Hint, { scenario }),
        h(
          'div',
          { class: 'vz-grid' },
          h(StagePanel, { html: currentHtml }),
          h(EditorPanel, {
            scenario,
            editorKey: `after-${scenarioId}-${editorVersion}`,
            error: result?.error ?? null,
            onSubmit,
            onReset: () => load(scenario),
          }),
        ),
        h(ResultPanel, { result, vnodeJson }),
      ),
    ),
  );
}

mount(h(App), document.getElementById('app'));
