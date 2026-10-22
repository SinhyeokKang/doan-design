# app-ui — tasks

순서: 스택 확인 → 초안 확정 → 순수 함수 → main · shell → 렌더러 → e2e → `/design-sync` → 승격. `── commit ──`은 커밋 경계다. `/ship` · `/orchestrate`로 진행할 때 코드 경계는 `test:`(red) + `feat:` 커밋 한 쌍으로 나눠도 된다. 각 경계에서 `npm --prefix app test`와 `npm --prefix app run typecheck`가 통과해야 한다.

## 0. 스택 확인 (게이트)

- `.scratch/app-ui-stack/`에서 지금 앱의 electron-vite 설정을 복사해 React + shadcn/ui(Dialog · DropdownMenu · Tabs · Tooltip · ScrollArea) + Tailwind 최소 렌더러를 띄운다.
- 확인: 빌드한 렌더러가 CSP `default-src 'self'; frame-src http://127.0.0.1:*`에서 콘솔 CSP 위반 없이 위 컴포넌트를 연다. dev 모드에서도 화면이 뜬다. 버전은 이 시점의 최신 안정판으로 정확히 고정한다.
- 명령(2026-10-22 사용자 허용): `.scratch/app-ui-stack/` 안의 `npm install` · 빌드 · 실행, 구현 때 `npm --prefix app install --save-exact <패키지@버전>`, `app/` 안의 `npx shadcn@<고정 버전> add <컴포넌트>`. 버전은 그 시점 최신 안정판으로 정확히 고정한다. 이후에도 쓰는 명령은 task 7에서 AGENTS.md 'Commands'에 적는다.
- 검증: 결과(버전, CSP 위반 여부, dev 동작)가 design.md 'PoC · 사전 확인'에 적혀 있다. CSP를 넓혀야 하면 멈추고 사용자에게 묻는다.

── commit (`docs(feature): app-ui stack check`) ──

## 1. 초안 확정

- 토큰을 `design/tokens.css`에서 `app/src/renderer/tokens.css`로 옮기고 `--mock-*`은 `design/mock.css`로 뺀다. `.doan/config.json`의 `tokenCss`를 새 경로로 바꾸고, 초안이 두 파일을 링크하게 한다(design.md '토큰').
- `design/app-shell.html` · `design/mock.css` · `app/src/renderer/tokens.css` · `.doan/config.json` · `.gitattributes`를 커밋한다.
- 검증: `go run ./cli/cmd/doan check --json --repo .`가 오류 0(`design/mock.css`의 `hardcoded_color` 경고만 허용), `go run ./cli/cmd/doan ls --json --repo .`에 `app-shell` 캔버스와 프레임 7개가 나온다.

── commit (`docs(design): app shell draft`) ──

## 2. 순수 함수

- `projectRow` · `pushActivity` · `canvasInfo` · `frameLabel`(영어) · `quitOnAllClosed`.
- 경계 사례:
  - `projectRow`: `FolderEntry`의 모든 `kind`(loading, list 빈 목록 포함, uninitialized, error, cliError의 reason 있음 · 없음, notFound). notFound만 `reopen`을 갖는다. 문구가 초안과 같다.
  - `pushActivity`: 최대 개수를 넘으면 가장 오래된 것부터 버림, 캔버스 키가 다르면 섞이지 않음, 같은 시각 두 사건의 순서.
  - `canvasInfo`: `width` 없음, `layout` 아직 없음(Frames "—"), 코멘트 0.
- 검증: `npm --prefix app test` 통과, `npm --prefix app run typecheck` 통과.

── commit (`feat(app): app-ui pure helpers`) ──

## 3. main · preload · shell

- 메뉴와 메시지 상자 문구를 영어로. 창 수명주기(macOS): `window-all-closed`에서 끝내지 않고, `activate`에서 창을 다시 만든다. shell은 창과 상관없이 산다.
- `shell.reopen(path)` + IPC `folders:reopen`(발신 프레임 확인은 다른 IPC와 같다) + preload `reopenFolder`.
- 경계 사례(`shell.test.ts`): 지워졌다 돌아온 폴더를 Reopen하면 목록이 뜨고 감시가 다시 걸린다. 아직 없으면 notFound가 남는다. 열려 있지 않은 경로는 무시한다.
- 검증: `npm --prefix app test` · `typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): reopen projects and keep the app alive without a window`) ──

## 4. 렌더러

- React + shadcn/ui + Tailwind 설치와 설정(tasks 0에서 고정한 버전). `index.html` · `main.ts`(진입) · `styles.css`를 바꾼다.
- `App` · `TopBar` · `Sidebar`(`ProjectTree`, `FrameList`) · `CanvasPane` + `CanvasController`(지금 `main.ts`의 명령형 코드를 옮김) · `RightPanel`(`CanvasTab`).
- 토큰만으로 색을 쓴다. 텍스트는 React 텍스트 노드로만 넣는다(`dangerouslySetInnerHTML` 금지).
- 검증: `typecheck` · `test` 통과, `grep -rn 'innerHTML\|dangerouslySetInnerHTML\|insertAdjacentHTML' app/src/renderer` 0건. 동작 확인은 task 5.

── commit (`feat(app): rebuild the renderer with React, shadcn/ui and Tailwind`) ──

## 5. e2e

- `app/e2e/runtime.ts`의 선택자를 role과 접근 이름으로 바꾸고 문구 기대값을 영어로 바꾼다. 동작 기대값은 바꾸지 않는다.
- 새 단계: Canvas 탭 값(Path · Width · Frames · Comments), Activity에 Opened 뒤 리로드마다 Reloaded가 쌓임, Not found 프로젝트의 Reopen(폴더를 되살린 뒤 목록이 뜸) · Close, 창을 닫은 뒤 앱이 살아 있고(`app.windows()` 0, 프로세스 유지) 새 창에 목록이 그대로 나옴.
- 변형 증명: canvas-view 표 11줄을 새 화면에서 다시 확인하고, 새 줄 두 개(Reopen의 `attach` 호출, `window-all-closed`에서 끝내지 않음)를 더한다.
- 검증: `npm --prefix app run e2e`가 `runtime-test: PASS`, exit 0을 두 번 연속. `/runtime-test`로 실행하고 스크린샷을 열어 본다. 변형 표의 모든 줄이 "실패 확인"이다.

── commit (`test(app): e2e for the rebuilt app shell`) ──

## 6. `/design-sync`

- Main · 첫 실행 · 캔버스 영역 상태 · 사이드바 상태 프레임에 `/design-sync`를 돌린다. 이 기능이 그 화면들의 초기 구현이므로 초안이 정본이다.
- 명령: `node .scratch/design-sync/<screen>/measure.mjs`(AGENTS.md 'Commands').
- 검증: 대조표가 모두 일치하거나 기록된 차이다. `docs/DESIGN.md`가 생기고 측정값과 근거가 있다. 잡은 회귀는 테스트로 고정했다.

── commit (`fix(app): match the app shell draft` 등, 코드 · `docs(design): DESIGN.md` 문서별로) ──

## 7. 문서 정리

- `docs/DIRECTORY.md`: 렌더러 새 구조(컴포넌트, `CanvasController`, 순수 함수 파일), `design/`.
- `.agents/skills/runtime-test/SKILL.md`: e2e 단계 목록과 선택 방식(role · 접근 이름), 새 스크린샷이 있으면 그 이름.
- `AGENTS.md` 'Commands': tasks 0에서 허락받은 명령 중 이후에도 쓰는 것(shadcn 컴포넌트 추가 등).
- 검증: 세 문서에 새 구조와 명령이 있다.

── commit (문서별로) ──

## 8. 승격과 정리

- PRODUCT.md(영문):
  - §5 기능 분할에 `app-ui`를 더하고 완료 날짜를 적는다. Dogfooding 순서를 고친다.
  - §7 결정 로그: 기능 분할(app-ui 분리), 다크 단일, 오렌지 액센트, 시스템 sans 한 가지(모노 없음), 앱 문구 영어 · 화면 이름 Project(코드 이름은 folder), V1 배치, 오른쪽 Canvas 탭, React + shadcn/ui + Tailwind, 창 닫기 macOS 관례, Reopen · Close, 토큰 위치, CSP(tasks 0 결과), 레퍼런스(Sorcerer).
  - §8에서 두 항목을 닫는다.
- ARCHITECTURE.md(영문): §7 렌더러 스택 · 창 수명주기 · 메뉴 · preload API · CSP, §3에 `CanvasController` 위치.
- `docs/features/app-ui/` 삭제.
- 검증: 디렉터리가 없다. PRODUCT §5 · §7 · §8과 ARCHITECTURE §3 · §7에 위 항목이 날짜와 함께 있다.

── commit (`docs(product)`, `docs(architecture)`, `docs(feature)` 문서별로) ──
