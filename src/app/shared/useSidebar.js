// 사이드바 열림 상태. 안에서 useState · useEffect를 부르므로 각 페이지의 루트 컴포넌트에서만 호출한다.
// (Hook은 루트에서만 — 이 함수도 루트 렌더 중에 불리므로 규칙 안이다.)
//
// 넓은 화면: 기본으로 열려 있고, 본문이 옆으로 밀린다. 열고 닫은 선택은 페이지를 옮겨도 유지된다.
// 좁은 화면: 기본으로 닫혀 있고, 열면 본문 위에 덮인다(배경 클릭 · Esc로 닫힘).
import { useState, useEffect } from '../../lib/index.js';

const WIDE = '(min-width: 1024px)';
const STORAGE_KEY = 'mini-react:sidebar';

const isWide = () => window.matchMedia(WIDE).matches;

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === 'open';
  } catch {
    return null; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)
  }
}

function save(open) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    /* 저장 못 해도 동작에는 지장 없음 */
  }
}

/** @returns {{ open: boolean, toggle: () => void, close: () => void }} */
export function useSidebar() {
  const [open, setOpen] = useState(() => (isWide() ? readSaved() ?? true : false));

  // 좁은 화면에서 덮어서 열렸을 때만 Esc로 닫는다.
  useEffect(() => {
    if (!open || isWide()) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const set = (next) => {
    if (isWide()) save(next);
    setOpen(next);
  };
  return { open, toggle: () => set(!open), close: () => set(false) };
}
