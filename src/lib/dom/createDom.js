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
 * - onClick, onInput 같은 이벤트 props(on + 대문자)는 속성이 아니라 이벤트 리스너로 단다. (Phase 2)
 * - false / null / undefined는 "속성 없음"으로 본다. (예: checked: false, disabled: false)
 * - true는 값 없는 속성으로 쓴다. (예: disabled: true → disabled="")
 * value/checked는 속성(attribute)만 바꾸면 이미 사용자가 입력한 화면 값이 바뀌지 않으므로
 * DOM 프로퍼티도 함께 맞춘다.
 */
export function setProp(el, name, value) {
  if (isEventProp(name)) {
    setListener(el, toEventType(name), value);
    return;
  }
  if (value === false || value === null || value === undefined) {
    removeProp(el, name);
    return;
  }

  el.setAttribute(name, value === true ? '' : value);
  // 같은 값을 다시 넣으면 입력 중인 커서가 끝으로 튈 수 있으므로 다를 때만 대입한다.
  if (name === 'value' && 'value' in el && el.value !== String(value)) el.value = value;
  if (name === 'checked' && 'checked' in el) el.checked = true;
}

export function removeProp(el, name) {
  if (isEventProp(name)) {
    setListener(el, toEventType(name), null);
    return;
  }
  el.removeAttribute(name);
  if (name === 'value' && 'value' in el) el.value = '';
  if (name === 'checked' && 'checked' in el) el.checked = false;
}

// ── 이벤트 props (Phase 2) ────────────────────────────────
// 요소마다 "지금 달려 있는 리스너"를 기억해 두었다가, 다음 렌더에서 새 함수로 바꿔 끼운다.
// 컴포넌트는 렌더링할 때마다 새 함수를 만들기 때문에 diff는 매번 PROPS 변경을 내고, 여기서 교체된다.
const listenersByElement = new WeakMap();

/** onClick처럼 on 뒤에 대문자가 오면 이벤트 props다. (HTML의 소문자 onclick 속성은 그대로 속성으로 둔다) */
function isEventProp(name) {
  return /^on[A-Z]/.test(name);
}

/** onClick → click, onKeyDown → keydown */
function toEventType(name) {
  return name.slice(2).toLowerCase();
}

function setListener(el, type, handler) {
  let listeners = listenersByElement.get(el);
  if (!listeners) {
    listeners = {};
    listenersByElement.set(el, listeners);
  }

  if (listeners[type]) el.removeEventListener(type, listeners[type]);
  if (typeof handler === 'function') {
    el.addEventListener(type, handler);
    listeners[type] = handler;
  } else {
    delete listeners[type];
  }
}
