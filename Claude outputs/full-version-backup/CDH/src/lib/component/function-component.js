// [Phase 2] FunctionComponent — 함수형 컴포넌트를 감싸고 상태(hooks 배열)를 들고 있는 클래스.
//
// ═════════════ Phase 2 렌더 루프 ═════════════
//   setState()  ─▶ scheduleUpdate() ─▶ update()
//                                        1) renderTree : 컴포넌트 함수를 처음부터 다시 실행 → 새 Virtual DOM
//                                           (함수는 매번 새로 실행되지만 hooks 배열이 상태를 기억)
//                                        2) commit     : Phase 1 의 diff(이전, 새) → applyPatches 로 바뀐 부분만 DOM 반영
//                                        3) effects    : DOM 이 반영된 "뒤에" cleanup → useEffect 실행
//
// 제약 (과제): Hook 은 루트에서만, 자식은 props 만 받는 순수 함수. (runtime.js 가 검사)
// 선택 과제 batching: 같은 틱의 setState 여러 번을 마이크로태스크로 모아 1번만 다시 그립니다 (batch: true, 기본값).

import { createDOM } from '../dom/create.js';
import { diff } from '../reconcile/diff.js';
import { applyPatches } from '../reconcile/patch.js';
import { runWithComponent } from '../hooks/runtime.js';
import { resolveTree } from './resolve.js';

const RENDER_LIMIT = 25; // 렌더 중 setState 로 인한 재렌더 상한
const UPDATE_LIMIT = 100; // effect 안 setState 로 인한 연쇄 갱신 상한

export class FunctionComponent {
  /**
   * @param {(props: object) => any} renderFn  루트 함수형 컴포넌트 (Hook 사용 가능)
   * @param {{ props?: object, batch?: boolean, onCommit?: (info: object) => void }} [options]
   */
  constructor(renderFn, options = {}) {
    if (typeof renderFn !== 'function') throw new TypeError('FunctionComponent: 함수형 컴포넌트가 필요합니다.');
    this.renderFn = renderFn;
    this.props = options.props ?? {};
    this.batch = options.batch ?? true;
    this.onCommit = options.onCommit ?? null;

    this.hooks = []; // ★ 상태 저장소. 칸 번호 = Hook 호출 순서
    this.idx = 0; // 이번 렌더에서 몇 번째 Hook 인가
    this.hookCount = null; // 첫 렌더가 끝난 뒤 확정되는 Hook 개수 (규칙 검사용)
    this.pendingEffects = []; // 이번 렌더에서 예약된 effect

    this.container = null;
    this.tree = null; // 마지막으로 화면에 반영한 Virtual DOM (다음 diff 의 "이전")
    this.mounted = false;
    this.renderCount = 0;
    this.lastCommit = null;

    this.phase = 'idle'; // 'idle' | 'render' | 'commit' | 'effects'
    this.dirty = false; // 렌더 중 setState 가 불렸는가
    this.rerunRequested = false; // 커밋/effect 중 setState 가 불렸는가
    this.scheduled = false; // 배치된 갱신이 마이크로태스크 대기 중인가
  }

  // 처음 렌더: Virtual DOM 을 만들어 container 안에 실제 DOM 으로 그립니다.
  mount(container, props) {
    if (this.mounted) throw new Error('mount(): 이미 mount 된 컴포넌트입니다.');
    if (!container) throw new TypeError('mount(): container 요소가 필요합니다.');
    if (props !== undefined) this.props = props;
    this.container = container;
    this.mounted = true;
    try {
      this.run();
    } catch (e) {
      this.mounted = false;
      this.tree = null;
      throw e;
    }
    return this;
  }

  // 상태가 바뀐 뒤 다시 렌더: 새 Virtual DOM → diff → patch. (props 를 주면 루트 props 도 교체)
  update(nextProps) {
    if (!this.mounted) throw new Error('update(): 먼저 mount() 해야 합니다.');
    if (nextProps !== undefined) this.props = nextProps;
    this.scheduled = false; // 대기 중이던 배치 갱신은 이 호출이 대신합니다
    if (this.phase !== 'idle') {
      this.rerunRequested = true; // 렌더/커밋/effect 도중이면 끝난 뒤에 한 번 더
      return;
    }
    this.run();
  }

  // 배치 대기 중인 갱신이 있으면 지금 바로 실행 (테스트에서 await 없이 확인할 때).
  flush() {
    if (this.scheduled) this.update();
  }

  // 컴포넌트 제거: 모든 effect 의 cleanup 을 실행하고 DOM 을 비웁니다.
  unmount() {
    if (!this.mounted) return;
    if (this.phase !== 'idle') throw new Error('unmount(): 렌더 도중에는 unmount 할 수 없습니다.');
    this.mounted = false;
    this.scheduled = false;
    const errors = [];
    for (const slot of this.hooks) {
      if (slot?.kind === 'effect' && typeof slot.cleanup === 'function') {
        try {
          slot.cleanup();
        } catch (e) {
          errors.push(e);
        }
        slot.cleanup = undefined;
      }
    }
    this.container.replaceChildren();
    this.tree = null;
    if (errors.length) throw errors[0];
  }

  // ───────────── Hook 이 쓰는 내부 API ─────────────

  // 이번 렌더의 "다음 칸" 을 줍니다. Hook 규칙(호출 순서/개수)을 여기서 검사합니다.
  nextSlot(kind, hookName) {
    const index = this.idx++;
    if (this.hookCount !== null && index >= this.hookCount) {
      throw new Error(`${hookName}: 이전 렌더보다 Hook 이 더 많이 호출되었습니다. Hook 을 조건문/반복문 안에서 쓰지 마세요.`);
    }
    const prev = this.hooks[index];
    if (prev && prev.kind !== kind) {
      throw new Error(
        `${hookName}: ${index}번째 Hook 이 이전 렌더에서는 ${prev.kind} 였습니다. Hook 호출 순서는 매 렌더 같아야 합니다.`
      );
    }
    return { index, prev };
  }

  // setState 가 부릅니다: "상태가 바뀌었으니 다시 그려 주세요".
  scheduleUpdate() {
    if (!this.mounted) return;
    if (this.phase === 'render') {
      this.dirty = true; // 렌더 중 setState → 이번 렌더를 버리고 다시
      return;
    }
    if (this.phase !== 'idle') {
      this.rerunRequested = true; // 커밋/effect 중 → 끝난 뒤 한 번 더
      return;
    }
    if (!this.batch) {
      this.update();
      return;
    }
    if (this.scheduled) return; // 이미 대기 중 → 여러 setState 가 한 번의 렌더로 합쳐짐
    this.scheduled = true;
    queueMicrotask(() => {
      if (!this.scheduled) return; // 그 사이 update()/flush() 가 처리함
      this.scheduled = false;
      this.update();
    });
  }

  // ───────────── 내부 구현 ─────────────

  // 렌더 → 커밋 → effect 를 한 번 하고, 그 사이 setState 요청이 있었으면 한 번 더 반복합니다.
  run() {
    let runs = 0;
    do {
      this.rerunRequested = false;
      if (++runs > UPDATE_LIMIT) {
        throw new Error('갱신이 너무 많이 반복되었습니다. useEffect 안에서 deps 없이 setState 를 부르고 있지 않은가요?');
      }
      try {
        const tree = this.renderTree();
        this.phase = 'commit';
        this.commit(tree);
        this.phase = 'effects';
        this.runEffects();
      } finally {
        this.phase = 'idle';
      }
    } while (this.rerunRequested && this.mounted);
  }

  // 컴포넌트 함수를 실행해 새 Virtual DOM 을 얻습니다. 렌더 중 setState 가 불리면 버리고 다시 실행합니다.
  renderTree() {
    for (let tries = 0; ; tries++) {
      if (tries >= RENDER_LIMIT) {
        throw new Error('렌더 중 setState 가 너무 많이 반복되었습니다 (무한 루프?). setState 는 이벤트나 effect 안에서 부르세요.');
      }
      this.idx = 0;
      this.pendingEffects = [];
      this.dirty = false;
      this.phase = 'render';
      let tree;
      try {
        const out = runWithComponent(this, () => this.renderFn(this.props));
        this.checkHookCount();
        tree = resolveTree(out);
      } catch (e) {
        if (this.hookCount === null) this.hooks = []; // 첫 렌더가 실패했으면 반쯤 채워진 칸을 버림
        this.pendingEffects = [];
        throw e;
      }
      if (!this.dirty) return tree;
    }
  }

  checkHookCount() {
    if (this.hookCount === null) {
      this.hookCount = this.idx;
    } else if (this.idx !== this.hookCount) {
      throw new Error(
        `이전 렌더보다 Hook 이 적게 호출되었습니다 (${this.hookCount}개 → ${this.idx}개). Hook 을 조건문 안에서 쓰지 마세요.`
      );
    }
  }

  // Phase 1 연결 지점: 처음이면 통째로 그리고, 이후엔 diff → applyPatches 로 바뀐 곳만 반영.
  commit(tree) {
    const prevTree = this.tree;
    let patches = [];
    let touched = new Set();
    if (!prevTree) {
      this.container.replaceChildren(createDOM(tree));
    } else {
      patches = diff(prevTree, tree);
      ({ touched } = applyPatches(this.container, patches));
    }
    this.tree = tree;
    this.renderCount++;
    this.lastCommit = { isMount: !prevTree, patches, touched, prevTree, tree, renderCount: this.renderCount };
    if (this.onCommit) this.onCommit(this.lastCommit);
  }

  // DOM 반영 뒤: 예약된 effect 의 이전 cleanup 을 모두 실행하고, 새 effect 를 모두 실행합니다.
  // 한 effect 가 던져도 나머지는 계속 실행하고, 첫 오류를 마지막에 다시 던집니다.
  runEffects() {
    const list = this.pendingEffects;
    this.pendingEffects = [];
    const errors = [];
    for (const { slot } of list) {
      if (typeof slot.cleanup === 'function') {
        const cleanup = slot.cleanup;
        slot.cleanup = undefined;
        try {
          cleanup();
        } catch (e) {
          errors.push(e);
        }
      }
    }
    for (const { slot, effect, deps } of list) {
      slot.deps = deps;
      slot.ran = true;
      try {
        const result = effect();
        slot.cleanup = typeof result === 'function' ? result : undefined;
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length) throw errors[0];
  }
}
