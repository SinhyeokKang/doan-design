# overview-tabs — design

§3은 사용자가 2026-11-07에 정한 결정이고, §4 이후는 그 결정과 같은 날 `/feature-review`에서 승인된 지적에 따른 설계다. 이 feature는 `local-doan-files`가 main에 병합된 뒤 시작한다(Q5, tasks 시작 조건). `storage` 값(`repo`·`local`·`unknown`)과 radio 이름("Include in Git" / "Keep out of Git (this Mac only)")은 그 feature의 design §2.2·§3.4에서 정해졌다. 이유 값의 이름만 그 feature의 `/tdd`를 기다리므로, 시작할 때 병합된 코드에서 확인하고 §2·§6을 고친다.

## 1. 영향 받는 구성 요소

- **app renderer**
  - `RightPanel.tsx` `CanvasConversations`: `aside.ov-right`를 flex column으로 바꾼다. 위에 고정된 머리(tablist), 아래에 스크롤되는 몸이 있고, 몸 안에 두 tabpanel이 있다(§4.1). Project 탭이 선택된 동안 Conversations 탭에 상태 표시를 붙인다(§4.8).
  - `CanvasConversationList.tsx`: `scroller` ref와 visibility observer의 root(90행 부근 `scroller.current`)가 aside가 아니라 몸 scroller를 가리킨다. `title` ref(목록이 비었을 때 포커스 대상)는 선택된 탭을 가리킨다.
  - `App.tsx`: Canvas conversations 행 Delete 뒤 포커스 대체 selector(`.ov-right .rp-head`, 1264–1265행)를 선택된 탭으로 바꾼다. workspace의 `focusCurrent` 대체 목록(409–423행)에서 사이드바 앞에 선택된 tabpanel을 넣는다. 이번 실행의 탭 기억, 문제 worktree의 Details 열림 상태(status band와 공유, §4.4)를 App이 갖는다. Project 탭에 `openProjectSettings`와 recovery 처리기 `action(name, root)`를 넘긴다.
  - `Home.tsx` `ProblemActions`: 문제 설명 줄을 새 순수 함수 `problemLine`에서 받는다(§4.4). Details 열림 상태를 자기 `useState`가 아니라 App에서 받는다.
  - 새 파일: Project 탭 본문(`ProjectInfoPanel.tsx`), 순수 함수(`projectInfo.ts`), config 읽기 hook.
  - `styles.css`: Overview 패널 머리 컨테이너에 높이(`--size-chrome`)를 두고(§10 POSTMORTEM 2026-11-02), 몸 scroller가 `native-scroll`을 갖는다. 캔버스 페이지 `ConversationPanel`도 쓰는 `.rp-head` 규칙과 `.doan-conv-head .rp-head`는 건드리지 않는다. Overview 전용 `.right.ov-right .rp-head` 규칙(1133–1134행)은 그 `<h2>`가 사라지면 맞는 요소가 없어지므로 머리 컨테이너 규칙으로 옮긴다.
- **main**: `config:read`는 이미 있고 `senderAllowed.ts` 허용 목록에 있다. 병합된 `local-doan-files`의 `FolderEntry`가 `storage`를 갖지 않으면 `view.ts` `folderEntry`에서 `storage`와 이유 값을 좁혀 넘긴다(tasks T2). main→renderer IPC 모양만 바뀌고 schema는 그대로다.
- **CLI·skills·formats**: 바뀌지 않는다. `doan ls`·`doan config` 출력, JSON Schema, app socket, `ui-state.json`, `.doan/config.json` 모두 그대로다.

## 2. 지금 있는 데이터 (2026-11-07 코드 기준)

| 사실 | 출처 | renderer에 지금 있나 |
|---|---|---|
| 경로 | `FolderEntry.path`, 표기는 `displayPath(path, homeDirectory)`(`projectDisplay.ts`) | 있음 |
| branch, detached HEAD | `FolderEntry.git.branch`/`detached`(`doan ls` `git`, Go `cli/internal/repo/git.go`). 표기는 `cardRow(entry, null, null).summary.branch`(`homeCards.ts` 72행, `detached <7자리>`) | 있음 |
| 등록된 worktree | App의 `card.rows`(Overview `worktrees` prop). `git.worktrees`는 Git이 아는 전체이고 미등록 worktree를 포함하지만, Doan은 등록된 worktree만 보인다(PRODUCT §5 item 1) | 있음 |
| 캔버스, design-system 캔버스 | `FolderEntry.canvases`의 경로. 구분은 `canvasKind`(`app/src/formats/canvasPath.ts`), Home 제안이 쓰는 방식과 같다(`homeComposer.ts` `split`) | 있음 |
| 정적 프레임 수 | `CanvasRow.frames`, `framesTruncated`(main `capFrames`, 캔버스마다 `MAX_STATIC_FRAMES` 1,000, `main/frameCap.ts`) | 있음 |
| 읽을 수 없는 캔버스 | `CanvasRow.error`. 행 문장은 `rowProblem`(`canvasTree.ts` 119행) "Can't read this canvas — run doan check" | 있음 |
| 마지막 변경 | `CanvasRow.mtimeMs`(숫자), `FolderEntry.changedAt`(main의 stat) | 있음 |
| Token CSS, Shared with canvases | `window.doan.readConfig(root)` → `doan config`(`configBridge.ts`). Project Settings가 쓴다. Overview는 아직 부르지 않는다 | IPC 있음 |
| Doan 파일 모드 | `local-doan-files`가 더할 `doan ls` `storage`(`"repo" \| "local" \| "unknown"`)와 이유 값(이름은 그 feature의 `/tdd`에서 확정, `docs/features/local-doan-files/design.md` §2.2). 2026-11-07 main의 `doan ls` 결과 키는 `canvases`, `git`, `orphans`, `root`, `scope`뿐이다 | 없음(그 feature 병합 뒤 생김) |
| 캔버스 대화의 상태 | `CanvasConversationRow.status`(`ConversationLine`에서 온 `{ kind, label }`, `canvasConversationRows.ts`). 판단은 `conversationStatus`(`overviewConversation.ts`)로, 사이드바 slot과 같은 규칙이다 | 있음 |
| 문제 worktree의 recovery | `cardRow(entry, null, null).actions`(`homeCards.ts`)와 App의 `action(name, root)`(1326행 부근). status band(`Home.tsx` `ProblemActions`)가 쓴다. 문제 설명 줄은 지금 Missing("<path> is gone or moved.")과 Not set up("<name> is not set up.")에만 있고 Config error와 CLI error에는 없다(`Home.tsx` 40행) | 있음 |
| 서빙 범위 전체 | main `FolderState.scope`(`doan ls` `scope`). renderer로 넘기지 않는다. token CSS와 공유 경로를 구분하지 못한다 | 없음 |
| 댓글 수, orphan 댓글 파일 | `doan ls` `comments`·`orphans`. main이 댓글 수를 버린다(`view.ts`: "nothing in the app shows comments") | 화면 없음 |
| Git remote | main `readGitRemotes`(`onboarding/gitConfig.ts`), onboarding 전용 | 없음 |
| 대화 | `run.listState(root)`(`ConversationSummary`) | 있음 |

## 3. 결정 (사용자, 2026-11-07)

### Q1. 탭과 이름 — 결정: "Conversations"와 "Project" 두 탭

첫 탭은 지금의 Canvas conversations 목록 그대로다. 행이 캔버스 이름과 썸네일로 시작하고 빈 상태 문구("No canvas conversations yet.")가 캔버스 대화임을 말해 준다. 탭에는 아이콘을 넣지 않는다. 최소 패널 폭 280에 상태 표시(Q8)까지 들어가는지는 `/design-draft`가 `tabs-mark`·`tabs-narrow`에서 먼저 잰다. 제목 메뉴의 "Conversations in <project>"(프로젝트 대화)와 이름이 겹치는 점은 초안에서 `clarify` preset으로 다시 본다.

### Q2. 탭 위치 — 결정: 오른쪽 패널 머리의 tablist

지금 `<h2>` 제목이 있는 56px 머리에 tablist가 들어가고, 그 아래 몸이 tabpanel이다. Overview 헤더(프로젝트·branch 칩·대화 제목·New conversation), 스레드, 입력창, 폭 조절 handle은 탭 밖에 그대로 남는다. 썸네일은 Conversations 탭의 행 안에만 있다. 메인 열을 건드리지 않으므로 "Overview는 프로젝트의 대화 화면"이라는 PRODUCT §5 item 3의 정의가 그대로다.

### Q3. Project 탭이 보이는 사실 — 결정: 앱이 이미 가진 사실과 config 읽기

Location(Path, Branch, Worktrees), Canvases(Canvases, Design system, Frames, 읽을 수 없는 캔버스), Last change, Token CSS, Shared with canvases, Doan files(Q5), Project Settings 버튼(§4.3). 대화 수와 최근 캔버스 목록은 넣지 않는다.

### Q4. Project Settings와의 관계 — 결정: 읽기 전용으로 보이고 버튼으로 연결

Project 탭은 Token CSS와 Shared with canvases를 읽기 전용으로 보이고, "Project Settings" 버튼이 그 worktree의 Project Settings 페이지를 연다. 편집은 페이지에만 있다. 값은 기존 `config:read`로 읽는다. Project Settings를 여는 길이 하나 더 생기므로 승격 때 PRODUCT §5 item 0 'Project Settings'의 진입점 목록을 고친다.

### Q5. Doan 파일 모드 — 결정: `local-doan-files` 병합을 기다리고, 모드를 보인다

권장안(이번 판에서 빼기)과 다르다. 이 feature는 `local-doan-files`가 main에 병합된 뒤 시작하고, Project 탭에 읽기 전용 "Doan files" 줄을 둔다.

- `repo`는 "Include in Git", `local`은 "Keep out of Git (this Mac only)"이다(그 feature가 정한 radio 이름).
- `unknown`은 "Unknown"이고, 그 아래에 Project Settings가 `git_unreadable`에 보이는 이유 문장을 같은 함수로 보인다. 그 밖의 이유 문장은 읽기 전용 탭에 보이지 않는다. 그 문장들은 로컬로 바꿀 수 없는 이유를 설명하는데, 탭에는 바꾸는 control이 없다.
- 폴더가 Git 저장소가 아니면 Branch·Worktrees 줄처럼 Doan files 줄도 없다. 판단은 Branch·Worktrees와 같은 `FolderEntry.git`의 유무다. 그래서 `.git` 메타데이터가 깨져 `doan ls`가 `git`을 빼는 경우(ARCHITECTURE §13 'Read-only Git metadata')에도 줄이 없다. "Unknown"은 `git`은 있고 exclude를 읽지 못한 경우에 보인다.
- 바꾸는 곳은 Project Settings의 "Doan files" section이다(`docs/features/local-doan-files/design.md` §3.2).

### Q6. 처음 탭과 기억 — 결정: 이번 실행 동안만 마지막 탭을 기억

모든 프로젝트에 공통인 값 하나를 App 메모리에 두고, 앱을 다시 시작하면 Conversations로 돌아간다. `ui-state.json`에는 쓰지 않는다. Overview와 오른쪽 패널은 캔버스나 페이지를 열면 unmount되므로(`App.tsx` 1511–1517행, `overview`는 `screen === "workspace"`이고 `!state.open`일 때만 있다), 기억이 없으면 돌아올 때마다 탭이 되돌아간다.

### Q7. 키보드와 접근성 — 결정: ARIA tabs, 자동 선택

tablist의 Tab stop은 선택된 탭 하나다. ←/→가 탭 사이를 순환하며 바로 선택한다(`ComposerParts.tsx` `tabKey`, Quick Open과 프리셋 탭과 같다). Home/End는 없다. 탭은 `aria-selected`와 `aria-controls`를, tabpanel은 `aria-labelledby`를 갖는다. 함께 정해지는 것은 §4.5에 있다.

### Q8. Project 탭이 보이는 동안의 대화 상태 — 결정: 탭에 보인다, 이 worktree의 캔버스 대화만 센다

권장안(따로 표시하지 않기)과 다르다. Project 탭이 선택된 동안, 이 worktree의 캔버스 대화가 일하거나 답을 기다리면 Conversations 탭 이름 옆에 상태 표시가 붙는다. 표시와 뜻은 사이드바 slot의 것을 그대로 쓴다: 답을 기다림은 손 아이콘, 일함은 spinner.

세는 대화는 이 worktree의 캔버스 대화뿐이다(사용자 확인). 사용자의 이유: 프로젝트 대화는 이미 메인 열, Conversation menu, 사이드바 slot에 보인다. 크기, 우선순위, 접근 가능한 이름은 §4.8에 있다.

### Q9. 읽는 중이거나 문제인 worktree — 결정: Project 탭 안에 recovery를 보인다

권장안(경로와 한 줄 안내)과 다르다. 문제 worktree에서 Project 탭은 경로, 문제 이름, 설명 줄, 그리고 status band가 지금 제공하는 recovery 동작을 같은 처리기로 보인다. status band(`ProblemActions`)도 그대로 남는다. 탭의 동작 묶음은 band와 다른 접근 가능한 이름("Fix this worktree", 초안에서 확정)을 갖고, Details의 열림 상태를 band와 공유한다. Config error와 CLI error에는 지금 설명 줄이 없으므로 새 문장을 쓰고, band와 탭이 같은 순수 함수 `problemLine`을 쓴다(§4.4). 읽는 중인 worktree에는 recovery 동작이 없으므로 경로와 읽는 중 줄을 보인다.

### 초안 위치 (질문 아님)

새 초안 파일 `.doan/canvases/overview-tabs.html`을 그린다(§5). `buzz-project.html`은 이미 main에 있는 Overview의 기준이므로 고치지 않는다. 기존 화면에 새 부분을 더한 다른 feature도 새 파일을 그렸다(`canvas-composer-polish.html`, `project-skill-drawer.html`). 탭과 Project 탭은 이 feature가 처음 구현하므로, `/design-sync`는 그 둘을 이 초안과 맞춘다.

## 4. 설계

### 4.1 패널 구조와 탭

- **구조**: 지금은 `<aside className="right native-scroll ov-right" ref={scroller}>`가 스크롤하고 그 안에 `<h2>` 머리가 있다(`RightPanel.tsx` 31–33행). 이것을 캔버스 대화 패널(`.right.doan-conv-panel`, `styles.css` 1244행)처럼 flex column으로 바꾼다. 위에 고정된 머리, 아래에 `native-scroll`을 가진 몸 scroller가 있다. 머리는 스크롤되지 않는다. `scroller` ref와 Conversations 목록의 visibility observer root는 몸 scroller다.
- **탭을 바꿀 때** 몸 scroller의 `scrollTop`을 0으로 되돌린다.
- **머리 높이**는 지금처럼 `--size-chrome`(56)이다. 높이는 항상 그려지는 머리 컨테이너에 두고, 그 안의 tablist에 두지 않는다(§10의 2026-11-02 항목).
- **tablist**는 Quick Open의 filter 탭과 같은 DS 부품을 쓴다(`.doan/ds/mode-tabs.html` frame `filters`, DESIGN 'Quick Open' 'Tabs'). 아이콘은 넣지 않는다(Q1). 머리 안 정렬과 여백은 초안이 정한다.
- **tabpanel**: 두 tabpanel 요소를 항상 그린다. 선택되지 않은 것은 `hidden`이고 자식이 없다. 그래서 두 탭의 `aria-controls`가 늘 있는 요소를 가리키고, 내용만 mount·unmount된다.
- 패널 폭과 그 기억(`overviewPanel.width`), handle(`.doan-overview-handle`, "Resize canvas conversations")은 바뀌지 않는다. handle 이름만 "Resize Overview panel"로 바꾼다(초안 확정, region 이름과 같은 명사).
- **region 이름**: 지금 `aside`의 region 이름 "Canvas conversations"는 패널 전체가 아니라 한 탭을 가리키게 된다. region 이름은 "Overview panel"이다(초안 확정).

### 4.2 Conversations 탭

지금의 `CanvasConversationList`를 그대로 넣는다. 행, Delete, ↑/↓·Home·End, 빈 상태·읽는 중·읽기 실패와 그 문구가 그대로다. 바뀌는 것은 포커스 대상 두 곳(§4.5)과 scroller(§4.1)다.

Project 탭을 고르면 목록이 unmount된다. visibility observer cleanup이 `report.current([])`를 보내 썸네일 큐에서 보이는 행이 사라지고(DESIGN 'Overview placement' 'Thumbnail visibility'), 돌아오면 새로 관찰한다. 목록의 `RowFocusMemory`는 탭을 바꾸면 사라진다. 탭 상태 표시(§4.8)는 목록이 아니라 App이 가진 대화 목록에서 계산하므로 unmount와 상관없다.

### 4.3 Project 탭 내용과 문구

문구는 제안이다. `/design-draft`가 `clarify` preset으로 다시 보고 확정한다. 값 예시는 이 저장소의 2026-11-07 `doan ls` 결과다(`.doan/canvases/` 44개, `.doan/ds/` 36개, 정적 프레임 454개, branch `main`).

| 구역 | 줄 | 값 | 출처와 규칙 |
|---|---|---|---|
| Location | Path | `~/code/doan-design` | `displayPath`. 길면 줄여 쓰지 않고 줄을 바꾼다(경로는 끝 부분이 중요하다) |
| | Branch | `main` / `detached a1b2c3d` | `cardRow(entry, null, null).summary.branch`. `git`이 없으면 줄이 없다 |
| | Worktrees | `3` | 이 프로젝트 group에 등록된 worktree 수(`worktrees` prop). `git`이 없으면 줄이 없다 |
| Canvases | Canvases | `44` | `.doan/canvases/` 경로의 캔버스 수(`canvasKind !== "ds"`) |
| | Design system | `36` | `.doan/ds/`의 캔버스 수 |
| | Frames | `454` / `2,454+` | 읽은 캔버스들의 정적 프레임 수 합. 한 캔버스라도 `framesTruncated`이거나 읽을 수 없으면(`error`, 프레임을 모른다) `+`를 붙인다. 합이 실제보다 작을 수 있다는 뜻이다. 숫자는 `en-US` 천 단위 구분 |
| | (안내) | `1 canvas can't be read — run doan check` / `2 canvases can't be read — run doan check` | `CanvasRow.error`가 있는 캔버스 수. 행 문장(`rowProblem`, `canvasTree.ts` 119행)과 같은 꼴. 0이면 줄이 없다 |
| Last change | (한 줄) | `buzz-project · 5m ago` | `mtimeMs`가 가장 큰 캔버스의 이름(`canvasLabel`)과 시각. `shortAgo(at: string, now)`는 문자열을 받으므로 `new Date(mtimeMs).toISOString()`으로 바꿔 넘긴다. `Nm`·`Nh`·`1d`에는 " ago"를 붙이고, `now`는 "just now", 날짜("Oct 28")는 그대로 쓴다. 화면 낭독용 이름은 `shortAgo`의 `label`("5 minutes ago"). 같은 mtime이면 경로 순으로 앞선 것. 캔버스가 없으면 구역 대신 "No canvases yet." |
| Settings | Token CSS | `app/src/renderer/tokens.css` / `None` | `config:read`의 `tokenCss` |
| | Shared with canvases | 경로 목록 / `Nothing shared` | `config:read`의 `serve`. 표기는 Project Settings와 같은 `sharedPathLabel`(`projectSettingsRules.ts`) |
| | Doan files | `Include in Git` / `Keep out of Git (this Mac only)` / `Unknown` | `doan ls` `storage`. `unknown`이면 그 아래에 Project Settings의 `git_unreadable` 문장. 그 밖의 이유 문장은 없다. `git`이 없으면 줄이 없다(Q5) |
| | (버튼) | `Project Settings` | App의 `openProjectSettings(root)`, 프로젝트 메뉴의 Project Settings와 같은 경로 |

- 캔버스·Git·Doan files 값은 `FolderEntry`가 바뀔 때마다 다시 계산한다. 캔버스가 바뀌어도 config는 다시 읽지 않는다(§4.6).
- Doan files는 `doan ls`에서, Token CSS와 Shared with canvases는 `doan config`에서 온다. 두 읽기의 때가 달라, 앱 밖에서 모드를 바꾼 직후 잠깐 Project Settings와 다른 값을 보일 수 있다. 이 차이는 받아들인다(review 승인).
- 시각은 Overview가 넘기는 `now`(`Date.now()`)로 계산한다. Canvas conversations 행의 짧은 시각과 같은 규칙이다.

### 4.4 상태와 recovery

| 상태 | 보이는 것 |
|---|---|
| worktree 읽는 중(`loading`) | Path와 "Reading project". 동작 없음(`cardRow`의 `Reading`은 `actions: []`) |
| 문제 worktree | Path, 문제 이름(`cardRow(entry, null, null).chip`), `problemLine`의 설명 줄, recovery 동작 묶음 |
| config 처음 읽는 중 | Settings 구역의 config 줄만 비어 있고, 300 ms(`LOADING_DELAY_MS`와 같은 값)가 지나면 spinner와 "Reading settings"(Project Settings 페이지의 읽는 중 줄과 같은 꼴) |
| config 다시 읽는 중 | 이전 값을 그대로 둔다 |
| config 읽기 실패(`error`) | Settings 구역에 "Couldn’t read this worktree’s settings."(Project Settings와 같은 문장, `projectSettingsRules.ts` 89행) + 이유(`ConfigReply.message`) + Retry |
| config `unavailable` | 이전 값이 있으면 그대로 두고, 없으면 실패와 같게 보인다 |

**문제 worktree가 보이는 때**: PRODUCT §5 item 3 'Problem states'에 따르면 들어갈 때 문제인 프로젝트는 problem screen을 보인다. 그래서 Project 탭의 문제 상태는 열린 Overview의 프로젝트가 문제로 바뀐 때에만 생긴다(`App.tsx` 1509–1517행의 `keptOverview`).

**설명 줄** `problemLine(entry, name, homeDirectory)`: band와 탭이 같이 쓴다. 지금 band의 두 문장은 그대로 두고, 나머지 둘을 더한다. 새 두 문장은 `clarify` preset 기준(무엇이 실패했는지, 알 때는 왜, 회복은 버튼이 말한다)으로 썼고 초안에서 확정했다. 둘 다 Project Settings의 문제 문장처럼 "couldn’t"로 쓴다.

| kind | 문장 |
|---|---|
| `notFound` | "`<path>` is gone or moved."(지금 그대로, path는 `displayPath`) |
| `uninitialized` | "<name> is not set up."(지금 그대로) |
| `error`(Config error) | "Doan couldn’t read <name>’s configuration." (새 문장) |
| `cliError`(CLI error) | "Doan couldn’t read <name>." (새 문장) |
| `loading`, `list` | `null` |

**동작**: status band의 `cardRow(entry, null, null).actions` 순서와 이름(`ROW_ACTION_LABELS`) 그대로다. Not set up은 Set Up·Remove from Doan, Missing은 Locate·Remove from Doan, Config error는 Show in Finder·Retry·Details, CLI error는 Retry·Remove from Doan이다. Details가 아닌 동작은 App의 `action(name, root)`를 부른다. Details는 탭 안에서 오류 문장을 펼치는 토글이다. `action("details", root)`를 부르지 않는다. 그 경로는 오류를 toast로 보인다(`App.tsx` 1326행). Go Home은 band에만 둔다(이동이지 recovery가 아니다). Remove from Doan은 App의 기존 확인 alert를 거친다(PRODUCT §5 item 1).

**band와 탭이 둘 다 보인다**: 같은 동작이 두 번 보이는 것은 사용자 결정이다(Q9). 같은 처리기를 쓰므로 결과가 갈리지 않는다. 탭의 동작 묶음은 `role="group"`과 band의 region("Project status")과 다른 이름("Fix this worktree")을 갖는다. Details 열림 상태는 App이 root마다 하나 갖고 band와 탭에 넘긴다. 한쪽에서 펼치면 다른 쪽도 펼쳐지고, 두 Details 버튼의 `aria-expanded`가 같다.

**root를 옮기는 recovery**: Locate나 Set Up이 worktree를 다른 root로 옮기면 App이 `FolderFocus`로 새 root를 따라간다(§10의 2026-11-03 Locate 항목). 새 root는 `keptOverview`가 아니므로, 새 root를 읽는 짧은 동안 Overview가 unmount된다. 그동안 포커스는 workspace `focusCurrent`의 대체 순서를 따라 사이드바의 현재 treeitem으로 간다(Overview가 없으니 tabpanel 대상이 없다). 새 root가 `list`가 되면 Overview가 다시 마운트되고 탭 기억(Q6)으로 Project 탭이 보인다. 이때 포커스를 끌어오지 않는다.

### 4.5 키보드와 접근성

- tablist: 선택된 탭만 `tabIndex=0`, ←/→는 `tabKey`로 순환하며 바로 선택한다. 새 탭은 다음 프레임에 포커스를 받는다(Quick Open·프리셋 탭과 같은 방식).
- Conversations tabpanel은 행이 있으면 `tabIndex`가 없고 행이 Tab stop이다. 비었거나 읽는 중이면 `tabIndex=0`이다(포커스를 받을 행이 없다). 읽기 실패면 Retry 버튼이 Tab stop이다.
- Project tabpanel은 `tabIndex=0`이다. 포커스를 받는 control이 적어(Project Settings 버튼, 문제일 때 recovery 버튼) 읽기 위한 정지점이 필요하다(WAI-ARIA APG Tabs pattern의 권고, 기억에 의존한 인용이며 초안 단계에서 원문을 확인한다).
- 포커스 대상 두 곳이 `<h2>`를 잃는다. 둘 다 선택된 탭으로 옮긴다.
  - Canvas conversations 행 Delete 뒤 갈 행이 없을 때: `App.tsx`의 `.ov-right .rp-head` selector.
  - 포커스가 있던 목록이 비었을 때: `CanvasConversationList`의 `title` ref(`RowFocusMemory.left`가 `{ kind: "title" }`을 돌려줄 때).
- recovery 뒤 포커스: 누른 버튼이 사라지면(Retry → `loading` → `list`처럼 같은 root에서 상태가 바뀜) 포커스가 `<body>`로 떨어진다. App의 workspace `focusCurrent` 대체 목록에서 사이드바 앞에 선택된 tabpanel(`.ov-right [role="tabpanel"]:not([hidden])`)을 넣어, 포커스가 Project tabpanel로 가게 한다. root를 옮기는 recovery는 §4.4.
- 포커스를 받는 탭은 `display: none`이나 `visibility: hidden`으로 숨기지 않는다(§10의 2026-11-03 항목). `hidden`인 tabpanel은 선택되지 않은 것뿐이고 포커스 대상이 아니다.
- Project 탭의 숫자는 `.ov-main`과 오른쪽 패널처럼 `font-variant-numeric: normal`을 따른다(DESIGN 'Project Overview' 'Numerals', `styles.css` 1060행).

### 4.6 config 읽기

Overview는 캔버스를 열 때뿐 아니라 Project Settings·Settings·Add Projects 페이지를 열 때도 unmount된다(Q6의 `App.tsx` 근거). 그래서 페이지에서 돌아오면 Project 탭이 다시 마운트되고, 마운트 때의 읽기가 "돌아옴"을 덮는다. 따로 돌아옴 신호를 두지 않는다.

- **읽는 때**: Project 탭 내용이 마운트될 때, 그 탭이 보이는 동안 창이 focus를 얻을 때, 탭이 보이는 동안 같은 root의 entry가 `list`가 아니었다가 `list`가 될 때(같은 root의 Retry·Set Up은 Overview를 다시 마운트하지 않는다), Retry.
- **조건**: 모든 읽기는 `screen === "workspace"`이고 `entry.kind === "list"`일 때만 한다. `list`가 아닌 동안은 읽지 않는다(Project Settings도 문제 worktree는 읽지 않는다, `projectSettingsRules.ts` 77–78행 주석).
- **창 focus 간격**: main이 창 focus 때 목록을 다시 읽는 간격과 같은 60초다(`createThrottle(60_000)`, `app/src/main/index.ts` 480행). 마운트 때의 읽기가 그 간격을 시작하므로, 다시 마운트한 직후의 창 focus는 읽기를 한 번 더 하지 않는다. renderer가 `main/throttle.ts`를 가져다 써도 되는지는 renderer가 main 모듈을 가져오는 규칙(POSTMORTEM 2026-10-30, `canvasConversationRows.ts` 주석)과 `/tdd` 때 대조한다. 안 되면 같은 순수 함수를 renderer에 둔다.
- **캔버스 변경**(`servedRev`)으로는 다시 읽지 않는다. 에이전트가 캔버스를 그리는 동안 `doan config`가 계속 실행되는 것을 피한다.
- **페이지 session과의 순서**: Project Settings 페이지는 unmount 때 `endConfigSession`을 보내고(`ProjectSettingsPage.tsx` 89행), main은 그때 bridge를 비워 session 번호를 올린다(`configBridge.ts` `clear`). 페이지를 떠나는 같은 commit에서 Overview가 마운트되면, 페이지의 cleanup이 마운트 effect보다 먼저 돌아 `config:session-end`가 `config:read`보다 먼저 main에 간다. 이 순서에서는 마운트 읽기가 새 session에서 돌아 `unavailable`이 되지 않는다. 이 순서를 App 테스트로 고정한다. 그래도 마운트 읽기가 `unavailable`로 끝나고 더 새 요청이 없으면 한 번만 다시 읽는다.
- **응답 거르기**: root와 요청 순번으로 거른다. 다른 worktree로 바뀐 뒤 도착한 응답, 늦게 도착한 이전 요청의 응답, Overview가 unmount된 뒤 도착한 응답은 버린다.
- Doan files 줄은 config 읽기가 아니라 `doan ls`(`FolderEntry`)에서 온다. 앱이 모드를 쓰면 main이 같은 group의 모든 root를 다시 읽으므로(`local-doan-files` design §3.3) 목록 갱신으로 보인다.

### 4.7 탭 기억

App이 이번 실행의 값 하나(`"conversations" | "project"`)를 갖고 `CanvasConversations`에 넘긴다. 프로젝트나 worktree를 바꾸거나 캔버스·페이지에서 돌아와도 그 값을 쓴다. `ui-state.json`에는 쓰지 않는다.

### 4.8 Conversations 탭의 상태 표시

- **언제**: Project 탭이 선택된 동안에만 보인다. Conversations 탭이 선택되어 있으면 행이 상태를 보이므로 붙이지 않는다.
- **무엇을 센다**: 이 worktree의 Canvas conversations 행(`canvasConversationRows` 결과)의 `status`다. 프로젝트 대화는 세지 않는다(Q8 사용자 결정). 목록이 `"loading"`이나 `"error"`면 표시가 없다.
- **종류와 우선순위**: `status.kind`가 `permission`(권한 요청과 질문)인 행이 있으면 손 아이콘, 없고 `working`인 행이 있으면 spinner다. `unseen`은 표시하지 않는다.
- **모양**: 탭 이름 뒤에 표시 하나. 손 아이콘은 `--affordance-accent`, spinner는 기존 `doan-spinner`. 크기는 둘 다 `--size-icon-sm`(14px, DESIGN 'Tokens': "Icon inside chips, triggers and tabs")다. 행의 손 아이콘은 16px이지만 탭 안에서는 14px로 줄인다. 숫자는 그리지 않는다. 줄인 움직임 설정에서는 spinner가 기존 spinner 규칙을 따른다.
- **접근 가능한 이름**: 탭의 이름에 상태를 더한다. "Conversations, 1 needs your answer"(복수: "2 need your answer"), "Conversations, 1 working", 둘 다면 "Conversations, 1 needs your answer, 2 working". 표시는 `aria-hidden`이다. live region은 두지 않는다. 같은 상태를 사이드바 slot, 권한 toast, 알림이 이미 알린다. 문구는 초안에서 `clarify`로 확정한다.
- 탭은 저절로 바뀌지 않는다.

## 5. 초안 요청 (`/design-draft`)

- **언제**: `local-doan-files`가 main에 병합된 뒤(tasks T1).
- **canvas**: `.doan/canvases/overview-tabs.html`, id `overview-tabs`, `doan:width` 1440(`buzz-project.html`과 같다).
- **먼저 잴 것**: `tabs-mark`와 `tabs-narrow`를 먼저 그려, 상태 표시가 붙은 두 탭이 280px 패널 머리에 들어가는지 잰다. 넘치면 다른 frame을 그리기 전에 멈추고 이 문서의 Q1을 다시 연다.
- **frames** (`data-doan-implements`는 지금 있는 파일만 가리킨다. Project 탭 본문은 새 파일이므로 `RightPanel.tsx`를 가리킨다):

| frame id | 그릴 것 | implements |
|---|---|---|
| `tabs-mark` | Project 탭 선택 중 Conversations 탭의 상태 표시: 답을 기다림(손), 일함(spinner), 둘 다(손이 이김), 표시 없음. 280 패널 | `app/src/renderer/RightPanel.tsx` |
| `tabs-narrow` | 960 × 600, 패널 280, 두 탭이 머리에 들어감. 몸을 스크롤한 Project 탭(머리는 고정) | `app/src/renderer/RightPanel.tsx` |
| `tabs-conversations` | 1238 × 780 Overview, Conversations 탭 선택, 지금과 같은 행들(shipped 화면 복사) | `app/src/renderer/RightPanel.tsx` |
| `tabs-project` | 같은 크기, Project 탭 선택, §4.3의 모든 줄을 이 저장소 값으로 | `app/src/renderer/RightPanel.tsx` |
| `tabs-project-ranges` | 패널 280에서 값의 범위: 긴 경로, detached HEAD, worktree 1개, Git 저장소 아님(Branch·Worktrees·Doan files 줄 없음), Token CSS 없음, Nothing shared, 공유 경로 여러 개(5개 이상), 캔버스 없음, `+`가 붙은 프레임 수, 읽을 수 없는 캔버스 안내, Doan files 세 값(Include in Git, Keep out of Git (this Mac only), Unknown과 `git_unreadable` 문장) | `app/src/renderer/RightPanel.tsx` |
| `tabs-project-settings-read` | Settings 구역의 처음 읽는 중, 읽기 실패와 Retry | `app/src/renderer/RightPanel.tsx` |
| `tabs-project-recovery` | 문제 worktree마다 Project 탭의 recovery: Missing(Locate·Remove from Doan), Not set up(Set Up·Remove from Doan), Config error(Show in Finder·Retry·Details, Details 펼친 상태가 band와 탭에 같이 보임), CLI error(Retry·Remove from Doan). 위의 status band와 함께, `problemLine`의 네 문장 | `app/src/renderer/RightPanel.tsx` |
| `tabs-project-loading` | worktree 읽는 중의 Project 탭 | `app/src/renderer/RightPanel.tsx` |
| `tabs-keyboard` | 선택된 탭의 focus ring, 다른 탭 hover, Project tabpanel focus, 빈 Conversations tabpanel focus, Project Settings 버튼과 recovery 버튼 focus | `app/src/renderer/RightPanel.tsx` |

- **제약**: Overview 헤더, 스레드, 입력창, 사이드바, status band는 코드와 DESIGN 'Project Overview' 그대로 복사한다. 단 status band의 Config error·CLI error 설명 줄은 새 문장으로 그린다. recovery 버튼은 band의 버튼 모양(`ProblemActions`, sm `subtle`·`ghost`)을 기준으로 하되 280 패널 안 배치는 초안이 정한다. 패널 머리는 56px이고 탭은 `mode-tabs` `filters` 부품을 아이콘 없이 쓴다. 문구는 `clarify` preset으로 다시 보고, 바꾼 문구는 이 문서 §4.3·§4.4·§4.8에 되돌려 적는다. Doan files 값은 branch에서 빌드한 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`)의 `doan ls --json` 결과에서 가져온다(설치된 `doan`이 `local-doan-files`보다 오래되었을 수 있다).

### 5.1 초안에서 정한 것 (`/design-draft`, 2026-11-07)

초안 `.doan/canvases/overview-tabs.html`이 정했고, 사용자 확인을 기다린다.

- **280 패널 머리 측정**: 탭 capsule은 상태 표시가 있으면 216 px(Conversations 135, Project 70), 없으면 196 px다. 머리의 여유는 263 px(280에서 시작 쪽 1 px 선과 좌우 8 px 안쪽 여백을 뺀 값)이므로 Q1은 다시 열지 않는다.
- **머리 배치**: 머리 컨테이너는 높이 `--size-chrome`, 좌우 안쪽 여백 `--space-2`이고, capsule은 탭 폭만큼만 차지한다(늘이지 않는다).
- **이름**: region "Overview panel", handle "Resize Overview panel", 탭 "Conversations"·"Project", Project 탭 동작 묶음 "Fix this worktree". 제목 메뉴의 "Conversations in <project>"와 겹치지만 탭은 그대로 둔다. 탭의 행과 빈 상태 문구가 캔버스 대화임을 말하고, 메뉴는 자기 머리 아래에 프로젝트 대화를 나열한다(Q1).
- **Project 탭 배치**: 구역은 Location, Canvases, Last change, Settings 순서이고 각 구역 제목은 label-sm이다. 짧은 값(Branch, Worktrees, 개수)은 줄 끝에 두고, 경로와 모드(Path, Token CSS, Shared with canvases, Doan files)는 이름 아래에 두어 줄여 쓰지 않고 줄을 바꾼다. 내용의 시작은 Conversations 행 내용과 같은 16 px다. Project Settings 버튼은 sm `subtle`로 Settings 구역 끝에 둔다.
- **읽을 수 없는 캔버스 안내와 Doan files `Unknown`의 이유 문장**은 경고 inline 형식(16 px 아이콘과 `--text-warning`)이다.
- **config 읽기 실패**는 inline 오류(아이콘과 `--text-danger`)로 "Couldn’t read this worktree’s settings."를 보이고, 그 아래에 이유(`--text-subtle`)와 sm `subtle` Retry를 둔다. 280 폭에서 notice 안의 inline 동작은 문장을 지나치게 좁히기 때문이다.
- **문제 worktree**: Project 탭은 문제 이름 chip, 설명 줄, "Fix this worktree" 동작 묶음(band와 같은 sm `subtle`·`ghost`, 줄바꿈 허용), Details를 펼친 오류를 먼저 보이고, 그 아래에 Location의 Path를 둔다. 지금 고쳐야 할 사실이 먼저 오게 하려는 순서다.
- **상태 표시 색**: 손 아이콘의 `--affordance-accent`는 새 accent 자리(`.ov-tab-mark.permission`)다. 구현 때 DESIGN 'Accent places'와 `accentPlaces` 목록에 더한다.
- **tabpanel focus**: tabpanel은 몸을 채우고 스크롤하므로 안쪽 ring(−2 px, `--radius-row`)을 쓴다. 탭과 버튼은 공용 바깥 ring이다.

## 6. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수(제안 이름) | 입력 → 출력 | 사례 |
|---|---|---|
| `projectInfoView(entry, worktrees, project, homeDirectory, now)` (`projectInfo.ts`) | `FolderEntry`, 등록된 worktree 행, 프로젝트 이름 → Location·Canvases·Last change·Doan files 줄, 또는 `{ kind: "loading" }`·`{ kind: "problem", chip, line, actions, detail }` | branch / detached / `git` 없음(Branch·Worktrees·Doan files 줄이 모두 없음), worktree 1·여러 개, `.doan/canvases`와 `.doan/ds` 나누기, 프레임 합과 `framesTruncated`의 `+`, 읽을 수 없는 캔버스가 있을 때의 `+`(프레임 0개로 세고 표시), 천 단위 구분, 읽을 수 없는 캔버스 0·1·여러 개(단수·복수 문구), `mtimeMs` 없는 캔버스, 같은 mtime이면 경로 순, `shortAgo`에 넘기는 ISO 문자열과 " ago"·"just now"·날짜 표기, 캔버스 0개, `storage` 세 값(`unknown`만 `git_unreadable` 문장, 다른 이유 값은 문장 없음), `loading`, 문제 kind마다 `cardRow(entry, null, null).actions`와 같은 목록·순서 |
| `problemLine(entry, name, homeDirectory)` (`homeCards.ts` 옆, band와 탭이 공유) | 문제 entry → 설명 줄 또는 `null` | 네 kind의 문장(§4.4 표), `notFound`의 `displayPath`, `loading`·`list`는 `null`. band의 지금 두 문장이 바뀌지 않음 |
| `projectSettingsSummary(read, slow: boolean)` (`projectInfo.ts`) | config 읽기 상태(`ConfigReply`·읽는 중·이전 값)와 300 ms가 지났는지 → Settings 구역 view | 처음 읽는 중에 `slow` false·true, 다시 읽는 중에 이전 값 유지, `error`의 문장과 message, `unavailable`이 이전 값 있음·없음, token CSS 없음, serve 0개, `sharedPathLabel` 표기 |
| `conversationsTabMark(list: CanvasList, selected)` (`projectInfo.ts`) | `CanvasList`(`CanvasConversationList.tsx`: 행 배열, `"loading"`, `"error"`)와 선택된 탭 → `null` 또는 `{ mark: "permission" \| "working", name }` | Conversations 탭 선택이면 `null`, `"loading"`·`"error"`면 `null`, 상태 없는 행만이면 `null`, `unseen`만이면 `null`, 답을 기다림 1·2(단수·복수 이름), 일함 1·2, 둘 다(표시는 permission, 이름에 둘 다), 특수 행(목록에 없는 캔버스, 중복 id)의 `status`도 같은 규칙으로 센다 |
| 창 focus 간격 | `createThrottle(60_000)`와 같은 규칙(§4.6). renderer에서 쓸 수 있는지에 따라 가져오거나 같은 순수 함수를 둔다 | 마운트 읽기 직후의 focus는 읽지 않음, 60초 뒤 focus는 읽음 |
| `overviewTabKey` | `tabKey`(`ComposerParts.tsx`)를 그대로 쓴다. 새 함수가 아니므로 두 탭 순환 사례만 테스트에 더한다 | ←/→ 순환, 다른 키 null |

config 읽기 hook(요청 순번, root 거르기, 읽는 때, `unavailable` 한 번 재시도)은 I/O를 가진 shell이다. 거르기 판단만 순수 함수로 뺄 수 있으면 뺀다.

## 7. 형식 변경

없다. JSON Schema(ARCHITECTURE §11), 형식 버전 `v`, 공유 fixture, `ui-state.json`, CLI 결과 모양이 그대로다. `storage`와 이유 값은 `local-doan-files`가 `doan ls` 계약에 더한 것을 읽기만 한다. renderer `FolderEntry`가 그 필드를 갖지 않으면 `view.ts`에서 좁혀 넘긴다(§1). 이것은 main→renderer IPC 모양이고 schema가 아니다.

## 8. Conventions·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없다.
- 구조 결정: git 명령을 실행하지 않는다(Git 사실과 모드는 `doan ls`를 읽기만 한다, ARCHITECTURE §13 'Read-only Git metadata'). config는 기존 bridge로 읽기만 하고 쓰지 않는다. recovery는 기존 처리기를 부를 뿐 새 쓰기 경로가 없다. 서빙 범위, sandbox iframe, append-only 이벤트, 댓글 처리는 건드리지 않는다.
- ARCHITECTURE §7 'Settings IPC'는 지금 Project Settings 페이지만 `config:read`를 쓴다고 읽힌다. Overview가 두 번째 읽는 쪽이 되고, 페이지 session의 끝과 Overview 마운트 읽기의 순서(§4.6)를 승격 때 적는다.
- PRODUCT §5 item 3 'Project Overview'의 오른쪽 패널 설명('Canvas conversations (right panel)')과 'Problem states'(열린 Overview의 문제 worktree가 Project 탭에서도 recovery를 보인다, Config error·CLI error의 설명 줄), PRODUCT §5 item 0 'Project Settings'의 진입점이 바뀐다. 승격 task에서 고친다.
- `/agent-eval`: CLI 출력, guide, skill stub, `doan check` 규칙이 바뀌지 않으므로 필요 없다.

## 9. PoC 의존과 선행 조건

PoC 의존은 없다. 쓰는 데이터와 IPC는 main에서 이미 동작하거나 `local-doan-files`가 만든다. 선행 조건은 `local-doan-files`의 main 병합이다(Q5, tasks 시작 조건).

## 10. POSTMORTEM에서 가져온 함정

`docs/POSTMORTEM.md`에서 Overview, 오른쪽 패널 머리, portal 메뉴, 포커스 대상, 다른 root로 옮기는 recovery와 관련된 항목을 골랐다.

- **2026-11-02 — Every Overview menu opened under the Overview itself.** "Radix renders a portalled menu inside a `position: fixed` wrapper at the end of `body` and copies the content's computed `z-index` onto it. No `.doan-floating` rule set one, so the wrapper sat in the root stacking context at level 0, under `.ov { position: relative; z-index: 1 }`." Prevention: "give any new stacking layer (a positioned element with a z-index) a check against portalled menus, and open at least one portalled menu on that screen in its runtime probe, judged by screenshot. In a probe, never take `elementFromPoint` under an open Radix modal as proof of visibility." → 탭과 Project 탭에 새 z-index를 두지 않는다. `/runtime-test`는 Project 탭이 보일 때 Overview의 portal 메뉴(제목 메뉴나 모델 picker) 하나와, Project Settings 버튼에 tooltip이 있다면 그 tooltip을 screenshot으로 확인한다.
- **2026-11-02 — The canvas conversation panel's head was 8px shorter than the canvas header.** "the chrome height lived on `.rp-head`, the panel's default heading. A canvas panel with a conversation replaces that heading with the title menu, so the head fell back to the trigger's 32px plus its padding." Prevention: "put a row height on the container that always renders, not on a child a prop can replace." → 이 feature는 Overview의 `.rp-head` `<h2>`를 tablist로 바꾼다. 56px 높이는 머리 컨테이너에 두고, CSS 테스트로 고정한다.
- **2026-11-03 — A canvas row menu closed by Esc dropped focus to the page body.** Prevention: "an element that receives focus programmatically (a menu trigger, a dialog's return target) is hidden only visually …, never with `display: none` or `visibility: hidden`; pin the hide rule in a CSS test." → 선택된 탭과 선택된 tabpanel이 포커스 대상이 된다(§4.5). `hidden` tabpanel 안의 요소는 포커스 대상으로 쓰지 않는다.
- **2026-11-03 — Locate on the Project Settings page closed the page instead of following the moved worktree.** "the renderer learns about a reroot only from the optional second argument of the folder-list event (`FolderFocus {from, root}`)." Prevention: "when renderer behavior depends on an optional field of a main event, pin in main's test that every path producing that change sends it." → Project 탭의 Locate와 Set Up은 같은 처리기를 부르므로 같은 `FolderFocus`를 받는다. App 테스트로 Project 탭에서 Locate한 뒤 Overview가 unmount되었다가 새 root에서 Project 탭으로 다시 마운트되는지, 그동안 포커스가 어디에 있는지 고정한다(§4.4).
- **2026-11-02 — The loaded project's row did nothing on a canvas, though PRODUCT said it opened the Overview.** Prevention: "when a navigation branch returns early, list every screen it can run on and pin each in a test." → config 읽기의 조건(`screen === "workspace"`)과 Project Settings 버튼을 Overview, Project Settings 페이지, Settings 페이지, Add Projects 페이지 각각에서 테스트한다.

DESIGN 'Overview placement'의 "Thumbnail visibility travels in both directions, including when the Overview's right panel unmounts"도 지킨다. Conversations 목록이 unmount되면 같은 경로를 탄다(§4.2).

## 11. 진행 중인 다른 feature와의 관계

- `local-doan-files`(orchestration 진행 중, main 미병합): 이 feature의 선행 조건이다(Q5). Project 탭은 그 feature의 `storage`와 `git_unreadable` 문장을 읽기만 하고, 모드를 바꾸는 곳은 Project Settings다. Project Settings 경로 줄의 문구는 복사하지 않는다.
- `monorepo-services`(main 미병합, 그 tasks의 선행 조건이 `local-doan-files` 병합): `doan ls`에 `services`, 서비스별 token CSS를 더한다. 그 feature가 먼저 들어오면 Project 탭의 Token CSS 줄이 프로젝트 공유 token만 가리키는지 다시 본다.
- `buzz-restyle`(부모): 캔버스 페이지 대화 패널에는 탭 틀이 없다는 결정을 지킨다. 이 feature는 Overview 오른쪽 패널만 바꾼다.
