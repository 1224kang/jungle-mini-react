import { isTextNode } from '../vdom/vnode.js';

/**
 * Diff가 찾아내는 5가지 변경 종류
 *
 * CREATE  : 새 노드가 생겼다          { type, path, node }
 * REMOVE  : 기존 노드가 사라졌다      { type, path }
 * REPLACE : 태그 종류가 바뀌었다      { type, path, node }   (div → p, 요소 ↔ 텍스트)
 * TEXT    : 텍스트 내용이 바뀌었다    { type, path, text }
 * PROPS   : 속성이 추가/변경/삭제됐다 { type, path, set: { name: value }, remove: [name] }
 *
 * path는 루트에서 해당 노드까지 내려가는 자식 인덱스 배열이다.
 *   예) [1, 0] → 루트의 1번째 자식의 0번째 자식
 */
export const PATCH = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  TEXT: 'TEXT',
  PROPS: 'PROPS',
});

/** 두 VNode 트리를 비교해 변경 목록(patches)을 반환한다. 변경이 없으면 빈 배열. */
export function diff(oldNode, newNode) {
  const patches = [];
  diffNode(oldNode, newNode, [], patches);
  return patches;
}

function diffNode(oldNode, newNode, path, patches) {
  // ① 추가
  if (oldNode === undefined) {
    patches.push({ type: PATCH.CREATE, path, node: newNode });
    return;
  }
  // ② 삭제
  if (newNode === undefined) {
    patches.push({ type: PATCH.REMOVE, path });
    return;
  }
  // ③ 종류가 다르면 비교하지 않고 통째로 교체 (하위 트리도 다르다고 가정)
  // 종류가 같다는걸 보장
  if (oldNode.type !== newNode.type) {
    patches.push({ type: PATCH.REPLACE, path, node: newNode });
    return;
  }
  // ④ 텍스트 노드: 내용만 비교
  if (isTextNode(oldNode)) {
    if (oldNode.text !== newNode.text) {
      patches.push({ type: PATCH.TEXT, path, text: newNode.text });
    }
    return;
  }
  // ⑤ 같은 태그: 속성 비교 후 자식으로 내려간다
  const propsPatch = diffProps(oldNode.props, newNode.props);
  if (propsPatch) patches.push({ type: PATCH.PROPS, path, ...propsPatch });

  diffChildren(oldNode.children, newNode.children, path, patches);
}

function diffProps(oldProps, newProps) { //속성 비교
  const set = {}; //새로 넣거나 값을 바꿀 것
  const remove = []; //지울 것

  for (const [name, value] of Object.entries(newProps)) {
    if (oldProps[name] !== value) set[name] = value;
  }
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) remove.push(name);
  }

  if (Object.keys(set).length === 0 && remove.length === 0) return null;
  return { set, remove };
}

/**
 * 자식은 같은 인덱스끼리 비교한다.
 * - 공통 길이까지는 재귀 비교
 * - 새 쪽이 길면 뒤쪽을 CREATE
 * - 이전 쪽이 길면 뒤쪽을 REMOVE (뒤에서부터 지워야 앞 인덱스가 밀리지 않는다)
 */
function diffChildren(oldChildren, newChildren, path, patches) {
  const common = Math.min(oldChildren.length, newChildren.length);

  for (let i = 0; i < common; i++) { //구간 1: 짝이 있는 번호
    diffNode(oldChildren[i], newChildren[i], [...path, i], patches);
  }
  for (let i = common; i < newChildren.length; i++) { //구간 2: 새 쪽에만 있는 번호(CREATE)
    diffNode(undefined, newChildren[i], [...path, i], patches);
  }
  for (let i = oldChildren.length - 1; i >= common; i--) { //구간 3: 이전 쪽에만 있는 번호(REMOVE)
    diffNode(oldChildren[i], undefined, [...path, i], patches);
  }
}
