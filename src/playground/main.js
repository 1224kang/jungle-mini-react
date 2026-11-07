import { domToVdom, render, diff, patch } from '../lib/index.js';
import { cases } from '../../fixtures/cases.js';

const $ = (id) => document.getElementById(id);
const select = $('case-select');
const beforeEl = $('before');
const afterEl = $('after');

cases.forEach((c, i) => select.add(new Option(c.name, i)));

function loadCase() {
  const c = cases[select.value];
  beforeEl.value = c.before;
  afterEl.value = c.after;
}
select.addEventListener('change', loadCase);
loadCase();

function parseRoot(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstChild;
}

function showError(el, err) {
  el.textContent = '';
  const p = document.createElement('div');
  p.className = 'error';
  p.textContent = `❌ ${err.message}`;
  el.append(p);
}

function toVdoms() {
  return [domToVdom(parseRoot(beforeEl.value)), domToVdom(parseRoot(afterEl.value))];
}

function showPatches(el, patches) {
  if (patches.length === 0) {
    el.textContent = '(변경 없음)';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>type</th><th>path</th><th>내용</th></tr>';
  for (const { type, path, ...rest } of patches) {
    const tr = table.insertRow();
    tr.insertCell().textContent = type;
    tr.insertCell().textContent = JSON.stringify(path);
    tr.insertCell().textContent = JSON.stringify(rest);
  }
  el.replaceChildren(table);
}

$('btn-convert').addEventListener('click', () => {
  $('out-before').textContent = '';
  $('out-after').textContent = '';
  try {
    const [a, b] = toVdoms();
    $('out-before').textContent = JSON.stringify(a, null, 2);
    $('out-after').textContent = JSON.stringify(b, null, 2);
  } catch (err) {
    showError($('out-before'), err);
    showError($('out-after'), err);
  }
});

$('btn-diff').addEventListener('click', () => {
  const out = $('out-diff');
  try {
    const [a, b] = toVdoms();
    showPatches(out, diff(a, b));
  } catch (err) {
    showError(out, err);
  }
});

$('btn-patch').addEventListener('click', () => {
  const out = $('out-result');
  const preview = $('preview');
  const reference = $('reference');
  preview.replaceChildren();
  reference.replaceChildren();
  try {
    const [a, b] = toVdoms();
    const patches = diff(a, b);
    preview.append(render(a));
    reference.append(render(b));
    patch(preview.firstChild, patches);
    const same = preview.innerHTML === reference.innerHTML;
    out.textContent = same ? '✅ innerHTML 일치' : '❌ innerHTML 불일치';
  } catch (err) {
    showError(out, err);
  }
});
