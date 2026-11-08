# 데이터 계약

`lib` 내부 모듈(vdom / dom / reconcile)이 주고받는 데이터 형식입니다.
구현을 바꾸더라도 이 계약은 깨지 않습니다.
형식을 바꿔야 한다면 코드보다 이 문서를 먼저 수정하고 팀과 합의합니다.

---

## 1. VNode

### 1.1 모양

```js
// 요소 노드
{
  type: 'div',               // 태그 이름 (소문자)
  key: null,                 // 문자열 | null (항상 존재)
  props: {
    class: 'box',            // HTML 속성 (값은 항상 문자열)
    children: [ /* VNode */ ] // 항상 배열 (자식이 없으면 [])
  }
}

// 텍스트 노드 (key, props, children 없음)
{ type: '#text', value: 'hello' }
```

| 필드 | 규칙 |
|---|---|
| `type` | 요소는 소문자 태그 이름, 텍스트는 `'#text'` |
| `key` | 요소에만 존재. 문자열 또는 `null` |
| `props` | 요소에만 존재. HTML 속성과 `children`을 담음 |
| `props.children` | 요소에만 존재. 항상 배열 |
| `value` | 텍스트에만 존재. 빈 문자열이 아닌 문자열 |

- `children`은 속성이 아닙니다. 속성이 필요한 곳(diff, render, patch)에서는 `shared/`의 헬퍼로 추려 냅니다.
  ```js
  const { children, ...attrs } = vnode.props;
  ```

### 1.2 props (속성)

props는 **HTML 속성(attribute)을 그대로** 담습니다. 이름이나 값을 변환하지 않습니다.

| 항목 | 규칙 | 예시 |
|---|---|---|
| 이름 | HTML 속성 이름 그대로 | `class`, `for`, `data-id`, `aria-label` |
| 값 | 항상 문자열 | `maxlength: '10'` |
| 불리언 속성 | 있으면 `''`, 없으면 키 자체가 없음 | `disabled: ''` |
| style | 문자열 그대로 | `style: 'color: red; margin: 0'` |
| 이벤트 속성 | 일반 속성(문자열)으로 취급 | `onclick: 'alert(1)'` |

- `value`, `checked` 같은 **사용자 입력으로 바뀌는 실시간 상태는 다루지 않습니다.** (속성만 다룸, Phase 2)

### 1.3 key

- VNode **최상위**에 둡니다. props에 넣지 않습니다.
- 값은 문자열, 없으면 `null`입니다.
- 같은 부모 아래 형제끼리 key는 **고유해야 합니다.** 중복이면 `console.warn`을 띄웁니다. (`h`와 `domToVdom`이 자식 목록을 만들 때 검사)
- DOM과의 대응: `data-key` 속성
  - `domToVdom`: `data-key`를 읽어 `key`로 옮기고, props에서는 **제거**합니다.
  - `render`: `key`를 `data-key` 속성으로 씁니다.

---

## 2. 정규화 규칙

`domToVdom()`과 `h()`는 **어떤 입력이 들어와도 1장의 형식으로만** 내보냅니다.
diff, render, patch는 정규화된 VNode만 받는다고 가정하고, 엣지 케이스를 다시 확인하지 않습니다.

### 2.1 공통 규칙

| # | 규칙 |
|---|---|
| ① | 요소(nodeType 1)와 텍스트(nodeType 3)만 변환합니다. 나머지(주석 등)는 버립니다. |
| ④ | 인접한 텍스트는 하나로 합칩니다. 빈 문자열 텍스트는 버립니다. |

```html
<p>a<!-- 주석 -->b</p>              ← 주석 버림(①) 후 'a'+'b' → 'ab' (④)
```

### 2.2 `domToVdom(node)`

| # | 규칙 |
|---|---|
| ② | **공백만 있고 줄바꿈(`\n`)을 포함한 텍스트는 버립니다.** 같은 줄의 공백, 글자가 있는 텍스트는 그대로 둡니다 (trim 안 함). 공백은 HTML 공백 문자(스페이스, 탭, `\n`, `\r`, `\f`)이며 `&nbsp;`는 글자로 봅니다. |
| ③ | 텍스트의 **조상(루트로 넘겨받은 요소의 바깥 조상 포함)** 중에 `<pre>`, `<textarea>`, `<script>`, `<style>`이 하나라도 있으면 ②를 적용하지 않습니다. (예외 태그 목록 하나로 관리) |
| ⑤ | 넘겨받은 Element 자신부터 변환하고, 자식은 내부 재귀 함수로 처리합니다. |
| ⑥ | 입력 DOM을 **수정하지 않습니다.** (`normalize()` 등 사용 금지) |

- 공개 함수 `domToVdom(node)`는 **Element만** 받습니다. 입력 검사는 입구에서 한 번만 하고, 내부 재귀 함수는 export하지 않습니다.
- 같은 노드는 루트로 넘기든 자식으로 변환되든 결과가 같습니다. (③이 바깥 조상까지 보는 이유)

**자식 목록 처리 순서**: ① → ④ → ② → 빈 문자열 제거

1. ① Element와 Text가 아닌 노드(주석 등)를 버린다
2. ④ 그 결과 인접하게 된 텍스트를 하나로 합친다
3. ② 합쳐진 텍스트 단위로 공백 규칙을 판단한다 (③ 예외 적용)
4. 빈 문자열 텍스트를 버린다

②의 목적은 태그 사이의 들여쓰기 제거입니다. 주석은 화면에 보이지 않으므로, 판단 대상은 DOM 텍스트 노드 하나하나가 아니라 실제로 이어지는 텍스트 덩어리입니다.

```html
<ul>
  <li>A</li>                        ← 줄바꿈 + 들여쓰기: 버림 (②)
</ul>
<span>a</span> <span>b</span>       ← 같은 줄 공백: 남김 (②)
<p>a<!-- -->\n <!-- -->b</p>        ← 주석 버림(①) 후 'a'+'\n '+'b' → 'a\n b' (④ 후 ②: 글자가 있어 남김)
<div><span>x</span><!-- -->\n  <!-- --><span>y</span></div>
                                    ← 합쳐도 '\n  '뿐이므로 버림 → 자식은 span 2개
<pre><code><span>if</span>\n  <span>run</span>()</code></pre>
                                    ← 조상에 pre가 있으므로 '\n  ' 보존 (③)
```

### 2.3 `h(type, props, ...children)`

**type**
- 소문자로 바꿉니다. (`'DIV'` → `'div'`) 빈 문자열이나 문자열이 아닌 값은 에러입니다. (함수는 3장)
- `h()`는 요소만 만듭니다. 소문자로 바꾼 결과가 텍스트 예약 타입 `'#text'`이면 에러입니다. (`'#TEXT'`도 포함, 텍스트는 문자열 자식으로 만듦)

**props**
- `null` 또는 `undefined`이면 `{}`로 처리합니다.
- `key`를 꺼내 최상위로 옮기고 문자열로 바꿉니다. `null`/`undefined`이면 `null`, 문자열·숫자가 아니면 에러입니다.
- `data-key`도 `key`와 같게 취급해 최상위로 옮깁니다. (`domToVdom`과 같은 결과를 내기 위함) `key`와 `data-key`를 함께 주면 에러입니다.
- 값 변환: 숫자 등 → 문자열, `true` → `''`, `false`/`null`/`undefined` → 키 제거. 객체(배열 포함)는 에러입니다. (`'[object Object]'`로 조용히 바뀌는 것을 막음)
- 넘겨받은 props 객체는 **수정하지 않습니다.** (새 객체를 만듦)

**공백**
- 공백 규칙(②③)은 적용하지 않습니다. 문자열은 그대로 씁니다. (`h('p', null, '\n  ')`의 텍스트는 남음)
- 공백 정리는 HTML을 읽는 `domToVdom`의 몫입니다. (JSX 공백을 컴파일러가 정리하고 `createElement`는 받은 문자열을 그대로 쓰는 것과 같음)

**children**
- 나머지 인자가 하나라도 있으면 인자를 쓰고, 없으면 `props.children`을 씁니다.
- 값별 처리:

| 들어온 값 | 처리 |
|---|---|
| 문자열 | 텍스트 노드 (`''`이면 버림) |
| 숫자 | 문자열로 바꿔 텍스트 노드. **`0`도 남김** |
| `null`, `undefined`, `true`, `false` | 버림 |
| 배열 | 깊이에 상관없이 평탄화 |
| VNode 객체 | 그대로 사용 |
| 그 외 (함수, 일반 객체 등) | 에러 |

- 처리 순서: 자식 정리(위 표) → ④(인접 텍스트 합치기) → 빈 문자열 제거. 텍스트 VNode도 문자열과 같이 합칩니다.

```js
h('ul', { class: 'list', key: 1 }, [h('li', null, 'A'), null, false], 0, 'a', 'b')
// →
{
  type: 'ul', key: '1',
  props: { class: 'list', children: [
    { type: 'li', key: null, props: { children: [{ type: '#text', value: 'A' }] } },
    { type: '#text', value: '0ab' },
  ] },
}
```

### 2.4 `render(vnode)`

정규화된 VNode를 받아 실제 DOM 노드(`Node`)를 만들어 반환합니다. 입력을 다시 검사하지 않습니다.

| 대상 | 처리 |
|---|---|
| 텍스트 VNode | `document.createTextNode(value)` |
| 요소 VNode | `document.createElement(type)` |
| 속성 | `getAttributes(props)`로 `children`을 뺀 뒤 `setAttribute(이름, 값)` |
| key | `key`가 `null`이 아니면 `data-key` 속성으로 씀 |
| 자식 | 각 자식을 재귀로 `render`한 뒤 `appendChild` |

---

## 3. 범위 밖 (Phase 1에서 지원하지 않음)

범위 밖의 입력은 조용히 처리하지 않고 **즉시 에러를 던집니다** (fail fast).
에러 메시지 형식: `[mini-react] 지원하지 않음: <내용> (Phase 1 범위 밖)`

| 항목 | 들어왔을 때 |
|---|---|
| SVG, MathML | `domToVdom`이 `namespaceURI`를 확인해 에러 |
| `<template>` | `domToVdom`이 에러 |
| Element가 아닌 입력 (Text, document, fragment, 주석 등) | `domToVdom`이 에러 |
| 컴포넌트 (`type`이 함수) | `h()`가 에러 |
| `on*` 이름의 함수 prop | 에러 아님. 이벤트 핸들러로 허용하고 props에 그대로 둠 (`addEventListener`로 등록) |
| 그 밖의 이름의 함수 prop | `h()`가 에러 |
| Fragment | 만들 방법을 제공하지 않음 |
| `value`, `checked`의 실시간 상태 | 에러 아님. 속성으로만 다룸 |

범위 안이지만 형식이 잘못된 입력(2.3의 type·key·props 값 오류, 함수·일반 객체 자식 등)도 즉시 에러를 던집니다.
에러 메시지 형식: `[mini-react] 잘못된 입력: <내용>`

---

## 4. 검증 기준

모든 fixture 케이스에 대해 아래 두 성질이 성립해야 합니다.

1. **생성 일치**: 같은 구조라면 `h()`의 결과와 `domToVdom()`의 결과가 같다. (자식이 없는 요소 포함)
   ```js
   expect(domToVdom(parse('<p class="a">hi</p>'))).toEqual(h('p', { class: 'a' }, 'hi'));
   ```
2. **왕복 불변**: 다시 그리고 다시 읽어도 같다.
   ```js
   const v = domToVdom(dom);
   expect(domToVdom(render(v))).toEqual(v);
   ```

---

## 5. Patch

`diff(oldVNode, newVNode)`는 `Patch[]`를 반환하고, `patch(rootDom, patches)`가 이를 실제 DOM에 반영하고 **패치 후의 루트 DOM 노드를 반환**합니다. (루트가 REPLACE되면 새 노드, 아니면 `rootDom` 그대로. 반환값을 쓰지 않는 호출자는 영향 없음)

`path`는 **이전(old) VNode 트리 기준**의 자식 인덱스 배열입니다. 예: `[0, 2]` = 루트의 0번째 자식의 2번째 자식. 루트 자신은 `[]`입니다.
자식 인덱스는 정규화된 VNode의 `props.children` 기준입니다. patch가 실행되며 DOM의 인덱스가 바뀌어도 path는 old 좌표 그대로입니다.

| type | 의미 | 필드 | 설명 |
|---|---|---|---|
| `CREATE` | 새 노드 추가 | `path`, `node`, `before` | `path.slice(0,-1)`은 부모의 old 경로, 마지막 값은 새 자식 순서에서의 인덱스. `node`를 `render`해 `before` 앞에 삽입 |
| `REMOVE` | 노드 삭제 | `path` | old 경로의 노드를 삭제 |
| `REPLACE` | 노드 교체 (type 또는 key가 다른 경우) | `path`, `node` | old 경로의 노드를 `render(node)`로 교체. 하위는 비교하지 않음 |
| `TEXT` | 텍스트 변경 | `path`, `value` | 텍스트 노드의 경로와 새 문자열 |
| `PROPS` | 속성 변경 | `path`, `set`, `remove` | `set`: 추가·변경할 `{ 이름: 값 }`(값은 문자열 또는 `on*` 함수), `remove`: 삭제할 이름 `string[]` |
| `MOVE` | 노드 이동 | `path`, `index`, `before` | old 경로의 노드(같은 부모 안)를 새 순서 `index` 위치, `before` 앞으로 이동. (Phase 2 keyed diff가 만든다) |

`before`(배치 기준점):
- `null` → 부모의 맨 끝에 붙인다.
- `{ old: i }` → 같은 부모의 old 자식 `i`번(재사용되는 형제)의 DOM 노드 앞.
- `{ new: j }` → 같은 patch 목록에서 먼저 실행된 `CREATE`(같은 부모, 새 인덱스 `j`)가 만든 DOM 노드 앞.

```js
{ type: 'CREATE',  path: [0, 2], node: { type: 'li', key: null, props: { children: [] } }, before: null }
{ type: 'REMOVE',  path: [0, 1] }
{ type: 'REPLACE', path: [0],    node: { type: 'p', key: null, props: { children: [] } } }
{ type: 'TEXT',    path: [0, 0], value: '새 텍스트' }
{ type: 'PROPS',   path: [0],    set: { class: 'on', onclick: fn }, remove: ['id'] }
{ type: 'MOVE',    path: [0, 0], index: 3, before: null }
```

### 규칙

- **일괄 해석 후 실행**: `patch`는 DOM을 하나도 바꾸기 전에 모든 `path`와 `before.old`를 DOM 노드 참조로 해석합니다. 해석에 실패하거나(구조가 old 트리와 다름) 알 수 없는 type이면 DOM을 건드리기 전에 에러를 던집니다(부분 적용 없음). 실행은 해석한 참조로 배열 순서대로 합니다.
- **순서**: `diff`는 부모 단위로 ① 제거 ② 배치(`MOVE`/`CREATE`) ③ 재사용된 자식으로 재귀 순으로 배열에 넣고, `patch`는 배열 순서대로 실행합니다. 부모 자신의 `PROPS`는 그 앞에 와도 됩니다.
- 루트 경로 `[]`에 대한 `REPLACE`는 `rootDom.replaceWith()`로 처리하며 `rootDom`에 부모가 있어야 합니다(없으면 해석 단계에서 에러).
- `diff`는 순수 함수이며 DOM에 의존하지 않습니다. 입력은 VNode 두 개, 출력은 위 형식의 객체뿐입니다.
- `PROPS`는 HTML 속성과 `on*` 함수 핸들러만 다룹니다. `children`은 포함하지 않습니다 (`getAttributes`로 추려서 비교). `key`는 props에 없으므로 `PROPS`의 대상이 아닙니다.
- 함수 핸들러(`on*` + 함수)는 `addEventListener`로 등록하고, 교체·제거 시 이전 리스너를 먼저 뗍니다. `setAttribute`로 쓰지 않습니다.
- **keyed children (Phase 2)**: 자식은 `type`+`key`로 재사용하고 React식 lastPlacedIndex로 이동 여부를 정합니다. 배치(`MOVE`/`CREATE`)는 새 순서의 뒤에서부터 내며 `before`는 바로 다음 새 형제입니다. 중복 key의 두 번째 이후와 key 없는 자식은 key 없는 old 자식과 등장 순서대로 짝짓습니다. 맨 끝에 연속으로 생성되는 자식은 앞에서부터 `before: null`로 낼 수 있습니다(결과 동일).
