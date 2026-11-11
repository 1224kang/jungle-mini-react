import { h } from '../../lib/index.js';
import { GOAL, GRAIN_TYPES, TIME_LIMIT } from '../config.js';
import { formatTime } from './format.js';

const row = (label, value) => h('div', { class: 'overlay__row' }, h('dt', null, label), h('dd', null, value));

/** 잡곡 종류 표: 작을수록 잡기 어렵고 점수가 높다. */
function grainTable() {
  return h(
    'ul',
    { class: 'overlay__grains' },
    Object.entries(GRAIN_TYPES).map(([type, spec]) =>
      h(
        'li',
        null,
        h('span', { class: `swatch grain--${type}`, style: `width: ${spec.diameter}px; height: ${spec.diameter}px` }),
        `${spec.name} · 지름 ${spec.diameter}px · ${spec.points}점 × ${spec.count}알`,
      )),
  );
}

function startScreen(best, onStart) {
  return h(
    'div',
    { class: 'overlay__card' },
    h('h2', null, '잡곡 옮기기'),
    h('p', { class: 'overlay__lead' }, '좁게 잡고, 천천히 끌고, 손이 너무 빠르면 떨어진다'),
    h(
      'ul',
      { class: 'overlay__rules' },
      h('li', null, `${formatTime(TIME_LIMIT)} 안에 오른쪽 그릇에 ${GOAL}점을 채우면 승리`),
      h('li', null, '잡곡을 눌러 잡고 천천히 끌어 오른쪽 그릇까지. A · D는 화면을 한 구간씩 옮긴다'),
      h('li', null, '잡곡을 든 채로는 구간을 넘을 수 없다. 테이블의 밝은 띠(겹치는 곳)에 내려놓고, 구간을 옮긴 뒤 다시 집는다'),
      h('li', null, '포인터가 점선 원(데드존)을 벗어나거나 그릇 벽에 닿으면 떨어진다'),
      h('li', null, '테이블에 닿아 있던 시간이 모두 5초를 넘으면 썩는다'),
      h('li', null, '그릇 벽을 넘을 만큼 들어 올려 그릇 위에서 놓으면 득점'),
      h('li', null, '스페이스바는 방해: 화면이 흔들리고, 들고 있던 잡곡 · 테이블 위의 잡곡 · 잡곡 그릇 안의 잡곡이 아무 데로나 날아간다'),
    ),
    grainTable(),
    h('p', { class: 'overlay__best' }, `최고 점수 ${best}점`),
    h('button', { class: 'overlay__button', type: 'button', onclick: onStart }, '시작'),
  );
}

function resultScreen(result, best, onStart) {
  return h(
    'div',
    { class: `overlay__card overlay__card--${result.win ? 'win' : 'lose'}` },
    h('h2', null, result.win ? '승리' : '실패'),
    h('p', { class: 'overlay__lead' }, result.win ? `목표 ${GOAL}점을 채웠다` : `시간 안에 ${GOAL}점을 채우지 못했다`),
    h(
      'dl',
      { class: 'overlay__stats' },
      row('점수', `${result.score}점`),
      row('옮긴 개수', `${result.moved}알`),
      row('떨어뜨린 횟수', `${result.drops}회`),
      row('썩은 알', `${result.rotten}알`),
      row('남은 시간', formatTime(result.timeLeft)),
      row('최고 점수', `${best}점`),
    ),
    h(
      'p',
      { class: 'overlay__types' },
      Object.entries(GRAIN_TYPES)
        .map(([type, spec]) => `${spec.name} ${result.byType[type]}/${spec.count}`)
        .join(' · '),
    ),
    h('button', { class: 'overlay__button', type: 'button', onclick: onStart }, '다시 하기'),
  );
}

/**
 * 시작 화면과 결과 화면(승리 · 실패). 게임 중에는 부모가 그리지 않는다. (`phase !== 'playing' && h(Overlay, …)`)
 * @param {object} props result = { win, score, moved, drops, rotten, timeLeft, byType } (over일 때만)
 */
export function Overlay({ phase, result, best, onStart }) {
  return h(
    'div',
    { class: `overlay overlay--${phase}` },
    phase === 'over' && result ? resultScreen(result, best, onStart) : startScreen(best, onStart),
  );
}
