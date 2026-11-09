// @vitest-environment jsdom
// 데모 통합 테스트: index.html 의 실제 마크업으로 Phase 1 데모와 Phase 2 데모를 끝까지 돌려 봅니다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initPhase1, describePatch } from '../src/demo-phase1.js';
import { initPhase2 } from '../src/demo-phase2.js';
import { domToVNode } from '../src/mini-react.js';

const html = readFileSync(join(process.cwd(), 'CDH', 'index.html'), 'utf8');
const $ = (id) => document.getElementById(id);
const tick = () => new Promise((r) => setTimeout(r, 0));
const byText = (selector, text) => [...document.querySelectorAll(selector)].find((e) => e.textContent.includes(text));

let phase1, phase2;
beforeEach(() => {
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)[1]; // innerHTML 로 넣은 <script> 는 실행되지 않음
  phase1 = initPhase1(document);
  phase2 = initPhase2(document);
});
afterEach(() => phase2.unmount());

describe('Phase 1 데모: 로드', () => {
  it('실제 영역 DOM 이 Virtual DOM 이 되고, 테스트 영역은 그 Virtual DOM 으로 그려진다', () => {
    const fromActual = domToVNode($('actual').firstElementChild);
    const fromTest = domToVNode($('test-pane').firstElementChild);
    expect(fromTest).toEqual(fromActual);
    expect(fromActual.type).toBe('article');
    expect(phase1.getCurrent()).toEqual(fromActual);
  });
  it('기록은 1개, 뒤로/앞으로 버튼은 꺼져 있다', () => {
    expect($('p1-history').textContent).toContain('1 / 1');
    expect($('btn-back').disabled).toBe(true);
    expect($('btn-forward').disabled).toBe(true);
  });
});

describe('Phase 1 데모: 편집 → Patch', () => {
  const editFirstItem = (text) => {
    $('test-pane').querySelector('li').textContent = text;
  };

  it('편집하면 MutationObserver 가 변화를 세고, Patch 전에는 실제 영역이 그대로다', async () => {
    editFirstItem('수박');
    await tick();
    expect($('p1-dirty').textContent).toContain('변경 감지');
    expect($('actual').querySelector('li').textContent).toBe('사과');
  });
  it('Patch 하면 바뀐 부분만 실제 영역에 반영되고 기록이 늘어난다', async () => {
    const [li0, li1] = $('actual').querySelectorAll('li');
    const h4 = $('actual').querySelector('h4');
    editFirstItem('수박');
    $('btn-patch').click();
    expect($('actual').querySelector('li').textContent).toBe('수박');
    expect($('actual').querySelectorAll('li')[0]).toBe(li0); // <li> 노드 자체는 그대로
    expect($('actual').querySelectorAll('li')[1]).toBe(li1);
    expect($('actual').querySelector('h4')).toBe(h4);
    expect($('p1-history').textContent).toContain('2 / 2');
    expect($('p1-patches').textContent).toContain('TEXT');
    await tick();
    expect($('p1-dirty').textContent).toBe('변경 없음'); // Patch 후 테스트 영역을 다시 그렸으므로
  });
  it('변경이 없으면 기록을 남기지 않는다', () => {
    $('btn-patch').click();
    expect($('p1-history').textContent).toContain('1 / 1');
    expect($('p1-patches').textContent).toContain('바뀐 것이 없어요');
  });
  it('항목 추가, 삭제, 속성 변경, 태그 변경을 한꺼번에 반영한다', () => {
    const pane = $('test-pane');
    const ul = pane.querySelector('ul');
    const extra = document.createElement('li');
    extra.setAttribute('key', 'd');
    extra.textContent = '딸기';
    ul.appendChild(extra);
    ul.querySelector('li').remove(); // 사과 삭제
    pane.querySelector('a').setAttribute('href', 'https://example.org');
    const p = pane.querySelector('p');
    const section = document.createElement('section'); // <p> → <section>
    section.innerHTML = p.innerHTML;
    p.replaceWith(section);
    $('btn-patch').click();
    expect(domToVNode($('actual').firstElementChild)).toEqual(domToVNode(pane.firstElementChild));
    expect([...$('actual').querySelectorAll('li')].map((l) => l.textContent)).toEqual(['바나나', '포도', '딸기']);
    expect($('actual').querySelector('a').getAttribute('href')).toBe('https://example.org');
    expect($('actual').querySelector('section')).not.toBeNull();
  });
  it('테스트 영역을 전부 지우고 Patch 해도 오류 없이 무시한다', () => {
    $('test-pane').replaceChildren();
    expect(() => $('btn-patch').click()).not.toThrow();
    expect($('actual').firstElementChild).not.toBeNull();
  });
});

describe('Phase 1 데모: 뒤로가기 / 앞으로가기', () => {
  it('두 영역이 함께 이전/다음 상태로 간다', () => {
    const pane = $('test-pane');
    pane.querySelector('li').textContent = '수박';
    $('btn-patch').click();
    pane.querySelector('h4').textContent = '시장 가기';
    $('btn-patch').click();
    expect($('p1-history').textContent).toContain('3 / 3');

    $('btn-back').click();
    expect($('actual').querySelector('h4').textContent).toBe('장보기');
    expect(pane.querySelector('h4').textContent).toBe('장보기');
    expect($('actual').querySelector('li').textContent).toBe('수박');
    $('btn-back').click();
    expect($('actual').querySelector('li').textContent).toBe('사과');
    expect(pane.querySelector('li').textContent).toBe('사과');
    expect($('btn-back').disabled).toBe(true);

    $('btn-forward').click();
    $('btn-forward').click();
    expect($('actual').querySelector('h4').textContent).toBe('시장 가기');
    expect(pane.querySelector('h4').textContent).toBe('시장 가기');
    expect($('btn-forward').disabled).toBe(true);
  });
  it('뒤로 간 뒤 새 Patch 를 하면 앞쪽 기록이 사라진다', () => {
    const pane = $('test-pane');
    pane.querySelector('li').textContent = '수박';
    $('btn-patch').click();
    $('btn-back').click();
    pane.querySelector('h4').textContent = '새 길';
    $('btn-patch').click();
    expect($('p1-history').textContent).toContain('2 / 2');
    expect($('btn-forward').disabled).toBe(true);
    $('btn-back').click();
    expect($('actual').querySelector('li').textContent).toBe('사과');
  });
  it('describePatch 는 모든 패치 종류를 읽을 수 있는 줄로 바꾼다', () => {
    expect(describePatch({ op: 'TEXT', path: [0], value: 'a' })).toContain('"a"');
    expect(describePatch({ op: 'PROPS', path: [], set: { href: 'x' }, remove: ['id'] })).toContain('id 제거');
    expect(describePatch({ op: 'REPLACE', path: [1], value: { type: 'b' } })).toContain('<b>');
    expect(describePatch({ op: 'REMOVE', path: [2] })).toContain('삭제');
    expect(describePatch({ op: 'CHILDREN', path: [], plan: [{ create: 'x' }, { from: 0 }] })).toContain('1개');
  });
});

const todoTexts = () => [...document.querySelectorAll('.todo-app li span')].map((e) => e.textContent);
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = () => document.querySelector('.todo-app form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

describe('Phase 2 데모: Todo', () => {
  it('mount: 샘플 2개, hooks 배열 10칸 (state 6 + memo 2 + effect 2), 문서 제목 effect 실행', () => {
    expect(todoTexts()).toHaveLength(2);
    expect(phase2.hooks).toHaveLength(10);
    expect($('p2-hooks').textContent.trim().split('\n')).toHaveLength(10);
    expect($('p2-renders').textContent).toBe('1');
    expect(document.title).toBe('(1) 할 일 · Mini React');
  });
  it('빈 입력이면 추가 버튼이 꺼져 있다', async () => {
    expect(document.querySelector('.todo-app button[type=submit]').disabled).toBe(true);
    type(document.querySelector('.todo-app input[type=text]'), '   ');
    await tick();
    expect(document.querySelector('.todo-app button[type=submit]').disabled).toBe(true);
  });
  it('글자를 칠 때 <input> 과 기존 <li> 노드가 유지된다', async () => {
    const input = document.querySelector('.todo-app input[type=text]');
    const li = document.querySelector('.todo-app li');
    type(input, '우유 사기');
    await tick();
    expect(document.querySelector('.todo-app input[type=text]')).toBe(input);
    expect(document.querySelector('.todo-app li')).toBe(li);
    expect(input.value).toBe('우유 사기');
  });
  it('Enter(submit)로 추가하면 끝에 붙고 입력창이 비워지며 기존 <li> 는 그대로다', async () => {
    const before = [...document.querySelectorAll('.todo-app li')];
    type(document.querySelector('.todo-app input[type=text]'), '  우유 사기  ');
    await tick();
    submit();
    await tick();
    expect(todoTexts().at(-1)).toBe('우유 사기');
    expect(document.querySelector('.todo-app input[type=text]').value).toBe('');
    expect([...document.querySelectorAll('.todo-app li')].slice(0, 2)).toEqual(before);
    expect(document.title).toBe('(2) 할 일 · Mini React');
  });
  it('빈 문자열 제출은 무시하고, HTML 입력은 태그로 해석되지 않는다', async () => {
    submit();
    await tick();
    expect(todoTexts()).toHaveLength(2);
    type(document.querySelector('.todo-app input[type=text]'), '<img src=x onerror=alert(1)>');
    await tick();
    submit();
    await tick();
    expect(document.querySelector('.todo-app img')).toBeNull();
    expect(todoTexts().at(-1)).toBe('<img src=x onerror=alert(1)>');
  });
  it('체크하면 그 항목만 done 이 되고 필터 개수가 바뀐다', async () => {
    document.querySelectorAll('.todo-app input[type=checkbox]')[1].click();
    await tick();
    const items = document.querySelectorAll('.todo-app li');
    expect(items[1].classList.contains('done')).toBe(true);
    expect(items[0].classList.contains('done')).toBe(true); // 원래 완료였음
    expect(byText('.filters button', '완료').textContent).toBe('완료 2');
    expect(document.title).toBe('(0) 할 일 · Mini React');
  });
  it('삭제하면 그 항목만 사라지고 나머지 <li> 는 재사용된다', async () => {
    const [a, b] = document.querySelectorAll('.todo-app li');
    document.querySelector('.todo-app .x').click();
    await tick();
    expect([...document.querySelectorAll('.todo-app li')]).toEqual([b]);
    expect(a.isConnected).toBe(false);
  });
  it('필터: 진행 중 / 완료 / 전체, 빈 결과 안내', async () => {
    byText('.filters button', '진행 중').click();
    await tick();
    expect(todoTexts()).toEqual(['Phase 2: useState / useEffect / useMemo']);
    expect(byText('.filters button', '진행 중').className).toBe('on');
    byText('.filters button', '완료').click();
    await tick();
    expect(todoTexts()).toEqual(['Phase 1: Virtual DOM · Diff · Patch']);
    document.querySelector('.todo-app .x').click(); // 완료 항목 삭제 → 완료 필터가 비게 됨
    await tick();
    expect(document.querySelector('.empty')).not.toBeNull();
    expect(document.querySelector('.todo-app ul')).toBeNull();
    byText('.filters button', '전체').click();
    await tick();
    expect(todoTexts()).toHaveLength(1);
  });
});

describe('Phase 2 데모: useMemo / useEffect / batching', () => {
  it('타이머가 렌더를 일으켜도 todos 가 같으면 useMemo 는 다시 계산하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const memoBefore = $('p2-memo').textContent;
      byText('.todo-app button', '시작').click();
      await vi.advanceTimersByTimeAsync(3000);
      expect(document.querySelector('.todo-app strong').textContent).toBe('00:03');
      expect($('p2-memo').textContent).toBe(memoBefore);
      expect(Number($('p2-renders').textContent)).toBeGreaterThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it('일시정지하면 cleanup 으로 interval 이 정리되고 effect 로그가 남는다', async () => {
    vi.useFakeTimers();
    try {
      byText('.todo-app button', '시작').click();
      await vi.advanceTimersByTimeAsync(2000);
      byText('.todo-app button', '일시정지').click();
      await vi.advanceTimersByTimeAsync(5000);
      expect(document.querySelector('.todo-app strong').textContent).toBe('00:02');
      expect($('p2-log').textContent).toContain('타이머 정리(cleanup)');
      byText('.todo-app button', '초기화').click();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.querySelector('.todo-app strong').textContent).toBe('00:00');
    } finally {
      vi.useRealTimers();
    }
  });
  it('디버그 패널: 한 항목을 토글하면 "바뀐 곳만" 보인다', async () => {
    document.querySelectorAll('.todo-app input[type=checkbox]')[1].click();
    await tick();
    expect($('p2-summary').textContent).toMatch(/패치 \d+건, 건드린 DOM \d+곳/);
    expect($('p2-patches').textContent).toContain('PROPS');
  });
  it('batching 켜짐: "+1 을 3번" → 렌더 1번, 값 +3', async () => {
    const before = Number($('p2-renders').textContent);
    byText('.todo-app button', '3번').click();
    await tick();
    expect(Number($('p2-renders').textContent)).toBe(before + 1);
    expect(byText('.todo-app span', '연속').textContent).toContain(': 3');
  });
  it('batching 끔: 같은 클릭이 렌더 3번', () => {
    const toggle = $('batch-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    const before = Number($('p2-renders').textContent);
    byText('.todo-app button', '3번').click();
    expect(Number($('p2-renders').textContent)).toBe(before + 3);
    expect(byText('.todo-app span', '연속').textContent).toContain(': 3');
  });
});
