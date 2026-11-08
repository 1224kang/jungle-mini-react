// [Phase 2 데모] 디버그 패널. 미니 리액트 트리 "바깥" 의 일반 DOM 으로 그립니다 (미니 리액트가 자기 화면을 덮어쓰지 않게).
// FunctionComponent 의 onCommit 으로 받은 정보를 보여 줍니다:
//   - 렌더 횟수, hooks 배열 (칸 번호 / 종류 / 값)
//   - 이번 렌더의 패치 목록 (Phase 1 의 diff 결과)과 "실제로 건드린 DOM 노드 수 / 전체 노드 수"
//   - effect / useMemo 실행 로그
import { describePatches } from '../lib/reconcile/describe.js';
import { countNodes } from '../lib/vdom/vnode.js';

const LOG_LIMIT = 40;

function short(text, n = 60) {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

function show(value) {
  if (typeof value === 'function') return 'ƒ';
  try {
    return short(JSON.stringify(value) ?? String(value));
  } catch {
    return String(value);
  }
}

export function describeHook(slot) {
  if (slot.kind === 'state') return show(slot.value);
  if (slot.kind === 'memo') return `${show(slot.value)}   deps=${show(slot.deps)}`;
  return `deps=${slot.deps === undefined ? '없음(매 렌더)' : show(slot.deps)}  cleanup=${typeof slot.cleanup === 'function' ? '있음' : '없음'}`;
}

export function createDebugPanel(doc) {
  const $ = (id) => doc.getElementById(id);
  const els = {
    renders: $('dbg-renders'),
    summary: $('dbg-summary'),
    hooks: $('dbg-hooks'),
    patches: $('dbg-patches'),
    log: $('dbg-log'),
    memo: $('dbg-memo'),
  };
  const memoRuns = {};
  const logs = [];
  let component = null;

  function li(className, ...parts) {
    const node = doc.createElement('li');
    if (className) node.className = className;
    node.append(...parts);
    return node;
  }

  function span(className, text) {
    const s = doc.createElement('span');
    s.className = className;
    s.textContent = text;
    return s;
  }

  function renderLog() {
    els.log.replaceChildren(...logs.map(({ tag, msg }) => li('', span('op', `#${tag}`), ' ', msg)));
  }

  function renderMemo() {
    els.memo.textContent = Object.entries(memoRuns)
      .map(([k, v]) => `${k} 계산 ${v}회`)
      .join(' · ');
  }

  function flash(touched) {
    for (const node of touched) {
      const el = node.nodeType === 3 ? node.parentElement : node;
      if (el && typeof el.animate === 'function') {
        el.animate([{ backgroundColor: '#ffe58a' }, { backgroundColor: 'transparent' }], 900);
      }
    }
  }

  return {
    attach(c) {
      component = c;
    },

    // 앱에 내려 주는 콜백들
    log(msg) {
      logs.unshift({ tag: component ? component.renderCount : 0, msg });
      if (logs.length > LOG_LIMIT) logs.pop();
      renderLog();
    },
    onMemo(name) {
      memoRuns[name] = (memoRuns[name] ?? 0) + 1;
      renderMemo();
    },

    // FunctionComponent 의 onCommit
    onCommit({ isMount, patches, touched, prevTree, tree, renderCount }) {
      els.renders.textContent = String(renderCount);
      const total = countNodes(tree);

      const lines = isMount ? [] : describePatches(prevTree, patches);
      const dom = lines.filter((l) => l.op !== 'HANDLER');
      const handlers = lines.length - dom.length;

      els.summary.textContent = isMount
        ? `처음 렌더: 노드 ${total}개를 모두 만들었어요.`
        : `DOM 변경 ${touched.size}곳 / 전체 노드 ${total}개 · 패치 ${dom.length}건` +
          (handlers ? ` · 이벤트 핸들러 교체 ${handlers}건(화면 변화 없음)` : '');

      els.patches.replaceChildren(
        ...(dom.length === 0
          ? [li('', isMount ? '(mount 는 패치 없이 통째로 그립니다)' : '(바뀐 DOM 이 없어요)')]
          : dom.map((l) => li('', span(`op op-${l.op.toLowerCase()}`, l.op), ' ', l.text)))
      );

      // hooks 배열 표: 칸 번호 = Hook 호출 순서
      els.hooks.replaceChildren(
        ...component.hooks.map((slot, i) => {
          const tr = doc.createElement('tr');
          for (const text of [String(i), slot.kind, describeHook(slot)]) {
            const td = doc.createElement('td');
            td.textContent = text;
            tr.append(td);
          }
          return tr;
        })
      );

      if (!isMount) flash(touched);
    },
  };
}
