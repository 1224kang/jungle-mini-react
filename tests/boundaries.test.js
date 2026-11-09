import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src/lib');
const LIB_INDEX = join(LIB, 'index.js');

function listJs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listJs(full) : /\.js$/.test(name) ? [full] : [];
  });
}

const read = (file) => readFileSync(file, 'utf8');

// import/export ... from '...', import('...'), import '...' 의 경로를 모두 뽑는다.
function importsOf(source) {
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

// 상대 경로 import를 절대 경로로 풀어낸다. 패키지/절대(/) 경로는 null.
function resolveImport(file, spec) {
  if (spec.startsWith('/')) return resolve(ROOT, '.' + spec);
  if (!spec.startsWith('.')) return null;
  return resolve(dirname(file), spec);
}

const inside = (target, dir) => target === dir || target.startsWith(dir + sep);

describe('모듈 경계', () => {
  it('diff.js는 dom/을 import하지 않고 document/window를 사용하지 않는다', () => {
    const file = join(LIB, 'reconcile/diff.js');
    const source = read(file);
    for (const spec of importsOf(source)) {
      const target = resolveImport(file, spec);
      expect(target && inside(target, join(LIB, 'dom')), `diff.js가 ${spec}를 import`).toBeFalsy();
    }
    expect(/\b(document|window)\b/.test(source)).toBe(false);
  });

  it('playground, app은 lib/index.js 외의 lib 내부 파일을 import하지 않는다', () => {
    const files = [...listJs(join(ROOT, 'src/playground')), ...listJs(join(ROOT, 'src/app'))];
    for (const file of files) {
      for (const spec of importsOf(read(file))) {
        const target = resolveImport(file, spec);
        if (target && inside(target, LIB)) {
          expect(target, `${relative(ROOT, file)}가 ${spec}를 import`).toBe(LIB_INDEX);
        }
      }
    }
  });

  it('shared는 다른 lib 폴더를 import하지 않는다', () => {
    const shared = join(LIB, 'shared');
    for (const file of listJs(shared)) {
      for (const spec of importsOf(read(file))) {
        const target = resolveImport(file, spec);
        expect(
          target && inside(target, LIB) && !inside(target, shared),
          `${relative(ROOT, file)}가 ${spec}를 import`,
        ).toBeFalsy();
      }
    }
  });

  it('vdom은 hooks를 import하지 않는다 (expand.js 포함)', () => {
    const vdom = join(LIB, 'vdom');
    const hooks = join(LIB, 'hooks');
    const files = listJs(vdom);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const spec of importsOf(read(file))) {
        const target = resolveImport(file, spec);
        expect(target && inside(target, hooks), `${relative(ROOT, file)}가 ${spec}를 import`).toBeFalsy();
      }
    }
  });
});
