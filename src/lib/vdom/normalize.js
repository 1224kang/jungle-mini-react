import { TEXT_TYPE } from '../shared/index.js';

/** 텍스트 VNode를 만든다. */
export const createTextVNode = (value) => ({ type: TEXT_TYPE, value });

/**
 * ④ 인접한 문자열을 하나로 합치고 빈 문자열을 버린다. (docs/contracts.md 2.1)
 * 항목은 문자열(텍스트 조각) 또는 요소 VNode다. 합쳐진 문자열마다 transform을 거친 뒤
 * 빈 문자열이 아니면 텍스트 VNode로 만든다.
 * @param {Array<string|object>} items
 * @param {(text: string) => string} [transform] 합쳐진 텍스트에 적용할 규칙 (domToVdom의 ②)
 * @returns {object[]} 정규화된 자식 VNode 목록
 */
export function mergeText(items, transform = (s) => s) {
  const result = [];
  let buffer = null;
  const flush = () => {
    if (buffer === null) return;
    const value = transform(buffer);
    if (value !== '') result.push(createTextVNode(value));
    buffer = null;
  };
  for (const item of items) {
    if (typeof item === 'string') {
      buffer = (buffer ?? '') + item;
    } else {
      flush();
      result.push(item);
    }
  }
  flush();
  return result;
}
