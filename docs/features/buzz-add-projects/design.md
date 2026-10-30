# buzz-add-projects — design

## 레퍼런스

- Buzz(`~/code/buzz-app`, 로컬 HEAD `ec1b9acc`, 기준 커밋 `c40dfdf4`)에는 프로젝트를 추가하는 페이지에 대응하는 화면이 없다. `src/app` 목록(`git ls-tree c40dfdf4 src/app`)에서 가장 가까운 것은 `CommunityRepositoriesSettings.tsx`(저장소 폴더 경로 하나를 고르는 설정 행)이고, 구성으로 참고할 만한 것이 아니다.
- 그래서 시각과 문구의 정본은 이미 Buzz 온보딩을 레퍼런스로 출하된 doan 온보딩 Project 단계다. 화면은 `.doan/canvases/buzz-onboarding.html`의 `project`·`project-local`·`repository-found`·`repository-clone`·`repository-error` 프레임과 Project states 타일, 구현은 `Onboarding.tsx`의 `ProjectScreen`(326행~)과 `projectStep.ts`, 측정값은 [DESIGN 'Onboarding — buzz-onboarding'](../../DESIGN.md#onboarding--buzz-onboarding-first-run-2026-10-29)이다.
- 드롭 표시: Home 입력창의 `.drop-target`(`styles.css:803-804`, accent 2px 점선 외곽선, 패널 55% 섞임과 `--blur-sm`, 투명도 줄이기에서 85%)과 그 이벤트 처리(`HomeComposerView.tsx:334-350`).

## 영향 범위

- **렌더러**
  - `App.tsx`: 화면 모델에 페이지를 더한다(아래 '화면과 이동'). 헤더 캡슐의 Add Projects / Projects 동작, 이동 함수의 잠금 판정, `onAddOutcome`·`scan`·`confirms`·`added()`·체크리스트·확인 다이얼로그·`DropOverlay` 배선 제거.
  - 새 `AddProjectsPage.tsx`(페이지 껍데기: 본문, 하단 Cancel)와 그 세션. 본문은 온보딩 `ProjectScreen`을 재사용한다.
  - `Onboarding.tsx`·`projectStep.ts`: `ProjectScreen`과 `ProjectStepSession`이 두 쓰임(온보딩, 페이지)을 받도록 넓힌다. `ProjectStepSession`의 `api`와 세션 id만 쓰임별로 바꾼다. Wizard의 Project 단계 포커스 effect(`Onboarding.tsx:517-545`)를 공용 훅으로 뺀다(아래 '포커스'). '온보딩과의 공유'의 개선 셋을 두 쓰임에 함께 넣는다.
  - `HomeComposerView.tsx:514, 517`: Add Projects…가 페이지를 연다.
  - `homeComposer.ts`: 폴더 드롭 안내 문구와 `dropTarget`의 `project` 분기(`homeComposer.ts:437-439`) 정리.
  - 삭제: `AddProjectsDialog.tsx`(`SetUpFolderConfirm` 포함), `DropOverlay.tsx`, `styles.css`의 `.add-dialog`·`.cl*`·`.drop`·`.drop-zone`·`.home-shell ~ .drop`(`styles.css:710`) 규칙 중 다른 사용처가 없는 것.
- **preload**: `addProjects`, `addDroppedFiles`, `onAddOutcome`, `watchScan`, `cancelScan`, `addCandidates`, `confirmFolder`, `AddOutcome`·`ScanSnapshot` import(`preload/index.ts:18`)를 지운다. 페이지 project 호출(아래 'main')을 더한다. 드롭 경로는 preload의 `webUtils.getPathForFile`로 읽어 inspect의 path로 보낸다(새 채널 없음).
- **main**
  - 메뉴 File > Add Project…(`index.ts:265`)는 네이티브 선택 대신 렌더러에 페이지 열기를 보낸다(숨은 창은 먼저 보인다). `addFromDialog`는 지운다.
  - `menuState.ts`: `menuState(screen, modalOpen, toastOpen, context)`(`menuState.ts:19`)에 페이지 화면과 `locked`를 더하고, `menu:state` 파서와 비교(`index.ts:321, 331`)도 같이 고친다.
  - 공유 project 클래스(아래 'main의 project 처리').
  - `addProjects.ts`: 한 경로를 판정하는 store·duplicate·confirm만 남긴다. 체크리스트 스캔(`Scan`, `scanCandidates`, `progress`, 워크트리 제안), 여러 경로 처리, `droppedPaths`, `folders:add`·`folders:add-paths`·`folders:add-outcome`·`folders:scan`·`folders:scan-cancel`·`folders:add-candidates`·`folders:confirm-folder` 채널을 지운다. `gitChildren`·`hasGitEntry`는 `onboarding/projects.ts:4`가 쓰므로 남긴다.
  - `senderAllowed.ts:5-6`: 지운 채널을 빼고 페이지 채널을 main 전용으로 더한다. ARCHITECTURE §7의 allowlist 표도 승격 때 고친다.
- **CLI, `doan mcp`, 스킬, 포맷**(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 socket 메시지): 변경 없음. `onboarding_*` 응답 모양도 그대로다.
- **ui-state.json**: 모양 변경 없음. 페이지는 저장하지 않는다(아래).

## 화면과 이동

- 화면은 `home | workspace`에 `addProjects`를 더한다. 페이지는 Home처럼 헤더·LNB·흰 본문 패널 안에 그린다. 워크스페이스는 Home과 같은 방식(`visibility: hidden`, `inert`, `display: none` 금지, ARCHITECTURE §7 'Memory')으로 숨겨 캔버스·뷰·선택·드래프트·`doan active`가 그대로다.
- **두 값을 가정하던 곳**(tech 리뷰): 아래를 페이지에 맞게 고친다.
  - 포커스 effect의 else 분기(`App.tsx:234-243`): 페이지에서는 워크스페이스 포커스를 실행하지 않는다.
  - 메뉴 화면 매핑(`App.tsx:495`): 페이지는 `canvas`가 아니라 `addProjects`다.
  - `closeReview`(`App.tsx:497`): 페이지에서도 닫는다.
  - 워크스페이스 `inert`·`aria-hidden`(`App.tsx:586`): 페이지에서도 숨긴다.
  - Quick Open·FirstPrompt의 root(`App.tsx:547, 599`): 페이지에서는 현재 root가 없다.
  - `toggleProject`의 `=== "home"`(`App.tsx:371`): 페이지에서 로드된 프로젝트 행을 누르면 그 워크스페이스로 간다.
  - `homeRun.ts:17, 221`의 화면 타입, `savedUiState` 입력 타입(`App.tsx:52`): 페이지에서는 origin을 저장한다.
- **origin**: 'Projects 쪽 마지막 화면'(`home` 또는 `workspace`)이다. 페이지를 열 때 정한다. `buzz-settings`가 Settings 탭을 더해도 Add Projects → Settings → Projects가 이 값으로 돌아오도록, 바로 앞 화면이 아니라 Projects 쪽 화면을 기억한다. 페이지마다 LNB 내용이 바뀌는 것을 막는 가정은 두지 않는다.
- **돌아가기**: Projects 탭, 헤더 Back 버튼, 페이지 Cancel, Escape는 origin으로 간다. origin이 워크스페이스인데 그 root가 목록에 없으면 Home이다. 헤더 Forward 버튼은 페이지에서 비활성이다. Back/Forward에는 키보드 단축키가 없다. Cmd+[ / Cmd+]는 Previous/Next Resolved Comment(`index.ts:309-310`)이고 페이지에서는 비활성이다('메뉴'). 편집 중인 입력(URL 필드, IME 조합)에서는 Escape가 페이지를 떠나지 않는다(캔버스의 `editableTarget` 가드와 같은 규칙).
- **다시 열기**: 페이지에서 Add Projects 탭은 아무 일도 하지 않는다. Cmd+O는 choose phase에서 Choose folder를 열고, 다른 phase에서는 비활성이다('메뉴').
- **추가 완료**: Home으로 간다. 입력창 프로젝트 선택기에 그 root를 고르고, LNB 행을 2.4초 강조한다(지금 중복 추가의 `setHighlight`·`choose`, `App.tsx:433`). 이미 등록된 폴더·저장소를 골랐을 때도 같다. Home에 오면 입력창에 포커스가 가고 선택기가 그 이름을 읽으므로, 화면 낭독기 사용자도 결과를 듣는다.
- **LNB 행**: 페이지에서 LNB 행을 누르면 그 워크스페이스로 간다(페이지를 떠난다). origin 워크스페이스에 드래프트가 있으면 지금의 draft guard가 뜬다.
- **기록·복원**: 페이지는 Back/Forward 방문(PRODUCT §5 항목 1)이 아니다. 재시작 복원에는 origin 화면이 저장된다(`savedUiState`의 `screen`은 `home | workspace` 그대로). 페이지 진입은 명시적 이동이므로 적용 전 startup 복원을 취소한다.
- **페이지 상태**: 열 때마다 처음(choose)부터다. 떠날 때 진행 중인 inspect는 취소한다(결과가 와도 버린다). 잠금 phase에서는 떠날 수 없으므로 select·clone 결과를 버리는 경우가 없다.
- **창**: Cmd+W로 창을 숨기면 페이지와 진행 중인 작업이 유지되고, 다시 보이면 그대로다. 앱 종료는 '종료와 reload'.

## 잠금 (2026-10-30 user, feature-review)

- 잠금 phase: `selecting`, `cloning`(취소 중 포함). `leaveLocked(phase)` 하나로 판정한다.
- **판정 위치**: App의 이동 함수가 한 곳에서 판정한다. 요소마다 `aria-disabled`를 붙이는 것만으로는 막지 못한다(토스트 Open, 코멘트 가드, 키보드 활성화가 샌다). 대상: `home`, `enter`, `openShellCanvas`, `showShellOverview`, `toggleProject`, 워크트리 선택, `search`, `travel`(Back/Forward), Quick Open `pick`, HomeRun host의 `openOverview`·`openCanvas`(`homeRun.ts:116`), FirstPrompt 토스트의 Open, 코멘트 가드의 `showWorkspace`(`useComments.tsx:516, 519`), 페이지를 떠나는 Projects 탭과 Escape. 잠긴 동안 이 함수들은 아무 일도 하지 않는다.
- **표시**: 헤더 Add Projects·Projects 탭, Back, Search, LNB 행, 프로젝트 메뉴의 Overview·워크트리 항목은 `aria-disabled`이고 disabled 잉크다(초안 `cloning`). disabled 대신 `aria-disabled`라 포커스 순서가 유지된다. Show in Finder·Project Settings·펼치기와 Settings는 허용한다.
- **메뉴**: '메뉴'의 `locked` 목록.
- **이유**: `cloning`에만 진행 표시 아래 "Stay on this page until the clone finishes, or cancel it."을 보인다. `selecting`은 짧아서 이유 줄이 없다.
- **멈추기**: clone은 진행 표시 아래 인라인 Cancel로 멈춘다(온보딩 `cancelClone`과 같은 정리). 잠금 동안 하단 Cancel은 보이지 않는다(초안 `cloning`). `selecting`은 멈출 수 없고 하단 버튼도 없다(초안 `selecting`).
- **buzz-settings 메모**: Settings가 페이지가 되면 Settings 탭과 Settings…(Cmd+,)도 잠금 대상이 된다. 지금은 별도 창이라 페이지를 떠나지 않으므로 허용한다.

## 포커스 (feature-review)

- Wizard의 Project 단계 포커스 회복(`Onboarding.tsx:517-545`: 폴더 시트를 닫으면 연 버튼으로, URL 요청이면 URL 필드로, 오류면 alert로, 진행 중이면 status로, 그 밖에는 `data-consent`가 아닌 첫 액션으로, `projectFocusTarget`)을 공용 훅으로 뺀다. 페이지와 온보딩이 같이 쓴다. 페이지는 `agentReady=true`를 넘긴다. 사용자가 쥐고 있는 포커스는 옮기지 않는 규칙도 같다.
- 진입: 페이지에 들어오면 공용 `ProjectScreen`의 제목 요소(온보딩과 같은 `h2`, `tabIndex=-1`)에 포커스를 둔다. 페이지 랜드마크(`main`)는 이 제목으로 이름을 얻는다.
- 복귀: origin으로 돌아가면 그 화면의 기존 복귀 규칙(Home은 입력창, 워크스페이스는 이전 컨트롤, 사라졌으면 사이드바 트리)을 쓴다.
- 이름이 같은 Cancel: `url-inspecting`의 인라인 Cancel은 확인을 멈추고 하단 Cancel은 페이지를 떠난다. 보이는 문구는 그대로 두고 인라인 버튼에 `aria-label="Cancel check"`를 준다.
- POSTMORTEM 2026-10-27 'Shell navigation shortcuts lost destination ownership': 새 이동 경로를 더하므로 `rg -n 'validHistoryVisit|showOverview\(|workspaceMemory.set|cancelWorkspaceOpen|aria-current|repairRoot' app/src/renderer/{App.tsx,CanvasController.ts,ShellSidebar.tsx}`를 돌려 페이지 진입·복귀가 방문 기록과 workspace memory를 쓰지 않는지 확인한다.

## 페이지 구성

- 본문은 온보딩 Project 단계의 phase별 화면을 그대로 쓴다: choose(로컬 폴더 카드, "or use GitHub", URL 입력), inspecting, candidates(저장소 고르기 라디오 카드), checking, setup(설명과 Set up), selecting, clone(위치와 Change), cloning, cloneCancelled, 오류 notice와 복구 버튼.
- 온보딩과 다른 점은 '온보딩과의 공유' 표뿐이다. 하단은 왼쪽 Cancel(origin 복귀)과 오른쪽 주 버튼이고, 잠금 phase에서는 하단이 없다. 주 버튼 문구는 phase에 따른다(candidates "Use this folder", clone "Clone and add"). 등록이 끝나면 바로 Home으로 가므로 온보딩의 ready·completing phase는 쓰지 않는다. 완료 기록(`onboarding.json`)을 쓰지 않는다.
- 단계 표시(1·2 단계 pill)는 없다.
- 본문 열(560px)을 흰 본문 패널 가운데에 두고, 패널 자체가 스크롤된다(초안 3차).

## 폴더 드롭

- 대상: 'Open a local folder' 카드(`.ob-local-option`) 하나. 페이지와 온보딩 Project 단계에서 같다. 카드가 보이는 choose phase에서만 받는다.
- 끄는 동안: 카드 위에 `.drop-target`과 같은 외곽선·흐림을 그리고, `role="status"`로 "Drop to add this folder"를 알린다. busy 중에는 `dropEffect = "none"`이고 표시를 그리지 않는다. 포인터가 카드 밖에서 놓이거나 창이 포커스를 잃으면 표시를 지운다.
- 놓았을 때(`dropFolder` 순수 판정, 아래 4):
  - 항목 하나이고 폴더면 Choose folder로 그 경로를 고른 것과 같다. 경로는 preload가 `webUtils.getPathForFile`로 읽고, 세션의 inspect(path)로 보낸다. main은 `canonicalFolder`와 같은 검사를 거친다(`service.ts:278-279`와 같은 경로).
  - 여러 항목이면 "Drop one folder at a time.", 폴더가 아니면 "Only folders can be added."(지금 문구, `addProjects.ts:13`). 둘 다 카드 아래의 `role="alert"` notice이고 포커스를 옮기지 않는다. 다음 드래그나 Choose folder에서 지운다.
  - inspecting 중에 다시 놓은 드롭은 busy라 받지 않는다.
- 카드 밖: 창의 `dragover`·`drop`은 기본 동작만 막고 아무 일도 하지 않는다. 커서가 `dropEffect = "none"`이 되게 하려는 것이다. 창이 파일로 이동하는 일은 이미 main이 막는다(`index.ts:87`, `will-navigate`).
- Home 입력창 위 폴더 드롭 안내(`homeComposer.ts:25`): "Folders can’t be attached. Add a project from Add Projects."

## 온보딩과의 공유 (2026-10-30 user)

페이지와 온보딩 Project 단계는 한 화면(`ProjectScreen`, `projectStep.ts`, 포커스 훅, `.ob-*` 규칙)과 main의 project 클래스를 쓰고, 한쪽에서 생긴 디자인 개선은 다른 쪽에도 들어간다. 쓰임별로 다른 것은 아래 표뿐이다. 새 차이가 필요하면 이 표에 더하고 이유를 적는다.

| 항목 | 온보딩 | 페이지 | 이유 |
|---|---|---|---|
| 제목·설명(choose) | "Choose your project" | "Add a project" | 첫 실행은 프로젝트를 정하는 단계, 페이지는 하나 더하는 일 |
| 'Your projects' 목록 | 있음 | 없음 | 등록된 프로젝트는 이미 LNB에 있다 |
| 하단 | Back(Agent로)·Open Doan | Cancel(origin으로)·단계 동작, 잠금 중 없음 | 페이지에는 앞뒤 단계가 없다 |
| 주 버튼 문구 | "Set up and continue", "Clone and continue" | "Set up and add", "Clone and add" | 다음에 일어나는 일이 다르다 |
| ready 단계 | "Your project is ready" 뒤 Open Doan | 없음, 바로 Home | 페이지는 완료 기록이 없다 |
| `no_ready_agent` notice | 있음 | 없음 | 프로젝트 추가에는 에이전트가 필요 없다 |
| 표면 | 창 전체 유리(AppShell 반투명) | 흰 본문 패널 | 첫 실행은 셸 밖, 페이지는 셸 안 |
| main 인스턴스 | `OnboardingService`의 project 인스턴스 | 페이지 project 인스턴스 | 세션·완료 기록·CLI·MCP는 첫 실행만 |

이번에 온보딩에 들어가는 개선:

1. **카드 드롭**: 위 '폴더 드롭' 그대로. 온보딩 세션의 inspect가 Choose folder 결과 대신 드롭 경로를 받는다(같은 main 검사, 같은 요청 모양).
2. **스크롤 컨테이너**: 지금 온보딩은 `.ob-scene`(560px 열)이 `native-scroll`로 스크롤돼 스크롤바가 열 옆에 붙는다. 열 바깥에 화면 전체 폭의 스크롤 영역(`.ob-chrome` 아래, `overflow-y: auto`, `overscroll-behavior: contain`, `.doan-scroll`)을 두고 `.ob-scene`은 최소 그 높이의 열로 둔다. 페이지는 흰 패널이 같은 역할이다. 스크롤바는 얇은 macOS 스타일(`scrollbar-width: thin`, `--scrollbar-thumb-quiet`)이고, `native-scroll`의 8px WebKit 스크롤바 규칙은 이 두 곳에서 쓰지 않는다. Agent·Project 단계가 같은 장면 구조라 함께 바뀐다. Welcome은 스크롤되지 않으므로 보이는 변화가 없어야 하고, 그 세로 가운데 정렬(`styles.css:291-293`)을 `/design-sync`에서 잰다. 포커스 이동 코드가 쓰는 `.ob-scene` 선택자(`Onboarding.tsx:539-540`)는 그대로 둔다.
3. **clone 중 이유 한 줄**: 진행 표시와 Cancel 아래 `.ob-fine` "Stay on this page until the clone finishes, or cancel it." 온보딩에서는 Back과 단계 pill이 이미 busy 중 비활성이고, 이 줄이 그 이유를 말한다.

## 메뉴

- `menuState`에 `screen: "addProjects"`와 `context.locked`를 더한다.
  - 페이지: Add Project…는 choose phase에서만 활성(Choose folder를 연다). Go > Home은 활성(origin과 관계없이 Home). Quick Open은 활성(결과를 고르면 페이지를 떠난다). 캔버스 보기 명령(Zoom, Fit, Reload)과 Next/Previous Resolved Comment는 비활성.
  - `locked`: Add Project…, Home, Quick Open, Next/Previous Resolved Comment, Undo Remove가 비활성이다. Settings…는 활성이다.
- 지금의 modal 규칙(다른 모달이 열려 있으면 비활성)과 Settings 창 포커스 규칙은 그대로다.

## main의 project 처리 (2026-10-30 user, feature-review)

- `OnboardingService`에서 project 부분을 클래스(가칭 `ProjectAdder`)로 뗀다: inspect 세대와 오래된 요청 거부(`not_candidate`, `inspection_stale`, `initialize_required`, `service.ts:305-315`), busy, leftovers 기록(`service.ts:329-343`), clone 추적과 D19 commit(`:338`), 종료 정리(`closeForQuit`·`quit`, `service.ts:235-246`). `OnboardingService`는 이 클래스의 인스턴스 하나를 쓰고, 세션·완료 기록·socket·CLI·MCP는 그대로 서비스에 남는다. 응답 모양이 바뀌지 않는 것을 기존 테스트로 확인한다.
- 페이지는 같은 클래스의 두 번째 인스턴스를 쓴다. 요청과 응답은 온보딩의 project DTO(`OnboardingResponse`의 project 부분, `operationId`, 변경 알림)와 같은 모양이라 렌더러 `ProjectStepSession`은 `api`와 세션 id만 바꿔 재사용한다.
- 채널: 페이지용 read·changed·inspect·select·clone·cancel. 폴더 고르기는 기존 `onboarding:choose-folder`(세션과 무관, `index.ts:985`)를 쓴다. 모두 `fromWindow`와 `senderAllowed`의 main 전용 목록을 거친다. 요청 모양은 순수 함수 `addPageRequest(value)`로 검사한다(알 수 없는 키, 문자열 길이 4096, 절대 경로, URL은 `parseGitHubUrl`).
- 동시성: clone은 인스턴스마다 한 번에 하나다. 두 인스턴스는 부모 폴더별 leftovers 기록과 clone 대상 잠금을 공유한다(CLI·MCP의 온보딩 clone은 첫 실행 뒤에도 받을 수 있다, `service.ts:187-210`). 같은 대상으로 두 번째 clone이 오면 `busy`로 거절한다.
- 종료와 reload: 앱 종료(`before-quit`, `index.ts:1064-1077`)는 두 인스턴스 모두 온보딩처럼 clone을 멈추고 정리한다(5초 대기 포함). clone은 detached 프로세스 그룹이라 정리하지 않으면 git이 남는다. 렌더러 reload·`render-process-gone`은 페이지 인스턴스의 clone을 취소하고 정리한다. Cmd+W 숨김은 아무것도 멈추지 않는다.
- 등록은 지금처럼 `projectDeps`(판단은 한 경로 `addFlow`, 설정은 `ready.initialize`)를 쓴다. `flow.add`는 워크트리 스캔을 만들지 않는 한 경로 판정으로 줄인다. 등록·설정 결과는 지금처럼 폴더 목록 갱신으로 렌더러에 알린다.
- 오류 코드는 `OnboardingOperationErrorCode`를 그대로 쓰고, 렌더러는 `projectNotice`(`Onboarding.tsx:253`)로 같은 문구를 고른다.

## 순수 함수 (`/tdd` 대상)

1. `addPageReturn(origin, event, roots)` — Projects 탭·Back·Cancel·Escape·완료·LNB 행이 갈 곳(origin, origin이 사라졌으면 Home, Home+선택, 대상 워크스페이스, 무시). 편집 중 Escape는 무시.
2. `leaveLocked(phase)` — `selecting`·`cloning` 잠금 판정. App의 이동 함수, 메뉴 상태, 헤더·LNB 표시가 함께 쓴다.
3. `menuState` 확장(`menuState.ts:19`) — `addProjects` 화면, choose phase의 Add Project…, `locked`.
4. `dropFolder(items)` — 카드 드롭 판정: `{ kind: "folder", index }` | `{ kind: "notice", text }`(여러 개, 폴더 아님, 빈 목록, 경로 없는 항목).
5. `projectFooter(use, phase)` — 쓰임(`"onboarding" | "addPage"`)에 따른 하단 버튼·주 버튼 문구·완료 동작. 온보딩 쪽 결과는 지금과 같다.
6. `addPageRequest(value)` — main IPC 요청 검사.
7. `homeComposer`의 폴더 드롭 안내 문구(기존 `dropTarget` 테스트 갱신).
8. 공유 project 클래스의 상태 전이(inspect 세대, busy, leftovers, 종료) — 지금 `service.test.ts`의 project 사례를 클래스 단위로 옮기고, 두 인스턴스가 leftovers·대상 잠금을 공유하는 사례를 더한다.

## 포맷·컨벤션·결정 영향

- **포맷**: 없음. JSON Schema와 `v` 변화 없음. `onboarding_*` socket·CLI·MCP 응답 fixture는 그대로다.
- **컨벤션(ARCHITECTURE §1)·`doan check` 규칙**: 없음.
- **구조 결정**:
  - git: clone은 온보딩과 같은 코드와 사용자의 기존 Git 자격으로 하고 새 git 동작은 더하지 않는다. 다만 첫 실행 밖에서도 clone하므로 PRODUCT §3 범위 밖 6의 예외를 넓힌다(spec 결정 10).
  - 중첩 저장소: 앱이 중첩 저장소를 만들지 않는 규칙(2026-10-24)은 한 경로 `addFlow` 판단과 `ready.initialize`의 위쪽 확인을 그대로 쓰므로 유지된다.
  - 렌더러 경로: 렌더러가 보내는 경로는 Choose folder 결과, 드롭 경로, 고른 후보 경로, clone 위치다. 모두 main이 `canonicalFolder`와 inspect 세대로 검사한다. 고른 후보는 main이 그 inspect에서 낸 후보일 때만 받는다(`not_candidate`).
- **제품 결정(승격 때 PRODUCT §7)**: spec 확정한 결정 1~10. 대체 표시를 붙일 행:
  - 2026-10-24 projects-home 결정 3(대화상자·창 드롭, 하위 저장소와 다른 워크트리 제안)
  - 2026-10-25 R1의 체크리스트 부분
  - 2026-10-25 R6 "suggested worktrees start unchecked"
  - 2026-10-25 'Checking… candidates'
  - 2026-10-25 'Scan snapshots'
  - 2026-10-25 'File > Add Project… (Cmd+O) … opens the picker'의 picker 부분
  - 2026-10-25 'Attempt native Finder drop…'(창 드롭)
  - 2026-10-27 buzz-shell navigation 'Projects indicates the current screen without navigation'
  - PRODUCT §3 범위 밖 6의 clone 예외 문장
  - PRODUCT §5 항목 0 헤더 문장, 항목 1 Add Projects 문단, buzz-home의 "dropped elsewhere they still add a project"
  - 부모 공통 결정 6(기존 기능 보존)의 예외와 공통 결정 10의 `AddProjectsDialog` 삭제는 부모 spec에 적는다.
- **PoC 의존**: 없다.

## 초안 (`/design-draft`)

- 경로와 id: `.doan/canvases/buzz-add-projects.html`, `doan:canvas` `buzz-add-projects`.
- 프레임(창 전체, 헤더·LNB 포함): `choose`, `drop`(카드 드롭 중), `checking`, `candidates`(저장소 7개, 긴 이름·경로), `setup`, `selecting`, `url-inspecting`, `repository-found`, `clone`, `cloning`(헤더 탭·Back·Search·LNB 행 잠금 표시와 이유 한 줄), `clone-cancelled`.
- 타일: `states-errors`(access_failed, remote_mismatch, project_unavailable), `states-drop`(여러 항목, 폴더 아님), `states-onboarding-drop`(온보딩 Project 단계의 카드 드롭 중과 clone 중 이유 한 줄, 공유 개선 설명), `states-home-drop`(Home 입력창 폴더 드롭 안내).
- 워크스페이스에서 연 choose는 따로 그리지 않는다. 페이지에서는 LNB 행에 `aria-current`가 없어 Home에서 연 것과 화면이 같다(초안 1차, 2026-10-30).
- 초안 5차(2026-10-30, feature-review 반영): `selecting`에 `cloning`과 같은 헤더·LNB 잠금 표시를 그렸다(이유 줄과 하단 없음). 사용자가 selecting 잠금을 정했으므로 확정 초안에 이 변경만 더했다.
- 초안 3차(2026-10-30 user, 2차의 "목록만 스크롤"을 되돌림): 페이지 전체가 스크롤되고 하단 버튼도 함께 내려간다. 스크롤 컨테이너는 흰 본문 패널 자체(`.add-panel`, `overflow-y: auto`, `overscroll-behavior: contain`)이고, 스크롤바는 패널 가장 오른쪽에 Quick Open 목록과 같은 얇은 macOS 스타일(`ds` `.doan-scroll`: `scrollbar-width: thin`, `--scrollbar-thumb-quiet`)로 나온다. 1차에는 560px 본문 열이 스크롤 컨테이너라 스크롤바가 열 옆에 붙었다. 본문 열은 최소 패널 높이라 내용이 짧으면 하단 버튼이 패널 아래에 붙는다.
- 초안 4차(2026-10-30 user): 온보딩과의 공유 개선을 `states-onboarding-drop` 타일에 더했다(clone 중 이유 한 줄, 공유 개선 설명).
- **확정**: 4차 초안(2026-10-30 user, "디자인은 확정"). 렌더링 근거는 Chrome headless 캡처이고, Electron 실제 렌더링은 `/design-sync`에서 잰다. 이 초안은 이 자식이 main에 병합될 때까지 정본이다. 사용자가 feature-review보다 초안 확정을 먼저 했다.
- 확정 문구(2026-10-30 "문구는 괜찮"): 제목 "Add a project", 주 버튼 "Set up and add"·"Clone and add", 드롭 status "Drop to add this folder", notice "Drop one folder at a time.", Home 안내 "Folders can’t be attached. Add a project from Add Projects.", clone 중 "Stay on this page until the clone finishes, or cancel it."(critique: 잠긴 탭만으로는 떠날 수 없는 이유가 보이지 않는다).
- 초안의 setup 패널은 출하된 온보딩처럼 설명 한 줄만 있고 추가될 파일 목록이 없다. PRODUCT §5 항목 0의 "shows exactly the files setup adds"와 다르며, 승격 때 출하된 동작에 맞춰 문장을 고친다.
- 기존 `buzz-onboarding.html`은 고치지 않는다(공통 결정 11).

## 가져오지 않는 것

- 지금 체크리스트의 진행 표시("n of N checked"), 체크박스, "Already added" 칩, 워크트리 하위 행.
- 창 전체 드롭 오버레이("Drop folders to add").
- 추가 뒤 워크스페이스의 "Added <이름>" 토스트와 Open.

## POSTMORTEM 함정

- **2026-10-25 — An unreadable add pick was offered for set-up as a folder without repos**: 읽을 수 없는 폴더를 빈 폴더로 다루지 않는다. 온보딩 `inspectFolder`가 이미 `null`을 `project_unavailable`로 돌리므로(`projects.ts:89-92`) 그 경로를 그대로 쓰고, 드롭 경로에도 같은 테스트(권한 0111·0444 폴더)를 둔다.
- **2026-10-25 — A static draft's overflow match hid an unusable checklist**: candidates 목록이 길 때(저장소 20개 이상) 패널이 스크롤되어 마지막 카드와 주 버튼에 닿는지 실제 앱에서 본다.
- **2026-10-25 — Production CSS extraction concealed missing development styles**: 새 CSS는 `styles.css`에만 두고 JS에서 import하지 않는다. 드롭 표시, 페이지 열 너비, 스크롤 컨테이너를 개발·프로덕션 빌드에서 잰다.
- **2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking**: 버튼이 비활성될 때 포커스가 body로 떨어지지 않게 공용 포커스 훅을 쓴다('포커스').
- **2026-10-27 — Shell navigation shortcuts lost destination ownership**·**2026-10-25 — Delayed startup restoration replaced newer navigation**: 위 '화면과 이동'·'포커스'.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 완료 뒤 Home 선택은 새 폴더 목록을 기다려야 한다. 지금 중복 추가가 쓰는 `choose`의 대기 경로를 재사용하고, 등록 직후 목록에 아직 없는 root를 첫 행으로 바꾸지 않는다.
- **2026-10-25 — A toast's Open was dropped while its project was still loading**: 같은 원인. 완료 동작이 읽는 중인 root를 한 번만 보고 버리지 않게 한다.
