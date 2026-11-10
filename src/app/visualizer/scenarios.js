// 시각화 예제. before는 처음 화면, after는 편집기에 미리 넣어 두는 다음 화면이다.
// expect는 이 예제에서 나와야 하는 Patch 종류 (안내 문구용).

export const SCENARIOS = [
  {
    id: 'todo',
    label: '할 일 목록',
    expect: ['TEXT', 'PROPS', 'REMOVE', 'CREATE', 'REPLACE'],
    hint: '한 번의 Patch에 종류가 모두 나옵니다. 하나만 보고 싶으면 After에서 한 군데만 고쳐 실행해 보세요. (글자 하나, class 하나, 항목 하나 지우기 등)',
    before: `<div class="card">
  <h3>할 일</h3>
  <p class="count">남은 일 3개</p>
  <ul class="list">
    <li data-key="milk">우유 사기</li>
    <li data-key="mail">메일 보내기</li>
    <li data-key="gym">운동하기</li>
  </ul>
  <p class="note">오늘 안에 끝내기</p>
</div>`,
    after: `<div class="card">
  <h3>할 일</h3>
  <p class="count">남은 일 2개</p>
  <ul class="list">
    <li data-key="milk" class="done">우유 사기</li>
    <li data-key="gym">운동하기</li>
    <li data-key="book">책 읽기</li>
  </ul>
  <strong class="note">오늘 안에 끝내기</strong>
</div>`,
  },
  {
    id: 'reorder',
    label: '목록 재정렬',
    expect: ['MOVE', 'TEXT'],
    hint: '먼저 화면에서 두 목록의 "사과"를 체크한 뒤 Patch해 보세요. key가 있으면 DOM이 MOVE되어 체크가 사과를 따라가고, key가 없으면 글자만 TEXT로 바뀌어 체크가 제자리에 남습니다.',
    before: `<div class="lists">
  <section>
    <h3>key 있음</h3>
    <ul class="list">
      <li data-key="apple"><label><input type="checkbox"> 사과</label></li>
      <li data-key="milk"><label><input type="checkbox"> 우유</label></li>
      <li data-key="bread"><label><input type="checkbox"> 빵</label></li>
    </ul>
  </section>
  <section>
    <h3>key 없음</h3>
    <ul class="list">
      <li><label><input type="checkbox"> 사과</label></li>
      <li><label><input type="checkbox"> 우유</label></li>
      <li><label><input type="checkbox"> 빵</label></li>
    </ul>
  </section>
</div>`,
    after: `<div class="lists">
  <section>
    <h3>key 있음</h3>
    <ul class="list">
      <li data-key="milk"><label><input type="checkbox"> 우유</label></li>
      <li data-key="bread"><label><input type="checkbox"> 빵</label></li>
      <li data-key="apple"><label><input type="checkbox"> 사과</label></li>
    </ul>
  </section>
  <section>
    <h3>key 없음</h3>
    <ul class="list">
      <li><label><input type="checkbox"> 우유</label></li>
      <li><label><input type="checkbox"> 빵</label></li>
      <li><label><input type="checkbox"> 사과</label></li>
    </ul>
  </section>
</div>`,
  },
];

// 예전 주소(?s=text 등)도 열리도록 새 예제 id로 바꿔 준다.
const LEGACY = {
  text: 'todo',
  props: 'todo',
  'add-remove': 'todo',
  replace: 'todo',
  keyed: 'reorder',
  unkeyed: 'reorder',
};

export const findScenario = (id) => SCENARIOS.find((s) => s.id === (LEGACY[id] ?? id)) ?? SCENARIOS[0];
