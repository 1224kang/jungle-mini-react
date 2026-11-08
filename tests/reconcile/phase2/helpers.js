import { vi } from 'vitest';

// Snapshot membership before patch; ignore construction of detached new subtrees.
export function countMutations(container) {
  const existing = new Set();
  const visit = (node) => { existing.add(node); node.childNodes.forEach(visit); };
  visit(container);
  const counts = { moves: 0, inserts: 0, removes: 0, attributes: 0, text: 0 };
  const spies = [];
  let depth = 0;
  const placement = (parent, node) => {
    if (!existing.has(parent)) return;
    if (node instanceof Node && node.parentNode === parent) counts.moves++;
    else if (!(node instanceof Node) || node.parentNode === null) counts.inserts++;
  };
  for (const proto of [Node.prototype, Element.prototype, CharacterData.prototype]) {
    for (const name of ['insertBefore', 'appendChild', 'removeChild', 'replaceChild',
      'remove', 'replaceWith', 'before', 'after', 'setAttribute', 'removeAttribute',
      'textContent', 'nodeValue']) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor) continue;
      const setter = name === 'textContent' || name === 'nodeValue';
      const original = setter ? descriptor.set : descriptor.value;
      if (typeof original !== 'function') continue;
      const spy = setter ? vi.spyOn(proto, name, 'set') : vi.spyOn(proto, name);
      spy.mockImplementation(function (...args) {
        if (depth === 0) {
          if (name === 'insertBefore' || name === 'appendChild') placement(this, args[0]);
          else if (name === 'before' || name === 'after' || name === 'replaceWith') {
            if (this.parentNode && existing.has(this)) {
              args.forEach((node) => placement(this.parentNode, node));
              if (name === 'replaceWith') counts.removes++;
            }
          } else if (name === 'replaceChild') {
            placement(this, args[0]);
            if (existing.has(this) && existing.has(args[1])) counts.removes++;
          } else if (name === 'removeChild') {
            if (existing.has(this) && existing.has(args[0])) counts.removes++;
          } else if (name === 'remove') {
            if (existing.has(this) && this.parentNode) counts.removes++;
          } else if (existing.has(this)) {
            if (setter) counts.text++;
            else counts.attributes++;
          }
        }
        depth++;
        try { return original.apply(this, args); } finally { depth--; }
      });
      spies.push(spy);
    }
  }
  return { counts, restore: () => spies.reverse().forEach((spy) => spy.mockRestore()) };
}
