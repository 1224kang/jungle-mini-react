// [Phase 2 데모] 자식 컴포넌트들. 전부 "상태 없는 순수 함수" 입니다 (과제 제약: Lifting State Up).
//   - props 만 받아서 VNode 를 돌려줍니다. useState 같은 Hook 을 부르면 오류가 납니다.
//   - 값 변경은 부모(TodoApp)가 내려 준 콜백(onToggle, onAdd …)을 호출해 부모에게 부탁합니다.
import { h } from '../lib/index.js';

export function TodoForm({ text, onTextChange, onAdd }) {
  return h(
    'form',
    {
      className: 'todo-form',
      onSubmit: (e) => {
        e.preventDefault();
        onAdd();
      },
    },
    h('input', {
      type: 'text',
      placeholder: '할 일을 입력하고 Enter',
      'aria-label': '새 할 일',
      value: text,
      maxlength: 80,
      onInput: (e) => onTextChange(e.target.value),
    }),
    h('button', { type: 'submit', disabled: text.trim() === '' }, '추가')
  );
}

export function FilterBar({ filter, counts, onFilter }) {
  const options = [
    ['all', '전체'],
    ['active', '진행 중'],
    ['done', '완료'],
  ];
  return h(
    'div',
    { className: 'filters', role: 'group', 'aria-label': '필터' },
    options.map(([value, label]) =>
      h(
        'button',
        {
          key: value,
          type: 'button',
          className: filter === value ? 'on' : '',
          'aria-pressed': filter === value,
          onClick: () => onFilter(value),
        },
        `${label} ${counts[value]}`
      )
    )
  );
}

export function TodoItem({ todo, onToggle, onRemove }) {
  return h(
    'li',
    { className: todo.done ? 'todo done' : 'todo' },
    h('label', null,
      h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }),
      h('span', { className: 'text' }, todo.text)
    ),
    h('button', { type: 'button', className: 'x', 'aria-label': `${todo.text} 삭제`, onClick: () => onRemove(todo.id) }, '×')
  );
}

export function TodoList({ todos, filter, onToggle, onRemove }) {
  if (todos.length === 0) {
    const msg = filter === 'all' ? '할 일이 없어요. 위에서 추가해 보세요.' : '이 필터에 맞는 항목이 없어요.';
    return h('p', { className: 'empty' }, msg);
  }
  // key 덕분에 항목이 지워지거나 순서가 바뀌어도 나머지 <li> 는 그대로 재사용됩니다.
  return h(
    'ul',
    { className: 'todos' },
    todos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle, onRemove }))
  );
}

export function Stats({ stats, onClearDone }) {
  return h(
    'div',
    { className: 'stats' },
    h('span', null, `전체 ${stats.total} · 완료 ${stats.done} · 남음 ${stats.active}`),
    h('div', { className: 'bar', 'aria-hidden': 'true' },
      h('i', { style: { width: `${stats.percent}%` } })),
    h('span', null, `${stats.percent}%`),
    h('button', { type: 'button', disabled: stats.done === 0, onClick: onClearDone }, '완료 항목 지우기')
  );
}

export function Timer({ seconds, running, onToggle, onReset }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return h(
    'div',
    { className: 'timer' },
    h('strong', null, `${mm}:${ss}`),
    h('button', { type: 'button', onClick: onToggle }, running ? '일시정지' : '시작'),
    h('button', { type: 'button', disabled: seconds === 0 && !running, onClick: onReset }, '초기화')
  );
}

export function BurstDemo({ clicks, onBurst }) {
  return h(
    'div',
    { className: 'burst' },
    h('span', null, `연속 setState 데모: ${clicks}`),
    h('button', { type: 'button', onClick: onBurst }, '+1 을 3번 호출')
  );
}
