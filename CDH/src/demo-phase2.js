// [Phase 2 데모] Todo 앱. 입력·클릭에 따라 바뀐 부분만 갱신됩니다.
//
//   루트 컴포넌트  TodoApp          상태(useState)와 Hook 은 여기에만 있음
//   자식 컴포넌트  TodoForm 등       상태 없이 props 만 받는 순수 함수 (Lifting State Up)
//   Hook          useState  → todos, text, filter, seconds, running, clicks
//                 useMemo   → 보이는 목록 / 통계 (todos, filter 가 바뀔 때만 다시 계산)
//                 useEffect → 문서 제목 갱신, 타이머(cleanup 으로 정리)
import { h, FunctionComponent, useState, useEffect, useMemo } from './mini-react.js';
import { flash } from './demo-phase1.js';

// ── 자식 컴포넌트: props 만 받는 순수 함수 ────────────────

function TodoForm({ text, onTextChange, onAdd }) {
  return h(
    'form',
    { onSubmit: (e) => (e.preventDefault(), onAdd()) },
    h('input', { type: 'text', placeholder: '할 일을 입력하고 Enter', value: text, onInput: (e) => onTextChange(e.target.value) }),
    h('button', { type: 'submit', disabled: text.trim() === '' }, '추가')
  );
}

function FilterBar({ filter, counts, onFilter }) {
  const labels = { all: '전체', active: '진행 중', done: '완료' };
  return h(
    'div',
    { className: 'filters' },
    Object.entries(labels).map(([value, label]) =>
      h('button', { key: value, type: 'button', className: filter === value ? 'on' : '', onClick: () => onFilter(value) }, `${label} ${counts[value]}`)
    )
  );
}

function TodoItem({ todo, onToggle, onRemove }) {
  return h(
    'li',
    { className: todo.done ? 'done' : '' },
    h('label', null, h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }), h('span', null, todo.text)),
    h('button', { type: 'button', className: 'x', onClick: () => onRemove(todo.id) }, '×')
  );
}

function TodoList({ todos, onToggle, onRemove }) {
  if (todos.length === 0) return h('p', { className: 'empty' }, '보여 줄 할 일이 없어요.');
  // key 덕분에 항목이 지워지거나 순서가 바뀌어도 나머지 <li> 는 그대로 재사용됩니다.
  return h('ul', null, todos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle, onRemove })));
}

function Timer({ seconds, running, onToggle, onReset }) {
  const pad = (n) => String(n).padStart(2, '0');
  return h(
    'div',
    { className: 'row' },
    h('strong', null, `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`),
    h('button', { type: 'button', onClick: onToggle }, running ? '일시정지' : '시작'),
    h('button', { type: 'button', onClick: onReset }, '초기화')
  );
}

function BurstDemo({ clicks, onBurst }) {
  return h('div', { className: 'row' }, h('span', null, `연속 setState 데모: ${clicks}`), h('button', { type: 'button', onClick: onBurst }, '+1 을 3번 호출'));
}

// ── 루트 컴포넌트: 상태와 Hook 은 전부 여기에 ─────────────

export function TodoApp({ log = () => {}, onMemo = () => {} }) {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Phase 1: Virtual DOM · Diff · Patch', done: true },
    { id: 2, text: 'Phase 2: useState / useEffect / useMemo', done: false },
  ]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [clicks, setClicks] = useState(0);

  // useMemo: 타이머가 1초마다 렌더해도 todos / filter 가 그대로면 다시 계산하지 않습니다.
  const visible = useMemo(() => {
    onMemo('목록 계산');
    return todos.filter((t) => filter === 'all' || (filter === 'done') === t.done);
  }, [todos, filter]);
  const counts = useMemo(() => {
    const done = todos.filter((t) => t.done).length;
    return { all: todos.length, done, active: todos.length - done };
  }, [todos]);

  // useEffect: 화면이 그려진 "뒤에" 실행됩니다.
  useEffect(() => {
    document.title = `(${counts.active}) 할 일 · Mini React`;
    log(`문서 제목 갱신 (남은 일 ${counts.active})`);
  }, [counts.active]); // counts.active 가 바뀔 때만

  useEffect(() => {
    if (!running) return undefined;
    log('타이머 시작');
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(id); // cleanup: running 이 바뀌거나 사라질 때 정리
      log('타이머 정리(cleanup)');
    };
  }, [running]);

  // 이벤트 핸들러: 상태를 바꾸는 일은 전부 루트에서
  const add = () => {
    const value = text.trim();
    if (!value) return;
    setTodos((prev) => [...prev, { id: Math.max(0, ...prev.map((t) => t.id)) + 1, text: value, done: false }]);
    setText('');
  };
  const toggle = (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos((prev) => prev.filter((t) => t.id !== id));
  const burst = () => {
    setClicks((c) => c + 1);
    setClicks((c) => c + 1);
    setClicks((c) => c + 1);
  };

  return h(
    'section',
    { className: 'todo-app' },
    h(TodoForm, { text, onTextChange: setText, onAdd: add }),
    h(FilterBar, { filter, counts, onFilter: setFilter }),
    h(TodoList, { todos: visible, onToggle: toggle, onRemove: remove }),
    h(Timer, {
      seconds,
      running,
      onToggle: () => setRunning((r) => !r),
      onReset: () => {
        setRunning(false);
        setSeconds(0);
      },
    }),
    h(BurstDemo, { clicks, onBurst: burst })
  );
}

// hooks 배열의 칸 하나를 한 줄로 (state / effect / memo 는 칸에 든 모양으로 구분)
function describeHook(slot) {
  if ('set' in slot) return `state  ${JSON.stringify(slot.value)}`;
  if ('ran' in slot) return `effect deps=${JSON.stringify(slot.deps ?? null)}`;
  return `memo   ${JSON.stringify(slot.value)}`;
}

// ── 연결: 루트를 mount 하고 디버그 패널(렌더 횟수, hooks 배열, 패치, effect 로그)을 채웁니다 ──
export function initPhase2(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const logs = [];
  const memoRuns = {};
  let renders = 0;

  const component = new FunctionComponent(TodoApp, {
    props: {
      log(msg) {
        logs.unshift(`#${renders} ${msg}`);
        $('p2-log').textContent = logs.slice(0, 8).join('\n');
      },
      onMemo(name) {
        memoRuns[name] = (memoRuns[name] ?? 0) + 1;
        $('p2-memo').textContent = Object.entries(memoRuns).map(([k, v]) => `${k} ${v}회`).join(' · ');
      },
    },
    // 화면에 반영한 직후: 이번에 Phase 1 의 diff 가 만든 패치를 보여 줍니다
    onCommit({ patches, touched, isMount }) {
      renders++;
      $('p2-renders').textContent = String(renders);
      const dom = patches.filter((p) => !(p.op === 'PROPS' && Object.values(p.set).every((v) => typeof v === 'function') && !p.remove.length));
      $('p2-summary').textContent = isMount
        ? '처음 렌더: 전체를 만들었어요.'
        : `패치 ${dom.length}건, 건드린 DOM ${touched.length}곳 (이벤트 핸들러 교체 ${patches.length - dom.length}건은 화면 변화 없음)`;
      $('p2-patches').textContent = dom.map((p) => `${p.op}  [${p.path.join(',')}]`).join('\n');
      $('p2-hooks').textContent = component.hooks
        .map((slot, i) => `${i}  ${describeHook(slot)}`)
        .join('\n');
      if (!isMount) flash(touched);
    },
  });
  component.mount($('app'));

  const batch = $('batch-toggle');
  batch.checked = component.batch;
  batch.addEventListener('change', () => (component.batch = batch.checked));
  return component;
}
