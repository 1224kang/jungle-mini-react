// [Phase 1 데모] 과제 요구사항을 그대로 따라가는 검증 페이지.
//
//   로드    "실제 영역" 의 샘플 HTML(DOM) → Virtual DOM 으로 변환 → 그 Virtual DOM 으로 "테스트 영역" 렌더링
//   편집    사용자가 테스트 영역을 자유롭게 수정 (MutationObserver 가 변화를 감지해 "변경 N건" 표시)
//   Patch   테스트 영역을 다시 Virtual DOM 으로 → 이전 것과 Diff → 바뀐 부분만 "실제 영역" 에 반영 → State History 에 저장
//   이동    뒤로가기 / 앞으로가기 → 기록 속 Virtual DOM 으로 실제 영역과 테스트 영역을 함께 변경
import { domToVNode, removeBlankNodes, createDOM, diff, applyPatches, StateHistory } from './mini-react.js';

// 패치 하나를 사람이 읽을 한 줄로 (화면의 "이번 패치" 목록용)
export function describePatch(p) {
  const where = p.path.length ? `[${p.path.join(', ')}]` : '루트'; // 옛 트리 기준 자식 인덱스 경로
  const label = (v) => (typeof v === 'string' ? `"${v}"` : `<${v.type}>`);
  if (p.op === 'TEXT') return `${where} 글자 → "${p.value}"`;
  if (p.op === 'PROPS') {
    const parts = [...Object.keys(p.set), ...p.remove.map((k) => `${k} 제거`)];
    return `${where} 속성: ${parts.join(', ')}`;
  }
  if (p.op === 'REPLACE') return `${where} → ${label(p.value)} 로 교체`;
  if (p.op === 'REMOVE') return `${where} 삭제`;
  const creates = p.plan.filter((e) => 'create' in e).length;
  return `${where} 자식 배치 (새로 만듦 ${creates}개)`;
}

export function flash(touched) {
  for (const node of touched) {
    const el = node.nodeType === 3 ? node.parentElement : node;
    if (el && el.animate) el.animate([{ backgroundColor: '#ffe58a' }, { backgroundColor: 'transparent' }], 900);
  }
}

export function initPhase1(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const actual = $('actual'); // 실제 영역
  const pane = $('test-pane'); // 테스트 영역 (contenteditable)
  const btnPatch = $('btn-patch');
  const btnBack = $('btn-back');
  const btnForward = $('btn-forward');

  // ── 로드 ──────────────────────────────────────────────
  removeBlankNodes(actual); // 공백 노드를 지워서 VNode 의 자식 인덱스 = DOM 의 자식 인덱스
  let current = domToVNode(actual.firstElementChild); // 실제 영역에 지금 보이는 상태의 Virtual DOM
  const history = new StateHistory(current);

  // 테스트 영역을 Virtual DOM 으로 그립니다 (로드 / Patch 후 / 뒤로·앞으로 후에 계속 불림)
  function renderTest(vnode) {
    pane.replaceChildren(createDOM(vnode));
    observer.takeRecords(); // 우리가 그린 변화는 "사용자 변경" 이 아님
    dirty = 0;
    showStatus();
  }

  // ── 편집: MutationObserver 로 테스트 영역의 변화를 감지 ─────
  let dirty = 0;
  const observer = new doc.defaultView.MutationObserver((records) => {
    dirty += records.length;
    showStatus();
  });
  observer.observe(pane, { subtree: true, childList: true, attributes: true, characterData: true });

  function showStatus() {
    $('p1-dirty').textContent = dirty > 0 ? `변경 감지: ${dirty}건 (Patch 로 실제 영역에 반영)` : '변경 없음';
    btnBack.disabled = history.cursor === 0;
    btnForward.disabled = history.cursor === history.items.length - 1;
    $('p1-history').textContent = `State History: ${history.cursor + 1} / ${history.items.length}`;
  }

  // 옛 Virtual DOM(current) → next 로 실제 영역을 Diff + Patch 하고 화면을 갱신합니다 (Patch, 뒤로, 앞으로 공통)
  function commit(next) {
    const patches = diff(current, next);
    const touched = applyPatches(actual, patches); // 실제 영역에는 바뀐 곳만 반영
    current = next;
    renderTest(current);
    $('p1-patches').replaceChildren(
      ...(patches.length ? patches : [null]).map((p) => {
        const li = doc.createElement('li');
        li.textContent = p ? `${p.op}  ${describePatch(p)}` : '(바뀐 것이 없어요)';
        return li;
      })
    );
    flash(touched);
    return patches.length;
  }

  renderTest(current);

  // ── Patch 버튼 ──
  btnPatch.addEventListener('click', () => {
    const el = pane.firstElementChild;
    if (!el) return; // 테스트 영역을 전부 지운 경우
    const next = domToVNode(el); // 현재 테스트 영역 → 새 Virtual DOM
    if (commit(next) > 0) history.push(next); // 바뀐 게 있을 때만 기록
    showStatus(); // 기록이 바뀐 뒤에 버튼 상태 / "n / m" 을 다시 맞춤
  });

  // ── 뒤로가기 / 앞으로가기 ──
  btnBack.addEventListener('click', () => commit(history.back()));
  btnForward.addEventListener('click', () => commit(history.forward()));

  return { history, getCurrent: () => current };
}
