import { createElement, createTextNode } from './vnode.js';
import { runChildComponent } from '../hooks/dispatcher.js';

/**
 * 컴포넌트 안에서 VNode를 만드는 함수.
 *
 *   h('p', { class: 'msg' }, '안녕 ', name)
 *   → { type: 'p', props: { class: 'msg' }, children: [{#text '안녕 '}, {#text name}] }
 *
 *   h(CounterPanel, { count, onIncrease })
 *   → CounterPanel({ count, onIncrease, children: [] })를 바로 실행해 나온 VNode
 *
 * 자식 컴포넌트는 상태가 없는 순수 함수이므로 "인스턴스"를 만들 필요가 없다.
 * 그래서 함수를 즉시 실행해 일반 VNode로 펼친다. 실행하는 동안에는 훅 호출이 막힌다.
 */
export function h(type, props, ...children) {
  const normalized = normalizeChildren(children);

  if (typeof type === 'function') {
    return runChildComponent(type, { ...props, children: normalized });
  }
  return createElement(type, props ?? {}, normalized);
}

/**
 * 자식 목록을 VNode 배열로 정리한다.
 * - 배열은 펼친다 (items.map(...) 결과를 그대로 넣을 수 있게)
 * - 문자열·숫자 → 텍스트 VNode
 * - null, undefined, true, false → 건너뜀 (cond && h(...) 패턴용)
 */
export function normalizeChildren(children) {
  const result = [];
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    if (typeof child === 'string' || typeof child === 'number') {
      result.push(createTextNode(child));
    } else {
      result.push(child);
    }
  }
  return result;
}
