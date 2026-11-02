# canvas-row-menu — design

결정의 출처는 [spec](./spec.md) '결정'이다. 이 문서는 그 결정을 지금 코드에 어떻게 얹는지 적는다. 같은 PR로 나가는 terminal-agent-activity의 work 목록(`app/src/main/workState.ts`, preload `getWork`·`onWorkChanged`)과 `doan work`(`cli/internal/cli/work.go`)가 이 브랜치에 있다는 전제로 쓴다.

## 영향 받는 구성 요소

| 영역 | 무엇이 바뀌나 |
|---|---|
| CLI (Go) | 새 명령 `doan export`(`cli/internal/cli/export.go`, `run.go` 등록, `args.go` 플래그 `-o`·`--force`), 새 패키지 `cli/internal/export/`(참조 수집·자산 해석·CSS/HTML 다시 쓰기·data URI·viewer 조립), embed한 viewer 파일 `cli/internal/export/viewer/`, `envelope.go` `ExitCode`에 새 코드, `doan help` usage, 가이드 `cli/internal/cli/skill.md` |
| app main | 새 IPC `canvas:trashPlan`·`canvas:trash`·`canvas:export`(`app/src/main/index.ts`), 휴지통·경로 확인 모듈(새 파일 `app/src/main/canvasTrash.ts`), export 실행(`app/src/main/cli.ts`에 `runExport`), preload 메서드 |
| app renderer | `ShellSidebar.tsx` 캔버스 행 버튼과 메뉴, 삭제 Alert Dialog(`App.tsx` 옆 새 컴포넌트), 삭제 뒤 화면(`canvasView.ts` `canvasViewUpdate`), 토스트, `styles.css` 행 버튼 |
| 스킬·가이드 | `skill.md`에 `doan export` 한 줄과 부르는 때 |
| 형식 | JSON Schema 변경 없음(아래 '형식 변경') |
| eval | 새 시나리오 하나(아래 '`/agent-eval`') |

## 행 버튼과 메뉴 (`ShellSidebar.tsx`)

- 지금 캔버스 행은 아이콘, 이름 `<span>`, `SlotMark` 순서다(`ShellSidebar.tsx` 249행). 프로젝트 행의 메뉴는 `DropdownMenu.Root` 하나를 `menu === card.key` 상태로 연다(214행). 캔버스 행도 같은 `menu` 상태를 쓰되 값을 `{kind: "project" | "canvas", key}`로 바꾼다(캔버스 key는 행 key `${root}\n${path}`). 한 번에 메뉴 하나만 열린다. **함정**: 107~112행 effect는 `menu`가 어떤 `card.key`와도 같지 않으면 `setMenu(null)`과 `fallback()`을 부르므로, 종류를 나누지 않으면 캔버스 메뉴가 열리자마자 닫히고 포커스가 프로젝트 행으로 튄다. effect는 `kind`별로 판정한다(캔버스는 그 key가 `rows`에 있는지). `fallback()`·`menuIndex`도 card 기준이라 캔버스 쪽은 아래 '메뉴가 열린 행이 사라질 때'를 따른다.
- 잠긴 동안 버튼은 `disabled`가 아니라 `aria-disabled`다(포커스 순서 유지, DESIGN 'Locked Back').
- 버튼은 프로젝트 행 버튼과 같은 모양이다: `doan-icon-button shell-more`, `Ellipsis` 아이콘, `aria-label="<stem> menu"`, `tabIndex={active === key ? 0 : -1}`, click·keydown `stopPropagation`(215행). 그래서 Tab 순서와 roving tabindex 규칙(ARCHITECTURE §3 'Actions and focus')이 그대로다.
- 크기: 프로젝트 행 버튼은 32px(`styles.css` 422행 `.shell-more.doan-icon-button`)이고 행 높이도 32px이다(404행). 캔버스 행에서도 32px 정사각형이면 행 높이가 바뀌지 않는다. 행의 오른쪽 padding(10px, 424행)과 겹치는 부분은 초안에서 정한다.
- **상태 자리와 버튼(초안 제안, 사용자 확정)**: 지금 프로젝트 행 버튼은 항상 보인다(hover 규칙이 없다). 캔버스 행은 수가 많아 항상 보이면 목록이 시끄럽고 상태 자리(`.row-slot`, `margin-left: auto`, 669행)와 겹친다. 제안: 버튼은 행 hover, 행 안 키보드 포커스(`:focus-within`), 그 행의 메뉴가 열린 동안에만 보이고, 그동안 상태 자리 위치를 대신한다. 상태 자리는 시각적으로만 숨기고(`visibility: hidden`이 아니라 opacity 0, 접근 이름 유지) 행 상태 정보는 사라지지 않는다. 초안 P2가 이 제안과 프로젝트 행의 '항상 보임'의 차이를 적고, 사용자가 확정한다.
- **메뉴 항목**:
  - Export: `row.error`가 있으면 비활성이고 이유 한 줄(예: 행 오류 문장과 같은 뜻)을 메뉴 안에 둔다. 같은 캔버스 Export가 진행 중이면 비활성.
  - Move to Trash: 아래 '작업 중 판정'이 참이면 비활성이고 이유 한 줄.
  - 비활성 방식: Radix `disabled`를 쓰지 않는다. `disabled` 항목은 화살표 이동에서 빠져 이유 줄을 키보드·VoiceOver 사용자가 듣지 못한다. `aria-disabled="true"`와 `onSelect`의 `preventDefault`로 포커스는 받되 동작하지 않게 하고, 이유 줄은 항목의 `aria-describedby`로 잇는다(DESIGN 'Locked Back': "`aria-disabled`, not `disabled`, so it keeps its place in the focus order").
  - 문구 후보: "Export…"(저장 대화상자 입력이 이어진다), "Move to Trash"(확인만 이어진다; 기존 "Remove from Doan"처럼 줄임표 없음, `ShellSidebar.tsx` 78행). 확정은 P1.
- **포커스**: 메뉴를 닫을 때 포커스 복귀는 프로젝트 메뉴의 `onCloseAutoFocus` 규칙을 따른다(216~218행: 대화상자가 열렸거나 포커스가 이미 다른 곳에 있으면 복귀하지 않는다). 대화상자 판정은 클래스가 아니라 `[role="dialog"], dialog[open]`로 한다 — POSTMORTEM 2026-10-30 "Removing a shared dialog class silently disabled two focus guards": "identify a dialog by its rendered role (`dialog[role="alertdialog"]`), not a styling class".
- **메뉴가 열린 행이 사라질 때**: 프로젝트 메뉴는 `useLayoutEffect`로 메뉴의 root가 없어지면 닫고 `fallback()`으로 포커스를 옮긴다(107~112행). 캔버스 메뉴는 그 행 key가 `rows`에서 없어지면 같은 방식으로 닫는다(다른 프로세스가 파일을 지운 경우). 메뉴가 열린 채 행이 잠기면(`props.locked`) 열림 상태도 닫는다 — POSTMORTEM 2026-11-01 "A frame drawer list closed by a disabled trigger reopened by itself"의 Prevention.
- **키보드**: 화살표·Home/End·typeahead는 `keyboard()`가 `event.target !== event.currentTarget`이면 무시하므로(114행) 버튼에 포커스가 있을 때는 행 이동이 일어나지 않는다. 프로젝트 행과 같다. Shift+F10·ContextMenu 키는 이번 범위 밖이다.
- POSTMORTEM 2026-10-27 "Shell restyle lost navigation landmarks and inherited the wrong control sizing": "Verify actual border-box height, not only min-height". 버튼을 더한 뒤 캔버스 행의 실제 높이가 32px인지 `/design-sync`에서 잰다.
- POSTMORTEM 2026-11-02 "The sidebar list scrolled with the classic scrollbar": 새 스크롤 컨테이너를 만들지 않는다. 메뉴는 Portal로 띄운다(프로젝트 메뉴와 같다).

## 작업 중 판정 (Move to Trash 비활성)

순수 함수 `trashBlock(target, list, work, drawing) → null | reason`(새 파일 `app/src/renderer/canvasRowMenu.ts`). `target`은 `{root, path, id?}`.

- 앱 대화: main의 대화 목록(`ConversationSummary[]`)에서 그 root의 대화 중 캔버스가 target과 같은 것(ID가 양쪽에 있으면 ID, 아니면 path — `canvasConversationRows.ts`와 `canvasRun.ts`의 매칭 규칙)이 작업 중이거나 답을 기다린다. 판정 기준은 Agent indicator가 쓰는 `agentPresence`(`app/src/renderer/agentPresence.ts`)와 같은 상태 집합을 쓴다.
- project conversation이 그 캔버스를 그리는 중(`homeRun.drawing(root, canvas)`, `App.tsx` 288행): promotion 판정 전이라 그 대화가 이 캔버스에 묶일 수 있다.
- 터미널: work 목록(`WorkItem = {session, provider, root, path}`)에 같은 (root, path)가 있다.
- worktree: root까지 같아야 한다. POSTMORTEM 2026-11-01 "The canvas agent indicator kept another worktree's conversation and its Stop": worktree는 canvas ID와 경로를 공유하므로 캔버스만 맞춰 보면 다른 worktree의 작업이 이 행을 막는다.
- main도 같은 판정을 `canvas:trash` 처리 때 다시 한다. renderer 판정은 표시용, main 판정이 경계다. main에는 `homeRun.drawing`(renderer의 `extras.drew`, `homeRun.ts` 328행)이 없으므로 main이 가진 근거를 쓴다:
  - 캔버스 대화: `service.list(root)`의 상태(작업 중·답 대기).
  - project conversation: 같은 root의 project conversation이 실행 중(`projectBusy`)이거나 끝난 뒤 `BIND_GRACE_MS` 안이고, 그 promotion evidence의 `edits`·`changed`(`conversation/service.ts` 86행 `Evidence`)에 이 path가 있다.
  - 터미널: `workState`의 work 목록.
  - 이 판정은 main 쪽 순수 함수 `trashBusy(target, conversations, evidence, work)`로 둔다.

## 삭제 (`canvas:trash`)

### IPC와 경로 확인 (main)

- 채널 `canvas:trash`, 요청 `{root, path}`, 응답 `{kind: "trashed", comments: "trashed" | "kept" | "failed"} | {kind: "refused", reason: "busy" | "notListed" | "notFile" | "failed"}`. 주 창의 main frame만 받는다(ARCHITECTURE §7 allowlist, `senderAllowed.ts`).
- renderer가 보낸 경로는 열쇠로만 쓴다. ARCHITECTURE §7 'Main boundary': "No renderer-provided path is used to construct a config path". 썸네일 IPC처럼(`thumbnails.ts` `listedRow`) main이 가진 목록에서 행을 찾고, 그 행의 경로로만 파일을 다룬다.
  1. `root`가 등록된 root이고 그 항목이 `kind: "list"`.
  2. `path`가 그 목록의 행 path와 글자 그대로 같다. `app/src/formats/canvasPath.ts` `canvasKind`가 `canvases` 또는 `ds`로 분류한다. 하위 디렉터리도 포함한다: 목록이 하위 디렉터리를 읽고 사이드바에 그 행이 있으므로 막지 않는다.
  3. `lstat`으로 `root/.doan`부터 캔버스 파일까지 모든 segment가 심볼릭 링크가 아니고, 캔버스는 일반 파일이다. 목록은 링크를 따라가지 않으므로(ARCHITECTURE §13 'Listing') 정상이면 모두 통과한다. 이 확인은 목록을 읽은 뒤 바뀐 경우를 막는다.
  4. `realpath(root)`와 `realpath(캔버스)`를 path segment로 비교해 안에 있는지 본다(문자열 prefix 아님, ARCHITECTURE §13 'Paths inside the repo').
  5. 작업 중 판정(위)이 거짓.
- 확인과 `shell.trashItem` 사이에 디렉터리가 링크로 바뀌는 경우는 남는 한계로 둔다. 서버는 `O_NOFOLLOW_ANY`로 열어 막지만(`serve/server.ts` `openNoFollow`), `trashItem`은 경로만 받는다. 사람이 누른 한 번의 동작이고 대상은 사람이 고른 행이라 받아들인다. ARCHITECTURE에 한 줄로 적는다(Z).
- POSTMORTEM 2026-10-27 "Session history and append followed replaceable filesystem paths"의 교훈(확인과 사용 사이의 경로 교체)을 여기에도 적용한다는 점을 코드 주석과 ARCHITECTURE에 남긴다. 완전히 막을 수 없는 이유(경로만 받는 API)도 함께 적는다.

### 댓글 파일

- 옮기는 조건: 행에 `id`가 있고 canvas ID 규칙(`^[a-z0-9]+(-[a-z0-9]+)*$`, ARCHITECTURE §1 규약 2)에 맞으며, 같은 root 목록의 다른 행이 그 ID를 쓰지 않고, 목록의 어떤 행도 읽기·파싱 오류가 없다. 오류가 있는 행은 그 ID를 쓸 수도 있기 때문이다(`doan ls` `orphans`의 `uncertain`과 같은 이유, ARCHITECTURE §12).
- 경로: ID로 `root/.doan/comments/<id>.jsonl`을 바로 만들지 않는다. ARCHITECTURE §13 'Listing': "Commands never build `.doan/comments/<id>.jsonl` from an argument: on case-insensitive macOS that would open `FOO.jsonl` for `foo`". `.doan/comments`를 `readdir`해 이름이 `<id>.jsonl`과 바이트 단위로 같은 항목만 고른다. `lstat`으로 `.doan/comments`와 파일이 링크가 아니고 파일이 일반 파일일 때만 옮긴다. 없으면 `kept`가 아니라 옮길 것이 없는 것으로 본다.
- 순서: 캔버스 먼저, 그다음 댓글. 캔버스 옮기기가 실패하면 댓글은 건드리지 않는다. 댓글만 실패하면 `comments: "failed"`로 알리고 캔버스는 이미 휴지통에 있다. 이 상태는 `doan check`의 `orphan_comment_file` 경고로 보이고, 그 경고는 에이전트에게 지우지 말라고 한다(PRODUCT §5 item 11).
- 대화상자가 댓글을 말할지: **main에 미리 묻는다.** 앱 행(`CanvasRow`)에는 `ls`의 댓글 수가 없다(`app/src/main/view.ts` 24~26행: "The listing's comment counts and `commentsError` are not kept"). renderer는 파일이 있는지도 모른다. 그래서 대화상자를 열 때 `canvas:trashPlan {root, path}` → `{comments: boolean} | {kind: "refused", reason}`을 부르고, 답이 올 때까지 확인 버튼은 `aria-disabled`다. main은 `canvas:trash`와 같은 경로 확인, 위 조건과 파일 확인을 같은 함수(`trashTarget` + 파일 확인)로 한다. 실제로 옮길 때 다시 판정하므로, 그 사이 바뀐 결과는 토스트가 말한다.

### 삭제 뒤 화면 (renderer)

- 열려 있던 캔버스: 파일이 사라지면 지금도 `canvasViewUpdate`(`app/src/renderer/canvasView.ts` 28행)가 목록 갱신에서 그 경로가 없어진 것을 보고 ID로 따라간다. **함정**: 같은 ID를 쓰는 다른 캔버스가 하나 있으면 `same.length === 1`이라 `moved`로 보고 그 캔버스를 연다(47행). 지운 것을 옮긴 것으로 착각한다. 그래서 renderer가 `canvas:trash` 응답 `trashed`를 받으면 그 (root, path)를 한 번만 쓰는 '예상된 제거' 표시로 남기고, `canvasViewUpdate`는 이 표시가 있는 경로에서 ID 추적보다 먼저 `clear` 이유 `trashed`를 낸다. 이동 이벤트가 한 번만 쓰이는 것(ARCHITECTURE §3 'Moved canvas' "The move event is one-shot")과 같은 수명이다.
- `clear` 이유 `trashed`는 Overview로 가고, 일반 제거 토스트 대신 삭제 토스트 하나만 띄운다. 열려 있지 않던 캔버스를 지우면 화면은 그대로이고 토스트만 띄운다.
- 응답이 오기 전에 감시가 먼저 목록을 바꿀 수 있다(같은 행이 응답보다 먼저 사라짐). 그래서 표시는 요청을 보내기 직전에 '대기'로 걸고, `refused`면 거둔다. 대기 중 목록에서 사라지면 `trashed`로 처리한다.
- Back/Forward: 기록은 지금처럼 남고, 이동할 때 지운 대상을 건너뛴다(PRODUCT §5 item 1, `App.tsx` `validHistoryVisit`). 바꿀 것 없다. POSTMORTEM 2026-10-27 "Shell navigation shortcuts lost destination ownership and recovery access"의 검색(`rg -n 'validHistoryVisit|showOverview\(|workspaceMemory.set|cancelWorkspaceOpen|aria-current|repairRoot'`)으로 새 경로(삭제 → Overview)가 source 메모리와 완료된 이동만 기록하는지 확인한다.
- 캔버스별 기기 로컬 상태(`activityKey`, `canvasKey`, `draftKey`, ARCHITECTURE §3 'Per-canvas device-local state')와 대화 패널 초안: 지우지 않는다. 휴지통에서 되살리면 같은 ID로 다시 붙는다(spec 결정 7과 같은 이유).
- 캔버스 seen 기록(`canvasSeen.ts`): 지우지 않는다. ARCHITECTURE §7 'Seen canvases': "Paths are never pruned on a listing". 되살린 파일의 mtime이 같으면 본 것으로 남는다.
- 썸네일: `thumbnails.ts` `collect`가 목록에 없는 key의 캐시를 지우고(247~257행), 목록에서 빠진 행은 Overview에 나오지 않는다. 바꿀 것 없다.
- 사이드바 포커스: 대화상자를 닫으면(Cancel·Esc·확인 모두) 포커스는 그 행의 메뉴 버튼으로 돌아간다. 이 복귀는 App의 `modalClosed()` → `focusCurrent(beforeModal)`(`App.tsx` 660~666행)이 맡는다. renderer가 따로 포커스를 옮기지 않는다(두 곳이 서로 덮어쓰지 않게). 확인 뒤 행이 사라지면 기존 `ownedFocus` 복구(`ShellSidebar.tsx` 156~173행)가 같은 index의 행, 곧 다음 행으로 옮긴다. 기존 복구에 없는 분기(마지막 행이면 이전 행, 그룹이 비면 그룹 머리)만 그 복구에 더한다. `refused`면 행이 남으므로 포커스는 버튼에 그대로 있다. POSTMORTEM 2026-10-25 "Removing the remembered row removed a card from keyboard navigation": "derive roving focus from the current item set" — `active`는 지금처럼 현재 행 집합에서 계산되므로 남는다.
- 대화: 손대지 않는다(spec 결정 7). 'canvas left the project' 규칙이 그대로 적용된다.

### Alert Dialog

- first run Stop 대화상자(`Onboarding.tsx` 128행)와 `SettingsDialog.tsx` 10행의 모양을 쓴다: `<dialog className="doan-dialog" data-ui-size="compact" role="alertdialog">`, `aria-labelledby`·`aria-describedby`, `showModal()`, `onCancel`에서 `preventDefault` 뒤 취소 처리, 처음 포커스 Cancel(`autoFocus`). 흐름은 Remove 확인(`App.tsx` 1280~1284행, 이 대화상자는 `aria-label`만 있다)과 같다.
- App의 `modal`(`App.tsx` 655행)에 이 대화상자를 넣는다. 그래야 토스트 타이머가 멈추고(`toast.setModal`), native `menu:state`의 modal 값과 `locked()`가 맞고, 닫힐 때 `modalClosed()`가 `beforeModal`로 포커스를 돌린다. Remove 확인과 같은 방식이다.
- 대화상자가 열린 동안 그 행이 `rows`에서 사라지면 대화상자를 닫는다. 열린 캔버스였다면 기존 '캔버스가 없어졌다' 토스트 하나로 끝난다. `trashBlock`은 대화상자에서도 live로 다시 계산한다. 참이 되면 Move to Trash 버튼을 `aria-disabled`로 바꾸고 이유 줄을 본문 아래에 보인다. main 재확인은 그대로 경계다.
- 버튼 크기: DESIGN 'Dialogs'는 대화상자 동작을 기본 크기로 둔다. Remove 확인은 `sm`이라 DESIGN 'Open decisions' 'Remove confirmation actions'에서 미정이다. 이 대화상자는 DESIGN 'Dialogs' 규칙(기본 크기)을 따른다. 초안에서 확인한다.
- 위험 동작 색: 앱에 destructive 변형이 없다(`ds/*.css`에 `danger` 없음). Remove 확인처럼 `prominent`를 쓴다. 새 변형을 만들지 않는다.
- 문구 후보(P1에서 clarify 프리셋으로 확정):
  - 제목: `Move “<stem>” to Trash?`
  - 본문: `This removes <repo 상대 경로> from the repository[ along with its comments]. You can restore it from the Trash. Commit the change to share it with others.` — 추적하지 않는 캔버스에는 커밋할 변경이 없으므로, 마지막 문장이 그 경우에도 틀리지 않는지 P1에서 본다. "restore"는 휴지통에서 꺼내는 것을 뜻하고 Put Back을 약속하지 않는다(T13에서 확인). clarify의 "name the object and the consequence", "name the action in both the message and the button".
  - 버튼: `Cancel`, `Move to Trash`.
- 진행 중: `trashItem`은 짧지만 비동기다. 확인을 누르면 대화상자를 닫고 결과를 토스트로 알린다(Remove 확인과 같은 흐름). 같은 행의 두 번째 요청은 main이 진행 중 집합으로 거절한다.
- 토스트 후보: 성공 `Moved “<stem>” to Trash.`; 댓글만 실패 `Moved “<stem>” to Trash, but its comments couldn’t be moved (<.doan/comments/<id>.jsonl>).`; 거절 `Couldn’t move “<stem>” to Trash.` + 이유(작업 중이면 `An agent started working on it.`). 확정은 P1.

## Export

### CLI 명령

`doan export <canvas path> -o <file> [--force] [--repo <path>] [--json]`

- 인자 확인 순서(오류 코드):
  1. 플래그·인자 개수, `-o` 없음, 출력 경로의 디렉터리 중 하나라도 이름이 `.doan`(어느 repo든) → `usage_error`(exit 2). 상대 `-o`는 현재 디렉터리 기준이다. 출력은 repo 경로가 아니라 사람이 고른 파일이므로 repo root 기준 규칙을 쓰지 않는다.
  2. repo 찾기 → `repo_not_found`·`invalid_config`(지금 규칙).
  3. 캔버스: repo 상대 또는 repo 안 절대 경로를 `/` repo 상대로 바꿔 `repo.Canvases` 목록(링크를 따라가지 않는 목록, `cli/internal/repo/files.go`)의 path와 맞춘다. 없으면 `canvas_not_found`(exit 2, 기존 코드).
  4. 캔버스 파싱 실패, `doan:width` 없음·틀림 → `export_refused`.
  5. 자산 해석(아래). 하나라도 거절 조건이면 모두 모아 `export_refused`. 메시지는 참조(href)와 이유를 줄마다 적는다(절대 경로는 넣지 않는다, ARCHITECTURE §12 `ls`의 `message` 규칙과 같다).
  6. 결과 크기 > 50 MiB → `export_too_large`. 메시지에 큰 자산 5개(repo 상대 경로와 크기).
  7. 출력 파일이 있고 `--force` 없음 → `destination_exists`(기존 코드, exit 2; 뜻이 같으므로 새 코드를 만들지 않는다). 출력 디렉터리가 없으면 `usage_error`.
- 쓰기: 출력 디렉터리에 임시 파일(`.<stem>.html.doan-*`)을 만들고 rename한다(`.doan/config.json` 쓰기와 같은 방식). `os.CreateTemp`는 0600으로 만들므로 rename 전에 umask 기준 0644로 바꾼다. 출력 경로가 심볼릭 링크이면 링크를 따라 쓰지 않고 링크를 바꾼다(rename의 동작). 정상 종료와 오류에서는 부분 파일이 남지 않는다. 프로세스가 kill되면 임시 파일이 남을 수 있다(알려진 한계).
- 새 오류 코드 `export_refused`, `export_too_large`는 모두 exit 2다. ARCHITECTURE §12 표 'Exit 2: Caller-fixable input'에 맞는다: 캔버스나 인자를 고치면 풀린다. `ExitCode`(`cli/internal/cli/envelope.go` 24행)에 더하고 §12 표에 적는다.
- `nextSteps`: `export_refused` → "Fix the listed references (add the path to serve, or move the file into .doan/assets/), then export again." 같은 뜻. `doan check`로 보내지 않는다: check에는 img·media·SVG `href`·CSS `url()` 규칙이 없어 같은 참조를 찾지 못한다. `export_too_large` → 큰 자산을 줄이라는 뜻. 문구는 구현 때 정하고 가이드와 맞춘다.

### CLI 결과

`{path, output, bytes, frames, external: [url], links: [href]}`

- `path`: repo 상대 캔버스 경로. `output`: 쓴 파일의 절대 경로(사람이 연다; `ls`의 `root`처럼 명시한 예외). `bytes`: 결과 크기. `frames`: 정적 파싱의 프레임 수.
- `external`: 남긴 외부 URL(`http:`, `https:`, `//`; 원래 값 그대로), 정렬, 중복 없음. `doan check`의 `external_url`과 같은 판정(`canvas.IsExternal`). 앱 토스트와 가이드가 쓴다(사람에게 인터넷이 필요하다고 말한다).
- `links`: 그대로 둔 로컬 탐색 참조(`<a href>`, `<form action>`). 가이드가 쓴다(에이전트가 결과 파일에서 동작하지 않는 링크를 사람에게 말한다).
- 넣은 파일 목록(`inlined`)은 두지 않는다. 쓰는 곳이 없고, 테스트는 결과 파일을 직접 본다.
- 빈 목록은 `[]`(ARCHITECTURE §12 공통 규칙).

### 자산 해석: serving scope와 경로 규칙 재사용

원칙: **결과에는 앱이 보여 주는 것만 들어간다. 앱이 보여 주지 않는 repo 파일은 절대 들어가지 않는다.** 캔버스 스크립트는 `.env`나 소스를 `<img src="../../.env">`로 가리킬 수 있으므로(ARCHITECTURE §3 serving scope의 이유), 범위 판정이 곧 보안 경계다.

- 기준 경로: 캔버스나 CSS 파일의 디렉터리. `canvas.LocalPath(href)`(`cli/internal/canvas/canvas.go` 46행)로 scheme·`//`·`?#`·percent-escape를 처리한다. `data:`·`blob:`·`about:`·`javascript:` 같은 scheme은 건드리지 않는다. 앞이 `/`인 href는 repo 밖이다(ARCHITECTURE §1 'Parsing': "a leading `/` href is outside the repo because the app cannot resolve server-root paths").
- 판정: `repo.Resolve(root, base, p)`(`cli/internal/repo/resolve.go`)로 lexical → symlink → 실제 경로를 path segment로 비교한다. `Outside`·`Missing`이면 거절. `Inside`면 실제 repo 상대 경로가 `repo.Scope(root, config)`(`cli/internal/repo/scope.go`)의 어느 항목과 같거나 그 아래인지 본다(`doan check`의 `in.Served`, `cli/internal/cli/check.go` 70~77행과 같은 비교). 아니면 거절(`css_not_served`와 같은 이유). 일반 파일이 아니면 거절.
- 앱 서버도 같은 순서로 판정한다: realpath → 안쪽 확인 → scope 확인 → `O_NOFOLLOW_ANY` 열기(ARCHITECTURE §3 'Local server implementation'). 그래서 serve에 설정된 링크 대상처럼 실제 경로가 scope 안이면 앱이 보여 주고 export도 넣는다. 링크가 scope 밖이나 repo 밖을 가리키면 앱은 404이고 export는 거절한다.
- 읽기: `O_NOFOLLOW`만으로는 마지막 component만 막는다. 그래서 `cli/internal/cli/sessions.go` 197~229행처럼 real root부터 segment마다 `Openat`에 `O_NOFOLLOW|O_DIRECTORY`(마지막 파일은 `O_NOFOLLOW`)로 열고(`golang.org/x/sys/unix`, ARCHITECTURE §8에 이미 있는 의존성) `fstat` 크기까지만 읽는다. 판정과 열기 사이에 어느 segment든 링크로 바뀌면 실패한다. 서버의 `O_NOFOLLOW_ANY`와 같은 목적이다.
- POSTMORTEM 2026-10-31 "A linked default directory served its unconfigured target": "default directories are served only when neither `.doan` nor the directory itself is a symlink". export는 `repo.Scope`를 그대로 부르므로 이 규칙을 다시 구현하지 않는다. 테스트는 그 항목의 Prevention대로 링크된 기본 디렉터리에서 `scope`와 export 결과를 함께 확인한다(링크된 `.doan/assets` 아래 이미지는 거절).
- 설정·댓글은 넣지 않는다: `repo.MetadataPath`가 scope에서 빼므로 `.doan/config.json`·`.doan/comments/`를 가리키는 참조는 범위 밖으로 거절된다(ARCHITECTURE §1 "Settings and comments are never served").
- CSS 안의 참조: CSS 파일의 `@import`·`url()`은 그 CSS 파일의 실제 경로 디렉터리 기준이다. ARCHITECTURE §1 'Reach'의 한계("a relative `@import` in a symlinked CSS file resolves from the real file's directory, not the URL path the browser uses")가 export에도 같다. `doan check`와 같은 결과를 내려고 그대로 둔다.
- CSS 파일 안의 참조(간접 `@import`·`url()`): `doan check`는 CSS 파일 안의 풀리지 않는 `@import`(없는 파일, `tailwindcss` 같은 패키지 이름)를 따라가지도 보고하지도 않고(`local_css_not_found` 행), CSS 안 `url()`은 보지 않는다(`check.go` 100~147행). export의 규칙:
  - 대상 파일이 없으면 거절하지 않고 그대로 둔다. 결과 파일에서 그 요청은 실패하는데, 앱에서도 실패하므로 같다. 캔버스가 직접 닿는 참조(캔버스의 `<link>`, `<style>` `@import`, 요소의 `src` 등)는 없으면 거절한다.
  - 대상이 repo 밖이거나 scope 밖이면 직접 참조와 같이 거절한다. 앱이 보여 주지 않는 파일은 넣지 않는다는 원칙 그대로이고, 그대로 두면 받는 사람 기기의 같은 상대 경로를 읽게 된다.
- `@import` 순환: 지금 따라가는 조상 stack으로만 막는다. 조상에 이미 있는 파일을 다시 가리키면 빈 CSS data URI로 바꾼다(브라우저도 순환 import를 무시한다). 전역 방문 집합은 쓰지 않는다: a→c, b→c(diamond)에서 두 번째 c가 비면 cascade가 달라진다(`check.go` 125~128행의 `visited`는 보고용이라 다르다).

### 다시 쓰기

- HTML: `golang.org/x/net/html`의 tokenizer로 읽고, 바꿀 속성이 있는 시작 태그만 다시 쓰며 나머지 토큰은 원래 바이트(`Raw()`)를 그대로 옮긴다. `html.Parse` 뒤 `html.Render`는 잘못 중첩된 마크업에서 다른 트리를 만들 수 있으므로 쓰지 않는다. `<template>` 안쪽은 `doan check`처럼 무시한다(ARCHITECTURE §1 'Parsing'). 알려진 한계: tokenizer는 문맥을 모르므로 SVG 안 `<style>`(foreign content)도 raw text로 읽는다.
- protocol-relative `//host/x`: 결과 파일에서는 shell의 `file://` URL이 기준이 되어 `file://host/x`로 깨지고, data: CSS 안에서는 기준이 없어 풀리지 않는다. 그래서 `https:`를 붙여 다시 쓴다(`external`에는 원래 값).
- 바꾸는 속성: `link[rel~=stylesheet|icon|preload|modulepreload] href`, `script src`, `img|source|video|audio|track|input[type=image] src`, `img|source srcset`, `video poster`, SVG `image|use|feImage href`·`xlink:href`, 모든 요소의 `style` 속성 안 `url()`. `<style>` 내용 안 `@import`·`url()`.
- 그대로 두고 `links`에 적는 것: `a href`, `area href`, `form action`의 로컬 참조.
- 거절하는 것: 로컬 대상의 `iframe|frame src`, `object data`, `embed src`(spec 비목표).
- CSS 다시 쓰기: 지금 `canvas.ScanCSS`(`cli/internal/canvas/css.go`)는 URL·import 목록만 내고 위치를 주지 않는다. 같은 lexer(`lex`)로 토큰 위치를 내는 순수 함수 `rewriteCSS(text, replace func(ref, kind) (string, bool)) string`을 더한다. `ScanCSS`의 결과는 바꾸지 않는다(`canvas_test.go`가 고정).
- **data URI**: 모든 참조를 그 자리에서 data URI로 바꾼다. `@import`도 내용을 붙여 넣지 않고 `@import url("data:text/css,…")`로 바꾼다. media·layer·supports 조건과 순서가 그대로 남는다. 텍스트(CSS, SVG, JS)는 꼭 필요한 문자만 percent-encoding한 `data:<mime>;charset=utf-8,…`로, 나머지는 base64로 쓴다. 중첩된 CSS 안의 base64는 percent-encoding에서 거의 늘지 않으므로 중첩마다 4/3씩 커지지 않는다. 순수 함수 `dataURI(mime, bytes)`.
- MIME: 앱 서버의 확장자 표(`app/src/main/serve/server.ts` 37~56행 `TYPES`)와 같은 표를 Go에 둔다. 표에 없는 확장자는 `application/octet-stream`. 표가 갈라지지 않도록 Go 테스트가 표 전체를 고정한다. 앱 Vitest가 Go 파일의 표를 읽어 `TYPES`와 같은지 비교하므로 어느 쪽이 바뀌어도 실패한다. 코드 주석에 서로의 위치를 적는다.
- `<script src>`는 `src`를 data URI로 바꾸고 `type`·`async`·`defer`·`crossorigin`은 그대로 둔다. 모듈 스크립트 안의 상대 `import`는 data URI 기준이라 풀리지 않는다(spec 비목표, 알려진 한계).

### viewer shell

- **위치와 embed**: `cli/internal/export/viewer/`에 `shell.html`(틀과 자리 표시), `shell.css`, `lib.js`(DOM에 닿지 않는 순수 함수), `shell.js`(viewer 동작), `measure.js`(캔버스 문서에 넣는 측정 스크립트)를 두고 `//go:embed viewer/*`로 바이너리에 넣는다. 스키마를 `schema/embed.go`로 넣는 것과 같은 방식이다(ARCHITECTURE §11). 빌드 단계를 더하지 않는다.
- **구조**: 결과 파일은 shell 문서다. shell은 `<iframe sandbox="allow-scripts" srcdoc="…">`로 캔버스를 띄운다. `allow-same-origin`이 없어 캔버스 스크립트가 shell에 닿지 못한다(ARCHITECTURE §3 "Canvases render in a `sandbox="allow-scripts"` iframe without `allow-same-origin`"). `srcdoc`은 다시 쓴 캔버스 HTML을 속성 escape(`&`, `"`)한 것이고, `<head>` 첫 자식으로 `measure.js`를 inline `<script>`로 넣는다(앱이 injection 때 listener를 먼저 거는 것과 같은 이유: 폰트 `loadingdone`을 놓치지 않는다).
- **함정: CSP 상속**: `srcdoc` 문서는 부모의 CSP를 물려받는다. shell에 제한적인 CSP를 두면 캔버스의 외부 CDN 스크립트·폰트가 막힌다. shell은 CSP meta를 두지 않는다. shell 자신의 코드는 inline이고 외부 요청을 하지 않는다.
- **앱 보드에서 가져오는 것**(`app/src/main/canvasScript.ts`, ARCHITECTURE §3 'Canvas view' Height):
  - 폭: iframe 폭 = `doan:width`. 창 크기는 확대 비율만 바꾼다(ARCHITECTURE §3 'Board size').
  - JavaScript가 돌지 않을 때(Quick Look, 메일 미리보기, 스크립트를 막은 브라우저): shell CSS만으로 iframe이 `doan:width` × `100vh`로 보이고, `<noscript>` 한 줄이 브라우저에서 열어야 전체가 보인다고 알린다. 문구는 P1.
  - 높이가 오지 않을 때(캔버스 스크립트 오류 등): 첫 `layout`을 5초 기다리고(앱의 first-layout timeout과 같다), 그 뒤 마지막 높이로 멈추고 Fit한다.
  - 높이: `documentHeight`(42행), `frameBottom`(60행), `nextHeight`(26행) 규칙. `layout`의 `viewport`가 지금 iframe 높이와 같을 때만 높이를 받는다. 앱이 높이를 바꾼 직후 문서가 다시 커지면 얼린다(`min-height: 100vh` 문서). `document.fonts` `loadingdone` 수가 바뀐 측정은 얼리지 않는다. 절대 위치 프레임만 있는 문서는 프레임 아래쪽을 하한으로 써서 멈춘다(POSTMORTEM 2026-11-01 "A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever").
  - 프레임 목록: `layout`이 보내는 rendered DOM의 프레임(id, title, 문서 좌표 rect), 최대 1,000개, id·title 200 UTF-16 단위(`canvasMessage.ts` 상한과 같다).
  - wheel: iframe 위 wheel은 iframe 문서로 간다. Ctrl/Cmd wheel(핀치 포함)은 항상 shell로 넘기고, 일반 wheel은 커서 아래 조상이 그 방향으로 스크롤할 수 없을 때만 넘긴다(`canScrollAxis` 76행, ARCHITECTURE §3 'Input').
  - 메시지 검증: shell은 `event.source === iframe.contentWindow`이고 origin이 `"null"`인 메시지만 받고, 모양과 상한을 확인하며, 글자는 `textContent`로만 쓴다(ARCHITECTURE §3 'Injection').
- **버리는 것**: 선택·hover·picking·locate·anchor·`seq` 채널, 키 전달, CDP inspector, 문서 token, 탐색 gate(`canvasFrame.ts`), 댓글·대화·`doan active`, Reload. sandbox에 `allow-top-navigation`·`allow-popups`가 없으므로 캔버스 안 링크는 iframe 안에서만 움직이거나 막힌다.
- **확대·축소**: 상수는 앱(`app/src/renderer/viewport.ts`)과 같다: scale 0.05~4, 버튼·메뉴 한 단계와 wheel 한 번 상한 ×1.25, Fit inset, Fit의 scale 상한 1. 확대는 보드 wrapper의 `transform`이고, 그 크기만큼의 spacer를 둔 스크롤 컨테이너가 이동(pan)을 맡는다(앱보다 단순하게 브라우저 스크롤을 쓴다). 첫 화면은 Fit. 단축키: shell에 포커스가 있을 때만 ⇧1 Fit, ⇧0 100%. 앱의 ⌘1·⌘0은 브라우저에서 탭 이동·브라우저 확대와 부딪히고, 키 전달을 버리므로 iframe에 포커스가 가면 shell이 키를 받지 못한다. 모든 기능은 버튼으로도 닿는다.
- **frame drawer**: 앱의 drawer처럼 문서 순서, 번호와 제목 또는 id, 처음 1,000개까지. Quick Open이 없으므로 그 뒤 프레임은 목록에 없고, 목록 끝에 남은 수를 적는다. 고르면 앱의 frame jump처럼 `FIT_INSET`으로 그 프레임에 맞춘다(scale 상한 1, 선택은 없다). 지금 보는 프레임(보기 중심에 가장 가까운 것)을 헤더에 보인다. 프레임이 0개면 drawer는 비활성이고 "No frames"를 보인다. Esc로 닫으면 포커스가 trigger로 돌아온다.
- **헤더**: 캔버스 이름(파일 stem; 캔버스의 `<title>`은 쓰지 않는다 — 사이드바 이름과 같게. shell 문서의 `<title>`도 stem이다), frame drawer, 확대 컨트롤. 앱 토큰 값을 `shell.css`에 복사해 둔다(앱 CSS를 읽지 않는다). 모양은 초안 P2가 정하고 `/design-sync`가 잰다.
- **viewer 순수 함수의 테스트**: viewer 파일은 앱 TS가 아니므로 `canvasScript.ts`의 함수를 import할 수 없다. 높이 규칙(`documentHeight`, `frameBottom`, `nextHeight`), `canScrollAxis`, 메시지 검증, `fitScale`은 DOM에 닿지 않는 `lib.js`에 export 없는 함수 선언으로 둔다. `assemble`이 `lib.js`를 `measure.js`·`shell.js` 앞에 이어 붙인다. app Vitest는 node 환경이라 `shell.js`의 DOM 부트 코드를 실행할 수 없으므로 `lib.js`만 읽는다.
  - 높이 규칙과 `canScrollAxis`: `canvasScript.ts` 함수의 `toString()`과 `lib.js`의 같은 함수 텍스트를 비교하는 golden test(`app/src/main/exportViewer.test.ts`). 입력 표 비교보다 범위가 넓다.
  - 확대: 앱(transform View)과 viewer(scroll spacer)의 모델이 달라 `zoomAt`은 비교하지 않는다. 상수와 `fitScale`만 `viewport.ts`와 같은지 본다.

### 앱 Export 흐름

- 채널 `canvas:export`, 요청 `{root, path}`. main이 삭제와 같은 1~2단계(등록된 root, 목록 행)를 확인한다.
- main이 `dialog.showSaveDialog(win, {defaultPath: "<stem>.html", filters: [{name: "HTML", extensions: ["html"]}]})`를 연다. 폴더는 macOS 저장 패널이 기억하는 마지막 위치를 쓰고, 앱은 따로 기억하지 않는다. 취소하면 아무 일도 없다. macOS 저장 패널이 같은 이름 덮어쓰기를 묻는다. 확인된 경로에 `--force`를 붙여 CLI를 부른다(`cliCommand`가 고른 CLI, `doan export <path> -o <file> --force --repo <root> --json`).
- 타임아웃: `runCli` 기본 10초(`app/src/main/cli.ts` 6행)는 50 MiB 조립에 짧으므로 `runExport`의 타임아웃은 따로 둔다(값은 구현 때 큰 fixture로 재고 정한다). CLI를 찾지 못하거나, envelope가 아닌 출력·비정상 종료·타임아웃이면 실패 토스트를 띄우고 진행 중 집합에서 뺀다.
- 출력 경로에 `.doan` 디렉터리가 있으면 CLI가 `usage_error`로 거절하고, 앱은 그 메시지를 토스트로 보인다.
- 진행 표시: 저장 패널이 닫힌 뒤 CLI가 도는 동안 메뉴 항목이 비활성이다. 1초가 넘으면 토스트 "Exporting “<stem>”…"를 띄운다. 공용 토스트는 하나이고 8초 뒤 사라지며(`toastState.ts` `TOAST_MS`) 다른 토스트가 대체할 수 있다. 그래서 진행 토스트가 사라졌어도 끝나면 결과 토스트가 반드시 뜬다. 진행·결과 토스트가 살아 있는 Undo 토스트(프로젝트 Remove)를 대체하는 것은 공용 토스트의 기존 규칙 그대로다. 확정은 P1·P2.
- 결과 토스트: 성공 `Exported “<stem>”.` + Show in Finder(`shell.showItemInFolder`, main이 방금 쓴 경로만). `external`이 있으면 "Some images or fonts load from the internet." 같은 한 줄. 실패: CLI `error.message`의 첫 줄을 사람용 문장으로 바꿔 보인다. `export_refused`에는 막힌 참조 수와 첫 참조 하나를 넣고, 에이전트에게 고치게 하라고 말한다(예: `Couldn’t export “x”: 2 files it uses aren’t shown by Doan (../logo.png, …). Ask your agent to fix them.` 같은 뜻). 앱 사용자에게 CLI를 실행시키지 않는다. 토스트와 Show in Finder는 Tab으로 닿으면 타이머가 멈춘다(기존 규칙). 저장 위치는 사람이 이미 골랐으므로 Show in Finder는 편의 기능이다. 확정은 P1.
- 동시성: main이 (root, path)별 진행 중 집합을 두고 같은 캔버스의 두 번째 요청은 거절한다.

## 순수 함수 (`/tdd` 대상)

Go (`cli/internal/export/`):
- `classifyRef(kind, href) → inline | link | external | refuse | ignore`: 요소·속성 종류별 분류, scheme·`//`·빈 값·`#`만 있는 값.
- `resolveAsset(root, scope, base, href) → {real, refuse reason}`: `repo.Resolve`·scope 비교·일반 파일. 링크된 기본 디렉터리, serve 링크 대상, `..`, 앞 `/`, `.doan/config.json`·`.doan/comments/`, 없는 파일.
- `rewriteCSS(text, replace)`: `@import "x"`, `@import url(x) layer(a) screen`, `url()` 따옴표 세 가지, escape, 주석 안 URL 무시, 순환과 diamond import.
- `rewriteHTML(src, replace)`: 바꾼 태그 외 바이트 보존, `<template>` 무시, `srcset` 여러 후보, `style` 속성.
- `dataURI(mime, bytes)`: 텍스트 percent-encoding 규칙, base64, MIME 표. 쓰이는 문맥별로 따로 고정한다: `srcset`(공백·끝 comma 없음), CSS `url("…")`(`"`, `\`, 줄바꿈 escape), HTML 속성.
- `assemble(canvasHTML, meta) → shell HTML`: `srcdoc` escape, `lib.js`+`measure.js` 위치(head 첫 자식, head가 없으면 문서 앞), 메타 JSON escape(`<` 전체를 `<`로 바꿔 `</script>`와 `<!--`의 script-data-escaped 상태를 함께 막는다).
- `sizeCheck(bytes, assets) → ok | too large + 큰 자산 5개`(`assets`는 넣은 파일과 크기, 결과에는 내지 않는다).
- 캔버스 인자 → 목록 path 맞추기(절대·상대, 대소문자 철자는 `ls` 목록 철자로).

TS (app):
- `trashBlock(target, list, work, drawing)`(위 '작업 중 판정'; 메뉴와 열린 대화상자가 함께 쓴다).
- `canvasViewUpdate`의 `trashed` 분기(같은 ID 캔버스가 있어도 `clear`).
- 사이드바 `ownedFocus` 복구에 더하는 분기: 마지막 행이면 이전 행, 그룹이 비면 그룹 머리.
- viewer 함수 동등성(`exportViewer.test.ts`).

main:
- `trashTarget(entries, request) → {canvas, commentsId?} | refusal`: 목록 행 확인과 댓글 조건(위 '댓글 파일'). 파일 시스템 확인(segment `lstat`, `.doan/comments` `readdir` 바이트 비교)은 셸 쪽이다. `canvas:trashPlan`과 `canvas:trash`가 함께 쓴다.
- `trashBusy(target, conversations, evidence, work)`(위 '작업 중 판정'의 main 쪽).

## 형식 변경

- JSON Schema 변경 없음, `v` 그대로. CLI `result`는 스키마가 없다(ARCHITECTURE §11 "each command's `result` has no schema; §12 states it and only Go produces it"). 결과 모양은 §12에 적는다(Z).
- 새 오류 코드는 envelope의 `error.code` 패턴 안이다(§12 "`error.code` is a snake_case pattern, not an enum, so new codes need no new `v`").
- 새 IPC(`canvas:trashPlan`, `canvas:trash`, `canvas:export`)는 앱 내부이고 공유 형식이 아니다.
- 공유 fixture 없음. TS가 export 결과를 읽기는 하지만(`runExport`) 앱이 쓰는 필드는 `output`과 `external` 개수뿐이고, CLI 통합 테스트가 envelope를 검증한다(§11 'Exception').

## 규약 영향

- ARCHITECTURE §1 'Conventions'·'Agent rules'·`doan check` 규칙: 바뀌지 않는다. 새 check 규칙 없음.
- 가이드(`skill.md`): 명령 목록에 `doan export` 한 줄과 "Run it only when the user asks to export or share a canvas as a file; never write the result inside .doan/." 같은 뜻의 문장. 결과에 `external`이 있으면 사용자에게 인터넷이 필요하다고, `links`가 있으면 그 링크는 결과 파일에서 동작하지 않는다고 말하라는 한 줄. 문구는 T 단계에서 정하고 `skill_test.go`가 고정한다.

## 결정 영향

- **serving scope**: 바꾸지 않고 재사용한다. export가 넣을 수 있는 파일 = 앱 서버가 내줄 수 있는 파일. 범위를 넓히지 않는다.
- **sandbox iframe**: viewer도 `allow-scripts`만 있는 iframe이다. 같은 이유로 캔버스 스크립트를 shell에서 떼어 놓는다.
- **Doan은 git 명령을 하지 않는다**(PRODUCT §3 Out of scope 6): 휴지통 옮기기는 파일 시스템 동작이고 git을 부르지 않는다. 커밋은 사람이나 에이전트가 한다.
- **앱은 캔버스 파일을 고치지 않는다**(PRODUCT §3 Out of scope 1·7): 휴지통 옮기기가 첫 예외다. 사람이 고른 행 하나를, 경고를 확인한 뒤, 되살릴 수 있게 옮기는 동작으로 한정한다. 앱은 캔버스 내용을 쓰지 않는다. Z에서 PRODUCT §3 7에 예외로 적는다. §3 1('그리기 도구가 아님')은 이 기능과 관계없다.
- **댓글은 append-only**(ARCHITECTURE §2): 파일 전체를 휴지통으로 옮길 뿐 이벤트를 쓰거나 지우지 않는다. 앱이 댓글 이벤트를 만들지 않는다는 규칙(PRODUCT §5 item 5)은 그대로다.
- **공유는 git으로**(PRODUCT §3 Out of scope 5): export는 사람이 직접 보내는 파일이다. 서버·호스팅·동기화는 여전히 없다. Z에서 §3 5에 export를 공유 수단의 예외로 적는다.
- **Settings and comments are never served**: export는 댓글·설정을 넣지 않는다(scope가 뺀다).

## PoC 의존

- 없음으로 본다. 기대는 Chromium에서 확인된 기능(`srcdoc`, sandbox iframe의 opaque origin `postMessage`, data URI 폰트와 `@import`)에 기댄다. Safari에서 같은지는 아직 확인하지 않았다. Safari에서 이 구조가 동작하지 않으면 viewer 설계를 바꿔야 하므로, `assemble`이 생기면 바로 결과 파일 하나를 실제 Safari로 먼저 열어 본다(tasks T5). `/runtime-test`(T13)에서 Electron의 Chromium과 실제 Safari로 결과 파일을 열어 보고(Safari는 스크린샷), Firefox는 BACKLOG 'Not verified in the real app'에 적는다(Z).
- `shell.trashItem`의 macOS 동작(같은 이름 충돌 처리, Finder Put Back이 되는지)은 확인되지 않았다. 문구는 Put Back을 약속하지 않는다. `/runtime-test`에서 격리 repo의 파일로 한 번 확인한다. 실제 사용자 휴지통에 들어가므로 probe는 임시 repo의 임시 파일만 옮긴다.

## `/agent-eval`

- 가이드와 CLI가 바뀌므로 AGENTS.md 'Workflow'대로 `/agent-eval`을 돈다.
- 가이드가 에이전트에게 export를 가르치므로 새 시나리오 하나(`X1`, id는 T11에서 기존 id와 겹치지 않게 정한다): seed repo의 캔버스 하나와 `.doan/assets/` 이미지, token CSS. 프롬프트 "이 캔버스를 데스크톱에 공유할 HTML 파일로 내보내 줘"에 해당하는 요청. 검사: `doan export` 호출(`ctx.calls`), 출력 파일이 repo 밖에 있고 repo 상대 참조가 남지 않음, repo 작업 트리에 변경 없음, 에이전트가 HTML을 손으로 합치지 않음.
- 삭제는 CLI·가이드가 바뀌지 않으므로 시나리오가 없다.
- 기존 시나리오는 가이드 줄 하나가 더해질 뿐이라 기존 round와 비교만 한다(새 시나리오 round에서 같이 돈다).

## 알려진 한계

- tokenizer 기반 다시 쓰기는 문맥을 모른다: SVG 안 `<style>`의 `url()`도 CSS로 다시 쓴다(보통 맞다).
- JS가 읽는 로컬 파일(`fetch`, 동적 `import`, 상대 module `import`)은 따라가지 않는다.
- CSS 파일 안 `@import`·`url()`이 가리키는 없는 파일은 결과에서도 실패한다(앱과 같다).
- 휴지통 옮기기의 확인과 실행 사이 경로 교체는 막지 않는다(경로만 받는 API).
- 결과 파일을 Firefox에서 연 결과는 확인하지 않는다.
- `doan export` 프로세스가 kill되면 출력 디렉터리에 임시 파일(`.<stem>.html.doan-*`)이 남을 수 있다.
