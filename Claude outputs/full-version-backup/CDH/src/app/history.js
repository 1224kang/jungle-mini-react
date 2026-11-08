// [2-3] 생성 / [4-6] push / [5] back·forward — 흐름 지도는 app/main.js 맨 위.
//   ◀ 부른 곳: app.js    ▶ 다음: 꺼낸 VNode 를 app.js commit() 이 다시 적용 ([5] → 4-2)
// State History (레슨 0006): 스냅샷을 배열 + 커서로 저장합니다.
// 저장할 때와 꺼낼 때 모두 깊은 복사를 해서 과거 기록이 바뀌지 않게 합니다.

export class StateHistory {
  constructor(initial) {
    this.items = [structuredClone(initial)];
    this.cursor = 0;
  }

  // 커서 뒤의 기록은 버리고, 새 스냅샷을 끝에 붙입니다.
  push(snapshot) {
    this.items = this.items.slice(0, this.cursor + 1);
    this.items.push(structuredClone(snapshot));
    this.cursor = this.items.length - 1;
  }

  back() {
    if (this.cursor > 0) this.cursor--;
    return this.current();
  }

  forward() {
    if (this.cursor < this.items.length - 1) this.cursor++;
    return this.current();
  }

  current() {
    return structuredClone(this.items[this.cursor]);
  }
}
