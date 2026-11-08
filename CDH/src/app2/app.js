// [Phase 2 데모] 연결부: 루트 컴포넌트를 mount 하고 디버그 패널·batching 스위치를 이어 줍니다.
import { FunctionComponent } from '../lib/index.js';
import { TodoApp } from './todo-app.js';
import { createDebugPanel } from './debug-panel.js';

function safeStorage(doc) {
  try {
    return doc.defaultView.localStorage;
  } catch {
    return undefined; // 저장소가 막힌 환경 (시크릿 모드 등)
  }
}

export function initApp(doc, { storage = safeStorage(doc) } = {}) {
  const panel = createDebugPanel(doc);
  const component = new FunctionComponent(TodoApp, {
    props: { storage, log: panel.log, onMemo: panel.onMemo },
    onCommit: panel.onCommit,
  });
  panel.attach(component);
  component.mount(doc.getElementById('app'));

  const batch = doc.getElementById('batch-toggle');
  if (batch) {
    batch.checked = component.batch;
    batch.addEventListener('change', () => {
      component.flush(); // 대기 중이던 갱신은 먼저 반영
      component.batch = batch.checked;
    });
  }
  return component;
}
