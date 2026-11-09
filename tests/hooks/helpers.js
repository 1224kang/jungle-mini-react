import { vi } from 'vitest';

export const INVALID = /^\[mini-react\] 잘못된 입력: .+/;

// 배칭 갱신은 queueMicrotask로 예약된다 (design TD-005, TD-012).
// 마이크로태스크 몇 개를 기다려 예약된 flush가 끝나게 한다.
export async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

// document에 붙인 컨테이너를 만든다. (포커스 확인 등) 테스트 후 cleanupContainers로 정리한다.
export function createContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

export function cleanupContainers() {
  document.body.replaceChildren();
}

// 컨테이너 아래의 DOM 변경을 모두 기록한다. records()는 지금까지 쌓인 변경 목록을 꺼낸다.
export function observeMutations(container) {
  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  return {
    records: () => observer.takeRecords(),
    disconnect: () => observer.disconnect(),
  };
}

// 갱신(flush) 중 에러는 마이크로태스크 안에서 던져진다 (E-9).
// queueMicrotask를 감싸 그 에러를 잡아 errors에 모은다. 사용 후 restore()(또는 vi.restoreAllMocks).
export function captureMicrotaskErrors() {
  const errors = [];
  const original = globalThis.queueMicrotask;
  const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) =>
    original.call(globalThis, () => {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    }));
  return { errors, restore: () => spy.mockRestore() };
}

export function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
