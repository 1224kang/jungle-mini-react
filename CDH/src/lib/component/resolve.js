// [Phase 2] 컴포넌트 트리 → 일반 Virtual DOM 트리.
//   ◀ 부른 곳: function-component.js (루트 함수가 돌려준 결과를 diff 하기 전에)
// h(Card, { title: 'a' }, '내용') 처럼 type 이 "함수" 인 노드를 만나면 그 함수를 props 로 호출해
// 돌려받은 결과로 바꿔 끼웁니다. 끝나면 type 이 전부 태그 이름(문자열)이라서 Phase 1 의 diff / patch 를 그대로 씁니다.
//
// 자식 컴포넌트는 순수 함수입니다: props 만 받고, Hook 을 못 씁니다 (runAsChild 안에서 호출되므로 Hook 이 오류).
// null / false / 배열(프래그먼트) 반환도 지원합니다. 배열은 부모의 자식 목록에 펼쳐 넣습니다.

import { runAsChild } from '../hooks/runtime.js';

const MAX_DEPTH = 200;

export function expand(node, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('컴포넌트가 너무 깊게 중첩되었습니다 (자기 자신을 무한히 부르는 것은 아닌가요?)');
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'number') return [String(node)];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap((n) => expand(n, depth + 1));

  if (typeof node !== 'object' || (typeof node.type !== 'string' && typeof node.type !== 'function')) {
    throw new TypeError(`렌더할 수 없는 값입니다: ${String(node)}`);
  }

  if (typeof node.type === 'function') {
    const { key, ...rest } = node.props ?? {};
    const out = runAsChild(() => node.type({ ...rest, children: node.children ?? [] }));
    let nodes = expand(out, depth + 1);
    // 리스트에서 <Item key=...> 로 준 key 를 결과 요소로 옮겨 줍니다 (diff 가 key 로 짝짓기 때문).
    if (key !== undefined && nodes.length === 1 && typeof nodes[0] === 'object' && nodes[0].props.key === undefined) {
      nodes = [{ ...nodes[0], props: { ...nodes[0].props, key } }];
    }
    return nodes;
  }

  return [
    {
      type: node.type,
      props: node.props ?? {},
      children: (node.children ?? []).flatMap((c) => expand(c, depth + 1)),
    },
  ];
}

// 루트는 정확히 하나의 요소(또는 글자)여야 합니다.
export function resolveTree(out) {
  const nodes = expand(out);
  if (nodes.length !== 1) {
    throw new Error(`루트 컴포넌트는 정확히 하나의 요소를 반환해야 합니다 (받은 개수: ${nodes.length}).`);
  }
  return nodes[0];
}
