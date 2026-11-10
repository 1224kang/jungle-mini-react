// 시각화 시나리오. before는 처음 화면, after는 편집기에 미리 넣어 두는 다음 화면이다.
// expect는 이 시나리오에서 나와야 하는 Patch 종류 (안내 문구용).

export const SCENARIOS = [
  {
    id: 'text',
    label: '텍스트 변경',
    expect: ['TEXT'],
    hint: '바뀐 글자만 TEXT Patch로 고칩니다. 제목과 문단 요소는 그대로 재사용됩니다.',
    before: `<div class="card">
  <h3>장보기</h3>
  <p>사과 3개</p>
</div>`,
    after: `<div class="card">
  <h3>장보기</h3>
  <p>사과 5개</p>
</div>`,
  },
  {
    id: 'props',
    label: '속성 변경',
    expect: ['PROPS', 'TEXT'],
    hint: '속성은 추가·변경(set)과 삭제(remove)를 한 PROPS Patch에 모아 보냅니다.',
    before: `<div class="card">
  <button class="chip">저장</button>
  <span class="badge" title="아직 저장 전">초안</span>
</div>`,
    after: `<div class="card">
  <button class="chip on" aria-pressed="true">저장</button>
  <span class="badge">게시됨</span>
</div>`,
  },
  {
    id: 'add-remove',
    label: '추가 · 삭제',
    expect: ['REMOVE', 'CREATE'],
    hint: '사라진 항목은 REMOVE, 새 항목은 CREATE. 남은 항목의 DOM은 그대로 둡니다.',
    before: `<ul class="list">
  <li data-key="apple">사과</li>
  <li data-key="milk">우유</li>
  <li data-key="bread">빵</li>
</ul>`,
    after: `<ul class="list">
  <li data-key="apple">사과</li>
  <li data-key="bread">빵</li>
  <li data-key="egg">달걀</li>
</ul>`,
  },
  {
    id: 'replace',
    label: '태그 교체',
    expect: ['REPLACE'],
    hint: '태그(type)가 다르면 하위를 비교하지 않고 노드를 통째로 REPLACE합니다.',
    before: `<div class="card">
  <p class="note">배송은 내일 도착합니다.</p>
</div>`,
    after: `<div class="card">
  <blockquote class="note">배송은 내일 도착합니다.</blockquote>
</div>`,
  },
  {
    id: 'keyed',
    label: 'key 재정렬',
    expect: ['MOVE'],
    hint: '먼저 화면에서 "사과"를 체크한 뒤 Patch해 보세요. key 덕분에 DOM이 통째로 MOVE되어 체크가 사과를 따라갑니다.',
    before: `<ul class="list">
  <li data-key="apple"><label><input type="checkbox"> 사과</label></li>
  <li data-key="milk"><label><input type="checkbox"> 우유</label></li>
  <li data-key="bread"><label><input type="checkbox"> 빵</label></li>
</ul>`,
    after: `<ul class="list">
  <li data-key="milk"><label><input type="checkbox"> 우유</label></li>
  <li data-key="bread"><label><input type="checkbox"> 빵</label></li>
  <li data-key="apple"><label><input type="checkbox"> 사과</label></li>
</ul>`,
  },
  {
    id: 'unkeyed',
    label: 'key 없이 재정렬',
    expect: ['TEXT'],
    hint: '같은 순서 변경을 key 없이 해 봅니다. 자리마다 글자만 바뀌어서 "사과"에 한 체크가 첫 줄(이제 "우유")에 남습니다.',
    before: `<ul class="list">
  <li><label><input type="checkbox"> 사과</label></li>
  <li><label><input type="checkbox"> 우유</label></li>
  <li><label><input type="checkbox"> 빵</label></li>
</ul>`,
    after: `<ul class="list">
  <li><label><input type="checkbox"> 우유</label></li>
  <li><label><input type="checkbox"> 빵</label></li>
  <li><label><input type="checkbox"> 사과</label></li>
</ul>`,
  },
];

export const findScenario = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
