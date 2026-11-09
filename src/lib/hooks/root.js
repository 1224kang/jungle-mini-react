import { expand, expandComponentResult, isElementVNode, isComponentVNode } from '../vdom/expand.js';
import { render } from '../dom/render.js';
import { diff } from '../reconcile/diff.js';
import { patch } from '../reconcile/patch.js';
import { DOM_NODE_TYPE, HOOK_TYPE, MAX_NESTED_UPDATES, invalidInputError } from '../shared/index.js';
import { renderRootComponent } from './hooks.js';

/**
 * 앱을 컨테이너에 마운트한다. 첫 렌더는 동기로 한다.
 * - 컴포넌트 VNode: FunctionComponent로 감싸 루트로 삼는다. 상태가 바뀌면 루트부터 다시 그린다.
 * - 요소 VNode: Hook 없이 한 번만 그린다. (상태가 없으니 갱신도 없음)
 * 첫 렌더 중 에러는 그대로 던지고, 컨테이너는 바꾸지 않는다.
 * @param {object} vnode 루트 컴포넌트 VNode (h(App, props)) 또는 요소 VNode
 * @param {Element} container 마운트할 컨테이너 요소. 기존 자식은 교체된다.
 * @returns {FunctionComponent|{unmount: () => void}} 컴포넌트 VNode면 FunctionComponent 인스턴스
 */
export function mount(vnode, container) {
  if (!isElementNode(container)) {
    throw invalidInputError('mount의 container는 DOM Element여야 함');
  }
  if (isComponentVNode(vnode)) return new FunctionComponent(vnode).mount(container);
  if (!isElementVNode(vnode)) {
    throw invalidInputError('mount의 vnode는 요소 또는 컴포넌트 VNode여야 함 (h()로 만드세요)');
  }
  return mountElement(vnode, container);
}

/** 요소 VNode를 Hook 없이 한 번 그린다. 자식 컴포넌트는 펼친다. */
function mountElement(vnode, container) {
  const dom = render(expand(vnode)); // 여기서 에러가 나면 컨테이너는 그대로
  container.replaceChildren(dom);
  let unmounted = false;
  return {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      dom.remove();
    },
  };
}

/**
 * 루트 함수형 컴포넌트를 감싸는 클래스. 앱 하나당 하나. (자식 컴포넌트는 expand가 펼치는 순수 함수 그대로)
 * - hooks: 루트 컴포넌트의 Hook 슬롯 배열 (상태 저장용)
 * - mount(container): 처음 렌더링
 * - update(): 상태 변경 후 다시 렌더링 (setState → 마이크로태스크 배칭 → update() 1회)
 * - unmount(): effect 정리 → DOM 제거
 */
export class FunctionComponent {
  /**
   * @param {object} vnode 루트 컴포넌트 VNode (h(App, props))
   */
  constructor(vnode) {
    if (!isComponentVNode(vnode)) {
      throw invalidInputError('FunctionComponent는 컴포넌트 VNode만 받음 (h(App, props)로 만드세요)');
    }
    this.element = vnode; // 루트 컴포넌트 VNode
    this.container = null; // mount한 컨테이너 Element
    this.dom = null; // 현재 루트 DOM 노드 (patch 반환값으로 갱신)
    this.hostTree = null; // 직전에 그린 호스트 VNode 트리 (다음 diff의 old)
    this.hooks = []; // Hook 슬롯. 렌더마다 같은 순서로 접근
    this.hookTypes = null; // 첫 렌더의 슬롯 type 목록 (순서·개수 검사용)
    this.dirty = false; // 마지막 렌더 이후 상태 값이 실제로 바뀌었는가
    this.scheduled = false; // 갱신이 예약됐는가
    this.rendering = false; // ① 진행 중 (이때의 setState는 에러)
    this.pendingEffects = []; // 이번 렌더에서 실행할 effect ({ slot, effect, deps }, useEffect에서 채움)
    this.mounted = false; // mount가 성공했는가
    this.unmounted = false;
    this.unmounting = false; // unmount 진행 중 (cleanup 실행 중)
    this.runningEffects = false; // runEffects 진행 중 (이때 예약된 갱신은 effect발)
    this.updateFromEffect = false; // 다음 갱신에 effect 안에서 예약된 변경이 있는가
    this.updateFromOutside = false; // 다음 갱신에 effect 밖(이벤트·타이머 등)에서 예약된 변경이 있는가
    this.nestedUpdates = 0; // effect발 연속 갱신 횟수 (MAX_NESTED_UPDATES 검사)
  }

  /**
   * 처음 렌더링: ① → render → container.replaceChildren → effect 실행.
   * 첫 렌더 중 에러는 그대로 던지고, 컨테이너는 바꾸지 않는다.
   * @param {Element} container 마운트할 컨테이너 요소. 기존 자식은 교체된다.
   * @returns {FunctionComponent} this
   */
  mount(container) {
    if (!isElementNode(container)) {
      throw invalidInputError('mount의 container는 DOM Element여야 함');
    }
    if (this.mounted || this.unmounted) {
      throw invalidInputError('FunctionComponent는 한 번만 mount할 수 있음 (이미 mount했거나 unmount됨)');
    }

    // ① 새 트리를 끝까지 만든 뒤에만 DOM을 건드린다. 여기서 에러가 나면 컨테이너는 그대로다.
    let hostTree;
    try {
      hostTree = this.buildHostTree();
    } catch (error) {
      this.hooks = []; // 실패한 첫 렌더가 만든 슬롯을 버린다 (hookTypes는 성공할 때만 기록됨)
      throw error;
    }
    const dom = render(hostTree);
    container.replaceChildren(dom);
    this.container = container;
    this.dom = dom;
    this.hostTree = hostTree;
    this.mounted = true;

    this.runEffects();
    return this;
  }

  /**
   * 다시 렌더링: ① 생성 → ② diff → ③ patch → effect 실행을 동기로 한다.
   * ①에서 에러가 나면 DOM과 hostTree는 이전 그대로 두고 에러를 던진다.
   * mount 전이거나 unmount 후면 아무것도 하지 않는다. 상태가 같아도 다시 그린다(diff가 []라 DOM 조작 0회).
   */
  update() {
    if (!this.mounted || this.unmounted) return;
    this.dirty = false;

    const next = this.buildHostTree(); // ①
    const patches = diff(this.hostTree, next); // ②
    this.dom = patch(this.dom, patches); // ③ 루트가 교체되면 새 노드
    this.hostTree = next;

    this.runEffects();
  }

  /**
   * 앱을 내린다. 남은 effect cleanup(선언 순서) → 루트 DOM 제거 → unmounted.
   * 두 번째 호출은 무시한다. 이후 setState와 예약된 갱신은 아무것도 하지 않는다.
   */
  unmount() {
    if (this.unmounted || this.unmounting) return;
    this.unmounting = true; // cleanup 안에서 다시 unmount를 불러도 한 번만 처리
    for (const slot of this.hooks) {
      if (slot.type === HOOK_TYPE.EFFECT) runCleanup(slot);
    }
    this.dom?.remove();
    this.unmounted = true;
  }

  /**
   * setState가 부르는 갱신 예약. 첫 호출만 마이크로태스크를 예약하고,
   * 같은 동기 작업의 나머지 변경은 그 갱신에 합쳐진다.
   */
  requestUpdate() {
    if (this.runningEffects) this.updateFromEffect = true;
    else this.updateFromOutside = true;
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flushScheduled());
  }

  /** 예약된 마이크로태스크. unmounted·dirty·연속 갱신 상한을 확인한 뒤 update()를 부른다. */
  flushScheduled() {
    this.scheduled = false;
    const onlyFromEffect = this.updateFromEffect && !this.updateFromOutside;
    this.updateFromEffect = false;
    this.updateFromOutside = false;
    if (this.unmounted || !this.dirty) return; // 같은 값만 넣었으면 렌더 0회
    this.dirty = false;

    // effect가 상태를 바꿔 갱신이 끝없이 이어지는 것을 막는다. effect 밖에서 시작된 갱신이면 다시 0부터 센다.
    if (!onlyFromEffect) {
      this.nestedUpdates = 0;
    } else if (++this.nestedUpdates > MAX_NESTED_UPDATES) {
      this.nestedUpdates = 0;
      throw invalidInputError(
        `useEffect 안의 상태 변경으로 갱신이 ${MAX_NESTED_UPDATES}회를 넘게 이어짐 (deps를 확인하세요)`,
      );
    }

    this.update();
  }

  /** ① 루트 컴포넌트를 Hook 컨텍스트 안에서 호출한 뒤(컨텍스트를 닫고) 자식 컴포넌트를 펼친다. */
  buildHostTree() {
    this.pendingEffects = []; // 실패한 이전 렌더가 남긴 기록을 버린다
    this.rendering = true;
    try {
      // 컨텍스트는 renderRootComponent 안에서 닫힌다. 자식 펼치기는 그 뒤라 자식의 Hook은 에러가 난다.
      return expandComponentResult(this.element, renderRootComponent(this));
    } finally {
      this.rendering = false;
    }
  }

  /**
   * 이번 렌더에서 실행 대상인 effect를 patch 직후 동기로 실행한다. (DOM은 이미 반영돼 있음)
   * 1) 대상 슬롯의 이전 cleanup을 선언 순서로 모두 실행
   * 2) 대상 effect를 선언 순서로 실행, 반환값이 함수면 cleanup으로 저장
   * effect 안의 setState는 일반 규칙대로 다음 마이크로태스크 갱신을 예약한다.
   */
  runEffects() {
    const targets = this.pendingEffects;
    this.pendingEffects = [];
    if (targets.length === 0) return;

    this.runningEffects = true;
    try {
      for (const { slot } of targets) runCleanup(slot);
      for (const { slot, effect, deps } of targets) {
        slot.deps = deps;
        slot.ran = true;
        const cleanup = effect();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
      }
    } finally {
      this.runningEffects = false;
    }
  }
}

/** 슬롯의 cleanup을 한 번만 실행한다. */
function runCleanup(slot) {
  const cleanup = slot.cleanup;
  if (cleanup === null) return;
  slot.cleanup = null;
  cleanup();
}

function isElementNode(value) {
  return value?.nodeType === DOM_NODE_TYPE.ELEMENT;
}
