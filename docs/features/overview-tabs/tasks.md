# overview-tabs — tasks

**시작 조건**: `local-doan-files`가 main에 병합된 뒤 T1을 시작한다(design §3 Q5). 확인:

- `git log --oneline -1 main -- docs/features/local-doan-files`가 그 feature의 마지막 commit(`docs(feature): remove local-doan-files documents`)을 보이고, `git ls-tree main docs/features/local-doan-files`의 결과가 비어 있다. `git` 읽기 명령은 AGENTS.md 'Commands'에 없는, 대상 확인용 명령이다.
- 임시 디렉터리에서 `go run ./cli/cmd/doan init --repo <tmp> --json` 뒤 `go run ./cli/cmd/doan ls --repo <tmp> --json`의 결과에 `storage`가 있다(AGENTS.md 'Commands': `--repo`는 임시 디렉터리).
- 그다음 병합된 코드에서 이유 값의 확정 이름, `git_unreadable` 문장을 만드는 함수, `FolderEntry`가 `storage`를 갖는지를 읽고 design §1·§2·§6과 spec 완료 조건 4를 고친다. `storage` 값과 radio 이름은 이미 정해졌다(design §3 Q5).

순서: 결정 → (시작 조건) → 초안 → `FolderEntry` 필드 → 순수 함수 → shell(config 읽기 hook) → UI → 실제 앱 확인 → 초안 맞추기 → 승격. 형식(schema·fixture) 변경이 없으므로 형식 task는 없다(design §7). `/ship`의 흐름(`/tdd` → `/implement` → `/code-review` → `/refactor` → `/verify`)은 T2–T5의 commit 경계를 따른다.

## T0. 결정과 review — 완료(사용자, 2026-11-07)

- design §3에 Q1–Q9의 결정을 적었다. Q5·Q8·Q9는 권장안과 다르게 정해졌다. `/feature-review`에서 승인된 지적(패널 구조, tabpanel, config 읽기 때, recovery 뒤 포커스, 문구, 함수 서명, tasks 순서)을 design §4–§6, spec 완료 조건, 이 tasks에 반영했다.
- 검증: 확인 명령 미정 — 사용자 확인 필요(design §3에 열린 질문이 남지 않았는지 사람이 본다).
- **commit 경계**: `docs(feature): overview-tabs spec, design, tasks`

## T1. 초안

- 시작 조건을 확인한 뒤 `/design-draft overview-tabs`가 design §5의 요청대로 `.doan/canvases/overview-tabs.html`(id `overview-tabs`)에 frame 9개를 그린다. `tabs-mark`와 `tabs-narrow`를 먼저 그려 280px 패널 머리에 두 탭과 상태 표시가 들어가는지 재고, 넘치면 멈추고 Q1을 다시 연다. 문구(`problemLine`의 새 두 문장, "Fix this worktree", region·handle 이름, 탭 이름)는 `clarify` preset으로 다시 보고, 바뀐 문구를 design §4.3·§4.4·§4.8에 되돌려 적는다.
- Doan files 값은 branch에서 빌드한 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`)로 임시 repo를 읽은 `<tmp>/doan ls --repo <tmp repo> --json` 결과에서 가져온다. 설치된 `doan`이 `local-doan-files`보다 오래되었을 수 있다.
- 검증: `doan check --repo . --json` 오류 0, `doan ls --repo . --json`에 `overview-tabs`가 나온다, 사용자가 앱에서 초안을 확인한다.
- **commit 경계**: `docs(design): draft Overview tabs`

## T2. `FolderEntry` 필드

- 병합된 `local-doan-files`의 `FolderEntry`가 `storage`와 이유 값을 갖지 않으면 `view.ts` `folderEntry`에서 좁혀 넘긴다(design §1). 이미 가지면 이 task는 확인만 하고 끝난다.
- 테스트: `view.test.ts`에 두 필드가 있음·없음·모르는 값 사례.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): pass where Doan files are kept to the renderer` (바뀐 것이 있을 때만)

## T3. 순수 함수

- `/tdd`: design §6 표의 사례 전부.
  - `projectInfoView(entry, worktrees, project, homeDirectory, now)`: Doan files 줄(`git` 없음이면 줄 없음, `unknown`만 `git_unreadable` 문장), 프레임 합의 `+`(`framesTruncated`와 읽을 수 없는 캔버스), "N canvases can't be read — run doan check", `mtimeMs`→ISO→`shortAgo`와 " ago" 표기, 문제 worktree의 recovery 목록이 kind마다 `cardRow(entry, null, null).actions`와 같음.
  - `problemLine(entry, name, homeDirectory)`: 네 kind의 문장, band의 지금 두 문장이 바뀌지 않음.
  - `projectSettingsSummary(read, slow)`, `conversationsTabMark(list, selected)`(`"loading"`·`"error"` 포함), 창 focus 60초 간격, 두 탭에 대한 `tabKey` 순환.
- `/implement`로 green. `Home.tsx` `ProblemActions`가 `problemLine`을 쓰도록 바꾸는 것도 여기서 한다(band의 Missing·Not set up 문장 불변).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): project facts for the Overview's Project tab`

## T4. shell: config 읽기 hook

- `config:read`(`window.doan.readConfig`)를 부르는 hook(design §4.6).
- 테스트(`window.doan` stub):
  - 마운트 때 한 번 읽음, 다시 마운트 직후의 창 focus로는 다시 읽지 않음, 60초 뒤 창 focus로 읽음.
  - 캔버스 목록 변경으로는 다시 읽지 않음.
  - 탭이 보이는 동안 같은 root가 `error` → `loading` → `list`가 되면 다시 읽음. `list`가 아닌 동안과 `screen !== "workspace"`인 동안에는 읽지 않음.
  - Retry로 다시 읽음, 다시 읽는 동안 이전 값을 유지.
  - 다른 root로 바뀐 뒤 도착한 응답, 늦게 온 이전 요청, unmount 뒤 도착한 응답을 버림.
  - `unavailable`이고 더 새 요청이 없으면 한 번만 다시 읽음.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): read project settings for the Overview`

## T5. UI

- `RightPanel.tsx` `CanvasConversations`: `aside.ov-right`를 고정 머리와 `native-scroll` 몸을 가진 flex column으로 바꾸고, 머리를 아이콘 없는 tablist(Conversations, Project)로, 몸 안에 늘 있는 두 tabpanel을 둔다. `scroller` ref와 visibility observer root를 몸으로 옮기고, 탭을 바꾸면 `scrollTop`을 0으로 한다. Conversations 탭의 상태 표시. 새 `ProjectInfoPanel.tsx`(Doan files 줄, recovery 묶음과 Details). App의 이번 실행 탭 기억, root별 Details 열림 상태(band와 공유), Project Settings 버튼 연결, recovery 처리기(`action(name, root)`, Details 제외) 연결. 포커스 대상(App의 Delete 뒤 selector, `CanvasConversationList`의 `title`, `focusCurrent`의 workspace 대체 목록에 선택된 tabpanel). `styles.css`: 머리 높이를 머리 컨테이너로, `.rp-head`·`.doan-conv-head .rp-head` 규칙은 그대로(design §4.1, §10).
- 테스트:
  - `CanvasConversationList.test.tsx`·`.keyboard.test.tsx`가 그대로 green이다(Conversations 탭 동작 불변). observer root가 몸 scroller다.
  - 탭: `role`·`aria-selected`·`aria-controls`(두 tabpanel 요소가 늘 있음, 선택되지 않은 것은 `hidden`이고 자식 없음)·`aria-labelledby`, Tab stop 하나, ←/→ 순환과 선택, Project tabpanel `tabIndex=0`, 비었거나 읽는 중인 Conversations tabpanel `tabIndex=0`, 탭에 아이콘 없음, 탭을 바꾸면 몸 `scrollTop` 0.
  - 탭 상태 표시: Project 탭 선택 중 답을 기다리는 행이 생기면 손 아이콘과 이름("Conversations, 1 needs your answer"), 일하는 행만이면 spinner, 둘 다면 손 아이콘과 두 수, Conversations 탭 선택 중이나 목록이 읽는 중·실패면 표시 없음, 상태가 끝나면 사라짐, 탭이 저절로 바뀌지 않음, 표시는 `aria-hidden`.
  - recovery: 문제 kind마다 버튼 목록이 status band(`ProblemActions`)와 같고, Details 외의 버튼은 App의 같은 처리기를 같은 인자로 부른다. Details는 `action("details")`를 부르지 않고(toast 없음) band와 탭이 같이 펼쳐진다(`aria-expanded` 같음). 묶음의 이름이 "Fix this worktree"다. Remove from Doan은 기존 확인 alert를 연다.
  - recovery 뒤 포커스(App 테스트): Retry → `loading` → `list`에서 포커스가 Project tabpanel로 간다. Locate가 root를 옮기면 Overview가 unmount되는 동안 포커스는 사이드바의 현재 treeitem이고, 새 root에서 Overview가 Project 탭으로 다시 마운트되며 포커스를 끌어오지 않는다(POSTMORTEM 2026-11-03 Locate 항목).
  - `App.conversationDelete.test.tsx`: 마지막 행 Delete 뒤 포커스가 선택된 탭으로 간다. 목록이 비었을 때도 같다.
  - 탭 기억: 캔버스를 열었다 Overview로 돌아오거나 다른 프로젝트 Overview로 가도 Project 탭이 남는다. 새 App 마운트에서는 Conversations다.
  - 화면마다(Overview, Project Settings 페이지, Settings 페이지, Add Projects 페이지): 페이지가 열리면 Overview가 unmount되고 config를 읽지 않으며, 돌아오면 마운트 읽기가 한 번 돈다. Project Settings 페이지에서 돌아올 때 페이지의 `endConfigSession`이 마운트 읽기보다 먼저 가서 읽기가 `unavailable`이 되지 않는다. Project Settings 버튼이 그 worktree의 페이지를 연다.
  - Project 탭으로 바꾸면 썸네일 visibility가 빈 목록으로 보고된다.
  - CSS 테스트: 패널 머리 높이가 tablist일 때도 `--size-chrome`이다(POSTMORTEM 2026-11-02). 몸 scroller가 `native-scroll`이다. 탭 상태 표시가 `--size-icon-sm`이다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build` 통과, 이어서 `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `feat(app): Overview panel tabs with a Project tab`

## T6. 실제 앱 확인

- `/runtime-test`: 격리된 실제 앱(temp userData·HOME·SHELL, branch에서 빌드한 CLI를 `DOAN_CLI`로, `go build -o <tmp>/doan ./cli/cmd/doan`)에서 확인한다.
  - 탭 전환(마우스, ←/→), Tab 순서(tablist → 행 또는 Project tabpanel), 긴 Project 탭을 스크롤해도 머리가 고정됨.
  - Project 탭 값이 그 temp repo의 `<tmp>/doan ls --json`·`<tmp>/doan config --json` 결과와 일치한다(캔버스·design-system 캔버스·프레임 수, branch, Token CSS, Shared with canvases, Doan files). temp repo 하나는 `<tmp>/doan config --storage local --repo <tmp repo> --json`으로 로컬 모드로 바꿔 "Keep out of Git (this Mac only)"를 본다.
  - Project Settings 버튼 → 페이지에서 Token CSS를 바꾸고 돌아오면 새 값이 보이고, 읽기 실패 줄이 보이지 않는다.
  - Project 탭 선택 중 캔버스 대화 하나가 일할 때 spinner, 권한 요청이나 질문을 기다릴 때 손 아이콘이 Conversations 탭에 보이고, 끝나면 사라진다. 실제 provider 턴이 필요하다(서명된 profile이 없으면 확인하지 못한 표면으로 남긴다).
  - 문제 worktree: 열린 Overview의 worktree 폴더를 옮겨 Missing으로 만든 뒤 Project 탭의 Locate로 되찾는다. Config error에서 Details가 band와 탭에 같이 펼쳐지고 toast가 없으며, Retry 뒤 포커스가 Project tabpanel에 있다.
  - 행 Delete 뒤 포커스.
  - Project 탭이 보일 때 Overview의 portal 메뉴 하나(제목 메뉴 또는 모델 picker)와, Project Settings 버튼에 tooltip이 있다면 그 tooltip이 그려지는지 screenshot으로 판단한다(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself').
- 검증: `/runtime-test` 보고와 `.scratch/` screenshot. 확인하지 못한 표면은 BACKLOG 'Not verified' 후보로 남긴다.

## T7. 초안 맞추기

- `/design-sync`: design §5의 frame을 1238 × 780과 960 × 600에서 computed style로 구현과 맞추고, 측정값을 `docs/DESIGN.md` 'Project Overview'에 적는다. status band의 새 설명 줄도 잰다. 회귀는 테스트로 고정한다.
- 검증: `/design-sync` 보고의 불일치 0(또는 DESIGN의 documented deviation), `npm --prefix app test` 통과.
- **commit 경계**: `docs(DESIGN): Overview panel tabs` (구현 수정이 있으면 `fix(app): …`로 따로)

## T8. 승격

- `docs/PRODUCT.md`:
  - §5 item 3 'Project Overview': 오른쪽 패널의 두 탭, 처음 탭과 이번 실행 기억, Project 탭의 줄(Doan files 포함)과 상태, Conversations 탭의 상태 표시(이 worktree의 캔버스 대화만), Project Settings 연결, 키보드를 현재 규칙으로 고쳐 쓴다('Canvas conversations (right panel)' 문단). 'Problem states'에 열린 Overview의 문제 worktree가 Project 탭 안에서도 recovery를 보인다는 것과 Config error·CLI error의 설명 줄을 더한다.
  - §5 item 0 'Project Settings': 여는 길에 Overview Project 탭의 Project Settings 버튼을 더한다.
- `docs/ARCHITECTURE.md` §3 'Design navigation and thumbnail rendering' 'Overview' 줄(패널 구조, 탭, Project 탭의 출처), §7 'Settings IPC'(Overview가 `config:read`의 두 번째 읽는 쪽이고, 페이지 session의 끝이 Overview 마운트 읽기보다 먼저 간다). T2에서 `FolderEntry`에 필드를 더했으면 그것도 적는다.
- `docs/DESIGN.md`: T7이 적은 측정값을 확인하고, 초안과의 차이와 확인하지 못한 표면을 정리한다.
- `docs/BACKLOG.md`: 'Undecided'의 "Project Overview tabs: …" 줄을 지운다. T6에서 확인하지 못한 표면이 있으면 'Not verified'에 적는다.
- `docs/features/overview-tabs/`를 지운다. 이유는 commit 메시지에 쓴다. 문서마다 commit을 나눈다.
- 검증: 확인 명령 미정 — 사용자 확인 필요(PRODUCT §5 item 0·3, ARCHITECTURE, DESIGN에 위 내용이 있고, BACKLOG에 "Project Overview tabs" 줄이 없고, `docs/features/overview-tabs/`가 없는지 사람이 본다).
- **commit 경계**: `docs(product): Overview panel tabs`, `docs(architecture): Overview reads project settings`, `docs(DESIGN): Overview panel tabs measured`(T7 뒤 바뀐 것이 있을 때), `docs(backlog): drop Project Overview tabs`, `docs(feature): remove overview-tabs`
