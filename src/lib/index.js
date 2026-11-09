// Mini React 공개 인터페이스. 외부(playground, app, 통합 테스트)는 여기서만 import한다.
export { h } from './vdom/h.js';
export { domToVdom } from './vdom/domToVdom.js';
export { render } from './dom/render.js';
export { diff } from './reconcile/diff.js';
export { patch } from './reconcile/patch.js';
export { mount } from './hooks/root.js';
export { useState } from './hooks/hooks.js';
