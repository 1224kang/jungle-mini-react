// @vitest-environment jsdom
// Phase 2 데모 통합 테스트: phase2.html 의 실제 마크업으로 "mount → 입력/클릭 → 부분 갱신 → effect" 를 끝까지 돌려 봅니다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initApp } from '../src/app2/app.js';
import { STORAGE_KEY, SAMPLE_TODOS, loadTodos, computeStats, filterTodos } from '../src/app2/todo-app.js';
import { describeHook } from '../src/app2/debug-panel.js';

const html = readFileSync(join(process.cwd(), 'CDH', 'phase2.html'), 'utf8');
const $ = (id) => document.getElementById(id);
const tick = () => new Promise((r) => setTimeout(r, 0));
const todoTexts = () => [...document.querySelectorAll('.todo .text')].map((e) => e.textContent);
const byText = (selector, text) => [...document.querySelectorAll(selector)].find((e) => e.textContent.includes(text));

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

let app;
let storage;

function boot(initial) {
  storage = fakeStorage(initial);
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)[1];
  app = initApp(document, { storage });
}

beforeEach(() => boot());
afterEach(() => app?.unmount());

describe('mount', () => {
  it('샘플 할 일 3개가 그려지고 상태/통계가 맞다', () => {
    expect(todoTexts()).toHaveLength(3);
    expect(document.querySelector('.stats').textContent).toContain('전체 3 · 완료 1 · 남음 2');
    expect($('dbg-renders').textContent).toBe('1');
  });

  it('hooks 배열: state 6 + memo 3 + effect 3 = 12칸이 디버그 패널에 보인다', () => {
    expect(app.hooks).toHaveLength(12);
    expect($('dbg-hooks').querySelectorAll('tr')).toHaveLength(12);
  });

  it('effect 가 실행된다: 제목 갱신, 저장', () => {
    expect(document.title).toBe('(2) 할 일 · Mini React');
    expect(JSON.parse(storage.data[STORAGE_KEY])).toEqual(SAMPLE_TODOS);
  });
});

describe('입력과 추가', () => {
  it('빈 입력이면 추가 버튼이 비활성', () => {
    expect(document.querySelector('.todo-form button').disabled).toBe(true);
    type(document.querySelector('.todo-form input'), '   ');
    app.flush();
    expect(document.querySelector('.todo-form button').disabled).toBe(true);
  });

  it('글자를 칠 때 <input> 노드가 유지되고 화면 전체를 다시 만들지 않는다', async () => {
    const input = document.querySelector('.todo-form input');
    const li = document.querySelector('.todo');
    type(input, '우유 사기');
    await tick();
    expect(document.querySelector('.todo-form input')).toBe(input);
    expect(document.querySelector('.todo')).toBe(li);
    expect(input.value).toBe('우유 사기');
    expect(document.querySelector('.todo-form button').disabled).toBe(false);
  });

  it('Enter(submit)로 추가하면 목록 끝에 붙고 입력창이 비워지며, 기존 <li> 는 그대로다', async () => {
    const before = [...document.querySelectorAll('.todo')];
    const input = document.querySelector('.todo-form input');
    type(input, '  우유 사기  ');
    await tick();
    document.querySelector('.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(todoTexts()).toEqual([...SAMPLE_TODOS.map((t) => t.text), '우유 사기']);
    expect(document.querySelector('.todo-form input').value).toBe('');
    expect([...document.querySelectorAll('.todo')].slice(0, 3)).toEqual(before);
    expect(JSON.parse(storage.data[STORAGE_KEY]).at(-1)).toEqual({ id: 4, text: '우유 사기', done: false });
  });

  it('빈 문자열 제출은 무시한다', async () => {
    document.querySelector('.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(todoTexts()).toHaveLength(3);
  });

  it('HTML 을 입력해도 태그로 해석되지 않는다', async () => {
    type(document.querySelector('.todo-form input'), '<img src=x onerror=alert(1)>');
    await tick();
    document.querySelector('.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.todos img')).toBeNull();
    expect(todoTexts().at(-1)).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('토글 / 삭제 / 필터', () => {
  it('체크하면 해당 항목만 done 이 되고 통계·제목이 바뀐다', async () => {
    const boxes = document.querySelectorAll('.todo input[type="checkbox"]');
    expect(boxes[1].checked).toBe(false);
    boxes[1].click();
    await tick();
    const items = document.querySelectorAll('.todo');
    expect(items[1].classList.contains('done')).toBe(true);
    expect(items[2].classList.contains('done')).toBe(false);
    expect(document.querySelectorAll('.todo input[type="checkbox"]')[1].checked).toBe(true);
    expect(document.querySelector('.stats').textContent).toContain('완료 2');
    expect(document.title).toBe('(1) 할 일 · Mini React');
  });

  it('삭제하면 그 항목만 사라지고 나머지 <li> 노드는 재사용된다', async () => {
    const [a, b, c] = document.querySelectorAll('.todo');
    byText('.todo .x', '').click(); // 첫 번째 ×
    await tick();
    const now = [...document.querySelectorAll('.todo')];
    expect(now).toEqual([b, c]);
    expect(a.isConnected).toBe(false);
  });

  it('필터: 진행 중 / 완료 / 전체, 빈 결과 안내', async () => {
    byText('.filters button', '진행 중').click();
    await tick();
    expect(todoTexts()).toEqual([SAMPLE_TODOS[1].text, SAMPLE_TODOS[2].text]);
    expect(byText('.filters button', '진행 중').getAttribute('aria-pressed')).toBe('true');
    expect(byText('.filters button', '전체').getAttribute('aria-pressed')).toBe('false');

    byText('.filters button', '완료').click();
    await tick();
    expect(todoTexts()).toEqual([SAMPLE_TODOS[0].text]);

    byText('.stats button', '완료 항목 지우기').click();
    await tick();
    expect(document.querySelector('.empty').textContent).toContain('맞는 항목이 없어요');
    expect(document.querySelector('.todos')).toBeNull();

    byText('.filters button', '전체').click();
    await tick();
    expect(todoTexts()).toHaveLength(2);
  });

  it('모두 지우면 빈 목록 안내가 나오고, 다시 추가하면 목록이 돌아온다', async () => {
    for (let i = 0; i < 3; i++) {
      document.querySelector('.todo .x').click();
      await tick();
    }
    expect(document.querySelector('.empty').textContent).toContain('할 일이 없어요');
    type(document.querySelector('.todo-form input'), '새 일');
    await tick();
    document.querySelector('.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(todoTexts()).toEqual(['새 일']);
    expect(JSON.parse(storage.data[STORAGE_KEY])[0].id).toBe(1);
  });
});

describe('useMemo / useEffect 동작 확인', () => {
  it('타이머가 렌더를 일으켜도 todos 가 같으면 useMemo 는 다시 계산하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const memoBefore = $('dbg-memo').textContent;
      byText('.timer button', '시작').click();
      await vi.advanceTimersByTimeAsync(3000);
      expect(document.querySelector('.timer strong').textContent).toBe('00:03');
      expect($('dbg-memo').textContent).toBe(memoBefore);
      expect(Number($('dbg-renders').textContent)).toBeGreaterThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('타이머: 일시정지하면 cleanup 으로 interval 이 정리된다', async () => {
    vi.useFakeTimers();
    try {
      byText('.timer button', '시작').click();
      await vi.advanceTimersByTimeAsync(2000);
      byText('.timer button', '일시정지').click();
      await vi.advanceTimersByTimeAsync(5000);
      expect(document.querySelector('.timer strong').textContent).toBe('00:02');
      expect($('dbg-log').textContent).toContain('타이머 정리(cleanup)');
      byText('.timer button', '초기화').click();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.querySelector('.timer strong').textContent).toBe('00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('todos 가 바뀔 때만 저장 effect 가 실행된다 (필터 변경은 저장하지 않음)', async () => {
    const saves = () => ($('dbg-log').textContent.match(/localStorage 에 저장/g) ?? []).length;
    expect(saves()).toBe(1);
    byText('.filters button', '완료').click();
    await tick();
    expect(saves()).toBe(1);
    byText('.filters button', '전체').click();
    document.querySelector('.todo input[type="checkbox"]').click();
    await tick();
    expect(saves()).toBe(2);
  });
});

describe('부분 갱신과 batching', () => {
  it('한 항목을 토글하면 디버그 패널에 "바뀐 곳만" 보인다', async () => {
    document.querySelectorAll('.todo input[type="checkbox"]')[1].click();
    await tick();
    const touchedText = $('dbg-summary').textContent;
    const m = touchedText.match(/DOM 변경 (\d+)곳 \/ 전체 노드 (\d+)개/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeLessThan(Number(m[2]) / 3);
  });

  it('batching 켜짐: "+1 을 3번" → 렌더 1번, 값 +3', async () => {
    const before = Number($('dbg-renders').textContent);
    byText('.burst button', '3번').click();
    await tick();
    expect(Number($('dbg-renders').textContent)).toBe(before + 1);
    expect(document.querySelector('.burst span').textContent).toContain(': 3');
  });

  it('batching 끔: 같은 클릭이 렌더 3번', async () => {
    const toggle = $('batch-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    const before = Number($('dbg-renders').textContent);
    byText('.burst button', '3번').click();
    expect(Number($('dbg-renders').textContent)).toBe(before + 3);
    expect(document.querySelector('.burst span').textContent).toContain(': 3');
  });
});

describe('저장소 엣지 케이스', () => {
  it('저장된 값이 있으면 그걸로 시작한다', () => {
    app.unmount();
    boot({ [STORAGE_KEY]: JSON.stringify([{ id: 7, text: '저장된 일', done: true }]) });
    expect(todoTexts()).toEqual(['저장된 일']);
  });

  it('깨진 JSON / 모양이 다른 값 / 저장소 없음 → 샘플로 시작', () => {
    expect(loadTodos(fakeStorage({ [STORAGE_KEY]: '{깨짐' }))).toEqual(SAMPLE_TODOS);
    expect(loadTodos(fakeStorage({ [STORAGE_KEY]: '[{"id":"x"}]' }))).toEqual(SAMPLE_TODOS);
    expect(loadTodos(fakeStorage({ [STORAGE_KEY]: '{"a":1}' }))).toEqual(SAMPLE_TODOS);
    expect(loadTodos(undefined)).toEqual(SAMPLE_TODOS);
    expect(loadTodos({ getItem() { throw new Error('blocked'); } })).toEqual(SAMPLE_TODOS);
  });

  it('저장이 실패해도 앱은 계속 동작한다', async () => {
    app.unmount();
    storage = fakeStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)[1];
    app = initApp(document, { storage });
    document.querySelector('.todo .x').click();
    await tick();
    expect(todoTexts()).toHaveLength(2);
    expect($('dbg-log').textContent).toContain('저장 실패');
  });
});

describe('순수 함수 / 디버그 표시', () => {
  it('computeStats / filterTodos', () => {
    expect(computeStats([])).toEqual({ total: 0, done: 0, active: 0, percent: 0 });
    expect(computeStats(SAMPLE_TODOS)).toEqual({ total: 3, done: 1, active: 2, percent: 33 });
    expect(filterTodos(SAMPLE_TODOS, 'done')).toHaveLength(1);
    expect(filterTodos(SAMPLE_TODOS, 'active')).toHaveLength(2);
    expect(filterTodos(SAMPLE_TODOS, 'all')).toBe(SAMPLE_TODOS);
  });

  it('describeHook', () => {
    expect(describeHook({ kind: 'state', value: 3 })).toBe('3');
    expect(describeHook({ kind: 'effect', deps: undefined, cleanup: undefined })).toContain('매 렌더');
    expect(describeHook({ kind: 'effect', deps: [1], cleanup: () => {} })).toContain('cleanup=있음');
    expect(describeHook({ kind: 'memo', deps: [1], value: 2 })).toContain('deps=[1]');
  });
});
