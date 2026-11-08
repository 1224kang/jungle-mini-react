// [Phase 2] useEffect — 렌더가 끝나고 화면(DOM)이 반영된 "뒤에" 실행할 일을 예약합니다.
//   hooks[i] = { kind:'effect', deps(마지막으로 실행한 deps), cleanup, ran }
//   렌더 중에는 "실행할 목록(pendingEffects)" 에 넣기만 하고, 실제 실행은 FunctionComponent 가
//   커밋(Patch) 뒤에 합니다: 이전 cleanup 전부 → 새 effect 전부.
import { getCurrent } from './runtime.js';
import { assertDeps, depsChanged } from './deps.js';

export function useEffect(effect, deps) {
  const c = getCurrent('useEffect');
  if (typeof effect !== 'function') throw new TypeError('useEffect: 첫 인자는 함수여야 합니다.');
  assertDeps(deps, 'useEffect');
  const { index, prev } = c.nextSlot('effect', 'useEffect');

  let slot = prev;
  if (!slot) {
    slot = { kind: 'effect', deps: undefined, cleanup: undefined, ran: false };
    c.hooks[index] = slot;
  }
  // slot.deps 는 "실제로 실행한 뒤" 에만 바꿉니다 (렌더가 버려져도 effect 가 빠지지 않게).
  if (!slot.ran || depsChanged(slot.deps, deps)) {
    c.pendingEffects.push({ slot, effect, deps });
  }
}
