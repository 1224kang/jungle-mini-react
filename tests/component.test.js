import { describe, test, expect, vi } from 'vitest';
import { h, render, useState, FunctionComponent } from '../src/lib/index.js';

/** 예약된 update(마이크로태스크)가 실행될 때까지 기다린다. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountApp(App, options) {
  const container = document.createElement('div');
  document.body.append(container);
  const component = render(App, container, options);
  return { container, component };
}

describe('FunctionComponent: mount / update', () => {
  test('mount하면 컴포넌트 함수 결과가 container에 그려진다', () => {
    const App = () => h('h1', { class: 'title' }, '안녕');
    const { container, component } = mountApp(App);
    expect(container.innerHTML).toBe('<h1 class="title">안녕</h1>');
    expect(component).toBeInstanceOf(FunctionComponent);
    expect(component.renderCount).toBe(1);
  });

  test('setState 후 바로는 그대로이고, 마이크로태스크가 지나면 다시 그려진다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', null, count);
    };
    const { container } = mountApp(App);

    setCount(1);
    expect(container.textContent).toBe('0');
    await flush();
    expect(container.textContent).toBe('1');
  });

  test('함수가 다시 실행돼도 상태는 hooks 배열에 남아 있다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(10);
      const [label] = useState('점수');
      setCount = set;
      return h('p', null, `${label} ${count}`);
    };
    const { container, component } = mountApp(App);

    setCount(11);
    await flush();
    expect(container.textContent).toBe('점수 11');
    expect(component.hooks.map((hook) => hook.value)).toEqual([11, '점수']);
  });

  test('한 번에 여러 setState → 렌더링은 한 번 (배칭)', async () => {
    let setA;
    let setB;
    const App = () => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      return h('p', null, `${a}-${b}`);
    };
    const { container, component } = mountApp(App);

    setA(1);
    setB(2);
    setA(3);
    await flush();
    expect(container.textContent).toBe('3-2');
    expect(component.renderCount).toBe(2); // mount 1 + update 1
  });

  test('값으로 3번 부르면 +1, 함수로 3번 부르면 +3', async () => {
    let count;
    let setCount;
    const App = () => {
      [count, setCount] = useState(0);
      return h('p', null, count);
    };
    mountApp(App);

    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
    await flush();
    expect(count).toBe(1);

    setCount((c) => c + 1);
    setCount((c) => c + 1);
    setCount((c) => c + 1);
    await flush();
    expect(count).toBe(4);
  });

  test('같은 값으로 setState하면 다시 그리지 않는다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(5);
      setCount = set;
      return h('p', null, count);
    };
    const { component } = mountApp(App);

    setCount(5);
    await flush();
    expect(component.renderCount).toBe(1);
  });

  test('setter는 렌더가 바뀌어도 같은 함수다', async () => {
    const setters = [];
    const App = () => {
      const [count, setCount] = useState(0);
      setters.push(setCount);
      return h('p', null, count);
    };
    mountApp(App);
    setters[0](1);
    await flush();
    expect(setters).toHaveLength(2);
    expect(setters[1]).toBe(setters[0]);
  });

  test('update는 diff로 바뀐 부분만 patch한다', async () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', null, h('h1', null, '제목'), h('p', null, count));
    };
    const onCommit = vi.fn();
    const { container } = mountApp(App, { onCommit });
    const title = container.querySelector('h1');

    setCount(1);
    await flush();
    const [, info] = onCommit.mock.calls[1];
    expect(info.phase).toBe('update');
    expect(info.patches).toEqual([{ type: 'TEXT', path: [0, 1, 0], text: '1' }]);
    expect(container.querySelector('h1')).toBe(title); // 바뀌지 않은 노드는 그대로
  });
});

describe('자식 컴포넌트와 이벤트', () => {
  test('부모 상태를 props로 받은 자식이 onClick으로 부모 상태를 바꾼다', async () => {
    const Counter = ({ count, onIncrease }) =>
      h('button', { type: 'button', onClick: onIncrease }, `count ${count}`);
    const App = () => {
      const [count, setCount] = useState(0);
      return h(Counter, { count, onIncrease: () => setCount((c) => c + 1) });
    };
    const { container } = mountApp(App);
    const button = container.querySelector('button');

    button.click();
    button.click();
    await flush();
    expect(button.textContent).toBe('count 2');
    expect(container.querySelector('button')).toBe(button);
    expect(button.hasAttribute('onClick')).toBe(false); // 속성이 아니라 리스너로 달린다
  });

  test('다시 렌더링되면 리스너가 새 함수로 바뀐다 (이전 리스너는 제거)', async () => {
    const calls = [];
    const App = () => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => { calls.push(n); setN(n + 1); } }, n);
    };
    const { container } = mountApp(App);
    const button = container.querySelector('button');

    button.click();
    await flush();
    button.click();
    await flush();
    expect(calls).toEqual([0, 1]);
  });

  test('입력창은 다시 렌더링돼도 같은 노드라 포커스가 유지된다 (controlled input)', async () => {
    const App = () => {
      const [text, setText] = useState('');
      return h(
        'div',
        null,
        h('input', { value: text, onInput: (e) => setText(e.target.value) }),
        h('p', null, text.length),
      );
    };
    const { container } = mountApp(App);
    const input = container.querySelector('input');
    input.focus();

    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(container.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('abc');
    expect(container.querySelector('p').textContent).toBe('3');
  });

  test('checked: false / true가 체크 상태에 그대로 반영된다', async () => {
    let setDone;
    const App = () => {
      const [done, set] = useState(false);
      setDone = set;
      return h('input', { type: 'checkbox', checked: done });
    };
    const { container } = mountApp(App);
    const box = container.querySelector('input');
    expect(box.checked).toBe(false);
    expect(box.hasAttribute('checked')).toBe(false);

    setDone(true);
    await flush();
    expect(box.checked).toBe(true);

    setDone(false);
    await flush();
    expect(box.checked).toBe(false);
  });
});
