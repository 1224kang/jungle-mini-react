import { h, mount, useState, useEffect, useMemo } from '../../lib/index.js';

const $ = (id) => document.getElementById(id);

// 렌더 밖 기록. 앱 상태가 아니므로 화면 갱신을 일으키지 않는다.
const stats = { changes: 0, renders: 0, expensive: 0 };
let action = null; // 마지막 버튼 동작: { label, changes, renders } (누르기 직전 값)

/** 버튼 동작 시작을 기록한다. 이후 effect가 직전 값과 비교해 "상태 변경 N회 / 렌더 M회"를 보여 준다. */
function begin(label) {
  action = { label, changes: stats.changes, renders: stats.renders };
}

/** setState를 부를 때마다 상태 변경 요청 횟수를 센다. */
function request(setter, next) {
  stats.changes += 1;
  setter(next);
}

/** 일부러 느린 계산: count마다 같은 결과가 나오는 반복문을 200만 번 돈다. */
function slowSum(n) {
  stats.expensive += 1;
  let total = 0;
  for (let i = 0; i < 2_000_000; i++) total += (i * n) % 7;
  return total;
}

/** 자식: props만으로 화면을 만든다. */
function Display({ count, step, expensive }) {
  return h(
    'div',
    null,
    h('p', null, 'count: ', h('strong', null, String(count))),
    h('p', null, 'step: ', h('strong', null, String(step))),
    h('p', null, '비싼 계산 결과 (count 기준): ', String(expensive)),
  );
}

/** 자식: 받은 변경 함수를 이벤트에서 부른다. 상태는 갖지 않는다. */
function Controls({ step, onAddStep, onAddThree, onStepUp, onStepDown }) {
  return h(
    'div',
    { class: 'buttons' },
    h('button', { onclick: onAddStep }, `+${step}`),
    h('button', { onclick: onAddThree }, '+1 세 번'),
    h('button', { onclick: onStepUp }, 'step +1'),
    h('button', { onclick: onStepDown }, 'step -1'),
  );
}

/** 루트: 상태와 Hook은 여기에만 있다. */
function App() {
  const [count, setCount] = useState(0);
  const [step, setStep] = useState(1);
  const expensive = useMemo(() => slowSum(count), [count]);

  // deps 생략 → 매 렌더(DOM 반영) 후 실행. 렌더 횟수를 세고 앱 밖 통계를 갱신한다.
  useEffect(() => {
    stats.renders += 1;
    showStats();
  });

  return h(
    'div',
    null,
    h(Display, { count, step, expensive }),
    h(Controls, {
      step,
      onAddStep: () => {
        begin(`+${step}`);
        request(setCount, (c) => c + step);
      },
      onAddThree: () => {
        begin('+1 세 번');
        request(setCount, (c) => c + 1);
        request(setCount, (c) => c + 1);
        request(setCount, (c) => c + 1);
      },
      onStepUp: () => {
        begin('step +1');
        request(setStep, (s) => s + 1);
      },
      onStepDown: () => {
        begin('step -1');
        request(setStep, (s) => Math.max(1, s - 1));
      },
    }),
  );
}

function showStats() {
  $('stat-changes').textContent = String(stats.changes);
  $('stat-renders').textContent = String(stats.renders);
  $('stat-expensive').textContent = String(stats.expensive);
  $('last-action').textContent = action
    ? `마지막 동작 "${action.label}": 상태 변경 ${stats.changes - action.changes}회 / 렌더 ${stats.renders - action.renders}회`
    : `첫 렌더: 상태 변경 0회 / 렌더 ${stats.renders}회`;
}

mount(h(App), $('app'));
