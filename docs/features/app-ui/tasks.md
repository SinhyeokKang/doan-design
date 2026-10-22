# app-ui — tasks

순서: 하네스 정리 → 스택 확인 → 초안 확정 → 순수 함수 → main · shell → 렌더러 → e2e → `/design-sync` → 승격. `── commit ──`은 커밋 경계다. 각 경계에서 `npm --prefix app test`와 `npm --prefix app run typecheck`가 통과해야 한다(문서만 바뀌는 경계는 빼고).

진행(2026-10-22 사용자, feature-review):
- task 0부터 `/orchestrate`(또는 `/ship`)로 main에서 만든 `feat-app-ui` 브랜치에서 진행한다. 끝은 그 브랜치 push와 PR이다. 코드 경계는 `test:`(red) + `feat:` 커밋 한 쌍으로 나눠도 된다.
- 구현 워커는 Codex다. 이 기능에 한해 사용자가 모델 경계를 넘는 것을 허가했다(AGENTS.md 'Runtime differences'). 목적은 Claude Code가 그린 초안을 Codex가 doan으로 확인하고 그대로 구현할 수 있는지 보는 것이다. 워커에게는 초안 파일 경로와 `doan ls` · `doan check` 결과를 넘기고, 초안을 말로 풀어 주지 않는다.
- 커밋 trailer는 만든 런타임을 따른다(Codex 커밋은 `Co-Authored-By: Codex <noreply@openai.com>`).

## 0. 하네스 정리

- `AGENTS.md` 'Commands': `--repo .` 예외를 "`/design-sync`, 그리고 이 리포 `design/` 초안을 확인하는 읽기 전용 `ls` · `check`"로 넓히고 날짜를 적는다.
- `AGENTS.md` 'Workflow': `/design-sync` 줄의 "Use it from #6 on"을 "Use it from app-ui on"으로 바꾼다.
- 검증: 두 줄이 날짜와 함께 바뀌어 있다(`grep -n 'from app-ui on\|design/. draft' AGENTS.md`).

── commit (`docs(agents): allow read-only doan checks of this repo's drafts`) ──

## 1. 스택 확인 (게이트)

- `.scratch/app-ui-stack/`에서 지금 앱의 electron-vite 설정을 복사해 React + shadcn/ui + Tailwind 최소 렌더러를 띄운다. 컴포넌트는 이번 기능이 쓰는 것만 넣는다(Tooltip · ScrollArea, 그 밖에 쓰게 되면 그것도).
- 확인 항목:
  - 빌드와 dev 양쪽에서 Tooltip을 연 상태, ScrollArea를 마운트한 상태로 `securitypolicyviolation` 이벤트가 0건이다. 빌드 CSP는 `default-src 'self'; frame-src http://127.0.0.1:*`, dev는 지금 `electron.vite.config.ts`의 dev CSP다. `styles.css`는 `<link>`로 둔다.
  - TSX 파일 하나와 shadcn이 만든 컴포넌트 하나가 `tsc --noEmit`(TypeScript 7.0.2)을 통과한다. `@/` alias가 tsconfig · vite · `components.json`에서 맞는다. vite 8.3.4 · electron-vite 6.0.0과 peer 경고가 없다.
  - Electron `fileMenu` · `windowMenu` 역할의 기본 항목(Close가 어디에 있는지), iframe 안으로 들어가는 Tab 동작.
  - 버전은 이 시점의 최신 안정판으로 정확히 고정한다. `shadcn add`가 설치하는 의존성(lucide-react, cva, clsx, tailwind-merge 등)도 정확히 고정되게 `app/.npmrc`에 `save-exact=true`를 두거나, 끝난 뒤 `package.json`에서 `^` · `~`를 0건으로 만든다.
- 명령(2026-10-22 사용자 허용): `.scratch/app-ui-stack/` 안의 `npm install` · 빌드 · 실행, 구현 때 `npm --prefix app install --save-exact <패키지@버전>`, `app/` 안의 `npx shadcn@<고정 버전> add <컴포넌트>`. 이후에도 쓰는 명령은 task 8에서 AGENTS.md 'Commands'에 적는다.
- 검증: 위 확인 항목마다 결과(버전, 위반 건수, 통과 여부)가 design.md 'PoC · 사전 확인'에 적혀 있다. CSP를 넓혀야 하면 멈추고 사용자에게 묻는다.

── commit (`docs(feature): app-ui stack check`) ──

## 2. 초안 확정

- `design/app-shell.html`을 고친다(feature-review 합의):
  - 머리말 · `data-doan-title` · 주석 · 타일 제목을 영어로, `lang="en"`.
  - Main의 흐린 Design · Comments 탭을 지우고 패널 머리글 "Canvas"만 둔다. #6 · #7 이후 모습 프레임의 탭과 모드 토글에는 "undecided (differs from PRODUCT §5 4)"를 표시한다. 구성 요소 프레임의 ⌘K를 지운다.
  - 사이드바 상태: 오류 칩을 "Error"(detail은 CLI message)로, CLI error에 Reopen을 더하고 detail은 이유만, Not found detail은 "<path> is gone or moved. Restore it and Reopen, or Close it.", Reopen 뒤 Reading… 칸. "Reopen · Close (PRODUCT §8 결정)"을 "(decided in app-ui)"로. 같은 basename 프로젝트와 하위 폴더 캔버스 이름 예.
  - 캔버스 영역 상태: `closed` · `notFound` 사라짐 칸, 캔버스가 열려 있지 않을 때(패널 "No canvas open", 폭 칩 "—", Reload와 줌 disabled), "Couldn't load the canvas"에 "Run doan check in a terminal".
  - 아래 왼쪽 "Reloaded" → "Updated". 열기 버튼은 모두 "Open Project…". 메뉴와 창 프레임에 File 메뉴(Open Project… ⌘O, Close Window ⌘W).
  - 프레임 행은 id와 title을 나란히 보여 준다(design.md `frameLabel`).
- 검증: `go run ./cli/cmd/doan check --json --repo .`가 오류 0, `go run ./cli/cmd/doan ls --json --repo .`에 `app-shell` 캔버스와 프레임 7개(main, future, empty, canvas-states, sidebar-states, menus, components)가 나온다. `grep -n '[가-힣]' design/app-shell.html` 0건.

── commit (`docs(design): app shell draft` — `design/app-shell.html` · `design/tokens.css` · `.doan/config.json` · `.gitattributes`) ──

- 토큰을 `design/tokens.css`에서 `app/src/renderer/tokens.css`로 옮기고 머리 주석을 고친다. `--mock-*`은 `design/mock.css`로 뺀다. `.doan/config.json`의 `tokenCss`를 새 경로로 바꾸고, 초안이 두 파일을 링크하게 한다(design.md '토큰'). `tokens.css`에는 순수 `:root` 변수만 둔다.
- 검증: 위 `check` · `ls`를 다시 돌려 오류 0(`design/mock.css`의 `hardcoded_color` 경고만 허용)이고 프레임 7개다. `grep -n '@import\|@tailwind\|@theme' app/src/renderer/tokens.css` 0건.

── commit (`chore(app): move design tokens into the renderer`) ──

## 3. 순수 함수

- `projectRow` · `projectNames` · `canvasName` · `pushActivity` · `canvasInfo`(design.md '순수 함수'). `canvasView.ts`의 `frameLabel`을 `{id, title?}`로 바꾸고 `mono`를 없앤다. `cliErrorText` · `updatedText`를 영어로 바꾼다(`updatedText`는 24시간 `HH:MM:SS`).
- main `view.ts`: `CanvasRow`에 `id?` · `resolved`를 더한다. `canvasRows`는 `open`과 같은 검사 규칙으로 읽는다.
- 경계 사례:
  - `projectRow`: `FolderEntry`의 모든 `kind`(loading, list 빈 목록 포함, uninitialized, error, cliError의 reason 있음 · 없음, notFound). `reopen`은 notFound · cliError만. 칩과 힌트가 나뉜다. 문구가 초안과 같다.
  - `projectNames`: basename이 겹치는 두 경로, 셋 이상, 겹치지 않음. `canvasName`: `design/` 바로 아래, 하위 폴더.
  - `pushActivity`: 최대 개수를 넘으면 가장 오래된 것부터 버림, 캔버스 키가 다르면 섞이지 않음, 같은 시각 두 사건의 순서. 시각 형식이 로케일과 상관없이 24시간이다.
  - `canvasInfo`: `width` 없음, `id` 없음, `layout` 아직 없음(Frames "—"), `truncated`(Frames "1,000+"), 코멘트 0.
  - `frameLabel`: 빈 id("(no id)"), title 없음, 같은 id 두 개.
  - `canvasRows`(`view.test.ts`): `id` 없음 · 문자열 아님, `resolved` 없음 · 음수 · 정수 아님.
- 검증: `npm --prefix app test` 통과, `npm --prefix app run typecheck` 통과. `shell.test` · `view.test` · `canvasView.test`의 바뀐 기대값은 문구와 `mono`뿐이다(diff).

── commit (`feat(app): app-ui pure helpers`) ──

## 4. main · preload · shell

- 메뉴와 메시지 상자 문구를 영어로, File 메뉴(Open Project… ⌘O, Close Window ⌘W)를 더한다. `shell.ts` · `view.ts`의 거절 문구를 영어로.
- 창: 1238×780, 최소 960×600, `titleBarStyle: "hiddenInset"`. 수명주기는 design.md 흐름 5(close → hide, `before-quit` 종료 표시, `activate` · ⌘O → show, 창이 없을 때 `activate`는 무시). `webContents.send` 앞에 `isDestroyed()` 가드.
- `shell.reopen(path)`(loading 알림 → `attach`) + IPC `folders:reopen`(`typeof` 검사, 발신 프레임 확인은 다른 IPC와 같다) + preload `reopenFolder`. preload `onFolders` · `onViewCommand`가 해제 함수를 돌려준다.
- 경계 사례(`shell.test.ts`): 지워졌다 돌아온 폴더를 Reopen하면 loading을 거쳐 목록이 뜨고 감시가 다시 걸린다. 아직 없으면 notFound가 남는다. 돌아온 경로에 `.doan/`이 없으면 uninitialized다. cliError 항목도 Reopen된다. 열려 있지 않은 경로는 무시한다. 연달아 두 번 Reopen해도 감시는 하나다. 문자열이 아닌 path는 거절한다.
- 검증: `npm --prefix app test` · `typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): reopen projects and keep the app alive without a window`) ──

## 5. 렌더러

- React + shadcn/ui + Tailwind 설치와 설정(task 1에서 고정한 버전과 설정). `index.html`(`lang="en"`, `styles.css`는 `<link>`) · `main.ts`(JSX 없는 진입, `App.tsx`를 import) · `styles.css`(`@theme inline`으로 shadcn 이름을 토큰에 매핑, `shadcn init`의 색 블록은 지움)를 바꾼다.
- `App` · `TopBar` · `Sidebar`(`ProjectTree`, `FrameList`) · `CanvasPane` + `CanvasController`(지금 `main.ts`의 명령형 코드를 옮김, `dispose` 포함) · `RightPanel`. 트리는 직접 만든다(design.md 흐름 8). 접근 이름은 design.md '문구'의 표를 따른다.
- `CanvasController` 단위 테스트: 팬에서는 콜백이 불리지 않고, 줌은 반올림한 %가 바뀔 때만 콜백이 불린다.
- 토큰만으로 색을 쓴다. 텍스트는 React 텍스트 노드로만 넣는다(`dangerouslySetInnerHTML` 금지).
- 검증:
  - `typecheck` · `test` 통과.
  - `grep -rnE 'innerHTML|outerHTML|dangerouslySetInnerHTML|insertAdjacentHTML' app/src/renderer` 0건.
  - `grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(' app/src/renderer --exclude=tokens.css` 0건.
  - `grep -rn '[가-힣]' app/src` 0건.
  - `go run ./cli/cmd/doan check --json --repo .` 오류 0(초안의 `data-doan-implements`가 깨지지 않음).
  - 동작 확인은 task 6.

── commit (`feat(app): rebuild the renderer with React, shadcn/ui and Tailwind`) ──

## 6. e2e

- `app/e2e/runtime.ts`를 role · 접근 이름 · ARIA 상태로 읽게 바꾸고 문구 기대값을 영어로 바꾼다(design.md 흐름 9의 대체 표). 동작 기대값은 바꾸지 않는다. 표시 때문에 바뀌는 기대값(`mono` 제거, 코멘트 배지, 프레임 행 id · title)은 흐름 9의 목록과 diff가 같아야 한다.
- 새 단계:
  - Canvas 패널 값(Path · ID · Width · Frames · Open · Resolved), 캔버스가 열려 있지 않을 때 "No canvas open"과 disabled 컨트롤.
  - Activity: Opened 뒤 리로드마다 Reloaded가 위에 쌓이고, 실패한 load는 쌓이지 않는다.
  - Not found 프로젝트의 Reopen: Reading…을 거쳐, 폴더를 되살렸으면 목록이 뜨고 아니면 Not found가 남는다. Close.
  - 프로젝트를 Close하면 열린 캔버스가 빈 상태로 돌아간다. 폴더가 사라지면 "gone or moved" 문구가 뜬다.
  - 창 숨기기: ⌘W(메뉴 클릭)와 `close()` 뒤 `isVisible()`이 false이고 프로세스가 살아 있다. 숨은 동안 캔버스 파일을 바꾼다. `app.emit("activate")` 뒤 같은 창이 보이고, 열린 프로젝트 · 열린 캔버스 · 뷰 · Activity가 그대로이며, 숨은 동안의 변경이 리로드돼 보인다.
  - 트리 키보드(↑↓는 열지 않음, Enter로 엶, ←→ 접고 폄)와 목록 갱신 뒤 포커스 유지.
- 변형 증명: ARCHITECTURE §3 'Canvas view'의 Mutation proof 10항목을 새 화면에서 다시 확인한다. 새 줄을 더한다: Reopen의 `attach` 호출(unit), `folders:reopen` 발신 프레임 확인(unit), `close`의 `preventDefault`(e2e: 창이 사라지거나 앱이 끝남), `activate`의 `show`(e2e). 결과는 이 task 아래에 표로 적고 task 9에서 ARCHITECTURE §3으로 옮긴다.
- 검증: `npm --prefix app run e2e`가 `runtime-test: PASS`, exit 0을 두 번 연속. `/runtime-test`로 실행하고 스크린샷을 열어 본다. 변형 표의 모든 줄이 "실패 확인"이다.

── commit (`test(app): e2e for the rebuilt app shell`) ──

## 7. `/design-sync`

- Main · 첫 실행 · 캔버스 영역 상태 · 사이드바 상태 프레임에 `/design-sync`를 돌린다. 이 기능이 그 화면들의 초기 구현이므로 초안이 정본이다. 메뉴와 창 · 구성 요소 · #6 · #7 이후 모습은 비교하지 않는다.
- 교차(design.md 흐름 10): Codex 워커가 측정하고 구현을 고친다. 리뷰 단계는 Claude가 맡는다. 고치기 전 첫 대조표(불일치 수와 종류)를 남겨 둔다. 실험 관찰의 근거다.
- 명령: `node .scratch/design-sync/<screen>/measure.mjs`(AGENTS.md 'Commands').
- 검증: 대조표가 모두 일치하거나 기록된 차이다. `docs/DESIGN.md`가 생기고 측정값과 근거가 있다. 잡은 회귀는 테스트로 고정했다. 첫 대조표가 이 task 아래에 있다.

── commit (`fix(app): match the app shell draft` 등, 코드 · `docs(design): DESIGN.md` 문서별로) ──

## 8. 문서 정리

- `docs/DIRECTORY.md`: 렌더러 새 구조(컴포넌트, `CanvasController`, 순수 함수 파일), `design/`.
- `.agents/skills/runtime-test/SKILL.md`: e2e 단계 목록과 읽는 방식(role · 접근 이름 · ARIA 상태), 새 스크린샷이 있으면 그 이름.
- `AGENTS.md` 'Commands': task 1에서 허락받은 명령 중 이후에도 쓰는 것(shadcn 컴포넌트 추가 등). 'Documents': "Documents to create later"에서 `docs/DESIGN.md`와 이미 있는 `docs/DIRECTORY.md`를 빼고, 표에 두 문서의 행을 둔다.
- 검증: 세 문서에 새 구조와 명령이 있고, "Documents to create later"에 DESIGN.md · DIRECTORY.md가 없다.

── commit (문서별로) ──

## 9. 승격과 정리

- PRODUCT.md(영문):
  - §5 기능 분할 표의 #5 다음 행에 `app-ui`를 번호 없이 더하고 완료 날짜를 적는다. Dogfooding 순서를 "app-ui부터"로 고치고, 교차 실험 관찰(task 7의 첫 대조표 요약, Codex가 초안을 읽은 방법)을 날짜와 함께 적는다.
  - §7 결정 로그: 기능 분할(app-ui, 번호 없음), 다크 단일, 오렌지 액센트, 시스템 sans 한 가지(모노 없음), 앱 문구 영어 · 화면 이름 Project(코드 이름은 folder), 초안 영어, V1 배치, 오른쪽 패널은 탭 없이 Canvas(#6 · #7 구성은 그때), Activity와 기록 규칙, React + shadcn/ui + Tailwind(사용자 결정), 창 닫기는 숨기기 · File 메뉴, 창 크기 · `hiddenInset`, Reopen · Close(CLI error 포함, Reading… 표시), 오류 칩 "Error", 표시 이름 규칙, 트리 키보드 · Tab 순서, e2e는 role · 접근 이름 · ARIA, 토큰 위치, CSP(task 1 결과), 레퍼런스(Sorcerer), Codex 구현 · `/design-sync` 교차. "plain DOM until #6" 두 행과 "`/design-sync` used from #6" 행을 대체한다는 것을 적는다.
  - §8에서 창 닫기와 "folder not found"를 묶은 bullet 하나를 닫는다.
- ARCHITECTURE.md(영문):
  - §3: `CanvasController` 위치, "목록에 없는 문서입니다"를 영어 문구로, Mutation proof에 task 6의 새 줄.
  - §7: 렌더러 스택, 창 수명주기(숨기기), 창 크기 · `hiddenInset`, 메뉴(File, 영어 문구), preload API(`reopenFolder`, 해제 함수), CSP.
- `docs/features/app-ui/` 삭제.
- 검증: 디렉터리가 없다. PRODUCT §5 · §7 · §8과 ARCHITECTURE §3 · §7에 위 항목이 날짜와 함께 있다. `grep -n '[가-힣]' docs/ARCHITECTURE.md docs/PRODUCT.md` 0건.

── commit (`docs(product)`, `docs(architecture)`, `docs(feature)` 문서별로) ──
