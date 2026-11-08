import { TEXT_TYPE, PATCH_TYPE, getAttributes, invalidInputError } from '../shared/index.js';

/**
 * 두 VNode 트리를 비교해 Patch 목록을 계산한다. 순수 함수이며 외부 상태에 의존하지 않는다.
 * path는 모두 old 트리 좌표다. (docs/diff-patch-contract.md 5절)
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
 * 자식 비교 진입점. 지금은 인덱스 기반만 있다.
 * Phase 2에서 key가 있는 자식에 대해 keyed 비교로 분기할 자리다.
 */
function diffChildren(oldChildren, newChildren, parentPath, patches) {
  diffChildrenByIndex(oldChildren, newChildren, parentPath, patches);
}

/**
 * 인덱스 기반: 같은 위치끼리 짝짓는다. 시간 O(n), patch 외 추가 공간 O(1).
 * 순서(계약 5절): 제거 -> 배치(생성) -> 재사용 자식으로 재귀.
 * 이 모양을 지키면 phase 2의 keyed diff도 같은 형식의 patch 배열을 낼 수 있다.
 */
function diffChildrenByIndex(oldChildren, newChildren, parentPath, patches) {
  const common = Math.min(oldChildren.length, newChildren.length);

  // 남는 이전 자식 제거. path는 old 좌표이고 patch가 실행 전에 한꺼번에 해석하므로 인덱스가 밀리지 않는다.
  for (let i = common; i < oldChildren.length; i++) {
    patches.push({ type: PATCH_TYPE.REMOVE, path: [...parentPath, i] });
  }
  // 남는 새 자식 생성. 모두 끝에 붙이므로 before는 null이고, 앞 인덱스부터 차례로 붙어야 순서가 맞는다.
  for (let j = common; j < newChildren.length; j++) {
    patches.push({ type: PATCH_TYPE.CREATE, path: [...parentPath, j], node: newChildren[j], before: null });
  }
  // 짝지어진 자식은 DOM을 재사용할 수 있는지 보고 내려간다.
  for (let i = 0; i < common; i++) {
    diffNode(oldChildren[i], newChildren[i], [...parentPath, i], patches);
  }
}
