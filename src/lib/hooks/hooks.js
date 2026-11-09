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
 * @param {object} root 루트 인스턴스 (root.js)
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
