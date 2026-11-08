// [Phase 2] 시작점 — phase2.html 이 이 파일을 불러옵니다.
//
// ═══════════ Phase 2 흐름 지도 ═══════════
//  [1] 시작   main.js → app.js initApp
//  [2] mount  FunctionComponent.mount()     루트 함수(TodoApp) 실행 → Virtual DOM → createDOM 으로 처음 그림
//  [3] 이벤트 클릭/입력 → 핸들러 → setState  (상태 칸 hooks[i] 값 교체 + scheduleUpdate)
//  [4] update FunctionComponent.update()     함수를 처음부터 다시 실행 → 새 Virtual DOM
//             └ diff(이전, 새) → applyPatches   ← Phase 1 그대로. 바뀐 부분만 실제 DOM 에 반영
//  [5] effect DOM 반영 뒤: 바뀐 deps 의 cleanup → useEffect 실행
// ═════════════════════════════════════════
import { initApp } from './app.js';

initApp(document);
window.__miniReactBooted = true;
