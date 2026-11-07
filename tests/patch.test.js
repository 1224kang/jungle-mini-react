import { describe, test, expect } from 'vitest';
import { diff, patch, htmlToVdom, renderRoot, containerToVdom, PATCH } from '../src/lib/index.js';

/** before를 그린 container에 before→after diff를 patch하고 결과를 반환한다. */
function patchHtml(before, after) {
  const container = document.createElement('div');
  const oldVdom = htmlToVdom(before);
  const newVdom = htmlToVdom(after);
  renderRoot(container, oldVdom);
  const changed = patch(container, diff(oldVdom, newVdom));
  return { container, newVdom, changed };
}

/** 처음부터 새로 그린 결과 */
function freshRender(html) {
  const container = document.createElement('div');
  renderRoot(container, htmlToVdom(html));
  return container.innerHTML;
}

describe('patch: 결과가 새로 그린 것과 같다', () => {
  test.each([
    ['텍스트 변경', '<p>안녕</p>', '<p>반가워</p>'],
    ['속성 변경', '<p class="a" title="t">x</p>', '<p class="b" id="y">x</p>'],
    ['노드 추가', '<ul><li>a</li></ul>', '<ul><li>a</li><li>b</li><li>c</li></ul>'],
    ['노드 삭제', '<ul><li>a</li><li>b</li><li>c</li></ul>', '<ul><li>a</li></ul>'],
    ['태그 교체', '<div><p>a</p></div>', '<div><h2>a</h2></div>'],
    ['요소 → 텍스트', '<p><b>a</b></p>', '<p>a</p>'],
    ['빈 영역에서 시작', '', '<h1>제목</h1><p>본문</p>'],
    ['전부 삭제', '<h1>제목</h1><p>본문</p>', ''],
    [
      '여러 변경이 섞인 경우',
      '<section class="card"><h3>할 일</h3><ul><li class="done">a</li><li>b</li><li>c</li></ul><button>버튼</button></section>',
      '<section class="card wide"><h3>오늘 할 일</h3><ul><li>a</li><li class="done">B</li></ul><p>추가</p><a href="#">링크</a></section>',
    ],
  ])('%s', (_, before, after) => {
    const { container, newVdom } = patchHtml(before, after);
    expect(container.innerHTML).toBe(freshRender(after));
    expect(containerToVdom(container)).toEqual(newVdom);
  });
});

describe('patch: 변경된 부분만 바뀐다', () => {
  test('바뀌지 않은 노드는 같은 DOM 객체가 유지된다', () => {
    const container = document.createElement('div');
    const oldVdom = htmlToVdom('<p>a</p><p>b</p><p>c</p>');
    renderRoot(container, oldVdom);
    const [first, second, third] = container.children;

    patch(container, diff(oldVdom, htmlToVdom('<p>a</p><p>B</p><p>c</p>')));

    expect(container.children[0]).toBe(first);
    expect(container.children[1]).toBe(second);
    expect(container.children[2]).toBe(third);
    expect(second.textContent).toBe('B');
  });

  test('사용자가 입력 중인 input은 다른 곳이 바뀌어도 값이 유지된다', () => {
    const container = document.createElement('div');
    const oldVdom = htmlToVdom('<input type="text"><p>a</p>');
    renderRoot(container, oldVdom);
    const input = container.querySelector('input');
    input.value = '입력 중';

    patch(container, diff(oldVdom, htmlToVdom('<input type="text"><p>b</p>')));

    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('입력 중');
  });

  test('변경된 노드 목록을 반환한다', () => {
    const { changed } = patchHtml('<p>a</p>', '<p>b</p><hr>');
    expect(changed.map((c) => c.type)).toEqual([PATCH.TEXT, PATCH.CREATE]);
  });

  test('경로가 맞지 않으면 에러를 던진다', () => {
    const container = document.createElement('div');
    expect(() => patch(container, [{ type: PATCH.TEXT, path: [3, 0], text: 'x' }])).toThrow(
      /찾을 수 없습니다/,
    );
  });
});
