import { describe, test, expect } from 'vitest';
import { diff, PATCH, htmlToVdom, createElement, createTextNode } from '../src/lib/index.js';

const d = (before, after) => diff(htmlToVdom(before), htmlToVdom(after));

describe('diff', () => {
  test('같은 트리면 변경이 없다', () => {
    expect(d('<p class="a">x</p>', '<p class="a">x</p>')).toEqual([]);
  });

  test('① 노드 추가: CREATE', () => {
    expect(d('<ul><li>a</li></ul>', '<ul><li>a</li><li>b</li></ul>')).toEqual([
      { type: PATCH.CREATE, path: [0, 1], node: createElement('li', {}, [createTextNode('b')]) },
    ]);
  });

  test('② 노드 삭제: REMOVE (뒤에서부터)', () => {
    expect(d('<ul><li>a</li><li>b</li><li>c</li></ul>', '<ul><li>a</li></ul>')).toEqual([
      { type: PATCH.REMOVE, path: [0, 2] },
      { type: PATCH.REMOVE, path: [0, 1] },
    ]);
  });

  test('③ 태그 변경: REPLACE', () => {
    expect(d('<div><p>a</p></div>', '<div><h2>a</h2></div>')).toEqual([
      { type: PATCH.REPLACE, path: [0, 0], node: createElement('h2', {}, [createTextNode('a')]) },
    ]);
  });

  test('③ 요소 ↔ 텍스트도 REPLACE', () => {
    expect(d('<p><b>a</b></p>', '<p>a</p>')).toEqual([
      { type: PATCH.REPLACE, path: [0, 0], node: createTextNode('a') },
    ]);
  });

  test('④ 텍스트 변경: TEXT', () => {
    expect(d('<p>안녕</p>', '<p>반가워</p>')).toEqual([
      { type: PATCH.TEXT, path: [0, 0], text: '반가워' },
    ]);
  });

  test('⑤ 속성 추가·변경·삭제: PROPS', () => {
    expect(d('<p class="a" title="t">x</p>', '<p class="b" id="new">x</p>')).toEqual([
      { type: PATCH.PROPS, path: [0], set: { class: 'b', id: 'new' }, remove: ['title'] },
    ]);
  });

  test('속성과 자식이 같이 바뀌면 PROPS 후 자식 변경이 이어진다', () => {
    expect(d('<p class="a">x</p>', '<p class="b">y</p>').map((p) => p.type)).toEqual([
      PATCH.PROPS,
      PATCH.TEXT,
    ]);
  });

  test('깊은 위치의 변경은 경로(path)로 표시된다', () => {
    const patches = d(
      '<section><div><ul><li>a</li><li>b</li></ul></div></section>',
      '<section><div><ul><li>a</li><li>B</li></ul></div></section>',
    );
    expect(patches).toEqual([{ type: PATCH.TEXT, path: [0, 0, 0, 1, 0], text: 'B' }]);
  });

  test('바뀌지 않은 형제 노드에는 patch가 생기지 않는다', () => {
    const patches = d('<p>a</p><p>b</p><p>c</p>', '<p>a</p><p>B</p><p>c</p>');
    expect(patches).toEqual([{ type: PATCH.TEXT, path: [1, 0], text: 'B' }]);
  });

  test('빈 영역 ↔ 내용 있는 영역', () => {
    expect(d('', '<p>a</p>').map((p) => p.type)).toEqual([PATCH.CREATE]);
    expect(d('<p>a</p>', '').map((p) => p.type)).toEqual([PATCH.REMOVE]);
  });
});
