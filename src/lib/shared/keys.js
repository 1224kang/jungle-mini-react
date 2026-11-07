/**
 * 형제 VNode 사이에 중복된 key가 있으면 console.warn을 띄운다. (docs/contracts.md 1.3)
 * key가 null인 요소와 텍스트 VNode는 검사하지 않는다.
 * @param {object[]} children 정규화된 자식 VNode 목록
 * @param {string} parentType 경고 메시지에 쓸 부모 태그 이름
 */
export function warnDuplicateKeys(children, parentType) {
  const seen = new Set();
  for (const child of children) {
    const key = child.key;
    if (key === null || key === undefined) continue;
    if (seen.has(key)) {
      console.warn(`[mini-react] <${parentType}>의 자식 key "${key}"가 중복됩니다. 형제끼리 key는 고유해야 합니다.`);
    }
    seen.add(key);
  }
}
