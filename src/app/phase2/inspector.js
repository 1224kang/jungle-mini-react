/**
 * 인스펙터: App의 hooks 배열, 렌더 횟수, 실행 로그를 보여 준다.
 *
 * 일부러 Mini React 바깥(일반 DOM 조작)으로 만든다.
 * 로그를 App의 state에 넣으면 "로그 추가 → 렌더 → 로그 추가 → 렌더 ..." 무한 반복이 되기 때문이다.
 */

const MAX_LOG = 60;

const renderCountEl = document.querySelector('#render-count');
const hooksBody = document.querySelector('#hooks-body');
const logList = document.querySelector('#event-log');

document.querySelector('#btn-clear-log').addEventListener('click', () => logList.replaceChildren());

/** 실행 로그 한 줄 추가. kind: render | effect | cleanup | memo | error */
export function log(kind, message) {
  const li = document.createElement('li');
  const badge = document.createElement('span');
  badge.className = `badge badge-${kind}`;
  badge.textContent = kind;
  li.append(badge, message);
  logList.prepend(li);
  while (logList.children.length > MAX_LOG) logList.lastElementChild.remove();
}

/** FunctionComponent의 onCommit 옵션에 넘길 함수 */
export function onCommit(component, { phase, patches }) {
  log('render', `${phase} #${component.renderCount} · patch ${patches.length}개${summarize(patches)}`);
  renderCountEl.textContent = component.renderCount;
  // effect가 실행된 뒤의 hooks 배열(cleanup 포함)을 보여 주기 위해 한 박자 늦게 그린다.
  queueMicrotask(() => drawHooks(component.hooks));
}

/**
 * patch 종류별 개수. 예) " (TEXT 1, PROPS 8)"
 * 컴포넌트는 렌더마다 onClick 같은 함수를 새로 만들기 때문에 버튼마다 PROPS 패치가 생긴다.
 */
function summarize(patches) {
  if (patches.length === 0) return '';
  const counts = {};
  for (const p of patches) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return ` (${Object.entries(counts).map(([type, n]) => `${type} ${n}`).join(', ')})`;
}

function drawHooks(hooks) {
  hooksBody.replaceChildren(
    ...hooks.map((hook, index) => {
      const tr = document.createElement('tr');
      tr.append(
        cell(`[${index}]`),
        cell(hook.kind, `kind kind-${hook.kind}`),
        cell(describeValue(hook)),
        cell(hook.kind === 'state' ? '—' : formatDeps(hook.deps)),
      );
      return tr;
    }),
  );
}

function describeValue(hook) {
  if (hook.kind === 'state') return format(hook.value);
  if (hook.kind === 'memo') return format(hook.value);
  return hook.cleanup ? 'cleanup 함수 보관 중' : 'cleanup 없음';
}

function formatDeps(deps) {
  if (deps === undefined) return '(없음: 매번)';
  return `[${deps.map(format).join(', ')}]`;
}

function format(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}
