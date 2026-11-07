import { isTextNode } from '../vdom/vnode.js';

/** VNode 하나로 실제 DOM 노드를 만든다. (자식까지 재귀적으로) */
export function createDom(vnode) {
  if (isTextNode(vnode)) return document.createTextNode(vnode.text);

  const el = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    setProp(el, name, value);
  }
  for (const child of vnode.children) {
    el.appendChild(createDom(child));
  }
  return el;
}

/** 루트 VNode의 내용으로 container를 통째로 다시 그린다. (최초 렌더링용) */
export function renderRoot(container, root) {
  container.replaceChildren(...root.children.map(createDom));
}

/**
 * 속성을 설정한다.
 * value/checked는 속성(attribute)만 바꾸면 이미 사용자가 입력한 화면 값이 바뀌지 않으므로
 * DOM 프로퍼티도 함께 맞춘다.
 */
export function setProp(el, name, value) {
  el.setAttribute(name, value);
  if (name === 'value' && 'value' in el) el.value = value;
  if (name === 'checked' && 'checked' in el) el.checked = true;
}

export function removeProp(el, name) {
  el.removeAttribute(name);
  if (name === 'value' && 'value' in el) el.value = '';
  if (name === 'checked' && 'checked' in el) el.checked = false;
}
