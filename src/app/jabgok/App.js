import { h, diff, useState, useEffect, useMemo } from '../../lib/index.js';
import { BEST_KEY, GOAL, TIME_LIMIT } from './config.js';
import { Board } from './components/Board.js';
import { Hud } from './components/Hud.js';
import { Inspector } from './components/Inspector.js';
import { Overlay } from './components/Overlay.js';
import { createController, createMemory } from './controller.js';
import { INITIAL_BOWL } from './logic/bowl.js';
import { INITIAL_CAMERA } from './logic/camera.js';
import { createGrains, deadRadiusOf, summarize } from './logic/grains.js';
import { EMPTY_REPORT, countPatches, flatten } from './logic/inspect.js';
import { createMinimap } from './logic/world.js';

let instances = 0;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0; // 저장소를 쓸 수 없으면 최고 점수 없이 진행
  }
}

function saveBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // 저장에 실패해도 게임은 계속된다
  }
}

/** 이번 렌더의 게임 영역 트리를 직전 트리와 diff해 patch를 예측하고, 종류별 개수를 프레임 기록에 더한다. */
function recordPrediction(memory, game) {
  const startedAt = performance.now();
  const tree = flatten(game);
  if (memory.prevTree !== null) {
    const counts = countPatches(diff(memory.prevTree, tree));
    for (const [type, count] of Object.entries(counts)) {
      memory.frame.counts[type] = (memory.frame.counts[type] ?? 0) + count;
    }
  }
  memory.prevTree = tree;
  memory.frame.overhead = performance.now() - startedAt;
}

/**
 * 루트 컴포넌트. 상태와 Hook은 여기에만 있고, 나머지 컴포넌트는 props만 받는 순수 함수다.
 * 화면 갱신은 requestAnimationFrame 루프가 프레임당 최대 한 번만 한다.
 * @param {{seed?: number}} props seed: 잡곡 배치 시드 (생략하면 현재 시각)
 */
export function App({ seed }) {
  const [memory] = useState(() => createMemory(seed ?? Date.now(), `grain-app-${(instances += 1)}`));
  const [phase, setPhase] = useState('ready'); // ready · playing · over
  const [grains, setGrains] = useState(() => createGrains(memory.seed, 0));
  const [heldId, setHeldId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const [bowl, setBowl] = useState(INITIAL_BOWL); // 잡곡 그릇(왼쪽 그릇)의 위치
  const [drops, setDrops] = useState(0);
  const [shakes, setShakes] = useState(0); // 스페이스바로 흔든 횟수
  const [best, setBest] = useState(readBest);
  const [inspector, setInspector] = useState(true);
  const [compare, setCompare] = useState(false);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [fps, setFps] = useState(0);
  const [nodes, setNodes] = useState(0);

  // grains가 바뀔 때만: 점수 · 옮긴 개수 · 왼쪽 그릇에 남은 알 · 종류별 집계
  const summary = useMemo(() => summarize(grains), [grains]);
  // heldId가 바뀔 때만: 잡힌 잡곡 종류에서 데드존 반지름을 구한다
  const deadRadius = useMemo(() => {
    const held = grains.find((grain) => grain.id === heldId);
    return held ? deadRadiusOf(held.type) : null;
  }, [heldId]);
  // 월드 크기에서 한 번만: 미니맵 비율과 그릇 위치
  const minimap = useMemo(() => createMinimap(), []);
  // 한 번만: 이벤트 핸들러와 루프. 렌더마다 같은 참조라 이벤트 속성 patch가 생기지 않는다.
  const game = useMemo(
    () =>
      createController(memory, {
        setPhase,
        setGrains,
        setHeldId,
        setTimeLeft,
        setCamera,
        setBowl,
        setShakes,
        setDrops,
        setReport,
        setFps,
        setNodes,
        setInspector,
        setCompare,
      }),
    [],
  );

  // 이벤트 · 루프가 읽을 최신 상태와 관찰 기록을 적는다. (memory는 렌더를 일으키지 않는 useRef 자리)
  memory.live = { phase, grains, heldId, timeLeft, camera, bowl, drops, shakes, deadRadius, inspector, compare, report };
  memory.renders += 1;
  memory.frame.startedAt = performance.now();

  // 게임 루프: playing일 때만 돈다. 다시 하기 때는 cleanup 후 새로 시작하고, 이전 프레임 콜백은 무시한다.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    memory.lastTime = null;
    let alive = true;
    let id = 0;
    const loop = (time) => {
      if (!alive) return;
      game.frame(time);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [phase]);

  // 타이머: 1초마다 남은 시간 - 1, 0이면 over
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(game.tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 탭 전환: 가려지면 일시정지
  useEffect(() => {
    document.addEventListener('visibilitychange', game.onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', game.onVisibilityChange);
  }, []);

  // DOM 관찰: 게임 영역의 실제 DOM 변경 수를 프레임마다 센다
  useEffect(() => {
    memory.root = document.querySelector(`[data-app-id="${memory.uid}"]`);
    const target = memory.root?.querySelector('.game');
    if (!target || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(game.onMutations);
    observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // 최고 점수 저장: over가 되면 localStorage에 저장
  useEffect(() => {
    if (phase !== 'over' || summary.score <= best) return;
    saveBest(summary.score);
    setBest(summary.score);
  }, [phase]);

  // 키보드: 보드에 포커스가 없어도 동작해야 하므로 on* prop이 아니라 window에 단다
  useEffect(() => {
    window.addEventListener('keydown', game.onKeyDown);
    return () => window.removeEventListener('keydown', game.onKeyDown);
  }, []);

  const result =
    phase === 'over'
      ? { win: summary.score >= GOAL, score: summary.score, moved: summary.moved, drops, rotten: summary.rotten, timeLeft, byType: summary.byType }
      : null;

  const gameArea = h(
    'div',
    { class: 'game' },
    h(Hud, { timeLeft, score: summary.score, goal: GOAL, remaining: summary.remaining, drops, camera, bowl, minimap }),
    h(
      'div',
      { class: 'board-wrap' },
      h(Board, {
        camera,
        grains,
        bowl,
        heldId,
        shakes,
        onPointerDown: game.onPointerDown,
        onPointerMove: game.onPointerMove,
        onPointerUp: game.onPointerUp,
      }),
      phase !== 'playing' && h(Overlay, { phase, result, best, onStart: game.onStart }),
    ),
  );

  if (inspector) recordPrediction(memory, gameArea);
  else memory.prevTree = null;

  return h(
    'div',
    { class: 'grain-app', 'data-app-id': memory.uid },
    gameArea,
    h(Inspector, {
      report,
      fps,
      nodes,
      open: inspector,
      compare,
      onToggle: game.onToggleInspector,
      onToggleCompare: game.onToggleCompare,
    }),
  );
}
