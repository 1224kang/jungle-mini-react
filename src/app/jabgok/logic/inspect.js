// 관찰 패널용 계산. 모두 순수 함수다. (DOM을 바꾸지 않고, 받은 값만 읽는다)

const TEXT = '#text';

/**
 * 컴포넌트 VNode를 모두 호출해 요소·텍스트 VNode만 남긴다. 라이브러리가 화면을 그릴 때와 같은 트리가 나오므로,
 * 직전 트리와 diff하면 이번 렌더의 patch를 예측할 수 있다. (라이브러리의 update()는 patch 목록을 밖으로 내주지 않는다)
 * 입력은 수정하지 않는다.
 */
export function flatten(vnode) {
  if (vnode.type === TEXT) return vnode;
  if (typeof vnode.type === 'function') {
    const result = flatten(vnode.type(vnode.props));
    return vnode.key === null ? result : { ...result, key: vnode.key };
  }
  return { type: vnode.type, key: vnode.key, props: { ...vnode.props, children: vnode.props.children.map(flatten) } };
}

/** patch 목록을 종류별 개수로 센다. 예: { PROPS: 1, REMOVE: 1 } */
export function countPatches(patches) {
  const counts = {};
  for (const patch of patches) counts[patch.type] = (counts[patch.type] ?? 0) + 1;
  return counts;
}

/** 종류별 개수를 한 줄로 적는다. 예: "MOVE 1 + CREATE 1". 없으면 빈 문자열. */
export function describeCounts(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type} ${count}`)
    .join(' + ');
}

/**
 * MutationObserver 기록을 "DOM 변경 수"로 센다. patch 한 건이 변경 한 건이 되도록 센다.
 * - 속성·텍스트 변경: 기록 1개당 1건
 * - 자식 추가·삭제: 추가되거나 빠진 노드 1개당 1건. 같은 노드가 빠졌다가 다시 들어가면(이동) 1건
 */
export function countMutations(records) {
  let count = 0;
  const touched = new Set();
  for (const record of records) {
    if (record.type !== 'childList') {
      count += 1;
      continue;
    }
    for (const node of record.addedNodes) touched.add(node);
    for (const node of record.removedNodes) touched.add(node);
  }
  return count + touched.size;
}

/** VNode 트리의 노드 수 (요소 + 텍스트). */
export function countVNodes(vnode) {
  if (vnode.type === TEXT) return 1;
  return vnode.props.children.reduce((sum, child) => sum + countVNodes(child), 1);
}

/** DOM 트리의 노드 수 (자신 포함, 요소 + 텍스트). */
export function countDomNodes(node) {
  let count = 1;
  for (const child of node.childNodes) count += countDomNodes(child);
  return count;
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 요소·텍스트 VNode 트리를 HTML 문자열로 바꾼다. ("전체 다시 그리기" 비교용, 이벤트 핸들러는 뺀다) */
export function toHtml(vnode) {
  if (vnode.type === TEXT) return escapeHtml(vnode.value);
  const { children, ...attrs } = vnode.props;
  let html = `<${vnode.type}`;
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'string') html += ` ${name}="${escapeHtml(value)}"`;
  }
  if (vnode.key !== null) html += ` data-key="${escapeHtml(vnode.key)}"`; // 라이브러리의 render와 같은 순서
  return `${html}>${children.map(toHtml).join('')}</${vnode.type}>`;
}

/** 게임 영역에 변경이 없던 프레임의 기록. 같은 객체를 재사용해 빈 프레임이 이어져도 상태가 바뀌지 않게 한다. */
export const IDLE_FRAME = Object.freeze({ total: 0, kinds: '', mutations: 0 });

export const EMPTY_REPORT = Object.freeze({ last: IDLE_FRAME, log: Object.freeze([]), ms: null, naive: null });

const LOG_SIZE = 6;
const round2 = (value) => Math.round(value * 100) / 100;
const smooth = (previous, value) => round2(previous === null || previous === undefined ? value : previous * 0.9 + value * 0.1);

/**
 * 끝난 프레임의 기록을 보고서에 반영한다. 달라진 게 없으면 받은 보고서를 그대로 돌려준다. → 렌더 0회
 * @param {object} report 직전 보고서 { last, log, ms, naive }
 * @param {{counts: object, mutations: number, ms: number|null}} frame 끝난 프레임의 기록
 * @param {{ms: number, nodes: number}|null} naive "전체 다시 그리기"로 그린 기록 (모드가 꺼져 있으면 null)
 */
export function nextReport(report, frame, naive) {
  const nextNaive = naive === null ? null : { ms: smooth(report.naive?.ms, naive.ms), nodes: naive.nodes };
  const sameNaive =
    nextNaive === report.naive ||
    (nextNaive !== null && report.naive !== null && nextNaive.ms === report.naive.ms && nextNaive.nodes === report.naive.nodes);

  // 게임 영역이 그대로인 프레임(렌더가 없었거나, 관찰 패널만 다시 그린 프레임)은 빈 프레임으로 본다.
  // 패널 자신의 갱신을 변경으로 세면 그 갱신이 다시 보고서를 바꿔 렌더가 끝없이 이어진다.
  const total = Object.values(frame.counts).reduce((sum, count) => sum + count, 0);
  if (total === 0 && frame.mutations === 0) {
    if (report.last === IDLE_FRAME && sameNaive) return report;
    return { ...report, last: IDLE_FRAME, naive: sameNaive ? report.naive : nextNaive };
  }

  const last = { total, kinds: describeCounts(frame.counts), mutations: frame.mutations };
  const top = report.log[0];
  const log =
    top && top.kinds === last.kinds && top.mutations === last.mutations
      ? [{ ...top, frames: top.frames + 1 }, ...report.log.slice(1)]
      : [{ ...last, frames: 1 }, ...report.log].slice(0, LOG_SIZE);
  const ms = frame.ms === null ? report.ms : smooth(report.ms, frame.ms);
  return { last, log, ms, naive: sameNaive ? report.naive : nextNaive };
}
