import { h, render, useState, useEffect, useMemo } from '../../lib/index.js';
import { CounterPanel, TextPanel, TimerPanel } from './components.js';
import { log, onCommit } from './inspector.js';

/**
 * 루트 컴포넌트. 이 앱의 모든 상태와 훅은 여기에만 있다.
 * hooks 배열 칸 순서: [0] count, [1] text, [2] running, [3] seconds,
 *                     [4] stats(memo), [5] 제목 effect, [6] 타이머 effect, [7] mount effect
 */
function App() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('mini react');
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // text가 바뀔 때만 다시 계산한다.
  const stats = useMemo(() => {
    log('memo', `텍스트 통계 다시 계산 (text = "${text}")`);
    return {
      length: text.length,
      withoutSpaces: text.replace(/\s/g, '').length,
      words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
      reversed: [...text].reverse().join(''),
    };
  }, [text]);

  // count가 바뀐 렌더 뒤에만: 브라우저 탭 제목 바꾸기
  useEffect(() => {
    document.title = `count ${count} · Mini React Phase 2`;
    log('effect', `document.title 갱신 (count = ${count})`);
  }, [count]);

  // running이 바뀐 렌더 뒤에만: 타이머 시작 / 정리
  useEffect(() => {
    if (!running) return undefined;
    log('effect', 'setInterval 시작');
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      log('cleanup', 'clearInterval (타이머 정리)');
    };
  }, [running]);

  // 처음 mount 뒤 한 번만
  useEffect(() => {
    log('effect', 'mount 완료 (deps가 [] 라서 한 번만 실행)');
  }, []);

  return h(
    'div',
    { class: 'lab-grid' },
    h(CounterPanel, {
      count,
      onIncrease: () => setCount((c) => c + 1),
      onDecrease: () => setCount((c) => c - 1),
      onReset: () => setCount(0),
      // 세 번 다 같은 count(렌더 당시 값)를 보므로 결과는 +1
      onTripleByValue: () => {
        setCount(count + 1);
        setCount(count + 1);
        setCount(count + 1);
      },
      // 매번 직전 값을 받아 계산하므로 결과는 +3
      onTripleByUpdater: () => {
        setCount((c) => c + 1);
        setCount((c) => c + 1);
        setCount((c) => c + 1);
      },
    }),
    h(TextPanel, { text, stats, onInput: (event) => setText(event.target.value) }),
    h(TimerPanel, {
      running,
      seconds,
      onToggle: () => setRunning((r) => !r),
      onReset: () => setSeconds(0),
    }),
  );
}

render(App, document.querySelector('#app'), { onCommit });
