/**
 * Virtual DOM 기록(State History)
 *
 * entries: [vdom0, vdom1, vdom2]
 * index:    현재 보고 있는 위치
 *
 * 뒤로가기한 상태에서 새로 push하면 index 이후의 기록은 버린다. (브라우저 히스토리와 같은 방식)
 */
export class StateHistory {
  #entries;
  #index;

  constructor(initial) {
    this.#entries = [initial];
    this.#index = 0;
  }

  get current() {
    return this.#entries[this.#index];
  }

  get index() {
    return this.#index;
  }

  get length() {
    return this.#entries.length;
  }

  canBack() {
    return this.#index > 0;
  }

  canForward() {
    return this.#index < this.#entries.length - 1;
  }

  push(state) {
    this.#entries = this.#entries.slice(0, this.#index + 1);
    this.#entries.push(state);
    this.#index = this.#entries.length - 1;
  }

  /** 이전 기록으로 이동한다. 더 갈 곳이 없으면 null. */
  back() {
    if (!this.canBack()) return null;
    this.#index -= 1;
    return this.current;
  }

  /** 다음 기록으로 이동한다. 더 갈 곳이 없으면 null. */
  forward() {
    if (!this.canForward()) return null;
    this.#index += 1;
    return this.current;
  }
}
