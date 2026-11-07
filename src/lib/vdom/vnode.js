/**
 * Virtual DOM 노드(VNode) 구조
 *
 * 요소 노드:   { type: 'div', props: { class: 'box' }, children: [VNode, ...] }
 * 텍스트 노드: { type: '#text', text: '안녕하세요' }
 * 루트 노드:   { type: '#root', props: {}, children: [...] }
 *   - 영역(container) 하나의 "내용 전체"를 나타낸다.
 *   - 실제 DOM의 container 요소 자체에 대응하며, 새 DOM으로 만들어지지 않는다.
 */

export const TEXT_TYPE = '#text';
export const ROOT_TYPE = '#root';

export function createElement(type, props = {}, children = []) {
  return { type, props: { ...props }, children };
}

export function createTextNode(text) {
  return { type: TEXT_TYPE, text: String(text) };
}

export function createRoot(children = []) {
  return createElement(ROOT_TYPE, {}, children);
}

export function isTextNode(vnode) {
  return vnode.type === TEXT_TYPE;
}
