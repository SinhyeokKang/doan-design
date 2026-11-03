# project-remove-confirm — design

## 영향 받는 구성 요소

- **앱 renderer** (`app/src/renderer/`): `App.tsx`(제거 흐름, 워크스페이스 화면 이동, 알림 렌더링, 메뉴 명령), `homeRun.ts`(`remove`/`confirmRemove`), `homeConversations.ts`(`removalConfirm`), `toastState.ts`의 Undo 관련 주석.
- **앱 main** (`app/src/main/`): `index.ts`(`folders:remove`의 Undo 상태, `folders:restore`, `folders:forget-removal`, Undo Remove 메뉴 항목, `MenuCommand`, `MenuInputs.toast`), `menuState.ts`(`undoRemove`), `shell.ts`(`restore`), `folders.ts`(`insertAt`).
- **preload** (`app/src/preload/index.ts`): `restoreProjects`, `forgetRemoval`, `RestoreResult` import.
- **CLI·skill·형식**: 바뀌지 않는다. JSON Schema 원본, `runtime.json`, 앱 소켓 메시지, `.doan/config.json` 모두 그대로다.

## 1. 버그: 불러온 워크스페이스의 프로젝트가 빠질 때 Home으로 가기

### 원인

spec.md '문제 1'의 경로대로, 불러온 루트가 목록에서 빠질 때 App은 `loadedRoot`만 비우고(`App.tsx:453`) `screen`은 `"workspace"`로 둔다. 컨트롤러는 열린 캔버스를 `closed`로 닫아(`canvasView.ts:74`, `CanvasController.ts:403-414`) 빈 상태 메시지만 남는다. 페이지(Add Projects·Settings·Project Settings)에는 "출발점 프로젝트가 지워지면 Home" 규칙(`addPageReturn`)이 있지만, 워크스페이스 화면은 같은 판단을 하는 곳이 없었다. `onFolders`와 `removeNow`는 모두 기억(사이드바, 방문 기록, 대화)만 정리한다.

### 수정

- 판단을 순수 함수로 뺀다(`addProjectsNav.ts`, `addPageReturn` 옆):
  ```ts
  // The loaded workspace's root left the list (Remove from Doan); a reroot (Locate, Set Up) is not a removal.
  export function workspaceRemoved(screen: ShellScreen["screen"], loadedRoot: string | null, roots: readonly string[], locatingFrom: string | null): boolean
  ```
  `screen === "workspace"`, `loadedRoot !== null`, `loadedRoot !== locatingFrom`, `!roots.includes(loadedRoot)`일 때만 `true`.
- `App.tsx:453`의 effect가 이 함수로 판단하고, `true`이면 `setLoadedRoot(null)`과 함께 페이지 `leavePage`의 Home 분기와 같은 순서로 이동한다: `cancelRestore()` → `controller.current?.cancelWorkspaceOpen()` → `setScreen("home")`. `screen`이 workspace가 아니면 지금처럼 `setLoadedRoot(null)`만 한다(Home·페이지는 지금 규칙을 따른다).
- 재설정(reroot)은 지금처럼 `onFolders`의 `focus`가 `setLoadedRoot`를 새 루트로 바꾼 뒤라 이 조건에 걸리지 않는다. 워크스페이스 Locate는 `locating.from`으로 걸러진다(조건에 이미 있는 값과 같다).
- 이동은 `removeNow`가 아니라 목록 갱신에서 판단한다. 다른 경로로 루트가 빠져도(Locate가 다른 행과 합쳐지는 경우 등) 같은 규칙을 따르고, 제거 IPC 응답과 목록 이벤트의 도착 순서에 기대지 않는다.
- Home의 `select`는 정하지 않는다(PRODUCT의 페이지 규칙 "going Home"과 같다). Home으로 가면 지금 effect가 Home composer에 포커스를 둔다.
- `focus`가 있는 목록 이벤트에서도 이 판단이 같은 렌더에서 맞게 나오는지(`setLoadedRoot`가 먼저 반영된 뒤 effect가 도는지) App 테스트로 고정한다.

### 회귀 테스트(먼저 red)

- `App.settings.test.tsx`의 하네스(`folders()`, `listed()`, `homeEl()`, `ShellSidebar` props)를 쓰는 App 테스트를 추가한다. POSTMORTEM 2026-10-27 'Shell navigation shortcuts lost destination ownership and recovery access'의 예방 규칙("Test the App-connected predicate, not just an injected substitute")에 따라 순수 함수 테스트만으로 끝내지 않는다.
  1. `/w/a`에 캔버스 하나를 두고 사이드바로 그 캔버스를 연다 → `folders([listed("/w/c")])` → Home이 보이고 워크스페이스 `main`의 `visibility`가 `hidden`이다.
  2. `/w/a`의 Overview에서 같은 순서 → Home.
  3. `/w/a`를 연 채 `/w/b`만 지운다 → 워크스페이스 그대로.
  4. 워크스페이스 Locate 중(`locating.from === "/w/a"`) `/w/a`가 빠진다 → Home으로 가지 않는다. `focus {from: "/w/a", root: "/w/a2"}`가 있는 목록 → 새 루트의 워크스페이스에 남는다.
- 1·2가 수정 전 코드에서 red인지 `/tdd`에서 먼저 확인한다(코드 읽기로는 `screen`이 `"workspace"`로 남아 red가 예상된다).
- `workspaceRemoved` 단위 테스트: 위 네 경우 + `screen`이 `home`·페이지일 때 `false`.

## 2. 확인 알림

### 흐름

- 제거 확인은 지금 실행 중인 대화 확인이 있는 자리, `homeRun.remove`에서 한다. `removalConfirm`이 늘 알림을 돌려주도록 바꾼다(실행 중인 대화가 없을 때 `null` 대신 일반 확인 알림). 그러면 `homeRun.remove`는 언제나 `this.removing`을 채우고, `confirmRemove`가 (대화가 있으면 멈춘 뒤) `host.removeNow`를 부른다. 대화가 없으면 `conversations`가 빈 배열이라 멈출 것이 없다.
- 알림은 하나만 뜬다. 실행 중인 대화가 있으면 "Stop and Remove" 알림이, 없으면 아래 일반 알림이 뜬다(spec 완료 조건 7).
- `App.remove`(`App.tsx:979`)의 `cancelRestore()`·`rememberFocus()`는 그대로다. Cancel·Esc는 `run.cancelRemove()` + `modalClosed()`로 포커스를 되돌리는 지금 동작을 그대로 쓴다.
- `modal`은 이미 `homeRun.current.removing !== null`을 포함한다(`App.tsx:714`). 알림이 열려 있는 동안 메뉴 명령·페이지 이동이 막히는 것은 지금과 같다.
- 알림이 열린 동안 그 경로 중 하나라도 목록에서 빠지면(재설정 등) 알림을 닫는다. 알림이 더는 지울 대상을 맞게 말하지 못하고, main은 목록에 없는 경로가 섞인 요청을 `unavailable`로 거절하기 때문이다(`index.ts` `folders:remove`). Move to Trash 알림의 같은 규칙(`App.tsx:730-735`)을 따른다.
- 페이지 잠금: PRODUCT §5가 정한 대로 잠긴 페이지에서도 Remove from Doan은 동작한다. 알림도 그대로 뜨고, 확정 뒤 Project Settings 페이지는 `gone`으로 잠금을 지나 떠난다(지금 동작).

### 확인 알림 (문구·버튼·컴포넌트)

- **컴포넌트**: `App.tsx`에 이미 있는 `run.removing` 대화상자(`<dialog className="doan-dialog" data-ui-size="compact">`)를 그대로 쓴다. Move to Trash 알림(`CanvasTrashDialog.tsx`)과 같은 `doan-dialog` compact라 모양·측정값(DESIGN 'Trash dialog': 400px, 28px 모서리, 버튼 40px)이 같다. 새 컴포넌트는 만들지 않는다.
  - 접근성: `role="alertdialog"`, `aria-labelledby`(제목)·`aria-describedby`(본문)를 붙인다. 지금은 `aria-label`만 있다. POSTMORTEM 2026-10-30 'Removing a shared dialog class silently disabled two focus guards'의 예방 규칙("identify a dialog by its rendered role (`dialog[role="alertdialog"]`), not a styling class")에 맞춘다. 테스트도 `aria-label` 대신 role과 제목으로 찾는다.
- **문구** (영어 UI, `homeConversations.ts`의 `removalConfirm`이 만든다):
  - 제목: `Remove <label> from Doan?`
  - 본문, 워크트리 하나: `This removes it from Doan's project list only. Files and Git worktrees stay on disk.`
  - 본문, 워크트리 N개(N ≥ 2): `This removes its N worktrees from Doan's project list only. Files and Git worktrees stay on disk.`
  - 버튼: `Cancel`(subtle, 처음 포커스) / `Remove from Doan`(prominent). 확정 버튼은 메뉴 항목과 같은 이름을 쓴다(design preset `clarify`: "name the action in both the message and the button").
  - 실행 중인 대화가 있을 때(지금 알림 유지): 제목 `Stop the conversation and remove <label>?`, 본문 끝의 `Files stay on disk.`만 `Files and Git worktrees stay on disk.`로 바꾼다. 버튼 `Cancel` / `Stop and Remove`.
- **`<label>`**: 지금 `App.remove`가 넘기는 이름(카드 이름, 없으면 `names`)을 쓴다. 워크트리 하나만 지우는데 그 그룹에 다른 워크트리가 있으면(상태 줄의 Remove from Doan) `<name> (<branch>)`로 쓴다. 브랜치를 모르면 `<name>`만 쓴다. renderer에서 카드 행으로 만든다. renderer가 main 모듈을 값으로 import하면 빌드된 앱 창이 비는 문제가 있었기 때문이다(POSTMORTEM 2026-10-30 'A renderer import of a main module left the built app's window blank'). main의 `removalLabel`은 토스트와 함께 지운다(아래 '확정 뒤').
- **확정 버튼 스타일**: Doan에는 위험 버튼 변형이 없고 DESIGN의 기본 버튼은 중립 prominent(검은 채움)다. 같은 성격인 Move to Trash가 prominent를 쓰므로 그대로 따른다(spec '결정' 2).

### 확정 뒤

- 토스트를 띄우지 않는다(spec '결정' 1). 알림이 닫히고 목록에서 행이 빠지는 것, 불러온 프로젝트였다면 Home으로 가는 것이 결과다.
- Undo·토스트 경로 제거(spec '결정' 4):
  - renderer: `App.tsx`의 제거 토스트(`toast.show(`${result.label} removed…`)`) 전체, `menuCommand`의 `undo`·`"undoRemove"` 분기와 `live.current.toast.toast?.action === "Undo"` 확인, `setMenuState`의 `toast` 값. `homeRun.ts`·`homeConversations.ts`·`HomeComposerView.tsx`·`homeComposer.ts`의 "Undo" 언급 주석은 Undo가 없어지는 만큼 고친다. `toastState.ts`의 `ended`는 토스트 공용 기능(`Toast.tsx`)이라 남기고, "removal's undo window" 주석만 일반 문장으로 고친다.
  - main: `index.ts`의 `removal`·`removals`, `folders:restore`, `folders:forget-removal`, `RestoreResult`, `RemoveResult`의 `removalId`·`label`(`removed`는 결과 종류만 남는다), `removalLabel` import와 호출, 메뉴의 Undo Remove 분기(`enabled.undoRemove`), `MenuCommand`의 `"undoRemove"`, `MenuInputs.toast`. `menuState.ts`의 `undoRemove`와 `toastOpen` 인자. `shell.ts`의 `restore`와 `remove`가 돌려주던 `indexes`, `folders.ts`의 `insertAt`(다른 호출자가 없음을 grep으로 다시 확인한다), `removal.ts`와 `removal.test.ts`(호출자는 `folders:remove`뿐이다). `removal.test.ts`의 한 워크트리·브랜치·detached 사례 중 알림 label에 해당하는 것은 renderer `removalQuestionLabel` 테스트로 옮긴다.
  - preload: `restoreProjects`, `forgetRemoval`.
  - 테스트: `main/index.test.ts`의 restore·forget·`menu-command undoRemove` 사례, `main/menuState.test.ts`의 `undoRemove`, `main/shell.test.ts`의 restore 사례, `preload/index.test.ts`, `renderer/App.test.ts`의 `menuCommand("undoRemove")`, `App.settings.test.tsx:756-761`의 Undo 토스트 기대값(토스트가 불리지 않는다로 바꾼다).
  - POSTMORTEM 2026-10-25 'Undo of a removal stayed valid while the next removal was being saved'의 세대(generation) 규칙은 Undo ID와 함께 대상이 사라진다. 그 회고 항목은 기록이므로 고치지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `workspaceRemoved(screen, loadedRoot, roots, locatingFrom)` — `app/src/renderer/addProjectsNav.ts`.
- `removalConfirm(running, label, count)` — `app/src/renderer/homeConversations.ts`. 실행 중인 대화 유무와 워크트리 수에 따른 제목·본문·버튼을 돌려주고 `null`을 돌려주지 않는다.
- `removalQuestionLabel(card rows, paths, names)` — 알림의 `<label>`. `homeConversations.ts` 또는 `homeCards.ts`(카드 행을 아는 곳)에 둔다.
- `menuState`에서 `undoRemove`를 뺀 모양(기존 테스트 갱신).

## 형식 변경

없다. JSON Schema 원본과 Go·TS 공용 fixture는 바뀌지 않는다. IPC 채널 두 개(`folders:restore`, `folders:forget-removal`)를 지우고 `folders:remove` 응답에서 `removalId`와 `label`을 뺀다. 이는 앱 내부 main↔renderer 계약이라 형식 버전 `v`와 무관하다.

## 규약 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- "Removing a folder never touches files on disk"(ARCHITECTURE §13 'The app's folders')와 PRODUCT §3 Out of scope 6(Git 작업 없음)은 그대로 지킨다. 알림 문구가 이를 사람에게 알린다.
- PRODUCT §5 item 1의 "eight-second Undo toast; Undo restores positions, not the workspace or selection" 문장은 이 기능에서 바뀐다(결정됨, 마지막 작업에서 PRODUCT에 반영).
- ARCHITECTURE §7 'Home, workspace and project IPC'의 Removal·Menus·Toasts·Memory 항목에서 Undo 관련 문장이 없어진다.

## PoC 의존

없다. 기존 대화상자와 목록 이벤트만 쓴다.

## POSTMORTEM에서 가져온 함정

- 2026-10-27 'Shell navigation shortcuts lost destination ownership and recovery access': App에 연결된 판단을 App 테스트로 확인하고, 새 이동 경로에서 대기 중인 워크스페이스 열기를 취소한다(`cancelWorkspaceOpen`). 이 수정의 Home 이동도 취소를 먼저 한다.
- 2026-10-25 'Delayed startup restoration replaced newer navigation': 시작 복원이 늦게 와서 이동을 덮지 않도록 `cancelRestore()`를 부른다.
- 2026-11-03 'Locate on the Project Settings page closed the page instead of following the moved worktree': 루트가 목록에서 빠지는 것만으로 제거라고 판단하면 재설정을 제거로 오해한다. `focus`와 `locating.from`을 거른다(회귀 테스트 4).
- 2026-10-25 'Removing a project retained its remembered canvas': 제거된 루트의 기억 정리(`remember(root, null)`, `workspaceMemory`)는 그대로 둔다. Undo가 없어져도 다시 추가했을 때 옛 캔버스를 열지 않아야 한다.
- 2026-10-30 'Removing a shared dialog class silently disabled two focus guards': 알림을 role로 찾는다.
- 2026-10-30 'A renderer import of a main module left the built app's window blank': 알림 label을 main의 `removalLabel`에서 가져오지 않는다.

## 디자인 preset

`go run ./cli/cmd/doan design-skill clarify --json`을 읽었다. 확인 문구에 반영한 규칙: 대상과 결과를 말하고, 확정 버튼에 동작 이름을 쓴다. "되돌리기가 안전하면 확인보다 Undo를 쓰라"는 권고는 있지만 알림만 두기로 이미 결정됐으므로 따르지 않는다.
