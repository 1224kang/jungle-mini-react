// [4-2] Diff — 흐름 지도는 app/main.js 맨 위.
//   ◀ 부른 곳: app.js commit()        ▶ 다음: [4-3] describe.js, 그다음 [4-4] patch.js
// Diff: 옛 VNode 와 새 VNode 를 비교해 패치 목록을 만듭니다.
// DOM 은 건드리지 않는 순수 함수입니다.
// 패치의 path 는 "옛 트리" 기준 자식 인덱스 경로입니다 (루트는 []).
//
// 핵심 5가지 변화와 패치
//   텍스트가 바뀜        TEXT      value 로 교체
//   속성이 바뀜          PROPS     set (바뀐/추가된 값), remove (없어진 키)
//   타입(태그)이 바뀜    REPLACE   그 노드를 통째로 교체 (자식은 더 보지 않음)
//   자식이 새로 생김     CHILDREN  plan 안의 { create: VNode }
//   자식이 사라짐        REMOVE    옛 자식 제거
// 거기에 키 리스트의 순서 변경:
//   이동                 CHILDREN  plan 안의 { from, moved: true }
//
// CHILDREN plan 은 "이 부모의 자식이 새 순서로 어떻게 놓일지" 의 계획입니다.
//   plan[j] = { from: 옛 위치, moved } 또는 { create: VNode }

import { isVNode, keyOf } from '../vdom/vnode.js';

export function typeOf(v) {
  return typeof v === 'string' ? '#text' : v.type;
}

export function sameType(a, b) {
  return typeOf(a) === typeOf(b);
}

// [4-2] 입구. 루트 타입이 다르면 통째로 REPLACE, 같으면 ▶ diffNode 로 내려갑니다.
export function diff(oldRoot, newRoot) {
  if (!sameType(oldRoot, newRoot)) {
    return [{ op: 'REPLACE', path: [], value: newRoot }];
  }
  return diffNode(oldRoot, newRoot, []);
}

// [4-2a] 타입이 같은 두 노드 비교: 글자면 TEXT, 요소면 ▶ diffProps(속성) 후 ▶ diffChildren(자식).
function diffNode(oldN, newN, path) {
  if (typeof oldN === 'string') {
    return oldN === newN ? [] : [{ op: 'TEXT', path, value: newN }];
  }
  const patches = [];
  const props = diffProps(oldN.props, newN.props);
  if (props) patches.push({ op: 'PROPS', path, ...props });
  patches.push(...diffChildren(oldN.children, newN.children, path));
  return patches;
}

// [4-2b] 속성 비교 → PROPS 패치 재료 { set, remove }. 끝나면 diffNode 로 돌아갑니다.
function diffProps(oldProps, newProps) {
  const set = {};
  const remove = [];
  for (const k of Object.keys(newProps)) {
    if (!sameProp(oldProps[k], newProps[k])) set[k] = newProps[k];
  }
  for (const k of Object.keys(oldProps)) {
    if (!(k in newProps)) remove.push(k);
  }
  return Object.keys(set).length || remove.length ? { set, remove } : null;
}

// [Phase 2] 속성 값 비교. style={{...}} 처럼 렌더마다 새로 만드는 객체는 내용이 같으면 같은 값으로 봅니다.
// 함수(이벤트 핸들러)는 렌더마다 새 클로저라 달라 보이지만, 최신 함수로 교체해야 하므로 일부러 "다름" 으로 둡니다.
function sameProp(a, b) {
  if (a === b) return true;
  if (!isPlain(a) || !isPlain(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && a[k] === b[k]);
}

function isPlain(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasKey(v) {
  return isVNode(v) && v.props.key !== undefined;
}

// [4-2c] 자식 비교. 안에서 순서대로:
//   1) 짝짓기(key 또는 위치)  2) 짝 없는 옛 자식 REMOVE  3) 짝 있는 자식은 타입 같으면 diffNode(재귀)/다르면 REPLACE
//   4) 이동 판정(lastPlaced)  5) CHILDREN plan 작성(create/moved)
// 끝나면 패치 배열을 돌려주고, 최종 결과는 diff() → app.js commit() 으로 올라갑니다.
function diffChildren(oldKids, newKids, path) {
  // 자식 중 하나라도 key 가 있으면 key 로 짝짓고, 없으면 위치로 짝짓습니다.
  const keyed = oldKids.some(hasKey) || newKids.some(hasKey);
  const matchOf = newKids.map(() => -1); // 새 위치 j → 옛 위치 i
  const usedOld = oldKids.map(() => false);

  if (keyed) {
    const oldByKey = new Map();
    oldKids.forEach((c, i) => {
      if (hasKey(c)) oldByKey.set(keyOf(c), i);
    });
    newKids.forEach((c, j) => {
      if (!hasKey(c)) return;
      const i = oldByKey.get(keyOf(c));
      if (i !== undefined && !usedOld[i]) {
        matchOf[j] = i;
        usedOld[i] = true;
      }
    });
  } else {
    newKids.forEach((_, j) => {
      if (j < oldKids.length) {
        matchOf[j] = j;
        usedOld[j] = true;
      }
    });
  }

  const patches = [];

  // 짝이 없는 옛 자식은 제거
  oldKids.forEach((_, i) => {
    if (!usedOld[i]) patches.push({ op: 'REMOVE', path: [...path, i] });
  });

  // 짝이 있는 자식: 타입이 다르면 그 자리에서 교체, 같으면 안으로 재귀
  newKids.forEach((c, j) => {
    const i = matchOf[j];
    if (i === -1) return;
    const old = oldKids[i];
    if (sameType(old, c)) patches.push(...diffNode(old, c, [...path, i]));
    else patches.push({ op: 'REPLACE', path: [...path, i], value: c });
  });

  // 이동 판정 (키 리스트에서만). 레슨 0004 의 lastPlaced 규칙과 같습니다.
  const moved = newKids.map(() => false);
  if (keyed) {
    let lastPlaced = 0;
    newKids.forEach((_, j) => {
      const i = matchOf[j];
      if (i === -1) return;
      if (i < lastPlaced) moved[j] = true;
      else lastPlaced = i;
    });
  }

  const plan = newKids.map((c, j) =>
    matchOf[j] === -1 ? { create: c } : { from: matchOf[j], moved: moved[j] }
  );

  const structural = usedOld.some((u) => !u) || plan.some((p) => 'create' in p || p.moved);
  if (structural) patches.push({ op: 'CHILDREN', path, plan });

  return patches;
}
