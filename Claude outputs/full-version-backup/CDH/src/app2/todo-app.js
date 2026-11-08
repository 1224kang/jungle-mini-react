// [Phase 2 데모] 루트 컴포넌트. 상태(State)와 Hook 은 여기에만 있습니다.
//   state  : todos, text, filter, seconds, running, clicks      (useState)
//   파생값 : stats, visible                                      (useMemo)  → todos / filter 가 바뀔 때만 다시 계산
//   부수효과: 문서 제목, 저장, 타이머                            (useEffect) → DOM 이 그려진 뒤 실행, cleanup 으로 정리
// 자식(components.js)은 props 만 받는 순수 함수입니다.
import { h, useState, useEffect, useMemo } from '../lib/index.js';
import { TodoForm, FilterBar, TodoList, Stats, Timer, BurstDemo } from './components.js';

export const STORAGE_KEY = 'mini-react-phase2-todos';

export const SAMPLE_TODOS = [
  { id: 1, text: 'Phase 1: Virtual DOM · Diff · Patch', done: true },
  { id: 2, text: 'Phase 2: useState / useEffect / useMemo', done: false },
  { id: 3, text: '단위 테스트와 엣지 케이스 점검', done: false },
];

// 저장된 값이 깨졌거나 모양이 다르면 샘플로 시작합니다 (손으로 고친 localStorage 방어).
export function loadTodos(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw == null) return SAMPLE_TODOS;
    const data = JSON.parse(raw);
    const valid =
      Array.isArray(data) &&
      data.every((t) => t && Number.isFinite(t.id) && typeof t.text === 'string' && typeof t.done === 'boolean');
    return valid ? data : SAMPLE_TODOS;
  } catch {
    return SAMPLE_TODOS;
  }
}

export function computeStats(todos) {
  const total = todos.length;
  const done = todos.filter((t) => t.done).length;
  return { total, done, active: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function filterTodos(todos, filter) {
  if (filter === 'active') return todos.filter((t) => !t.done);
  if (filter === 'done') return todos.filter((t) => t.done);
  return todos;
}

/**
 * @param {{ storage?: Storage, log?: (msg: string) => void, onMemo?: (name: string) => void }} props
 */
export function TodoApp({ storage, log = () => {}, onMemo = () => {} }) {
  // ── State: 루트에만 둡니다 ──
  const [todos, setTodos] = useState(() => loadTodos(storage));
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [clicks, setClicks] = useState(0);

  // ── useMemo: 타이머가 1초마다 렌더를 일으켜도 todos 가 그대로면 다시 계산하지 않음 ──
  const stats = useMemo(() => {
    onMemo('stats');
    return computeStats(todos);
  }, [todos]);

  const visible = useMemo(() => {
    onMemo('visible');
    return filterTodos(todos, filter);
  }, [todos, filter]);

  const counts = useMemo(() => ({ all: stats.total, active: stats.active, done: stats.done }), [stats]);

  // ── useEffect: 렌더(Patch) 뒤에 실행 ──
  useEffect(() => {
    document.title = `(${stats.active}) 할 일 · Mini React`;
    log(`문서 제목 갱신 (남은 일 ${stats.active})`);
  }, [stats.active]);

  useEffect(() => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(todos));
      log('localStorage 에 저장');
    } catch {
      log('저장 실패 (용량 초과 또는 차단)');
    }
  }, [todos]);

  useEffect(() => {
    if (!running) return undefined;
    log('타이머 시작');
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      log('타이머 정리(cleanup)');
    };
  }, [running]);

  // ── 이벤트 핸들러: 상태를 바꾸는 일은 전부 여기서 ──
  const add = () => {
    const value = text.trim();
    if (!value) return;
    setTodos((prev) => [...prev, { id: Math.max(0, ...prev.map((t) => t.id)) + 1, text: value, done: false }]);
    setText('');
  };
  const toggle = (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos((prev) => prev.filter((t) => t.id !== id));
  const clearDone = () => setTodos((prev) => prev.filter((t) => !t.done));
  const burst = () => {
    setClicks((c) => c + 1);
    setClicks((c) => c + 1);
    setClicks((c) => c + 1);
  };

  return h(
    'section',
    { className: 'todo-app' },
    h('h2', null, '할 일'),
    h(TodoForm, { text, onTextChange: setText, onAdd: add }),
    h(FilterBar, { filter, counts, onFilter: setFilter }),
    h(TodoList, { todos: visible, filter, onToggle: toggle, onRemove: remove }),
    h(Stats, { stats, onClearDone: clearDone }),
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
