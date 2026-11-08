// ═══════════════════════════════════════════════════════════════════════════
//  Mini React — 학습용 한 파일 (Phase 1 + Phase 2)
//
//  읽는 순서 (위에서 아래로):
//
//  ┌─ [Phase 1] Virtual DOM · Diff · Patch ─────────────────────────────────┐
//  │ 1-1  Virtual DOM     h(), domToVNode()    실제 DOM → 가벼운 JS 객체 트리 │
//  │ 1-2  DOM 만들기       createDOM()         Virtual DOM → 실제 DOM         │
//  │ 1-3  Diff            diff()               옛 트리와 새 트리 비교 → 패치 목록 │
//  │ 1-4  Patch           applyPatches()       패치 목록 → 실제 DOM 에 반영   │
//  │ 1-5  State History   StateHistory         Virtual DOM 기록 (뒤로/앞으로) │
//  └────────────────────────────────────────────────────────────────────────┘
//  ┌─ [Phase 2] Component · State · Hooks ──────────────────────────────────┐
//  │ 2-1  자식 컴포넌트 전개 expand()           h(Card, props) → 태그 트리     │
//  │ 2-2  FunctionComponent  hooks / mount / update   ★ Phase 1 을 불러 씀    │
//  │ 2-3  Hooks           useState, useEffect, useMemo                       │
//  └────────────────────────────────────────────────────────────────────────┘
//
//  Virtual DOM 노드의 모양:  { type: 'div', props: { id: 'a' }, children: [ ... ] }
//  텍스트 노드는 문자열 그대로입니다.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// [Phase 1] 1-1. Virtual DOM
// ───────────────────────────────────────────────────────────────────────────

// Virtual DOM 노드를 만듭니다.  h('p', { id: 'a' }, '안녕', h('b', null, '!'))
// - 숫자는 글자로, null / undefined / true / false 는 버리고, 배열은 펼칩니다.
// - type 에 함수를 주면 컴포넌트입니다 (Phase 2 의 expand 가 풀어 줍니다).
export function h(type, props, ...children) {
  const kids = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && typeof c !== 'boolean')
    .map((c) => (typeof c === 'number' ? String(c) : c));
  return { type, props: props ?? {}, children: kids };
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

// 실제 DOM → Virtual DOM.  (과제: "브라우저의 DOM 정보를 읽어서 Virtual DOM 으로 변환")
// 공백뿐인 글자와 주석은 버립니다. 그래서 DOM 에서도 미리 지워 둬야 자식 인덱스가 맞습니다 → removeBlankNodes.
export function domToVNode(node) {
  if (node.nodeType === TEXT_NODE) return node.nodeValue;
  const props = {};
  for (const attr of node.attributes) props[attr.name] = attr.value;
  const children = [];
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE && child.nodeValue.trim() !== '') children.push(child.nodeValue);
    if (child.nodeType === ELEMENT_NODE) children.push(domToVNode(child));
  }
  return { type: node.nodeName.toLowerCase(), props, children };
}

// 공백뿐인 글자 노드와 주석을 DOM 에서 지웁니다 (domToVNode 가 버리는 것과 같은 것들).
export function removeBlankNodes(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === ELEMENT_NODE) removeBlankNodes(child);
    else if (child.nodeType !== TEXT_NODE || child.nodeValue.trim() === '') child.remove();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// [Phase 1] 1-2. Virtual DOM → 실제 DOM
// ───────────────────────────────────────────────────────────────────────────

// 실제 DOM 노드 하나를 만듭니다 (자식까지 재귀).
export function createDOM(vnode) {
  if (typeof vnode === 'string') return document.createTextNode(vnode);
  const el = document.createElement(vnode.type);
  for (const child of vnode.children) el.appendChild(createDOM(child));
  // 속성은 자식을 붙인 뒤에 넣습니다 (<select value> 는 <option> 이 있어야 선택되기 때문).
  for (const [name, value] of Object.entries(vnode.props)) setProp(el, name, value);
  return el;
}

// 속성 하나를 요소에 적용합니다. value === null 이면 "지우기" 입니다.
// createDOM(새 노드)과 applyPatches(PROPS 패치)가 함께 씁니다.
//   onClick={fn}   → el.onclick = fn   (이벤트: 요소의 on* 프로퍼티에 함수를 넣으면 최신 함수로 교체됨)
//   value/checked  → DOM 프로퍼티로 넣어야 화면이 바뀜 (setAttribute 는 "초기값" 만 바꿈)
//   false/null     → 속성 제거,  true → 속성만 있음(disabled="")
//   className      → class
function setProp(el, name, value) {
  if (name.startsWith('on')) {
    el[name.toLowerCase()] = typeof value === 'function' ? value : null; // 문자열 핸들러(onclick="...")는 무시
  } else if ((name === 'value' || name === 'checked') && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
    const next = value ?? (name === 'checked' ? false : '');
    if (el[name] !== next) el[name] = next; // 같으면 건드리지 않음 (입력 중 커서가 튀지 않게)
  } else {
    const attr = name === 'className' ? 'class' : name;
    if (value === null || value === undefined || value === false) el.removeAttribute(attr);
    else el.setAttribute(attr, value === true ? '' : String(value));
  }
}

// ───────────────────────────────────────────────────────────────────────────
// [Phase 1] 1-3. Diff — 옛 Virtual DOM 과 새 Virtual DOM 비교
//
// DOM 은 건드리지 않고 "무엇이 달라졌는지" 패치 목록만 만드는 순수 함수입니다.
// 패치의 path 는 "옛 트리" 기준 자식 인덱스 경로입니다 (루트 = [], 첫째 자식의 둘째 자식 = [0, 1]).
//
// 5가지 핵심 변화                    패치
//   1) 텍스트가 바뀜                 TEXT      { value }
//   2) 속성이 바뀜                   PROPS     { set: {바뀐/추가된}, remove: [없어진 이름] }
//   3) 태그(타입)가 바뀜             REPLACE   { value: 새 노드 }  통째로 교체 (자식은 더 안 봄)
//   4) 자식이 새로 생김              CHILDREN  { plan } 안의 { create: 새 노드 }
//   5) 자식이 사라짐                 REMOVE
//   (+) key 리스트의 순서 변경        CHILDREN  { plan } 의 순서
// ───────────────────────────────────────────────────────────────────────────

export function diff(oldNode, newNode, path = []) {
  // 글자가 끼어 있는 경우: 같으면 변화 없음, 둘 다 글자면 TEXT, 글자 ↔ 요소면 REPLACE
  if (typeof oldNode === 'string' || typeof newNode === 'string') {
    if (oldNode === newNode) return [];
    const bothText = typeof oldNode === typeof newNode;
    return [{ op: bothText ? 'TEXT' : 'REPLACE', path, value: newNode }];
  }
  // 태그가 다르면 통째로 교체
  if (oldNode.type !== newNode.type) return [{ op: 'REPLACE', path, value: newNode }];

  // 같은 태그: 속성 비교 + 자식 비교
  return [...diffProps(oldNode.props, newNode.props, path), ...diffChildren(oldNode.children, newNode.children, path)];
}

function diffProps(oldProps, newProps, path) {
  const set = {};
  const remove = [];
  for (const k of Object.keys(newProps)) if (oldProps[k] !== newProps[k]) set[k] = newProps[k]; // 함수는 매번 새 함수라 항상 "바뀜" → 최신 핸들러로 교체됨
  for (const k of Object.keys(oldProps)) if (!(k in newProps)) remove.push(k);
  return Object.keys(set).length || remove.length ? [{ op: 'PROPS', path, set, remove }] : [];
}

const keyOf = (v) => (typeof v === 'string' ? undefined : v.props.key);

// 자식 비교. 새 자식마다 "옛 자식 중 누구와 짝인가" 를 찾습니다.
//   key 가 있으면 같은 key 끼리, 없으면 같은 자리(인덱스)끼리.
// 짝이 있으면 그 둘을 재귀로 diff, 짝이 없는 새 자식은 create, 짝이 없는 옛 자식은 REMOVE.
// 마지막에 "새 순서대로 놓아라" 는 plan 을 CHILDREN 패치 하나로 남깁니다 (놓을 게 없으면 생략).
function diffChildren(oldKids, newKids, path) {
  const patches = [];
  const used = new Set(); // 이미 짝이 정해진 옛 자식 인덱스

  const plan = newKids.map((kid, j) => {
    const i = findMatch(oldKids, kid, j, used);
    if (i === -1) return { create: kid };
    used.add(i);
    patches.push(...diff(oldKids[i], kid, [...path, i]));
    return { from: i };
  });

  oldKids.forEach((_, i) => {
    if (!used.has(i)) patches.push({ op: 'REMOVE', path: [...path, i] });
  });

  // plan 이 필요한가? 새로 만들 게 있거나, 옛 순서와 달라졌을 때만.
  const froms = plan.filter((p) => 'from' in p).map((p) => p.from);
  const sameOrder = froms.every((f, k) => k === 0 || f > froms[k - 1]);
  if (plan.some((p) => 'create' in p) || !sameOrder) patches.push({ op: 'CHILDREN', path, plan });

  return patches;
}

function findMatch(oldKids, kid, j, used) {
  const key = keyOf(kid);
  if (key !== undefined) return oldKids.findIndex((o, i) => !used.has(i) && keyOf(o) === key);
  const samePlace = j < oldKids.length && !used.has(j) && keyOf(oldKids[j]) === undefined;
  return samePlace ? j : -1;
}

// ───────────────────────────────────────────────────────────────────────────
// [Phase 1] 1-4. Patch — 패치 목록을 실제 DOM 에 반영
//
// mount 의 첫 자식이 트리의 루트입니다. 돌려주는 touched 는 "실제로 건드린 DOM 노드" 목록입니다
// (화면에 노랗게 깜빡이는 용도).
//
// 순서가 중요합니다 (지우거나 옮기면 인덱스가 밀리기 때문):
//   ① 모든 path 를 노드로 먼저 바꿔 둔다 (DOM 이 아직 옛 상태일 때)
//   ② 글자·속성 → ③ 태그 교체 → ④ 삭제 → ⑤ 자식 배치
// ───────────────────────────────────────────────────────────────────────────

function nodeAt(mount, path) {
  let node = mount.firstChild;
  for (const i of path) node = node.childNodes[i];
  return node;
}

export function applyPatches(mount, patches) {
  const touched = [];
  const replaced = new Map(); // 교체된 옛 노드 → 새 노드 (⑤ 에서 필요)

  // ① 대상 노드를 먼저 전부 잡아 둔다. CHILDREN 은 옛 자식 목록도 함께 기억한다.
  const jobs = patches.map((p) => {
    const node = nodeAt(mount, p.path);
    return { p, node, oldKids: p.op === 'CHILDREN' ? [...node.childNodes] : null };
  });

  const run = {
    TEXT({ p, node }) {
      node.textContent = p.value;
      touched.push(node);
    },
    PROPS({ p, node }) {
      for (const name of p.remove) setProp(node, name, null);
      for (const [name, value] of Object.entries(p.set)) setProp(node, name, value);
      // 이벤트 핸들러만 바뀐 경우는 화면이 안 바뀌므로 "건드린 노드" 로 세지 않는다
      const visible = p.remove.length > 0 || Object.values(p.set).some((v) => typeof v !== 'function');
      if (visible) touched.push(node);
    },
    REPLACE({ p, node }) {
      const fresh = createDOM(p.value);
      node.replaceWith(fresh);
      replaced.set(node, fresh);
      touched.push(fresh);
    },
    REMOVE({ node }) {
      touched.push(node.parentNode);
      node.remove();
    },
    // plan 의 순서대로 앞에서부터 자리를 맞춥니다. 이미 그 자리에 있는 노드는 움직이지 않습니다.
    CHILDREN({ p, node: parent, oldKids }) {
      p.plan.forEach((entry, j) => {
        const child = 'create' in entry ? createDOM(entry.create) : (replaced.get(oldKids[entry.from]) ?? oldKids[entry.from]);
        if (parent.childNodes[j] !== child) {
          parent.insertBefore(child, parent.childNodes[j] ?? null);
          touched.push(child);
        }
      });
    },
  };

  for (const op of ['TEXT', 'PROPS', 'REPLACE', 'REMOVE', 'CHILDREN']) {
    for (const job of jobs) if (job.p.op === op) run[op](job);
  }
  return touched;
}

// ───────────────────────────────────────────────────────────────────────────
// [Phase 1] 1-5. State History — Virtual DOM 스냅샷을 배열 + 커서로 저장
// 저장할 때와 꺼낼 때 모두 깊은 복사를 해서 과거 기록이 바뀌지 않게 합니다.
// (함수가 든 props 는 복사할 수 없으므로 Phase 1 데모용입니다.)
// ───────────────────────────────────────────────────────────────────────────

export class StateHistory {
  constructor(initial) {
    this.items = [structuredClone(initial)];
    this.cursor = 0;
  }
  push(snapshot) {
    this.items = this.items.slice(0, this.cursor + 1); // 커서 뒤(되돌린 미래)는 버림
    this.items.push(structuredClone(snapshot));
    this.cursor = this.items.length - 1;
  }
  back() {
    if (this.cursor > 0) this.cursor--;
    return this.current();
  }
  forward() {
    if (this.cursor < this.items.length - 1) this.cursor++;
    return this.current();
  }
  current() {
    return structuredClone(this.items[this.cursor]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [Phase 2] 2-1. 자식 컴포넌트 전개
//
// h(TodoItem, { todo }) 처럼 type 이 "함수" 인 노드를 그 함수 호출 결과로 바꿔 끼웁니다.
// 끝나면 type 이 전부 태그 이름(문자열)이라서 Phase 1 의 diff / applyPatches 를 그대로 씁니다.
//
// 과제 제약: 자식 컴포넌트는 상태 없이 props 만 받는 순수 함수입니다.
// 자식을 부르는 동안 childDepth > 0 이라서, 그 안에서 Hook 을 부르면 오류가 납니다 (useSlot 참고).
// ═══════════════════════════════════════════════════════════════════════════

let childDepth = 0;

function expand(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''; // 아무것도 안 그림 (빈 글자)
  if (typeof node === 'number') return String(node);
  if (typeof node === 'string') return node;

  if (typeof node.type === 'function') {
    const { key, ...props } = node.props;
    childDepth++;
    let out;
    try {
      out = expand(node.type({ ...props, children: node.children })); // 자식 컴포넌트 호출: props 만 받음
    } finally {
      childDepth--;
    }
    // 리스트에서 <Item key=...> 로 준 key 를 결과 요소로 옮겨 줍니다 (diff 가 key 로 짝짓기 때문)
    if (key !== undefined && typeof out === 'object') out.props = { ...out.props, key };
    return out;
  }
  return { type: node.type, props: node.props, children: node.children.map(expand) };
}

// ═══════════════════════════════════════════════════════════════════════════
// [Phase 2] 2-2. FunctionComponent
//
// 핵심 질문: "함수는 매번 새로 실행되는데, 상태는 어떻게 유지할까?"
// 답: 상태는 함수 안에 두지 않고 이 클래스의 hooks 배열에 둡니다.
//     Hook 은 "몇 번째로 불렸는가" 로 자기 칸을 찾습니다. (그래서 Hook 은 조건문 안에 쓰면 안 됩니다)
//
// 렌더 루프 (setState 가 불리면):
//   update() ─ ① 함수를 처음부터 다시 실행 → 새 Virtual DOM            (render)
//            ─ ② diff(이전 Virtual DOM, 새 Virtual DOM) → applyPatches   (commit: Phase 1 그대로)
//            ─ ③ DOM 이 바뀐 "뒤에" useEffect 들을 실행                  (effects)
// ═══════════════════════════════════════════════════════════════════════════

let current = null; // 지금 렌더 중인 FunctionComponent (Hook 이 hooks 배열을 찾을 때 씀)

export class FunctionComponent {
  // fn: 루트 함수형 컴포넌트 (props) => VNode.   Hook 은 이 루트에서만 쓸 수 있습니다.
  // options.batch: true 면 같은 틱의 setState 여러 번을 모아 렌더 1번만 합니다 (선택 과제).
  // options.onCommit({ patches, touched, tree, isMount }): 화면에 반영한 직후 부름 (데모의 디버그 표시용).
  constructor(fn, { props = {}, batch = true, onCommit } = {}) {
    this.fn = fn;
    this.props = props;
    this.batch = batch;
    this.onCommit = onCommit;

    this.hooks = []; // ★ 상태 저장소. 칸 번호 = Hook 이 불린 순서
    this.index = 0; // 이번 렌더에서 몇 번째 Hook 인가
    this.effects = []; // 이번 렌더에서 예약된 useEffect 실행 목록
    this.tree = null; // 마지막으로 화면에 그린 Virtual DOM (= 다음 diff 의 "옛 트리")
    this.container = null;
    this.mounted = false;
    this.rendering = false;
    this.queued = false; // 배치된 update 가 대기 중인가
  }

  // 처음 렌더: container 안에 통째로 그립니다.
  mount(container) {
    this.container = container;
    this.mounted = true;
    this.update();
    return this;
  }

  // 다시 렌더: 새 Virtual DOM → Diff → Patch (Phase 1 연결 지점)
  update() {
    this.queued = false;
    this.index = 0;
    this.effects = [];

    // ① render: 함수를 처음부터 다시 실행. 이때 current 가 이 컴포넌트라서 Hook 이 hooks 배열을 씁니다.
    current = this;
    this.rendering = true;
    let tree;
    try {
      tree = expand(this.fn(this.props));
    } finally {
      current = null;
      this.rendering = false;
    }

    // ② commit: 처음이면 통째로 만들고, 아니면 바뀐 부분만 실제 DOM 에 반영
    const isMount = this.tree === null;
    let patches = [];
    let touched = [];
    if (isMount) {
      this.container.replaceChildren(createDOM(tree));
    } else {
      patches = diff(this.tree, tree);
      touched = applyPatches(this.container, patches);
    }
    this.tree = tree;
    if (this.onCommit) this.onCommit({ patches, touched, tree, isMount });

    // ③ effects: 화면에 반영된 뒤에 실행 (effect 안에서 setState 해도 안전하도록 목록은 따로 들고 돈다)
    const effects = this.effects;
    for (const runEffect of effects) runEffect();
  }

  // setState 가 부릅니다: "상태가 바뀌었으니 다시 그려 주세요".
  scheduleUpdate() {
    if (!this.mounted) return; // unmount 뒤의 setState 는 무시
    if (this.rendering) throw new Error('렌더 중에는 setState 를 부를 수 없습니다. 이벤트나 useEffect 안에서 부르세요.');
    if (!this.batch) return this.update();
    if (this.queued) return; // 이미 대기 중 → 여러 setState 가 렌더 1번으로 합쳐짐 (batching)
    this.queued = true;
    queueMicrotask(() => this.queued && this.mounted && this.update());
  }

  // 컴포넌트 제거: 모든 useEffect 의 정리(cleanup) 함수를 실행하고 화면을 비웁니다.
  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    this.queued = false;
    for (const slot of this.hooks) if (typeof slot?.cleanup === 'function') slot.cleanup();
    this.container.replaceChildren();
    this.tree = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [Phase 2] 2-3. Hooks — 전부 hooks[칸 번호] 에 자기 기록을 둡니다
// ═══════════════════════════════════════════════════════════════════════════

// 이번 렌더의 "다음 칸 번호" 를 받습니다. Hook 사용 규칙을 여기서 검사합니다.
function useSlot(hookName) {
  if (childDepth > 0) {
    throw new Error(`${hookName}: Hook 은 루트 컴포넌트에서만 쓸 수 있습니다. 자식은 props 만 받으세요 (Lifting State Up).`);
  }
  if (!current) throw new Error(`${hookName}: Hook 은 루트 FunctionComponent 를 렌더하는 동안에만 부를 수 있습니다.`);
  return [current, current.index++];
}

// deps 가 바뀌었는가? (deps 를 안 주면 항상 바뀐 것으로 봅니다 = 매 렌더 실행)
function depsChanged(prev, next) {
  if (!next || !prev) return true;
  return prev.length !== next.length || next.some((d, i) => !Object.is(d, prev[i]));
}

// useState — hooks[i] = { value, set }
//   처음 부르면 initial 을 칸에 넣고, 다음 렌더부터는 칸의 값을 돌려줍니다.
//   set 이 하는 일: ① 칸의 값을 바꾸고 ② 컴포넌트에게 "다시 그려 줘" 라고 알립니다.
export function useState(initial) {
  const [c, i] = useSlot('useState');
  if (!c.hooks[i]) {
    const slot = { value: initial };
    slot.set = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next; // setState(prev => prev + 1) 지원
      if (Object.is(value, slot.value)) return; // 같은 값이면 다시 그리지 않음
      slot.value = value;
      c.scheduleUpdate();
    };
    c.hooks[i] = slot;
  }
  return [c.hooks[i].value, c.hooks[i].set];
}

// useEffect — 화면(DOM)이 바뀐 "뒤에" 실행할 일을 예약합니다. hooks[i] = { deps, cleanup }
//   deps 없음 → 매 렌더 / [] → 처음 한 번 / [a, b] → a 나 b 가 바뀔 때만
//   effect 가 함수를 돌려주면 그것이 cleanup: 다음 effect 실행 직전, 그리고 unmount 때 불립니다.
export function useEffect(effect, deps) {
  const [c, i] = useSlot('useEffect');
  const slot = c.hooks[i] ?? (c.hooks[i] = { deps: undefined, cleanup: undefined, ran: false });
  if (slot.ran && !depsChanged(slot.deps, deps)) return; // deps 가 같으면 이번엔 건너뜀
  c.effects.push(() => {
    if (typeof slot.cleanup === 'function') slot.cleanup(); // 이전 effect 정리
    const result = effect();
    slot.cleanup = typeof result === 'function' ? result : undefined;
    slot.deps = deps;
    slot.ran = true;
  });
}

// useMemo — 계산 결과를 칸에 저장해 두고, deps 가 같으면 다시 계산하지 않습니다. hooks[i] = { deps, value }
export function useMemo(compute, deps) {
  const [c, i] = useSlot('useMemo');
  const slot = c.hooks[i];
  if (slot && !depsChanged(slot.deps, deps)) return slot.value;
  c.hooks[i] = { deps, value: compute() };
  return c.hooks[i].value;
}
