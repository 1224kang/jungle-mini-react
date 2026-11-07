const PREFIX = '[mini-react]';

/**
 * Phase 1 범위 밖 입력에 대한 에러. (docs/contracts.md 3장)
 * @param {string} what 지원하지 않는 내용
 * @returns {Error}
 */
export function unsupportedError(what) {
  return new Error(`${PREFIX} 지원하지 않음: ${what} (Phase 1 범위 밖)`);
}

/**
 * 범위 안이지만 형식이 잘못된 입력에 대한 에러. (docs/contracts.md 3장)
 * @param {string} what 잘못된 내용
 * @returns {TypeError}
 */
export function invalidInputError(what) {
  return new TypeError(`${PREFIX} 잘못된 입력: ${what}`);
}
