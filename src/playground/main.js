import { domToVdom, render, diff, patch } from '../lib/index.js';
import { cases } from '../../fixtures/cases.js';

const $ = (id) => document.getElementById(id);
const select = $('case-select');
const input = $('html-input');

// fixture마다 before/after 두 HTML을 선택지로 만든다.
const fixtures = cases.flatMap(({ name, before, after }) => [
  { label: `${name} (before)`, html: before },
  { label: `${name} (after)`, html: after },
]);
fixtures.forEach((f, i) => select.add(new Option(f.label, i)));

select.addEventListener('change', () => {
  input.value = fixtures[select.value].html;
  convert();
});
$('btn-convert').addEventListener('click', convert);
$('btn-check-all').addEventListener('click', checkAll);

input.value = fixtures[0].html;
convert();

/**
 * HTML 문자열을 파싱해 단일 루트 노드를 돌려준다. 루트 앞뒤의 공백·주석은 무시한다.
 * Element가 아닌 노드(텍스트 등)는 그대로 넘겨 domToVdom이 범위 밖 에러를 내게 한다.
 */
function parseRoot(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const nodes = [...tpl.content.childNodes].filter(
    (n) => !(n.nodeType === Node.COMMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.data.trim() === '')),
  );
  if (nodes.length !== 1) {
    throw new Error(`단일 루트 요소가 필요합니다 (찾은 최상위 노드 ${nodes.length}개)`);
  }
  return nodes[0];
}

/** 두 값을 비교해 다른 곳의 경로 목록을 돌려준다. */
function differences(a, b, path = 'v', out = []) {
  if (Object.is(a, b)) return out;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path, expected: a, actual: b });
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const next = Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
    if (!(k in a) || !(k in b)) out.push({ path: next, expected: a[k], actual: b[k] });
    else differences(a[k], b[k], next, out);
  }
  return out;
}

/** 왕복 검사: domToVdom(render(v))와 v가 같은지. */
function roundTrip(vnode) {
  const rendered = render(vnode);
  return { rendered, diffs: differences(vnode, domToVdom(rendered)) };
}

function showError(el, err) {
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = `⚠️ ${err.message}`;
  el.replaceChildren(div);
}

const fmt = (v) => (v === undefined ? '(없음)' : JSON.stringify(v));

function convert() {
  const html = input.value;
  const original = $('out-original');
  const vnodeOut = $('out-vnode');
  const rendered = $('out-rendered');
  const renderedHtml = $('out-rendered-html');
  const status = $('roundtrip');
  for (const el of [vnodeOut, rendered, renderedHtml, status]) el.replaceChildren();
  status.className = 'status';

  // 1) 원본 미리보기: 입력 HTML을 그대로 렌더
  try {
    original.innerHTML = html;
  } catch (err) {
    showError(original, err);
  }

  // 2) VNode
  let vnode;
  try {
    vnode = domToVdom(parseRoot(html));
    vnodeOut.textContent = JSON.stringify(vnode, null, 2);
  } catch (err) {
    showError(vnodeOut, err);
    showError(rendered, new Error('VNode가 없어 렌더할 수 없습니다'));
    status.textContent = '왕복 검사: 실행 안 됨 (VNode 변환 실패)';
    return;
  }

  // 3) 다시 렌더 + 왕복 검사
  try {
    const result = roundTrip(vnode);
    rendered.replaceChildren(result.rendered);
    renderedHtml.textContent = result.rendered.outerHTML;
    if (result.diffs.length === 0) {
      status.textContent = '✅ 왕복 불변: domToVdom(render(v))가 v와 같습니다';
      status.classList.add('ok');
    } else {
      status.classList.add('fail');
      status.textContent = `❌ 왕복 불일치 (${result.diffs.length}곳)`;
      const ul = document.createElement('ul');
      for (const d of result.diffs) {
        const li = document.createElement('li');
        li.textContent = `${d.path}: v = ${fmt(d.expected)}, 다시 읽은 값 = ${fmt(d.actual)}`;
        ul.append(li);
      }
      status.append(ul);
    }
  } catch (err) {
    showError(rendered, err);
    status.textContent = '왕복 검사: 실행 안 됨 (render 실패)';
  }
}

function checkAll() {
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>fixture</th><th>왕복 검사</th></tr>';
  let passed = 0;
  for (const f of fixtures) {
    let result;
    try {
      const { diffs } = roundTrip(domToVdom(parseRoot(f.html)));
      result = diffs.length === 0 ? '✅' : `❌ ${diffs.map((d) => d.path).join(', ')}`;
    } catch (err) {
      result = `❌ ${err.message}`;
    }
    if (result === '✅') passed += 1;
    const tr = table.insertRow();
    tr.insertCell().textContent = f.label;
    tr.insertCell().textContent = result;
  }
  const summary = document.createElement('p');
  summary.className = passed === fixtures.length ? 'status ok' : 'status fail';
  summary.textContent = `${passed === fixtures.length ? '✅' : '❌'} ${passed} / ${fixtures.length} 통과`;
  $('out-check-all').replaceChildren(summary, table);
}

/* ------------------------------------------------------------------ */
/* 2·3. diff / patch                                                    */
/* before로 한 번 render한 실제 DOM을 유지하고, diff 결과를 patch로 적용한다. */
/* ------------------------------------------------------------------ */

// fixtures/cases.js는 테스트도 쓰므로 건드리지 않고, key(이동) 데모 케이스만 여기서 덧붙인다.
const keyedDemos = [
  {
    name: '[key] 맨 뒤 → 맨 앞 (lastPlacedIndex: 이동 3회)',
    before: '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li><li data-key="d">D</li></ul>',
    after: '<ul><li data-key="d">D</li><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>',
  },
  {
    name: '[key] 맨 앞 → 맨 뒤 (이동 1회)',
    before: '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li><li data-key="d">D</li></ul>',
    after: '<ul><li data-key="b">B</li><li data-key="c">C</li><li data-key="d">D</li><li data-key="a">A</li></ul>',
  },
  {
    name: '[key] 뒤집기',
    before: '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>',
    after: '<ul><li data-key="c">C</li><li data-key="b">B</li><li data-key="a">A</li></ul>',
  },
  {
    name: '[key] 앞에 추가 + 가운데 삭제',
    before: '<ul><li data-key="a">A</li><li data-key="b">B</li><li data-key="c">C</li></ul>',
    after: '<ul><li data-key="z">Z</li><li data-key="a">A</li><li data-key="c">C</li></ul>',
  },
  {
    name: '[key 없음] 앞에 추가 (인덱스 비교 → 텍스트 갱신 + 끝에 생성)',
    before: '<ul><li>A</li><li>B</li><li>C</li></ul>',
    after: '<ul><li>Z</li><li>A</li><li>B</li><li>C</li></ul>',
  },
];
const diffCases = [...cases, ...keyedDemos];

const diffSelect = $('diff-case-select');
const beforeInput = $('before-input');
const afterInput = $('after-input');
diffCases.forEach((c, i) => diffSelect.add(new Option(c.name, i)));

// 현재 상태: 실제 DOM 루트와 그 DOM이 나타내는 VNode(= 다음 diff의 old)
const state = { liveRoot: null, liveVNode: null, patches: null, nextVNode: null };

diffSelect.addEventListener('change', loadDiffCase);
$('btn-mount').addEventListener('click', mount);
$('btn-diff').addEventListener('click', runDiff);
$('btn-patch').addEventListener('click', runPatch);
loadDiffCase();

function setStatus(el, text, kind) {
  el.className = kind ? `status ${kind}` : 'status';
  el.textContent = text;
}

function loadDiffCase() {
  const c = diffCases[diffSelect.value];
  beforeInput.value = c.before;
  afterInput.value = c.after;
  mount();
}

/** before를 render해서 "실제 DOM"으로 마운트한다. 이후 patch는 이 DOM 객체를 제자리에서 고친다. */
function mount() {
  const live = $('out-live');
  state.patches = null;
  state.nextVNode = null;
  $('out-patches').textContent = '';
  for (const id of ['out-before-snapshot', 'out-before-html', 'out-expected', 'out-expected-html']) $(id).replaceChildren();
  setStatus($('patch-status'), 'patch 적용 전');
  try {
    state.liveVNode = domToVdom(parseRoot(beforeInput.value));
    state.liveRoot = render(state.liveVNode);
    live.replaceChildren(state.liveRoot);
    showLiveHtml();
    setStatus($('diff-status'), 'before 렌더 완료. diff를 누르세요.');
  } catch (err) {
    state.liveRoot = null;
    state.liveVNode = null;
    showError(live, err);
    $('out-live-html').textContent = '';
    setStatus($('diff-status'), `before 변환 실패: ${err.message}`, 'fail');
  }
}

function showLiveHtml() {
  $('out-live-html').textContent = state.liveRoot ? state.liveRoot.outerHTML : '';
}

/** Patch 하나를 한 줄로 요약한다. node(VNode)는 길어서 HTML로 줄여 보여 준다. */
function describePatch(p, i) {
  const at = `[${p.path.join(',')}]`;
  const html = (v) => {
    const el = render(v);
    return el.outerHTML ?? JSON.stringify(el.textContent);
  };
  const anchor = (b) => (b == null ? 'null(맨 끝)' : JSON.stringify(b));
  const n = `${i + 1}.`.padEnd(4);
  switch (p.type) {
    case 'CREATE':
      return `${n}CREATE  ${at}  ${html(p.node)}  before=${anchor(p.before)}`;
    case 'REMOVE':
      return `${n}REMOVE  ${at}`;
    case 'REPLACE':
      return `${n}REPLACE ${at}  → ${html(p.node)}`;
    case 'TEXT':
      return `${n}TEXT    ${at}  → ${JSON.stringify(p.value)}`;
    case 'PROPS':
      return `${n}PROPS   ${at}  set=${JSON.stringify(p.set)} remove=${JSON.stringify(p.remove)}`;
    case 'MOVE':
      return `${n}MOVE    ${at}  → 새 index ${p.index}, before=${anchor(p.before)}`;
    default:
      return `${n}${JSON.stringify(p)}`;
  }
}

function runDiff() {
  const status = $('diff-status');
  if (!state.liveVNode) return setStatus(status, '먼저 before 렌더를 하세요.', 'fail');
  try {
    state.nextVNode = domToVdom(parseRoot(afterInput.value));
    state.patches = diff(state.liveVNode, state.nextVNode);
  } catch (err) {
    state.patches = null;
    $('out-patches').textContent = '';
    return setStatus(status, `diff 실패: ${err.message}`, 'fail');
  }
  const counts = {};
  for (const p of state.patches) counts[p.type] = (counts[p.type] || 0) + 1;
  const summary = Object.entries(counts).map(([t, c]) => `${t} ${c}`).join(', ') || '변경 없음';
  $('out-patches').textContent =
    state.patches.length === 0
      ? '(patch 없음 — 같은 트리)'
      : `${state.patches.map(describePatch).join('\n')}\n\n--- 원본 JSON ---\n${JSON.stringify(state.patches, null, 2)}`;
  setStatus(status, `diff 완료: patch ${state.patches.length}개 (${summary}). patch 적용을 누르세요.`, 'ok');
}

/** 루트 아래 모든 노드(요소 + 텍스트)를 모은다. patch 전후 DOM 객체 재사용 여부 확인용. */
function allNodes(root) {
  const out = [];
  const walk = (node) => {
    out.push(node);
    node.childNodes.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

const nodeLabel = (node) => (node.nodeType === Node.TEXT_NODE ? JSON.stringify(node.data) : `<${node.localName}>`);

function runPatch() {
  const status = $('patch-status');
  if (!state.patches) return setStatus(status, '먼저 diff를 실행하세요.', 'fail');

  // patch 전 스냅샷 (복제본이라 실제 DOM과 별개로 남는다)
  $('out-before-snapshot').replaceChildren(state.liveRoot.cloneNode(true));
  $('out-before-html').textContent = state.liveRoot.outerHTML;
  const expected = render(state.nextVNode);
  $('out-expected').replaceChildren(expected);
  $('out-expected-html').textContent = expected.outerHTML;

  const beforeNodes = new Set(allNodes(state.liveRoot));
  let newRoot;
  try {
    newRoot = patch(state.liveRoot, state.patches);
  } catch (err) {
    return setStatus(status, `patch 실패: ${err.message}`, 'fail');
  }
  // 루트가 REPLACE되면 patch가 새 루트를 돌려준다. 상자 안에 확실히 들어가 있게 한다.
  const live = $('out-live');
  if (newRoot.parentNode !== live) live.replaceChildren(newRoot);
  state.liveRoot = newRoot;
  showLiveHtml();

  // 검증: patch한 실제 DOM을 다시 읽으면 after VNode와 같아야 한다.
  const diffs = differences(state.nextVNode, domToVdom(newRoot));
  const afterNodes = allNodes(newRoot);
  const reused = afterNodes.filter((node) => beforeNodes.has(node));
  const created = afterNodes.filter((node) => !beforeNodes.has(node));
  const removed = beforeNodes.size - reused.length;

  status.className = diffs.length === 0 ? 'status ok' : 'status fail';
  const head = document.createElement('div');
  head.textContent =
    diffs.length === 0
      ? `✅ patch 후 실제 DOM이 after와 같습니다 (domToVdom(실제 DOM) == after VNode). patch ${state.patches.length}개 적용.`
      : `❌ patch 후 실제 DOM이 after와 다릅니다 (${diffs.length}곳)`;
  const ul = document.createElement('ul');
  const addItem = (text) => {
    const item = document.createElement('li');
    item.textContent = text;
    ul.append(item);
  };
  addItem(`DOM 객체 재사용 ${reused.length}개 / 새로 생성 ${created.length}개 / 제거 ${removed}개`);
  if (created.length) addItem(`새로 생성: ${created.map(nodeLabel).join(' ')}`);
  for (const d of diffs) addItem(`${d.path}: after = ${fmt(d.expected)}, 실제 = ${fmt(d.actual)}`);
  status.replaceChildren(head, ul);

  // after가 새 기준이 된다. after를 고쳐 diff → patch를 이어서 할 수 있다.
  state.liveVNode = state.nextVNode;
  state.patches = null;
  beforeInput.value = afterInput.value;
  setStatus($('diff-status'), 'patch 적용 완료. 지금 실제 DOM이 새 before입니다. after를 고쳐 diff를 다시 해 보세요.', 'ok');
}
