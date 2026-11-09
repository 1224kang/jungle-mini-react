# jungle-mini-react

jungle 13기 **Mini React** 개발 레포지토리입니다.
React, Vue 같은 외부 UI 프레임워크 없이 **순수 JavaScript**로 React의 핵심 동작을 직접 구현합니다.

<br/>

## 📌  구현 목표

| 단계 | 내용 |
|---|---|
| **Phase 1** | 실제 DOM → Virtual DOM 변환, Diff 알고리즘, Patch |
| **Phase 2** | 함수형 컴포넌트, 상태(State), Hooks (`useState`, `useEffect`, `useMemo`) |

<br/>

## 📂 폴더 구조

```
jungle-mini-react/
├─ src/
│  ├─ lib/                 # Mini React 본체
│  │  ├─ vdom/             # VNode 생성, 실제 DOM → Virtual DOM 변환
│  │  ├─ reconcile/        # diff(변경 계산), patch(실제 DOM 반영)
│  │  ├─ dom/              # VNode → 실제 DOM 노드 생성 (+ 이벤트 props)
│  │  ├─ component/        # FunctionComponent: hooks 배열, mount, update (Phase 2)
│  │  └─ hooks/            # useState, useEffect, useMemo (Phase 2)
│  └─ app/                 # Mini React로 만든 데모 앱
│     └─ phase2/           # 훅 실험실 데모 (phase2.html)
├─ tests/                  # 기능별 테스트
├─ scripts/                # 검증 등 보조 스크립트
├─ Dockerfile
├─ compose.yaml
└─ package.json
```

- `src/lib`(라이브러리)와 `src/app`(라이브러리를 사용하는 앱)을 분리합니다.
- `diff`와 `patch`는 각각 독립적으로 테스트할 수 있도록 파일을 나눕니다.
- 빈 폴더의 `.gitkeep`은 폴더 구조 유지용이며, 코드를 추가하면 삭제해도 됩니다.

## 🛠️ 기술 스택

| 구분 | 사용 |
|---|---|
| 언어 | JavaScript (ES Module) |
| 런타임 | Node.js 24 (Docker `node:24-slim`) |
| 개발 서버 | [Vite](https://vite.dev/) |
| 테스트 | [Vitest](https://vitest.dev/) + [jsdom](https://github.com/jsdom/jsdom) |
| 개발 환경 | Docker, Docker Compose |

> **런타임 의존성은 0개입니다.** 위 도구는 모두 `devDependencies`이며, Mini React의 기능은 외부 라이브러리 없이 직접 구현합니다.

<br/>

## 🚀 시작하기

모든 팀원은 **Docker 컨테이너 안에서** 개발합니다. 로컬에 Node.js를 설치할 필요가 없습니다.

### 1. 사전 준비

[Docker Desktop](https://www.docker.com/products/docker-desktop/)을 설치하고 실행합니다.

```bash
docker --version
docker compose version
```

### 2. 저장소 클론 & 이미지 빌드

```bash
git clone https://github.com/1224kang/jungle-mini-react.git
cd jungle-mini-react
docker compose build
```

빌드할 때 `package-lock.json` 기준으로 패키지가 자동 설치됩니다.

### 3. 컨테이너 접속

```bash
docker compose run --rm --service-ports dev
```

프롬프트가 `node@xxxx:/app$`로 바뀌면 컨테이너 안입니다.

- `npm`, `node` 명령은 **모두 컨테이너 안에서** 실행합니다.
- 코드는 평소처럼 로컬 에디터(VS Code 등)에서 수정하면 컨테이너에 바로 반영됩니다.
- `--service-ports`를 붙여야 브라우저에서 `localhost:5173`으로 접속할 수 있습니다.
- 나갈 때는 `exit`를 입력합니다. 컨테이너는 자동으로 삭제되고, 설치한 패키지는 볼륨에 남습니다.

<br/>

## 📜 npm 스크립트

컨테이너 안에서 실행합니다.

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 → http://localhost:5173 (Phase 1), http://localhost:5173/phase2.html (Phase 2) |
| `npm test` | 테스트 감시 모드 (파일 저장 시 자동 재실행) |
| `npm run test:run` | 테스트 1회 실행 (PR 전 확인용) |
| `npx vitest run tests/diff.test.js` | 특정 테스트 파일만 실행 |

> ⚠️ `npm run dev`는 `index.html`, DOM 테스트는 `vite.config.js`(jsdom 환경 설정)가 추가된 뒤부터 동작합니다.

### dev 서버와 테스트를 동시에 실행하기

한 터미널에서 `npm run dev`를 띄워두고, 로컬에서 새 터미널을 열어 테스트용 컨테이너를 하나 더 실행합니다.

```bash
docker compose run --rm dev npm test
```

`--service-ports`를 빼야 5173 포트가 겹치지 않습니다.

<br/>

## 📦 패키지 관리 규칙

- 패키지는 **반드시 컨테이너 안에서** 설치합니다. 로컬 터미널에서 `npm install`을 실행하지 않습니다.
- 패키지 추가는 **팀 합의 후** 진행하며, 외부 UI 프레임워크(React, Vue, Svelte 등)는 사용하지 않습니다.
- 개발 도구는 `npm install -D <패키지명>`으로 `devDependencies`에 추가합니다.
- `package.json`과 `package-lock.json`은 **항상 함께 커밋**합니다.

다른 팀원이 패키지를 추가했다면 `git pull` 후 컨테이너 안에서 실행합니다.

```bash
npm install
```

<br/>

## 🤝 협업 규칙

### 작업 흐름

1. 이슈 생성 (기능 / 버그 / 작업 템플릿 선택)
2. `main`에서 브랜치 생성
3. 작업 후 컨테이너 안에서 `npm run test:run` 통과 확인
4. PR 생성 (템플릿 작성, `Closes #이슈번호` 포함)
5. 팀원 리뷰 승인 후 머지

### 브랜치 이름

```
<종류>/<작업-내용>
```

| 종류 | 용도 | 예시 |
|---|---|---|
| `feat` | 기능 구현 | `feat/diff-algorithm` |
| `fix` | 버그 수정 | `fix/patch-text-node` |
| `refactor` | 동작 변화 없는 코드 개선 | `refactor/vdom-structure` |
| `test` | 테스트 추가·수정 | `test/use-state` |
| `docs` | 문서 | `docs/readme` |
| `chore` | 환경·설정 | `chore/docker-dev-env` |

### 커밋 메시지

```
<종류>: <변경 내용 요약>
```

```
feat: diff 함수에서 텍스트 노드 비교 구현
fix: patch 시 props가 제거되지 않는 문제 수정
chore: vitest jsdom 환경 설정 추가
```

종류는 브랜치 이름과 같은 규칙(`feat`, `fix`, `refactor`, `test`, `docs`, `chore`)을 사용합니다.

