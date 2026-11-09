import { useHookSlot } from './dispatcher.js';

/**
 * 상태 하나를 hooks 배열의 칸에 저장한다.
 *
 *   const [count, setCount] = useState(0);
 *   setCount(5);              // 값으로 바꾸기
 *   setCount((c) => c + 1);   // 이전 값으로 계산하기 (연속 호출해도 누적됨)
 *
 * setState는 값을 바로 칸에 저장하고, 화면 갱신(update)은 예약만 한다.
 * 같은 이벤트 안에서 여러 번 불러도 렌더링은 한 번이다. (FunctionComponent.scheduleUpdate)
 */
export function useState(initialValue) {
  const { component, hook } = useHookSlot('useState', 'state', () => ({
    value: typeof initialValue === 'function' ? initialValue() : initialValue,
    setState: null,
  }));

  // setter는 첫 렌더에 한 번만 만든다. 이후 렌더에서도 같은 함수를 돌려준다.
  if (!hook.setState) {
    hook.setState = (next) => {
      const value = typeof next === 'function' ? next(hook.value) : next;
      if (Object.is(value, hook.value)) return; // 값이 그대로면 다시 그리지 않는다.
      hook.value = value;
      component.scheduleUpdate();
    };
  }

  return [hook.value, hook.setState];
}
