// [Phase 2] useState — hooks[i] 칸에 { kind:'state', value } 를 저장합니다.
//   처음 부르면 초기값을 칸에 넣고, 다음 렌더부터는 칸에 있는 값을 돌려줍니다.
//   setState 가 하는 일: ① 칸의 값을 바꾸고 ② 컴포넌트에 "다시 그려 달라" 고 알립니다 (scheduleUpdate).
import { getCurrent } from './runtime.js';

export function useState(initial) {
  const c = getCurrent('useState');
  const { index, prev } = c.nextSlot('state', 'useState');

  let slot = prev;
  if (!slot) {
    // 초기값이 함수면 처음 한 번만 실행 (비싼 계산을 매 렌더 하지 않게)
    slot = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
    // setter 는 칸마다 한 번만 만들어 매 렌더 같은 함수를 돌려줍니다 (참조가 안 바뀜).
    slot.set = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(value, slot.value)) return; // 같은 값이면 다시 그리지 않음
      slot.value = value;
      c.scheduleUpdate();
    };
    c.hooks[index] = slot;
  }
  return [slot.value, slot.set];
}
