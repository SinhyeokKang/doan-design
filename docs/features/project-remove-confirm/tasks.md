# project-remove-confirm — tasks

순서: 버그 회귀 테스트(red) → 수정 → 확인 알림 순수 함수 → 알림 연결 → Undo 경로 제거 → 실제 앱 확인 → postmortem → 문서 승격. 한 번의 `/ship`으로 진행한다. UI는 기존 대화상자에 문구만 넣으므로 `/design-draft`는 생략한다(spec '결정' 5).

## A. 버그: 불러온 워크스페이스의 프로젝트 제거 → Home

- [ ] A1. 회귀 테스트를 먼저 쓴다(`/tdd`). `App.settings.test.tsx` 하네스로 design §1 '회귀 테스트'의 네 경우, `addProjectsNav.test.ts`에 `workspaceRemoved` 단위 테스트.
  - 검증: `npm --prefix app test` — 캔버스·Overview 두 경우와 `workspaceRemoved`가 red, 다른 프로젝트 제거·Locate·reroot 경우는 green(지금 동작을 고정).
- [ ] A2. `workspaceRemoved`를 구현하고 `App.tsx:453` effect에서 Home으로 이동한다(`cancelRestore` → `cancelWorkspaceOpen` → `setScreen("home")`).
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

── commit: `fix(app): go Home when the loaded workspace's project is removed` ──

## B. 확인 알림

- [ ] B1. `removalConfirm`이 늘 알림을 돌려주게 바꾸고 `<label>`·워크트리 수 문구를 테스트로 고정한다(design §2 '확인 알림'). 실행 중인 대화가 있을 때의 본문 끝도 `Files and Git worktrees stay on disk.`로 바꾼다.
  - 검증: `npm --prefix app test` — 새·바뀐 `homeConversations` 테스트가 먼저 red, 구현 뒤 green.
- [ ] B2. `homeRun.remove`가 늘 `removing`을 채우게 하고, `App.tsx`의 `run.removing` 대화상자에 `role="alertdialog"`·`aria-labelledby`·`aria-describedby`를 붙인다. 열린 동안 경로가 목록에서 빠지면 닫는다. 확정 뒤 토스트를 띄우지 않는다.
  - 검증: `npm --prefix app test` — App 테스트: 세 입구(사이드바 메뉴, 상태 줄, Project Settings)에서 알림이 뜨고 확정 전에는 `removeProjects`가 불리지 않는다. Cancel·Esc 뒤 포커스가 원래 자리로 간다. 실행 중인 대화가 있으면 알림이 하나만 뜬다. 확정 뒤 `toast.show`가 불리지 않는다. `App.settings.test.tsx:756-761`의 Undo 토스트 기대값을 이 기대로 바꾼다.

── commit: `feat(app): confirm Remove from Doan before removing` ──

## C. Undo 경로 제거

- [ ] C1. design §2 '확정 뒤'의 목록대로 renderer·main·preload의 Undo·제거 토스트 코드와 그 테스트를 지운다(`removal.ts`·`removal.test.ts` 포함, 알림 label에 맞는 사례는 B1 테스트로 옮긴다). 지우기 전에 `rg -n 'restoreProjects|forgetRemoval|undoRemove|folders:restore|folders:forget-removal|removalId|removalLabel|insertAt|\.restore\(' app/src`로 호출자를 다시 확인하고, 지운 뒤 같은 검색에 남는 것이 없음을 확인한다.
  - 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app test` green, 위 `rg` 결과 0건(`window.restore()` 등 무관한 줄 제외).

── commit: `refactor(app): remove the removal Undo path and toast` ──

## D. 확인

- [ ] D1. `/runtime-test`: 격리된 실제 앱에서 (1) 캔버스를 연 채 사이드바 메뉴로 그 프로젝트를 지우면 알림 → Remove from Doan → Home, 토스트 없음, (2) 알림 Cancel·Esc는 아무것도 지우지 않음, (3) 상태 줄과 Project Settings 페이지에서도 알림이 뜸, (4) 확정 뒤 Edit 메뉴가 일반 Undo이고 ⌘Z가 프로젝트를 되살리지 않음. 알림 스크린샷을 남긴다.
  - 검증: `/runtime-test` 보고서의 각 단계 통과와 스크린샷 경로.
- [ ] D2. `/code-review` → 필요하면 `/refactor`.
  - 검증: `/code-review` 보고서의 🔴·🟡 항목이 처리됐다.
- [ ] D3. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 종료 코드 0.

## E. 회고와 문서 승격

- [ ] E1. `/postmortem`: "Removing the loaded workspace's project left an empty workspace instead of going Home". 원인(워크스페이스 화면에 페이지의 `addPageReturn` 같은 규칙이 없고 `App.tsx:453`이 `loadedRoot`만 비움), 놓친 이유(제거 테스트가 페이지와 Home에서만 이동을 확인함), 예방(루트를 목록에서 빼는 경로를 추가할 때 화면별 도착지를 App 테스트로 확인; 검색 `rg -n 'setLoadedRoot\(null\)|addPageReturn|workspaceRemoved' app/src/renderer`).
  - 검증: `docs/POSTMORTEM.md` 맨 위(최신 날짜)에 항목이 있고 기존 항목 내용은 바뀌지 않았다.

── commit: `docs(postmortem): removing the loaded project left an empty workspace` ──

- [ ] E2. `docs/PRODUCT.md` §5 item 1: Remove from Doan 문장을 "확인 알림(Cancel/Remove from Doan, 목록에서만 빠지고 파일·Git 워크트리는 남음) 뒤 제거하고 토스트는 없다(no toast)"로 고치고 Undo 토스트 문장을 지운다. 불러온 워크스페이스의 프로젝트가 빠지면 Home으로 간다는 규칙을 'Projects' 항목(사이드바·워크스페이스 문단)에 적는다. 실행 중인 대화가 있으면 "Stop and Remove" 알림 하나만 뜬다는 것도 적는다.
  - 검증: `rg -n -i 'undo|eight-second' docs/PRODUCT.md`에 제거 Undo·토스트 언급이 없다.

── commit: `docs(product): confirm Remove from Doan and go Home when the loaded project is removed` ──

- [ ] E3. `docs/ARCHITECTURE.md` §7 'Home, workspace and project IPC': Memory의 "or Undo", Removal 항목(Undo ID·세대·`folders:forget-removal`), Menus의 Undo Remove 문장, Toasts의 "removal opportunity" 문장을 현재 상태로 고친다.
  - 검증: `rg -n 'Undo Remove|forget-removal|removal ID|removal opportunity' docs/ARCHITECTURE.md` 0건.

── commit: `docs(architecture): drop the removal Undo path` ──

- [ ] E4. `docs/DESIGN.md`: 'Removal toast' 행과 두 'Removal toast label' 항목을 지우고(참조 frame 목록의 `removal-toast`도 뺀다), 'Toast without a type'의 undo 토스트, 'Unpinned'의 Undo, Project Settings 'Origin'의 "with an Undo toast"를 현재 상태로 고친다. 제거 알림 행은 Trash dialog와 같은 측정값이라고 적는다(측정하지 않았으면 그렇게 적는다).
  - 검증: `rg -n -i 'undo|removal toast|removal-toast' docs/DESIGN.md`에 제거 Undo·토스트 언급이 없다.

── commit: `docs(design): removal confirmation replaces the removal toast` ──

- [ ] E5. `docs/features/project-remove-confirm/`를 지운다.
  - 검증: `ls docs/features/`에 `project-remove-confirm`이 없다.

── commit: `docs(feature): remove project-remove-confirm after promotion` ──
