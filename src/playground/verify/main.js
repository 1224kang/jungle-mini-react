// 검증 페이지 UI. DOM과 무관한 로직은 history / serialize / parse / patchLog / compare 모듈에 있다.
import { domToVdom, render, diff, patch } from '../../lib/index.js';
import { createHistory } from './history.js';
import { serialize } from './serialize.js';
import { parseHtml } from './parse.js';
import { toLogRows, countByType } from './patchLog.js';
import { firstDifference } from './compare.js';
import { takeSnapshot, compareSnapshots, nodeAtPath } from './domStats.js';

const $ = (id) => document.getElementById(id);
const ui = {
  patch: $('btn-patch'),
  back: $('btn-back'),
  forward: $('btn-forward'),
  pos: $('history-pos'),
  consistency: $('consistency'),
  message: $('message'),
  stats: $('stats'),
  editor: $('editor'),
  parseStatus: $('parse-status'),
  receipt: $('receipt'),
  logSummary: $('log-summary'),
  historyList: $('history-list'),
};

// Shadow DOM 안 기본 스타일 (adoptedStyleSheets: 검증 대상 DOM 트리에 노드를 추가하지 않는다)
const stageSheet = new CSSStyleSheet();
stageSheet.replaceSync(`
  :host { display: block; font-family: system-ui, sans-serif; font-size: 14px; }
  .done { text-decoration: line-through; }
  input { font: inherit; padding: 4px 6px; margin-left: 4px; }
`);

function openShadow(host) {
  let root = host.shadowRoot;
  if (!root) {
    // Declarative Shadow DOM 미지원 브라우저: 남아 있는 <template shadowrootmode>를 직접 옮긴다.
    const tpl = host.querySelector('template');
    root = host.attachShadow({ mode: 'open' });
    if (tpl) {
      root.append(tpl.content.cloneNode(true));
      tpl.remove();
    }
  }
  root.adoptedStyleSheets = [stageSheet];
  return root;
}

const realShadow = openShadow($('real-host'));

// ---------- 초기화 ----------
// 1) 실제 영역의 샘플 DOM → VNode
// 2) 원본 DOM에는 VNode에서 버려진 들여쓰기 공백이 남아 있어 patch 경로가 맞지 않으므로,
//    render(vnode)로 다시 그려 교체한 뒤부터 patch한다 (docs/diff-patch.md 1장).
const sampleEl = realShadow.firstElementChild;
const history = createHistory(domToVdom(sampleEl));
let realRoot = render(history.current());
sampleEl.replaceWith(realRoot);

ui.editor.value = serialize(history.current());
// 히스토리 항목 라벨 (history와 같은 인덱스). 브라우저 히스토리 항목도 같은 인덱스를 state로 가진다.
const labels = [{ title: '초기 상태', sub: '샘플' }];
window.history.replaceState({ i: 0 }, '');
updateNav();
checkConsistency({ label: '초기 렌더' });

// ---------- 이벤트 ----------
let debounceTimer = 0;
ui.editor.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => tryParse(ui.editor.value), 250);
});
ui.patch.addEventListener('click', onPatch);
// 모든 이동은 브라우저 히스토리를 거친다 → popstate 하나로 버튼·목록·브라우저 버튼이 같은 경로를 탄다.
ui.back.addEventListener('click', () => window.history.back());
ui.forward.addEventListener('click', () => window.history.forward());
window.addEventListener('popstate', (e) => {
  const i = e.state?.i;
  if (Number.isInteger(i) && i !== history.index) jumpTo(i);
});

/** textarea 내용을 파싱한다. 실패하면 상태를 표시하고 null. */
function tryParse(html) {
  try {
    const result = parseHtml(html, document);
    if (result.warnings.length) {
      setStatus(ui.parseStatus, 'warn', `안전 정책으로 제거됨:\n- ${result.warnings.join('\n- ')}`);
    } else {
      setStatus(ui.parseStatus, '', '파싱 정상');
    }
    return result;
  } catch (err) {
    setStatus(ui.parseStatus, 'error', `파싱 실패: ${err.message}`);
    return null;
  }
}

function onPatch() {
  clearTimeout(debounceTimer);
  const result = tryParse(ui.editor.value);
  if (!result) {
    setStatus(ui.message, 'error', 'HTML을 파싱할 수 없어 Patch하지 않았습니다.');
    return;
  }
  const oldVNode = history.current();
  const newVNode = result.vnode;
  const patches = diff(oldVNode, newVNode);
  if (patches.length === 0) {
    showReceipt(oldVNode, patches, '변경 사항 없음');
    setStatus(ui.message, '', '변경 사항 없음 (history에 저장하지 않음)');
    ui.stats.textContent = '변경 사항 없음';
    checkConsistency({ label: '변경 없음' });
    return;
  }
  const title = `히스토리 ${history.index + 1} → ${history.index + 2}`;
  if (!applyPatches(oldVNode, newVNode, patches, title)) return;
  history.push(newVNode);
  labels.splice(history.index);
  labels.push({ title: `Patch #${history.index}`, sub: `명령 ${patches.length}개` });
  window.history.pushState({ i: history.index }, '');
  updateNav();
  setStatus(ui.message, '', `Patch 적용: 명령 ${patches.length}개 → history ${history.index + 1}번째로 저장`);
  checkConsistency({ label: 'Patch', newVNode });
}

/** 히스토리의 i번째 상태로 이동한다 (diff → patch로 실제 영역을 맞춘다). */
function jumpTo(i) {
  const target = history.at(i);
  if (!target) return;
  const from = history.index;
  const oldVNode = history.current();
  const patches = diff(oldVNode, target);
  if (!applyPatches(oldVNode, target, patches, `히스토리 ${from + 1} → ${i + 1}`)) return;
  history.goTo(i);
  ui.editor.value = serialize(target);
  setStatus(ui.parseStatus, '', '');
  updateNav();
  setStatus(ui.message, '', `히스토리 ${i + 1}번째 상태로 이동: 명령 ${patches.length}개 적용`);
  checkConsistency({ label: `히스토리 ${i + 1}`, newVNode: target });
}

/**
 * diff 결과를 실제 영역에 patch하고 로그·노드 집계·강조를 표시한다. 실패하면 false.
 * patch()는 해석 단계에서 실패하면 DOM을 바꾸지 않는다(부분 적용 없음).
 */
function applyPatches(oldVNode, newVNode, patches, title) {
  const before = takeSnapshot(realRoot);
  const changedTargets = collectChangedTargets(patches);
  try {
    realRoot = patch(realRoot, patches);
  } catch (err) {
    setStatus(ui.message, 'error', `patch 실패 (DOM 변경 없음): ${err.message}`);
    return false;
  }
  const { reused, created, removed } = compareSnapshots(before, realRoot);
  ui.stats.textContent =
    `재사용 ${reused.length} · 새로 만듦 ${created.length} · 제거 ${removed.length}  (Element+Text, 루트 포함)`;
  showReceipt(oldVNode, patches, title);
  flash(changedTargets, created);
  return true;
}

/** Patch 전 DOM에서 강조할 노드(텍스트·속성·이동 대상)를 찾아 둔다. */
function collectChangedTargets(patches) {
  const out = [];
  for (const p of patches) {
    if (p.type === 'TEXT' || p.type === 'PROPS' || p.type === 'MOVE') {
      const node = nodeAtPath(realRoot, p.path);
      if (node) out.push({ node, kind: p.type });
    }
  }
  return out;
}

const COLORS = { TEXT: '#f0b400', PROPS: '#8250df', MOVE: '#0969da', CREATE: '#1a7f37' };

/**
 * 바뀐 노드를 잠깐 강조한다. Element.animate()는 class/style 속성을 바꾸지 않으므로
 * domToVdom 결과(일치 검사)에 영향을 주지 않는다. 텍스트 노드는 부모 요소를 강조한다.
 */
function flash(changedTargets, created) {
  const createdSet = new Set(created);
  const items = changedTargets.map(({ node, kind }) => ({ node, color: COLORS[kind] }));
  for (const node of created) {
    // 새로 만든 하위 트리는 가장 위 노드만 강조
    if (!createdSet.has(node.parentNode)) items.push({ node, color: COLORS.CREATE });
  }
  const seen = new Set();
  for (const { node, color } of items) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || seen.has(el) || typeof el.animate !== 'function') continue;
    seen.add(el);
    el.animate(
      [
        { boxShadow: `0 0 0 3px ${color}`, backgroundColor: `${color}33` },
        { boxShadow: '0 0 0 3px transparent', backgroundColor: 'transparent' },
      ],
      { duration: 1400, easing: 'ease-out' },
    );
  }
}

/** Patch[]를 영수증 형태로 그린다. 각 항목에 KEY / INDEX 배지를 붙여 무엇으로 대상을 식별했는지 보여준다. */
function showReceipt(oldVNode, patches, title) {
  const box = ui.receipt;
  box.replaceChildren();
  const add = (cls, text, parent = box, tag = 'div') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    parent.append(el);
    return el;
  };
  const hr = () => box.append(document.createElement('hr'));
  add('rc-title', 'PATCH RECEIPT');
  add('rc-sub', `${title ?? ''}  ${new Date().toLocaleTimeString('ko-KR')}`);
  hr();
  if (patches.length === 0) {
    ui.logSummary.textContent = '';
    add('', '변경 사항 없음');
    return;
  }
  const counts = countByType(patches);
  ui.logSummary.textContent = `명령 ${patches.length}개`;
  let byKey = 0;
  let byIndex = 0;
  for (const r of toLogRows(oldVNode, patches)) {
    if (r.by === 'KEY') byKey++;
    else byIndex++;
    const item = document.createElement('div');
    item.className = 'rc-item';
    const head = add('rc-head', '', item);
    add(`rc-type t-${r.type}`, `#${r.order} ${r.type}`, head, 'span');
    add(`rc-by ${r.by}`, r.by === 'KEY' ? `KEY=${r.key}` : 'INDEX', head, 'span');
    add('', r.path, head, 'span');
    add('rc-line', r.target, item);
    add('rc-change', `${r.from}  →  ${r.to}`, item);
    if (r.note) add('rc-line', `※ ${r.note}`, item);
    box.append(item);
  }
  hr();
  for (const [t, n] of Object.entries(counts)) {
    const line = add('rc-total', '');
    add(`t-${t}`, t, line, 'span');
    add('', `x ${n}`, line, 'span');
  }
  hr();
  const l1 = add('rc-total', '');
  add('', 'KEY로 식별', l1, 'span');
  add('', String(byKey), l1, 'span');
  const l2 = add('rc-total', '');
  add('', 'INDEX로 식별', l2, 'span');
  add('', String(byIndex), l2, 'span');
  hr();
  add('rc-sub', 'KEY: data-key가 있는 노드(key로 짝지음) / INDEX: key 없음(위치·같은 type 순서로 짝지음)');
}

/**
 * 실제 영역을 다시 VNode로 바꿔 현재 history와 비교한다.
 * 불일치면 원인을 단계별로 분리한다: 직렬화/파싱 왕복 → render 왕복 → (둘 다 정상이면) diff/patch 의심.
 */
function checkConsistency({ label, newVNode }) {
  const expected = history.current();
  let actual;
  try {
    actual = domToVdom(realRoot);
  } catch (err) {
    setBadge(false, `불일치 ✗ (${label})`, `실제 영역을 VNode로 바꿀 수 없음: ${err.message}`);
    return;
  }
  const d = firstDifference(expected, actual);
  if (!d) {
    setBadge(true, `일치 ✓ (${label})`, '실제 영역 DOM → VNode 결과가 현재 history VNode와 같습니다.');
    return;
  }
  const causes = [`첫 차이: ${d.path} — ${d.reason}`];
  const v = newVNode ?? expected;
  try {
    const round = parseHtml(serialize(v), document).vnode;
    const rd = firstDifference(v, round);
    causes.push(rd ? `직렬화→파싱 왕복 불일치 (${rd.path}: ${rd.reason}) → 파서/직렬화 쪽 문제 가능성` : '직렬화→파싱 왕복: 정상');
  } catch (err) {
    causes.push(`직렬화→파싱 왕복 실패: ${err.message}`);
  }
  const rd2 = firstDifference(v, domToVdom(render(v)));
  causes.push(rd2 ? `render 왕복 불일치 (${rd2.path}) → render/정규화 쪽 문제 가능성` : 'render 왕복: 정상');
  if (!causes.slice(1).some((c) => c.includes('불일치') || c.includes('실패'))) {
    causes.push('파싱·직렬화·render가 모두 정상이므로 diff/patch 결함이 의심됩니다 (재현 조건을 기록해 주세요).');
  }
  setBadge(false, `불일치 ✗ (${label})`, causes.join('\n'));
  console.warn('[verify] 불일치', { expected, actual, causes });
}

function setBadge(ok, text, title) {
  ui.consistency.textContent = text;
  ui.consistency.className = `badge ${ok ? 'ok' : 'bad'}`;
  ui.consistency.title = title;
  if (!ok) setStatus(ui.message, 'error', title);
}

function updateNav() {
  ui.pos.textContent = `${history.index + 1} / ${history.length}`;
  ui.back.disabled = !history.canBack;
  ui.forward.disabled = !history.canForward;
  ui.historyList.replaceChildren();
  for (let i = 0; i < history.length; i++) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    if (i === history.index) btn.className = 'current';
    const no = document.createElement('span');
    no.className = 'h-no';
    no.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.textContent = labels[i]?.title ?? '';
    const sub = document.createElement('span');
    sub.className = 'h-sub';
    sub.textContent = labels[i]?.sub ?? '';
    btn.append(no, name, sub);
    btn.addEventListener('click', () => {
      if (i !== history.index) window.history.go(i - history.index);
    });
    li.append(btn);
    ui.historyList.append(li);
  }
}

function setStatus(el, kind, text) {
  el.className = el.className.replace(/\b(error|warn)\b/g, '').trim() + (kind ? ` ${kind}` : '');
  el.textContent = text;
}

// 개발 도구에서 상태를 볼 수 있게 노출 (읽기용)
window.__verify = { history, get realRoot() { return realRoot; } };
