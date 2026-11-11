/** 0.5px 단위로 반올림한다. 눈에 안 보이는 변화로 style patch가 생기지 않게 한다. */
export const half = (value) => Math.round(value * 2) / 2;

/** style 문자열의 transform 한 줄. (props 값은 문자열이어야 한다) */
export const translate = (x, y) => `transform: translate(${half(x)}px, ${half(y)}px)`;

/** 초 → "분:초". 예: 1200 → "20:00" */
export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
