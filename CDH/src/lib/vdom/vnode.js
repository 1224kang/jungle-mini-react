// [부품] VNode 모양 정의. VNode 는 { type, props, children } 객체입니다.
// 흐름 지도는 app/main.js 맨 위에 있습니다.
//   쓰이는 곳: 테스트(h 로 손쉽게 만들기), diff.js (isVNode, keyOf), app.js (countNodes → [2] 로드 로그, [4-5] 패치 요약)
// 텍스트 자식은 문자열 그대로 둡니다.

export function h(type, props = null, ...children) {
  return {
    type,
    props: props ?? {},
    children: normalizeChildren(children),
  };
}

// 숫자는 문자열로, null / undefined / 불리언은 버립니다. 배열은 펼칩니다.
export function normalizeChildren(children) {
  const out = [];
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    out.push(typeof child === 'number' ? String(child) : child);
  }
  return out;
}

export function isVNode(value) {
  return typeof value === 'object' && value !== null && typeof value.type === 'string';
}

// key 는 리스트에서 자식을 짝짓는 데 씁니다 (레슨 0003).
export function keyOf(value) {
  return isVNode(value) ? value.props.key : undefined;
}

// 트리의 노드 수 (텍스트 포함). "전체 다시 그리면 몇 개인가" 를 보여 줄 때 씁니다.
export function countNodes(v) {
  if (typeof v === 'string') return 1;
  return 1 + v.children.reduce((sum, c) => sum + countNodes(c), 0);
}
