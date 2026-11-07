// [4-3] 패치 설명 — 흐름 지도는 app/main.js 맨 위.
//   ◀ 부른 곳: app.js commit() (diff 직후)   ▶ 다음: [4-4] patch.js (설명은 화면 표시용일 뿐 DOM 을 바꾸지 않음)
// 패치 목록을 사람이 읽을 수 있는 줄로 바꿉니다 (화면의 "이번 패치" 목록용).
// oldRoot 는 패치를 만들 때 쓴 "옛 VNode" 입니다. path 가 옛 트리 기준이기 때문입니다.

function short(s, n = 16) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function label(v) {
  return typeof v === 'string' ? `"${short(v)}"` : `<${v.type}>`;
}

function nodeAt(root, path) {
  let n = root;
  for (const i of path) n = n.children[i];
  return n;
}

function pathLabel(root, path) {
  const names = [label(root)];
  let n = root;
  for (const i of path) {
    n = n.children[i];
    names.push(label(n));
  }
  return names.join(' > ');
}

// 반환: [{ op, text }]
export function describePatches(oldRoot, patches) {
  const lines = [];
  for (const p of patches) {
    const where = pathLabel(oldRoot, p.path);
    if (p.op === 'TEXT') {
      lines.push({ op: 'TEXT', text: `${where} → "${short(p.value)}"` });
    } else if (p.op === 'PROPS') {
      const parts = [
        ...Object.entries(p.set).map(([k, v]) => `${k}="${short(String(v))}"`),
        ...p.remove.map((k) => `${k} 제거`),
      ];
      lines.push({ op: 'PROPS', text: `${where} : ${parts.join(', ')}` });
    } else if (p.op === 'REPLACE') {
      lines.push({ op: 'REPLACE', text: `${where} → ${label(p.value)}` });
    } else if (p.op === 'REMOVE') {
      lines.push({ op: 'REMOVE', text: where });
    } else if (p.op === 'CHILDREN') {
      const parent = nodeAt(oldRoot, p.path);
      p.plan.forEach((entry, j) => {
        if ('create' in entry) {
          lines.push({ op: 'CREATE', text: `${where} [${j}] ← ${label(entry.create)}` });
        } else if (entry.moved) {
          lines.push({
            op: 'MOVE',
            text: `${where} : ${label(parent.children[entry.from])} ${entry.from} → ${j}`,
          });
        }
      });
    }
  }
  return lines;
}
