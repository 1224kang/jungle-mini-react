import { invalidInputError } from '../shared/index.js';

// 요소별로 등록한 이벤트 핸들러 기록: element -> { 이벤트이름: 함수 }
// 왜 WeakMap: 핸들러 교체/제거 때 "이전 함수"를 알아야 removeEventListener를 부를 수 있다.
// VNode나 DOM에 참조를 붙이지 않고(docs/diff-patch.md 2장: VNode는 순수 데이터), 요소가 사라지면 기록도 함께 GC된다.
const handlers = new WeakMap();

/** 이벤트 이름 규칙인가? (on으로 시작). 값이 함수인지는 따로 본다. */
function isEventName(name) {
  return name.startsWith('on') && name.length > 2;
}

const eventTypeOf = (name) => name.slice(2).toLowerCase();

/** 기록된 핸들러가 있으면 리스너를 떼고 기록을 지운다. 지웠으면 true. */
function clearHandler(el, name) {
  const record = handlers.get(el);
  const type = eventTypeOf(name);
  if (!record || !(type in record)) return false;
  el.removeEventListener(type, record[type]);
  delete record[type];
  return true;
}

/**
 * 속성 또는 이벤트 핸들러 하나를 요소에 적용한다. (docs/diff-patch.md 3장 이벤트)
 * - 문자열: setAttribute. 이전에 같은 이벤트의 함수 핸들러가 있었으면 먼저 뗀다.
 * - on* + 함수: addEventListener. 이전 함수가 있으면 먼저 뗀다(같은 함수면 아무것도 안 함).
 *   이전에 같은 이름의 문자열 속성이 있었으면 지운다. 함수는 setAttribute로 쓰지 않는다.
 * @param {Element} el
 * @param {string} name
 * @param {string|Function} value
 */
export function setProp(el, name, value) {
  if (typeof value === 'function') {
    if (!isEventName(name)) throw invalidInputError(`함수 값은 on* 이름의 prop만 가능 (props.${name})`);
    const type = eventTypeOf(name);
    const record = handlers.get(el) ?? {};
    if (record[type] === value) return;
    if (record[type]) el.removeEventListener(type, record[type]);
    else if (el.hasAttribute(name)) el.removeAttribute(name);
    el.addEventListener(type, value);
    record[type] = value;
    handlers.set(el, record);
    return;
  }
  if (isEventName(name)) clearHandler(el, name);
  el.setAttribute(name, value);
}

/**
 * 속성 또는 이벤트 핸들러 하나를 제거한다.
 * 함수 핸들러로 등록된 이름이면 리스너만 떼고(속성은 애초에 없다), 아니면 removeAttribute.
 * @param {Element} el
 * @param {string} name
 */
export function removeProp(el, name) {
  if (isEventName(name) && clearHandler(el, name)) return;
  el.removeAttribute(name);
}
