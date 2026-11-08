// @vitest-environment jsdom
// 데모 앱 통합 테스트: index.html 의 실제 마크업으로 "로드 → 편집 → Patch → 뒤로/앞으로" 를 끝까지 돌려 봅니다.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initApp } from '../src/app/app.js';
import { domToVNode } from '../src/lib/vdom/convert.js';

const html = readFileSync(join(process.cwd(), 'CDH', 'index.html'), 'utf8');
const $ = (id) => document.getElementById(id);
const click = (id) => $(id).click();
const tick = () => new Promise((r) => setTimeout(r, 0));
const items = (root) => Array.from(root.querySelectorAll('li')).map((li) => li.textContent);

let app;
beforeEach(() => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  app = initApp(document);
});

describe('로드', () => {
  it('실제 영역 DOM 이 VNode 가 되고, 테스트 영역은 그 VNode 로 그려진다', () => {
    const actualV = domToVNode($('actual').firstElementChild);
    const paneV = domToVNode($('test-pane').firstElementChild);
    expect(paneV).toEqual(actualV);
    expect(app.getCurrent()).toEqual(actualV);
    expect(actualV.type).toBe('article');
    expect($('log').textContent).toContain('로드');
  });

  it('HTML 코드 칸에 같은 내용이 채워진다', () => {
    expect($('test-code').value).toContain('<h2>장보기</h2>');
    expect($('test-code').value).toContain('key="a"');
  });

  it('기록은 1개, 뒤로/앞으로 버튼은 꺼져 있다', () => {
    expect(document.querySelectorAll('#history-view .chip').length).toBe(1);
    expect($('btn-back').disabled).toBe(true);
    expect($('btn-forward').disabled).toBe(true);
  });
});

describe('편집 → Patch', () => {
  it('Patch 전에는 실제 영역이 바뀌지 않는다', async () => {
    document.querySelector('[data-edit="text"]').click();
    expect(items($('actual'))).toEqual(['사과', '바나나', '포도']);
    await tick();
    expect($('dirty').textContent).toContain('변경 감지');
    expect($('btn-patch').classList.contains('attention')).toBe(true);
  });

  it('화면을 직접 고치면 코드 칸이 따라 바뀐다', () => {
    $('test-pane').querySelector('h2').firstChild.nodeValue = '마트';
    $('test-pane').dispatchEvent(new Event('input', { bubbles: true }));
    expect($('test-code').value).toContain('<h2>마트</h2>');
  });

  it('코드 칸을 고치면 화면이 다시 그려진다', () => {
    $('test-code').value = $('test-code').value.replace('장보기', '코드로 수정');
    $('test-code').dispatchEvent(new Event('input', { bubbles: true }));
    expect($('test-pane').querySelector('h2').textContent).toBe('코드로 수정');
  });

  it('Patch 하면 바뀐 부분만 실제 영역에 반영되고 기록이 늘어난다', () => {
    const h2 = $('actual').querySelector('h2');
    const ul = $('actual').querySelector('ul');
    $('test-pane').querySelector('h2').firstChild.nodeValue = '마트';
    click('btn-patch');
    expect($('actual').querySelector('h2').textContent).toBe('마트');
    expect($('actual').querySelector('h2')).toBe(h2); // 같은 DOM 노드를 재사용
    expect($('actual').querySelector('ul')).toBe(ul);
    expect(document.querySelectorAll('#history-view .chip').length).toBe(2);
    expect($('patch-summary').textContent).toContain('패치 1개');
    expect(document.querySelectorAll('#patch-list li').length).toBe(1);
  });

  it('변경이 없으면 기록을 남기지 않는다', () => {
    click('btn-patch');
    expect(document.querySelectorAll('#history-view .chip').length).toBe(1);
    expect($('log').textContent).toContain('변경 없음');
  });

  it('Patch 후 실제 영역과 테스트 영역의 VNode 가 같다', () => {
    document.querySelector('[data-edit="add"]').click();
    document.querySelector('[data-edit="tag"]').click();
    click('btn-patch');
    expect(domToVNode($('actual').firstElementChild)).toEqual(domToVNode($('test-pane').firstElementChild));
  });
});

describe('뒤로가기 / 앞으로가기', () => {
  it('두 영역이 함께 이전/다음 상태로 간다', () => {
    document.querySelector('[data-edit="add"]').click();
    click('btn-patch');
    expect(items($('actual'))).toHaveLength(4);

    click('btn-back');
    expect(items($('actual'))).toEqual(['사과', '바나나', '포도']);
    expect(items($('test-pane'))).toEqual(['사과', '바나나', '포도']);
    expect($('btn-back').disabled).toBe(true);
    expect($('btn-forward').disabled).toBe(false);

    click('btn-forward');
    expect(items($('actual'))).toHaveLength(4);
    expect(items($('test-pane'))).toHaveLength(4);
    expect($('btn-forward').disabled).toBe(true);
  });

  it('뒤로 간 뒤 새 Patch 를 하면 앞쪽 기록이 사라진다', () => {
    document.querySelector('[data-edit="add"]').click();
    click('btn-patch');
    click('btn-back');
    document.querySelector('[data-edit="remove"]').click();
    click('btn-patch');
    expect(document.querySelectorAll('#history-view .chip').length).toBe(2);
    expect($('btn-forward').disabled).toBe(true);
    expect(items($('actual'))).toEqual(['사과', '바나나']);
  });
});

describe('예시 편집 버튼', () => {
  it.each([
    ['text', 'TEXT'],
    ['attr', 'PROPS'],
    ['tag', 'REPLACE'],
    ['add', 'CREATE'],
    ['remove', 'REMOVE'],
    ['reorder', 'MOVE'],
  ])('%s → Patch 목록에 %s', (edit, op) => {
    document.querySelector(`[data-edit="${edit}"]`).click();
    click('btn-patch');
    const ops = Array.from(document.querySelectorAll('#patch-list .op')).map((e) => e.textContent);
    expect(ops).toContain(op);
    expect(domToVNode($('actual').firstElementChild)).toEqual(domToVNode($('test-pane').firstElementChild));
  });
});
