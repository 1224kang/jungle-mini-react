// [Phase 2] "지금 어떤 컴포넌트가 렌더 중인가" 를 기억하는 곳.
// Hook 은 인자로 컴포넌트를 받지 않습니다. 그래서 렌더가 시작될 때 current 에 넣어 두고,
// useState() 가 불리면 current 의 hooks 배열을 꺼내 씁니다. (핵심 질문의 답: 함수는 매번 새로 실행되지만
// 상태는 함수 밖, FunctionComponent.hooks 배열에 살아 있고, 호출 순서 번호로 칸을 찾는다.)
//
// 과제 제약도 여기서 검사합니다.
//   - 렌더 밖에서 Hook 호출      → 오류
//   - 자식 컴포넌트에서 Hook 호출 → 오류 (상태는 루트에만, 자식은 props 만: Lifting State Up)

let current = null;
let childDepth = 0;

export function runWithComponent(component, fn) {
  const prev = current;
  current = component;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

// 자식 컴포넌트를 부르는 동안 감쌉니다 (component/resolve.js).
export function runAsChild(fn) {
  childDepth++;
  try {
    return fn();
  } finally {
    childDepth--;
  }
}

export function getCurrent(hookName) {
  if (childDepth > 0) {
    throw new Error(
      `${hookName}: Hook 은 루트 컴포넌트에서만 쓸 수 있습니다. 자식 컴포넌트는 상태 없이 props 만 사용하세요 (Lifting State Up).`
    );
  }
  if (!current) {
    throw new Error(`${hookName}: Hook 은 루트 FunctionComponent 가 렌더되는 동안에만 호출할 수 있습니다.`);
  }
  return current;
}
