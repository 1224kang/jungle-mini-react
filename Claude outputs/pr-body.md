## 🔗 관련 이슈

해당 없음

## 📝 변경 내용

- `CDH/` 아래에 Phase 1 구현 추가: Virtual DOM 변환, Diff, Patch, State History(뒤로/앞으로)
- 외부 UI 프레임워크 없이 순수 JavaScript (ES Module) 로 작성
- VNode 생성/변환 (`vdom/vnode.js`, `vdom/convert.js`), VNode → DOM 생성 (`dom/create.js`)
- Diff (`reconcile/diff.js`), Patch 적용 (`reconcile/patch.js`), 패치 설명 문자열 (`reconcile/describe.js`)
- 히스토리 스냅샷 + 커서 (`app/history.js`), 데모 앱 연결 (`app/app.js`, `MutationObserver` 로 편집 감지)
- 모듈별 단위 테스트 및 앱 통합 테스트 (`CDH/tests/`)
- `.devcontainer/devcontainer.json` 추가

## 🧠 동작 설명

1. **로드**: `index.html` 의 샘플 DOM 을 `domToVNode` 로 VNode 로 바꾸고, `createDOM` 으로 테스트 영역을 렌더링합니다.
2. **편집 감지**: 테스트 영역을 고치면 `MutationObserver` 가 "변경 감지: N건" 을 표시하고 Patch 버튼을 강조합니다.
3. **Patch**: 테스트 영역의 현재 상태 → 새 VNode 생성 → 이전 VNode 와 `diff` → 바뀐 부분만 `applyPatches` 로 실제 영역에 반영 → 새 VNode 를 히스토리에 저장합니다. 변경이 없으면 기록하지 않습니다.
4. **뒤로/앞으로**: 히스토리의 VNode 로 이동하고 같은 `diff → patch` 경로로 두 영역을 함께 갱신합니다.

예시: `<p>안녕</p>` 을 `<p>반가워</p>` 로 고치면 → `diff` 가 `TEXT` 패치 1개를 만들고 → `patch` 가 텍스트 노드 값만 바꾸며 → 히스토리에 새 스냅샷이 쌓입니다.

패치 종류: `REPLACE` (타입 변경), `TEXT` (텍스트 변경), `PROPS` (속성 변경), `REMOVE` (옛 자식 제거), `CHILDREN` (자식 배치 계획: `{from, moved}` 또는 `{create}`)

## 🔧 공개 인터페이스 변경

- [x] 없음
- [ ] 있음

기존 모듈을 수정하지 않고 `CDH/` 아래에 새로 추가한 코드입니다.

## ✅ 테스트

- [ ] Docker 컨테이너 안에서 `npm run test:run` 통과 (이 PR 의 테스트는 `npx vitest run CDH` 로 실행)
- [x] 새 기능 / 버그 수정에 대한 테스트 추가 (`CDH/tests/*.test.js`)
- [ ] 브라우저에서 직접 확인 (`npm run dev` → `http://localhost:5173/CDH/index.html`)

> 리뷰 전 `npx vitest run CDH` 실행 결과를 여기에 적어 주세요.

## ⚠️ 팀원에게 영향

- [ ] 영향 없음
- [ ] `docker compose build` 다시 필요
- [ ] 컨테이너 안에서 `npm install` 필요 (패키지 추가 / 변경)
- [x] 기타: `.devcontainer/devcontainer.json` 추가 (devcontainer 설정을 쓰는 분은 컨테이너를 다시 열어 주세요)

## 📸 스크린샷 (선택)

없음

## 👀 리뷰 포인트

- `reconcile/diff.js`: 키 있는 리스트의 순서 변경은 `lastPlaced` 규칙을 따르므로 항상 최소 이동은 아닙니다 (README 한계에 기록).
- `reconcile/patch.js`: 패치의 `path` 는 옛 트리 기준 인덱스이고, 경로를 먼저 노드로 바꿔 둔 뒤 DOM 을 바꿉니다. 인덱스가 밀리는 문제를 피하는 방식이니 이 부분을 봐주세요.
- `standalone.html` (765줄) 은 `build-standalone.mjs` 로 만든 산출물입니다. 내용보다 빌드 스크립트 쪽을 봐주시면 됩니다.
- 알려진 한계: 공백만 있는 텍스트 노드와 주석은 VNode 에서 버려집니다 (`<b>a</b> <i>b</i>` 사이 공백도 사라짐). `<script>` 와 이벤트 속성은 다루지 않습니다. Phase 2 에서 다룰 예정입니다.

## ☑️ 체크리스트

- [x] 외부 UI 프레임워크(React, Vue 등)를 사용하지 않았다
- [x] 이번 작업과 관련 없는 변경은 포함하지 않았다
- [ ] 패키지를 추가했다면 `package.json`과 `package-lock.json`을 함께 커밋했다 (해당 없음: 패키지 변경 없음)
