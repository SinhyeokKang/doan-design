# buzz-add-projects — design

## 레퍼런스

- Buzz(`~/code/buzz-app`, 로컬 HEAD `ec1b9acc`, 기준 커밋 `c40dfdf4`)에는 프로젝트를 추가하는 페이지에 대응하는 화면이 없다. `src/app` 목록(`git ls-tree c40dfdf4 src/app`)에서 가장 가까운 것은 `CommunityRepositoriesSettings.tsx`(저장소 폴더 경로 하나를 고르는 설정 행)이고, 구성으로 참고할 만한 것이 아니다.
- 그래서 시각과 문구의 정본은 이미 Buzz 온보딩을 레퍼런스로 출하된 doan 온보딩 Project 단계다. 화면은 `.doan/canvases/buzz-onboarding.html`의 `project`·`project-local`·`repository-found`·`repository-clone`·`repository-error` 프레임과 Project states 타일, 구현은 `Onboarding.tsx`의 `ProjectScreen`(326행~)과 `projectStep.ts`, 측정값은 [DESIGN 'Onboarding — buzz-onboarding'](../../DESIGN.md#onboarding--buzz-onboarding-first-run-2026-10-29)이다.
- 드롭 표시: Home 입력창의 `.drop-target`(`styles.css:803-804`, accent 2px 점선 외곽선, 패널 55% 섞임과 `--blur-sm`, 투명도 줄이기에서 85%)과 그 이벤트 처리(`HomeComposerView.tsx:334-350`).

## 영향 범위

- **렌더러**
  - `App.tsx`: 화면 모델에 페이지를 더한다(아래 '화면과 이동'). 헤더 캡슐의 Add Projects / Projects 동작, `onAddOutcome`·체크리스트·확인 다이얼로그·`DropOverlay` 배선 제거.
  - 새 `AddProjectsPage.tsx`(페이지 껍데기: 제목, 본문, 하단 Cancel)와 그 세션. 본문은 온보딩 `ProjectScreen`을 재사용한다.
  - `Onboarding.tsx`·`projectStep.ts`: `ProjectScreen`과 `ProjectStepSession`이 두 쓰임(온보딩, 페이지)을 받도록 넓힌다. 'Open a local folder' 카드에 드롭을 더한다(두 쓰임 공통).
  - `homeComposer.ts`: 폴더 드롭 안내 문구.
  - 삭제: `AddProjectsDialog.tsx`(`SetUpFolderConfirm` 포함), `DropOverlay.tsx`, `styles.css`의 `.add-dialog`·`.cl*`·`.drop`·`.drop-zone` 규칙 중 다른 사용처가 없는 것.
- **preload**: `addProjects`, `addDroppedFiles`, `onAddOutcome`, `watchScan`, `cancelScan`, `addCandidates`, `confirmFolder` 중 페이지·온보딩이 쓰지 않는 것을 지운다. 페이지용 project 호출(아래 'main')과 드롭 경로 읽기(`webUtils.getPathForFile`, 한 항목)를 더한다.
- **main**
  - 메뉴 File > Add Project…(`index.ts:265`)는 네이티브 선택 대신 렌더러에 페이지 열기를 보낸다(숨은 창은 먼저 보인다).
  - `menuState.ts`: 페이지 화면과 clone 중 잠금(아래 '메뉴').
  - 페이지용 project 호출: 온보딩 세션 밖에서 `inspectPath`·`inspectUrl`·`selectProject`·`cloneProject`·`cloneDestination`(모두 `onboarding/projects.ts`)과 `chooseFolder`(`index.ts:485`)를 쓰는 IPC. 온보딩 세션, 완료 기록, `no_ready_agent` 검사, socket·CLI·MCP를 거치지 않는다. 요청 모양 검사는 순수 함수로 둔다.
  - `addProjects.ts`: 온보딩 등록(`projectDeps.add`, `index.ts:640-655`)이 쓰는 판단(`flow.add`, `flow.confirm`)은 남긴다. 체크리스트 스캔(`watchScan` 진행, `addCandidates`, 워크트리 제안), `droppedPaths`, `folders:add`·`folders:add-paths`·`folders:add-candidates` 채널은 사용처가 없어지면 지운다. 무엇이 고아가 되는지는 구현 때 `rg`로 확인한다.
- **CLI, `doan mcp`, 스킬, 포맷**(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 socket 메시지): 변경 없음. `onboarding_*` 응답 모양도 그대로다.
- **ui-state.json**: 모양 변경 없음. 페이지는 저장하지 않는다(아래).

## 화면과 이동

- 화면은 `home | workspace`에 `addProjects`를 더한다. 페이지는 Home처럼 헤더·LNB·흰 본문 패널 안에 그린다. 워크스페이스는 Home과 같은 방식(`visibility: hidden`, `inert`, `display: none` 금지, ARCHITECTURE §7 'Memory')으로 숨겨 캔버스·뷰·선택·드래프트·`doan active`가 그대로다.
- **origin**: 페이지를 열 때의 화면(`home` 또는 `workspace`)을 기억한다. Projects 탭, 페이지 Cancel(clone 중이 아닐 때), Escape는 origin으로 돌아간다. 페이지에서 이미 페이지를 다시 여는 진입(Cmd+O, Add Projects 탭)은 아무 일도 하지 않는다.
- **추가 완료**: Home으로 간다. 입력창 프로젝트 선택기에 그 root를 고르고, LNB 행을 2.4초 강조한다(지금 중복 추가의 `setHighlight`·`choose`, `App.tsx:432`). 이미 등록된 폴더·저장소를 골랐을 때도 같다.
- **LNB 행**: 페이지에서 LNB 행을 누르면 그 워크스페이스로 간다(페이지를 떠난다). origin이 아닌 곳으로 가는 일반 이동이다.
- **기록·복원**: 페이지는 Back/Forward 방문(PRODUCT §5 항목 1)이 아니다. 재시작 복원에는 origin 화면이 저장된다(`savedUiState`의 `screen`은 `home | workspace` 그대로).
- **페이지 상태**: 열 때마다 처음(choose)부터다. 떠날 때 진행 중인 확인·inspect는 취소한다(결과가 와도 버린다).
- **clone 중 잠금**: phase가 `cloning`(취소 중 포함)이면 페이지를 떠나는 모든 경로를 막는다. 헤더 Add Projects·Projects 탭과 LNB 행은 클릭을 무시하고(disabled 대신 `aria-disabled`로 두어 포커스 순서를 지킨다), Escape는 아무것도 하지 않고, 메뉴 항목은 비활성이다. 페이지의 Cancel은 clone 멈춤(온보딩 `cancelClone`)이다.
- **Settings**: 헤더 Settings는 지금처럼 별도 창을 연다(`buzz-settings` 전까지). clone 중에도 열 수 있다(페이지를 떠나지 않는다).
- **포커스**: 페이지에 들어오면 제목(`h1`, `tabIndex=-1`)에 포커스를 둔다(온보딩 Project 단계의 `heading`과 같다). origin으로 돌아가면 그 화면의 기존 복귀 규칙(Home은 입력창, 워크스페이스는 이전 컨트롤)을 쓴다.
- POSTMORTEM 2026-10-27 'Shell navigation shortcuts lost destination ownership': 새 이동 경로를 더하므로 `rg -n 'validHistoryVisit|showOverview\(|workspaceMemory.set|cancelWorkspaceOpen|aria-current|repairRoot' app/src/renderer/{App.tsx,CanvasController.ts,ShellSidebar.tsx}`를 돌려 페이지 진입·복귀가 방문 기록과 workspace memory를 쓰지 않는지 확인한다. 2026-10-25 'Delayed startup restoration replaced newer navigation': 페이지 진입은 명시적 이동이므로 적용 전 복원을 취소한다.

## 페이지 구성

- 본문은 온보딩 Project 단계의 phase별 화면을 그대로 쓴다: choose(로컬 폴더 카드, "or use GitHub", URL 입력), inspecting, candidates(저장소 고르기 라디오 카드), checking, setup(추가될 파일과 Set up), selecting, clone(위치와 Change), cloning, cloneCancelled, 오류 notice와 복구 버튼.
- 온보딩과 다른 점:
  - 제목·설명: 초안에서 정한다. 제안은 "Add a project" / "Start with a folder on your Mac, or a GitHub repository."다.
  - 'Your projects' 목록이 없다.
  - 하단: 온보딩 Footer(Back to Agent, Open Doan) 대신 왼쪽 Cancel(origin 복귀, clone 중에는 clone 멈춤)과 오른쪽 주 버튼이다. 주 버튼 문구는 phase에 따른다(candidates는 "Use this folder"). 등록이 끝나면 바로 Home으로 가므로 온보딩의 ready·completing phase는 쓰지 않는다.
  - setup의 주 버튼 문구: 온보딩 "Set up and continue" 대신 "Set up and add"를 제안한다(초안에서 확정).
  - `no_ready_agent` notice가 없다. 프로젝트 추가에는 에이전트가 필요 없다.
  - 완료 기록(`onboarding.json`)을 쓰지 않는다.
- 단계 표시(Welcome의 1·2 단계 pill)는 없다.
- 페이지 폭과 세로 배치는 온보딩 Project 단계의 본문 열을 흰 본문 패널 가운데에 둔다. 값은 초안에서 정하고 `/design-sync`로 잰다.

## 폴더 드롭

- 대상: 'Open a local folder' 카드(`.ob-local-option`) 하나. 페이지와 온보딩 Project 단계에서 같다. 카드가 보이는 choose phase에서만 받는다.
- 끄는 동안: 카드 위에 `.drop-target`과 같은 외곽선·흐림을 그리고, `role="status"`로 "Drop to add this folder"(제안)를 알린다. busy 중에는 `dropEffect = "none"`이고 표시를 그리지 않는다.
- 놓았을 때(`dropFolder` 순수 판정, 아래 4):
  - 항목 하나이고 폴더면 Choose folder로 그 경로를 고른 것과 같다(`chooseFolder`의 결과 경로를 대신한다).
  - 여러 항목이면 notice "Drop one folder at a time."(제안), 폴더가 아니면 "Only folders can be added."(지금 문구, `addProjects.ts:13`).
  - 폴더 판정은 `webkitGetAsEntry().isDirectory`(Home 입력창과 같다)로 하고, 경로는 preload의 `webUtils.getPathForFile`로 읽는다. main은 받은 경로를 지금 드롭과 같은 제한(절대 경로, 길이)으로 검사하고 `canonicalFolder`를 거친다.
- 카드 밖: 창의 `dragover`·`drop`은 기본 동작만 막고 아무 일도 하지 않는다. 막지 않으면 Electron 창이 그 파일로 이동한다. 이 전역 방지는 `DropOverlay`를 지울 때 남겨야 하는 유일한 부분이다. 커서는 `dropEffect = "none"`이다.
- Home 입력창 위 폴더 드롭 안내(`homeComposer.ts:25`): "Folders can’t be attached. Add a project from Add Projects."(제안).

## 메뉴

- `menu:state`의 `screen`에 `"addProjects"`를 더하고 `locked`(clone 중)를 더한다.
  - 페이지: Add Project…는 활성이고 페이지에서는 아무것도 하지 않는다. Go > Home은 활성(Home으로 이동, origin과 관계없이). Quick Open은 활성(결과를 고르면 페이지를 떠난다). 캔버스 보기 명령(Zoom, Fit, Reload)은 비활성.
  - `locked`: Add Project…, Home, Quick Open, Back/Forward, Next/Previous Resolved Comment, Undo Remove가 비활성이다. Settings…는 활성이다.
- 지금의 modal 규칙(다른 모달이 열려 있으면 비활성)과 Settings 창 포커스 규칙은 그대로다.

## main의 페이지용 project 호출

- 채널(이름은 구현에서 정한다): inspect(local path | GitHub URL), select(path, initialize, url?), cloneDestination, clone(url, destination) + 진행·취소, chooseFolder(project | destination), dropPath.
- 모두 main 창에서 온 요청만 받는다(`fromWindow`). 요청 모양은 순수 함수 `addPageRequest(value)`로 검사한다(알 수 없는 키, 문자열 길이, URL 파싱은 `parseGitHubUrl`).
- 등록은 온보딩과 같은 `projectDeps`(판단은 `addFlow.add`, 설정은 `ready.initialize`)를 쓴다. 등록·설정 결과는 지금처럼 폴더 목록 갱신으로 렌더러에 알린다.
- clone은 온보딩 세션과 따로 한 번에 하나다. 온보딩 세션의 clone과 동시에 돌 수는 없다(첫 실행 중에는 Add Project…가 비활성이다, PRODUCT §5 항목 0).
- 오류 코드는 온보딩 `OnboardingOperationErrorCode`를 그대로 쓰고, 렌더러는 `projectNotice`(`Onboarding.tsx:253`)로 같은 문구를 고른다.

## 순수 함수 (`/tdd` 대상)

1. `addPageReturn(origin, event)` — Projects 탭·Cancel·Escape·완료·LNB 행이 갈 곳(origin, Home+선택, 대상 워크스페이스, 무시).
2. `leaveLocked(phase)` — clone 중 잠금 판정. 메뉴 상태·헤더·LNB·Escape가 함께 쓴다.
3. `menuItems(context)` 확장(`menuState.ts`) — `addProjects` 화면과 `locked`.
4. `dropFolder(items)` — 카드 드롭 판정: `{ kind: "folder", index }` | `{ kind: "notice", text }`(여러 개, 폴더 아님, 빈 목록).
5. `ProjectStepSession`의 쓰임(`"onboarding" | "addPage"`)에 따른 하단 버튼·주 버튼 문구·완료 동작 선택(`projectFooter(use, phase)`). 온보딩 쪽 결과는 지금과 같다.
6. `addPageRequest(value)` — main IPC 요청 검사.
7. `homeComposer`의 폴더 드롭 안내 문구(기존 `dropTarget` 테스트 갱신).

## 포맷·컨벤션·결정 영향

- **포맷**: 없음. JSON Schema와 `v` 변화 없음. `onboarding_*` socket·CLI·MCP 응답 fixture는 그대로다.
- **컨벤션(ARCHITECTURE §1)·`doan check` 규칙**: 없음.
- **구조 결정**: git 미조작 — clone은 온보딩과 같은 사용자의 기존 Git 자격으로 하고 새 git 동작을 더하지 않는다. 앱이 중첩 저장소를 만들지 않는 규칙(2026-10-24)은 `addFlow` 판단과 `ready.initialize`의 위쪽 확인을 그대로 쓰므로 유지된다. 렌더러가 경로를 고르는 곳은 드롭 하나뿐이고 main이 검사한다(지금 드롭과 같다).
- **제품 결정(승격 때 PRODUCT §7)**: 확정한 결정 1~7. 대체: 2026-10-24 projects-home 결정 3(대화상자·창 드롭, 하위 저장소와 다른 워크트리 제안), 2026-10-25 R1의 체크리스트 부분, 2026-10-25 'Checking… candidates'·'Scan snapshots' 행, 2026-10-25 'File > Add Project… (Cmd+O) … opens the picker'의 picker 부분, PRODUCT §5 항목 0 헤더 문장(Projects는 이제 이동한다), §5 항목 1 Add Projects 문단, buzz-home의 "dropped elsewhere they still add a project". 부모 공통 결정 6(기존 기능 보존)의 예외와 공통 결정 10의 `AddProjectsDialog` 삭제를 부모 spec에 적는다.
- **PoC 의존**: 없다.

## 초안 (`/design-draft`)

- 경로와 id: `.doan/canvases/buzz-add-projects.html`, `doan:canvas` `buzz-add-projects`.
- 프레임(창 전체, 헤더·LNB 포함): `choose`, `drop`(카드 드롭 중), `checking`, `candidates`(저장소 7개, 긴 이름·경로), `setup`, `selecting`, `url-inspecting`, `repository-found`, `clone`, `cloning`(헤더 탭·Back·Search·LNB 행 잠금 표시와 이유 한 줄), `clone-cancelled`.
- 타일: `states-errors`(access_failed, remote_mismatch, project_unavailable), `states-drop`(여러 항목, 폴더 아님), `states-onboarding-drop`(온보딩 Project 단계 카드의 드롭 중), `states-home-drop`(Home 입력창 폴더 드롭 안내).
- 워크스페이스에서 연 choose는 따로 그리지 않는다. 페이지에서는 LNB 행에 `aria-current`가 없어 Home에서 연 것과 화면이 같다(초안 1차, 2026-10-30).
- 초안 2차(2026-10-30 user): 긴 저장소 목록은 Quick Open 결과처럼 목록만 스크롤한다. 제목·Choose another folder·하단 버튼은 고정이고, 목록이 그 사이 남은 높이를 쓰며(최소 행 2개), 위쪽 8px 페이드, `overscroll-behavior: contain`, 카드 그림자·포커스 링을 위한 4px 안쪽 여백을 둔다(`styles.css`의 `.qo-height`·`.qo-list`와 같은 방식). 창이 고정 부분보다 낮을 때만 열 전체가 스크롤된다.
- 아래 초안 1차 제안 문구는 사용자가 확정했다(2026-10-30 "문구는 괜찮"). 초안 1차 제안 문구: 제목 "Add a project", 주 버튼 "Set up and add"·"Clone and add", 드롭 status "Drop to add this folder", notice "Drop one folder at a time.", Home 안내 "Folders can’t be attached. Add a project from Add Projects.", clone 중 "Stay on this page until the clone finishes, or cancel it."(critique: 잠긴 탭만으로는 떠날 수 없는 이유가 보이지 않는다).
- 기존 `buzz-onboarding.html`은 고치지 않는다(공통 결정 11).

## 가져오지 않는 것

- 지금 체크리스트의 진행 표시("n of N checked"), 체크박스, "Already added" 칩, 워크트리 하위 행.
- 창 전체 드롭 오버레이("Drop folders to add").
- 추가 뒤 워크스페이스의 "Added <이름>" 토스트와 Open.

## POSTMORTEM 함정

- **2026-10-25 — An unreadable add pick was offered for set-up as a folder without repos**: 읽을 수 없는 폴더를 빈 폴더로 다루지 않는다. 온보딩 `inspectFolder`가 이미 `null`을 `project_unavailable`로 돌리므로(`projects.ts:89-92`) 그 경로를 그대로 쓰고, 드롭 경로에도 같은 테스트를 둔다.
- **2026-10-25 — A static draft's overflow match hid an unusable checklist**: candidates 목록이 길 때(저장소 20개 이상) 페이지 본문이 스크롤되어 마지막 카드와 주 버튼에 닿는지 실제 앱에서 본다.
- **2026-10-25 — Production CSS extraction concealed missing development styles**: 새 CSS는 `styles.css`에만 두고 JS에서 import하지 않는다. 드롭 표시와 페이지 열 너비를 개발·프로덕션 빌드에서 잰다.
- **2026-10-27 — Shell navigation shortcuts lost destination ownership**·**2026-10-25 — Delayed startup restoration replaced newer navigation**: 위 '화면과 이동'.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 완료 뒤 Home 선택은 새 폴더 목록을 기다려야 한다. 지금 중복 추가가 쓰는 `choose`의 대기 경로를 재사용하고, 등록 직후 목록에 아직 없는 root를 첫 행으로 바꾸지 않는다.
- **2026-10-25 — A toast's Open was dropped while its project was still loading**: 같은 원인. 완료 동작이 읽는 중인 root를 한 번만 보고 버리지 않게 한다.
