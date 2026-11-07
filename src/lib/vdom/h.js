/**
 * VNode를 만든다. 문자열/숫자 자식은 텍스트 VNode로 변환하는 것을 권장한다.
 * @param {string} type 태그 이름 (예: 'div')
 * @param {Object<string, string>|null} props 속성 객체
 * @param {...(object|string|number)} children 자식 VNode 또는 텍스트
 * @returns {{type: string, props: object, children: object[]}} 요소 VNode (docs/contracts.md 참조)
 */
export function h(type, props, ...children) {
  throw new Error('Not implemented: h');
}
