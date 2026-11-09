import { h } from '../../lib/index.js';

/**
 * 자식 컴포넌트들. 모두 상태가 없는(Stateless) 순수 함수다.
 * 화면에 필요한 값과, 상태를 바꿔 달라고 부모에게 부탁할 함수(onXxx)를 props로만 받는다.
 * (Lifting State Up: 상태는 루트 App에만 있다)
 */

export function CounterPanel({ count, onIncrease, onDecrease, onTripleByValue, onTripleByUpdater, onReset }) {
  return h(
    'section',
    { class: 'panel' },
    h('h3', null, 'useState · 카운터'),
    h('p', { class: 'big-number' }, count),
    count >= 10 && h('p', { class: 'hint' }, '10 이상이 되면 나타나는 문단 (조건부 렌더링)'),
    h(
      'div',
      { class: 'buttons' },
      h('button', { type: 'button', onClick: onDecrease }, '−1'),
      h('button', { type: 'button', onClick: onIncrease }, '+1'),
      h('button', { type: 'button', onClick: onReset }, '0으로'),
    ),
    h(
      'div',
      { class: 'buttons' },
      h('button', { type: 'button', onClick: onTripleByValue }, 'setCount(count + 1) × 3'),
      h('button', { type: 'button', onClick: onTripleByUpdater }, 'setCount(c => c + 1) × 3'),
    ),
    h('p', { class: 'caption' }, '두 버튼 모두 렌더는 한 번만 일어납니다. 결과 숫자는 왜 다를까요?'),
  );
}

export function TextPanel({ text, stats, onInput }) {
  return h(
    'section',
    { class: 'panel' },
    h('h3', null, 'useMemo · 텍스트 통계'),
    h('input', { type: 'text', value: text, placeholder: '아무 글자나 입력', onInput }),
    h(
      'ul',
      { class: 'stats' },
      h(StatItem, { label: '글자 수', value: stats.length }),
      h(StatItem, { label: '공백 제외', value: stats.withoutSpaces }),
      h(StatItem, { label: '단어 수', value: stats.words }),
      h(StatItem, { label: '거꾸로', value: stats.reversed || '—' }),
    ),
    h('p', { class: 'caption' }, '카운터를 눌러도 통계는 다시 계산되지 않습니다 (로그의 memo 확인).'),
  );
}

function StatItem({ label, value }) {
  return h('li', null, h('span', null, label), h('strong', null, value));
}

export function TimerPanel({ running, seconds, onToggle, onReset }) {
  return h(
    'section',
    { class: 'panel' },
    h('h3', null, 'useEffect · 타이머'),
    h('p', { class: 'big-number' }, `${seconds}초`),
    h(
      'div',
      { class: 'buttons' },
      h('button', { type: 'button', class: running ? 'active' : '', onClick: onToggle }, running ? '정지' : '시작'),
      h('button', { type: 'button', onClick: onReset }, '초기화'),
    ),
    h('p', { class: 'caption' }, '시작하면 setInterval을 걸고, 정지하면 cleanup이 clearInterval 합니다.'),
  );
}
