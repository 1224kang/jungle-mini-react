# Mini React · Phase 1 (CDH)

Virtual DOM 변환, Diff, Patch, State History 까지 구현한 Phase 1 코드입니다.
외부 UI 프레임워크를 쓰지 않고 순수 JavaScript (ES Module) 로 작성했습니다.

## 실행

컨테이너 안에서 실행합니다 (루트 README 참고).

```bash
npm run dev          # http://localhost:5173/CDH/index.html
npx vitest run CDH   # CDH 테스트 1회 실행
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

## 알려진 한계 (Phase 2 에서 다룸)

- 상태(state)와 컴포넌트는 아직 없습니다. 이벤트 핸들러 같은 함수 props 는 `structuredClone` 이 복사하지 못하므로 히스토리에 저장할 수 없습니다.
- 키 리스트 이동은 레슨 0004 의 `lastPlaced` 규칙을 따르므로 항상 최소 이동이 아닙니다.
- 공백만 있는 텍스트 노드와 주석은 Virtual DOM 에서 버립니다 (`<b>a</b> <i>b</i>` 사이 공백도 사라짐).
- `<script>`, 이벤트 속성 등은 다루지 않습니다. 테스트 영역은 HTML 전체가 아니라 루트 요소 하나만 읽습니다.
