/**
 * props에서 children을 뺀 HTML 속성만 돌려준다. (docs/contracts.md 1.1)
 * @param {object} props 요소 VNode의 props
 * @returns {Object<string, string>} 새 객체 (props는 수정하지 않음)
 */
export function getAttributes(props) {
  const { children, ...attrs } = props;
  return attrs;
}
