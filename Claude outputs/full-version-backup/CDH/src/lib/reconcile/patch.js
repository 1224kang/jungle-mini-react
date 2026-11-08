// [4-4] Patch — 흐름 지도는 app/main.js 맨 위.
//   ◀ 부른 곳: app.js commit()   ▶ 다음: 돌려준 touched 를 app.js 가 [4-5] 에서 깜빡임/요약에 씁니다.
// Patch: 패치 목록을 실제 DOM 에 반영합니다.
//
// 핵심 순서 (레슨 0005 의 "인덱스가 밀린다" 문제를 피하는 방법)
//   1) 모든 path 를 노드로 바꿔 둔다. 이 시점은 DOM 이 아직 옛 상태입니다.
//   2) 글자와 속성을 바꾼다.
//   3) 타입이 바뀐 노드를 새 노드로 교체한다.
//   4) 짝 없는 노드를 지운다.
//   5) 부모별 자식 배치(CHILDREN)를 맞춘다. 새 노드는 만들어 끼우고, 이동 대상만 옮긴다.
//
// 반환값의 touched 는 "실제로 건드린 DOM 노드" 모음입니다 (화면에 표시하는 용도).

import { createDOM } from '../dom/create.js';
import { patchProps, syncControlled } from '../dom/props.js';

// 옛 트리 기준 path 를 DOM 노드로 바꿉니다. mount 의 첫 자식이 트리의 루트입니다.
function nodeAt(mount, path) {
  let node = mount.firstChild;
  for (const i of path) node = node.childNodes[i];
  return node;
}

// [4-4] 입구. 아래 1) ~ 5) 순서로 실행합니다 (순서가 중요).
export function applyPatches(mount, patches) {
  const touched = new Set();
  if (patches.length === 0) return { touched };

  // 1) 대상 노드를 먼저 전부 잡는다. CHILDREN 은 옛 자식 목록의 스냅샷도 함께 잡는다.
  const targets = patches.map((p) => {
    const node = nodeAt(mount, p.path);
    return p.op === 'CHILDREN'
      ? { p, node, snapshot: Array.from(node.childNodes) }
      : { p, node };
  });

  // 2) 글자와 속성
  const propNodes = [];
  for (const { p, node } of targets) {
    if (p.op === 'TEXT') {
      node.textContent = p.value;
      touched.add(node);
    }
    if (p.op === 'PROPS') {
      // [Phase 2] 속성 규칙은 dom/props.js. 이벤트 핸들러만 바뀐 경우는 DOM 이 안 바뀌므로 touched 에 넣지 않습니다.
      if (patchProps(node, p.set, p.remove)) touched.add(node);
      propNodes.push(node);
    }
  }

  // 3) 타입이 바뀐 노드 교체. 옛 노드 → 새 노드 대응을 기억해 둔다.
  const replaced = new Map();
  for (const { p, node } of targets) {
    if (p.op !== 'REPLACE') continue;
    const fresh = createDOM(p.value);
    node.replaceWith(fresh);
    replaced.set(node, fresh);
    touched.add(fresh);
  }

  // 4) 짝 없는 노드 제거
  for (const { p, node } of targets) {
    if (p.op !== 'REMOVE') continue;
    touched.add(node.parentNode);
    node.remove();
  }

  // 5) 자식 배치
  for (const { p, node, snapshot } of targets) {
    if (p.op === 'CHILDREN') placeChildren(node, snapshot, p.plan, replaced, touched);
  }

  // 6) [Phase 2] <select value> 처럼 자식(option)이 바뀐 뒤에야 맞출 수 있는 value 를 다시 맞춘다.
  for (const node of propNodes) syncControlled(node);

  return { touched };
}

// plan 의 순서대로 자식을 맞춥니다.
// 뒤에서부터 보면서, 새로 만든 노드와 이동 대상만 "자기 다음 노드 앞"에 끼웁니다.
// 이동하지 않는 노드는 옛 순서가 그대로 유지되므로 건드리지 않습니다.
// [4-4 의 5)] 에서 부모마다 호출. 끝나면 applyPatches 로 돌아갑니다.
function placeChildren(parent, snapshot, plan, replaced, touched) {
  const nodes = plan.map((entry) => {
    if ('create' in entry) return createDOM(entry.create);
    const old = snapshot[entry.from];
    return replaced.get(old) ?? old;
  });

  for (let j = plan.length - 1; j >= 0; j--) {
    const entry = plan[j];
    if ('create' in entry || entry.moved) {
      parent.insertBefore(nodes[j], nodes[j + 1] ?? null);
      touched.add(nodes[j]);
    }
  }
}
