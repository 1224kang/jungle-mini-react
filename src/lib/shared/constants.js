/** VNode의 type 상수. docs/contracts.md 1.1 참조. */
export const NODE_TYPE = Object.freeze({
  TEXT: '#text',
});

/** 텍스트 VNode의 type. */
export const TEXT_TYPE = NODE_TYPE.TEXT;

/** DOM nodeType 값 (docs/contracts.md 2.1 ①). */
export const DOM_NODE_TYPE = Object.freeze({
  ELEMENT: 1,
  TEXT: 3,
});

/** key와 대응하는 DOM 속성 이름 (docs/contracts.md 1.3). */
export const KEY_ATTRIBUTE = 'data-key';

/** 지원하는 요소의 네임스페이스. 이 밖(SVG, MathML)은 범위 밖 (docs/contracts.md 3장). */
export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** 공백 규칙(②)을 적용하지 않는 태그 목록. 조상까지 확인한다 (docs/contracts.md 2.2 ③). */
export const WHITESPACE_PRESERVE_TAGS = Object.freeze(['pre', 'textarea', 'script', 'style']);

/** Patch의 type 상수. docs/contracts.md 5장 참조. */
export const PATCH_TYPE = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  TEXT: 'TEXT',
  PROPS: 'PROPS',
});
