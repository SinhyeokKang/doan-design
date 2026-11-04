# terminal-work-worktrees — design

spec 결정 1~7을 main(소켓 v3 처리, 폴더 목록)과 renderer(보드 안내, 사이드바, 이동)로 나눈다. CLI와 guide는 바뀌지 않는다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main socket | `app/src/main/runtime.ts` (`answerLine` v3, `RuntimeState`) | 등록되지 않은 root의 `start`를 바로 거절하지 않고 자동 등록을 시도한 뒤 판단한다. `RuntimeState`에 비동기 등록 멤버가 생긴다 |
| app main 연결 | `app/src/main/index.ts` | `RuntimeState` 연결, `isOpen`, 자동 제거를 `folders:remove`와 같은 정리 경로(selection, thumbnail)로 보낸다 |
| app main 폴더 | `app/src/main/shell.ts`, `folderStore.ts`, `cli.ts`(`readFolder`) | 자동 등록(`adopt`), 자동 표시 저장, 사라진 자동 등록분 제거, 목록이 아닌 자동 등록분 숨김, 직접 추가 시 자동 표시 해제, `readFolder`의 errno |
| app main 순수 규칙 | 새 모듈(이름은 `/tdd`에서) | 다른 worktree 판단, 자동 표시 정리 판단 |
| renderer | `agentIndicator.ts`, `CanvasAgent.tsx`, `conversationList.ts`(`withTerminalSlots`), `homeCards.ts`(`groupProjects`), `App.tsx` | 같은 group 다른 worktree의 같은 경로 작업 → 안내 + Open, 자동 등록분 숨김, 사라진 W에서의 이동 |
| eval fake app | 없음 | W3b는 등록된 root에서 돌고, H7은 `doan active`를 써서 이번 변경의 영향이 없다(§5) |
| CLI·guide·형식 | 없음 | `doan work` 요청·응답, app-socket v3 모양, CLI 출력, guide는 그대로다 |

## 2. main

### 2.1 v3 `start`의 자동 등록

지금 순서는 schema → token → 등록된 root → `start` 경로 패턴이다(ARCHITECTURE §4 'Terminal work over app-socket v3' 'Dispatch'). 바뀌는 것은 "등록된 root" 단계뿐이다.

1. root가 등록돼 있으면 지금과 같다.
2. 등록되지 않았고 `action === "start"`이며 경로 패턴이 맞으면, main이 `doan ls --json --repo <root>`를 실행한다(읽기는 항상 CLI, ARCHITECTURE §13 'The app's folders'). 다음을 모두 만족할 때만 자동 등록한다.
   - 결과가 `kind: "list"`다.
   - `result.root`가 요청의 root와 문자열로 같다. 앱은 요청이 CLI의 `workTarget`을 거쳤는지 알 수 없다. token을 가진 프로세스는 아무 절대 경로나 보낼 수 있으므로, symlink 별칭이나 하위 폴더가 정규화되지 않은 root로 저장되지 않게 main이 직접 확인한다. socket은 root를 문자열로 비교하고, 앱은 root를 다시 계산하지 않는다(`runtime.ts`, POSTMORTEM 2026-10-22 'Guessing the repo root in TS…').
   - 등록된 root 중 하나가 `result.git.worktrees`에 있다. `git.worktrees`는 같은 doan root가 저장소의 각 worktree에서 놓이는 경로 목록이므로(`cli/internal/repo/git.go`), 이 조건 하나로 "같은 저장소, 같은 상대 경로, 다른 worktree"가 정해진다. 같은 checkout의 다른 doan root는 목록에 등록된 root가 없어 거절된다(spec 결정 1). 메모리에만 있는 `Folder.common`에 기대지 않으므로 앱 시작 직후에도 판단할 수 있다. worktree가 200개를 넘으면 목록이 잘리는데(`gitWorktreeLimit`), 이때 거절될 수 있는 것은 받아들인다.
3. `ls`가 끝난 뒤, 위 비교를 **그 시점의 등록 목록**으로 다시 한다. `ls` 도중 Remove from Doan이 끝났으면 W를 혼자인 새 프로젝트로 등록하지 않는다.
4. 등록은 shell의 `adopt(root, view)` 하나로 한다. 목록 추가, 자동 표시, `folder.common` 채우기를 메모리에서 한꺼번에 하고, 그 `ls` 결과로 W를 바로 `list` 항목으로 알린다. 그래서 W가 `loading` 상태로 별도 프로젝트 카드가 되는 순간이 없다(`groupProjects`는 `lastCommon`이 없으면 경로로 묶는다, `homeCards.ts:20`). 그 뒤 `workState.roots`에 W를 넣고 나서 work를 적용한다(`applyWork`는 `state.roots`에 없는 root를 버린다).
5. 등록에 성공하면 `{v:3, ok:true}`, 아니면 `project_not_open`이다. `done`은 등록하지 않는다.
6. token 확인 뒤에만 `ls`를 실행하므로, token이 없는 요청은 프로세스를 띄우지 못한다. 등록된 root가 하나도 없으면 `ls`를 실행하지 않는다. 같은 root에 대한 동시 `start`는 진행 중인 등록 하나를 함께 기다린다.
7. **기한**: CLI의 2초(`activeTimeout`, `cli/internal/cli/active.go:17`)는 dial 전에 시작하고, 앱의 `LINE_WAIT_MS`는 연결 때 시작한다(`runtime.ts`). main은 `ls`와 1.5초 타이머를 경쟁시키고, 타이머가 먼저 끝나면 `project_not_open`으로 답한다. `ls` 프로세스는 죽이지 않는다(`runLs`의 `timeoutMs`를 쓰지 않음). 등록은 끝까지 진행하고, 성공하면 그 `start`의 work도 적용한다(spec 결정 5). 등록이 진행 중인 root에 온 `done`은 등록이 끝난 뒤 적용한다. 그래야 늦은 `start`가 5분 동안 남는 스피너를 만들지 않는다.

`RuntimeState.work`는 지금 동기 함수다. 자동 등록용 비동기 멤버를 더하고, `answerLine`은 등록되지 않은 `start`에서만 그것을 기다린다.

**왜 `doan ls`인가**: 앱은 Git 메타데이터를 직접 읽지 않는다(ARCHITECTURE §13 'Read-only Git metadata'). `git.worktrees`와 `git.common`은 이미 `ls`가 주는 값이고(ARCHITECTURE §12 `ls` 응답의 `git`), group도 이 값으로 묶인다(PRODUCT §5 item 1).

### 2.2 자동 표시 저장

- `folders.json`은 `string[]` 그대로 둔다. 모양을 바꾸면 이전 버전 앱이 목록을 읽지 못해 빈 목록으로 시작한다(`readFoldersFileForPruning`이 string 배열이 아니면 null).
- 자동 등록한 root는 `<userData>/auto-folders.json`(`string[]`, temp file + rename)에 따로 적는다. 이 파일을 모르는 이전 버전 앱은 자동 등록분을 직접 추가한 worktree처럼 다룬다. 이는 받아들인다.
- 쓰기 순서: 추가할 때는 `auto-folders.json`, 그다음 `folders.json`이다. 중간에 멈추면 `folders.json`에 없는 자동 표시만 남고, 이는 무시된다. 반대 순서면 표시 없는 W가 영구히 직접 추가분이 된다.
- 쓰기는 기존 폴더 쓰기와 같은 직렬화를 따른다. 먼저 시작한 쓰기가 나중에 끝나도 이기지 않는다(POSTMORTEM 2026-10-25 'Undo of a removal…'의 세대 규칙).
- `folders.json`에 없는 자동 표시는 무시하고 다음 쓰기 때 뺀다. 이 정리는 `folders.json`을 제대로 읽었을 때만 한다(`readFoldersFileForPruning`이 null이 아님, POSTMORTEM 2026-10-26). `auto-folders.json`이 손상되면 "자동 표시 없음"으로 읽는다. 아무것도 지우지 않으므로 안전하다.
- 직접 추가하면 자동 표시를 지운다. Add Projects, Open Project, 온보딩의 `ProjectAdder`는 이미 등록된 root에 `duplicate`나 `existing`을 돌려주므로(`addFlow.ts`, `addProjects.ts`, `shell.ts` `store`·`open`), 그 결과에서도 자동 표시를 지운다. Locate·Set Up의 re-root로 생긴 새 경로는 직접 추가분이고, 자동 표시를 옮기지 않는다.
- Remove from Doan은 지금처럼 group의 root를 모두 지운다. 그 root들의 자동 표시는 `folders.json`에 없으므로 다음 쓰기 때 빠진다. 별도의 해제 함수는 두지 않는다.

### 2.3 사라진 자동 등록분과 목록이 아닌 자동 등록분

- 사라진 폴더는 이미 `readFolder`(`app/src/main/cli.ts`)가 `stat` 실패로 `notFound`를 돌려준다. 지금은 `EACCES`도 같은 `notFound`가 된다. `readFolder`가 errno를 함께 돌려주게 하고, `ENOENT`·`ENOTDIR`만 "사라짐"으로 본다. 별도의 `lstat` 확인은 두지 않는다.
- 자동 등록 root가 사라지면 shell은 `notFound` 항목을 알리지 않고, 같은 단계에서 목록에서 뺀다. watcher가 먼저 `notFound`를 알리는 경로(POSTMORTEM 2026-10-27)도 같은 규칙을 따라, 자동 등록분의 Missing 상태 줄은 한 번도 보이지 않는다.
- 제거는 `index.ts`의 `folders:remove`와 같은 정리 경로를 거친다. selection(`doan active`가 알리는 값) 정리, `thumbs.removed`, 그 root의 work 항목 제거(`retainWorkRoots`)가 함께 일어난다(POSTMORTEM 2026-10-25 'Locating a project kept the old root's selection').
- 경로가 남아 있는 실패(권한 오류, CLI 오류, `uninitialized`)는 지우지 않는다. 자동 등록분이 `list`가 아니면 renderer가 목록에서 숨긴다(§3.3). 직접 추가분은 지금처럼 문제 상태를 따른다.

### 2.4 화면을 옮기지 않음

자동 등록과 자동 제거는 `onChange(entries)`로 목록만 알리고, re-root 신호인 `FolderFocus`는 보내지 않는다(`shell.ts`, POSTMORTEM 2026-11-03 'Locate on the Project Settings page…'). 선택된 worktree, 열린 캔버스, Back/Forward, 기억한 선택은 main이 바꾸지 않는다(spec 결정 3). 재진입 때 worktree를 고르는 규칙은 work 상태를 쓰지 않는다(ARCHITECTURE §4 'Terminal work over app-socket v3' 'State': "never used to pick a worktree on re-entry"). 보던 W가 사라질 때의 이동은 renderer가 한다(§3.4).

## 3. renderer

### 3.1 다른 worktree 작업 안내

- 순수 함수 `siblingWork(work, target, entries)`: 열린 캔버스(root R, path P)와 같은 group에 속한 다른 root R'에서 P에 대한 WorkItem이 있으면 `{ root: R', label }`을 돌려준다. group 판단은 `groupProjects`의 묶음을 그대로 써서 사이드바와 어긋나지 않게 한다. R'의 항목이 `list`일 때만 대상이다. label은 R'의 branch, 없으면(detached 등) 폴더 이름이다.
- 여러 개면 `work` 배열에서 가장 뒤의 항목 하나다. `WorkItem`에는 시각이 없고(`app/src/main/workState.ts`), `workItems`는 세션을 들어온 순서대로 펼친다. IPC는 바꾸지 않는다. 프로젝트 행의 slot은 행의 mtime으로 캔버스를 고르므로(`withTerminalSlots`), 안내와 slot이 다른 worktree를 가리킬 수 있다. 이 차이는 받아들인다.
- R 자신의 작업(지금의 terminal 변형)이나 R의 앱 대화가 있으면 그쪽이 이긴다. 안내는 R에 아무 작업도 없을 때만 보인다.
- 이번 안내는 터미널 작업만 다룬다. 이름은 나중에 앱 대화를 더해도 바꾸지 않도록 "다른 worktree의 이 경로 작업"으로 짓는다(예: `siblingWork`, `SiblingWorkNotice`).
- 보드에는 glow·dot field를 띄우지 않고 안내 줄만 띄운다. 위치는 지금의 agent notice 자리(board 위 가운데 column)이고, 모양과 문구는 `/design-draft`에서 정한다. 보이는 문구는 `Agent is working in <label>` + Open이다. "Agent is working"으로 시작해 기존 안내와 맞춘다. `…on this canvas in <label>`은 420px column에서 label에 약 85px만 남겨 짧은 branch도 잘리므로 줄였다(사용자 결정, `/design-draft`). 텍스트의 tooltip은 `Agent is working on this canvas in <label>` 전체 문장이다. 긴 label은 줄임표로 자르고, 전체 label은 버튼 accessible name과 tooltip에 둔다. 드래프트: `.doan/canvases/terminal-work-worktrees.html`(canvas id `terminal-work-worktrees`, frame `sibling-notice`). 사용자가 앱에서 확인해 보드 안내(frame `sibling-notice`)로 확정했다. 비교한 toast 대안은 타이머로 사라지고 다른 toast와 자리를 다투며 캔버스와 묶이지 않아 버렸다. 버튼의 accessible name은 `Open this canvas in <label>`이다(기존 Open "Open the request"와 구별). `clarify` preset으로 확인한다.
- 안내는 나타날 때 focus를 가져가지 않는다. Open은 Hand, Space, pick 중에도 누를 수 있고(기존 Stop·Open과 같음), pick 중에 누르면 pick을 취소한다. `done`이나 만료로 안내가 사라질 때 Open에 focus가 있었으면 focus는 캔버스 영역으로 간다.
- Open: 터미널 slot이 이미 쓰는 경로(`openNotice` → `openShellCanvas(R', row)`, `App.tsx`)로 R'의 P를 연다. loaded-root effect가 R'를 선택된 worktree로 만든다. project menu의 worktree 선택 경로는 쓰지 않는다. 그 경로는 R'의 마지막 캔버스나 Overview를 먼저 복원해 이동이 두 번 생긴다. 기록에는 캔버스 방문 하나가 남아 Back으로 (R, P)로 돌아가고, R'가 아직 작업 중이면 안내가 다시 보인다. R'가 사라진 뒤의 Back은 지금의 사라진 대상 건너뛰기를 따른다. Open이 R'의 제거와 겹치면 지금의 `unavailableCanvasMessage` 토스트만 보인다.

### 3.2 사이드바

- 프로젝트 행의 터미널 작업 slot은 지금 규칙(PRODUCT §5 item 1: 캔버스 행이 화면에 없으면 프로젝트 행)을 그대로 따른다. W가 선택된 worktree가 아니면 W의 캔버스 행이 없으므로 프로젝트 행에 뜬다.
- slot을 누르면 지금 코드에서도 W가 선택된다. `toggleProject` → `openNotice` → `openShellCanvas` → `completeNavigation(W)`로 열리고, reconcile effect가 `selectedRoot = loadedRoot`로 맞춘다(`App.tsx`). 이 동작을 테스트로 고정한다.
- W에 아직 목록에 없는 경로는 slot이 없다(`withTerminalSlots`는 목록에 없는 행을 건너뛴다, ARCHITECTURE §4 'State': "a path not yet listed waits"). W가 그 경로를 목록에 올리면 slot이 뜬다.
- W는 worktree 목록(project menu, branch chip, composer tray)의 맨 끝에 붙는다(`folders.json` 순서).

### 3.3 목록이 아닌 자동 등록분 숨김

- renderer는 자동 등록분 표시(main이 entries에 싣는 플래그, 이름은 `/tdd`에서)를 받는다. 자동 등록분이 `list`가 아니면 group의 worktree 목록, 사이드바 문제 행, Home 카드에서 숨긴다. 그래서 W 때문에 group 전체의 Remove from Doan을 마주치지 않는다.
- W가 group의 유일한 `list`가 아닌 root로 남는 경우는 없다. 자동 등록은 등록된 root가 있는 group에만 일어나기 때문이다. 그 root가 Remove from Doan으로 빠지면 W도 함께 빠진다.

### 3.4 보던 W가 사라지거나 숨겨질 때의 이동

- 순수 함수(이름은 `/tdd`에서)가 도착지를 정한다. 입력은 group, 사라진 W, 기억한 직전 선택, 열린 경로다. 순서는 다음과 같다.
  1. W로 오기 전에 선택돼 있던 같은 group의 worktree. renderer가 group의 선택이 자동 등록 root로 바뀔 때 직전 선택을 메모리에 기억한다.
  2. 기억이 없으면(재시작 뒤 등) group의 main checkout(`git.main`과 같은 root).
  3. 그것도 없으면 group의 첫 `list` root.
  - 도착 root의 목록에 같은 경로가 있으면 그 캔버스를, 없으면 그 root의 Overview를 연다. 토스트는 없다.
- Overview, Project Settings에서 W를 보고 있었을 때도 같은 root의 같은 화면(Overview, Project Settings)으로 간다. "목록에서 빠진 worktree는 그 page를 떠난다"(PRODUCT §5 item 1)는 그대로다.
- W의 기억한 캔버스와 선택은 지운다(POSTMORTEM 2026-10-25 'Removing a project retained its remembered canvas'). Back 기록의 W 방문은 지금의 사라진 대상 건너뛰기를 따른다.
- 이 이동은 기존 `onFolders` 정리와 loaded-root effect 위에 둔다. group 전체가 사라지는 Remove from Doan(Home으로 감, POSTMORTEM 2026-11-03)과는 다른 분기다.

### 3.5 아무것도 보이지 않는 상태

- 사람이 R의 Overview에 있으면 보드 안내가 없다. 프로젝트 행 스피너가 대신하고, 사이드바가 숨겨져 있으면 Show sidebar의 작업 표시가 대신한다(`sidebarSize.ts`, 터미널 slot도 `slots`에 들어감).
- P가 W의 목록에 아직 없으면 스피너도 안내도 없다. W가 worktree 목록 끝에 조용히 생길 뿐이다.
- R의 page가 목록에 없거나 R이 문제 상태면 안내가 없다(`workingCanvas`가 null).

### 3.6 picking 안내 위치

- picking 안내를 `CanvasAgent`의 children(상단 column)에서 빼서 `.doan-canvas-bottom`의 Canvas tools 앞에 둔다. column의 기존 gap 8px로 tools 위에 붙는다(`App.tsx`). 상단 column에는 에이전트 안내와 canvas notice(`state.error`, `state.unlisted`)만 남는다.
- `.doan-canvas-bottom`은 `left: 50%`에서 가운데로 옮겨지므로, 너비를 정하지 않으면 보드 오른쪽 절반으로 줄어 안내가 눌린다. `width: max-content`, `max-width: calc(100% - 2 * var(--space-3))`(상단 column과 같은 좌우 여백)를 준다. 좁은 보드에서는 안내 문구가 줄임표로 잘린다.
- 안내의 모양, 문구, Esc, 숨은 "Press Escape to cancel", `role="status"`는 그대로다. 다른 worktree 안내의 Open은 pick 중에도 누를 수 있고 pick을 취소한다(§3.1).
- 이유: pick은 사람이 켠 모드라 모드를 바꾸는 tools 옆이 맞다. 상단에 쌓이면 에이전트 안내가 오갈 때마다 안내가 위아래로 움직이고 column이 88px까지 커진다.
- 드래프트 frame `picking-hint`. DESIGN.md 'Picking hint'의 "under the agent notice when both show"와 'Terminal agent activity' 표의 "40 high under the terminal notice" 줄은 T4에서 새 위치로 고쳐 쓴다.

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| `autoRegisterRoot(view, request, registered)` | 새 main 모듈 | 등록된 root가 `git.worktrees`에 있음 → 등록; 같은 checkout의 다른 doan root → 거절; 다른 저장소·`git` 없음·`list`가 아님 → 거절; `result.root` ≠ 요청 root(symlink 별칭, 하위 폴더) → 거절; 이미 등록됨 |
| `pruneAuto(list, auto, missing)` | 같은 모듈 | 사라진 자동 등록분만 빠짐, 직접 추가분은 남음, `EACCES`는 사라짐이 아님, `ENOTDIR`은 사라짐 |
| `autoAfterAdd(auto, root)` | 같은 모듈 | 직접 추가(`duplicate`, `existing` 포함) 시 자동 표시 해제, `folders.json`에 없는 표시 정리 |
| `siblingWork(work, target, entries)` | `agentIndicator.ts` | 같은 group 다른 root 같은 path → 안내, 다른 group·다른 path → 없음, 자기 root 작업·앱 대화가 이김, branch 없음 → 폴더 이름, 여러 개 → `work`의 마지막, R'가 `list`가 아님 → 없음 |
| W 소멸 도착지 | renderer 새 함수 | 직전 선택 → main checkout → 첫 `list` root, 같은 경로가 있으면 캔버스·없으면 Overview |
| `answerLine` v3 분기 | `runtime.ts` | 등록 시도 경로, `done`은 등록 안 함, token 실패 시 `ls` 실행 안 함, 등록된 root가 없으면 `ls` 안 함, 기한 초과 뒤 늦은 적용, 진행 중 등록에 온 `done`, 동시 `start` 합치기, `ls` 도중 Remove |

## 5. 형식·conventions·결정 영향

- JSON Schema, app-socket v3 요청·응답 모양, CLI 출력, guide는 바뀌지 않는다. 새 파일 `<userData>/auto-folders.json`은 앱 내부 저장이다(ARCHITECTURE §7, §11 기기 로컬 파일 목록에 적는다).
- ARCHITECTURE §1 'Conventions'와 `doan check`는 바뀌지 않는다.
- eval: W3b는 worktree를 쓰지 않고 등록된 root에서 돌아 `delivered:true` 그대로다. 유일한 worktree 시나리오 H7은 `doan active`의 `project_not_open`을 쓰고, 자동 등록은 `work start`에서만 일어나므로 영향이 없다. fake app(`eval/lib/socket.ts`)은 바꾸지 않는다. AGENTS.md 'Workflow'에 따라 feature의 마지막 통합 전에 `/agent-eval`을 돌린다.
- 바뀌는 결정은 spec '바뀌는 PRODUCT·ARCHITECTURE 결정'에 모았다.
- **No git operations**(PRODUCT §3 Out of scope 6): Doan은 git 명령을 실행하지 않는다. `git.worktrees`와 `git.common`은 Go `ls`의 기존 읽기다.
- **표시 identity root + path**(POSTMORTEM 2026-11-01): 그대로다. 다른 worktree의 작업은 그 캔버스의 작업 표시가 아니라 별도 안내로만 보인다.

## 6. PoC 의존

없다. `ls`의 `git.worktrees`·`git.common`, group 묶기, 터미널 slot의 off-screen 규칙은 이미 동작한다. 리뷰에서 새 worktree에 대한 `doan ls --json`이 약 20ms에 같은 `git.common`을 돌려주는 것을 확인했다(이 저장소 24개 캔버스는 70–90ms). 부하가 큰 기기에서는 기한을 넘길 수 있고, 그때는 늦은 적용(§2.1-7)이 받는다. 실제 앱 확인은 구현 뒤 `/runtime-test`에서 Orca가 아닌 일반 `git worktree add`로 만든 worktree로 한다(같은 Git 동작).

## 7. POSTMORTEM에서 가져온 함정

- **2026-11-01 'The canvas agent indicator kept another worktree's conversation'**: worktree는 캔버스 id와 경로를 공유한다. 안내는 root가 다른 작업을 이 캔버스의 작업으로 그리지 않는다.
- **2026-11-03 'Removing the loaded workspace's project left an empty workspace'**, **2026-10-25 'Removing a project retained its remembered canvas'**: 자동 제거도 보고 있던 화면과 기억한 선택을 정리하고, 화면별 도착지를 App 테스트로 고정한다.
- **2026-10-25 'Locating a project kept the old root's selection'**: root를 지우는 모든 경로는 그 root로 저장된 상태(selection, thumbnail, work)를 지운다.
- **2026-11-03 'Locate on the Project Settings page…'**: 목록을 바꾸는 새 경로(자동 등록, 자동 제거)는 `FolderFocus`를 보내지 않고 목록만 보낸다는 것을 main 테스트로 고정한다.
- **2026-10-27 'Observing a deleted folder navigated into it'**: 자동 등록분은 watcher 경로에서도 `notFound`를 알리지 않는다. probe는 폴더를 지운 뒤 목록 변화를 기다리고 나서 이동하는 reader를 쓴다.
- **2026-10-26 'A failed saved-folder read erased review markers'**: 자동 표시 정리는 `folders.json`을 제대로 읽었을 때만 한다.
- **2026-10-25 'Undo of a removal stayed valid while the next removal was being saved'**: 두 파일 쓰기와 `ls` 도중의 Remove는 세대 확인으로 늦은 결과가 이기지 못하게 한다.
- **2026-10-22 'Guessing the repo root in TS after a failed CLI run…'**: 앱은 root를 다시 계산하지 않는다. 요청 root와 `ls`의 `result.root`가 같을 때만 등록한다.

## 8. 읽은 design preset

없음(UI 문구와 모양은 `/design-draft`에서 `clarify`, `harden`을 읽는다).
