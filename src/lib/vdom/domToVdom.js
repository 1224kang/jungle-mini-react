import {
  DOM_NODE_TYPE,
  KEY_ATTRIBUTE,
  HTML_NAMESPACE,
  WHITESPACE_PRESERVE_TAGS,
  unsupportedError,
  warnDuplicateKeys,
} from '../shared/index.js';
import { mergeText } from './normalize.js';

const PRESERVE_SELECTOR = WHITESPACE_PRESERVE_TAGS.join(',');
// HTML 공백 문자만 본다. (&nbsp; 같은 유니코드 공백은 화면에 보이므로 글자로 취급)
const HTML_WHITESPACE_ONLY = /^[ \t\n\r\f]*$/;

/**
 * 실제 DOM Element를 VNode 트리로 변환한다. (docs/contracts.md 2.1, 2.2)
 * 입력 검사는 여기서 한 번만 하고, 실제 변환은 내부 재귀 함수가 맡는다.
 * 입력 DOM은 수정하지 않는다.
 * @param {Element} node 변환할 Element
 * @returns {{type: string, key: string|null, props: object}} 요소 VNode
 */
export function domToVdom(node) {
  assertElement(node);
  assertSupportedTree(node);
  // ③ 루트의 바깥 조상은 입구에서 한 번만 확인하고, 안쪽은 재귀하면서 물려준다.
  const insidePreserve = node.parentElement !== null && node.parentElement.closest(PRESERVE_SELECTOR) !== null;
  return convertElement(node, insidePreserve);
}

function assertElement(node) {
  const isElement =
    node !== null &&
    typeof node === 'object' &&
    node.nodeType === DOM_NODE_TYPE.ELEMENT &&
    typeof node.getAttributeNames === 'function';
  if (!isElement) {
    const name = node && typeof node === 'object' && node.nodeName ? node.nodeName : String(node);
    throw unsupportedError(`Element가 아닌 입력 (${name})`);
  }
}

/** SVG/MathML, <template>이 트리 어디에든 있으면 변환을 시작하기 전에 에러. (3장) */
function assertSupportedTree(element) {
  if (element.namespaceURI !== HTML_NAMESPACE) {
    throw unsupportedError(`HTML이 아닌 네임스페이스의 요소 <${element.localName}> (${element.namespaceURI})`);
  }
  if (element.localName === 'template') throw unsupportedError('<template> 요소');
  for (const child of element.children) assertSupportedTree(child);
}

/**
 * 검증된 Element만 받는다고 가정한다.
 * @param {Element} element
 * @param {boolean} insidePreserve 조상 중에 예외 태그(③)가 있는지
 */
function convertElement(element, insidePreserve) {
  let key = null;
  // "__proto__" 같은 이름도 own 속성으로 남도록 Object.fromEntries로 만든다. (1.2)
  const entries = [];
  for (const attr of element.attributes) {
    if (attr.name === KEY_ATTRIBUTE) key = attr.value;
    else entries.push([attr.name, attr.value]);
  }
  const attrs = Object.fromEntries(entries);

  const preserve = insidePreserve || WHITESPACE_PRESERVE_TAGS.includes(element.localName);
  const children = convertChildren(element, preserve);
  warnDuplicateKeys(children, element.localName);
  return { type: element.localName, key, props: { ...attrs, children } };
}

/**
 * 자식 목록 처리 순서: ① 요소·텍스트만 남김 → ④ 인접 텍스트 합침 → ② 공백 규칙(③ 예외) → 빈 문자열 제거
 */
function convertChildren(element, preserve) {
  const items = [];
  for (const child of element.childNodes) {
    if (child.nodeType === DOM_NODE_TYPE.ELEMENT) items.push(convertElement(child, preserve));
    else if (child.nodeType === DOM_NODE_TYPE.TEXT) items.push(child.data);
    // ① 그 밖의 노드(주석 등)는 버린다
  }

  // ③ 텍스트의 조상(루트의 바깥 조상 포함) 중 예외 태그가 있으면 ②를 건너뛴다.
  return mergeText(items, preserve ? undefined : dropIndentation);
}

/** ② 공백만 있고 줄바꿈을 포함한 텍스트는 버린다. 그 외는 그대로 (trim 안 함). */
function dropIndentation(text) {
  return text.includes('\n') && HTML_WHITESPACE_ONLY.test(text) ? '' : text;
}
