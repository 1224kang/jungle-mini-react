// 실행 히스토리 모델. 각 노드는 한 번의 성공한 Patch 결과(= 그 시점의 화면 스냅샷)이고, 분기할 수 있다.
// 순수 데이터와 순수 함수만 둔다. 변경은 항상 새 객체를 돌려준다(불변 업데이트).
import { toHtml } from './engine.js';

/**
 * @typedef {object} HistoryNode
 * @property {number} id 1부터 생성 순서대로
 * @property {number|null} parentId 루트는 null
 * @property {object} vnode 그 시점의 VNode
 * @property {string} html 그 시점의 HTML(편집기 복원용)
 * @property {number} patchCount 부모에서 이 노드가 되기까지의 Patch 수(루트는 0)
 * @property {string} summary 그래프에 쓰는 짧은 요약
 * @property {number[]} children 자식 id (생성 순서)
 */

/** Patch 목록을 종류별 개수로 요약한다. 예: `TEXT 1 · CREATE 2`. 비어 있으면 빈 문자열. */
export function summarize(patches) {
  const counts = new Map();
  for (const p of patches) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts].map(([type, n]) => `${type} ${n}`).join(' · ');
}

/** 루트(초기 상태) 하나만 가진 히스토리를 만든다. 루트 id는 1. */
export function createHistory(vnode) {
  const root = { id: 1, parentId: null, vnode, html: toHtml(vnode), patchCount: 0, summary: '초기', children: [] };
  return { nodes: { 1: root }, rootId: 1, nextId: 2 };
}

/**
 * parentId 아래에 새 스냅샷을 붙인다. 이미 자식이 있으면 형제(분기)가 된다.
 * 변경이 없는 실행(patches가 빈 배열)은 호출하지 않는 것이 규칙이지만, 호출하면 '변경 없음' 노드가 생긴다.
 * @returns {{ history: object, id: number }} 새 히스토리와 새 노드 id
 */
export function addChild(history, parentId, vnode, patches) {
  const parent = history.nodes[parentId];
  if (!parent) throw new Error(`히스토리에 없는 노드: ${parentId}`);
  const id = history.nextId;
  const node = {
    id,
    parentId,
    vnode,
    html: toHtml(vnode),
    patchCount: patches.length,
    summary: summarize(patches) || '변경 없음',
    children: [],
  };
  return {
    id,
    history: {
      ...history,
      nextId: id + 1,
      nodes: { ...history.nodes, [parentId]: { ...parent, children: [...parent.children, id] }, [id]: node },
    },
  };
}

export const getNode = (history, id) => history.nodes[id] ?? null;

/** 부모 id. 루트는 null. */
export const parentOf = (history, id) => getNode(history, id)?.parentId ?? null;

/** 앞으로 버튼이 갈 곳: 자식이 정확히 1개일 때만 그 id. 0개이거나 여러 개(분기)면 null. */
export function forwardTarget(history, id) {
  const children = getNode(history, id)?.children ?? [];
  return children.length === 1 ? children[0] : null;
}

/** 같은 부모의 형제 id 목록(자기 포함). 루트는 [루트]. */
export function siblingsOf(history, id) {
  const parentId = parentOf(history, id);
  return parentId === null ? [id] : history.nodes[parentId].children;
}
