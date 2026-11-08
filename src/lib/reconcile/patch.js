import { render } from '../dom/render.js';
import { setProp, removeProp } from '../dom/props.js';
import { PATCH_TYPE, invalidInputError } from '../shared/index.js';

/**
 * Patch 목록을 실제 DOM에 반영한다. (docs/diff-patch-contract.md 5, 11절)
 * 두 단계로 나눈다.
 *  A. 해석: DOM을 바꾸기 전에 모든 path / before.old를 DOM 노드 참조로 바꾼다.
 *     이유: 이동·삭제로 인덱스가 바뀌어도 참조는 흔들리지 않고, 잘못된 patch는 부분 적용 없이 거부된다.
 *  B. 실행: 해석한 참조로 배열 순서대로 DOM을 바꾼다.
 * @param {Node} rootDom patch 경로의 기준이 되는 루트 DOM 노드
 * @param {object[]} patches Patch[] (docs/contracts.md 참조)
 * @returns {Node} 패치 후의 루트 DOM 노드 (루트가 REPLACE되면 새 노드, 아니면 rootDom)
 */
export function patch(rootDom, patches) {
  if (typeof rootDom?.nodeType !== 'number') throw invalidInputError('patch의 rootDom은 DOM 노드여야 함');
  if (!Array.isArray(patches)) throw invalidInputError('patch의 patches는 배열이어야 함');
  if (patches.length === 0) return rootDom;

  const toStep = createResolver(rootDom);
  const plan = patches.map(toStep); // A. 해석 (DOM 변경 없음)
  return execute(rootDom, plan); // B. 실행
}

/** path를 따라 childNodes를 내려가 DOM 노드를 찾는다. 없으면 에러. */
function resolvePath(rootDom, path) {
  if (!Array.isArray(path) || !path.every((i) => Number.isInteger(i) && i >= 0)) {
    throw invalidInputError(`patch의 path는 0 이상의 정수 배열이어야 함 (받은 값: ${JSON.stringify(path)})`);
  }
  let node = rootDom;
  for (const index of path) {
    node = node.childNodes[index];
    if (!node) throw invalidInputError(`path [${path.join(', ')}]를 DOM에서 찾을 수 없음 (old 트리와 구조가 다름)`);
  }
  return node;
}

const keyOf = (path) => JSON.stringify(path);

/**
 * patch 하나를 실행용 단계 객체로 바꾸는 함수를 만든다. 단계 객체는 부모/대상/기준점을 모두 참조로 들고 있다.
 * `created`는 앞서 해석된 CREATE의 "부모경로+새인덱스" 키 집합으로, before.new가 선행 CREATE를 가리키는지 검증한다.
 */
function createResolver(rootDom) {
  const created = new Set();

  /** before를 { anchor }(노드 또는 null) 또는 { anchorKey }(선행 CREATE가 만들 노드)로 해석한다. */
  const resolveBefore = (p, parentPath) => {
    const before = p.before ?? null;
    if (before === null) return { anchor: null };
    if (typeof before === 'object' && Number.isInteger(before.old) && before.old >= 0) {
      return { anchor: resolvePath(rootDom, [...parentPath, before.old]) };
    }
    if (typeof before === 'object' && Number.isInteger(before.new) && before.new >= 0) {
      const anchorKey = keyOf([...parentPath, before.new]);
      // 실행 중에 알게 되면 이미 DOM이 바뀐 뒤라서, 해석 단계에서 선행 CREATE가 있는지 확인한다.
      if (!created.has(anchorKey)) throw invalidInputError(`before.new ${before.new}에 해당하는 선행 CREATE가 없음`);
      return { anchorKey };
    }
    throw invalidInputError(`알 수 없는 before: ${JSON.stringify(before)}`);
  };

  return (p) => {
    if (typeof p !== 'object' || p === null) throw invalidInputError('patch 항목은 객체여야 함');
    switch (p.type) {
      case PATCH_TYPE.CREATE: {
        if (!Array.isArray(p.path) || p.path.length === 0) throw invalidInputError('CREATE의 path는 비어 있을 수 없음');
        const parentPath = p.path.slice(0, -1);
        const step = {
          type: p.type,
          parent: resolvePath(rootDom, parentPath),
          node: p.node,
          ownKey: keyOf(p.path),
          ...resolveBefore(p, parentPath),
        };
        created.add(step.ownKey);
        return step;
      }
      case PATCH_TYPE.REMOVE:
        return { type: p.type, target: resolvePath(rootDom, p.path) };
      case PATCH_TYPE.REPLACE: {
        const target = resolvePath(rootDom, p.path);
        const isRoot = p.path.length === 0;
        // 루트를 바꾸려면 부모가 있어야 한다. 해석 단계에서 걸러 부분 적용을 막는다.
        if (isRoot && !rootDom.parentNode) throw invalidInputError('부모가 없는 루트는 REPLACE할 수 없음');
        return { type: p.type, target, node: p.node, isRoot };
      }
      case PATCH_TYPE.TEXT: {
        const target = resolvePath(rootDom, p.path);
        if (target.nodeType !== 3) throw invalidInputError(`TEXT의 대상이 텍스트 노드가 아님 (path ${JSON.stringify(p.path)})`);
        return { type: p.type, target, value: p.value };
      }
      case PATCH_TYPE.PROPS: {
        const target = resolvePath(rootDom, p.path);
        if (target.nodeType !== 1) throw invalidInputError(`PROPS의 대상이 요소가 아님 (path ${JSON.stringify(p.path)})`);
        return { type: p.type, target, set: p.set ?? {}, remove: p.remove ?? [] };
      }
      case PATCH_TYPE.MOVE: {
        if (!Array.isArray(p.path) || p.path.length === 0) throw invalidInputError('MOVE의 path는 비어 있을 수 없음');
        const parentPath = p.path.slice(0, -1);
        return {
          type: p.type,
          target: resolvePath(rootDom, p.path),
          parent: resolvePath(rootDom, parentPath),
          ...resolveBefore(p, parentPath),
        };
      }
      default:
        throw invalidInputError(`알 수 없는 patch type: ${String(p.type)}`);
    }
  };
}

function execute(rootDom, plan) {
  let root = rootDom;
  // CREATE가 만든 DOM 노드 (키: 부모경로+새 인덱스). before.new가 이 노드를 가리킨다.
  const createdNodes = new Map();
  const anchorOf = (step) => (step.anchorKey !== undefined ? createdNodes.get(step.anchorKey) : step.anchor) ?? null;

  for (const step of plan) {
    switch (step.type) {
      case PATCH_TYPE.CREATE: {
        const node = render(step.node);
        createdNodes.set(step.ownKey, node);
        step.parent.insertBefore(node, anchorOf(step));
        break;
      }
      case PATCH_TYPE.REMOVE:
        step.target.remove();
        break;
      case PATCH_TYPE.REPLACE: {
        const node = render(step.node);
        step.target.replaceWith(node);
        if (step.isRoot) root = node;
        break;
      }
      case PATCH_TYPE.TEXT:
        step.target.nodeValue = step.value;
        break;
      case PATCH_TYPE.PROPS:
        for (const name of step.remove) removeProp(step.target, name);
        for (const [name, value] of Object.entries(step.set)) setProp(step.target, name, value);
        break;
      case PATCH_TYPE.MOVE:
        step.parent.insertBefore(step.target, anchorOf(step));
        break;
    }
  }
  return root;
}
