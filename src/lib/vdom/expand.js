import { TEXT_TYPE, invalidInputError } from '../shared/index.js';

/**
 * 컴포넌트 VNode를 모두 호출해 요소·텍스트 VNode만 남은 트리(호스트 트리)로 펼친다. (docs/contracts.md 6.2)
 * - 결과는 docs/contracts.md 1장 형식이라 diff / render에 그대로 넣을 수 있다.
 * - 입력 VNode는 수정하지 않는다. 요소는 children을 펼친 새 객체로, 텍스트 VNode는 그대로 쓴다.
 * - 컴포넌트 VNode에 key가 있으면 펼친 최상위 요소의 key로 쓴다. (결과 요소에 key가 있어도 컴포넌트 key 우선)
 * - Hook 컨텍스트는 열지 않는다. 그래서 여기서 호출되는 자식 컴포넌트의 Hook은 에러가 난다. (hooks/를 import하지 않음)
 * @param {object} vnode 요소 / 텍스트 / 컴포넌트 VNode
 * @returns {object} 호스트 VNode 트리
 */
export function expand(vnode) {
  if (isTextVNode(vnode)) return vnode;
  if (isElementVNode(vnode)) {
    return {
      type: vnode.type,
      key: vnode.key,
      props: { ...vnode.props, children: vnode.props.children.map(expand) },
    };
  }
  if (isComponentVNode(vnode)) return expandComponent(vnode);
  throw invalidInputError(`펼칠 수 없는 VNode (받은 값: ${describe(vnode)})`);
}

/** 컴포넌트 함수를 props와 함께 호출하고 결과를 이어서 펼친다. */
function expandComponent(vnode) {
  return expandComponentResult(vnode, vnode.type(vnode.props));
}

/**
 * 이미 호출한 컴포넌트의 반환값을 검사하고 펼친다. (루트 컴포넌트는 hooks가 Hook 컨텍스트 안에서 호출한 뒤 여기로 넘김)
 * - 요소 또는 컴포넌트 VNode가 아니면 에러. 컴포넌트가 컴포넌트를 반환하면 요소가 나올 때까지 계속 펼친다.
 * - 컴포넌트 VNode의 key가 null이 아니면 펼친 최상위 요소의 key로 쓴다.
 * @param {object} vnode 호출한 컴포넌트 VNode
 * @param {*} result 컴포넌트 함수의 반환값
 * @returns {object} 펼친 요소 VNode (새 객체)
 */
export function expandComponentResult(vnode, result) {
  if (!isElementVNode(result) && !isComponentVNode(result)) {
    throw invalidInputError(
      `컴포넌트 ${componentName(vnode.type)}는 요소 또는 컴포넌트 VNode 하나를 반환해야 함 (받은 값: ${describe(result)})`,
    );
  }
  const expanded = expand(result); // 항상 새 요소 객체
  if (vnode.key !== null) expanded.key = vnode.key;
  return expanded;
}

/** 텍스트 VNode(1장)인지 확인한다. */
export function isTextVNode(value) {
  return isObject(value) && value.type === TEXT_TYPE && typeof value.value === 'string';
}

/** 요소 VNode(1장)인지 확인한다. 자식까지 깊게 검사하지는 않는다. */
export function isElementVNode(value) {
  return (
    isObject(value) &&
    typeof value.type === 'string' &&
    value.type !== TEXT_TYPE &&
    hasKeyAndChildren(value)
  );
}

/** 컴포넌트 VNode(6.1)인지 확인한다. */
export function isComponentVNode(value) {
  return isObject(value) && typeof value.type === 'function' && hasKeyAndChildren(value);
}

function hasKeyAndChildren(value) {
  return (
    (value.key === null || typeof value.key === 'string') &&
    isObject(value.props) &&
    Array.isArray(value.props.children)
  );
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function componentName(fn) {
  return fn.name || '(익명)';
}

function describe(value) {
  if (typeof value === 'function') return '함수';
  if (Array.isArray(value)) return '배열';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return '객체';
  if (typeof value === 'symbol') return 'symbol';
  return JSON.stringify(value) ?? String(value);
}
