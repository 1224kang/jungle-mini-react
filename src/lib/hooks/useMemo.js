import { useHookSlot, depsChanged } from './dispatcher.js';

/**
 * 계산 결과를 hooks 배열의 칸에 저장해 두고, deps가 바뀔 때만 다시 계산한다.
 *
 *   const stats = useMemo(() => analyze(text), [text]);
 *
 * text와 상관없는 상태(예: count)가 바뀌어 다시 렌더링돼도 analyze는 실행되지 않는다.
 */
export function useMemo(factory, deps) {
  const { hook, isNew } = useHookSlot('useMemo', 'memo', () => ({
    deps: undefined,
    value: undefined,
  }));

  if (isNew || depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = deps;
  }
  return hook.value;
}
