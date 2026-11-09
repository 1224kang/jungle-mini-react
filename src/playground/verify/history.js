/**
 * VNode 히스토리 (브라우저 히스토리 방식). DOM을 다루지 않는다.
 *
 * 불변성 정책 (요구 7.2)
 * - 저장 전에 VNode가 "순수 데이터"인지 검사한다: 문자열/배열/plain object만 허용.
 *   함수(이벤트 핸들러), DOM 노드, 클래스 인스턴스 등 복제·비교가 어려운 값이 있으면 에러.
 * - 검사를 통과한 값만 직접 깊은 복사한 뒤 Object.freeze로 얼린다.
 *   (structuredClone/JSON을 무조건 쓰지 않는 이유: 함수·DOM 참조를 조용히 버리거나 에러 위치를 알려주지 않음)
 * - 얼린 스냅샷을 diff/patch가 수정하려 하면 ES 모듈(strict mode)에서 TypeError가 나므로 훼손이 즉시 드러난다.
 */

/**
 * VNode가 순수 데이터인지 검사한다. 문제가 있으면 위치가 담긴 에러를 던진다.
 * @param {unknown} value
 * @param {string} [where]
 */
export function assertPlainVNode(value, where = 'vnode') {
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertPlainVNode(item, `${where}[${i}]`));
    return;
  }
  if (value === null || typeof value !== 'object') {
    // key: null 은 허용
    if (value === null && /\.key$/.test(where)) return;
    throw new TypeError(`히스토리에 저장할 수 없는 값: ${where} (${value === null ? 'null' : typeof value})`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(`히스토리에 저장할 수 없는 값: ${where} (plain object가 아님: ${value.constructor?.name ?? '알 수 없음'})`);
  }
  for (const k of Object.keys(value)) assertPlainVNode(value[k], `${where}.${k}`);
}

/** 검사된 순수 데이터를 깊은 복사하고 얼린다. */
function freezeCopy(value) {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  // fromEntries: "__proto__" 같은 속성 이름도 own 속성으로 보존한다.
  return Object.freeze(Object.fromEntries(Object.keys(value).map((k) => [k, freezeCopy(value[k])])));
}

/**
 * VNode를 검사 후 불변 스냅샷으로 만든다.
 * @param {object} vnode
 * @returns {object} 얼린 깊은 복사본
 */
export function snapshot(vnode) {
  assertPlainVNode(vnode);
  return freezeCopy(vnode);
}

/**
 * @param {object} initial 첫 VNode (history[0])
 */
export function createHistory(initial) {
  const entries = [snapshot(initial)];
  let index = 0;

  return {
    get index() { return index; },
    get length() { return entries.length; },
    get canBack() { return index > 0; },
    get canForward() { return index < entries.length - 1; },
    /** 현재 위치의 스냅샷 */
    current() { return entries[index]; },
    /** i번째 스냅샷 (범위 밖이면 undefined) */
    at(i) { return entries[i]; },
    /**
     * 새 스냅샷을 저장한다. 현재 위치가 마지막이 아니면 그 뒤 기록을 버린다.
     * @returns {object} 저장된 스냅샷
     */
    push(vnode) {
      const snap = snapshot(vnode);
      entries.splice(index + 1);
      entries.push(snap);
      index = entries.length - 1;
      return snap;
    },
    /** 이동할 스냅샷을 미리 본다. 이동할 수 없으면 null. */
    peek(step) {
      const next = index + step;
      return next >= 0 && next < entries.length ? entries[next] : null;
    },
    /** i번째로 이동한다. 범위 밖이면 이동하지 않고 null. */
    goTo(i) {
      if (!Number.isInteger(i) || i < 0 || i >= entries.length) return null;
      index = i;
      return entries[index];
    },
    /** 한 칸 뒤로. 맨 앞이면 이동하지 않고 null. */
    back() {
      if (index === 0) return null;
      index -= 1;
      return entries[index];
    },
    /** 한 칸 앞으로. 맨 뒤면 이동하지 않고 null. */
    forward() {
      if (index === entries.length - 1) return null;
      index += 1;
      return entries[index];
    },
  };
}
