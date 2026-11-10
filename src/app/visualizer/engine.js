// 시각화 엔진: HTML ↔ VNode 변환, 무대(stage) DOM에 diff/patch 실행, 결과 측정.
// Mini React 공개 API(domToVdom · render · diff · patch)와 브라우저 기본 API만 쓴다.
import { domToVdom, render, diff, patch } from '../../lib/index.js';

/* ---------- HTML → VNode ---------- */

/**
 * HTML 문자열을 VNode로 바꾼다. DOMParser는 스크립트·이벤트를 실행하지 않는 별도 문서를 만든다.
 * @returns {object} 정규화된 VNode
 * @throws {Error} 최상위 요소가 하나가 아니거나 lib가 지원하지 않는 입력일 때
 */
export function parseHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const nodes = [...doc.body.childNodes].filter(
    (n) => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.data.trim() !== ''),
  );
  if (nodes.length !== 1 || nodes[0].nodeType !== Node.ELEMENT_NODE) {
    throw new Error('최상위 요소는 정확히 하나여야 합니다. (예: <div>…</div>로 감싸기)');
  }
  return domToVdom(nodes[0]);
}

/* ---------- VNode → HTML (보기 좋게) ---------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');

function openTag(vnode) {
  const { children, ...attrs } = vnode.props;
  const parts = [vnode.type];
  if (vnode.key !== null) parts.push(`data-key="${escapeAttr(vnode.key)}"`);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value !== 'string') continue; // 함수 핸들러는 HTML로 나타낼 수 없다
    parts.push(value === '' ? name : `${name}="${escapeAttr(value)}"`);
  }
  return `<${parts.join(' ')}>`;
}

// 공백이 의미를 갖는 태그. domToVdom 규칙 ③(docs/contracts.md 2.2)의 예외 목록과 같다.
const PRESERVE = new Set(['pre', 'textarea', 'script', 'style']);

/**
 * 줄바꿈 들여쓰기는 domToVdom 규칙 ②로 버려지므로 다시 읽어도 같은 VNode가 된다.
 * 단 pre/textarea/script/style과 그 자손 안에서는 규칙 ③ 때문에 공백이 보존되므로, 공백을 더하지 않고 한 줄에 쓴다.
 */
export function toHtml(vnode, depth = 0, preserve = false) {
  const pad = preserve ? '' : '  '.repeat(depth);
  if (vnode.type === '#text') return pad + escapeText(vnode.value);
  const open = openTag(vnode);
  if (VOID.has(vnode.type)) return pad + open;
  const kids = vnode.props.children;
  const close = `</${vnode.type}>`;
  if (kids.length === 0) return pad + open + close;
  const inside = preserve || PRESERVE.has(vnode.type);
  // 텍스트가 섞이거나 공백 보존 영역이면 공백이 의미를 가지므로 한 줄에 쓴다.
  if (inside || kids.some((k) => k.type === '#text')) {
    // HTML 파서는 <pre>/<textarea> 바로 뒤의 첫 줄바꿈 하나를 버리므로, 내용이 줄바꿈으로 시작하면 하나 더 쓴다.
    const lead = (vnode.type === 'pre' || vnode.type === 'textarea') && kids[0].type === '#text' && kids[0].value.startsWith('\n') ? '\n' : '';
    return pad + open + lead + kids.map((k) => toHtml(k, 0, inside)).join('') + close;
  }
  return [pad + open, ...kids.map((k) => toHtml(k, depth + 1)), pad + close].join('\n');
}

/* ---------- 무대: patch 실행과 측정 ---------- */

function collectNodes(container) {
  const nodes = new Set();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.add(walker.currentNode);
  return nodes;
}

/** 무대를 vnode로 새로 그린다. 반환값은 무대의 루트 DOM 노드. */
export function renderStage(container, vnode) {
  const root = render(vnode);
  container.replaceChildren(root);
  return root;
}

/**
 * 무대의 현재 화면(oldVNode)을 newVNode로 patch하고, 무엇이 일어났는지 측정한다.
 * @returns {{ root: Node, patches: object[], stats: object, timing: object, changes: object[] }}
 */
export function patchStage(container, root, oldVNode, newVNode) {
  const beforeNodes = collectNodes(container);

  const t0 = performance.now();
  const patches = diff(oldVNode, newVNode);
  const t1 = performance.now();

  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  const nextRoot = patch(root, patches);
  const t2 = performance.now();
  const records = observer.takeRecords();
  observer.disconnect();

  const afterNodes = collectNodes(container);
  let reused = 0;
  for (const n of afterNodes) if (beforeNodes.has(n)) reused += 1;

  return {
    root: nextRoot,
    patches,
    stats: {
      reused,
      created: afterNodes.size - reused,
      removed: beforeNodes.size - reused,
      total: afterNodes.size,
      replacedAll: beforeNodes.size + afterNodes.size, // innerHTML로 갈아끼웠다면 지우고 새로 만들 노드 수
    },
    timing: { diff: t1 - t0, patch: t2 - t1 },
    changes: classifyMutations(records, beforeNodes),
  };
}

/** MutationRecord를 화면 강조용 목록 [{ el, kind }]으로 바꾼다. 같은 요소는 한 번만. */
function classifyMutations(records, beforeNodes) {
  const seen = new Map();
  const mark = (node, kind) => {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !el.isConnected) return;
    const rank = { create: 3, move: 3, text: 2, props: 1 };
    if (!seen.has(el) || rank[kind] > rank[seen.get(el)]) seen.set(el, kind);
  };
  for (const r of records) {
    if (r.type === 'childList') {
      for (const n of r.addedNodes) mark(n, beforeNodes.has(n) ? 'move' : n.nodeType === Node.TEXT_NODE ? 'text' : 'create');
    } else if (r.type === 'characterData') {
      mark(r.target, 'text');
    } else if (r.type === 'attributes') {
      mark(r.target, 'props');
    }
  }
  return [...seen].map(([el, kind]) => ({ el, kind }));
}

/** 바뀐 요소를 잠깐 강조한다. Web Animations API라 DOM 속성을 건드리지 않는다(다음 diff에 영향 없음). */
export function flashChanges(changes) {
  const styles = getComputedStyle(document.documentElement);
  for (const { el, kind } of changes) {
    // 이 페이지는 텍스트 = 노랑, 속성 = 파랑이라 두 종류의 색 토큰을 바꿔 쓴다. (visualizer.css의 .vz와 같은 규칙)
    const token = { text: 'props', props: 'text' }[kind] ?? kind;
    const color = styles.getPropertyValue(`--patch-${token}`).trim() || 'orange';
    el.animate(
      [
        { boxShadow: `0 0 0 3px ${color}`, offset: 0 },
        { boxShadow: `0 0 0 3px ${color}`, offset: 0.6 },
        { boxShadow: '0 0 0 3px transparent', offset: 1 },
      ],
      { duration: 1600, easing: 'ease-out' },
    );
  }
}

/* ---------- Patch 설명 ---------- */

function nodeAt(vnode, path) {
  let node = vnode;
  for (const i of path) node = node?.props?.children?.[i];
  return node;
}

/** VNode를 짧은 라벨로: <li key="milk">, "텍스트" */
export function labelOf(vnode) {
  if (!vnode) return '?';
  if (vnode.type === '#text') {
    const v = vnode.value.trim();
    return `"${v.length > 14 ? v.slice(0, 14) + '…' : v}"`;
  }
  return vnode.key !== null ? `<${vnode.type} key="${vnode.key}">` : `<${vnode.type}>`;
}

const quote = (v) => `"${v}"`;
const NONE = '(없음)';
const showValue = (v) => (typeof v === 'string' ? quote(v) : 'ƒ');
const pathText = (path) => `[${path.join(', ')}]`;

/**
 * Patch 하나를 사람이 읽는 문장으로 바꾼다. 이전 값 -> 이후 값을 함께 보여 준다.
 * @param {object} p Patch
 * @param {object} oldVNode 이 Patch 목록을 만든 diff의 old 트리 (path 기준)
 * @returns {{ target: string, basis: string, details: string[] }}
 *   target: 대상 라벨 / basis: path가 무엇 기준인지 / details: 구체 내용(줄 단위)
 */
export function describePatch(p, oldVNode) {
  const old = nodeAt(oldVNode, p.path);
  const basis = '이전 트리 기준';
  switch (p.type) {
    case 'TEXT':
      return { target: labelOf(old), basis, details: [`${quote(old?.value ?? '')} → ${quote(p.value)}`] };
    case 'PROPS': {
      const before = old?.props ?? {};
      const details = [
        ...Object.entries(p.set ?? {}).map(
          ([k, v]) => `${k}: ${Object.hasOwn(before, k) ? showValue(before[k]) : NONE} → ${showValue(v)}`,
        ),
        ...(p.remove ?? []).map((k) => `${k}: ${showValue(before[k])} → (삭제)`),
      ];
      return { target: labelOf(old), basis, details };
    }
    case 'CREATE': {
      const parentPath = p.path.slice(0, -1);
      return {
        target: labelOf(p.node),
        basis: `부모 ${pathText(parentPath)} 이전 트리 기준 · 새 순서 ${p.path.at(-1) + 1}번째`,
        details: [`새로 만들어 ${beforeText(p.before, oldVNode, p.path)}에 넣음`],
      };
    }
    case 'REMOVE':
      return { target: labelOf(old), basis, details: ['DOM에서 지움'] };
    case 'REPLACE':
      return { target: labelOf(old), basis, details: [`${labelOf(old)} → ${labelOf(p.node)} (하위는 비교하지 않고 통째로 교체)`] };
    case 'MOVE':
      return {
        target: labelOf(old),
        basis: `이전 ${pathText(p.path)} → 새 순서 ${p.index + 1}번째`,
        details: ['DOM을 다시 만들지 않고 옮김'],
      };
    default:
      return { target: '', basis: '', details: [] };
  }
}

function beforeText(before, oldVNode, path) {
  if (before === null) return '맨 끝';
  if ('old' in before) return `${labelOf(nodeAt(oldVNode, [...path.slice(0, -1), before.old]))} 앞`;
  return `새 ${before.new + 1}번째 노드 앞`;
}
