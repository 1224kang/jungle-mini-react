/**
 * VNode 일치 검사. DOM을 다루지 않는다.
 *
 * 정규화: 비교 대상은 둘 다 정규화된 VNode(docs/contracts.md 1~2장)라고 가정한다. 실제 DOM 쪽은
 * domToVdom()이 같은 규칙(주석 제거, 인접 텍스트 병합, 들여쓰기 공백 제거)으로 정규화한 결과를 넘긴다.
 * 속성 순서는 비교하지 않는다(docs/diff-patch.md 5장: 속성 순서는 보장하지 않음).
 * 값 정책: 문자열·null은 ===. 함수(이벤트 핸들러)는 HTML에서 다시 읽을 수 없으므로 "비교 불가" 차이로 보고한다.
 * 이 페이지의 VNode는 HTML에서 파싱하므로 함수가 들어오지 않는다(history.js가 저장 시 거부).
 */

/**
 * @returns {null | { path: string, reason: string }} 같으면 null, 다르면 첫 번째 차이
 */
export function firstDifference(expected, actual, path = 'root') {
  if (typeof expected === 'function' || typeof actual === 'function') {
    return { path, reason: '함수 값은 비교할 수 없음' };
  }
  if (expected === actual) return null;
  if (typeof expected !== 'object' || typeof actual !== 'object' || expected === null || actual === null) {
    return { path, reason: `${JSON.stringify(expected)} ≠ ${JSON.stringify(actual)}` };
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) return { path, reason: '배열/객체 형태가 다름' };
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) return { path, reason: `자식 수 ${expected.length} ≠ ${actual.length}` };
    for (let i = 0; i < expected.length; i++) {
      const d = firstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const k of keys) {
    if (!Object.hasOwn(expected, k)) return { path: `${path}.${k}`, reason: '기대값에 없는 속성이 실제에 있음' };
    if (!Object.hasOwn(actual, k)) return { path: `${path}.${k}`, reason: '실제에 속성이 없음' };
    const d = firstDifference(expected[k], actual[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

export const vnodeEqual = (a, b) => firstDifference(a, b) === null;
