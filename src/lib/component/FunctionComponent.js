import { createRoot } from '../vdom/vnode.js';
import { normalizeChildren } from '../vdom/h.js';
import { renderRoot } from '../dom/createDom.js';
import { diff } from '../reconcile/diff.js';
import { patch } from '../reconcile/patch.js';
import { setCurrentComponent } from '../hooks/dispatcher.js';

/**
 * 함수형 컴포넌트(루트) 하나를 감싸는 클래스.
 *
 * 컴포넌트 함수는 렌더링할 때마다 새로 실행되지만, 이 인스턴스는 계속 살아 있다.
 * 그래서 상태(hooks 배열)를 여기에 보관한다.
 *
 *   mount(container)  처음 렌더링: 함수 실행 → VNode → 실제 DOM 생성 → effect 실행
 *   update()          다시 렌더링: 함수 실행 → 새 VNode → diff(이전, 새) → patch → effect 실행
 *
 * Phase 1의 renderRoot / diff / patch를 그대로 재사용한다.
 */
export class FunctionComponent {
  /**
   * @param {Function} fn 루트 컴포넌트 함수 (props) => VNode
   * @param {object} props 루트에 넘길 props
   * @param {{ onCommit?: (component, info) => void }} options
   *        onCommit: 화면 반영 직후 호출 (데모 인스펙터 등 관찰용)
   */
  constructor(fn, props = {}, options = {}) {
    this.fn = fn;
    this.props = props;
    this.hooks = []; // 상태 저장소. 훅 호출 순서대로 칸이 하나씩.
    this.hookIndex = 0; // 이번 렌더에서 다음에 쓸 칸 번호
    this.pendingEffects = []; // 이번 렌더에서 실행해야 할 effect 칸들
    this.container = null;
    this.vdom = null; // 마지막으로 화면에 반영한 VNode 트리 (다음 diff의 "이전")
    this.isMounted = false;
    this.updateScheduled = false;
    this.renderCount = 0;
    this.onCommit = options.onCommit;
  }

  /** 컴포넌트 함수를 실행해 루트 VNode를 만든다. 실제 DOM은 건드리지 않는다. */
  render() {
    setCurrentComponent(this);
    this.hookIndex = 0;
    try {
      const output = this.fn(this.props);
      this.renderCount++;
      return createRoot(normalizeChildren([output]));
    } finally {
      setCurrentComponent(null);
    }
  }

  /** 처음 렌더링 */
  mount(container) {
    this.container = container;
    this.vdom = this.render();
    renderRoot(container, this.vdom);
    this.isMounted = true;
    this.commit({ phase: 'mount', patches: [] });
    return this;
  }

  /** 상태 변경 후 다시 렌더링. 바뀐 부분만 patch한다. */
  update() {
    this.updateScheduled = false;
    if (!this.isMounted) return;

    const nextVdom = this.render();
    const patches = diff(this.vdom, nextVdom);
    patch(this.container, patches);
    this.vdom = nextVdom;
    this.commit({ phase: 'update', patches });
  }

  /**
   * update를 예약한다. 이미 예약돼 있으면 아무것도 하지 않는다.
   * queueMicrotask는 "지금 실행 중인 코드(이벤트 핸들러)가 끝난 직후"에 실행되므로
   * 핸들러 안에서 setState를 여러 번 불러도 update는 한 번만 일어난다. (배칭)
   */
  scheduleUpdate() {
    if (this.updateScheduled || !this.isMounted) return;
    this.updateScheduled = true;
    queueMicrotask(() => this.update());
  }

  /** 화면 반영이 끝난 뒤 처리: 관찰자에게 알리고 effect를 실행한다. */
  commit(info) {
    this.onCommit?.(this, info);
    this.runEffects();
  }

  /** 이번 렌더에서 등록된 effect를 실행한다. 이전 cleanup을 모두 먼저 실행한 뒤 effect를 실행한다. */
  runEffects() {
    const effects = this.pendingEffects;
    this.pendingEffects = [];

    for (const hook of effects) {
      if (hook.cleanup) hook.cleanup();
      hook.cleanup = undefined;
    }
    for (const hook of effects) {
      const cleanup = hook.effect();
      hook.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  }

  /** 화면에서 내린다. 모든 effect의 cleanup을 실행한다. */
  unmount() {
    if (!this.isMounted) return;
    this.isMounted = false;
    for (const hook of this.hooks) {
      if (hook.kind === 'effect' && hook.cleanup) {
        hook.cleanup();
        hook.cleanup = undefined;
      }
    }
    this.container.replaceChildren();
  }
}

/** 루트 컴포넌트를 container에 mount하고 인스턴스를 돌려준다. */
export function render(fn, container, options) {
  return new FunctionComponent(fn, {}, options).mount(container);
}
