/**
 * diff()가 만든 Patch[]를 사람이 읽는 로그 행으로 바꾸는 표시 전용 계층. DOM을 다루지 않고,
 * diff/patch 코드와 Patch 객체를 수정하지 않는다.
 *
 * 순서: 행 번호(#)는 Patch 배열 순서다. patch()는 실행 전에 모든 path를 old 트리 기준으로 한꺼번에
 * DOM 참조로 해석한 뒤 배열 순서 그대로 실행하므로(docs/contracts.md 5장 규칙), 생성 순서 = DOM 적용 순서다.
 * 단 path는 "old 트리 좌표"라서 앞선 REMOVE/MOVE 뒤의 실제 DOM 인덱스와 다를 수 있다.
 */
import { serialize } from './serialize.js';

const MAX = 60;
const clip = (s) => (s.length > MAX ? s.slice(0, MAX - 1) + '…' : s);
const quote = (s) => JSON.stringify(s);

/** old 트리에서 path의 노드를 찾는다. 없으면 null. */
export function nodeAt(root, path) {
  let node = root;
  for (const i of path) {
    node = node?.props?.children?.[i];
    if (!node) return null;
  }
  return node;
}

/** 노드를 짧게 표시: 요소는 여는 태그, 텍스트는 따옴표 문자열 */
export function describeNode(node) {
  if (!node) return '(없음)';
  if (node.type === '#text') return clip(quote(node.value));
  const html = serialize({ ...node, props: { ...node.props, children: [] } }, { indent: '' });
  return clip(html.replace(/<\/[^>]+>$/, ''));
}

const pathText = (path) => `[${path.join(',')}]`;
const beforeText = (before) =>
  before == null ? '부모의 맨 끝' : 'old' in before ? `old 자식 ${before.old} 앞` : `새로 만든 자식 ${before.new} 앞`;

/**
 * @param {object} oldVNode diff의 첫 번째 인자 (path의 기준 트리)
 * @param {object[]} patches diff 결과
 * @returns {{ order: number, type: string, path: string, target: string, from: string, to: string, note: string }[]}
 */
export function toLogRows(oldVNode, patches) {
  const rows = [];
  patches.forEach((p, idx) => {
    const order = idx + 1;
    const path = pathText(p.path);
    switch (p.type) {
      case 'TEXT': {
        const old = nodeAt(oldVNode, p.path);
        rows.push({ order, type: p.type, path, target: '텍스트', from: clip(quote(old?.value ?? '')), to: clip(quote(p.value)), note: '' });
        break;
      }
      case 'PROPS': {
        const el = nodeAt(oldVNode, p.path);
        const target = describeNode(el);
        for (const name of p.remove) {
          rows.push({ order, type: p.type, path, target, from: `${name}=${clip(quote(String(el?.props?.[name] ?? '')))}`, to: '(삭제)', note: '' });
        }
        for (const [name, value] of Object.entries(p.set)) {
          const had = el && Object.hasOwn(el.props, name);
          const show = typeof value === 'function' ? '(함수 핸들러)' : clip(quote(value));
          rows.push({
            order, type: p.type, path, target,
            from: had ? `${name}=${clip(quote(String(el.props[name])))}` : '(없음)',
            to: `${name}=${show}`, note: '',
          });
        }
        break;
      }
      case 'CREATE': {
        const parent = nodeAt(oldVNode, p.path.slice(0, -1));
        rows.push({
          order, type: p.type, path, target: `${describeNode(parent)}의 새 자식 ${p.path.at(-1)}번`,
          from: '(없음)', to: describeNode(p.node), note: beforeText(p.before),
        });
        break;
      }
      case 'REMOVE':
        rows.push({ order, type: p.type, path, target: describeNode(nodeAt(oldVNode, p.path)), from: describeNode(nodeAt(oldVNode, p.path)), to: '(삭제)', note: '' });
        break;
      case 'REPLACE':
        rows.push({ order, type: p.type, path, target: describeNode(nodeAt(oldVNode, p.path)), from: describeNode(nodeAt(oldVNode, p.path)), to: describeNode(p.node), note: '하위 트리 통째로 교체' });
        break;
      case 'MOVE':
        rows.push({
          order, type: p.type, path, target: describeNode(nodeAt(oldVNode, p.path)),
          from: `old 위치 ${p.path.at(-1)}`, to: `새 위치 ${p.index}`, note: beforeText(p.before),
        });
        break;
      default:
        rows.push({ order, type: String(p.type), path, target: '?', from: '', to: '', note: '알 수 없는 patch type' });
    }
  });
  return rows;
}

/** 명령 종류별 개수 (예: { TEXT: 1, PROPS: 2 }) */
export function countByType(patches) {
  const counts = {};
  for (const p of patches) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return counts;
}
