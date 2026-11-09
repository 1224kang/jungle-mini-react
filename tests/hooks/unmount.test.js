import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, mount, useState, useEffect } from '../../src/lib/index.js';
import { createContainer, cleanupContainers, flushMicrotasks, captureMicrotaskErrors } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupContainers();
});

describe('unmount - 마운트 해제 (FR-014, 8.4)', () => {
  it('남아 있는 effect의 cleanup을 선언 순서로 실행한다 (deps [] effect 포함)', () => {
    const log = [];
    const App = () => {
      useEffect(() => () => log.push('cleanup A'), []);
      useEffect(() => {}); // cleanup 없음
      useEffect(() => () => log.push('cleanup C'));
      return h('p', null);
    };
    const app = mount(h(App, null), createContainer());
    expect(log).toEqual([]);
    app.unmount();
    expect(log).toEqual(['cleanup A', 'cleanup C']);
  });

  it('cleanup은 가장 최근 실행이 반환한 것을 1회만 실행한다', async () => {
    const log = [];
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => () => log.push(`cleanup ${count}`), [count]);
      return h('p', null, count);
    };
    const app = mount(h(App, null), createContainer());
    setCount(1);
    await flushMicrotasks();
    log.length = 0;
    app.unmount();
    expect(log).toEqual(['cleanup 1']);
  });

  it('cleanup이 실행될 때 DOM은 아직 컨테이너에 있고, 끝나면 컨테이너가 비어 있다', () => {
    const container = createContainer();
    const seen = [];
    const App = () => {
      useEffect(() => () => seen.push(container.innerHTML));
      return h('p', null, '화면');
    };
    const app = mount(h(App, null), container);
    app.unmount();
    expect(seen).toEqual(['<p>화면</p>']);
    expect(container.childNodes).toHaveLength(0);
  });

  it('두 번째 unmount는 아무것도 하지 않는다 (cleanup 재실행·에러 없음)', () => {
    const cleanup = vi.fn();
    const App = () => {
      useEffect(() => cleanup);
      return h('p', null);
    };
    const container = createContainer();
    const app = mount(h(App, null), container);
    app.unmount();
    expect(() => app.unmount()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('E-10 unmount 후 setState는 에러 없이 무시되고 렌더·effect가 일어나지 않는다', async () => {
    const effect = vi.fn();
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(effect);
      return h('p', null, count);
    });
    const container = createContainer();
    const app = mount(h(App, null), container);
    app.unmount();

    const capture = captureMicrotaskErrors();
    expect(() => setCount(1)).not.toThrow();
    expect(() => setCount((c) => c + 1)).not.toThrow();
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toEqual([]);
    expect(App).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('unmount 전에 예약된 flush는 unmount 뒤에 아무것도 하지 않는다', async () => {
    const effect = vi.fn();
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(effect);
      return h('p', null, count);
    });
    const container = createContainer();
    const app = mount(h(App, null), container);
    setCount(1); // flush 예약
    app.unmount();

    const capture = captureMicrotaskErrors();
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toEqual([]);
    expect(App).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('cleanup 안에서 setState를 불러도 에러·렌더가 없다', async () => {
    let setCount;
    const App = vi.fn(() => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => () => setCount(99), []);
      return h('p', null, count);
    });
    const container = createContainer();
    const app = mount(h(App, null), container);

    const capture = captureMicrotaskErrors();
    expect(() => app.unmount()).not.toThrow();
    await flushMicrotasks();
    capture.restore();

    expect(capture.errors).toEqual([]);
    expect(App).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('루트 요소가 교체된 뒤 unmount해도 현재 루트 DOM을 제거한다', async () => {
    let setOn;
    const App = () => {
      const [on, set] = useState(false);
      setOn = set;
      return on ? h('section', null, '켜짐') : h('p', null, '꺼짐');
    };
    const container = createContainer();
    const app = mount(h(App, null), container);
    setOn(true);
    await flushMicrotasks();
    expect(container.innerHTML).toBe('<section>켜짐</section>');
    app.unmount();
    expect(container.childNodes).toHaveLength(0);
  });

  it('요소 VNode를 mount한 앱도 unmount하면 컨테이너가 비어 있다', () => {
    const container = createContainer();
    const app = mount(h('ul', null, h('li', null, 'a')), container);
    app.unmount();
    expect(container.childNodes).toHaveLength(0);
    expect(() => app.unmount()).not.toThrow();
  });
});
