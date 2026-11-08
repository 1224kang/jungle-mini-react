/**
 * HTML 문자열 → VNode. UI와 무관하며, 파싱용 Document만 인자로 받는다.
 *
 * 1) <template>로 파싱한다: template.content는 비활성(inert) 문서라서 파싱 중 스크립트가 실행되지 않고
 *    이미지 등도 로드되지 않는다.
 * 2) template 파싱만으로 안전하다고 보지 않는다. 결과 VNode는 나중에 render()로 "살아 있는" DOM이 되므로
 *    sanitize()로 실행 가능한 콘텐츠를 지운 뒤 domToVdom()에 넘긴다. 지운 항목은 warnings로 돌려준다.
 *
 * 허용 정책 (기존 공개 API 범위에 맞춤)
 * - 태그: ALLOWED_TAGS 허용 목록만. 그 밖(script, style, iframe, object, form, template, svg, math 등)은
 *   하위 트리째 제거한다. (template/SVG/MathML은 domToVdom이 어차피 범위 밖 에러를 낸다: docs/contracts.md 3장)
 * - 속성: on* 이벤트 속성, srcdoc/action/formaction 제거. URL 속성의 javascript:/vbscript:/data: 값 제거.
 *   style 안의 url( / expression( / javascript: 제거(외부 요청·스크립트 방지).
 *   setAttribute가 거부하는 이름(따옴표 등 포함)도 제거한다.
 */
import { domToVdom } from '../../lib/index.js';

export const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'mark', 'code', 'pre', 'kbd', 'samp',
  'blockquote', 'q', 'cite', 'abbr', 'sub', 'sup', 'time', 'br', 'hr', 'wbr', 'del', 'ins',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'figure', 'figcaption', 'details', 'summary',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'img', 'label', 'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'fieldset', 'legend',
  'progress', 'meter', 'output',
]);

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'background', 'cite', 'xlink:href', 'ping']);
const ALWAYS_REMOVED_ATTRS = new Set(['srcdoc', 'action', 'formaction']);
const SAFE_ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** URL 스킴 판정용: 공백·제어 문자를 빼고 소문자로 (java\tscript: 같은 우회 방지) */
const isDangerousUrl = (value) =>
  /^(javascript|vbscript|data):/.test(value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase());
const isDangerousStyle = (value) => /url\s*\(|expression\s*\(|javascript:/i.test(value);

/**
 * 비활성 DOM 트리에서 실행 가능한 콘텐츠를 제거한다. (입력 트리를 직접 수정)
 * @param {Element} root
 * @returns {string[]} 제거한 항목 설명
 */
export function sanitize(root) {
  const warnings = [];
  const visit = (el) => {
    for (const child of [...el.children]) {
      if (child.namespaceURI !== HTML_NS || !ALLOWED_TAGS.has(child.localName)) {
        warnings.push(`<${child.localName}> 요소 제거 (허용되지 않는 태그)`);
        child.remove();
        continue;
      }
      cleanAttributes(child, warnings);
      visit(child);
    }
  };
  if (root.namespaceURI !== HTML_NS || !ALLOWED_TAGS.has(root.localName)) {
    throw new Error(`루트 요소 <${root.localName}>는 허용되지 않는 태그입니다`);
  }
  cleanAttributes(root, warnings);
  visit(root);
  return warnings;
}

function cleanAttributes(el, warnings) {
  for (const { name, value } of [...el.attributes]) {
    let reason = null;
    if (!SAFE_ATTR_NAME.test(name)) reason = '허용되지 않는 속성 이름';
    else if (/^on/i.test(name)) reason = '인라인 이벤트 속성';
    else if (ALWAYS_REMOVED_ATTRS.has(name)) reason = '실행/전송 관련 속성';
    else if (URL_ATTRS.has(name) && isDangerousUrl(value)) reason = '위험한 URL 스킴';
    else if (name === 'style' && isDangerousStyle(value)) reason = 'style 안의 url()/expression()';
    if (reason) {
      el.removeAttribute(name);
      warnings.push(`<${el.localName}>의 ${name} 속성 제거 (${reason})`);
    }
  }
}

/**
 * HTML 문자열을 VNode로 바꾼다. 최상위에는 요소가 정확히 하나 있어야 한다(공백·주석은 무시).
 * @param {string} html
 * @param {Document} [doc] template을 만들 문서
 * @returns {{ vnode: object, warnings: string[] }}
 */
export function parseHtml(html, doc = globalThis.document) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const nodes = [...tpl.content.childNodes].filter(
    (n) => !(n.nodeType === 8 || (n.nodeType === 3 && /^[ \t\n\r\f]*$/.test(n.data))),
  );
  if (nodes.length !== 1 || nodes[0].nodeType !== 1) {
    throw new Error(`최상위에 요소가 정확히 하나 있어야 합니다 (찾은 최상위 노드 ${nodes.length}개)`);
  }
  const root = nodes[0];
  const warnings = sanitize(root);
  return { vnode: domToVdom(root), warnings };
}
