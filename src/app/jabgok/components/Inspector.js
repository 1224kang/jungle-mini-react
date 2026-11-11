import { h } from '../../../lib/index.js';

const line = (label, value) => h('div', { class: 'inspector__row' }, h('dt', null, label), h('dd', null, value));

function frameRows(report, fps, nodes) {
  const { last } = report;
  const match = last.total === last.mutations;
  return h(
    'dl',
    { class: 'inspector__stats' },
    line('프레임당 patch (예측)', last.total === 0 ? '0건' : `${last.total}건 · ${last.kinds}`),
    line('실제 DOM 변경', `${last.mutations}건 ${match ? '(일치)' : '(불일치)'}`),
    line('초당 렌더 횟수', `${fps}회`),
    line('전체 노드 수', `${nodes}개`),
  );
}

function sceneLog(log) {
  return h(
    'ol',
    { class: 'inspector__log' },
    log.length === 0
      ? h('li', { class: 'inspector__empty' }, '아직 변경 없음')
      : log.map((entry) => h('li', null, h('code', null, entry.kinds || '변경 없음'), ` · DOM ${entry.mutations}건 · ${entry.frames}프레임`)),
  );
}

function comparison(report) {
  const mini = report.ms === null ? '-' : `${report.ms.toFixed(2)}ms`;
  const naive = report.naive === null ? '-' : `${report.naive.ms.toFixed(2)}ms`;
  return h(
    'div',
    { class: 'inspector__compare' },
    h(
      'dl',
      { class: 'inspector__stats' },
      line('Mini React (diff → patch)', `${mini} · DOM ${report.last.mutations}건`),
      line('innerHTML 전체 다시 그리기', `${naive} · 노드 ${report.naive === null ? 0 : report.naive.nodes}개 새로 만듦`),
    ),
    // 이 칸의 자식은 게임 루프가 innerHTML로 직접 그린다. VNode에는 자식이 없어 diff/patch가 건드리지 않는다.
    h('div', { class: 'naive-view', 'aria-label': 'innerHTML로 다시 그린 보드' }),
  );
}

/**
 * 관찰 패널: 프레임당 patch 수와 종류, 실제 DOM 변경 수, 초당 렌더 횟수, 전체 노드 수. 접을 수 있다.
 * 숫자는 게임 영역(HUD + 보드) 기준이며 직전 프레임의 값이다. 패널 자신의 갱신은 세지 않는다.
 * @param {object} props report = { last, log, ms, naive } (logic/inspect.js의 nextReport)
 */
export function Inspector({ report, fps, nodes, open, compare, onToggle, onToggleCompare }) {
  return h(
    'aside',
    { class: `inspector${open ? '' : ' is-closed'}` },
    h(
      'div',
      { class: 'inspector__head' },
      h('h2', null, '관찰 패널'),
      h('button', { class: 'inspector__toggle', type: 'button', onclick: onToggle, 'aria-expanded': open ? 'true' : 'false' }, open ? '접기' : '펼치기'),
    ),
    open &&
      h(
        'div',
        { class: 'inspector__body' },
        h('p', { class: 'inspector__note' }, '게임 영역(HUD + 보드)의 직전 프레임 기준'),
        frameRows(report, fps, nodes),
        h('h3', null, '최근 장면'),
        sceneLog(report.log),
        h('h3', null, '전체 다시 그리기 비교'),
        h(
          'button',
          { class: 'inspector__toggle', type: 'button', onclick: onToggleCompare, 'aria-pressed': compare ? 'true' : 'false' },
          compare ? '비교 끄기' : '비교 켜기',
        ),
        compare && comparison(report),
      ),
  );
}
