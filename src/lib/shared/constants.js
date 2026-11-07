/** VNode의 type 상수. docs/contracts.md 참조. */
export const NODE_TYPE = Object.freeze({
  TEXT: '#text',
});

/** Patch의 type 상수. docs/contracts.md 참조. */
export const PATCH_TYPE = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  TEXT: 'TEXT',
  PROPS: 'PROPS',
});
