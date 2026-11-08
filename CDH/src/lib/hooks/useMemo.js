// [Phase 2] useMemo — 계산 결과를 칸에 저장해 두고, deps 가 같으면 다시 계산하지 않습니다.
//   hooks[i] = { kind:'memo', deps, value }
//   deps 를 생략하면 매 렌더 다시 계산합니다 (React 와 같음).
import { getCurrent } from './runtime.js';
import { assertDeps, depsChanged } from './deps.js';

export function useMemo(factory, deps) {
  const c = getCurrent('useMemo');
  if (typeof factory !== 'function') throw new TypeError('useMemo: 첫 인자는 함수여야 합니다.');
  assertDeps(deps, 'useMemo');
  const { index, prev } = c.nextSlot('memo', 'useMemo');

  if (prev && !depsChanged(prev.deps, deps)) return prev.value;
  const slot = { kind: 'memo', deps, value: factory() };
  c.hooks[index] = slot;
  return slot.value;
}
