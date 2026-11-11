import { h } from '../../lib/index.js';
import { GOAL, LABEL, KEY, MAX_DT, TIME_LIMIT, VIEW } from './config.js';
import { Board } from './components/Board.js';
import { INITIAL_BOWL, carryInBowl, hitsStub, stepBowl } from './logic/bowl.js';
import { INITIAL_CAMERA, shiftCamera, toWorld } from './logic/camera.js';
import { countMisses, createGrains, fling, grab, pickGrain, release, step, stepRot, summarize } from './logic/grains.js';
import { countDomNodes, countMutations, countVNodes, flatten, nextReport, toHtml } from './logic/inspect.js';

const now = () => performance.now();

/**
 * 렌더를 일으키지 않는 기록(React의 useRef 자리). 객체는 그대로 두고 안의 값만 바꾼다.
 * @param {number} seed 잡곡 배치 시드
 * @param {string} uid 이 앱 인스턴스의 루트 요소를 찾는 id
 */
export function createMemory(seed, uid) {
  return {
    uid,
    seed,
    round: 0, // 판 번호. 다시 하기마다 늘어 잡곡 id(key)가 모두 바뀐다.
    live: null, // 최신 상태. 이벤트·루프는 여기서 읽는다. (App이 렌더마다 적고, 상태를 바꿀 때도 바로 고친다)
    pointer: null, // 포인터의 보드 논리 좌표 { x, y }. 이벤트가 직접 기록한다.
    pointerId: null, // 잡곡(또는 그릇)을 들고 있는 포인터
    grip: { x: 0, y: 0 }, // 그릇의 글자를 잡은 지점 (그릇 기준 오프셋)
    ground: {}, // 잡곡 id → 땅에 닿아 있던 시간의 합(ms). 5초를 넘으면 썩는다.
    lastTime: null, // 직전 프레임 시각
    paused: false, // 탭이 가려져 있는 동안 true
    root: null, // 앱 루트 요소 (DOM 관찰 effect가 찾는다)
    renders: 0, // 누적 렌더 횟수 (App이 렌더마다 센다)
    rendersAtTick: 0, // 직전 1초 틱의 누적 렌더 횟수
    frame: newFrame(), // 이번 프레임의 관찰 기록
    prevTree: null, // 직전 렌더의 게임 영역 트리 (patch 예측용)
    naive: null, // "전체 다시 그리기"로 그린 직전 기록 { ms, nodes }
  };
}

function newFrame() {
  return { counts: {}, mutations: 0, ms: null, startedAt: 0, overhead: 0 };
}

/**
 * 이벤트 핸들러와 게임 루프를 만든다. App이 한 번만 만들어(deps가 빈 메모) 렌더마다 같은 참조를 쓴다.
 * 그래서 이벤트 속성 patch가 생기지 않는다. 상태는 memory.live에서 읽고 update()로만 바꾼다. (Hook은 쓰지 않는다)
 * @param {object} memory createMemory()의 결과
 * @param {object} set setState 모음 { setPhase, setGrains, setHeldId, setTimeLeft, setCamera, setDrops, setReport, setFps, setNodes, setInspector, setCompare }
 */
export function createController(memory, set) {
  const setters = {
    phase: set.setPhase,
    grains: set.setGrains,
    heldId: set.setHeldId,
    timeLeft: set.setTimeLeft,
    camera: set.setCamera,
    bowl: set.setBowl,
    shakes: set.setShakes,
    drops: set.setDrops,
    report: set.setReport,
  };

  /**
   * 상태를 바꾼다. setState와 함께 memory.live도 바로 고친다.
   * 렌더는 마이크로태스크에서 일어나므로, 그 전에 이어서 실행되는 이벤트·프레임이 직전 상태를 읽고 덮어쓰지 않게 한다.
   * 잡은 알이 바뀌면 데드존 반지름은 다음 렌더가 다시 계산할 때까지 비워 둔다. (step이 잡곡 종류에서 구한다)
   */
  function update(changes) {
    memory.live = { ...memory.live, ...changes };
    if ('heldId' in changes) memory.live.deadRadius = null;
    for (const [name, value] of Object.entries(changes)) setters[name](value);
  }

  /** 이벤트 위치를 보드 논리 좌표(960×540)로 환산한다. 창 크기가 달라도 좌표는 같다. */
  function toBoard(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = rect.width > 0 ? VIEW.width / rect.width : 1;
    const scaleY = rect.height > 0 ? VIEW.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  /** 들고 있는 잡곡을 그 자리에서 놓는다. */
  function dropHeld() {
    const live = memory.live;
    memory.pointerId = null;
    if (live.heldId === null) return;
    if (live.heldId === LABEL.id) update({ bowl: { ...live.bowl, vy: 0, held: false }, heldId: null });
    else update({ grains: release(live.grains, live.heldId), heldId: null });
  }

  /** 게임을 끝낸다. 들고 있던 잡곡은 득점 없이 그 자리에서 떨어진다. (루프가 멈추므로 더 내려가지 않는다) */
  function finish() {
    dropHeld();
    update({ phase: 'over' });
  }

  function onPointerDown(event) {
    const live = memory.live;
    if (live.phase !== 'playing' || live.heldId !== null || event.button > 0) return; // 한 번에 한 알만
    memory.pointer = toBoard(event);
    const point = { x: memory.pointer.x + live.camera.x, y: memory.pointer.y + live.camera.y };
    const index = pickGrain(live.grains, point);
    const stubHit = index === -1 && hitsStub(live.bowl, point); // 잡곡이 먼저, 없으면 그릇 이름표의 꼭지
    if (index === -1 && !stubHit) return; // 잡기 영역 밖: 아무 일 없음
    event.preventDefault();
    try {
      // 포인터가 보드·창 밖으로 나가도 계속 추적한다. DOM API라서 여기서 직접 부른다.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 합성 이벤트 등 캡처할 수 없는 포인터는 그냥 둔다.
    }
    memory.pointerId = event.pointerId;
    if (stubHit) {
      memory.grip = { x: point.x - live.bowl.x, y: point.y - live.bowl.y };
      update({ bowl: { ...live.bowl, vy: 0, held: true }, heldId: LABEL.id });
    } else {
      update({ grains: grab(live.grains, index), heldId: live.grains[index].id });
    }
  }

  /** 위치만 적는다. setState를 부르지 않으므로 이벤트가 초당 수백 번 와도 렌더는 늘지 않는다. */
  function onPointerMove(event) {
    if (memory.pointerId !== null && event.pointerId !== memory.pointerId) return;
    memory.pointer = toBoard(event);
  }

  /** pointerup · pointercancel · lostpointercapture: 들고 있던 잡곡이 떨어진다. */
  function onPointerUp(event) {
    if (memory.pointerId !== null && event.pointerId !== memory.pointerId) return;
    dropHeld();
  }

  function onStart() {
    const live = memory.live;
    if (live.phase === 'playing') return;
    if (live.phase === 'over') {
      // 다시 하기: 새 id의 잡곡으로 바꾼다. key가 바뀌므로 CREATE 40건 + REMOVE 40건이 나온다.
      memory.round += 1;
      update({
        grains: createGrains(memory.seed + memory.round, memory.round),
        camera: INITIAL_CAMERA,
        bowl: INITIAL_BOWL,
        heldId: null,
        drops: 0,
      });
    }
    memory.pointerId = null;
    memory.ground = {};
    update({ timeLeft: TIME_LIMIT, phase: 'playing' });
  }

  /** 끝난 프레임의 관찰 기록을 보고서 상태로 옮긴다. 달라진 게 없으면 상태도 그대로라 렌더가 없다. */
  function closeFrame(live) {
    const frame = memory.frame;
    memory.frame = newFrame();
    if (!live.inspector) return;
    const report = nextReport(live.report, frame, live.compare ? memory.naive : null);
    if (report !== live.report) update({ report });
  }

  /** 보드 전체를 innerHTML로 새로 그린다. ("전체 다시 그리기" 비교 모드) */
  function drawNaive(camera, grains, bowl, heldId) {
    const target = memory.root?.querySelector('.naive-view');
    if (!target) return;
    const startedAt = now();
    const tree = flatten(h(Board, { camera, grains, bowl, heldId, shakes: 0 }));
    target.innerHTML = toHtml(tree);
    memory.naive = { ms: now() - startedAt, nodes: countVNodes(tree) };
  }

  /**
   * 게임 루프의 한 프레임. requestAnimationFrame 콜백에서 불린다(effect 밖이라 연쇄 갱신 상한과 무관).
   * 포인터의 월드 좌표를 다시 구해 잡곡을 진행하고, 바뀐 것만 setState한다. 같은 콜백의 setState는 렌더 1번으로 합쳐진다.
   */
  function frame(time) {
    const live = memory.live;
    const last = memory.lastTime;
    memory.lastTime = time;
    if (last === null || memory.paused || live.phase !== 'playing') return;
    const dt = Math.min(time - last, MAX_DT);
    if (!(dt > 0)) return;

    closeFrame(live);

    const cursor = memory.pointer && toWorld(memory.pointer, live.camera);

    // 잡곡 그릇 → 담긴 잡곡(그릇과 함께 이동) → 든 잡곡 · 떨어지는 잡곡 → 썩기 순서로 진행한다.
    const bowl = stepBowl(live.bowl, cursor && { ...cursor, gripX: memory.grip.x, gripY: memory.grip.y }, dt);
    const carried = carryInBowl(live.grains, bowl.x - live.bowl.x, bowl.y - live.bowl.y);
    const stepped = step(carried, cursor && { ...cursor, deadRadius: live.deadRadius ?? undefined }, dt, bowl);
    const rot = stepRot(stepped, memory.ground, dt, bowl);
    memory.ground = rot.times;
    const grains = rot.grains;
    let heldId = live.heldId;

    if (bowl !== live.bowl) update({ bowl });
    if (heldId === LABEL.id && !bowl.held) heldId = null;
    if (grains !== live.grains) {
      update({ grains });
      const misses = countMisses(live.grains, grains);
      if (misses > 0) update({ drops: live.drops + misses });
      if (heldId !== null && heldId !== LABEL.id && !grains.some((grain) => grain.id === heldId && grain.where === 'held')) {
        heldId = null;
      }
    }
    if (heldId !== live.heldId) {
      memory.pointerId = null;
      update({ heldId });
    }
    if (grains !== live.grains && summarize(grains).score >= GOAL) finish();

    if (live.inspector && live.compare) drawNaive(live.camera, grains, bowl, heldId);
    else memory.naive = null;
  }

  /** 1초마다: 남은 시간을 줄이고, 초당 렌더 횟수와 노드 수를 갱신한다. 0초면 끝낸다. */
  function tick() {
    const live = memory.live;
    if (live.phase !== 'playing' || memory.paused) return;
    const timeLeft = Math.max(0, live.timeLeft - 1);
    update({ timeLeft });
    set.setFps(memory.renders - memory.rendersAtTick);
    memory.rendersAtTick = memory.renders;
    if (memory.root) set.setNodes(countDomNodes(memory.root));
    if (timeLeft === 0) finish();
  }

  /**
   * 스페이스바(방해): 화면이 흔들리고, 들고 있던 잡곡 · 테이블 위의 잡곡 · 잡곡 그릇 안의 잡곡이 무작위 방향 · 무작위 힘으로 날아간다.
   * 들고 있던 그릇은 그 자리에서 떨어진다.
   */
  function onShake(event) {
    const live = memory.live;
    if (live.phase !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); // 페이지가 스크롤되지 않게
    if (event.repeat) return;
    memory.pointerId = null;
    const changes = { shakes: live.shakes + 1 };
    const grains = fling(live.grains, Math.random);
    if (grains !== live.grains) changes.grains = grains;
    if (live.heldId === LABEL.id) changes.bowl = { ...live.bowl, vy: 0, held: false };
    if (live.heldId !== null) changes.heldId = null;
    update(changes);
  }

  /**
   * A · D: 카메라를 왼쪽 · 오른쪽 구간으로 옮긴다. 키는 event.code로 판정한다. (한글 자판에서는 event.key가 'ㅁ'처럼 나온다)
   * 잡곡은 카메라에 실려 가지 않는다. 구간을 옮기면 들고 있던 잡곡은 그 자리에서 떨어지므로,
   * 구간이 겹치는 곳에 내려놓고 옮긴 뒤 다시 집어야 한다.
   */
  function onKeyDown(event) {
    if (event.code === KEY.shake) return onShake(event);
    const direction = event.code === KEY.left ? -1 : event.code === KEY.right ? 1 : 0;
    if (direction === 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    const live = memory.live;
    if (live.phase !== 'playing') return;
    event.preventDefault(); // 게임 중 A · D의 페이지 동작을 막는다
    if (event.repeat) return; // 꾹 눌러 반복되는 keydown은 무시: 한 번 누르면 한 구간
    const camera = shiftCamera(live.camera, direction);
    if (camera === live.camera) return; // 끝 구간
    dropHeld();
    update({ camera });
  }

  /** 탭 전환 · 창 최소화: 일시정지하고 들고 있던 잡곡을 놓는다. 복귀 후 첫 프레임의 dt는 MAX_DT에서 잘린다. */
  function onVisibilityChange() {
    memory.paused = document.hidden;
    if (!memory.paused) return;
    dropHeld();
  }

  /** MutationObserver 콜백: 게임 영역의 실제 DOM 변경 수와 렌더에 걸린 시간을 적는다. */
  function onMutations(records) {
    const frameRecord = memory.frame;
    frameRecord.mutations += countMutations(records);
    frameRecord.ms = Math.max(0, now() - frameRecord.startedAt - frameRecord.overhead);
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onStart,
    onToggleInspector: () => set.setInspector((open) => !open),
    onToggleCompare: () => set.setCompare((on) => !on),
    frame,
    tick,
    onKeyDown,
    onVisibilityChange,
    onMutations,
  };
}
