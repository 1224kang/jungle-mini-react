// 홈 화면. 화면 전체를 Mini React로 그린다.
// app은 HTML · 바닐라 JS · Mini React(src/lib/index.js)만 쓴다. playground는 참조하지 않는다.
// 규칙(README · docs/contracts.md 6장): Hook은 루트(App)에서만 쓰고, 자식은 props만 받는 순수 함수다.
import { h, mount, useState, useEffect, useMemo } from '../lib/index.js';
import { PageShell } from './shared/layout.js';
import { useSidebar } from './shared/useSidebar.js';

/* ---------- 자식 컴포넌트 (상태 없음) ---------- */

function Hero() {
  return h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'container' },
      h('p', { class: 'eyebrow' }, 'jungle 13기 · 순수 JavaScript'),
      h('h1', null, '직접 만든 ', h('span', { class: 'accent' }, 'Mini React'), '로 그린 화면'),
      h(
        'p',
        { class: 'lead' },
        '외부 프레임워크 없이 Virtual DOM, Diff, Patch, 그리고 Hooks를 구현했습니다. ',
        '지금 보고 있는 이 페이지도 그 라이브러리로 렌더링됩니다.',
      ),
      h(
        'div',
        { class: 'actions' },
        h('a', { class: 'btn btn-primary', href: VISUALIZER }, 'Diff 시각화 해보기'),
        h('a', { class: 'btn btn-ghost', href: '#demo' }, '라이브 데모 보기'),
      ),
    ),
  );
}

const VISUALIZER = '/src/app/visualizer/';
const COMPONENTS = '/src/app/components/';

const FEATURES = [
  {
    id: 'phase1',
    step: 'Phase 1',
    title: 'Virtual DOM · Diff · Patch',
    body:
      'React는 화면을 직접 고치지 않습니다. 화면을 가벼운 객체 트리(Virtual DOM)로 새로 만들고, ' +
      '이전 트리와 비교(Diff)해 바뀐 부분만 실제 DOM에 반영(Patch)합니다.',
    link: { href: VISUALIZER, label: 'Diff · Patch 시각화로 확인하기' },
  },
  {
    id: 'phase2',
    step: 'Phase 2',
    title: 'Component · State · Hooks',
    body:
      'React 컴포넌트는 props를 받아 화면을 돌려주는 함수입니다. State가 바뀌면 다시 호출되고, ' +
      'Hook(useState · useEffect · useMemo)으로 상태와 부수 효과를 렌더 사이에 기억합니다.',
    link: { href: COMPONENTS, label: '컴포넌트 인스펙터로 확인하기' },
  },
];

function Features() {
  return h(
    'section',
    { class: 'section', id: 'features' },
    h(
      'div',
      { class: 'container' },
      h('h2', null, '무엇을 구현했나요'),
      h('p', { class: 'section-lead' }, 'React의 핵심 동작을 두 단계로 나눠 직접 구현했습니다.'),
      h(
        'div',
        { class: 'cards cards-2' },
        FEATURES.map((f) =>
          h(
            'article',
            { key: f.id, class: 'card' },
            h('span', { class: 'card-step' }, f.step),
            h('h3', null, f.title),
            h('p', null, f.body),
            h('a', { class: 'card-link', href: f.link.href }, `${f.link.label} →`),
          ),
        ),
      ),
    ),
  );
}

function TodoItem({ todo, onToggle, onRemove }) {
  return h(
    'li',
    { key: todo.id, class: todo.done ? 'todo done' : 'todo' },
    h(
      'label',
      null,
      h('input', { type: 'checkbox', checked: todo.done, onchange: () => onToggle(todo.id) }),
      h('span', null, todo.text),
    ),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${todo.text} 삭제`, onclick: () => onRemove(todo.id) }, '✕'),
  );
}

function Demo({ todos, filter, renders, left, onAdd, onToggle, onRemove, onFilter, onClear }) {
  const visible = todos.filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : true));
  const tab = (value, label) =>
    h(
      'button',
      { key: value, type: 'button', class: filter === value ? 'tab active' : 'tab', onclick: () => onFilter(value) },
      label,
    );

  return h(
    'section',
    { class: 'section section-alt', id: 'demo' },
    h(
      'div',
      { class: 'container demo' },
      h(
        'div',
        { class: 'demo-copy' },
        h('h2', null, '라이브 데모'),
        h(
          'p',
          { class: 'section-lead' },
          '할 일을 추가하고 체크해 보세요. 항목마다 key가 있어서 필터를 바꿔도 남는 항목의 DOM은 새로 만들지 않고 재사용됩니다.',
        ),
        h(
          'dl',
          { class: 'stats' },
          h('div', null, h('dt', null, '남은 일'), h('dd', null, String(left))),
          h('div', null, h('dt', null, '전체'), h('dd', null, String(todos.length))),
          h('div', null, h('dt', null, '렌더 횟수'), h('dd', null, String(renders))),
        ),
      ),
      h(
        'div',
        { class: 'demo-box' },
        h(
          'form',
          { class: 'todo-form', onsubmit: onAdd },
          h('input', { name: 'text', type: 'text', placeholder: '할 일을 입력하세요', autocomplete: 'off', 'aria-label': '할 일' }),
          h('button', { class: 'btn btn-primary', type: 'submit' }, '추가'),
        ),
        h('div', { class: 'tabs', role: 'group', 'aria-label': '필터' }, tab('all', '전체'), tab('active', '진행 중'), tab('done', '완료')),
        visible.length === 0
          ? h('p', { class: 'empty' }, '표시할 항목이 없습니다.')
          : h('ul', { class: 'todos' }, visible.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle, onRemove }))),
        h(
          'div',
          { class: 'demo-foot' },
          h('span', null, `${left}개 남음`),
          h('button', { class: 'link-btn', type: 'button', onclick: onClear, disabled: todos.length === left }, '완료 항목 지우기'),
        ),
      ),
    ),
  );
}

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

let renderCount = 0; // 화면 표시용 기록. 앱 상태가 아니므로 갱신을 일으키지 않는다.
let nextId = 4;

function App() {
  const nav = useSidebar(); // 사이드바 열림 상태. Hook이므로 루트에서 부른다.
  const [todos, setTodos] = useState([
    { id: 1, text: 'Virtual DOM 만들기', done: true },
    { id: 2, text: 'Diff / Patch 구현하기', done: true },
    { id: 3, text: 'Mini React로 웹 사이트 만들기', done: false },
  ]);
  const [filter, setFilter] = useState('all');
  const left = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  renderCount += 1;

  useEffect(() => {
    document.title = left > 0 ? `Mini React · 할 일 ${left}개` : 'Mini React';
  }, [left]);

  const onAdd = (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.text;
    const text = input.value.trim();
    if (!text) return;
    setTodos((list) => [...list, { id: nextId++, text, done: false }]);
    input.value = ''; // 입력창은 비제어 입력이라 직접 비운다
    input.focus();
  };
  const onToggle = (id) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const onRemove = (id) => setTodos((list) => list.filter((t) => t.id !== id));
  const onClear = () => setTodos((list) => list.filter((t) => !t.done));

  return h(
    PageShell,
    { nav },
    h(Hero, null),
    h(Features, null),
    h(Demo, { todos, filter, renders: renderCount, left, onAdd, onToggle, onRemove, onFilter: setFilter, onClear }),
  );
}

mount(h(App), document.getElementById('app'));
