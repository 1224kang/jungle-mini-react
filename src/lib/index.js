// Phase 1: Virtual DOM + Diff + Patch
export { createElement, createTextNode, createRoot, TEXT_TYPE, ROOT_TYPE } from './vdom/vnode.js';
export { domToVdom, containerToVdom, htmlToVdom } from './vdom/domToVdom.js';
export { vdomToHtml } from './vdom/vdomToHtml.js';
export { createDom, renderRoot } from './dom/createDom.js';
export { diff, PATCH } from './reconcile/diff.js';
export { patch } from './reconcile/patch.js';

// Phase 2: Component · State · Hooks
export { h } from './vdom/h.js';
export { FunctionComponent, render } from './component/FunctionComponent.js';
export { useState } from './hooks/useState.js';
export { useEffect } from './hooks/useEffect.js';
export { useMemo } from './hooks/useMemo.js';
