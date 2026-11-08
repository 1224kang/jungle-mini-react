// Mini React Phase 1 데모 앱.
//
// 전체 흐름 지도는 app/main.js 맨 위에 있습니다. 이 파일은 [2] ~ [5] 를 담고 있습니다.
//   ◀ [1] main.js 가 initApp 을 부름
//
// 흐름 (과제 요구사항 순서 그대로)
//   로드    실제 영역의 샘플 HTML(DOM) → Virtual DOM 변환 → 그 Virtual DOM 으로 테스트 영역 렌더링
//   편집    테스트 영역(화면 / HTML 코드)을 자유롭게 수정. MutationObserver 가 변화를 감지
//   Patch   테스트 영역 상태 → 새 Virtual DOM → 이전과 Diff → 바뀐 부분만 실제 영역에 반영 → 기록 저장
//   이동    뒤로가기 / 앞으로가기 → 기록 속 Virtual DOM 으로 실제 영역과 테스트 영역을 함께 변경

import { domToVNode, parseHTML, prettyHTML, stripBlankNodes } from '../lib/vdom/convert.js';
import { countNodes } from '../lib/vdom/vnode.js';
import { createDOM } from '../lib/dom/create.js';
import { diff } from '../lib/reconcile/diff.js';
import { describePatches } from '../lib/reconcile/describe.js';
import { applyPatches } from '../lib/reconcile/patch.js';
import { StateHistory } from './history.js';

const TEXT_NODE = 3;

// [2] 로드 시작. 이 함수 안에서 위에서 아래로 읽으면 [2] → [3] → [4] → [5] 순서입니다.
export function initApp(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const actual = $('actual');
  const pane = $('test-pane');
  const code = $('test-code');
  const btnPatch = $('btn-patch');
  const btnBack = $('btn-back');
  const btnForward = $('btn-forward');
  const logEl = $('log');
  const dirtyEl = $('dirty');
  const historyView = $('history-view');
  const patchSummary = $('patch-summary');
  const patchList = $('patch-list');

  const log = (msg) => {
    logEl.textContent = msg;
  };

  // ── [3-1] 변화 감지 (MutationObserver) ──────────────────────────────────
  // (준비만 해 두는 단계. 실제로 불리는 때는 사용자가 테스트 영역을 고친 [3] 편집 중입니다.)
  // 테스트 영역 DOM 이 바뀔 때마다 건수를 세어 "아직 Patch 하지 않은 변경" 을 알려 줍니다.
  let dirty = 0;
  function showDirty() {
    dirtyEl.textContent = dirty > 0 ? `변경 감지: ${dirty}건 (Patch 로 실제 영역에 반영)` : '변경 없음';
    btnPatch.classList.toggle('attention', dirty > 0);
  }
  const Observer = doc.defaultView.MutationObserver;
  const observer = new Observer((records) => {
    dirty += records.length;
    showDirty();
  });
  observer.observe(pane, { subtree: true, childList: true, attributes: true, characterData: true });

  // ── [2] 로드: 실제 영역 DOM → Virtual DOM ───────────────────────────────
  // [2-1] 공백 노드 정리     ▶ 다음: convert.js stripBlankNodes → 끝나면 [2-2]
  stripBlankNodes(actual); // VNode 와 DOM 의 자식 인덱스를 맞추기 위해 공백 노드를 정리
  const root = actual.firstElementChild;
  if (!root) {
    log('실제 영역에 샘플 HTML 이 없습니다.');
    return null;
  }

  // [2-2] DOM → Virtual DOM  ▶ 다음: convert.js domToVNode → 끝나면 [2-3]
  let current = domToVNode(root); // 지금 실제 영역에 보이는 상태의 Virtual DOM
  // [2-3] 첫 기록 저장       ▶ 다음: history.js constructor → 끝나면 [2-4]
  const history = new StateHistory(current);

  // [2-4] 방금 만든 Virtual DOM 으로 테스트 영역을 렌더링 (화면 + HTML 코드)
  //   ▶ 다음: create.js createDOM (화면), convert.js prettyHTML (코드 칸)
  //   ※ [2] 로드 때, [4-5] Patch 후, [5] 뒤로/앞으로 후에 계속 다시 불립니다.
  function renderTest(v) {
    pane.replaceChildren(createDOM(v));
    code.value = prettyHTML(v);
    observer.takeRecords(); // 우리가 직접 그린 변화는 "사용자 변경" 으로 세지 않는다
    dirty = 0;
    showDirty();
  }

  renderTest(current);
  renderHistory();
  log(`로드: 실제 영역 DOM → Virtual DOM 변환 (노드 ${countNodes(current)}개), 테스트 영역 렌더링 완료.`);

  // ── [3] 편집: 테스트 영역 읽기 / 편집 ───────────────────────────────────
  // [4-1] "현재 테스트 영역 상태" 를 DOM 에서 다시 읽어 Virtual DOM 으로 만듭니다.
  //   ◀ 부른 곳: Patch 버튼 핸들러 [4], 예시 편집 버튼, pane input   ▶ 다음: convert.js domToVNode
  function readPane() {
    const el = pane.firstElementChild;
    return el ? domToVNode(el) : null;
  }

  // [3-2] 화면(contenteditable)을 직접 고치면 HTML 코드 칸을 따라 바꿉니다.
  //   ▶ 다음: readPane [4-1] → prettyHTML.  Patch 를 눌러야 [4] 로 넘어갑니다.
  pane.addEventListener('input', () => {
    const v = readPane();
    if (v) code.value = prettyHTML(v);
  });

  // [3-3] HTML 코드 칸을 고치면 화면을 다시 그립니다.
  //   ▶ 다음: convert.js parseHTML → create.js createDOM.  Patch 를 눌러야 [4] 로 넘어갑니다.
  code.addEventListener('input', () => {
    const v = parseHTML(code.value);
    if (!v) {
      log('HTML 에 루트 요소가 없습니다.');
      return;
    }
    pane.replaceChildren(createDOM(v));
  });

  // ── [4] / [5] 패치 반영 ─────────────────────────────────────────────
  // 옛 Virtual DOM(current) → next 로 실제 영역을 패치하고 화면 상태를 갱신합니다.
  //   ◀ 부른 곳: [4] Patch 버튼, [5] 뒤로가기/앞으로가기 버튼
  function commit(next) {
    // [4-2] Diff             ▶ reconcile/diff.js diff()
    const patches = diff(current, next);
    // [4-3] 패치 설명 만들기  ▶ reconcile/describe.js describePatches()
    const lines = describePatches(current, patches);
    // [4-4] 실제 영역에 반영  ▶ reconcile/patch.js applyPatches()
    const { touched } = applyPatches(actual, patches);
    const total = countNodes(next);

    // [4-5] 화면 갱신: 기준 상태 교체 → 테스트 영역 다시 그림 → 패치 목록/요약 → 깜빡임
    current = next;
    renderTest(current); // ▶ [2-4] 와 같은 함수
    showPatches(lines, touched.size, total);
    flash(touched);
    return lines.length;
  }

  // [4-5] "이번 패치" 목록과 요약 문장 표시
  function showPatches(lines, touchedCount, total) {
    patchList.replaceChildren(
      ...lines.map((l) => {
        const li = doc.createElement('li');
        const tag = doc.createElement('span');
        tag.className = `op op-${l.op.toLowerCase()}`;
        tag.textContent = l.op;
        li.append(tag, ' ', l.text);
        return li;
      })
    );
    patchSummary.textContent =
      lines.length === 0
        ? '패치 없음'
        : `패치 ${lines.length}개 · 건드린 DOM 노드 ${touchedCount}개 (전체 다시 그렸다면 ${total}개)`;
  }

  // [4-5] 바뀐 부분만 잠깐 강조해서 "일부만 업데이트" 임을 눈으로 볼 수 있게 합니다.
  // class 를 건드리면 실제 DOM 이 Virtual DOM 과 어긋나므로, 속성을 바꾸지 않는 Web Animations 를 씁니다.
  function flash(touched) {
    const color = doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--flash').trim() || '#ffe58a';
    for (const node of touched) {
      const el = node.nodeType === TEXT_NODE ? node.parentElement : node;
      if (el && typeof el.animate === 'function') {
        el.animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }], 900);
      }
    }
  }

  // ── [4-6] / [5] 기록 표시 ───────────────────────────────────────────
  // 기록 칩(#1, #2 …)과 뒤로/앞으로 버튼의 활성 상태를 history 에 맞춥니다.
  function renderHistory() {
    historyView.replaceChildren(
      ...history.items.map((_, i) => {
        const chip = doc.createElement('span');
        chip.className = 'chip' + (i === history.cursor ? ' on' : '');
        chip.textContent = `#${i + 1}`;
        return chip;
      })
    );
    btnBack.disabled = history.cursor === 0;
    btnForward.disabled = history.cursor === history.items.length - 1;
  }

  // ── 버튼 ───────────────────────────────────────────────────────────
  // [4] Patch 버튼: 읽기 → Diff → 반영 → 기록
  btnPatch.addEventListener('click', () => {
    const next = readPane(); // [4-1] 테스트 영역 → 새 Virtual DOM
    if (!next) {
      log('테스트 영역에 루트 요소가 없습니다.');
      return;
    }
    const count = commit(next); // [4-2] ~ [4-5]  (위 commit 함수로 이동)
    if (count === 0) {
      log('변경 없음. 기록은 남기지 않습니다.');
      return;
    }
    history.push(next); // [4-6] 새 Virtual DOM 을 기록에 저장  ▶ history.js push
    renderHistory();
    log(`Patch: 패치 ${count}개를 실제 영역에 반영하고 기록 #${history.cursor + 1} 로 저장.`);
  });

  // [5] 뒤로가기: 기록에서 이전 Virtual DOM 을 꺼내 [4-2] ~ [4-5] 로 두 영역에 적용
  btnBack.addEventListener('click', () => {
    if (history.cursor === 0) return;
    const count = commit(history.back()); // ▶ history.js back → commit
    renderHistory();
    log(`뒤로가기: 기록 #${history.cursor + 1} 로 이동 (패치 ${count}개).`);
  });

  // [5] 앞으로가기: 기록에서 다음 Virtual DOM 을 꺼내 [4-2] ~ [4-5] 로 두 영역에 적용
  btnForward.addEventListener('click', () => {
    if (history.cursor === history.items.length - 1) return;
    const count = commit(history.forward()); // ▶ history.js forward → commit
    renderHistory();
    log(`앞으로가기: 기록 #${history.cursor + 1} 로 이동 (패치 ${count}개).`);
  });

  // ── [3] 예시 편집: 핵심 변화를 한 번에 만들어 보는 버튼들 ─────────────
  // 테스트 영역 DOM 만 바꿉니다 (실제 영역은 그대로). 이어서 [4] Patch 를 눌러야 반영됩니다.
  let seq = 0;

  function firstText(node) {
    for (const c of node.childNodes) {
      if (c.nodeType === TEXT_NODE && c.nodeValue.trim() !== '') return c;
      if (c.nodeType === 1) {
        const found = firstText(c);
        if (found) return found;
      }
    }
    return null;
  }

  const edits = {
    // 텍스트 변경
    text(el) {
      const t = firstText(el.querySelector('li') ?? el);
      if (t) t.nodeValue += ' (수정)';
    },
    // 속성 변경
    attr(el) {
      el.classList.toggle('highlight');
    },
    // 태그(타입) 변경: h2 ↔ h3
    tag(el) {
      const h = el.querySelector('h2, h3');
      if (!h) return;
      const to = doc.createElement(h.tagName === 'H2' ? 'h3' : 'h2');
      for (const a of h.attributes) to.setAttribute(a.name, a.value);
      to.append(...h.childNodes);
      h.replaceWith(to);
    },
    // 자식 추가
    add(el) {
      const ul = el.querySelector('ul');
      if (!ul) return;
      seq += 1;
      const li = doc.createElement('li');
      li.setAttribute('key', `n${seq}`);
      li.textContent = `새 항목 ${seq}`;
      ul.appendChild(li);
    },
    // 자식 삭제
    remove(el) {
      el.querySelector('ul')?.lastElementChild?.remove();
    },
    // 순서 뒤집기 (key 가 있으면 이동으로 처리)
    reorder(el) {
      const ul = el.querySelector('ul');
      if (!ul) return;
      [...ul.children].reverse().forEach((li) => ul.appendChild(li));
    },
  };

  doc.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = pane.firstElementChild;
      if (!el) return;
      edits[btn.dataset.edit]?.(el);
      const v = readPane();
      if (v) code.value = prettyHTML(v);
    });
  });

  return {
    getCurrent: () => current,
    history,
    observer,
  };
}
