// [2-4] (로드/화면 갱신) VNode → 실제 DOM 노드.   ◀ 부른 곳: app.js renderTest
// [4-4] (Patch) 새로 만들어야 할 노드.            ◀ 부른 곳: patch.js (REPLACE, CHILDREN 의 create)
// 흐름 지도: app/main.js 맨 위.
// key 도 속성으로 남겨 둡니다. 그래야 DOM → VNode 로 다시 읽을 때 key 가 살아 있습니다.

export function createDOM(v) {
  if (typeof v === 'string') return document.createTextNode(v);

  const el = document.createElement(v.type);
  for (const [k, val] of Object.entries(v.props)) {
    if (val === null || val === undefined) continue;
    el.setAttribute(k, String(val));
  }
  for (const child of v.children) el.appendChild(createDOM(child));
  return el;
}
