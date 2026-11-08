import { setProp } from './props.js';
import { TEXT_TYPE, KEY_ATTRIBUTE, getAttributes } from '../shared/index.js';

/**
 * 정규화된 VNode를 실제 DOM 노드로 만든다. (docs/contracts.md 2.4)
 * 입력은 h() 또는 domToVdom()이 만든 VNode라고 가정하고 다시 검사하지 않는다.
 * @param {object} vnode VNode (docs/contracts.md 1장)
 * @returns {Node} 새로 만든 Text 또는 Element
 */
export function render(vnode) {
  if (vnode.type === TEXT_TYPE) return document.createTextNode(vnode.value);

  const element = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(getAttributes(vnode.props))) {
    setProp(element, name, value);
  }
  if (vnode.key !== null) setProp(element, KEY_ATTRIBUTE, vnode.key);
  for (const child of vnode.props.children) {
    element.appendChild(render(child));
  }
  return element;
}
