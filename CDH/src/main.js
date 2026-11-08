// 시작점: index.html 이 이 파일을 불러옵니다. Phase 1 데모와 Phase 2 데모를 한 페이지에서 함께 띄웁니다.
import { initPhase1 } from './demo-phase1.js';
import { initPhase2 } from './demo-phase2.js';

initPhase1(document);
initPhase2(document);
window.__miniReactBooted = true; // index.html 의 "앱이 시작되지 않았습니다" 안내를 끄는 표시
