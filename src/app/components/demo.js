// 관찰 대상 데모: 장바구니. 페이지와는 별개의 루트로 mount한다(앱 하나 = 루트 하나).
// 규칙대로 State와 Hook은 루트 App에만 있고, 자식은 props만 받는 순수 함수다.
// 관찰용 계측(컴포넌트 호출 횟수, setState 횟수, DOM 변경 수)은 이 파일 안에서만 하고 lib는 건드리지 않는다.
import { h, mount, useState, useEffect, useMemo } from '../../lib/index.js';

const PRODUCTS = [
  { id: 'apple', name: '사과', price: 1200, icon: '🍎' },
  { id: 'milk', name: '우유', price: 2500, icon: '🥛' },
  { id: 'bread', name: '식빵', price: 3200, icon: '🍞' },
  { id: 'egg', name: '달걀', price: 4800, icon: '🥚' },
];
const productOf = (id) => PRODUCTS.find((p) => p.id === id);
const won = (n) => `${n.toLocaleString('ko-KR')}원`;

/** 합계 계산을 체감할 수 있게 일부러 늘리는 시간(ms). 실제 앱이라면 비싼 정렬·집계가 이 자리에 온다. */
const SLOW_MS = 300;
/** ms 동안 CPU를 붙잡는다. (렌더 중 동기 계산이 오래 걸리는 상황을 흉내) */
function slowDown(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* busy wait */ }
}

/** 인스펙터가 보여 줄 컴포넌트 구조. props는 부모가 넘기는 이름이다. */
export const TREE = {
  name: 'App',
  role: '루트 · State와 Hook을 가진 유일한 컴포넌트',
  props: [],
  children: [
    { name: 'CartHeader', props: ['count', 'view', 'onToggleView'] },
    { name: 'ProductList', props: ['onAdd'], children: [{ name: 'ProductCard', props: ['product', 'onAdd'], many: true }] },
    {
      name: 'Cart',
      props: ['items', 'view', 'onInc', 'onDec'],
      children: [
        { name: 'CartRow', props: ['item', 'view', 'onInc', 'onDec'], many: true },
        { name: 'EmptyCart', props: [] },
      ],
    },
    { name: 'Summary', props: ['summary', 'coupon', 'idle', 'memoOn', 'onToggleCoupon', 'onToggleMemo', 'onBumpAll'] },
  ],
};

/** App의 Hook 슬롯 순서와 이름. 선언 순서가 곧 슬롯 번호다. */
export const HOOK_LABELS = [
  { name: 'items', call: 'useState', note: '장바구니 품목' },
  { name: 'coupon', call: 'useState', note: '10% 쿠폰 사용' },
  { name: 'view', call: 'useState', note: '보기 방식 (합계와 무관)' },
  { name: 'memoOn', call: 'useState', note: 'useMemo 사용 스위치 (비교용)' },
  { name: 'idle', call: 'useState', note: '장바구니를 안 건드린 초' },
  { name: 'summary', call: 'useMemo', note: 'deps [items, coupon] · 일부러 느린 계산' },
  { name: 'mount log', call: 'useEffect', note: 'deps [] → 처음 1회' },
  { name: 'count log', call: 'useEffect', note: 'deps [items.length] + cleanup' },
  { name: 'idle timer', call: 'useEffect', note: 'deps [items, coupon] + cleanup(clearInterval)' },
  { name: 'report', call: 'useEffect', note: 'deps 없음 → 렌더마다' },
];
/** effect 기록에 쓰는 슬롯 번호. 번호를 직접 쓰지 않고 이름으로 찾는다. */
const slotOf = (name) => HOOK_LABELS.findIndex((label) => label.name === name);

/* ---------- 계측 ---------- */

let calls = {}; // 이번 렌더에서 컴포넌트별 호출 횟수
let pending = null; // 다음 렌더 보고에 담을 내용
let memoRuns = 0;
let memoRan = false;
let memoMs = 0; // 이번 렌더에서 useMemo가 계산에 쓴 시간 (건너뛰면 0)
let renderStart = 0; // 이번 렌더 시작 시각 (App 호출 직전)
let renderCount = 0; // App 호출 횟수. useMemo를 끈 상태에서 deps를 매번 바꾸는 데 쓴다
let nextAfterReport = null; // effect 안 setState가 만든 다음 렌더의 설명 { action, setCalls }

const IDLE_NOTICE_SEC = 10;

function resetPending(action, setCalls = 0, kind = null) {
  pending = { action, setCalls, kind, effects: [] };
}

/** 자식 컴포넌트를 감싸 호출 횟수를 센다. 함수 이름은 그대로 둔다(중복 key 경고 등에 쓰임). */
function track(name, fn) {
  const Component = (props) => {
    calls[name] = (calls[name] ?? 0) + 1;
    return fn(props);
  };
  Object.defineProperty(Component, 'name', { value: name });
  return Component;
}

/* ---------- 자식 컴포넌트 (상태 없음) ---------- */

const CartHeader = track('CartHeader', ({ count, view, onToggleView }) =>
  h(
    'div',
    { class: 'd-head' },
    h('strong', null, '🛒 장보기'),
    h('span', { class: 'd-count' }, `${count}개 담김`),
    h('button', { type: 'button', class: 'd-ghost', onclick: onToggleView }, view === 'detail' ? '간단히 보기' : '자세히 보기'),
  ),
);

const ProductCard = track('ProductCard', ({ product, onAdd }) =>
  h(
    'button',
    { key: product.id, type: 'button', class: 'd-product', onclick: () => onAdd(product.id) },
    h('span', { class: 'd-icon', 'aria-hidden': 'true' }, product.icon),
    h('span', null, product.name),
    h('small', null, won(product.price)),
  ),
);

const ProductList = track('ProductList', ({ onAdd }) =>
  h('div', { class: 'd-products' }, PRODUCTS.map((product) => h(ProductCard, { key: product.id, product, onAdd }))),
);

const CartRow = track('CartRow', ({ item, view, onInc, onDec }) => {
  const product = productOf(item.id);
  return h(
    'li',
    { key: item.id, class: 'd-row' },
    h('span', { class: 'd-name' }, view === 'detail' ? `${product.icon} ${product.name}` : product.name),
    view === 'detail' && h('small', { class: 'd-unit' }, won(product.price)),
    h(
      'span',
      { class: 'd-qty' },
      h('button', { type: 'button', 'aria-label': `${product.name} 빼기`, onclick: () => onDec(item.id) }, '−'),
      h('output', null, String(item.qty)),
      h('button', { type: 'button', 'aria-label': `${product.name} 더하기`, onclick: () => onInc(item.id) }, '+'),
    ),
  );
});

const EmptyCart = track('EmptyCart', () => h('p', { class: 'd-empty' }, '장바구니가 비었습니다. 위에서 상품을 눌러 담아 보세요.'));

const Cart = track('Cart', ({ items, view, onInc, onDec }) =>
  items.length === 0
    ? h(EmptyCart, null)
    : h('ul', { class: 'd-rows' }, items.map((item) => h(CartRow, { key: item.id, item, view, onInc, onDec }))),
);

const Summary = track('Summary', ({ summary, coupon, idle, memoOn, onToggleCoupon, onToggleMemo, onBumpAll }) =>
  h(
    'div',
    { class: 'd-summary' },
    h(
      'label',
      { class: 'd-coupon' },
      h('input', { type: 'checkbox', checked: coupon, onchange: onToggleCoupon }),
      ' 10% 쿠폰',
    ),
    h('span', { class: 'd-total' }, coupon && summary.discount > 0 && h('s', null, won(summary.subtotal)), h('strong', null, won(summary.total))),
    h('small', { class: 'd-ms' }, `마지막 계산 ${summary.ms}ms`),
    h('button', { type: 'button', class: 'd-ghost', onclick: onBumpAll, disabled: summary.lines === 0 }, '모두 +1'),
    h(
      'div',
      { class: 'd-extra' },
      h(
        'label',
        { class: 'd-memo' },
        h('input', { type: 'checkbox', checked: memoOn, onchange: onToggleMemo }),
        ' useMemo 사용',
      ),
      // idle은 상태에서 계산하는 순수 파생 표시. 시계를 만지는 일은 루트의 effect만 한다.
      h(
        'span',
        { class: idle >= IDLE_NOTICE_SEC ? 'd-idle warn' : 'd-idle' },
        `⏱ 장바구니 변화 없이 ${idle}초`,
        idle >= IDLE_NOTICE_SEC && ` · ${IDLE_NOTICE_SEC}초째 그대로예요`,
      ),
    ),
  ),
);

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

function makeApp(onRender) {
  return function App() {
    renderStart = performance.now();
    renderCount += 1;
    calls.App = (calls.App ?? 0) + 1;

    const [items, setItems] = useState([{ id: 'apple', qty: 2 }]);
    const [coupon, setCoupon] = useState(false);
    const [view, setView] = useState('detail');
    const [memoOn, setMemoOn] = useState(true);
    const [idle, setIdle] = useState(0);

    // 핸들러가 쓰는 계측 도우미: 어떤 동작인지 남기고, setState 호출 수를 센다.
    const act = (label) => (pending.action = label);
    const counted = (setter) => (next) => {
      pending.setCalls += 1;
      setter(next);
    };
    const setItemsC = counted(setItems);

    // useMemo를 끄면 deps의 마지막 원소가 렌더마다 달라져 매번 다시 계산한다. (Hook 순서는 그대로 지킨다)
    const summary = useMemo(() => {
      memoRuns += 1;
      memoRan = true;
      const start = performance.now();
      const subtotal = items.reduce((sum, it) => sum + productOf(it.id).price * it.qty, 0);
      const discount = coupon ? Math.round(subtotal * 0.1) : 0;
      slowDown(SLOW_MS); // 일부러 느린 계산: 품목·쿠폰이 바뀔 때만 멈칫하고, 보기 전환은 즉시 반응한다
      memoMs = Math.round(performance.now() - start);
      return { subtotal, discount, total: subtotal - discount, lines: items.length, ms: memoMs };
    }, [items, coupon, memoOn ? 0 : renderCount]);

    useEffect(() => {
      pending.effects.push({ slot: slotOf('mount log'), text: '실행: 처음 mount 때 1회' });
    }, []);

    useEffect(() => {
      pending.effects.push({ slot: slotOf('count log'), text: `실행: 품목 수 ${items.length}` });
      return () => pending.effects.push({ slot: slotOf('count log'), text: '이전 effect의 cleanup 먼저 실행' });
    }, [items.length]);

    // 장바구니(items·coupon)가 바뀔 때마다: 이전 타이머를 정리(cleanup)하고 0초부터 다시 센다.
    // 보기 전환처럼 deps가 그대로인 렌더에서는 실행되지 않아 타이머가 이어진다.
    useEffect(() => {
      pending.effects.push({ slot: slotOf('idle timer'), text: '실행: 새 타이머 시작 (0초부터)' });
      if (idle !== 0) {
        setIdle(0); // effect 안 setState → 다음 마이크로태스크에 한 번 더 렌더
        nextAfterReport = { action: 'effect 안 setState · idle을 0으로', setCalls: 1 };
      }
      const id = setInterval(() => {
        resetPending('타이머 tick', 1, 'tick');
        setIdle((s) => s + 1);
      }, 1000);
      return () => {
        clearInterval(id);
        pending.effects.push({ slot: slotOf('idle timer'), text: 'cleanup: clearInterval로 이전 타이머 정리' });
      };
    }, [items, coupon]);

    // 마지막에 선언해 같은 렌더의 다른 effect 기록까지 모아 보고한다.
    useEffect(() => {
      onRender({ ...pending, calls, memoRan, memoRuns, memoMs, renderMs: Math.round(performance.now() - renderStart) });
      calls = {};
      memoRan = false;
      memoMs = 0;
      if (nextAfterReport) resetPending(nextAfterReport.action, nextAfterReport.setCalls);
      else resetPending('(이유 없이 다시 렌더)');
      nextAfterReport = null;
    });

    const onAdd = (id) => {
      act(`상품 담기 · ${productOf(id).name}`);
      setItemsC((list) =>
        list.some((it) => it.id === id) ? list.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it)) : [...list, { id, qty: 1 }],
      );
    };
    const onInc = (id) => {
      act(`수량 + · ${productOf(id).name}`);
      setItemsC((list) => list.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it)));
    };
    const onDec = (id) => {
      act(`수량 − · ${productOf(id).name}`);
      setItemsC((list) => list.flatMap((it) => (it.id !== id ? [it] : it.qty > 1 ? [{ ...it, qty: it.qty - 1 }] : [])));
    };
    const onBumpAll = () => {
      act(`모두 +1 · 품목마다 setState (${items.length}번)`);
      for (const it of items) setItemsC((list) => list.map((x) => (x.id === it.id ? { ...x, qty: x.qty + 1 } : x)));
    };
    const onToggleCoupon = () => {
      act(coupon ? '쿠폰 해제' : '쿠폰 사용');
      counted(setCoupon)((c) => !c);
    };
    const onToggleMemo = () => {
      act(`useMemo ${memoOn ? '끔' : '켬'}`);
      counted(setMemoOn)((on) => !on);
    };
    const onToggleView = () => {
      act(`보기 전환 · ${view === 'detail' ? '간단히' : '자세히'}`);
      counted(setView)((v) => (v === 'detail' ? 'compact' : 'detail'));
    };

    const count = items.reduce((sum, it) => sum + it.qty, 0);

    return h(
      'div',
      { class: 'demo-app' },
      h(CartHeader, { count, view, onToggleView }),
      h(ProductList, { onAdd }),
      h(Cart, { items, view, onInc, onDec }),
      h(Summary, { summary, coupon, idle, memoOn, onToggleCoupon, onToggleMemo, onBumpAll }),
    );
  };
}

/**
 * 데모를 container에 mount한다. 렌더가 끝날 때마다 onReport(보고)를 부른다.
 * 보고: { action, setCalls, effects, calls, memoRan, memoRuns, domChanges, hooks }
 * @returns {{ unmount: () => void }}
 */
export function mountDemo(container, onReport) {
  calls = {};
  memoRuns = 0;
  memoRan = false;
  memoMs = 0;
  renderCount = 0;
  nextAfterReport = null;
  resetPending('첫 렌더 (mount)');

  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });

  let instance = null;
  const onRender = (report) => {
    const domChanges = observer.takeRecords().length; // effect는 patch 직후 동기로 돌므로 이번 렌더의 변경만 잡힌다
    // 첫 렌더의 effect는 mount()가 끝나기 전에 돌므로, Hook 슬롯은 마이크로태스크에서 읽는다.
    queueMicrotask(() => onReport({ ...report, domChanges, hooks: instance ? snapshotHooks(instance.hooks) : [] }));
  };

  instance = mount(h(makeApp(onRender)), container);
  return {
    unmount() {
      observer.disconnect();
      instance.unmount();
    },
  };
}

/** Hook 슬롯을 표시용 값으로 복사한다. (슬롯 객체는 이후 렌더에서 바뀌므로) */
function snapshotHooks(hooks) {
  return hooks.map((slot, i) => ({
    index: i,
    type: slot.type,
    value: slot.type === 'EFFECT' ? null : JSON.stringify(slot.value),
    deps: slot.deps === null || slot.deps === undefined ? null : JSON.stringify(slot.deps),
    hasCleanup: slot.type === 'EFFECT' ? typeof slot.cleanup === 'function' : false,
  }));
}
