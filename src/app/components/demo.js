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
    { name: 'Summary', props: ['summary', 'coupon', 'onToggleCoupon', 'onBumpAll'] },
  ],
};

/** App의 Hook 슬롯 순서와 이름. 선언 순서가 곧 슬롯 번호다. */
export const HOOK_LABELS = [
  { name: 'items', call: 'useState', note: '장바구니 품목' },
  { name: 'coupon', call: 'useState', note: '10% 쿠폰 사용' },
  { name: 'view', call: 'useState', note: '보기 방식 (합계와 무관)' },
  { name: 'summary', call: 'useMemo', note: 'deps [items, coupon]' },
  { name: 'mount log', call: 'useEffect', note: 'deps [] → 처음 1회' },
  { name: 'count log', call: 'useEffect', note: 'deps [items.length] + cleanup' },
  { name: 'report', call: 'useEffect', note: 'deps 없음 → 렌더마다' },
];

/* ---------- 계측 ---------- */

let calls = {}; // 이번 렌더에서 컴포넌트별 호출 횟수
let pending = null; // 다음 렌더 보고에 담을 내용
let memoRuns = 0;
let memoRan = false;

function resetPending(action) {
  pending = { action, setCalls: 0, effects: [] };
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

const Summary = track('Summary', ({ summary, coupon, onToggleCoupon, onBumpAll }) =>
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
    h('button', { type: 'button', class: 'd-ghost', onclick: onBumpAll, disabled: summary.lines === 0 }, '모두 +1'),
  ),
);

/* ---------- 루트: 상태와 Hook은 여기에만 ---------- */

function makeApp(onRender) {
  return function App() {
    calls.App = (calls.App ?? 0) + 1;

    const [items, setItems] = useState([{ id: 'apple', qty: 2 }]);
    const [coupon, setCoupon] = useState(false);
    const [view, setView] = useState('detail');

    const summary = useMemo(() => {
      memoRuns += 1;
      memoRan = true;
      const subtotal = items.reduce((sum, it) => sum + productOf(it.id).price * it.qty, 0);
      const discount = coupon ? Math.round(subtotal * 0.1) : 0;
      return { subtotal, discount, total: subtotal - discount, lines: items.length };
    }, [items, coupon]);

    useEffect(() => {
      pending.effects.push({ slot: 4, text: '실행: 처음 mount 때 1회' });
    }, []);

    useEffect(() => {
      pending.effects.push({ slot: 5, text: `실행: 품목 수 ${items.length}` });
      return () => pending.effects.push({ slot: 5, text: '이전 effect의 cleanup 먼저 실행' });
    }, [items.length]);

    // 마지막에 선언해 같은 렌더의 다른 effect 기록까지 모아 보고한다.
    useEffect(() => {
      onRender({ ...pending, calls, memoRan, memoRuns });
      calls = {};
      memoRan = false;
      resetPending('(이유 없이 다시 렌더)');
    });

    // 핸들러: 어떤 동작인지 남기고, setState 호출 수를 센다.
    const act = (label) => (pending.action = label);
    const counted = (setter) => (next) => {
      pending.setCalls += 1;
      setter(next);
    };
    const setItemsC = counted(setItems);

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
      h(Summary, { summary, coupon, onToggleCoupon, onBumpAll }),
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
