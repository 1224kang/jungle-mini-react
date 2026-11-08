/**
 * VNode → HTML 문자열 직렬화. DOM을 다루지 않는다.
 *
 * 왕복 규칙: parseHtml(serialize(v))가 v와 같아야 한다 (v가 HTML 파서에서 나온 VNode일 때).
 * - key는 data-key 속성으로 쓴다 (docs/contracts.md 1.3).
 * - 자식이 모두 요소인 경우에만 줄바꿈+들여쓰기를 넣는다. 이 공백은 "줄바꿈을 포함한 공백만의 텍스트"라서
 *   domToVdom 규칙 ②에 의해 다시 읽을 때 버려진다. 텍스트가 섞인 자식 목록은 한 줄로 그대로 쓴다.
 * - pre/textarea/script/style 안(규칙 ③)은 공백이 보존되므로 들여쓰기를 넣지 않는다.
 * - HTML 파서는 <pre>, <textarea>, <listing> 바로 뒤의 줄바꿈 하나를 버리므로, 첫 텍스트가 \n으로 시작하면 \n을 하나 더 쓴다.
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const PRESERVE_TAGS = new Set(['pre', 'textarea', 'script', 'style']);
const LEADING_NEWLINE_TAGS = new Set(['pre', 'textarea', 'listing']);

// \r은 HTML 파서가 \n으로 바꾸므로 문자 참조로 써야 값이 보존된다.
const escapeText = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;').replace(/\r/g, '&#13;');
const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/ /g, '&nbsp;').replace(/\r/g, '&#13;');

function attrsOf(vnode) {
  const parts = [];
  if (vnode.key !== null && vnode.key !== undefined) parts.push(`data-key="${escapeAttr(vnode.key)}"`);
  for (const name of Object.keys(vnode.props)) {
    if (name === 'children') continue;
    const value = vnode.props[name];
    if (typeof value !== 'string') continue; // 함수 핸들러는 HTML로 표현할 수 없다
    parts.push(value === '' ? name : `${name}="${escapeAttr(value)}"`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

/**
 * @param {object} vnode 정규화된 VNode
 * @param {{ indent?: string }} [options] indent: 들여쓰기 문자열 (기본 2칸). ''이면 한 줄.
 * @returns {string}
 */
export function serialize(vnode, options = {}) {
  const unit = options.indent ?? '  ';
  return write(vnode, 0, false);

  function write(node, depth, preserve) {
    if (node.type === '#text') return escapeText(node.value);
    const tag = node.type;
    const open = `<${tag}${attrsOf(node)}>`;
    if (VOID_TAGS.has(tag)) return open;

    const children = node.props.children;
    const innerPreserve = preserve || PRESERVE_TAGS.has(tag);
    const allElements = children.length > 0 && children.every((c) => c.type !== '#text');

    let inner;
    if (unit !== '' && !innerPreserve && allElements) {
      const pad = '\n' + unit.repeat(depth + 1);
      inner = children.map((c) => pad + write(c, depth + 1, innerPreserve)).join('') + '\n' + unit.repeat(depth);
    } else {
      inner = children.map((c) => write(c, depth + 1, innerPreserve)).join('');
      if (LEADING_NEWLINE_TAGS.has(tag) && children[0]?.type === '#text' && children[0].value.startsWith('\n')) {
        inner = '\n' + inner;
      }
    }
    return `${open}${inner}</${tag}>`;
  }
}
