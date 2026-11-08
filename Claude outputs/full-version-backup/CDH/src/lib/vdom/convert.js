// 실제 DOM ↔ VNode 변환, 그리고 VNode → HTML 문자열.
// 흐름 지도: app/main.js 맨 위.  이 파일은 [2-1] [2-2] [2-4] [3-3] [4-1] 에서 불립니다.

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

// [2-2] (로드) 실제 영역 DOM → Virtual DOM.   ◀ 부른 곳: app.js initApp
// [4-1] (Patch) 테스트 영역 DOM → 새 Virtual DOM.  ◀ 부른 곳: app.js readPane
// 실제 DOM 노드 → VNode. 공백만 있는 텍스트와 주석은 버립니다.
// ▶ 다음: 자식마다 자기 자신을 다시 부름(재귀). 끝나면 호출한 곳으로 돌아갑니다.
export function domToVNode(node) {
  if (node.nodeType === TEXT_NODE) return node.nodeValue;

  const props = {};
  for (const attr of node.attributes) props[attr.name] = attr.value;

  const children = [];
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      if (child.nodeValue.trim() !== '') children.push(child.nodeValue);
    } else if (child.nodeType === ELEMENT_NODE) {
      children.push(domToVNode(child));
    }
  }
  return { type: node.nodeName.toLowerCase(), props, children };
}

// [2-1] (로드) 공백 노드 정리.   ◀ 부른 곳: app.js initApp   ▶ 다음: [2-2] domToVNode
// 공백만 있는 텍스트와 주석을 DOM 에서 제자리로 지웁니다.
// domToVNode 가 이 노드들을 버리기 때문에, DOM 에도 없어야 VNode 의 자식 인덱스와
// DOM 의 childNodes 인덱스가 같아지고 패치의 path 가 맞습니다.
export function stripBlankNodes(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === TEXT_NODE) {
      if (child.nodeValue.trim() === '') child.remove();
    } else if (child.nodeType === ELEMENT_NODE) {
      stripBlankNodes(child);
    } else {
      child.remove();
    }
  }
}

// [3-3] (편집) 코드 칸의 HTML 글자 → VNode.   ◀ 부른 곳: app.js code 'input' 핸들러
//        ▶ 다음: app.js 가 이 VNode 를 createDOM() 으로 화면에 그림
// HTML 문자열 → VNode (첫 번째 요소). <template> 으로 파싱하면 스크립트가 실행되지 않습니다.
export function parseHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = [...template.content.childNodes].find((n) => n.nodeType === ELEMENT_NODE);
  return root ? domToVNode(root) : null;
}

function openTag(v) {
  const attrs = Object.entries(v.props)
    .filter(([, val]) => val !== null && val !== undefined)
    .map(([k, val]) => ` ${k}="${escapeAttr(String(val))}"`)
    .join('');
  return `<${v.type}${attrs}>`;
}

// VNode → HTML 한 줄 문자열.
export function vnodeToHTML(v) {
  if (typeof v === 'string') return escapeText(v);
  if (VOID_TAGS.has(v.type)) return openTag(v);
  return `${openTag(v)}${v.children.map(vnodeToHTML).join('')}</${v.type}>`;
}

// [2-4] / [4-5] VNode → 코드 칸에 보여 줄 HTML 글자.   ◀ 부른 곳: app.js renderTest 등
// 사람이 읽기 좋게 들여쓴 HTML. 자식이 요소뿐인 곳에서만 줄을 바꿉니다.
// (글자가 섞인 곳은 공백이 글자로 읽히지 않도록 한 줄로 둡니다.)
export function prettyHTML(v, depth = 0) {
  const pad = '  '.repeat(depth);
  const inline =
    typeof v === 'string' ||
    VOID_TAGS.has(v.type) ||
    v.children.length === 0 ||
    v.children.some((c) => typeof c === 'string');
  if (inline) return pad + vnodeToHTML(v);

  const inner = v.children.map((c) => prettyHTML(c, depth + 1)).join('\n');
  return `${pad}${openTag(v)}\n${inner}\n${pad}</${v.type}>`;
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
