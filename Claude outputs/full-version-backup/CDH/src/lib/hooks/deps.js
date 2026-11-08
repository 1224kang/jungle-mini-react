// [Phase 2] useEffect / useMemo 공용: 의존성 배열이 바뀌었는가.
//   deps 가 없음(undefined)            → 항상 바뀐 것으로 본다 (매 렌더 실행)
//   [] (빈 배열)                        → 처음 한 번만
//   [a, b]                              → Object.is 로 하나라도 다르면 바뀜
export function assertDeps(deps, hookName) {
  if (deps !== undefined && !Array.isArray(deps)) {
    throw new TypeError(`${hookName}: 두 번째 인자(deps)는 배열이거나 생략해야 합니다.`);
  }
}

export function depsChanged(prevDeps, nextDeps) {
  if (nextDeps === undefined || prevDeps === undefined) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((d, i) => !Object.is(d, prevDeps[i]));
}
