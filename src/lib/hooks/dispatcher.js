/**
 * 훅이 "지금 어떤 컴포넌트의 몇 번째 칸"을 써야 하는지 알려 주는 곳.
 *
 * 함수형 컴포넌트는 렌더링할 때마다 처음부터 다시 실행되므로 지역 변수는 매번 사라진다.
 * 그래서 상태는 함수 밖, 컴포넌트 인스턴스의 hooks 배열에 저장한다.
 *
 *   FunctionComponent.render()
 *     → setCurrentComponent(this), hookIndex = 0
 *     → 컴포넌트 함수 실행: useState → hooks[0], useMemo → hooks[1], useEffect → hooks[2] ...
 *     → setCurrentComponent(null)
 *
 * 훅은 "몇 번째로 호출됐는가"(hookIndex)로 자기 칸을 찾는다.
 * 그래서 훅은 조건문·반복문 안에서 부르면 안 된다 (호출 순서가 바뀌면 칸이 어긋난다).
 */

let currentComponent = null;

// 자식 컴포넌트 함수를 실행하는 중인지 (중첩 깊이). 0이면 루트 컴포넌트 본문이다.
let childDepth = 0;

export function setCurrentComponent(component) {
  currentComponent = component;
}

/** 자식 컴포넌트 함수를 실행한다. 실행하는 동안 훅 호출을 막는다. */
export function runChildComponent(fn, props) {
  childDepth++;
  try {
    return fn(props);
  } finally {
    childDepth--;
  }
}

/**
 * 현재 컴포넌트의 다음 훅 칸을 꺼낸다. 칸이 없으면(첫 렌더) init()으로 만든다.
 * @returns {{ component, hook, isNew }}
 */
export function useHookSlot(hookName, kind, init) {
  if (!currentComponent) {
    throw new Error(`${hookName}은(는) 컴포넌트를 렌더링하는 중에만 호출할 수 있습니다.`);
  }
  if (childDepth > 0) {
    throw new Error(
      `${hookName}은(는) 최상위(루트) 컴포넌트에서만 사용할 수 있습니다. 자식 컴포넌트는 props만 받아야 합니다.`,
    );
  }

  const component = currentComponent;
  const index = component.hookIndex++;
  let hook = component.hooks[index];
  const isNew = hook === undefined;

  if (isNew) {
    hook = { kind, ...init() };
    component.hooks[index] = hook;
  } else if (hook.kind !== kind) {
    throw new Error(
      `훅 호출 순서가 바뀌었습니다: ${index}번 칸은 ${hook.kind}인데 ${hookName}이(가) 호출됐습니다. 훅은 조건문·반복문 안에서 부르지 마세요.`,
    );
  }

  return { component, hook, isNew };
}

/** 의존성 배열이 바뀌었는지 확인한다. deps를 생략하면(undefined) 항상 바뀐 것으로 본다. */
export function depsChanged(prevDeps, nextDeps) {
  if (nextDeps === undefined || prevDeps === undefined) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
}
