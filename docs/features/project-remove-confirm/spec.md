# project-remove-confirm — spec

작은 두 항목을 한 번의 `/ship`으로 처리한다.

1. **버그**: 열려 있는 워크스페이스(캔버스·Overview)의 프로젝트를 Remove from Doan으로 지우면 앱이 Doan Home으로 가지 않고, 프로젝트가 없는 빈 워크스페이스에 남는다.
2. **확인 알림**: Remove from Doan이 바로 지우고 8초 Undo 토스트를 띄우던 방식을, 지우기 전에 확인 알림을 띄우는 방식으로 바꾼다. 확정 뒤에는 토스트를 띄우지 않는다(결정됨: 알림만 둔다).

## 사용자

- **사람(앱 사용자)**: 사이드바 프로젝트 메뉴, 워크스페이스 상태 줄, Project Settings 페이지에서 Remove from Doan을 누른다. 확인 알림에서 "목록에서만 빠지고 파일과 Git 워크트리는 그대로"라는 것을 읽고 확정하거나 취소한다. 지운 프로젝트를 보고 있었다면 Home으로 간다.
- **에이전트**: 해당 없음. CLI·skill·`doan active` 응답 형식은 바뀌지 않는다. 제거 뒤 `doan active`가 지운 프로젝트의 선택을 돌려주지 않는 것은 지금과 같다(main이 `selection`을 비운다, `app/src/main/index.ts` `folders:remove`).

## 문제 (관찰된 사실, 코드 읽기 근거)

### 1. 열린 워크스페이스의 프로젝트를 지워도 Home으로 가지 않는다

앱을 실행해 재현하지는 않았다. 아래는 코드 경로를 읽어 확인한 내용이고, `/tdd`에서 App 테스트로 red를 먼저 확인한다.

- 제거는 `App.remove` → `homeRun.remove` → `App.removeNow`(`app/src/renderer/App.tsx:979-1001`)로 간다. `removeNow`는 사이드바 프로젝트 기억·펼침·방문 기록·대화 기억을 지우고 Undo 토스트를 띄울 뿐, 화면(`screen`)은 건드리지 않는다.
- 폴더 목록 이벤트(`onFolders`, `App.tsx:369-389`)도 지운 루트를 기억에서 빼기만 하고 화면을 바꾸지 않는다.
- 불러온 루트가 목록에서 빠지면 `App.tsx:453`의 effect가 `setLoadedRoot(null)`만 하고 `screen`은 `"workspace"`로 남는다.
- 같은 목록 갱신에서 `CanvasController.applyEntries`(`app/src/renderer/CanvasController.ts:360-`)가 `canvasViewUpdate`를 부르고, 열린 캔버스의 폴더가 목록에 없으므로 `{ kind: "clear", reason: "closed" }`(`app/src/renderer/canvasView.ts:74`)를 받는다. 컨트롤러는 캔버스를 닫고 상태를 `"empty"`, 메시지를 "Pick a canvas from the list"로 둔다(`CanvasController.ts:403-414`).
- `entry`가 없으니 Overview도 그려지지 않는다(`App.tsx:1177`, `App.tsx:1183`). 결과적으로 사람은 프로젝트가 없는 워크스페이스에서 "Pick a canvas from the list"만 보게 된다.
- 페이지에는 같은 상황의 규칙이 이미 있다. PRODUCT §5 item 1 'Add Projects page': "Leaving follows the Settings page rule (item 0), going Home when the origin's project was removed." 구현은 `addPageReturn`(`app/src/renderer/addProjectsNav.ts`)으로, 출발점 워크스페이스의 루트가 목록에 없으면 Home으로 간다. Project Settings 페이지는 자기 워크트리가 빠지면 `gone`으로 떠난다. 워크스페이스 화면 자체에는 이 규칙이 없다.

### 2. Remove from Doan이 묻지 않고 지운다

- 실행 중인 Home 대화가 없으면 `homeRun.remove`가 `removalConfirm`(`app/src/renderer/homeConversations.ts:39`)에서 `null`을 받아 바로 `removeNow`를 부른다. 확인 없이 지우고 8초 Undo 토스트(`App.tsx:999`)로만 되돌릴 수 있다.
- 실행 중인 대화가 있을 때만 "Stop the conversation and remove <project>?" 대화상자(Cancel/Stop and Remove)가 먼저 뜬다(`App.tsx`의 `run.removing` 대화상자).

## 완료 조건

1. 캔버스가 열린 워크스페이스에서 그 프로젝트를 Remove from Doan으로 확정하면 Home이 보이고, 워크스페이스는 `visibility: hidden`·`inert`가 된다. Overview를 보고 있을 때와 문제 워크스페이스(Missing 등)의 상태 줄에서 지웠을 때도 같다.
2. 불러온 루트가 Locate나 Set Up의 재설정(reroot)으로 바뀌는 경우에는 Home으로 가지 않는다(지금처럼 새 루트를 따라간다).
3. 다른 프로젝트를 지우면 열린 워크스페이스는 그대로다. Home·페이지에서 지울 때의 이동은 지금 규칙을 따른다(Add Projects·Settings는 출발점 프로젝트가 지워졌으면 Home, Project Settings는 자기 워크트리가 빠지면 떠난다).
4. Remove from Doan을 누르면(사이드바 프로젝트 메뉴, 워크스페이스 상태 줄, Project Settings 페이지) 먼저 확인 알림이 뜨고, 확정하기 전에는 아무것도 지워지지 않는다. 세 곳 모두 `App.remove`를 거치므로 한 곳에서 묻는다.
5. 확인 알림은 Doan의 프로젝트 목록에서만 빠지고 파일과 Git 워크트리는 디스크에 남는다는 것을 말한다. 문구와 버튼은 design.md '확인 알림'을 따른다.
6. Cancel·Esc는 아무것도 지우지 않고 알림을 닫으며, 포커스는 알림을 열기 전 자리로 돌아간다(지금 "Stop and Remove" 대화상자와 같다). 포커스는 처음에 Cancel에 있다.
7. 실행 중인 Home 대화가 있으면 지금의 "Stop the conversation and remove <project>?" 알림 하나만 뜬다. 알림이 두 번 연달아 뜨지 않는다.
8. 확정 뒤 토스트가 뜨지 않는다(Undo 토스트도 안내 토스트도 없다). Edit > Undo Remove(⌘Z)도 없고, ⌘Z는 늘 일반 Edit > Undo다.
9. Undo와 제거 토스트에만 쓰이던 코드(main의 `folders:restore`·`folders:forget-removal`·`removalLabel`, preload의 `restoreProjects`·`forgetRemoval`, 메뉴의 `undoRemove`)가 남지 않는다.
10. 이 버그의 회고가 `docs/POSTMORTEM.md`에 있고, PRODUCT·ARCHITECTURE·DESIGN이 새 규칙을 현재 상태로 적는다.

## 비목표

- 여러 프로젝트를 한 번에 지우기, 제거 기록, 휴지통.
- 파일이나 Git 워크트리를 지우는 동작(PRODUCT §3 Out of scope 6: Doan은 Git 작업을 하지 않는다).
- 제거 뒤 Home에서 특정 프로젝트를 고르거나 강조하는 동작.
- 상태 줄·문제 행의 Remove from Doan이 워크트리 하나만 지우고 사이드바·Project Settings가 그룹 전체를 지우는 차이를 바꾸는 것(지금 동작 그대로 둔다).
- 확인 알림의 새 시각 디자인. 기존 `doan-dialog` compact 알림(Move to Trash 알림과 같은 모양)을 그대로 쓴다.

## 결정

1. **확정 뒤 토스트 없음.** Undo 토스트도, 안내 토스트도 띄우지 않는다. 알림이 이미 파일이 디스크에 남는다고 말한다.
2. **확정 버튼은 prominent(검은 채움).** Doan에는 위험(destructive) 버튼 변형이 없고, 같은 성격인 Move to Trash 알림이 `data-ui-variant="prominent"`를 쓴다(DESIGN 'Trash dialog').
3. **실행 중인 대화가 있을 때**는 지금의 "Stop and Remove" 알림 하나가 확인을 겸하고(완료 조건 7), 본문의 "Files stay on disk."만 "Files and Git worktrees stay on disk."로 맞춘다.
4. **Undo 경로와 토스트 문구 코드는 같은 `/ship`에서 지운다.** main·preload·메뉴의 Undo 코드, `shell.restore`·`folders.insertAt`, 토스트 문구에만 쓰이던 `removalLabel`(`app/src/main/removal.ts`)과 `RemoveResult.label`이 대상이다. 토스트를 없애면 고아가 되는 코드라 AGENTS.md 'Surgical changes'의 "자기 변경이 만든 고아만 지운다"에 해당한다.
5. **`/design-draft`는 생략한다.** 새 화면 없이 기존 `doan-dialog` compact 알림에 문구만 넣는다. 확인은 `/runtime-test` 스크린샷으로 한다.
