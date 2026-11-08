# Mini React · 학습용 (Phase 1 + Phase 2)

외부 프레임워크 없이 순수 JavaScript (ES Module) 로 만든 미니 리액트입니다.
읽기 쉽도록 **라이브러리 한 파일 + 데모 두 개** 로 합쳐 두었습니다.

## 실행

```bash
npm run dev            # http://localhost:5173/CDH/index.html  (Phase 1, Phase 2 데모가 한 페이지)
npx vitest run CDH     # 테스트 1회 실행
node CDH/build-standalone.mjs   # 서버 없이 더블클릭으로 여는 standalone.html 생성
```

## 파일

| 파일 | 내용 |
|---|---|
| `src/mini-react.js` | **라이브러리 전체.** 위에서 아래로 읽으면 Phase 1 → Phase 2 순서입니다 |
| `src/demo-phase1.js` | Phase 1 검증 페이지: 실제 영역 / 테스트 영역 / Patch / 뒤로 / 앞으로 |
| `src/demo-phase2.js` | Phase 2 Todo 앱: 루트(상태·Hook) + 자식(props 만) + 디버그 패널 |
| `src/main.js`, `index.html`, `src/styles.css` | 두 데모를 한 페이지로 띄우는 연결부 |
| `tests/phase1.test.js` | Virtual DOM · Diff · Patch · State History 단위 테스트 (50개) |
| `tests/phase2.test.js` | 속성 · Hooks · FunctionComponent · 자식 컴포넌트 · batching (55개) |
| `tests/app.test.js` | index.html 로 두 데모를 끝까지 돌리는 기능 테스트 (23개) |

## mini-react.js 읽는 순서

```
[Phase 1]  1-1 h(), domToVNode()      실제 DOM ↔ Virtual DOM
           1-2 createDOM()            Virtual DOM → 실제 DOM
           1-3 diff()                 옛 트리 vs 새 트리 → 패치 목록 (DOM 은 안 건드림)
           1-4 applyPatches()         패치 목록 → 실제 DOM 반영 (바뀐 곳만)
           1-5 StateHistory           기록 + 커서 (뒤로 / 앞으로)
[Phase 2]  2-1 expand()               h(Card, props) 같은 자식 컴포넌트를 태그 트리로 풀기
           2-2 FunctionComponent      hooks 배열, mount(), update()   ← 여기서 Phase 1 을 불러 씀
           2-3 useState / useEffect / useMemo
```

### Phase 1 의 5가지 핵심 변화

| 변화 | 패치 |
|---|---|
| 글자가 바뀜 | `TEXT` |
| 속성이 바뀜 | `PROPS` (`set`, `remove`) |
| 태그가 바뀜 | `REPLACE` (통째로 교체) |
| 자식이 생김 | `CHILDREN` 의 `{ create }` |
| 자식이 사라짐 | `REMOVE` |
| (+) key 리스트 순서 변경 | `CHILDREN` 의 `plan` |

### Phase 2 렌더 루프 (Phase 1 과의 연결)

```
setState ─▶ update()
              ① render : 컴포넌트 함수를 처음부터 다시 실행 → 새 Virtual DOM
              ② commit : diff(이전 Virtual DOM, 새 Virtual DOM) → applyPatches   ← Phase 1 그대로
              ③ effects: DOM 이 바뀐 뒤 useEffect 실행
```

"함수는 매번 새로 실행되는데 상태는 어떻게 유지하나?" → 상태는 함수 밖 `FunctionComponent.hooks` 배열에 있고,
Hook 은 **불린 순서(칸 번호)** 로 자기 칸을 찾습니다. 그래서 Hook 을 조건문 안에 쓰면 칸이 밀립니다
(`tests/phase2.test.js` 의 "조건부 Hook 은 칸이 밀린다" 참고).

## 과제 제약을 지키는 방법

- **함수형 컴포넌트 + `FunctionComponent` 클래스**: `hooks` 배열, `mount()`, `update()`.
- **Hook 은 루트에서만, 상태는 루트에만**: 자식을 호출하는 동안 `childDepth` 가 켜져서 자식 안의 Hook 은 오류. `TodoApp` 이 모든 상태를 갖고 자식은 값과 콜백을 props 로 받습니다 (Lifting State Up).
- **setState 가 하는 일**: ① 칸의 값 교체 ② 같은 값이면 무시 ③ 다시 그리기 예약.
- **batching (선택)**: 같은 틱의 `setState` 여러 번을 마이크로태스크로 모아 렌더 1번 (`batch: true` 기본값). 데모의 "+1 을 3번 호출" 과 체크박스로 비교.

## 학습용으로 단순화한 점 (실제 React 와의 차이)

- Diff: 같은 key (없으면 같은 자리) 끼리 짝짓고, 순서가 다르면 "새 순서대로 놓기" 를 합니다. 최소 이동 계산은 하지 않습니다.
- 이벤트: `el.onclick = fn` 으로 연결합니다 (React 는 루트에서 이벤트 위임 + SyntheticEvent).
- 속성: `style` 은 문자열만, `value` / `checked` 는 입력 요소에만 프로퍼티로 넣습니다. 사용자가 친 글자를 되돌리는 "완전한 제어 컴포넌트" 는 없습니다.
- Hook 규칙 검사는 "렌더 밖 / 자식에서 호출" 만 합니다. 조건부 Hook 은 막지 않고 칸이 밀리는 것을 테스트로 보여 줍니다.
- 렌더 중 `setState` 는 오류, effect 안에서 deps 없이 `setState` 하는 무한 루프는 막지 않습니다 (React 는 횟수 상한이 있음).
- 컴포넌트 단위 리렌더링 없음: 루트를 항상 처음부터 실행한 뒤 Virtual DOM 전체를 diff 합니다 (React 는 바뀐 컴포넌트부터).
- Fiber / 시간 분할 없음: 렌더가 동기. effect 도 DOM 반영 직후 바로 실행 (React 는 페인트 뒤로 미룸).
- 자식 컴포넌트는 요소 하나(또는 `null`)만 돌려줍니다 (프래그먼트 배열 반환 없음).
