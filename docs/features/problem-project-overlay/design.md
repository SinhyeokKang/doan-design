# problem-project-overlay — design

## 1. 영향 받는 구성 요소

- **app renderer**
  - `App.tsx`
    - 어떤 본문을 보일지: 지금 `healthyOverview`(`list`이고 캔버스가 닫힘)와 `keptOverview`(열려 있다 문제로 바뀜)로 정하는 Overview 표시를, "workspace 화면이고 불러온 root가 있고 캔버스가 닫혀 있으면 Overview"로 바꾼다. 문제나 읽는 중인 root도 Overview를 그린다(§4.1).
    - status band(`ProblemActions` 호출, `with-status` 클래스와 grid 행)를 없애고, 본문 패널 위 오버레이를 그린다. Overview일 때는 `.ov-main`과 `.right-stack`을, 캔버스 페이지일 때는 `.doan-canvas-panel`과 `.doan-conv-column`을 덮는다(§4.3).
    - `CanvasPane`의 `problemMessage`와 그 `.canvas-status` 분기를 없앤다. `state.status`(캔버스 읽기 실패 등) 분기는 그대로다.
    - Overview에 넘기는 `unavailable`(입력창 이유 줄, `startErrorView("project_not_open")`)을 넘기지 않는다. 입력창은 오버레이 뒤에서 inert다. Send를 막는 판단(`healthy`)은 `entry.kind === "list"`로 남는다.
    - `toggleProject`: 열려 있지 않은 문제 프로젝트 행이 펼치기만 하던 분기(`selected?.kind !== "list" && selected?.kind !== "loading"`)를, 다른 행처럼 `openWorkspace`로 그 root를 여는 것으로 바꾼다(§4.5). `openWorkspace`가 문제 root를 받아들이는지 `/tdd` 전에 코드에서 확인한다.
    - 오버레이가 문제 종류로 나타날 때 제목에 포커스를 준다. 읽는 중에는 포커스를 옮기지 않는다(§4.4).
  - `Home.tsx` `ProblemActions`: 지울 수 있는지(다른 사용처가 없는지) 확인하고 지운다. 지금 `App.tsx`만 쓴다. `Home.test.tsx`, `App.settings.test.tsx`, `App.autoWorktrees.test.tsx`가 band를 찾으므로 고친다.
  - 새 컴포넌트 `ProblemOverlay.tsx`: 오버레이와 가운데 scene(아이콘, 제목, 설명, 동작, Details 블록) 또는 읽는 중 줄. 순수 함수 `problemView`(§6)의 결과만 그린다.
  - `ShellSidebar.tsx`: 프로젝트 행의 `shell-problem` 글자를 `row-slot` 안 종류 아이콘(문제) 또는 spinner(읽는 중)로 바꾸고, Radix `Tooltip`으로 제목을 보인다. 펼친 문제 프로젝트의 `shell-empty` 줄을 없앤다(그룹 자리에는 아무것도 없다). 문제 아이콘이 있으면 `SlotMark`(대화 상태)를 그리지 않는다.
  - `styles.css`: `.ws-recovery`·`.ws-status`·`.ws-detail`·`.workspace.with-status` 규칙과 `.shell-problem` 규칙을 지우고(다른 사용처 확인 뒤), 오버레이 규칙을 더한다(§4.3). 오버레이의 `prefers-reduced-transparency: reduce` 대체를 둔다.
- **main**: 바뀌지 않는다. 문제 종류, 회복 처리기, `FolderEntry` 모양이 그대로다.
- **CLI·skills·formats**: 바뀌지 않는다.

## 2. 지금 있는 데이터 (2026-11-07 main 기준)

| 사실 | 출처 |
|---|---|
| 문제 종류와 chip | `FolderEntry.kind`(`loading`, `notFound`, `uninitialized`, `error`, `cliError`, `list`), `homeCards.ts` `cardRow(entry, null, null).chip`("Reading", "Missing", "Not set up", "Config error", "CLI error") |
| 동작 목록 | `cardRow(...).actions`: Missing `locate, remove`, Not set up `setUp, remove`, Config error `showInFinder, retry, details`, CLI error `retry, remove`, Reading 없음. 이름은 `ROW_ACTION_LABELS` |
| Config error 상세 | `cardRow(...).detail`(= `entry.message`) |
| 회복 처리기 | `App.tsx` `action(name, root)`. Remove는 확인 alert(`removalConfirm`)를 거친다 |
| 경로 표기 | `projectDisplay.ts` `displayPath(path, homeDirectory)` |
| 프로젝트 이름 | `App.tsx`의 `card?.name ?? name`(band가 쓰는 값), Overview는 `projectLabel(root)` |
| 읽는 중 지연 | `LOADING_DELAY_MS` 300(`CanvasConversationList.tsx`, `ConversationThread.tsx`) |
| 사이드바 상태 칸 | `ShellSidebar.tsx` `SlotMark`(`row-slot` permission/working/unseen), `shell-problem`(chip 글자), `shell-empty`(펼친 문제 프로젝트의 chip 글자) |

## 3. 결정 (사용자, 2026-11-07, `problem-project.html` 검토)

- **Q1 배치**: band를 없애고, Overview를 그대로 그린 위에 블러 오버레이를 덮는다. 오버레이 가운데가 band의 역할을 맡는다.
- **Q2 들어갈 때**: 문제 프로젝트에 새로 들어가도 빈 캔버스 페이지가 아니라 Overview + 오버레이다. 지금의 problem screen이 사라진다.
- **Q3 가운데 모양**: 컨테이너 없음. 온보딩 scene의 열(최대 560, 가운데 정렬)을 따르되 제목은 Settings 페이지 제목 크기(`--type-heading-*`, 500). 제목 위 32px 종류 아이콘(선 1.5, `--text-subtle`), 버튼은 sm.
- **Q4 문구**: 제목은 프로젝트 이름으로 시작하는 한 틀, 모든 종류에 원인과 회복을 말하는 설명 줄(§4.2 표).
- **Q5 버튼**: 주 동작 하나만 채우고 맨 앞. Remove from Doan은 ghost, Go Home은 없앤다(사이드바에 Home이 있다). Config error는 Retry, Show in Finder(`subtle`), Details.
- **Q6 읽는 중**: 300 ms 뒤에만, 블러 없이 불투명 패널에 spinner와 작은 글자.
- **Q7 포커스**: 오버레이가 나타나면 제목으로.
- **Q8 투명도 줄이기**: 불투명 흰 패널.
- **Q9 아이콘**: 종류별 아이콘(FolderX, FolderCog, FileWarning, SquareTerminal).
- **Q10 사이드바**: 행 끝 글자 대신 종류 아이콘, tooltip과 접근 가능한 이름은 오버레이 제목. 아래 줄은 없앤다.
- **Q11 캔버스 페이지**: 열린 캔버스의 프로젝트가 문제로 바뀌면 캔버스 페이지 위에 같은 오버레이.
- **Q12 문제 행 누르기**: 열려 있지 않은 문제 프로젝트 행을 누르면 그 Overview + 오버레이.
- **Q13 worktree 전환**: 오버레이는 Overview 헤더까지 덮고, worktree 전환은 사이드바 프로젝트 메뉴로 한다.

## 4. 설계

### 4.1 어떤 본문이 보이나

| workspace 상태 | 본문 | 오버레이 |
|---|---|---|
| root `list`, 캔버스 닫힘 | Overview | 없음 |
| root `list`, 캔버스 열림 | 캔버스 페이지 | 없음 |
| root 문제, 캔버스 닫힘 | Overview | 문제 scene |
| root 문제, 캔버스 열림 | 캔버스 페이지(마지막으로 그린 상태) | 문제 scene |
| root `loading`, 300 ms 전 | 위 규칙의 본문 | 없음 |
| root `loading`, 300 ms 뒤 | 위 규칙의 본문 | 읽는 중(불투명) |

- 문제 root의 Overview는 대화 목록을 지금처럼 읽는다(대화 기록은 userData에 있어 폴더와 상관없다). 읽지 못해도 오버레이가 덮으므로 따로 처리하지 않는다.
- 캔버스 페이지에서 문제로 바뀐 root는 캔버스를 다시 읽지 않는다. 지금 band가 뜰 때와 같다.
- 실행 시 문제 root면 Home에서 시작하는 규칙(PRODUCT §5 item 1)은 그대로다.

### 4.2 문제 종류별 내용

문구는 `clarify` preset 기준으로 초안에서 사용자가 확정했다. `<name>`은 프로젝트 이름, `<path>`는 `displayPath` 결과로 code chip이다.

| kind | 아이콘(lucide) | 제목 | 설명 줄 | 동작(순서, 변형) |
|---|---|---|---|---|
| `notFound` | FolderX | `<name> is missing` | `<path>` was moved or deleted. | Locate(prominent), Remove from Doan(ghost) |
| `uninitialized` | FolderCog | `<name> isn’t set up` | Set it up to use Doan in this folder. | Set Up(prominent), Remove from Doan(ghost) |
| `error` | FileWarning | `Doan couldn’t read <name>’s configuration` | `.doan/config.json` has an error. Fix it, then retry. | Retry(prominent), Show in Finder(subtle), Details(ghost, 토글) |
| `cliError` | SquareTerminal | `Doan couldn’t read <name>` | The doan command failed while reading it. Try again. | Retry(prominent), Remove from Doan(ghost) |
| `loading` | spinner 16 | — | Reading project | 없음 |

- 동작의 집합은 `cardRow(...).actions`와 같다. 순서와 변형만 이 표를 따른다. `/tdd`에서 kind마다 집합이 같음을 고정한다.
- Details 버튼은 `aria-expanded`를 가진 토글이고 이름 뒤에 ▸/▾를 붙인다(지금과 같다). 펼치면 버튼 줄 아래 상세 블록(Project Settings의 `.project-settings-details`와 같은 inset 바탕, caption, `--text-subtle`)에 `entry.message`를 보인다. 펼침 상태는 root마다 하나이고, root가 바뀌거나 kind가 바뀌면 닫힌다.
- 사이드바 아이콘의 tooltip과 `aria-label`은 제목과 같다. 읽는 중이면 `Reading <name>`이다.

### 4.3 오버레이 모양과 층

- **덮는 범위**: workspace grid의 본문 열 두 개(2/4), 본문 행. `margin-left: var(--space-2)`와 `--radius-container`로 본문 패널과 같은 모양이다. 헤더(`.shell-top`)와 사이드바 열은 덮지 않는다.
- **바탕**: `color-mix(in srgb, var(--surface-panel) 60%, transparent)`와 `backdrop-filter: blur(var(--blur-sm))`. `@media (prefers-reduced-transparency: reduce)`에서는 `--surface-panel`과 `backdrop-filter: none`. 읽는 중은 항상 `--surface-panel`이다.
- **가운데 scene**: 최대 폭 560, 좌우 `--space-6`. 아이콘 32(이 화면의 상수, 아이콘 token에 32가 없다) 아래 `--space-4`, 제목(`.ob-heading`의 가운데 정렬과 12px 간격을 쓰고 크기는 `--type-heading-*`) 아래 `--space-6`, 버튼 줄(sm, 간격 `--space-2`, 줄바꿈 허용). 오버레이 위의 `subtle` 버튼은 쉬는 상태 바탕을 `--affordance-backdrop-hover`로 둔다(온보딩 overlay 규칙과 같다, `styles.css` `.ob-overlay:not(.ob-welcome) .ob-scene .doan-button[data-ui-variant="subtle"]`).
- **층**: 오버레이는 본문과 폭 조절 handle 위, toast와 portal 메뉴·tooltip 아래여야 한다. 지금 값은 `.ov` 1, Home 대화 strip 2, `.doan-panel-handle` 4, `.toast` 6, portal wrapper 안 `.doan-floating` 50(`ds/surfaces.css`)이다. 그래서 오버레이는 5다(§9 2026-11-02 항목). 사이드바 프로젝트 메뉴(portal)와 toast가 오버레이 위에 그려지는지 `/runtime-test`에서 screenshot으로 본다.
- **inert**: 오버레이가 보이는 동안 덮인 본문 요소(`.ov-main`, `.right-stack`, `.doan-canvas-panel`, `.doan-conv-column`, Overview의 resize handle)에 `inert`를 둔다. 캔버스 페이지는 이미 Overview 아래에서 `inert`를 쓴다(`CanvasPane` `covered`).
- **정해진 상수**: 아이콘 32px와 선 두께 1.5는 이 화면의 component constant다(DESIGN 'Tokens first'). 32는 `--size-control-sm`과 값이 같지만 컨트롤 크기라 쓰지 않는다. 승격 때 DESIGN.md에 적는다.

### 4.4 포커스와 알림

- 문제 종류로 오버레이가 나타나거나 kind가 바뀌면 제목(`h2`, `tabIndex=-1`)에 포커스를 준다. 프로그램 포커스라 링은 보이지 않는다.
- 덮이기 전에 포커스가 본문 안(입력창 등)에 있었으면 그 포커스는 inert로 사라지므로, 제목으로 옮기는 것이 포커스를 잃지 않게 한다. 입력창에 쓰던 글이 초안으로 남는지 `/tdd` 전에 코드에서 확인하고, 남지 않으면 사용자에게 다시 묻는다.
- 읽는 중 줄은 `role="status"`로 알리고 포커스를 옮기지 않는다.
- 문제가 풀려 오버레이가 사라질 때 포커스가 제목이나 버튼에 있었으면, Overview는 입력창으로, 캔버스 페이지는 캔버스 영역(`viewport`)으로 보낸다. 지금 `focusCurrent` 대체 목록과 맞춘다.
- Remove from Doan의 alert가 닫히면 지금처럼 그 버튼으로 돌아간다. root가 사라지면 Home으로 간다(지금 규칙).

### 4.5 사이드바

- 프로젝트 행: 문제면 `row-slot`에 종류 아이콘(16, `--text-subtle`), 읽는 중이면 spinner(14). 둘 다 `role="img"`와 제목 문장 `aria-label`, Radix `Tooltip`의 내용도 같은 문장이다. 이때 `SlotMark`는 그리지 않는다.
- 펼친 문제 프로젝트는 그룹 자리에 아무것도 그리지 않는다(`shell-empty` 줄 삭제).
- 열려 있지 않은 문제 프로젝트 행 누르기: 다른 행처럼 그 root의 workspace를 연다(Overview + 오버레이). 행의 … 메뉴(회복 동작, worktree 목록, Project Settings)는 그대로다.
- 대화 상태 slot을 누르면 그 대화로 가는 동작(`askSlot`)은 문제 root에서도 그대로다. 오버레이가 덮을 뿐이다.

### 4.6 지우는 것

`ProblemActions`와 `.ws-*` 규칙, `.workspace.with-status` grid 행, `CanvasPane`의 `problemMessage`, Overview의 `unavailable` 입력창 줄(문제 root 경우), `shell-problem`, 문제 행의 `shell-empty`. 각각 다른 사용처가 없는지 `rg`로 확인한 뒤 지운다(예: `rg -n "ws-status|ws-recovery|ws-detail|with-status|shell-problem" app/src`).

## 5. 초안

`.doan/canvases/problem-project.html`(id `problem-project`, `doan:width` 1440). 지금 프레임: `overlay-missing`, `overlay-not-set-up`, `overlay-config-error`, `overlay-config-error-details`, `overlay-cli-error`, `overlay-reading`, `overlay-reduced-transparency`, `overlay-narrow`. 바탕은 실제 앱에서 뜬 Overview DOM이다.

보강할 프레임(`/design-draft problem-project-overlay --revise`, tasks T1):

| frame id | 그릴 것 | implements |
|---|---|---|
| `overlay-canvas-page` | 열린 캔버스의 프로젝트가 Missing으로 바뀐 캔버스 페이지 위 오버레이(Q11). 캔버스 영역과 대화 패널을 덮고 헤더·사이드바는 그대로 | `app/src/renderer/App.tsx` |
| `sidebar-states` | 사이드바 프로젝트 행의 종류별 아이콘 네 개와 spinner, 문제 아이콘이 대화 상태 표시를 이긴 행, 펼친 문제 프로젝트(그룹 자리 비어 있음) | `app/src/renderer/ShellSidebar.tsx` |
| `overlay-focus` | 제목 포커스(링 없음), 주 동작 focus ring, Details 버튼 focus | `app/src/renderer/App.tsx` |

`/design-sync`는 확정된 모든 프레임의 오버레이·scene·사이드바 행을 맞춘다. 셸은 맥락이다.

## 6. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수(제안 이름) | 입력 → 출력 | 사례 |
|---|---|---|
| `problemView(entry, name, homeDirectory)` (`problemView.ts`) | `FolderEntry`, 프로젝트 이름 → `null`(`list`) 또는 `{ kind: "reading", label }` 또는 `{ kind: "problem", icon, heading, line: { path?, text }, actions: { name, variant }[], detail? }` | kind 다섯 개의 아이콘·제목·설명 줄(§4.2 표), `notFound`의 `displayPath`(HOME 밖 경로 포함), 동작 집합이 `cardRow(...).actions`와 같음, 순서와 변형(주 동작 하나만 prominent), `error`만 `detail`, Go Home 없음, `list`는 `null` |
| `overlayState(entry, slow)` | entry와 300 ms가 지났는지 → `"none" \| "reading" \| "problem"` | `list` → none, `loading`+`!slow` → none, `loading`+`slow` → reading, 문제 kind → problem |
| `workspaceBody(screen, root, open)` | workspace인지, 불러온 root, 열린 캔버스 → `"overview" \| "canvas" \| null` | 문제·읽는 중 root도 Overview(지금 `healthyOverview`·`keptOverview` 대체), 캔버스 열림이면 canvas, workspace가 아니면 null |
| `sidebarSlot(entry, name, conversationSlot)` | 행의 entry, 이름, 대화 slot → `{ kind: "problem", icon, label } \| { kind: "reading", label } \| conversationSlot \| null` | 문제가 대화 slot을 이김, 읽는 중, `list`면 대화 slot 그대로, 둘 다 없으면 null |
| `problemRowOpens(entry)` | 사이드바 행 누르기가 workspace를 여는지 | 문제 kind도 연다(Q12), `loading`은 지금처럼 연다 |

포커스 이동, inert, 300 ms 타이머는 I/O를 가진 shell이다. 타이머는 `CanvasConversationList`의 slow 규칙과 같은 꼴로 둔다.

## 7. 형식 변경

없다. JSON Schema(ARCHITECTURE §11), 형식 버전 `v`, 공유 fixture, `ui-state.json`, CLI 결과, main IPC가 그대로다.

## 8. Conventions·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없다.
- 구조 결정: 서빙 범위, sandbox iframe, append-only 이벤트, git 명령 없음에 영향이 없다. 회복은 기존 처리기만 부른다.
- PRODUCT §5 item 1(문제 행이 작업 화면을 열지 않음, 펼친 문제 프로젝트의 status line, 불러온 workspace의 status strip과 Go Home, Remove from Doan의 workspace status line 진입점)과 item 3 'Problem states'를 이 문서의 규칙으로 고친다. 승격 task에서 한다.
- DESIGN.md: 'Projects home'의 Status line·Strip actions·Config error details 측정값, 'Intended exceptions'의 'Subtle buttons on inset bands', 'Status pill'의 workspace status line 언급, 'Shell layout'(band 행)을 고친다. 오버레이와 사이드바 아이콘의 측정값을 더한다.
- `/agent-eval`: 필요 없다.

## 9. POSTMORTEM에서 가져온 함정

- **2026-11-02 — Every Overview menu opened under the Overview itself.** Prevention: "give any new stacking layer (a positioned element with a z-index) a check against portalled menus, and open at least one portalled menu on that screen in its runtime probe, judged by screenshot." → 오버레이는 새 층이다. 사이드바 프로젝트 메뉴와 tooltip이 오버레이 위에 그려지는지 screenshot으로 본다(§4.3).
- **2026-11-03 — A canvas row menu closed by Esc dropped focus to the page body.** Prevention: 프로그램 포커스를 받는 요소는 `display: none`/`visibility: hidden`으로 숨기지 않는다. → 오버레이 제목은 포커스 대상이다. 오버레이가 사라질 때 포커스 이동을 먼저 하고 지운다(§4.4).
- **2026-11-03 — Locate on the Project Settings page closed the page instead of following the moved worktree.** Prevention: main 이벤트의 선택 필드(`FolderFocus`)에 기대는 동작은 그것을 보내는 모든 경로를 테스트로 고정한다. → 오버레이의 Locate·Set Up은 같은 처리기라 같은 `FolderFocus`를 받는다. App 테스트로 Locate 뒤 새 root에서 오버레이가 사라지고 Overview가 보이는지 고정한다.
- **2026-10-25 — Locating a project kept the old root's selection.** Prevention: root를 버리는 경로는 그 root로 키를 둔 상태를 지운다. → Details 펼침 상태는 root마다 하나이므로 root가 바뀌면 버린다(§4.2).
- **2026-10-24 — Focus did not return to the row when Set Up… closed from outside.** Prevention: 열린 modal 뒤의 내용에 포커스를 주지 않는다. → Set Up 양식이나 Remove alert가 열려 있는 동안 오버레이 제목 포커스를 미룬다.
- **2026-11-07 — Radix added an open tooltip's id to an unavailable control's own description.** → 사이드바 아이콘은 `aria-label`만 갖고 자기 `aria-describedby`가 없으므로 해당하지 않는다. tooltip이 열린 상태의 속성을 테스트에서 한 번 본다.

## 10. PoC 의존

없다. `backdrop-filter`는 불투명한 본문 패널 위에서 이미 쓰인다(floating 메뉴의 유리, DESIGN 'Floating material'). 사이드바 열(투명, native vibrancy 위)은 덮지 않으므로 그 위에서 블러가 듣지 않는 문제와 상관없다. 본문 패널 전체 넓이의 블러 비용은 재지 않았다. `/runtime-test`에서 스크롤·창 크기 변경 중 끊김을 눈으로 본다.
