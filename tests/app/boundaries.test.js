import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = join(ROOT, 'src/app');
const LIB = join(ROOT, 'src/lib');

function list(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? list(full) : [full];
  });
}

const read = (file) => readFileSync(file, 'utf8');
const name = (file) => relative(ROOT, file).split(sep).join('/');
const files = list(APP);
const scripts = files.filter((file) => file.endsWith('.js'));

function importsOf(source) {
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(re)].map((match) => match[1]);
}

describe('잡곡 옮기기: 경계', () => {
  it('Hook은 루트 컴포넌트(App.js)에만 있다. 자식 컴포넌트 · 로직 파일에는 use*가 없다', () => {
    const hook = /\buse(State|Effect|Memo)\b/;
    const withHooks = scripts.filter((file) => hook.test(read(file))).map(name);
    expect(withHooks).toEqual(['src/app/App.js']);
    expect(scripts.filter((file) => file.includes(`${sep}components${sep}`)).length).toBeGreaterThanOrEqual(7);
  });

  it('라이브러리는 src/lib/index.js로만 import한다', () => {
    for (const file of scripts) {
      for (const spec of importsOf(read(file))) {
        const target = resolve(dirname(file), spec);
        if (target === LIB || target.startsWith(LIB + sep)) {
          expect(target, `${name(file)}가 ${spec}를 import`).toBe(join(LIB, 'index.js'));
        }
      }
    }
  });

  it('외부 패키지 · CDN이 없다 (모든 import는 상대 경로, 외부 URL 없음)', () => {
    for (const file of scripts) {
      for (const spec of importsOf(read(file))) {
        expect(spec.startsWith('.'), `${name(file)}가 ${spec}를 import`).toBe(true);
      }
    }
    for (const file of files) {
      expect(/https?:\/\/|\/\/cdn\./.test(read(file)), `${name(file)}에 외부 URL`).toBe(false);
    }
  });

  it('SVG를 쓰지 않는다 (라이브러리 범위 밖)', () => {
    for (const file of files) {
      expect(/<svg|h\(\s*['"]svg['"]/i.test(read(file)), `${name(file)}에 SVG`).toBe(false);
    }
  });

  it('로직 파일은 DOM · 시계 · 난수에 기대지 않는 순수 함수다', () => {
    const impure = /\b(document|window|localStorage|Date\.now|Math\.random|performance|requestAnimationFrame|setInterval|setTimeout)\b/;
    for (const file of scripts.filter((f) => f.includes(`${sep}logic${sep}`))) {
      expect(impure.test(read(file)), `${name(file)}가 순수하지 않음`).toBe(false);
    }
  });
});
