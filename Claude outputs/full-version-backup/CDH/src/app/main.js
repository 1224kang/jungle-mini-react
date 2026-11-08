// [1] 시작점 — 브라우저가 index.html 을 열면 여기부터 실행됩니다.
//
// ════════════════ 전체 흐름 지도 (주석의 [번호] 를 따라가면 됩니다) ════════════════
//
//  [1] 시작        main.js                 initApp(document) 호출
//        ▼
//  [2] 로드        app.js  initApp          실제 영역 DOM → Virtual DOM → 테스트 영역 그리기
//        2-1 stripBlankNodes()   vdom/convert.js     공백 노드 정리
//        2-2 domToVNode()        vdom/convert.js     DOM → Virtual DOM
//        2-3 new StateHistory()  app/history.js      첫 기록 저장
//        2-4 renderTest()        app/app.js          → createDOM() dom/create.js, prettyHTML() vdom/convert.js
//        ▼
//  [3] 편집        app.js                   사용자가 테스트 영역을 고침 (아직 실제 영역은 그대로)
//        3-1 MutationObserver    "변경 감지" 표시
//        3-2 pane 'input'        화면 → 코드 칸
//        3-3 code 'input'        코드 칸 → 화면 (parseHTML() vdom/convert.js)
//        ▼
//  [4] Patch 버튼  app.js  btnPatch click   테스트 영역 → 새 Virtual DOM → Diff → 실제 영역 일부만 갱신
//        4-1 readPane()          app.js              테스트 영역 → 새 Virtual DOM (domToVNode)
//        4-2 diff()              reconcile/diff.js   옛 vs 새 비교 → 패치 목록
//        4-3 describePatches()   reconcile/describe.js  패치 목록 → 화면용 글
//        4-4 applyPatches()      reconcile/patch.js  패치를 실제 영역에 반영
//        4-5 renderTest/showPatches/flash  app.js    화면 갱신
//        4-6 history.push()      app/history.js      새 Virtual DOM 기록
//        ▼
//  [5] 뒤로/앞으로  app.js                  history.back()/forward() 로 꺼낸 Virtual DOM 을 4-2 ~ 4-5 로 다시 적용
//
// ══════════════════════════════════════════════════════════════════════════════════
import { initApp } from './app.js'; // ▶ 다음: app.js 의 [2] initApp

initApp(document);
window.__miniReactBooted = true; // index.html 의 안내 문구가 뜨지 않게 하는 표시
