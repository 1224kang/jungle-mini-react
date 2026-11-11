// 잡곡 옮기기 게임의 수치. 기획서의 값을 한곳에 모아 로직·컴포넌트·테스트가 같은 값을 쓴다.

/** 보드(화면) 논리 크기. 창 크기가 바뀌어도 좌표는 이 크기 기준이다. */
export const VIEW = Object.freeze({ width: 960, height: 540 });

/** 월드 크기: 화면의 가로 3배, 세로 2배. */
export const WORLD = Object.freeze({ width: 2880, height: 1080 });

/** 테이블 면의 y. 그릇과 떨어진 잡곡이 이 위에 놓인다. */
export const TABLE_Y = 820;

/** 그릇 단면: 테이블 위에 놓인 높이 140px. wall은 옆벽·바닥 두께. */
export const BOWL = Object.freeze({ width: 260, height: 140, wall: 10 });

/** 그릇 중심 x. 두 중심은 2160px(화면 너비의 2.25배) 떨어져 있다. */
export const BOWL_CENTER = Object.freeze({ left: 360, right: 2520 });

/** 제한 시간(초)과 목표 점수. */
export const TIME_LIMIT = 240; // 4분
export const GOAL = 60;

/** 잡곡 종류: 지름(px), 점수, 개수. 데드존 지름은 지름 × DEADZONE_RATIO. */
export const GRAIN_TYPES = Object.freeze({
  bean: Object.freeze({ name: '콩', diameter: 14, points: 1, count: 8 }),
  redbean: Object.freeze({ name: '팥', diameter: 10, points: 2, count: 10 }),
  rice: Object.freeze({ name: '쌀', diameter: 8, points: 2, count: 14 }),
  millet: Object.freeze({ name: '조', diameter: 5, points: 3, count: 8 }),
});

/** 잡기: 누른 지점과 잡곡 중심의 거리 ≤ 반지름 + GRAB_MARGIN. */
export const GRAB_MARGIN = 2;

/** 데드존 지름 = 잡곡 지름 × 3 (지름 기준). */
export const DEADZONE_RATIO = 3;

/** 따라오기: 16.7ms마다 남은 거리의 8%, 최대 180px/초. */
export const FOLLOW = Object.freeze({ ratio: 0.08, frame: 16.7, maxSpeed: 180 });

/** 낙하 중력 가속도 (px/s²). */
export const GRAVITY = 1800;

/** 카메라: 구간 사이 간격(px)과 고정 높이. 구간 폭은 화면 너비라서 이웃 구간이 960 - 640 = 320px 겹친다. */
export const CAMERA = Object.freeze({ step: 640, y: 400 });

/** 카메라 키 (event.code). 한글 자판·Caps Lock에 영향받지 않는다. A = 왼쪽 구간, D = 오른쪽 구간, 스페이스바 = 흔들기(방해). */
export const KEY = Object.freeze({ left: 'KeyA', right: 'KeyD', shake: 'Space' });

/** 썩기: 테이블(땅)에 닿아 있던 시간의 합이 limit(ms)을 넘으면 썩는다. 들고 끄는 중에도 닿아 있으면 센다. */
export const ROT = Object.freeze({ limit: 5000, levels: 5 });

/**
 * 잡곡 그릇(왼쪽 그릇)의 이름표. 그릇 아래에 붙은 "잡곡 그릇" 글자다. gap은 그릇 밑변에서 글자 칸까지의 거리.
 * 그릇은 "곡"의 ㅗ에서 위로 튀어나온 꼭지(stub)만 잡을 수 있고, 잡으면 담긴 잡곡과 함께 통째로 옮겨진다.
 * stub은 글자 칸의 가운데 x · 윗변 y에서 잰 꼭지의 위치와 크기(px)이고, margin만큼 넉넉하게 판정한다.
 * (15px · 굵기 600의 맑은 고딕으로 그린 글자에서 잰 값이다. 글꼴이 다르면 1~2px 어긋날 수 있다)
 * deadRadius는 잡은 지점에서 포인터가 벗어나도 되는 거리(px). id는 그릇을 들고 있을 때의 heldId.
 */
export const LABEL = Object.freeze({
  id: 'bowl',
  text: '잡곡 그릇',
  width: 96,
  height: 26,
  gap: 12,
  stub: Object.freeze({ x: -10, y: 11, width: 2, height: 2.5, margin: 1 }),
  deadRadius: 30,
});

/**
 * 흔들기(스페이스바)로 잡곡이 날아가는 속력의 범위(px/s). 방향과 힘은 잡곡마다 무작위다.
 * 잡곡 그릇 안에 담긴 잡곡은 bowlScale만큼 약하게 날아간다. (그릇 안에서 들썩이는 정도)
 */
export const FLING = Object.freeze({ min: 250, max: 750, bowlScale: 0.4 });

/** 프레임 간격 상한(ms). 탭 복귀 후 첫 프레임도 여기서 잘린다. */
export const MAX_DT = 50;

/** 최고 점수를 저장하는 localStorage 키. */
export const BEST_KEY = 'grain-game:best';
