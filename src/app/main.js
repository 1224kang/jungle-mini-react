import {
  containerToVdom,
  htmlToVdom,
  vdomToHtml,
  renderRoot,
  diff,
  patch,
  PATCH,
} from '../lib/index.js';
import { StateHistory } from './history.js';

const actual = document.querySelector('#actual');
const editor = document.querySelector('#test-editor');
const preview = document.querySelector('#test-preview');
const backButton = document.querySelector('#btn-back');
const forwardButton = document.querySelector('#btn-forward');
const patchButton = document.querySelector('#btn-patch');
const historyStatus = document.querySelector('#history-status');
const patchLog = document.querySelector('#patch-log');

// 실제 영역의 DOM 변경 횟수를 세기 위한 감시자 (변경된 부분만 바뀌는지 확인용)
const observer = new MutationObserver(() => {});
observer.observe(actual, { childList: true, attributes: true, characterData: true, subtree: true });

// ── 초기화 ────────────────────────────────────────────────
// 1) 실제 영역의 샘플 HTML → Virtual DOM
const initialVdom = containerToVdom(actual);
// 2) 실제 영역을 Virtual DOM으로 다시 그려 DOM과 VNode를 1:1로 맞춘다. (들여쓰기 공백·주석 제거)
renderRoot(actual, initialVdom);
observer.takeRecords();
// 3) 같은 Virtual DOM으로 테스트 영역을 렌더링
const history = new StateHistory(initialVdom);
showInTestArea(initialVdom);
updateHistoryButtons();
addLog('초기화', [], 0, '실제 영역을 Virtual DOM으로 변환했습니다.');

// ── 이벤트 ────────────────────────────────────────────────
patchButton.addEventListener('click', onPatch);
backButton.addEventListener('click', () => moveHistory('back'));
forwardButton.addEventListener('click', () => moveHistory('forward'));
editor.addEventListener('input', renderPreview);
editor.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    onPatch();
  }
});

function onPatch() {
  // 1) 현재 테스트 영역 상태 → 새 Virtual DOM
  const nextVdom = htmlToVdom(editor.value);
  // 2) 이전 Virtual DOM과 비교
  const patches = diff(history.current, nextVdom);
  if (patches.length === 0) {
    addLog('Patch', [], 0, '변경된 부분이 없습니다.');
    return;
  }
  // 3) 변경된 부분만 실제 영역에 반영
  const mutations = applyToActual(patches);
  // 4) 새 Virtual DOM을 기록에 저장
  history.push(nextVdom);
  updateHistoryButtons();
  addLog('Patch', patches, mutations);
}

function moveHistory(direction) {
  const from = history.current;
  const to = direction === 'back' ? history.back() : history.forward();
  if (!to) return;

  // 기록 이동도 diff → patch로 처리해서 실제 영역은 바뀐 부분만 갱신한다.
  const patches = diff(from, to);
  const mutations = applyToActual(patches);
  showInTestArea(to);
  updateHistoryButtons();
  addLog(direction === 'back' ? '뒤로가기' : '앞으로가기', patches, mutations);
}

/** patch를 적용하고 실제로 일어난 DOM 변경 횟수를 반환한다. */
function applyToActual(patches) {
  observer.takeRecords();
  const changed = patch(actual, patches);
  const mutations = observer.takeRecords().length;
  highlight(changed);
  return mutations;
}

function showInTestArea(vdom) {
  editor.value = vdomToHtml(vdom);
  renderRoot(preview, vdom);
}

function renderPreview() {
  renderRoot(preview, htmlToVdom(editor.value));
}

function updateHistoryButtons() {
  backButton.disabled = !history.canBack();
  forwardButton.disabled = !history.canForward();
  historyStatus.textContent = `기록 ${history.index + 1} / ${history.length}`;
}

/** 바뀐 노드를 잠깐 강조한다. (Web Animations API는 DOM 속성을 바꾸지 않아 Virtual DOM과 어긋나지 않는다) */
function highlight(changed) {
  for (const { type, node } of changed) {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el?.animate) continue;
    const color = type === PATCH.REMOVE ? 'rgba(239, 68, 68, 0.35)' : 'rgba(250, 204, 21, 0.55)';
    el.animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }], {
      duration: 1200,
      easing: 'ease-out',
    });
  }
}

// ── 로그 ─────────────────────────────────────────────────
function addLog(action, patches, mutations, message) {
  const item = document.createElement('li');

  const head = document.createElement('div');
  head.className = 'log-head';
  head.textContent = `${action} · ${message ?? `변경 ${patches.length}건 · 실제 DOM 조작 ${mutations}회`}`;
  item.appendChild(head);

  if (patches.length > 0) {
    const list = document.createElement('ul');
    for (const p of patches) {
      const row = document.createElement('li');
      const badge = document.createElement('span');
      badge.className = `badge badge-${p.type.toLowerCase()}`;
      badge.textContent = p.type;
      row.append(badge, ` [${p.path.join(', ')}] ${describePatch(p)}`);
      list.appendChild(row);
    }
    item.appendChild(list);
  }

  patchLog.prepend(item);
}

function describePatch(p) {
  switch (p.type) {
    case PATCH.CREATE:
    case PATCH.REPLACE:
      return describeNode(p.node);
    case PATCH.REMOVE:
      return '노드 삭제';
    case PATCH.TEXT:
      return `"${p.text}"`;
    case PATCH.PROPS: {
      const set = Object.entries(p.set).map(([k, v]) => `${k}="${v}"`);
      const removed = p.remove.map((k) => `-${k}`);
      return [...set, ...removed].join(' ');
    }
    default:
      return '';
  }
}

function describeNode(vnode) {
  return vnode.type === '#text' ? `텍스트 "${vnode.text}"` : `<${vnode.type}>`;
}
