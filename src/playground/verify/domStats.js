/**
 * Patch 전후 DOM 노드 집계 (요구 7.3). UI와 무관하며 DOM 노드만 다룬다.
 *
 * 측정 범위: 루트 노드 자신을 포함한 하위 트리의 Element(nodeType 1)와 Text(nodeType 3) 노드.
 *   (주석 등은 VNode에 없으므로 제외)
 * 기준: 객체 동일성(===). Patch 전 노드를 WeakSet(구성원 확인용)과 배열(순회용)에 함께 담고,
 *   Patch 후 노드와 비교한다.
 *   - 재사용: Patch 후 트리에 있고 Patch 전에도 있던 노드
 *   - 새로 만듦: Patch 후 트리에 있고 Patch 전에는 없던 노드
 *   - 제거: Patch 전에 있었고 Patch 후 트리에 없는 노드
 * 한계: 전후 비교만 하므로 Patch 도중 임시로 만들어졌다가 사라진 노드는 셀 수 없다.
 *   (현재 patch 구현은 render 결과를 바로 삽입하므로 그런 노드는 없지만, 이 측정으로는 보장할 수 없다)
 */

/** 루트를 포함한 하위 Element/Text 노드 목록 (문서 순서) */
export function collectNodes(root) {
  const list = [];
  const visit = (node) => {
    if (node.nodeType === 1 || node.nodeType === 3) list.push(node);
    for (const child of node.childNodes) visit(child);
  };
  if (root) visit(root);
  return list;
}

/** Patch 전 상태를 기록한다. */
export function takeSnapshot(root) {
  const list = collectNodes(root);
  const set = new WeakSet(list);
  return { list, set };
}

/**
 * @param {{list: Node[], set: WeakSet<Node>}} before takeSnapshot 결과
 * @param {Node} rootAfter Patch 후 루트 (REPLACE되면 새 루트)
 */
export function compareSnapshots(before, rootAfter) {
  const after = collectNodes(rootAfter);
  const afterSet = new WeakSet(after);
  const reused = after.filter((n) => before.set.has(n));
  const created = after.filter((n) => !before.set.has(n));
  const removed = before.list.filter((n) => !afterSet.has(n));
  return { reused, created, removed };
}

/**
 * Patch 전 DOM에서 old 경로의 노드를 찾는다(표시용 강조 대상 찾기). 없으면 null.
 * patch()가 실행 전에 경로를 해석하는 것과 같은 방식으로 childNodes를 따라간다.
 */
export function nodeAtPath(root, path) {
  let node = root;
  for (const i of path) {
    node = node?.childNodes[i];
    if (!node) return null;
  }
  return node;
}
