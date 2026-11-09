import { expand, expandComponentResult, isElementVNode, isComponentVNode } from '../vdom/expand.js';
import { render } from '../dom/render.js';
import { diff } from '../reconcile/diff.js';
import { patch } from '../reconcile/patch.js';
import { DOM_NODE_TYPE, invalidInputError } from '../shared/index.js';
import { renderRootComponent } from './hooks.js';

/**
 * 앱을 컨테이너에 마운트한다. 첫 렌더는 동기로 한다.
 * - 컴포넌트 VNode: 루트 컴포넌트로 삼는다. 상태가 바뀌면 루트부터 다시 그린다.
 * - 요소 VNode: Hook 없이 한 번만 그린다. (상태가 없으니 갱신도 없음)
 * 첫 렌더 중 에러는 그대로 던지고, 컨테이너는 바꾸지 않는다.
 * @param {object} vnode 루트 컴포넌트 VNode (h(App, props)) 또는 요소 VNode
 * @param {Element} container 마운트할 컨테이너 요소. 기존 자식은 교체된다.
 * @returns {{unmount: () => void}}
 */
export function mount(vnode, container) {
  if (container?.nodeType !== DOM_NODE_TYPE.ELEMENT) {
    throw invalidInputError('mount의 container는 DOM Element여야 함');
  }
  const isComponent = isComponentVNode(vnode);
  if (!isComponent && !isElementVNode(vnode)) {
    throw invalidInputError('mount의 vnode는 요소 또는 컴포넌트 VNode여야 함 (h()로 만드세요)');
  }

  const root = createRoot(vnode, container, isComponent);

  // ① 새 트리를 끝까지 만든 뒤에만 DOM을 건드린다. 여기서 에러가 나면 컨테이너는 그대로다.
  const hostTree = buildHostTree(root);
  const dom = render(hostTree);
  container.replaceChildren(dom);
  root.dom = dom;
  root.hostTree = hostTree;

  runEffects(root);
  return { unmount: () => unmount(root) };
}

/** 루트 인스턴스. 앱 하나당 하나. */
function createRoot(element, container, isComponent) {
  const root = {
    container,
    element, // 루트 VNode (h(App, props) 또는 요소 VNode)
    isComponent,
    dom: null, // 현재 루트 DOM 노드 (patch 반환값으로 갱신)
    hostTree: null, // 직전에 그린 호스트 VNode 트리 (다음 diff의 old)
    hooks: [], // Hook 슬롯. 렌더마다 같은 순서로 접근
    hookTypes: null, // 첫 렌더의 슬롯 type 목록 (순서·개수 검사용)
    dirty: false, // 마지막 렌더 이후 상태 값이 실제로 바뀌었는가
    scheduled: false, // flush가 예약됐는가
    rendering: false, // ① 진행 중 (이때의 setState는 에러)
    pendingEffects: [], // 이번 렌더에서 실행할 effect 슬롯 (useEffect에서 채움)
    unmounted: false,
    nestedUpdates: 0, // effect발 연속 갱신 횟수 (MAX_NESTED_UPDATES 검사, useEffect에서 사용)
    requestUpdate: () => scheduleUpdate(root), // setState가 부르는 갱신 예약
  };
  return root;
}

/**
 * ① 루트 컴포넌트를 Hook 컨텍스트 안에서 호출한 뒤(컨텍스트를 닫고) 자식 컴포넌트를 펼친다.
 * 요소 VNode 루트는 Hook 없이 펼치기만 한다.
 */
function buildHostTree(root) {
  root.rendering = true;
  try {
    if (!root.isComponent) return expand(root.element);
    // 컨텍스트는 renderRootComponent 안에서 닫힌다. 자식 펼치기는 그 뒤라 자식의 Hook은 에러가 난다.
    return expandComponentResult(root.element, renderRootComponent(root));
  } finally {
    root.rendering = false;
  }
}

/** 첫 setState만 마이크로태스크에 flush를 예약한다. 같은 동기 작업의 나머지 변경은 그 flush에 합쳐진다. */
function scheduleUpdate(root) {
  if (root.scheduled) return;
  root.scheduled = true;
  queueMicrotask(() => flush(root));
}

/**
 * 모인 상태 변경을 한 번에 반영한다. ① 생성 → ② diff → ③ patch → effect 실행.
 * ①에서 에러가 나면 DOM과 hostTree는 이전 그대로 두고 에러를 던진다.
 */
function flush(root) {
  root.scheduled = false;
  if (root.unmounted || !root.dirty) return; // 같은 값만 넣었으면 렌더 0회
  root.dirty = false;

  const next = buildHostTree(root); // ①
  const patches = diff(root.hostTree, next); // ②
  root.dom = patch(root.dom, patches); // ③ 루트가 교체되면 새 노드
  root.hostTree = next;

  runEffects(root);
}

/**
 * 이번 렌더에서 실행 대상인 effect를 실행한다. (cleanup 먼저, 그다음 effect)
 * TODO(T5): useEffect 구현 시 채운다. 지금은 호출 지점만 둔다.
 */
function runEffects(root) {
  root.pendingEffects = [];
}

/**
 * 앱을 내린다. 두 번째 호출은 무시한다. 이후 setState와 예약된 flush는 아무것도 하지 않는다.
 * TODO(T5): 남아 있는 effect cleanup을 선언 순서로 먼저 실행한다.
 */
function unmount(root) {
  if (root.unmounted) return;
  root.unmounted = true;
  root.dom.remove();
}
