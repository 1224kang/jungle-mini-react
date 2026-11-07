# 데이터 계약

`lib` 내부 모듈(vdom / dom / reconcile)이 주고받는 데이터 형식입니다.
구현을 바꾸더라도 이 계약은 깨지 않습니다.

## VNode

| 종류 | 형태 |
|---|---|
| 요소 | `{ type: 'div', props: { ... }, children: VNode[] }` |
| 텍스트 | `{ type: '#text', value: string }` |

- `type`이 `'#text'`이면 텍스트 노드이고, 그 외에는 소문자 태그 이름입니다.
- `props`는 속성 이름 → 문자열 값의 평범한 객체입니다. 속성이 없으면 `{}`입니다.
- `children`은 항상 배열입니다. 자식이 없으면 `[]`입니다.

## Patch

`diff(oldVNode, newVNode)`는 `Patch[]`를 반환하고, `patch(rootDom, patches)`가 이를 실제 DOM에 반영합니다.

`path`는 **루트로부터의 자식 인덱스 배열**입니다. 예: `[0, 2]` = 루트의 0번째 자식의 2번째 자식. 루트 자신은 `[]`입니다.

| type | 의미 | 필드 | 설명 |
|---|---|---|---|
| `CREATE` | 새 노드 추가 | `path`, `node` | `path`의 마지막 값은 삽입될 인덱스, 나머지는 부모 경로. `node`는 추가할 VNode |
| `REMOVE` | 노드 삭제 | `path` | 삭제할 노드의 경로 |
| `REPLACE` | 노드 교체 (태그가 다른 경우) | `path`, `node` | 교체할 노드의 경로와 새 VNode |
| `TEXT` | 텍스트 변경 | `path`, `value` | 텍스트 노드의 경로와 새 문자열 |
| `PROPS` | 속성 변경 | `path`, `set`, `remove` | `set`: 추가·변경할 `{ 이름: 값 }`, `remove`: 삭제할 속성 이름 `string[]` |

```js
{ type: 'CREATE',  path: [0, 2], node: { type: 'li', props: {}, children: [] } }
{ type: 'REMOVE',  path: [0, 1] }
{ type: 'REPLACE', path: [0],    node: { type: 'p', props: {}, children: [] } }
{ type: 'TEXT',    path: [0, 0], value: '새 텍스트' }
{ type: 'PROPS',   path: [0],    set: { class: 'on' }, remove: ['id'] }
```

### 규칙

- 한 `Patch` 배열 안에서 같은 부모의 `CREATE` / `REMOVE`가 섞이면 인덱스가 밀리므로, 적용 순서(예: REMOVE는 뒤에서부터)는 `diff`와 `patch` 구현이 일관되게 정합니다.
- 루트 경로 `[]`에 대한 `REPLACE`는 `rootDom.replaceWith()`로 처리할 수 있습니다 (`rootDom`이 부모를 가진 경우).
- `diff`는 순수 함수이며 DOM에 의존하지 않습니다. 입력은 VNode 두 개, 출력은 위 형식의 객체뿐입니다.
