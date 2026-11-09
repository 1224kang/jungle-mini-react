# Mini React · Phase 1 + Phase 2 (CDH)

Phase 1 (Virtual DOM 변환, Diff, Patch, State History) 과 Phase 2 (Component, State, Hooks) 를 구현한 코드입니다. Phase 2 설명은 아래 "Phase 2" 절에 있습니다.
외부 UI 프레임워크를 쓰지 않고 순수 JavaScript (ES Module) 로 작성했습니다.

## 실행

컨테이너 안에서 실행합니다 (루트 README 참고).

```bash
npm run dev          # Phase 1: http://localhost:5173/CDH/index.html
                     # Phase 2: http://localhost:5173/CDH/phase2.html
npx vitest run CDH   # CDH 테스트 1회 실행
node CDH/build-standalone.mjs   # 서버 없이 더블클릭으로 여는 standalone.html, standalone-phase2.html 생성
```

## 동작 흐름 (과제 순서 그대로)

1. **로드** — `index.html` 의 실제 영역에 적어 둔 샘플 HTML(DOM) 을 `domToVNode` 로 Virtual DOM 으로 바꿉니다. 그 Virtual DOM 으로 테스트 영역을 `createDOM` 으로 렌더링합니다 (화면 + HTML 코드 칸).
2. **편집** — 테스트 영역 화면(contenteditable) 이나 HTML 코드 칸을 자유롭게 고칩니다. `MutationObserver` 가 테스트 영역 DOM 의 변화를 감지해 "변경 감지: N건" 을 보여 주고 Patch 버튼을 강조합니다. 위쪽 "예시 편집" 버튼으로 텍스트 / 속성 / 태그 / 추가 / 삭제 / 순서 변경을 한 번에 만들어 볼 수 있습니다.
3. **Patch** — 테스트 영역의 현재 상태 → 새 Virtual DOM → 이전 Virtual DOM 과 `diff` → 바뀐 부분만 실제 영역에 `applyPatches` → 새 Virtual DOM 을 State History 에 저장. 바뀐 노드는 잠깐 노랗게 깜빡이고, "이번 패치" 목록에 패치 종류와 건드린 DOM 노드 수가 나옵니다. 바뀐 게 없으면 기록을 남기지 않습니다.
4. **뒤로가기 / 앞으로가기** — 기록 속 Virtual DOM 으로 이동하고, 같은 `diff → patch` 경로로 실제 영역과 테스트 영역을 함께 바꿉니다.

## 구조

| 경로 | 역할 | 연결 레슨 |
|---|---|---|
| `src/lib/vdom/vnode.js` | `h()`, `countNodes` | 0001 |
| `src/lib/vdom/convert.js` | 실제 DOM → VNode (`domToVNode`), HTML 문자열 ↔ VNode, `stripBlankNodes` | 0001 |
| `src/lib/dom/create.js` | VNode → 실제 DOM | 0005 |
| `src/lib/reconcile/diff.js` | 두 VNode 비교 → 패치 목록 (순수 함수) | 0002, 0003, 0004 |
| `src/lib/reconcile/patch.js` | 패치 목록 → 실제 DOM 반영 | 0005 |
| `src/lib/reconcile/describe.js` | 패치 목록 → 사람이 읽는 줄 (화면 표시용) | — |
| `src/app/history.js` | 스냅샷 배열 + 커서 (뒤로/앞으로) | 0006 |
| `src/app/app.js` | 데모 연결: 로드, MutationObserver, Patch, 기록 이동 | — |
| `tests/*.test.js` | 모듈별 단위 테스트 + 무작위 키 리스트 + 앱 통합 테스트 | — |

## 패치 종류

| op | 뜻 | 필드 |
|---|---|---|
| `REPLACE` | 타입이 다름 (루트 또는 자식) → 지우고 새로 만듦 | `path`, `value` |
| `TEXT` | 텍스트 값이 다름 | `path`, `value` |
| `PROPS` | 속성 변경 | `path`, `set`, `remove` |
| `REMOVE` | 짝 없는 옛 자식 제거 | `path` (옛 위치) |
| `CHILDREN` | 부모의 자식 배치 계획 | `path`, `plan` (`{from, moved}` 또는 `{create}`) |

`path` 는 옛 트리 기준 인덱스 경로입니다. `patch.js` 는 경로를 먼저 노드로 바꿔 둔 뒤 DOM 을 바꾸므로, 인덱스가 밀리는 문제가 없습니다 (레슨 0005 의 "뒤에서부터" 규칙을 직접 쓰지 않는 방법).

## Diff 의 5가지 핵심 경우

| 경우 | 결과 패치 |
|---|---|
| 텍스트 변경 | `TEXT` |
| 속성 변경 | `PROPS` |
| 태그(타입) 변경 | `REPLACE` |
| 자식 추가 | `CHILDREN` 의 `{create}` |
| 자식 삭제 | `REMOVE` |
| (키 있는) 순서 변경 | `CHILDREN` 의 `moved` |

## Phase 1 의 알려진 한계

- (Phase 1 데모 한정) 이벤트 핸들러 같은 함수 props 는 `structuredClone` 이 복사하지 못하므로 State History 에 저장할 수 없습니다. Phase 2 앱은 History 를 쓰지 않고 상태를 hooks 배열에 둡니다.
- 키 리스트 이동은 레슨 0004 의 `lastPlaced` 규칙을 따르므로 항상 최소 이동이 아닙니다.
- 공백만 있는 텍스트 노드와 주석은 Virtual DOM 에서 버립니다 (`<b>a</b> <i>b</i>` 사이 공백도 사라짐).
- `<script>`, 이벤트 속성 등은 다루지 않습니다. 테스트 영역은 HTML 전체가 아니라 루트 요소 하나만 읽습니다.

---

# Phase 2 · Component · State · Hooks

`phase2.html` 의 Todo 앱(입력, 추가, 체크, 삭제, 필터, 타이머)으로 확인합니다. 오른쪽 디버그 패널에 렌더 횟수, hooks 배열, 이번 렌더의 패치, effect 로그가 실시간으로 보입니다.

## 렌더 루프 (Phase 1 과의 연결)

```
setState ─▶ scheduleUpdate ─▶ update()
                               1) renderTree : 루트 함수를 처음부터 다시 실행 → 새 Virtual DOM (자식 컴포넌트 전개)
                               2) commit     : diff(이전 Virtual DOM, 새 Virtual DOM) → applyPatches   ← Phase 1 그대로
                               3) effects    : DOM 반영 뒤 → 바뀐 deps 의 cleanup → useEffect 실행
```

핵심 질문 "함수는 매번 새로 실행되는데 상태는 어떻게 유지하나?" 의 답: 상태는 함수 안이 아니라 `FunctionComponent.hooks` 배열에 있고, Hook 은 호출 순서(칸 번호)로 자기 칸을 찾습니다.

## 구조 (Phase 2 에서 추가/수정)

| 경로 | 역할 |
|---|---|
| `src/lib/index.js` | 공개 API: `h`, `FunctionComponent`, `useState`, `useEffect`, `useMemo` |
| `src/lib/component/function-component.js` | `FunctionComponent`: `hooks`, `mount()`, `update()`, `unmount()`, `flush()`. 렌더 → 커밋(diff/patch) → effect, batching |
| `src/lib/component/resolve.js` | 함수 type 노드(`h(Card, props)`)를 호출해 태그 노드로 전개 (null, 배열, key 전달 처리) |
| `src/lib/hooks/runtime.js` | "지금 렌더 중인 컴포넌트" 추적, 과제 제약 검사 (렌더 밖 / 자식에서 Hook 호출 → 오류) |
| `src/lib/hooks/useState.js` `useEffect.js` `useMemo.js` `deps.js` | 세 Hook 과 deps 비교 (`Object.is`) |
| `src/lib/dom/props.js` | 이벤트 핸들러, `value`/`checked`, boolean, `className`, `style` 객체 처리 (Phase 1 은 setAttribute 만) |
| `src/lib/reconcile/*.js` | Phase 1 에서 수정: style 객체 비교, PROPS 패치가 props.js 사용, HANDLER 설명 |
| `src/app2/` | Todo 데모: `todo-app.js` (루트, 상태·Hook 전부), `components.js` (자식, props 만), `debug-panel.js`, `app.js`, `main.js` |
| `tests/hooks.test.js` `component.test.js` `props.test.js` `app2.test.js` | Phase 2 단위·통합 테스트 |

## 과제 제약을 지키는 방법

- **함수형 컴포넌트 + `FunctionComponent` 클래스**: `hooks` 배열, `mount()`, `update()` 를 가집니다.
- **Hook 은 루트에서만**: 자식을 호출하는 동안 `runAsChild` 가 표시를 켜 두므로, 자식에서 `useState` 를 부르면 "루트 컴포넌트에서만 쓸 수 있습니다" 오류가 납니다.
- **상태는 루트에만, 자식은 props 만**: `TodoApp` 이 모든 상태를 갖고, 자식은 값과 콜백(`onToggle`, `onAdd` …)을 props 로 받습니다 (Lifting State Up).
- **setState 가 하는 일**: ① hooks 칸의 값 교체 ② 같은 값(`Object.is`)이면 무시 ③ 다시 그리기 예약 (`scheduleUpdate`).
- **batching (선택)**: 같은 틱의 `setState` 여러 번을 마이크로태스크로 모아 렌더 1번만 합니다 (`batch: true` 기본값, `batch: false` 면 즉시). 데모의 "+1 을 3번 호출" 과 체크박스로 비교할 수 있습니다.

## Hook 동작 요약

| Hook | 칸에 저장하는 것 | 규칙 |
|---|---|---|
| `useState(init)` | `{ value, set }` | 초기값 함수는 처음 1번만. `set(fn)` 은 최신 값을 받음. setter 참조는 렌더가 바뀌어도 같음 |
| `useEffect(fn, deps)` | `{ deps, cleanup, ran }` | DOM 반영 뒤 실행. 순서: 바뀐 effect 들의 cleanup 전부 → 새 effect 전부. `deps` 생략=매 렌더, `[]`=처음 1번. unmount 때 cleanup 실행 |
| `useMemo(fn, deps)` | `{ deps, value }` | deps 같으면 이전 값 재사용. `deps` 생략=매 렌더 계산 |

## 엣지 케이스 (테스트로 확인)

- 조건문 안의 Hook (개수 증가·감소, 칸 종류 불일치), 렌더 밖·자식·effect 안에서 Hook 호출 → 설명이 있는 오류
- 렌더 중 `setState` (파생 상태) 는 렌더를 버리고 재실행, 무한 반복은 상한에서 중단. effect 안의 무한 `setState` 도 중단
- effect 하나가 던져도 나머지 effect 는 실행하고 오류는 다시 던짐. 렌더가 던져도 컴포넌트는 계속 사용 가능, 첫 렌더 실패 시 hooks 초기화
- 입력창: 글자를 쳐도 같은 `<input>` 노드를 재사용 (포커스·커서 유지). 핸들러가 상태를 안 바꾸면 사용자가 친 글자를 되돌림 (제어 컴포넌트)
- `<select value>` 는 `<option>` 이 생긴 뒤에 맞춤, `disabled={false}` 는 속성 제거, `aria-*` 는 "true"/"false" 글자 유지
- 이벤트 핸들러는 요소당 이벤트 종류별로 리스너 1개만 달고 최신 함수를 맵에 교체 (오래된 클로저 없음, 핸들러만 바뀐 패치는 깜빡임 대상 아님)
- 리스트 항목 컴포넌트의 `key` 를 결과 요소로 옮겨 순서 변경·앞쪽 삽입도 노드 재사용
- `null` / `false` / 배열(프래그먼트) 반환, 숫자 `0` 렌더, 글자는 항상 `textContent` (XSS 방지)
- localStorage 가 깨졌거나 막혀 있거나 가득 차도 앱 동작

## 실제 React 와의 차이 (학습용)

- 상태를 가진 자식 컴포넌트, `useRef` / `useReducer` / `useContext` 등 다른 Hook 없음 (과제 범위 밖, 자식 상태는 의도적으로 금지)
- 컴포넌트 단위 리렌더링 없음: 루트를 항상 처음부터 실행한 뒤 Virtual DOM 전체를 diff (React 는 바뀐 컴포넌트부터)
- Fiber 와 시간 분할(Concurrent) 없음: 렌더가 동기. React 는 렌더를 쪼개고 우선순위를 둠
- effect 는 DOM 반영 직후 동기 실행 (React 는 `useEffect` 를 페인트 뒤로 미루고, `useLayoutEffect` 는 페인트 전)
- batching 은 마이크로태스크 하나로 단순화. React 는 우선순위 큐로 처리하고 이벤트 종류에 따라 다름
- 이벤트: 요소마다 `addEventListener` (React 는 루트에서 이벤트 위임 + SyntheticEvent)
- `StrictMode` 개발용 이중 렌더, 에러 바운더리 없음
