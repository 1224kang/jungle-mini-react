import { describe, it, expect } from 'vitest';
import { domToVdom, render, diff, patch } from '../../../src/lib/index.js';
import { cases } from '../../../fixtures/cases.js';

function parse(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.firstElementChild;
}

describe('phase1 all fixture outcomes', () => {
  // Fixtures with changed key order check final output only, with no reuse or move requirements.
  it.each(cases)('$name: patching the rendered before tree matches the normalized after tree', ({ before, after }) => {
    const v1 = domToVdom(parse(before));
    const v2 = domToVdom(parse(after));
    const container = document.createElement('div');
    let root = render(v1);
    container.appendChild(root);
    root = patch(root, diff(v1, v2));
    expect(domToVdom(root)).toEqual(v2);
    expect(root.outerHTML).toBe(render(v2).outerHTML);
    expect(container.firstChild).toBe(root);
    expect(container.childNodes).toHaveLength(1);
  });
});
