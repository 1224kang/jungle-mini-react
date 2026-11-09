import { TEXT_TYPE, PATCH_TYPE, getAttributes, invalidInputError } from '../shared/index.js';

/**
 * 두 VNode 트리를 비교해 Patch 목록을 계산한다. 순수 함수이며 외부 상태에 의존하지 않는다.
 * path는 모두 old 트리 좌표다. (docs/contracts.md 5장)
 * @param {object} oldVNode 이전 VNode
 * @param {object} newVNode 새 VNode
 * @returns {object[]} Patch[] (docs/contracts.md 참조)
 */
export function diff(oldVNode, newVNode) {
  // 검사는 공개 함수 입구에서 한 번만. 내부 재귀는 정규화된 입력이라고 가정한다.
  assertVNode(oldVNode, 'oldVNode');
  assertVNode(newVNode, 'newVNode');
  const patches = [];
  diffNode(oldVNode, newVNode, [], patches);
  return patches;
}

function assertVNode(vnode, label) {
  if (typeof vnode !== 'object' || vnode === null || typeof vnode.type !== 'string') {
    throw invalidInputError(`diff의 ${label}는 type이 문자열인 VNode 객체여야 함`);
  }
}

/** 동일성: type과 key가 모두 같다. 텍스트는 key가 없으므로 type만 본다. */
function isSameNode(a, b) {
  if (a.type !== b.type) return false;
  return a.type === TEXT_TYPE ? true : a.key === b.key;
}

/** 같은 위치의 두 노드를 비교한다. 동일하지 않으면 REPLACE하고 하위로 내려가지 않는다. */
function diffNode(oldNode, newNode, path, patches) {
  if (!isSameNode(oldNode, newNode)) {
    patches.push({ type: PATCH_TYPE.REPLACE, path, node: newNode });
    return;
  }
  if (oldNode.type === TEXT_TYPE) {
    if (oldNode.value !== newNode.value) {
      patches.push({ type: PATCH_TYPE.TEXT, path, value: newNode.value });
    }
    return;
  }
  // 부모 자신의 PROPS는 자식 patch보다 앞에 둔다. (DOM 참조로 작업하므로 순서와 무관하게 결과가 같다)
  diffProps(oldNode, newNode, path, patches);
  diffChildren(oldNode.props.children, newNode.props.children, path, patches);
}

function diffProps(oldNode, newNode, path, patches) {
  const oldAttrs = getAttributes(oldNode.props);
  const newAttrs = getAttributes(newNode.props);
  const setEntries = [];
  const remove = [];
  // 값이 === 이면 건드리지 않는다. 함수 핸들러도 같은 참조면 변경 없음으로 본다.
  for (const name of Object.keys(newAttrs)) {
    if (!Object.hasOwn(oldAttrs, name) || oldAttrs[name] !== newAttrs[name]) {
      setEntries.push([name, newAttrs[name]]);
    }
  }
  for (const name of Object.keys(oldAttrs)) {
    if (!Object.hasOwn(newAttrs, name)) remove.push(name);
  }
  if (remove.length > 0 || setEntries.length > 0) {
    // fromEntries: "__proto__" 같은 이름도 프로토타입 setter에 먹히지 않고 own 속성이 된다.
    patches.push({ type: PATCH_TYPE.PROPS, path, set: Object.fromEntries(setEntries), remove });
  }
}

/**
 * keyed 자식 비교 (React식 lastPlacedIndex). docs/diff-patch.md 4장.
 * 시간 O(n) (Map 조회 + 한 번 순회), 추가 공간 O(n).
 *
 * 1) 짝짓기: 새 자식마다 재사용할 old 자식을 찾는다.
 *    - key가 있고 old의 "첫 번째" 같은 key가 아직 안 쓰였으면 그것 (type이 다르면 재사용 안 함 -> old 제거, new 생성).
 *    - 중복 key의 2번째 이후, key 없는 자식, 텍스트는 "key 없는 old 목록"에서 아직 안 쓴 첫 번째 중 type(과 key)이 같은 것과 짝짓는다.
 *      type과 key가 모두 같을 때만 짝이다(key는 PROPS 대상이 아니라 다르면 DOM을 재사용할 수 없다).
 * 2) lastPlacedIndex: 재사용된 old 인덱스가 지금까지 본 최대값보다 작으면 MOVE, 아니면 최대값 갱신.
 * 3) 출력 순서(docs/contracts.md 5장 규칙): 제거 -> 배치(뒤에서 앞으로) -> 재사용 자식 재귀.
 *    왜 뒤에서부터 + 다음 형제를 기준점으로: 새 순서의 뒤쪽은 이미 최종 위치에 있으므로,
 *    "바로 다음 새 형제 앞"에 끼우면 그 자리가 곧 최종 위치다. 앞쪽 인덱스가 아직 어긋나 있어도 영향이 없다.
 *    (이동하지 않는 자식들은 old 순서가 증가하므로 이미 서로 상대 순서가 맞다.)
 *    약점: lastPlacedIndex는 "맨 뒤 -> 맨 앞"처럼 한 개만 옮기면 되는 경우에도 나머지 n-1개를 옮긴다(LIS가 아님, 의도된 동작).
 */
function diffChildren(oldChildren, newChildren, parentPath, patches) {
  const oldKeyed = new Map(); // key -> old index (첫 번째 등장만)
  // key 없는 old + 중복 key의 2번째 이후. "type+key"별 등장 순서 큐. 앞에서부터 아직 안 쓴 것을 꺼낸다.
  // (type이 다른 앞쪽 old가 막고 있어도 뒤의 같은 type을 찾을 수 있게 큐를 type별로 나눈다. O(n) 유지)
  const slotOf = (node) => JSON.stringify([node.type, node.type === TEXT_TYPE ? null : node.key]);
  const oldUnkeyed = new Map();
  oldChildren.forEach((child, i) => {
    if (child.type !== TEXT_TYPE && child.key !== null && !oldKeyed.has(child.key)) oldKeyed.set(child.key, i);
    else {
      const slot = slotOf(child);
      if (!oldUnkeyed.has(slot)) oldUnkeyed.set(slot, []);
      oldUnkeyed.get(slot).push(i);
    }
  });

  const used = new Array(oldChildren.length).fill(false);
  const pairOf = new Array(newChildren.length).fill(-1); // new index -> 재사용하는 old index, 생성이면 -1
  const seenKeys = new Set();
  const unkeyedCursor = new Map(); // slot -> 큐에서 다음에 꺼낼 위치

  for (let j = 0; j < newChildren.length; j++) {
    const child = newChildren[j];
    const keyed = child.type !== TEXT_TYPE && child.key !== null && !seenKeys.has(child.key);
    if (child.type !== TEXT_TYPE && child.key !== null) seenKeys.add(child.key);
    if (keyed) {
      const i = oldKeyed.get(child.key);
      if (i !== undefined && !used[i] && oldChildren[i].type === child.type) {
        used[i] = true;
        pairOf[j] = i;
      }
      continue;
    }
    const slot = slotOf(child);
    const queue = oldUnkeyed.get(slot);
    const at = unkeyedCursor.get(slot) ?? 0;
    if (queue && at < queue.length) {
      unkeyedCursor.set(slot, at + 1);
      used[queue[at]] = true;
      pairOf[j] = queue[at];
    }
  }

  // 같은 인덱스에서 서로 짝이 없는 old/new는 REPLACE 하나로 처리한다(docs/diff-patch.md 4장 세부 규칙).
  // 단 같은 key + 다른 type은 docs/diff-patch.md 4장대로 REMOVE + CREATE. 제자리 교체라서 이동 대상이 될 수 없으므로
  // lastPlacedIndex 순서(old 인덱스가 증가하는 안정 구간)를 깨지 않는 경우에만 쓴다.
  const replaced = new Array(newChildren.length).fill(false);
  const moved = new Array(newChildren.length).fill(false);
  let lastPlacedIndex = 0;
  for (let j = 0; j < newChildren.length; j++) {
    if (pairOf[j] === -1) {
      const o = oldChildren[j];
      const n = newChildren[j];
      const sameKey = o && o.type !== TEXT_TYPE && n.type !== TEXT_TYPE && o.key !== null && o.key === n.key;
      if (o && !used[j] && !sameKey && j >= lastPlacedIndex) {
        replaced[j] = true;
        used[j] = true;
        lastPlacedIndex = j;
      }
      continue;
    }
    if (pairOf[j] < lastPlacedIndex) moved[j] = true;
    else lastPlacedIndex = pairOf[j];
  }

  // ① 사용되지 않은 old 제거 (old 좌표, patch가 일괄 해석하므로 인덱스가 밀리지 않음)
  for (let i = 0; i < oldChildren.length; i++) {
    if (!used[i]) patches.push({ type: PATCH_TYPE.REMOVE, path: [...parentPath, i] });
  }

  // ② 배치. 다음 새 형제가 재사용/제자리 교체면 { old: 그 old 인덱스 }(교체된 경우 patch가 새 노드로 바꿔 읽는다), 새로 만들면 { new: j }.
  const beforeOf = (j) => {
    if (j + 1 >= newChildren.length) return null;
    if (pairOf[j + 1] !== -1) return { old: pairOf[j + 1] };
    return replaced[j + 1] ? { old: j + 1 } : { new: j + 1 };
  };
  const isCreate = (j) => pairOf[j] === -1 && !replaced[j];
  // 맨 끝에 연속으로 생성되는 꼬리는 앞에서부터 before: null로 이어 붙여도 결과가 같다(phase1 계약과 동일한 모양 유지).
  // 이 꼬리가 먼저 만들어져도 그 앞 형제의 기준점 { new: tail }이 이미 존재하므로 뒤따르는 배치가 유효하다.
  let tail = newChildren.length;
  while (tail > 0 && isCreate(tail - 1)) tail--;
  for (let j = tail; j < newChildren.length; j++) {
    patches.push({ type: PATCH_TYPE.CREATE, path: [...parentPath, j], node: newChildren[j], before: null });
  }
  for (let j = tail - 1; j >= 0; j--) {
    if (replaced[j]) {
      patches.push({ type: PATCH_TYPE.REPLACE, path: [...parentPath, j], node: newChildren[j] });
    } else if (pairOf[j] === -1) {
      patches.push({ type: PATCH_TYPE.CREATE, path: [...parentPath, j], node: newChildren[j], before: beforeOf(j) });
    } else if (moved[j]) {
      patches.push({ type: PATCH_TYPE.MOVE, path: [...parentPath, pairOf[j]], index: j, before: beforeOf(j) });
    }
  }

  // ③ 재사용된 자식으로 내려가 props/텍스트/자식 갱신 (old 좌표)
  for (let j = 0; j < newChildren.length; j++) {
    if (pairOf[j] !== -1) diffNode(oldChildren[pairOf[j]], newChildren[j], [...parentPath, pairOf[j]], patches);
  }
}
