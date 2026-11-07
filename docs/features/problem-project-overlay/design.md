# problem-project-overlay — design

## 1. 영향 받는 구성 요소

- **app renderer**
  - `CanvasController.ts`
    - `openWorkspace`는 지금 `list`가 아니면 `unavailable`만 부르고, `enterWorkspace`도 `list`가 아니면 돌아간다(`CanvasController.ts:608-621`). Overview로 들어가는 경우(`overview = true`)에는 문제 root도 들어가게 바꾼다: 캔버스 상태를 비우고 `entered`를 부른다. 캔버스를 여는 경로는 지금처럼 `list`만 받는다. `loading`은 지금처럼 기다린다.
    - 문제 문장 "The project … is missing. Use Locate above."·"Use Set Up above."(`CanvasController.ts:494-495`)를 지운다. band가 없어지기 때문이다.
    - App 테스트 harness는 `openWorkspace`를 항상 `done(root)`로 mock한다(`App.autoWorktrees.test.tsx:59`). 그래서 이 변경은 `CanvasController.test.ts`로 고정한다.
  - `App.tsx`
    - 어떤 본문을 보일지: 지금 `healthyOverview`(`list`이고 캔버스가 닫힘)와 `keptOverview`(열려 있다 문제로 바뀜)로 정하는 Overview 표시를 `workspaceBody`(§6)로 바꾼다. 문제나 읽는 중인 root도 Overview를 그린다(§4.1).
    - status band(`ProblemActions` 호출, `with-status` 클래스와 grid 행)를 없애고, 본문 패널 위 오버레이를 그린다(§4.3).
    - 대화 strip 조건(`App.tsx:1893`, `overview === null && entry?.kind !== "list"`)을 "문제나 읽는 중 root"로 바꾼다. 그러면 문제 root의 Overview 위에서도 strip이 남는다. 오버레이가 보이는 동안 strip의 Open은 그리지 않는다(§4.3).
    - `CanvasPane`의 `problemMessage`와 그 `.canvas-status` 분기를 없앤다. `state.status`(캔버스 읽기 실패 등) 분기는 그대로다. 오버레이가 보이는 동안 문제 kind에서 온 `state.error` notice(`App.tsx:2081`)를 그리지 않는다.
    - Overview에 넘기는 `unavailable`(입력창 이유 줄, `startErrorView("project_not_open")`)을 넘기지 않는다. 입력창은 오버레이 뒤에서 inert다. Send를 막는 판단(`healthy`)은 `entry.kind === "list"`로 남는다.
    - 입력 막기(§4.3 '입력'): 오버레이가 보이면 `setMenuState`(`App.tsx:1678`)와 `toolPage`(`App.tsx:1577`), `onViewCommand`(`App.tsx:471`)가 덮인 본문을 노리지 않게 한다.
    - seen(§4.1): 오버레이가 보이는 동안 `overviewRun.show(null)`을 보내고, 캔버스 패널과 `homeRun.visit`의 seen 판단을 끈다.
    - `toggleProject`: 열려 있지 않은 문제 프로젝트 행이 펼치기만 하던 분기(`App.tsx:805`, `selected?.kind !== "list" && selected?.kind !== "loading"`)를 지운다. 그러면 다른 행처럼 `openWorkspace`로 그 root를 연다. 불러온 문제 프로젝트 행(`loadedProjectRow`, `App.tsx:783-791`)은 오버레이가 보이면 제목에 포커스를 주고 `askSlot`을 부르지 않는다(§4.5).
    - 포커스: workspace 진입 포커스 effect(`App.tsx:507-522`)가 오버레이가 보이면 제목을 먼저 고른다. 오버레이가 사라질 때와 Set Up 양식이 닫힐 때는 `resolvedFocus`로 보낸다(§4.4).
  - `Home.tsx` `ProblemActions`: 지금 `App.tsx`만 쓴다. 지운다.
  - 새 컴포넌트 `ProblemOverlay.tsx`: 오버레이와 가운데 scene(아이콘, 제목, 설명, 동작, Details 블록), 읽는 중 줄, polite live region. 순수 함수 `problemView`(§6)의 결과만 그린다.
  - `ShellSidebar.tsx`
    - 프로젝트 행의 `shell-problem` 글자를 `row-slot` 안 종류 아이콘(문제)이나 spinner(읽는 중)로 바꾼다. 무엇을 그릴지는 `sidebarSlot`(§6)이 정한다.
    - 행 `aria-describedby`가 제목 문장을 담은 sr-only 요소를 가리킨다. 캔버스 행의 선례(`ShellSidebar.tsx:346`)와 같다. 아이콘은 `aria-hidden`이고 Radix `Tooltip`으로 같은 문장을 보인다.
    - 펼친 문제 프로젝트의 `shell-empty` 분기(`ShellSidebar.tsx:353`)를 지우고, 문제 행에서는 `aria-expanded`와 빈 `role="group"`을 빼낸다.
    - 프로젝트 메뉴의 Overview 항목(`ShellSidebar.tsx:331`, 지금 `menuEntry.kind !== "list"`면 비활성)을 문제 root에서도 켠다.
  - `styles.css`
    - 지운다: `.ws-recovery`·`.ws-status`·`.ws-detail`·`.workspace.with-status` 규칙(`.workspace.with-status.with-strip` 포함).
    - 남긴다: `.shell-problem`(`ProjectOverview.tsx:344` worktree 메뉴 chip이 쓴다), `.shell-empty`(빈 그룹 문구가 쓴다, `ShellSidebar.tsx:351`).
    - 더한다: 오버레이 규칙(§4.3), `prefers-reduced-transparency: reduce` 대체, 사이드바 아이콘. 사이드바를 숨겼을 때의 margin·motion 규칙(`styles.css:1422`, `1424`, `1427`)에 오버레이를 더한다.
    - 클래스 이름은 `.overlay`를 피한다. 캔버스 overlay(`styles.css:71`)와 capture-snapshot 숨김(`:86`)이 이미 쓴다. `.problem-overlay`를 쓴다.
  - 테스트
    - 고친다: `App.settings.test.tsx`, `App.autoWorktrees.test.tsx`(band를 찾음), `App.conversationPanel.test.tsx:142`(`canvasPage()`가 notFound root에서 Overview가 없다고 전제), `ShellSidebar.test.tsx:167-171`(문제 프로젝트 status line), `CanvasController.test.ts:621`("Use Locate above").
    - 지운다: `Home.test.tsx:191-194`(`ProblemActions` 자체를 검사).
- **main**: 바뀌지 않는다. 문제 종류, 회복 처리기, `FolderEntry` 모양이 그대로다.
- **CLI·skills·formats**: 바뀌지 않는다.

## 2. 지금 있는 데이터 (2026-11-07 main 기준)

| 사실 | 출처 |
|---|---|
| 문제 종류와 chip | `FolderEntry.kind`(`loading`, `notFound`, `uninitialized`, `error`, `cliError`, `list`), `homeCards.ts` `cardRow(entry, null, null).chip`("Reading", "Missing", "Not set up", "Config error", "CLI error") |
| 동작 목록 | `cardRow(...).actions`: Missing `locate, remove`, Not set up `setUp, remove`, Config error `showInFinder, retry, details`, CLI error `retry, remove`, Reading 없음. 이름은 `ROW_ACTION_LABELS` |
| Config error 상세 | `cardRow(...).detail`(= `entry.message`) |
| 회복 처리기 | `App.tsx` `action(name, root)`. Remove는 확인 alert(`removalConfirm`)를 거친다 |
| 회복 중 상태 | main `reopen`이 entry를 곧바로 `loading`으로 바꾼다(`main/shell.ts:357-363`) |
| 경로 표기 | `projectDisplay.ts` `displayPath(path, homeDirectory)` |
| 프로젝트 이름 | `projectLabel(root)`(`App.tsx:1835`, 사이드바의 `card.name`과 같은 값). band가 쓰던 `name`(`App.tsx:1833`)은 `state.open?.folder ?? entries[0]`에서 나와 `loadedRoot`와 상관없으므로 쓰지 않는다 |
| 읽는 중 지연 | `LOADING_DELAY_MS` 300, `ConversationThread.tsx:86`에서 export한다. `CanvasConversationList.tsx:15`의 같은 이름은 local 상수다. 새 코드는 export를 import한다 |
| 사이드바 상태 칸 | `ShellSidebar.tsx` `SlotMark`(`row-slot` permission/working/unseen), `projectSlotEntry`(카드의 모든 worktree root의 slot을 모음, `ShellSidebar.tsx:101-112`), `shell-problem`(chip 글자), `shell-empty`(펼친 문제 프로젝트의 chip 글자, 빈 그룹 문구) |
| 대화 strip | `App.tsx:1891-1893`, `styles.css:813-817`(`.workspace.with-strip`, `.strip-slot` z 2, 자기 grid 행) |
| Overview 입력창 초안 | `overviewRun.current.store.drafts`의 `draftKey`(`ProjectOverview.tsx:133-134`). inert나 unmount 뒤에도 남는다 |

## 3. 결정 (사용자, 2026-11-07)

`problem-project.html` 검토(Q1–Q10), 이 문서 작성 중 질문(Q11–Q13), `/feature-review`(Q14–Q27)에서 정했다.

- **Q1 배치**: band를 없애고, Overview를 그대로 그린 위에 블러 오버레이를 덮는다. 오버레이 가운데가 band의 역할을 맡는다.
- **Q2 들어갈 때**: 문제 프로젝트에 새로 들어가도 빈 캔버스 페이지가 아니라 Overview + 오버레이다. 지금의 problem screen이 사라진다.
- **Q3 가운데 모양**: 컨테이너 없음. 온보딩 scene의 열(최대 560, 가운데 정렬)을 따르되 제목은 Settings 페이지 제목 크기(`--type-heading-*`, 500). 제목 위 32px 종류 아이콘(선 1.5, `--text-subtle`), 버튼은 sm.
- **Q4 문구**: 제목은 프로젝트 이름으로 시작하는 한 틀, 모든 종류에 원인과 회복을 말하는 설명 줄(§4.2 표).
- **Q5 버튼**: 주 동작 하나만 채우고 맨 앞. Remove from Doan은 ghost, Go Home은 없앤다(사이드바에 Home이 있다). Config error는 Retry, Show in Finder(`subtle`), Details.
- **Q6 읽는 중**: 300 ms 뒤에만, 블러 없이 불투명 패널에 spinner와 작은 글자.
- **Q7 포커스**: 오버레이가 나타나면 제목으로. 조건은 Q20이 좁힌다.
- **Q8 투명도 줄이기**: 불투명 흰 패널.
- **Q9 아이콘**: 종류별 아이콘(FolderX, FolderCog, FileWarning, SquareTerminal).
- **Q10 사이드바**: 행 끝 글자 대신 종류 아이콘, tooltip은 오버레이 제목. 아래 줄은 없앤다. 접근 가능한 설명은 Q19를 따른다.
- **Q11 캔버스 페이지**: 열린 캔버스의 프로젝트가 문제로 바뀌면 캔버스 페이지 위에 같은 오버레이. Missing·Not set up은 Q16에 따라 캔버스가 닫힌다.
- **Q12 문제 행 누르기**: 열려 있지 않은 문제 프로젝트 행을 누르면 그 Overview + 오버레이.
- **Q13 worktree 전환**: 오버레이는 Overview 헤더까지 덮고, worktree 전환은 사이드바 프로젝트 메뉴로 한다.
- **Q14 대화 strip**: 문제 workspace에서 지금의 임시 대화 strip을 오버레이 위(덮이지 않는 자리)에 남겨 Stop, Skip, 권한 응답을 그대로 받는다. 가려진 대화로 가는 Open만 숨긴다.
- **Q15 slot 우선**: 권한 요청·질문 > 문제 아이콘 > working·unseen.
- **Q16 캔버스 Missing**: 지금 동작을 따른다. Missing·Not set up은 캔버스를 닫고 Overview + 오버레이가 된다. 캔버스 페이지 위 오버레이 프레임은 Config error로 그린다.
- **Q17 회복 중**: 오버레이가 떠 있던 뒤의 `loading`에서는 scene을 유지하고 버튼을 busy로 둔다(§4.4).
- **Q18 입력 막기**: 오버레이가 보이는 동안 덮인 본문을 노리는 메뉴와 단축키를 모두 끈다.
- **Q19 사이드바 접근성**: 행 `aria-describedby`가 제목 문장을 가리키고, 아이콘은 `aria-hidden`과 hover tooltip만 갖는다.
- **Q20 제목 포커스 조건**: 사람이 들어왔거나 포커스가 덮인 본문이나 `body`에 있을 때만 옮긴다. 그 밖에는 live region으로 알린다.
- **Q21 seen**: 오버레이가 덮는 동안 덮인 대화를 본 것으로 처리하지 않는다.
- **Q22 불러온 문제 행**: 오버레이가 덮은 Overview에서 그 행을 누르면 제목 포커스, `askSlot` 없음.
- **Q23 행 spinner**: 사이드바 읽는 중 spinner도 300 ms 뒤에만.
- **Q24 CLI error 원인**: 이번에 다루지 않는다. BACKLOG에 적는다(Show in Finder가 `.doan/`을 보이지 않는 점과 함께).
- **Q25 넘침**: 오버레이는 세로로 스크롤하고, scene은 안전 가운데 정렬이다. 최소 창 긴 이름·긴 Details 프레임을 더한다.
- **Q26 메뉴 Overview 항목**: 문제 root에서도 켜고 행 누르기와 같은 곳으로 간다.
- **Q27 오류 notice**: 오버레이가 보이는 동안 문제 kind에서 온 캔버스 영역 `state.error` notice를 숨긴다.

실행 단위는 `/orchestrate`다(tasks.md).

## 4. 설계

### 4.1 어떤 본문이 보이나

| workspace 상태 | 본문 | 오버레이 |
|---|---|---|
| root `list`, 캔버스 닫힘 | Overview | 없음 |
| root `list`, 캔버스 열림 | 캔버스 페이지 | 없음 |
| root 문제, 캔버스 닫힘 | Overview | 문제 scene |
| root `error`·`cliError`, 캔버스 열림 | 캔버스 페이지(마지막으로 그린 상태) | 문제 scene |
| root `loading`, 오버레이 없던 상태, 300 ms 전 | 위 규칙의 본문 | 없음 |
| root `loading`, 오버레이 없던 상태, 300 ms 뒤 | 위 규칙의 본문 | 읽는 중(불투명) |
| root `loading`, 문제 scene이 떠 있던 상태 | 위 규칙의 본문 | 그 문제 scene, 버튼 busy |

- "캔버스 열림"은 열린 캔버스의 folder가 불러온 root와 같을 때만이다. `loadedRoot`가 `openWorkspace` 없이 문제 root로 바뀌는 경로(`App.autoWorktrees.test.tsx:210-219`)에서 다른 root의 캔버스 위에 오버레이를 덮지 않는다.
- Missing·Not set up은 `canvasViewUpdate`가 캔버스를 닫으므로(`canvasView.ts:76-79`) "캔버스 닫힘" 행이 된다.
- 문제 root의 Overview는 대화 목록을 지금처럼 읽는다(대화 기록은 userData에 있어 폴더와 상관없다). 읽지 못해도 오버레이가 덮으므로 따로 처리하지 않는다.
- 캔버스 페이지에서 문제로 바뀐 root는 캔버스를 다시 읽지 않는다. 지금 band가 뜰 때와 같다.
- 오버레이가 보이는 동안 덮인 Overview 스레드와 캔버스 대화는 seen이 되지 않는다(`overviewRun.show(null)`, 캔버스 패널 seen 꺼짐, `homeRun.visit` 없음). 오버레이가 사라지면 지금 규칙대로 seen을 판단한다.
- 실행 시 문제 root면 Home에서 시작하는 규칙(PRODUCT §5 item 1)은 그대로다.

### 4.2 문제 종류별 내용

문구는 `clarify` preset 기준으로 초안에서 사용자가 확정했다. `<name>`은 `projectLabel(root)`, `<path>`는 `displayPath` 결과로 code chip이다.

| kind | 아이콘(lucide) | 제목 | 설명 줄 | 동작(순서, 변형) |
|---|---|---|---|---|
| `notFound` | FolderX | `<name> is missing` | `<path>` was moved or deleted. | Locate(prominent), Remove from Doan(ghost) |
| `uninitialized` | FolderCog | `<name> isn’t set up` | Set it up to use Doan in this folder. | Set Up(prominent), Remove from Doan(ghost) |
| `error` | FileWarning | `Doan couldn’t read <name>’s configuration` | `.doan/config.json` has an error. Fix it, then retry. | Retry(prominent), Show in Finder(subtle), Details(ghost, 토글) |
| `cliError` | SquareTerminal | `Doan couldn’t read <name>` | The doan command failed while reading it. Try again. | Retry(prominent), Remove from Doan(ghost) |
| `loading` | spinner 16 | — | Reading project | 없음 |

- 동작의 집합은 `cardRow(...).actions`와 같다. 순서와 변형만 이 표를 따른다. `/tdd`에서 kind마다 집합이 같음을 고정한다.
- Details 버튼은 `aria-expanded`를 가진 토글이고 이름 뒤에 ▸/▾를 붙인다(지금과 같다). 펼치면 버튼 줄 아래 상세 블록(Project Settings의 `.project-settings-details`와 같은 inset 바탕, caption, `--text-subtle`)에 `entry.message`를 보인다.
- 펼침 상태는 root마다 하나다. root가 바뀌거나 다른 문제 kind가 되면 닫힌다. 회복 중 `loading`을 거쳐 같은 kind로 돌아오면 그대로다(§4.4).
- 사이드바 아이콘의 tooltip과 행의 접근 가능한 설명은 제목과 같다. 읽는 중이면 `Reading <name>`이다.

### 4.3 오버레이 모양과 층

- **덮는 범위**: workspace grid의 본문 열 두 개(2/4), 본문 행. `margin-left: var(--space-2)`와 `--radius-container`로 본문 패널과 같은 모양이다. 앱 헤더(`.shell-top`)와 사이드바 열, 사이드바 폭 조절 handle(`.doan-sidebar-handle`)은 덮지 않는다. 캔버스 머리(Frames, 확대, Reload, 도구 줄)와 Overview·패널 폭 조절 handle은 덮는다.
- **대화 strip과 함께일 때**: strip은 자기 grid 행(`.strip-slot`, `styles.css:816`)에 있으므로 오버레이가 덮지 않는다. `with-strip`이면 오른쪽 열(`.right-stack`)이 `-3 / -1`로 strip 행까지 걸치므로(`styles.css:815`), 오버레이도 그 열에서는 같은 범위를 덮는다. 정확한 grid 배치는 초안 `overlay-with-strip` 프레임에서 정한다.
- **바탕**: `color-mix(in srgb, var(--surface-panel) 60%, transparent)`와 `backdrop-filter: blur(var(--blur-sm))`. `@media (prefers-reduced-transparency: reduce)`에서는 `--surface-panel`과 `backdrop-filter: none`. 읽는 중은 항상 `--surface-panel`이다.
- **가운데 scene**: 최대 폭 560, 좌우 `--space-6`. 아이콘 32(이 화면의 상수, 아이콘 token에 32가 없다) 아래 `--space-4`, 제목(`.ob-heading`의 가운데 정렬과 12px 간격을 쓰고 크기는 `--type-heading-*`) 아래 `--space-6`, 버튼 줄(sm, 간격 `--space-2`, 줄바꿈 허용). 오버레이 위의 `subtle` 버튼은 쉬는 상태 바탕을 `--affordance-backdrop-hover`로 둔다(온보딩 overlay 규칙과 같다, `styles.css` `.ob-overlay:not(.ob-welcome) .ob-scene .doan-button[data-ui-variant="subtle"]`).
- **넘침**: 오버레이는 `overflow-y: auto`이고 scene은 `margin-block: auto`로 가운데에 둔다. scene이 오버레이보다 길면 위에서부터 보이고 스크롤된다.
- **층**: 오버레이는 본문과 폭 조절 handle 위, toast와 portal 메뉴·tooltip 아래여야 한다. 지금 값은 `.ov` 1, Home 대화 strip 2, `.doan-panel-handle` 4, `.toast` 6, portal wrapper 안 `.doan-floating` 50(`ds/surfaces.css`), tooltip `z-50`이다. `.workspace`는 z-index가 없어 stacking context가 아니다. 그래서 오버레이는 5다(§9 2026-11-02 항목). 사이드바 프로젝트 메뉴(portal)와 toast가 오버레이 위에 그려지는지 `/runtime-test`에서 screenshot으로 본다.
- **inert**: 오버레이가 보이는 동안 덮인 본문 요소(`.ov-main`, `.right-stack`, `.doan-canvas-panel`, `.doan-conv-column`, Overview의 resize handle)에 `inert`를 둔다. 캔버스 페이지는 이미 Overview 아래에서 `inert`를 쓴다(`CanvasPane` `covered`).
- **입력**: `inert`는 window listener와 앱 메뉴를 막지 못한다. 그래서 오버레이가 보이면:
  - `setMenuState`에 `screen: "workspace"`를 보내고 `overview`를 뺀다. canvasView, pickFromCanvas, newConversation 메뉴가 꺼진다. IPC 형식은 그대로다.
  - `toolPage`를 false로 둔다. `CanvasController.keydown`의 V·H·Space·Esc 단계가 덮인 캔버스에 작동하지 않는다.
  - `onViewCommand`는 오버레이가 보이면 아무것도 하지 않는다.
  - 진행 중인 pick·capture는 오버레이가 나타날 때 취소한다.
- **정해진 상수**: 아이콘 32px와 선 두께 1.5는 이 화면의 component constant다(DESIGN 'Tokens first'). 32는 `--size-control-sm`과 값이 같지만 컨트롤 크기라 쓰지 않는다. 승격 때 DESIGN.md에 적는다.

### 4.4 포커스와 알림

- **나타날 때**: 문제 scene이 나타나거나 다른 문제 kind로 바뀌면, 다음 중 하나일 때만 제목(`h2`, `tabIndex=-1`, 설명 줄을 `aria-describedby`로 가짐)에 포커스를 준다. 프로그램 포커스라 링은 보이지 않는다.
  - 사람이 이 root로 들어왔다(사이드바 행, 메뉴의 Overview, Back/Forward). workspace 진입 포커스 effect(`App.tsx:507-522`)가 오버레이가 보이면 제목을 먼저 고른다. 지금 노리는 composer, `.wt-chip`, thread card, `workspaceFocus`는 inert라 포커스를 받지 못하기 때문이다.
  - 포커스가 덮인 본문 안이나 `body`에 있었다. inert로 사라질 포커스를 제목이 받는다.
- **그 밖의 경우**: 사이드바, 헤더, 검색에 포커스가 있거나 메뉴가 열려 있으면 포커스를 옮기지 않는다. 오버레이 안에 늘 마운트된 polite live region이 제목을 읽는다.
- **modal 중**: Set Up 양식이나 Remove alert가 열려 있는 동안에는 제목 포커스를 미룬다.
- **회복 중(Q17)**: 문제 scene이 떠 있던 뒤의 `loading`에서 scene을 유지한다. 모든 동작 버튼은 `aria-disabled`(포커스는 받음)이고, 누른 버튼에 spinner를 보인다. 결과에 따라 다음과 같다.
  - 같은 kind: 포커스를 누른 버튼에 두고, Details 펼침을 유지하고, live region이 제목을 다시 읽는다.
  - 다른 문제 kind: 제목으로 포커스를 옮기고 Details를 닫는다.
  - `list`: 아래 '사라질 때'를 따른다.
  - 회복 중 `loading`이 300 ms를 넘어도 읽는 중 패널로 바꾸지 않는다.
- **읽는 중 줄**: `role="status"`로 알리고 포커스를 옮기지 않는다.
- **사라질 때**: 문제가 풀려 오버레이가 사라질 때 포커스가 오버레이 안에 있었으면 `resolvedFocus(body)`로 보낸다. Overview면 입력창이고, 입력창이 비활성이면 `focusCurrent`다. 캔버스 페이지면 캔버스 영역(`.area`)이다. Set Up 양식이 성공으로 닫힐 때도 `modalClosed`의 `focusCurrent(previous)` 대신 같은 함수를 쓴다. 포커스 이동을 먼저 하고 오버레이를 지운다(§9 2026-11-03 Esc 항목).
- **Remove alert**: 닫히면 지금처럼 그 버튼으로 돌아간다. root가 사라지면 Home으로 간다(지금 규칙).
- Overview 입력창 초안은 `overviewRun.current.store.drafts`에 있어 inert나 unmount 뒤에도 남는다(§2).

### 4.5 사이드바

- **상태 칸**: `sidebarSlot`(§6)이 정한다. 순서는 권한 요청·질문, 문제 아이콘(16, `--text-subtle`), working, unseen이다. 대화 slot은 지금처럼 카드의 모든 worktree root에서 모은다(`projectSlotEntry`). 그래서 어느 worktree든 답을 기다리는 대화가 있으면 그 표시가 문제 아이콘을 이긴다. 읽는 중이면 `LOADING_DELAY_MS` 뒤에만 spinner(14)를 그린다. 이 spinner가 working 표시와 구분되는지는 초안 `sidebar-states`에서 사용자가 본다.
- **접근성**: 아이콘과 spinner는 `aria-hidden`이고 Radix `Tooltip`으로 제목 문장(읽는 중이면 `Reading <name>`)을 보인다. 행 treeitem은 `aria-label={card.name}`를 그대로 두고, `aria-describedby`로 같은 문장을 담은 sr-only 요소를 가리킨다.
- **펼친 문제 프로젝트**: 그룹 자리에 아무것도 그리지 않는다(`shell-empty` 분기 삭제). 그 행은 `aria-expanded`와 빈 `role="group"`을 갖지 않는다.
- **열려 있지 않은 문제 프로젝트 행 누르기**: 다른 행처럼 그 root의 workspace를 연다(Overview + 오버레이). 행의 … 메뉴(회복 동작, worktree 목록, Project Settings)는 그대로이고, Overview 항목이 문제 root에서도 켜진다.
- **불러온 문제 프로젝트 행 누르기**(`loadedProjectRow`):
  - Home이나 캔버스 페이지에서 누르면 지금처럼 그 Overview로 가고 오버레이를 보인다.
  - 오버레이가 덮은 Overview에서 누르면 제목에 포커스를 주고 `askSlot`을 부르지 않는다. 덮인 대화 선택을 바꿔도 보이지 않기 때문이다.
- **행 누르기와 대화 slot**: slot에는 별도 클릭이 없고, 행 누르기가 `noticeTarget(layout.slot)`이 있으면 `openNotice`로 간다(`ShellSidebar.tsx:301`). 문제 아이콘이 이긴 행은 `noticeTarget`이 없으므로 위 규칙대로 Overview로 간다. 권한 요청이 이긴 행은 지금처럼 그 대화로 간다.

### 4.6 지우는 것

- `ProblemActions`와 그 테스트(`Home.test.tsx:191-194`).
- `.ws-*` 규칙, `.workspace.with-status` grid 행(`with-strip` 조합 포함).
- `CanvasPane`의 `problemMessage`, `CanvasController`의 "Use Locate above."·"Use Set Up above." 문장.
- Overview의 `unavailable` 입력창 줄(문제 root 경우).
- 사이드바의 `shell-problem` 사용과 문제 행의 `shell-empty` 분기. CSS 규칙 `.shell-problem`·`.shell-empty`는 다른 사용처가 있어 남긴다(§1).

지우기 전에 다른 사용처가 없는지 코드 검색으로 확인한다.

## 5. 초안

`.doan/canvases/problem-project.html`(id `problem-project`, `doan:width` 1440). 지금 프레임: `overlay-missing`, `overlay-not-set-up`, `overlay-config-error`, `overlay-config-error-details`, `overlay-cli-error`, `overlay-reading`, `overlay-reduced-transparency`, `overlay-narrow`. 바탕은 실제 앱에서 뜬 Overview DOM이다.

보강할 프레임(`/design-draft problem-project-overlay`, tasks T1):

| frame id | 그릴 것 | implements |
|---|---|---|
| `overlay-canvas-page` | 열린 캔버스의 프로젝트가 Config error로 바뀐 캔버스 페이지 위 오버레이(Q11, Q16). 캔버스 영역(머리 포함)과 대화 패널을 덮고 앱 헤더·사이드바는 그대로 | `app/src/renderer/App.tsx` |
| `overlay-with-strip` | 문제 Overview 위 오버레이와, 덮이지 않는 대화 strip(권한 요청 상태)(Q14) | `app/src/renderer/App.tsx` |
| `overlay-retrying` | Retry를 누른 뒤의 busy 상태: scene 유지, 버튼 비활성, 누른 버튼 spinner(Q17) | `app/src/renderer/ProblemOverlay.tsx` |
| `overlay-narrow-long` | 960×600에서 긴 프로젝트 이름과 긴 Config error Details, 오버레이 스크롤(Q25) | `app/src/renderer/ProblemOverlay.tsx` |
| `sidebar-states` | 사이드바 프로젝트 행의 종류별 아이콘 네 개와 읽는 중 spinner, working 표시와 나란히 본 spinner, 권한 요청이 문제 아이콘을 이긴 행, 문제 아이콘이 working을 이긴 행, 펼친 문제 프로젝트(그룹 자리 비어 있음) | `app/src/renderer/ShellSidebar.tsx` |
| `overlay-focus` | 제목 포커스(링 없음), 주 동작 focus ring, Details 버튼 focus | `app/src/renderer/ProblemOverlay.tsx` |

`/design-sync`는 확정된 모든 프레임의 오버레이, scene, strip 배치, 사이드바 행을 맞춘다. 셸은 맥락이다. 오버레이와 사이드바 아이콘은 이 화면에서 처음 구현하는 요소이므로 `/design-sync`의 첫 구현 규칙을 따른다.

## 6. 순수 함수로 뺄 부분 (`/tdd` 대상)

모두 `problemView.ts`에 둔다.

| 함수(제안 이름) | 입력 → 출력 | 사례 |
|---|---|---|
| `problemView(entry, name, homeDirectory, { slow, shown })` | `FolderEntry`, 프로젝트 이름, 300 ms가 지났는지, 직전에 보인 오버레이(`null` \| `{ kind: "problem", entryKind }` \| `{ kind: "reading" }`) → `null` 또는 `{ kind: "reading", label }` 또는 `{ kind: "problem", entryKind, icon, heading, line: { path?, text }, actions: { name, variant }[], detail?, busy }` | kind 다섯 개의 아이콘·제목·설명 줄(§4.2 표); `notFound`의 `displayPath`(HOME 밖 경로 포함); 동작 집합이 `cardRow(...).actions`와 같음; 순서와 변형(주 동작 하나만 prominent); `error`만 `detail`; Go Home 없음; `list` → `null`; `loading` + 직전 없음 + `!slow` → `null`; `loading` + 직전 없음 + `slow` → reading; `loading` + 직전 problem → 그 problem에 `busy: true`(`slow`와 상관없음); `loading` + 직전 reading → reading; 문제 kind → problem(`busy: false`) |
| `workspaceBody(screen, root, open)` | workspace인지, 불러온 root, 열린 캔버스 → `"overview" \| "canvas" \| null` | 문제·읽는 중 root도 Overview(지금 `healthyOverview`·`keptOverview` 대체); 캔버스가 열려 있고 `open.folder === root`면 canvas; 열린 캔버스가 다른 root면 Overview; workspace가 아니면 null |
| `sidebarSlot(entry, name, conversationSlot, slow)` | 행의 entry, 이름, 대화 slot, 300 ms가 지났는지 → `{ kind: "problem", icon, label } \| { kind: "reading", label } \| conversationSlot \| null` | 권한 요청·질문 slot이 문제를 이김; 문제가 working·unseen을 이김; 읽는 중 `slow` → reading, `!slow` → 대화 slot 또는 null; `list`면 대화 slot 그대로; 둘 다 없으면 null |
| `resolvedFocus(body)` | `"overview" \| "canvas"` → 포커스 대상 이름(`"composer"` \| `"canvasArea"`) | 두 경우. 입력창이 비활성일 때의 대체는 shell이 `focusCurrent`로 한다 |

포커스 이동, inert, 300 ms 타이머, 메뉴 상태 전송은 I/O를 가진 shell이다. 타이머는 `CanvasConversationList`의 slow 규칙과 같은 꼴로 둔다.

## 7. 형식 변경

없다. JSON Schema(ARCHITECTURE §11), 형식 버전 `v`, 공유 fixture, `ui-state.json`, CLI 결과, main IPC가 그대로다. `setMenuState`는 지금 있는 값만 보낸다.

## 8. Conventions·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없다.
- 구조 결정: 서빙 범위, sandbox iframe, append-only 이벤트, git 명령 없음에 영향이 없다. 회복은 기존 처리기만 부른다.
- ARCHITECTURE §7 'Memory'의 "Problem/loading rows never enter workspaces; a loaded workspace that turns unhealthy stays with its status actions (§13)"를 바꾼다: 문제 root도 Overview로 workspace에 들어가고, 본문 위 오버레이가 회복 동작을 가진다. 캔버스는 여전히 `list` root에서만 연다. 사용자가 승인했다(2026-11-07 `/feature-review`). 승격 task에서 고친다.
- PRODUCT §5 item 1(문제 행이 작업 화면을 열지 않음, 펼친 문제 프로젝트의 status line, 불러온 workspace의 status strip과 Go Home, Remove from Doan의 workspace status line 진입점, 대화 strip 문단 L212, slot 우선순위 L213·L214, 숨긴 사이드바 점 L178)와 item 3('Problem states', worktree chip L256)을 이 문서의 규칙으로 고친다. 승격 task에서 한다.
- DESIGN.md를 고친다:
  - 'Projects home'의 Status line·Strip actions·Config error details 측정값(L498–518 주변), 'Known note'의 Locate 문장.
  - L228 'recovery strip … as ARCHITECTURE §7 requires', L386 'strip shows only on a problem workspace'.
  - 'Intended exceptions'의 'Subtle buttons on inset bands', 'Status pill'의 workspace status line 언급, 'Shell layout'(band 행).
  - 오버레이와 사이드바 아이콘의 측정값을 더한다.
- BACKLOG.md: CLI error 원인 표시와 Show in Finder의 `.doan/`(Q24)를 더한다.
- `/agent-eval`: 필요 없다.

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-02 — Every Overview menu opened under the Overview itself.** Prevention: "give any new stacking layer (a positioned element with a z-index) a check against portalled menus, and open at least one portalled menu on that screen in its runtime probe, judged by screenshot." → 오버레이는 새 층이다. 사이드바 프로젝트 메뉴, tooltip, toast가 오버레이 위에 그려지는지 screenshot으로 본다(§4.3).
- **2026-11-02 — The loaded project's row did nothing on a canvas, though PRODUCT said it opened the Overview.** Prevention: 행 누르기를 실행할 수 있는 화면을 모두 들고 각각 고정한다. → 불러온 문제 행을 Home, 캔버스 페이지, 오버레이가 덮은 Overview에서 누르는 경우를 App 테스트로 고정한다(§4.5).
- **2026-11-03 — A canvas row menu closed by Esc dropped focus to the page body.** Prevention: 프로그램 포커스를 받는 요소는 `display: none`/`visibility: hidden`으로 숨기지 않는다. → 오버레이 제목은 포커스 대상이다. 오버레이가 사라질 때 포커스 이동을 먼저 하고 지운다(§4.4).
- **2026-11-03 — Locate on the Project Settings page closed the page instead of following the moved worktree.** Prevention: main 이벤트의 선택 필드(`FolderFocus`)에 기대는 동작은 그것을 보내는 모든 경로를 테스트로 고정한다. → 오버레이의 Locate·Set Up은 같은 처리기라 같은 `FolderFocus`를 받는다. App 테스트로 Locate 뒤 새 root에서 오버레이가 사라지고 Overview가 보이는지, 새 root가 아직 문제면 그 오버레이가 보이는지 고정한다.
- **2026-11-03 — Removing the loaded workspace's project left an empty workspace instead of going Home.** Prevention: 화면마다 어디에 닿는지 App 테스트로 고정한다. → 오버레이의 Remove from Doan을 Overview와 캔버스 페이지에서 각각 고정한다.
- **2026-11-07 — Setup reported success while the project row still read Not set up.** → Set Up 성공 뒤 오버레이가 사라지고 사이드바 아이콘이 없어지는지 App 테스트와 `/runtime-test`로 본다.
- **2026-10-30 — Timing tests failed under machine load because their waits matched or beat the test limit.** → 300 ms 규칙과 회복 중 busy는 fake timer로 고정한다.
- **2026-10-25 — Locating a project kept the old root's selection.** Prevention: root를 버리는 경로는 그 root로 키를 둔 상태를 지운다. → Details 펼침 상태는 root마다 하나이므로 root가 바뀌면 버린다(§4.2).
- **2026-10-24 — Focus did not return to the row when Set Up… closed from outside.** Prevention: 열린 modal 뒤의 내용에 포커스를 주지 않는다. → Set Up 양식이나 Remove alert가 열려 있는 동안 오버레이 제목 포커스를 미룬다.
- **2026-11-07 — Radix added an open tooltip's id to an unavailable control's own description.** → 사이드바 아이콘은 `aria-hidden`이고 행의 `aria-describedby`는 sr-only 요소만 가리킨다. tooltip이 열린 상태에서 행의 `aria-describedby`가 바뀌지 않는지 테스트에서 한 번 본다.

## 10. PoC 의존

없다. `backdrop-filter`는 불투명한 본문 패널 위에서 이미 쓰인다(floating 메뉴의 유리, DESIGN 'Floating material'). 사이드바 열(투명, native vibrancy 위)은 덮지 않으므로 그 위에서 블러가 듣지 않는 문제와 상관없다. 본문 패널 전체 넓이의 블러 비용은 재지 않았다. `/runtime-test`에서 스크롤·창 크기 변경 중 끊김을 눈으로 본다.
