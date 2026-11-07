import {
  TEXT_TYPE,
  KEY_ATTRIBUTE,
  unsupportedError,
  invalidInputError,
  warnDuplicateKeys,
} from '../shared/index.js';
import { mergeText } from './normalize.js';

/**
 * 요소 VNode를 만든다. 어떤 입력이 들어와도 docs/contracts.md 1장의 형식으로만 내보낸다.
 * 공백 규칙(②③)은 적용하지 않는다. 문자열은 그대로 쓴다. (2.3)
 * @param {string} type 태그 이름 (소문자로 바뀜)
 * @param {object|null|undefined} props 속성 객체. key/data-key는 최상위 key로 옮겨진다.
 * @param {...*} children 자식 (문자열, 숫자, VNode, 배열, 버릴 값)
 * @returns {{type: string, key: string|null, props: object}} 요소 VNode
 */
export function h(type, props, ...children) {
  const source = props ?? {};
  const rawChildren = children.length > 0 ? children : source.children;

  const normalized = mergeText(collectChildren(rawChildren, []));
  const vnode = {
    type: normalizeType(type),
    key: extractKey(source),
    props: { ...normalizeProps(source), children: normalized },
  };
  warnDuplicateKeys(normalized, vnode.type);
  return vnode;
}

function normalizeType(type) {
  if (typeof type === 'function') throw unsupportedError(`컴포넌트 (type이 함수: ${type.name || '익명'})`);
  if (typeof type !== 'string' || type === '') {
    throw invalidInputError(`h()의 type은 비어 있지 않은 문자열이어야 함 (받은 값: ${describe(type)})`);
  }
  return type.toLowerCase();
}

function extractKey(props) {
  const hasKey = props.key !== undefined && props.key !== null;
  const hasDataKey = props[KEY_ATTRIBUTE] !== undefined && props[KEY_ATTRIBUTE] !== null;
  if (hasKey && hasDataKey) throw invalidInputError(`key와 ${KEY_ATTRIBUTE}를 함께 줄 수 없음`);
  const key = hasKey ? props.key : hasDataKey ? props[KEY_ATTRIBUTE] : null;
  if (key === null) return null;
  if (typeof key !== 'string' && typeof key !== 'number') {
    throw invalidInputError(`key는 문자열 또는 숫자여야 함 (받은 값: ${describe(key)})`);
  }
  return String(key);
}

function normalizeProps(props) {
  const attrs = {};
  for (const [name, value] of Object.entries(props)) {
    if (name === 'children' || name === 'key' || name === KEY_ATTRIBUTE) continue;
    if (typeof value === 'function') throw unsupportedError(`함수 이벤트 핸들러 (props.${name})`);
    if (value === false || value === null || value === undefined) continue;
    if (value === true) {
      attrs[name] = '';
    } else if (typeof value === 'object' || typeof value === 'symbol') {
      throw invalidInputError(`props.${name}의 값은 문자열로 바꿀 수 있어야 함 (받은 값: ${describe(value)})`);
    } else {
      attrs[name] = String(value);
    }
  }
  return attrs;
}

/** 2.3 children 표에 따라 자식을 문자열 조각 또는 VNode로 모은다. 배열은 깊이에 상관없이 평탄화. */
function collectChildren(value, out) {
  if (value === null || value === undefined || typeof value === 'boolean') return out;
  if (typeof value === 'string') {
    out.push(value);
  } else if (typeof value === 'number') {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collectChildren(item, out);
  } else if (isTextVNode(value)) {
    out.push(value.value);
  } else if (isElementVNode(value)) {
    out.push(value);
  } else {
    throw invalidInputError(`h()의 자식으로 쓸 수 없는 값 (받은 값: ${describe(value)})`);
  }
  return out;
}

function isTextVNode(value) {
  return typeof value === 'object' && value.type === TEXT_TYPE && typeof value.value === 'string';
}

function isElementVNode(value) {
  return (
    typeof value === 'object' &&
    typeof value.type === 'string' &&
    value.type !== TEXT_TYPE &&
    (value.key === null || typeof value.key === 'string') &&
    typeof value.props === 'object' &&
    value.props !== null &&
    Array.isArray(value.props.children)
  );
}

function describe(value) {
  if (typeof value === 'function') return '함수';
  if (Array.isArray(value)) return '배열';
  if (value === null) return 'null';
  if (typeof value === 'object') return '객체';
  if (typeof value === 'symbol') return 'symbol';
  return JSON.stringify(value) ?? String(value);
}
