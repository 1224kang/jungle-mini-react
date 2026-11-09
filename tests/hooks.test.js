import { describe, test, expect } from 'vitest';
import { h, render, useState, useEffect, useMemo } from '../src/lib/index.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountApp(App) {
  const container = document.createElement('div');
  return { container, component: render(App, container) };
}

describe('useEffect', () => {
  test('렌더링 중이 아니라 DOM에 반영된 뒤에 실행된다', () => {
    let seenDuringRender;
    let seenInEffect;
    const container = document.createElement('div');
    render(() => {
      seenDuringRender = container.textContent;
      useEffect(() => {
        seenInEffect = container.textContent;
      });
      return h('p', null, '그려짐');
    }, container);
    expect(seenDuringRender).toBe('');
    expect(seenInEffect).toBe('그려짐');
  });

  test('deps에 따라 실행 시점이 달라진다: 없음=매번, []=한 번, [a]=a가 바뀔 때', async () => {
    const runs = { always: 0, once: 0, onA: 0 };
    let setA;
    let setB;
    mountApp(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      useEffect(() => { runs.always++; });
      useEffect(() => { runs.once++; }, []);
      useEffect(() => { runs.onA++; }, [a]);
      return h('p', null, `${a}${b}`);
    });
    expect(runs).toEqual({ always: 1, once: 1, onA: 1 });

    setB(1); // a는 그대로
    await flush();
    expect(runs).toEqual({ always: 2, once: 1, onA: 1 });

    setA(1);
    await flush();
    expect(runs).toEqual({ always: 3, once: 1, onA: 2 });
  });

  test('다시 실행하기 전에 이전 cleanup을 먼저 실행한다', async () => {
    const order = [];
    let setN;
    mountApp(() => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        order.push(`effect ${n}`);
        return () => order.push(`cleanup ${n}`);
      }, [n]);
      return h('p', null, n);
    });

    setN(1);
    await flush();
    expect(order).toEqual(['effect 0', 'cleanup 0', 'effect 1']);
  });

  test('unmount하면 남아 있는 cleanup을 실행하고 화면을 비운다', () => {
    const order = [];
    const { container, component } = mountApp(() => {
      useEffect(() => () => order.push('cleanup'), []);
      return h('p', null, 'x');
    });
    component.unmount();
    expect(order).toEqual(['cleanup']);
    expect(container.innerHTML).toBe('');
  });

  test('effect 안에서 setState하면 다음 렌더가 예약된다', async () => {
    const { container } = mountApp(() => {
      const [ready, setReady] = useState(false);
      useEffect(() => { setReady(true); }, []);
      return h('p', null, ready ? '준비 완료' : '준비 중');
    });
    expect(container.textContent).toBe('준비 중');
    await flush();
    expect(container.textContent).toBe('준비 완료');
  });
});

describe('useMemo', () => {
  test('deps가 바뀔 때만 다시 계산하고, 아니면 저장된 값을 돌려준다', async () => {
    let computeCount = 0;
    let setText;
    let setOther;
    const { container } = mountApp(() => {
      const [text, st] = useState('ab');
      const [other, so] = useState(0);
      setText = st;
      setOther = so;
      const upper = useMemo(() => {
        computeCount++;
        return text.toUpperCase();
      }, [text]);
      return h('p', null, `${upper}${other}`);
    });
    expect(computeCount).toBe(1);

    setOther(1);
    await flush();
    expect(computeCount).toBe(1);
    expect(container.textContent).toBe('AB1');

    setText('cd');
    await flush();
    expect(computeCount).toBe(2);
    expect(container.textContent).toBe('CD1');
  });

  test('객체 결과도 deps가 그대로면 같은 참조다', async () => {
    const results = [];
    let setN;
    mountApp(() => {
      const [n, set] = useState(0);
      setN = set;
      results.push(useMemo(() => ({ list: [1, 2] }), []));
      return h('p', null, n);
    });
    setN(1);
    await flush();
    expect(results[1]).toBe(results[0]);
  });
});

describe('Hook 사용 규칙', () => {
  test('자식 컴포넌트에서 Hook을 부르면 에러 (상태는 루트에서만)', () => {
    const Child = () => {
      useState(0);
      return h('p', null, 'child');
    };
    expect(() => mountApp(() => h('div', null, h(Child)))).toThrow(/최상위\(루트\) 컴포넌트/);
  });

  test('컴포넌트 밖에서 Hook을 부르면 에러', () => {
    expect(() => useState(0)).toThrow(/렌더링하는 중에만/);
  });

  test('렌더마다 Hook 호출 순서가 바뀌면 에러', async () => {
    const { component } = mountApp(() => {
      const [flag] = useState(false);
      if (flag) useMemo(() => 1, []);
      useEffect(() => {}, []);
      return h('p', null, 'x');
    });
    // setState 대신 칸 값을 직접 바꾸고 동기로 update해서 에러를 테스트 안에서 잡는다.
    component.hooks[0].value = true;
    expect(() => component.update()).toThrow(/훅 호출 순서가 바뀌었습니다/);
  });
});
