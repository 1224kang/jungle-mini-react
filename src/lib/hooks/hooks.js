import { HOOK_TYPE, invalidInputError } from '../shared/index.js';

// 지금 렌더 중인 루트와 다음에 읽을 슬롯 번호.
// 루트 컴포넌트 함수가 호출되는 동안에만 설정된다. 자식 펼치기·이벤트 핸들러·타이머에서는 null이라
// 그곳에서 부른 Hook은 모두 같은 경로로 에러가 난다. (docs/contracts.md 6.3)
let currentRoot = null;
let hookIndex = 0;

/**
 * 루트 컴포넌트 함수를 Hook 컨텍스트 안에서 한 번 호출한다.
 * - 첫 렌더: 슬롯 type 목록(hookTypes)을 기록한다.
 * - 이후 렌더: 호출한 Hook 개수가 첫 렌더와 다르면 에러.
 * 호출이 끝나면(에러가 나도) 컨텍스트를 닫는다.
 * @param {object} root 루트 인스턴스 (root.js의 FunctionComponent)
 * @returns {*} 루트 컴포넌트의 반환값 (펼치기 전)
 */
export function renderRootComponent(root) {
  const { type: component, props } = root.element;
  currentRoot = root;
  hookIndex = 0;
  let result;
  let count;
  try {
    result = component(props);
    count = hookIndex;
  } finally {
    currentRoot = null;
    hookIndex = 0;
  }

  if (root.hookTypes === null) {
    root.hookTypes = root.hooks.map((slot) => slot.type);
  } else if (count !== root.hookTypes.length) {
    throw invalidInputError(
      `Hook 개수가 렌더마다 달라짐 (첫 렌더 ${root.hookTypes.length}개, 이번 렌더 ${count}개). Hook을 조건문·반복문 안에서 부르지 마세요`,
    );
  }
  return result;
}

/**
 * 상태를 선언한다. 첫 렌더에는 초기값(함수면 호출 결과)을, 이후에는 마지막으로 바뀐 값을 돌려준다.
 * @param {*} initial 초기값 또는 초기값을 만드는 함수 (첫 렌더에서만 호출)
 * @returns {[*, (next: *) => void]} [현재 값, setState]
 */
export function useState(initial) {
  const slot = useSlot(HOOK_TYPE.STATE, (root) => {
    const created = { type: HOOK_TYPE.STATE, value: typeof initial === 'function' ? initial() : initial, setState: null };
    created.setState = createSetState(root, created);
    return created;
  });
  return [slot.value, slot.setState];
}

/**
 * 화면 반영 후 실행할 부수 효과를 등록한다. 렌더 중에는 실행하지 않고 "이번에 실행할지"만 기록한다.
 * - deps 생략: 매 렌더 후 실행
 * - deps가 []: 첫 렌더 후 1회
 * - 그 외: 이전 실행 때의 deps와 원소 하나라도 Object.is로 다르면(길이 변화 포함) 실행
 * 실제 실행(cleanup → effect)은 root.js의 runEffects가 patch 직후에 한다.
 * @param {() => (void|(() => void))} effect 부수 효과. 함수를 반환하면 정리 작업(cleanup)으로 쓴다.
 * @param {Array<*>} [deps] 의존 값 목록
 */
export function useEffect(effect, deps) {
  const slot = useSlot(HOOK_TYPE.EFFECT, () => ({ type: HOOK_TYPE.EFFECT, deps: null, cleanup: null, ran: false }));
  if (typeof effect !== 'function') {
    throw invalidInputError(`useEffect의 첫 인자는 함수여야 함 (받은 값: ${describe(effect)})`);
  }
  if (deps !== undefined && !Array.isArray(deps)) {
    throw invalidInputError(`useEffect의 deps는 생략하거나 배열이어야 함 (받은 값: ${describe(deps)})`);
  }
  const shouldRun = !slot.ran || deps === undefined || depsChanged(slot.deps, deps);
  if (shouldRun) {
    // deps는 실제로 실행할 때(runEffects) 슬롯에 저장한다. 렌더가 중간에 실패해도 이전 deps가 남는다.
    currentRoot.pendingEffects.push({ slot, effect, deps: deps === undefined ? null : deps });
  }
}

/**
 * 계산 결과를 재사용한다. 첫 렌더 또는 deps가 바뀌었을 때만 compute()를 호출한다.
 * @param {() => *} compute 계산 함수
 * @param {Array<*>} deps 의존 값 목록 (필수)
 * @returns {*} 계산 결과
 */
export function useMemo(compute, deps) {
  const slot = useSlot(HOOK_TYPE.MEMO, () => ({ type: HOOK_TYPE.MEMO, deps: null, value: undefined }));
  if (typeof compute !== 'function') {
    throw invalidInputError(`useMemo의 첫 인자는 함수여야 함 (받은 값: ${describe(compute)})`);
  }
  if (!Array.isArray(deps)) {
    throw invalidInputError(`useMemo의 deps는 배열이어야 함 (받은 값: ${describe(deps)})`);
  }
  if (slot.deps === null || depsChanged(slot.deps, deps)) {
    slot.value = compute();
    slot.deps = deps;
  }
  return slot.value;
}

/** 두 deps 목록이 다른가. 길이가 다르거나 원소 하나라도 Object.is로 다르면 true. */
function depsChanged(prev, next) {
  if (prev === null || prev.length !== next.length) return true;
  return next.some((value, i) => !Object.is(value, prev[i]));
}

function describe(value) {
  if (typeof value === 'function') return '함수';
  if (Array.isArray(value)) return '배열';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return '객체';
  if (typeof value === 'symbol') return 'symbol';
  return JSON.stringify(value) ?? String(value);
}

/**
 * 현재 순서의 슬롯을 꺼낸다. 첫 렌더면 create(root)로 만든다.
 * 렌더 밖·자식 컴포넌트 호출(E-1, E-2), 종류 변경(E-4), 첫 렌더보다 많은 호출(E-3)은 에러.
 */
function useSlot(type, create) {
  const root = currentRoot;
  if (root === null) {
    throw invalidInputError('Hook은 루트 컴포넌트에서만 사용 가능 (자식 컴포넌트·이벤트 핸들러·렌더 밖에서 호출함)');
  }
  const index = hookIndex;
  hookIndex += 1;

  if (root.hookTypes === null) {
    // 첫 렌더: 슬롯을 순서대로 만든다.
    const slot = create(root);
    root.hooks.push(slot);
    return slot;
  }
  if (index >= root.hookTypes.length) {
    throw invalidInputError(
      `Hook 개수가 렌더마다 달라짐 (첫 렌더 ${root.hookTypes.length}개보다 많이 호출함). Hook을 조건문·반복문 안에서 부르지 마세요`,
    );
  }
  if (root.hookTypes[index] !== type) {
    throw invalidInputError(
      `Hook 순서가 렌더마다 달라짐 (${index}번째 Hook: 첫 렌더 ${root.hookTypes[index]}, 이번 렌더 ${type})`,
    );
  }
  return root.hooks[index];
}

/**
 * 슬롯마다 한 번만 만드는 setState. 참조가 렌더마다 같아서 자식 props로 넘겨도 diff가 핸들러를 바꾸지 않는다.
 * 값을 즉시 저장하고(함수형 업데이트는 앞선 변경이 반영된 값을 받음), 값이 바뀌었을 때만 갱신을 예약한다.
 */
function createSetState(root, slot) {
  return function setState(next) {
    if (root.unmounted) return; // 마운트 해제 후에는 조용히 무시
    if (root.rendering) {
      throw invalidInputError('렌더 중에는 setState를 호출할 수 없음 (이벤트 핸들러나 useEffect 안에서 호출하세요)');
    }
    const value = typeof next === 'function' ? next(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    root.dirty = true;
    root.requestUpdate();
  };
}
