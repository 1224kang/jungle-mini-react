import { domToVdom, render } from '../lib/index.js';
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
