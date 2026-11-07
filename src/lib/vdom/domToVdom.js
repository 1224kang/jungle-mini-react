import { createElement, createTextNode, createRoot } from './vnode.js';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// 실행되면 안 되는 태그는 Virtual DOM에 포함하지 않는다.
const IGNORED_TAGS = new Set(['script']);

// 이 태그 안의 공백은 화면에 그대로 보이므로 지우지 않는다.
const WHITESPACE_PRESERVING_TAGS = new Set(['pre', 'textarea']);

/**
 * 실제 DOM 노드 하나를 VNode로 변환한다.
 * 변환 대상이 아닌 노드(주석, script, 들여쓰기 공백)는 null을 반환한다.
 */
export function domToVdom(node) {
  if (node.nodeType === TEXT_NODE) {
    return isIndentation(node) ? null : createTextNode(node.textContent);
  }

  if (node.nodeType === ELEMENT_NODE) {
    const type = node.tagName.toLowerCase();
    if (IGNORED_TAGS.has(type)) return null;

    const props = {};
    for (const attr of node.attributes) {
      props[attr.name] = attr.value;
    }
    return createElement(type, props, childrenToVdom(node));
  }

  // 주석, 처리 명령 등은 화면에 보이지 않으므로 무시한다.
  return null;
}

/** 부모 노드의 자식들을 VNode 배열로 변환한다. */
export function childrenToVdom(parent) {
  const children = [];
  for (const child of parent.childNodes) {
    const vnode = domToVdom(child);
    if (vnode) children.push(vnode);
  }
  return children;
}

/** 영역(container) 요소의 "내용"을 루트 VNode로 변환한다. container 자신의 태그·속성은 포함하지 않는다. */
export function containerToVdom(container) {
  return createRoot(childrenToVdom(container));
}

/** HTML 문자열을 루트 VNode로 변환한다. <template>을 쓰므로 파싱 중에 스크립트가 실행되지 않는다. */
export function htmlToVdom(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return containerToVdom(template.content);
}

/**
 * 줄바꿈이 들어간 공백 전용 텍스트는 HTML 코드의 들여쓰기로 보고 무시한다.
 * 예) "<ul>\n  <li>" 사이의 "\n  "
 * 줄바꿈 없는 공백(예: "<b>a</b> <i>b</i>"의 " ")은 화면에 보이므로 유지한다.
 */
function isIndentation(textNode) {
  const text = textNode.textContent;
  if (text.trim() !== '' || !text.includes('\n')) return false;

  for (let el = textNode.parentElement; el; el = el.parentElement) {
    if (WHITESPACE_PRESERVING_TAGS.has(el.tagName.toLowerCase())) return false;
  }
  return true;
}
