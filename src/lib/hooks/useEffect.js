import { useHookSlot, depsChanged } from './dispatcher.js';

/**
 * 화면이 실제 DOM에 반영된 "뒤에" 실행할 작업(부수 효과)을 등록한다.
 *
 *   useEffect(fn)          // 매 렌더 후 실행
 *   useEffect(fn, [])      // 처음 mount 후 한 번만
 *   useEffect(fn, [a, b])  // a나 b가 바뀐 렌더 후에만
 *
 * fn이 함수를 반환하면 정리(cleanup) 함수로 저장해 두었다가,
 * 다음에 이 effect를 다시 실행하기 직전 또는 unmount 때 호출한다.
 *
 * 렌더링 중에는 실행하지 않고 component.pendingEffects에 모아 두기만 한다.
 * 실행은 patch가 끝난 뒤 FunctionComponent.runEffects()가 한다.
 */
export function useEffect(effect, deps) {
  const { component, hook, isNew } = useHookSlot('useEffect', 'effect', () => ({
    deps: undefined,
    effect: null,
    cleanup: undefined,
  }));

  if (isNew || depsChanged(hook.deps, deps)) {
    hook.deps = deps;
    hook.effect = effect;
    component.pendingEffects.push(hook);
  }
}
