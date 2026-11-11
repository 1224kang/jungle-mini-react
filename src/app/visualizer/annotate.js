// 변경 대상 찾기: Patch가 이전(old) 트리와 이후(new) 트리의 "어느 노드"를 가리키는지 계산한다.
//
// Patch의 path는 old 좌표다. 생성·삭제·이동이 섞이면 이후 트리의 위치를 산술로 구하기 어렵다.
// 그래서 lib의 render · patch를 그대로 써서 분리된 DOM(문서에 붙지 않은 div)에서 미리 실행해 보고,
// "같은 DOM 노드가 old 트리에서는 어디였고 new 트리에서는 어디인지"를 DOM 노드 동일성으로 대응시킨다.
// 화면의 무대(#vz-stage)는 건드리지 않는다.
import { render, diff, patch } from '../../lib/index.js';

/** 경로 배열을 맵 키 문자열로. 루트는 빈 문자열. */
export const pathKey = (path) => path.join('.');

/** 경로 키를 다시 경로 배열로. */
export const pathOf = (key) => (key === '' ? [] : key.split('.').map(Number));

/**
 * @typedef {object} Mark
 * @property {'create'|'remove'|'replace'|'text'|'props'|'move'} kind
 * @property {number} index 이 표시를 만든 Patch의 목록 내 번호(0부터)
 * @property {string[]} [names] props 표시일 때 바뀐 속성 이름
 */

/** old VNode와 render된 DOM을 나란히 걸으며 DOM 노드 <-> 경로 키 대응을 만든다. */
function mapTree(vnode, dom, path, domToKey, keyToDom) {
  const key = pathKey(path);
  domToKey.set(dom, key);
  keyToDom.set(key, dom);
  if (vnode.type === '#text') return;
  vnode.props.children.forEach((child, i) => mapTree(child, dom.childNodes[i], [...path, i], domToKey, keyToDom));
}

/** VNode 트리에서 경로의 노드를 찾는다. 없으면 undefined. */
export const nodeAt = (vnode, path) => path.reduce((node, i) => node?.props?.children?.[i], vnode);

/**
 * Patch가 가리키는 노드를 old 트리와 new 트리 양쪽에 표시한다.
 * @param {object} oldVNode 이전 VNode
 * @param {object} newVNode 이후 VNode
 * @param {object[]} [patches] diff(oldVNode, newVNode)의 결과. 생략하면 계산한다.
 * @returns {{ old: Map<string, Mark[]>, new: Map<string, Mark[]>, patches: object[] }}
 *   old / new: 경로 키 -> 표시 목록. 한 노드에 여러 표시가 붙을 수 있다(예: MOVE + PROPS).
 */
export function annotate(oldVNode, newVNode, patches = diff(oldVNode, newVNode)) {
  const oldMarks = new Map();
  const newMarks = new Map();
  const add = (map, key, mark) => {
    if (key === undefined) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(mark);
  };
  if (patches.length === 0) return { old: oldMarks, new: newMarks, patches };

  // 1. 분리된 DOM에 old 트리를 그린다. 루트 REPLACE가 가능하도록 부모(wrap)를 둔다.
  const wrap = document.createElement('div');
  const rootDom = render(oldVNode);
  wrap.append(rootDom);

  // 2. old 대응표
  const oldDomToKey = new Map();
  const oldKeyToDom = new Map();
  mapTree(oldVNode, rootDom, [], oldDomToKey, oldKeyToDom);

  // 3. patch 전에 대상 DOM 노드를 잡아 둔다. (patch 뒤에는 인덱스가 바뀌어 path로 못 찾는다)
  const targets = patches.map((p) =>
    p.type === 'CREATE' ? oldKeyToDom.get(pathKey(p.path.slice(0, -1))) : oldKeyToDom.get(pathKey(p.path)),
  );

  // 4. patch 실행. REPLACE가 만든 새 노드를 찾으려고 변경을 관찰한다.
  const observer = new MutationObserver(() => {});
  observer.observe(wrap, { subtree: true, childList: true });
  const newRootDom = patch(rootDom, patches);
  const records = observer.takeRecords();
  observer.disconnect();

  // 5. new 대응표. 재사용된 노드는 old 표와 new 표 양쪽에 같은 DOM 노드로 나타난다.
  const newDomToKey = new Map();
  const newKeyToDom = new Map();
  mapTree(newVNode, newRootDom, [], newDomToKey, newKeyToDom);

  // 6. 표시
  patches.forEach((p, index) => {
    const target = targets[index];
    const oldKey = p.type === 'CREATE' ? undefined : pathKey(p.path);
    switch (p.type) {
      case 'REMOVE':
        add(oldMarks, oldKey, { kind: 'remove', index });
        break;
      case 'REPLACE': {
        add(oldMarks, oldKey, { kind: 'replace', index });
        // replaceWith는 한 레코드에 removedNodes=[대상], addedNodes=[새 노드]를 함께 남긴다.
        const record = records.find((r) => r.type === 'childList' && [...r.removedNodes].includes(target));
        const created = record && [...record.addedNodes][0];
        add(newMarks, created ? newDomToKey.get(created) : undefined, { kind: 'replace', index });
        break;
      }
      case 'CREATE': {
        // 재사용되는 부모 DOM의 new 경로 + CREATE 경로의 마지막 값(새 자식 순서)
        const parentKey = newDomToKey.get(target);
        if (parentKey === undefined) break;
        add(newMarks, pathKey([...pathOf(parentKey), p.path.at(-1)]), { kind: 'create', index });
        break;
      }
      case 'TEXT':
        add(oldMarks, oldKey, { kind: 'text', index });
        add(newMarks, newDomToKey.get(target), { kind: 'text', index });
        break;
      case 'PROPS': {
        const names = [...Object.keys(p.set ?? {}), ...(p.remove ?? [])];
        add(oldMarks, oldKey, { kind: 'props', index, names });
        add(newMarks, newDomToKey.get(target), { kind: 'props', index, names });
        break;
      }
      case 'MOVE':
        add(oldMarks, oldKey, { kind: 'move', index });
        add(newMarks, newDomToKey.get(target), { kind: 'move', index });
        break;
    }
  });
  return { old: oldMarks, new: newMarks, patches };
}
