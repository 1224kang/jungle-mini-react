// [Phase 2] props 한 개를 실제 DOM 요소에 적용하는 규칙 모음.
//   ◀ 부른 곳: dom/create.js (새 노드 만들 때), reconcile/patch.js (PROPS 패치)
// Phase 1 은 모든 props 를 setAttribute 로만 넣었습니다. Phase 2 에서는 아래가 더 필요합니다.
//   - onClick 같은 이벤트 핸들러 (함수)  → addEventListener 는 요소당 1번만, 최신 함수는 맵에 저장
//   - value / checked                    → 속성이 아니라 DOM 프로퍼티로 넣어야 화면이 바뀜 (제어 컴포넌트)
//   - true / false                       → disabled={false} 가 "false" 글자로 남지 않게
//   - className / htmlFor / style 객체   → class / for / cssText

const ALIAS = { className: 'class', htmlFor: 'for' };

// el.__mini : 이 요소에 붙여 둔 미니 리액트 기록
//   handlers   { onClick: { type: 'click', fn } }   최신 핸들러 (리렌더마다 교체)
//   listeners  { click: fn }                         실제로 addEventListener 한 함수 (요소당 이벤트 종류별 1개)
//   controlled { value, checked }                    "화면이 이 값이어야 한다" 는 기록 (제어 컴포넌트용)
function record(el) {
  if (!el.__mini) el.__mini = { handlers: {}, listeners: {}, controlled: {} };
  return el.__mini;
}

export function isEventProp(name, value) {
  return /^on[A-Z]/.test(name) || (name.startsWith('on') && typeof value === 'function');
}

const CHANGE_EVENT_TAGS = new Set(['SELECT']);
const CHANGE_EVENT_INPUT_TYPES = new Set(['checkbox', 'radio', 'file']);

// onChange 는 React 처럼 "입력할 때마다" 불리게 input 이벤트로 연결합니다 (체크박스/라디오/select 는 change).
function eventType(el, name) {
  const raw = name.slice(2).toLowerCase();
  if (raw !== 'change') return raw;
  if (CHANGE_EVENT_TAGS.has(el.tagName)) return 'change';
  if (el.tagName === 'INPUT' && CHANGE_EVENT_INPUT_TYPES.has(el.type)) return 'change';
  return 'input';
}

function setHandler(el, name, fn) {
  const rec = record(el);
  if (typeof fn !== 'function') {
    delete rec.handlers[name];
    return;
  }
  const type = eventType(el, name);
  rec.handlers[name] = { type, fn };
  if (rec.listeners[type]) return; // 이미 달려 있음 → 맵만 바뀌면 최신 함수가 불립니다
  const listener = (event) => {
    for (const h of Object.values(rec.handlers)) if (h.type === event.type) h.fn(event);
    // 제어 컴포넌트: 핸들러가 state 를 안 바꿨다면 사용자가 친 글자를 되돌립니다.
    // (setState 의 리렌더가 마이크로태스크로 먼저 끝난 뒤에 확인)
    queueMicrotask(() => syncControlled(el));
  };
  rec.listeners[type] = listener;
  el.addEventListener(type, listener);
}

function isFormControl(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

function isPropertyProp(el, name) {
  if (name === 'value') return isFormControl(el);
  if (name === 'checked') return el.tagName === 'INPUT';
  return false;
}

function setProperty(el, name, value) {
  const rec = record(el);
  if (value === null || value === undefined) {
    delete rec.controlled[name];
    if (name === 'value') el.value = '';
    else el.checked = false;
    return;
  }
  rec.controlled[name] = name === 'checked' ? Boolean(value) : String(value);
  syncControlled(el);
}

// 기록해 둔 value / checked 와 실제 화면 값을 맞춥니다. 같으면 건드리지 않아 커서가 튀지 않습니다.
export function syncControlled(el) {
  const c = el.__mini?.controlled;
  if (!c) return;
  if ('value' in c && el.value !== c.value) el.value = c.value;
  if ('checked' in c && el.checked !== c.checked) el.checked = c.checked;
}

function styleToText(style) {
  return Object.entries(style)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
    .join(';');
}

function setAttr(el, name, value) {
  const attr = ALIAS[name] ?? name;
  if (name === 'style' && value && typeof value === 'object') value = styleToText(value);
  if (value === null || value === undefined) {
    el.removeAttribute(attr);
  } else if (typeof value === 'boolean') {
    // aria-* / data-* 는 "true"/"false" 글자 그대로, 나머지(disabled 등)는 있음/없음
    if (attr.startsWith('aria-') || attr.startsWith('data-')) el.setAttribute(attr, String(value));
    else if (value) el.setAttribute(attr, '');
    else el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, String(value));
  }
}

function setOne(el, name, value) {
  if (isEventProp(name, value)) setHandler(el, name, value);
  else if (isPropertyProp(el, name)) setProperty(el, name, value);
  else setAttr(el, name, value);
}

// 새 요소: 일반 속성 먼저 (자식을 붙이기 전에).
export function applyAttrProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (!isEventProp(k, v) && !isPropertyProp(el, k)) setAttr(el, k, v);
  }
}

// 새 요소: value/checked 와 이벤트는 자식을 붙인 뒤에 (<select value> 는 <option> 이 있어야 선택됨).
export function applyLateProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (isEventProp(k, v) || isPropertyProp(el, k)) setOne(el, k, v);
  }
}

// PROPS 패치: 지울 것 → 일반 속성 → value/checked → 이벤트 순서.
// 반환: DOM 이 실제로 바뀌었는지 (이벤트 핸들러 교체만이면 false → 화면 깜빡임 없음)
export function patchProps(el, set, remove) {
  let domChanged = false;
  for (const name of remove) {
    if (isEventProp(name, null) || el.__mini?.handlers[name]) setHandler(el, name, null);
    else if (isPropertyProp(el, name)) {
      setProperty(el, name, null);
      domChanged = true;
    } else {
      setAttr(el, name, null);
      domChanged = true;
    }
  }
  const entries = Object.entries(set);
  for (const [k, v] of entries) {
    if (!isEventProp(k, v) && !isPropertyProp(el, k)) {
      setAttr(el, k, v);
      domChanged = true;
    }
  }
  for (const [k, v] of entries) {
    if (isPropertyProp(el, k)) {
      setOne(el, k, v);
      domChanged = true;
    }
  }
  for (const [k, v] of entries) if (isEventProp(k, v)) setOne(el, k, v);
  return domChanged;
}
