# Diff & Patch

이전 VNode와 새 VNode를 비교해 바뀐 부분만 실제 DOM에 반영한다. 데이터 형식의 기본 계약은 `docs/contracts.md`(1~5장)이고, 이 문서는 그 5장(Patch)의 설계 배경과 세부 규칙을 설명한다.

## 1. 구조

```
           순수 (DOM 없음)                          DOM 접근
v1, v2 ──▶ diff(v1, v2) ──▶ Patch[] (데이터) ──▶ patch(rootDom, patches) ──▶ 루트 DOM
                                                   │ 1) 해석: 모든 old 경로 → DOM 참조 (DOM 변경 0회)
                                                   │ 2) 실행: 배열 순서대로, 참조로만 조작
                                                   └─ dom/props.js: setProp / removeProp (+ 리스너 WeakMap)
```

| 파일 | 책임 |
|---|---|
| `src/lib/reconcile/diff.js` | `diff(oldVNode, newVNode) → Patch[]`. 순수 함수, DOM을 읽거나 쓰지 않는다(`tests/boundaries.test.js`가 검사). |
| `src/lib/reconcile/patch.js` | `patch(rootDom, patches) → Node`. 해석 → 실행. 루트가 교체되면 새 루트를 반환. |
| `src/lib/dom/props.js` | 문자열 값 → attribute, `on*` + 함수 → `addEventListener`. 요소별 핸들러를 `WeakMap`에 기억해 교체 시 이전 리스너를 뗀다. `render`와 `patch`가 공유. |
| `src/lib/dom/render.js` | 최초 마운트. 속성 설정은 `setProp`을 쓴다. |

사용 흐름:

```js
let root = render(v1);
container.appendChild(root);
// 갱신: 루트가 REPLACE될 수 있으므로 반환값을 다시 받는다.
root = patch(root, diff(v1, v2));
v1 = v2;
```

- 기존 HTML에서 시작할 때는 `domToVdom(el)` → `render` → `el.replaceWith(root)` 후에 patch한다. 파싱한 원본 DOM에는 VNode에서 버려진 공백 텍스트·주석이 남아 있어 경로가 맞지 않는다.
- `src/playground`의 "2. diff / 3. patch 적용"에서 before → after 과정을 직접 확인할 수 있다.

## 2. Patch 스키마

`path`는 **이전(old) VNode 트리 기준** 자식 인덱스 배열이다. 루트는 `[]`.

| type | 필드 | 의미 |
|---|---|---|
| `CREATE` | `path`, `node`, `before` | `path.slice(0,-1)` = 부모의 old 경로, `path.at(-1)` = 새 순서의 인덱스. `render(node)`를 `before` 앞에 삽입 |
| `REMOVE` | `path` | old 경로의 노드 제거 |
| `REPLACE` | `path`, `node` | old 경로의 노드를 `render(node)`로 교체 |
| `TEXT` | `path`, `value` | 텍스트 노드의 `nodeValue` 변경 |
| `PROPS` | `path`, `set`, `remove` | `set`: 추가·변경할 `{ 이름: 값 }`(문자열 또는 `on*` 함수), `remove`: 삭제할 이름 목록 |
| `MOVE` | `path`, `index`, `before` | old 경로의 노드(같은 부모 안)를 새 순서 `index` 위치, `before` 앞으로 이동 |

`before`(배치 기준점):
- `null` → 부모의 맨 끝
- `{ old: i }` → 같은 부모의 old 자식 `i`번 DOM 노드 앞 (그 자리가 REPLACE됐다면 교체된 새 노드 앞)
- `{ new: j }` → 같은 patch 목록에서 먼저 실행된 `CREATE`(같은 부모, 새 인덱스 `j`)가 만든 노드 앞

출력 순서는 부모 단위로 ① 제거 ② 배치(새 순서의 **뒤에서부터**) ③ 재사용된 자식 내부 갱신이다. `REPLACE`/`REMOVE`/`CREATE`된 노드의 하위로는 내려가지 않는다.

### 왜 "old 경로 + 실행 전 일괄 해석"인가

| 방식 | 장점 | 단점 |
|---|---|---|
| 인덱스 경로를 실행 중 매번 해석 | 순수 데이터 | 앞선 삭제·이동이 뒤 경로를 밀어 대상이 틀어진다 |
| VNode에 DOM 참조(`vnode.el`) 저장 (React·Vue 방식) | 이동·삭제에도 대상 불변 | VNode가 순수 데이터가 아니게 되어 `toEqual` 기반 테스트(생성 일치·왕복 불변)와 팀 계약 1장이 깨진다 |
| **old 경로 + 실행 전 일괄 해석 (선택)** | Patch는 순수 데이터 그대로, DOM을 바꾸기 **전에** 모든 경로를 참조로 바꾸므로 이후 이동·삭제에도 대상이 흔들리지 않는다. 해석 실패 시 부분 적용 없이 에러 | `rootDom`이 `oldVNode`와 구조가 정확히 같아야 한다. 새로 만든 노드는 경로가 없어 `{ new: j }` 표기가 필요 |

## 3. 비교 규칙

- **노드 동일성 = `type`과 `key`가 모두 같음.** 텍스트는 `type`만 본다.
- 동일하지 않음 → `REPLACE`(하위 비교 안 함). 동일 → DOM 재사용 후 props·children 비교. 텍스트끼리 값이 다르면 `TEXT`.
- key가 다르면 위치가 같아도 `REPLACE`다. `data-key` 속성이 항상 `vnode.key`와 일치해야 하기 때문이다(key는 `PROPS` 대상이 아님).
- **Props**: HTML 속성 이름 그대로, 값은 문자열. `===`로 같으면 patch 없음 → DOM 조작 0회. 새로 있거나 다르면 `set`, 사라졌으면 `remove`.
  - `className` 별칭, `style` 객체, `value`/`checked` DOM 프로퍼티는 지원하지 않는다(팀 계약 1.2).
- **이벤트**: 이름이 `/^on./`이고 값이 함수인 prop만 이벤트다. 이벤트 이름 = `name.slice(2).toLowerCase()`.
  - 교체: 이전 함수를 `removeEventListener` 후 새 함수 등록. 같은 함수(`===`)면 아무것도 안 함. 제거: `removeEventListener`.
  - 문자열 `on*` 값(HTML의 `onclick="..."`)은 일반 속성이다. 함수 ↔ 문자열로 바뀌면 이전 쪽을 정리한 뒤 새 쪽을 적용한다.
  - 이름이 정확히 `on`인 함수 prop은 `h()`가 다른 함수 prop처럼 거부한다.
  - `onclick`과 `onClick`을 한 요소에 함께 주는 것은 정의하지 않는다.

## 4. Children 비교 (React식 lastPlacedIndex)

1. old 자식으로 `Map(key → index)`(첫 등장만)을 만든다.
2. 새 자식을 앞에서부터 보며 같은 key + 같은 type인 old 자식을 재사용한다. 재사용한 old 인덱스가 `lastPlacedIndex`보다 작으면 `MOVE`, 아니면 `lastPlacedIndex`를 갱신한다.
3. 사용되지 않은 old 자식은 `REMOVE`.
4. 배치(`MOVE`/`CREATE`)는 새 순서의 **뒤에서부터**, 바로 다음 새 형제 앞에 넣는다. 뒤쪽은 이미 최종 위치이므로 그 앞에 끼우면 곧 최종 위치가 된다(귀납). 이동하지 않는 자식은 old 인덱스가 증가하는 순서라 서로의 상대 순서가 이미 맞다.

세부 규칙:
- 같은 key·다른 type은 재사용하지 않는다 → `REMOVE` + `CREATE`.
- **key 없는 자식**(텍스트 포함)은 아직 짝지어지지 않은 key 없는 old 자식 중 **같은 type의 첫 번째**와 짝짓는다. 없으면 생성. (`[span,p,span] → [span,section,span]`에서 두 `span`이 모두 재사용된다.)
- **중복 key**: 경고는 생성 시점에 `h()`/`domToVdom()`이 이미 낸다. `diff`는 경고를 더 내지 않고, 두 번째 이후 노드는 key 없는 자식처럼 처리한다.
- **끝에 연속 생성되는 꼬리**는 앞에서부터 `before: null`로 붙인다(결과는 같고, 인덱스 기반 append와 patch 모양이 같다).
- 같은 새 인덱스에서 old와 new가 **둘 다 짝이 없고** `j >= lastPlacedIndex`이면 `REMOVE` + `CREATE` 대신 `REPLACE` 하나를 낸다(같은 key·다른 type은 제외).

### 이동 횟수 기준표 (`[A,B,C,D]`, 모두 key 있음)

| 변경 | 이동 | 삽입 | 삭제 |
|---|---|---|---|
| 동일 | 0 | 0 | 0 |
| 맨 뒤 추가 `[A,B,C,D,E]` | 0 | 1 | 0 |
| 맨 앞 추가 `[E,A,B,C,D]` | 0 | 1 | 0 |
| 중간 삭제 `[A,B,D]` | 0 | 0 | 1 |
| 맨 앞 → 맨 뒤 `[B,C,D,A]` | 1 | 0 | 0 |
| 맨 뒤 → 맨 앞 `[D,A,B,C]` | 3 | 0 | 0 |
| 역순 `[D,C,B,A]` | 3 | 0 | 0 |

"맨 뒤 → 맨 앞"이 3회인 것은 lastPlacedIndex의 알려진 약점이다. 최소 이동(n − LIS)을 보장하지 않으며, 의도된 동작으로 테스트에 고정되어 있다.

## 5. 보장하는 동작

- 최종 DOM은 새 VNode와 일치한다. 판정은 `domToVdom(patched)`가 `newVNode`와 `toEqual`인지로 한다.
- 한 요소 안의 **속성 순서는 보장하지 않는다**(바뀌지 않은 속성은 건드리지 않고 새 속성은 뒤에 붙기 때문). `outerHTML` 문자열로 비교할 때는 속성을 정렬해서 비교한다.
- key가 같은 노드, 그리고 type·key가 같은 같은 위치의 노드는 DOM 객체가 동일(`===`)하다. `REPLACE`된 노드는 다른 객체다.
- 이동되지 않은 노드의 포커스와 input 값은 보존된다. 이동된 노드는 DOM 객체가 같으므로 input 값이 보존된다(포커스는 환경에 따라 다르므로 보장하지 않음).
- `diff`는 입력 VNode를 수정하지 않는다. 같은 구조끼리 `diff`하면 `[]`.

## 6. 에러

형식은 팀 계약의 `[mini-react] 잘못된 입력: <내용>`(`TypeError`). 검사는 공개 함수 입구에서 한 번만 한다.
- `diff`: 인자가 객체가 아니거나 `type`이 문자열이 아니면 에러.
- `patch`: `rootDom`이 DOM 노드가 아니거나 `patches`가 배열이 아니면 에러. 빈 배열이면 아무것도 하지 않고 `rootDom` 반환.
- `path`/`before.old`가 해석되지 않거나 알 수 없는 type이면 **DOM을 바꾸기 전에** 에러(부분 적용 없음). 부모 없는 루트의 `REPLACE`도 에러.
- 중복 key는 에러가 아니다.

## 7. 복잡도

N = 노드 수, P = 속성 수, K = patch 수, d = 트리 깊이.
- `diff`: 노드 쌍마다 최대 한 번, 부모마다 Map 구축과 순회가 선형 → **평균 O(N + P)** (Map 조회 평균 O(1) 가정). "같은 레벨끼리만 비교", "type이 다르면 하위 비교 안 함" 휴리스틱 덕분이며, 일반 트리 편집 거리(O(n³))의 최적해는 보장하지 않는다.
- `patch`: 해석은 patch마다 루트부터 경로를 따라가므로 **O(K·d)**, 실행은 patch당 DOM 호출 O(1)(CREATE/REPLACE는 서브트리 `render` 비용 추가).

## 8. 테스트

| 위치 | 내용 |
|---|---|
| `tests/reconcile/phase1/` | 타입·텍스트·props·이벤트, 인덱스 기반 children, DOM 객체 재사용, fixture 전체, 에러 처리 |
| `tests/reconcile/phase2/` | 이동 횟수 기준표, key vs 인덱스 비교, key 없는 자식 짝짓기, 중복 key, 포커스·입력값 보존, 배치 기준점 |
| `tests/reconcile/diff.test.js`, `patch.test.js` | 공개 API 수준의 diff / patch 요약 테스트 (fixture 전체 포함) |
| `tests/playground/` | 검증 페이지(`src/playground/verify/`)의 히스토리·파싱·직렬화·patch 일치 |

```bash
docker compose run --rm -T dev npx vitest run --exclude ".worktrees/**" tests/reconcile
```

브라우저 검증: `src/playground/`(fixture별 before → after)와 `src/playground/verify/`(편집기 + 히스토리 + Patch 로그).

결함 주입으로 테스트를 검증했다. 아래 6가지 변형 각각에 대해 1개 이상의 테스트가 실패한다: key 무시(인덱스 비교), 항상 REPLACE, 제거된 prop 미삭제, 텍스트 미갱신, 이전 이벤트 핸들러 미제거, 미사용 old 자식 미삭제.

## 9. 미지원

- 컴포넌트·상태·Hooks (README 다음 Phase — 이 `diff`/`patch` 위에 "이전 VNode 보관 + 재렌더 시 diff/patch"로 연결)
- Fragment, Portal, 여러 루트, SVG/MathML
- `className` 별칭, `style` 객체, `value`/`checked` 프로퍼티(제어 입력)
- 이벤트 위임·합성 이벤트·캡처/옵션
- 하이드레이션(파싱한 원본 DOM에 바로 patch)
- 최소 이동(LIS) 최적화
