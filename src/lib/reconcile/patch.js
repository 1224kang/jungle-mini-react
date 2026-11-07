import { PATCH } from './diff.js';
import { createDom, setProp, removeProp } from '../dom/createDom.js';

/**
 * diff 결과를 실제 DOM(container)에 반영한다. 변경 목록에 있는 노드만 건드린다.
 *
 * 전제: container의 childNodes가 이전 VNode 트리의 children과 1:1로 대응해야 한다.
 *       (최초에 renderRoot로 그렸거나, 이후 계속 patch로만 바꿨다면 성립)
 *
 * @returns 변경된 DOM 노드 목록 [{ type, node }] (하이라이트 등 화면 표시용)
 */
export function patch(container, patches) {
  const changed = [];

  for (const p of patches) {
    switch (p.type) {
      case PATCH.CREATE: {
        const parent = findNode(container, p.path.slice(0, -1));
        const index = p.path[p.path.length - 1];
        const el = createDom(p.node);
        parent.insertBefore(el, parent.childNodes[index] ?? null);
        changed.push({ type: p.type, node: el });
        break;
      }
      case PATCH.REMOVE: {
        const target = findNode(container, p.path);
        const parent = target.parentNode;
        target.remove();
        changed.push({ type: p.type, node: parent });
        break;
      }
      case PATCH.REPLACE: {
        const target = findNode(container, p.path);
        const el = createDom(p.node);
        target.replaceWith(el);
        changed.push({ type: p.type, node: el });
        break;
      }
      case PATCH.TEXT: {
        const target = findNode(container, p.path);
        target.textContent = p.text;
        changed.push({ type: p.type, node: target });
        break;
      }
      case PATCH.PROPS: {
        const target = findNode(container, p.path);
        for (const [name, value] of Object.entries(p.set)) setProp(target, name, value);
        for (const name of p.remove) removeProp(target, name);
        changed.push({ type: p.type, node: target });
        break;
      }
      default:
        throw new Error(`알 수 없는 patch 종류입니다: ${p.type}`);
    }
  }

  return changed;
}

function findNode(container, path) {
  let node = container;
  for (const index of path) {
    node = node.childNodes[index];
    if (!node) throw new Error(`patch 대상 노드를 찾을 수 없습니다: [${path.join(', ')}]`);
  }
  return node;
}
