                                                                                                                                                                                          import { isTextNode } from './vnode.js';

// 닫는 태그가 없는 요소
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

// 공백이 화면에 그대로 보이는 요소: 들여쓰기를 넣으면 내용이 바뀐다.
const WHITESPACE_PRESERVING_TAGS = new Set(['pre', 'textarea']);

const INDENT = '  ';

/**
 * 루트 VNode를 사람이 읽기 좋은 HTML 문자열로 만든다. (테스트 영역 편집기에 표시)
 *
 * 들여쓰기는 "자식이 모두 요소일 때만" 넣는다.
 * 텍스트 자식이 섞인 곳에 줄바꿈을 넣으면 텍스트 내용이 바뀌기 때문이다.
 * 이렇게 하면 htmlToVdom(vdomToHtml(vnode))가 원래 vnode와 같아진다.
 */
export function vdomToHtml(root) {
  if (canIndent(root)) { //들여써도 안전하면
    return root.children.map((child) => serialize(child, 0)).join('\n');
  }
  return root.children.map((child) => serializeInline(child)).join('');
}

function serialize(vnode, depth) { //들여쓰며 적기
  if (isTextNode(vnode)) return escapeText(vnode.text);

  const open = openTag(vnode);
  if (VOID_TAGS.has(vnode.type)) return open;
  if (!canIndent(vnode)) return open + innerInline(vnode) + `</${vnode.type}>`; //안쪽이 위험하면 그 안은 한줄로

  const childPad = INDENT.repeat(depth + 1); //자식은 한 단계 더 들여씀
  const inner = vnode.children
    .map((child) => childPad + serialize(child, depth + 1))
    .join('\n');
  return `${open}\n${inner}\n${INDENT.repeat(depth)}</${vnode.type}>`;
}

function serializeInline(vnode) { //공백 하나 안 넣고 이어 적기
  if (isTextNode(vnode)) return escapeText(vnode.text);
  const open = openTag(vnode);
  if (VOID_TAGS.has(vnode.type)) return open;
  return open + innerInline(vnode) + `</${vnode.type}>`;
}

function innerInline(vnode) {
  return vnode.children.map(serializeInline).join('');
}

function openTag(vnode) { //도우미-여는 태그 만들기 
  const attrs = Object.entries(vnode.props)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join('');
  return `<${vnode.type}${attrs}>`;
}

function canIndent(vnode) { //도우미-이 요소 안에 들여쓰기를 해도 되나?
  return (
    vnode.children.length > 0 && //자식이 있고
    !WHITESPACE_PRESERVING_TAGS.has(vnode.type) && //pre/textarea가 아니고
    vnode.children.every((child) => !isTextNode(child)) //자식이 전부 요소일때만
  );
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
