# 화면 간 UX 일관성 감사 보고서 (ux-audit-261025)

- **수행일**: 2026-10-25
- **기준 코드**: main, HEAD `28615ca`(worktree clean). 같은 날의 코드 감사(`docs/features/audit-261025/report.md`)와 같은 코드 기준이다. `022cfaa` 이후 커밋은 모두 문서·스킬 변경이다.
- **요청 범위**: 구현된 모든 화면과 상태(`/ux-audit`, 범위 축소 없음). 화면 직접 관찰은 요청되지 않아 소스 검토로 진행했다.
- **완료 상태**: **소스 검토 완료, 런타임 관찰 없음**. 화면 14개(S1–S14)와 공유 개념 8개를 4개 관점으로 모두 검토했다. 네이티브 메뉴·메시지 박스(S13)의 화면 표시는 macOS가 그리므로 소스로 판단할 수 없어 미관찰로 남겼다.
- **수행자**: 리드 Claude Code 피어와 Claude 계열 관점 리뷰어 서브에이전트 4명이다(관점 4는 2차 재배정 포함). 원 근거는 `.scratch/ux-audit/claude-261025/`(inventory.md, review-wording.md, review-actions.md, review-transitions.md, review-presentation.md)에 남겼다. 이 디렉터리는 커밋되지 않으므로, 이 보고서만 읽어도 판단할 수 있게 근거를 옮겨 적었다.

## 1. 관찰하지 못한 것과 확인하지 못한 상태

- **앱을 실행하지 않았다.** 스크린샷도 새로 찍지 않았다. 아래의 시각·포커스·타이밍 주장은 모두 소스를 추적한 결과이며 화면으로는 확인하지 않았다. DESIGN.md의 측정값은 측정한 날짜와 범위에서만 유효하고, 지금 앱이 같다는 증거는 아니다.
- **런타임 확인이 필요한 항목**:
  - 포커스가 실제로 어디에 놓이는지(U-6, U-21, U-28)
  - 겹침의 픽셀 범위(U-31, 960px와 1238px 창)
  - 시작 복원 지연 재현(U-2, `ls`가 느린 저장 root 필요)
  - 마법사 아래 토스트 가시성(U-4, U-16)
  - macOS 피커 시트에 `title`이 보이는지(U-46)
  - Inspector 빈 패널이 얼마나 오래 보이는지(U-29)
  - 툴팁 `animate-*` 클래스가 실제로 스타일을 만드는지. `tw-animate-css`가 의존성에 없어서 만들지 않는 것으로 추정한다.
- **검토하지 않은 범위**: 실제 macOS 접근성 도구(VoiceOver)로 듣는 결과, 시스템 스크롤바 설정("항상 표시")에 따른 차이, Light 모드 시스템에서 보이는 모습.

## 2. 결과 요약

순위는 스킬 규칙을 따랐다. 주요 작업·복구가 막히는 문제를 먼저, 그다음 상태·문구가 오해를 부르는 문제, 마지막으로 표현 불일치 순이다.

| 순위 | 건수 | 확정 불일치 | 결정만 필요 | 비고 |
|---|---|---|---|---|
| 1. 주요 작업·복구 중단 | 7 | 7 | 0 | U-1, U-7은 일부 결정 필요 |
| 2. 오해를 부르는 상태·문구 | 26 | 22 | 4 (U-27, U-28, U-29, U-32) | U-9, U-10, U-13은 일부 결정 필요 |
| 3. 표현 불일치 | 19 | 13 | 5 (U-35, U-38, U-41, U-49, U-50) | U-52는 기록만 |

코드 감사와 겹치는 항목은 교차 참조했다. U-1은 audit A-M1(종료), U-16은 A-M5(토스트 타이머), U-7은 A-L7, U-9는 A-L9와 겹친다.

## 3. 발견

표기: 관점 1=의미·문구(W), 2=동작·복구(R2), 3=상태 전환(T), 4=표현(P). 관점 5(공유 결정)는 각 관점 안에서 다뤘다.

### 순위 1 — 주요 작업·복구 중단

#### U-1 — 저장 요청이 걸린 댓글 초안이 있으면 앱 안의 이동·제거가 모두 표시 없이 무시된다 (확정, 일부 결정 필요)
- **관점**: 2(R2-1), 코드 감사 A-M1을 앱 안 이동 전체로 넓힌 항목이다.
- **화면/상태**:
  - 무시되는 동작: Home 행 진입과 Remove, 사이드바 캔버스·Overview·프로젝트 버튼·worktree 전환, 캔버스 Reload·빈 곳 클릭·Escape·조상 경로·핀, Quick Open 선택, Settings에서 전달한 Remove, 토스트 Open.
  - 초안 상태: `saving`, `unknown`, `checking`, `check-failed`, `recovery-blocked`.
- **비교**:
  - 요청이 없는 초안은 같은 진입점에서 `UnsavedCommentDialog`(Save/Discard/Keep writing)를 띄운다(`CommentsSession.ts:152-156`, `useComments.tsx:104-106`).
  - 요청이 걸리면 `guard()`가 대화상자를 만들기 전에 `false`를 돌려준다(`CommentsSession.ts:150-151`). 그러면 `CanvasController.ts:103-107`은 아무것도 하지 않는다.
  - 제거는 main이 `cancelled`를 받고(`index.ts:609-627`) `App.tsx:219-222`는 아무것도 표시하지 않는다.
  - Quick Open은 대화상자를 먼저 닫고(`QuickOpenDialog.tsx:66-70`) 이동은 거부된다(`App.tsx:253-263`).
  - 코드에는 요청이 걸린 상태용 대화상자 흔적이 있다(`useComments.tsx:105` `discardBlocked`, `CommentsPanel.tsx:234`). 하지만 이 상태로는 도달하지 않는다.
- **영향**: 다른 프로젝트·캔버스·검색 결과·Remove를 눌러도 아무 일이 없고 이유도 보이지 않는다. Home에서는 설명이 든 댓글 패널이 숨겨져 있다(`App.tsx:280`). `recovery-blocked`이면 세션 내내 다른 모든 root로 이동할 수 없다. 서비스는 그 root 하나만 막는데도 그렇다.
- **기준**:
  - PRODUCT §5 항목 5: 이동·Reload·제거·종료 전에 Save/Discard/Keep writing을 제시한다.
  - ARCHITECTURE §3 Transitions: 불확실한 요청은 일반 대화상자로 버릴 수 없다. 즉 대화상자는 있되 Discard를 막는다.
  - ARCHITECTURE §2: "Other roots remain independent."
- **최소 수정**: `draft.request`가 있으면 Save·Discard를 비활성화한 `UnsavedCommentDialog`를 띄운다. 저장 상태를 이유로 표시하고, Keep writing은 작업 공간을 보여준다(기존 `discardBlocked` 경로). 격리된 초안을 두고 다른 root로 갈 수 있는지는 결정해서 PRODUCT §7에 기록한다.

#### U-2 — 지연된 시작 복원이, 기다리는 동안 사용자가 한 이동을 덮어쓴다 (확정, 런타임 미검증)
- **관점**: 3(T-1).
- **흐름**:
  1. 저장된 root가 `loading`인 동안(최대 10초) 복원은 `wait`을 반복한다(`App.tsx:129-151`, `restorePlan.ts:23`). 그동안 Home은 정상적으로 조작할 수 있다.
  2. root가 목록에 오르면 `openWorkspace`와 `setScreen("workspace")`를 조건 없이 실행하고 `expanded`·`lastByRoot`도 덮어쓴다(`App.tsx:139-149`).
  3. 이 복원이 `transitionIntent`를 올려 사용자의 이동을 무효로 만든다(`CanvasController.ts:103-112,345-353`).
- **비교**: 추가 토스트의 Open은 로딩을 기다리면서도 이후 이동에 밀린다(`CanvasController.ts:252-265,339-353`). POSTMORTEM 2026-10-25 "toast Open dropped while loading"의 예방 규칙("an action offered before a read finishes must wait … and be superseded by later navigation")이 복원에는 적용되지 않았다.
- **영향**: 느린 시작 중에 다른 프로젝트로 들어가거나 Quick Open을 쓰면, 몇 초 뒤 저장된 작업 공간으로 끌려간다. 트리 펼침도 되돌려진다.
- **최소 수정**: 복원이 끝나기 전에 사용자가 화면이나 root를 바꾸면 복원을 `"done"`으로 끝낸다. 또는 복원을 `waitingWorkspace` 경로로 보내 기존 intent 검사가 처리하게 한다.

#### U-3 — 작업 공간의 "Added <name> · Open" 토스트가 열 수 없는 프로젝트에서는 아무것도 하지 않는다 (확정)
- **관점**: 2(R2-2).
- **비교**:
  - 작업 공간에서 추가하면 항상 Open 토스트가 뜬다(`App.tsx:206-211`). 그런데 읽기 결과가 Not set up·Missing·Config error·CLI error이면 `openWorkspace`/`enterWorkspace`가 조용히 끝난다(`CanvasController.ts:345-357`).
  - Home에서 같은 추가를 하면 행을 강조하고 Set Up…/Remove 같은 복구 동작을 보여준다(`App.tsx:209`, `Home.tsx:84-85`, `homeCards.ts:57-64`).
- **기준**: ARCHITECTURE §13 상태 표(Not set up → Set Up…), POSTMORTEM 2026-10-25 토스트 항목(로딩만 해결).
- **최소 수정**: 읽기 결과가 `list`가 아니면 Home으로 가서 해당 행을 강조한다. 또는 상태에 맞게 버튼 이름을 바꾼다(예: Set Up…).

#### U-4 — 마법사 4단계 Add Project…의 거부·중복 결과가 모달 마법사 아래로 가고, Set Up을 건너뛴 프로젝트에는 "Add a project first"를 보여준다 (확정)
- **관점**: 2(R2-3), 4(P17 교차).
- **비교**:
  - 4단계는 Home의 `addProjects()`를 부른다(`Onboarding.tsx:206-209`). 거부 메시지는 App 토스트로, 중복은 Home 강조로 간다(`App.tsx:212-218`). 둘 다 모달 `<dialog>` 아래에 있다(`App.tsx:293`, `Onboarding.tsx:251-253`, `styles.css:314`).
  - 3단계 Open Project…는 중복을 채택하고 거부를 마법사 안에 표시한다(`Onboarding.tsx:195-205`, `index.ts:431-449`, `onboardingView.ts:319-320,334`).
  - 3단계에서 고르고 Set Up을 건너뛰면 4단계는 `list`만 받으므로 "Add a project first…"를 보여준다(`Onboarding.tsx:271`, `onboardingView.ts:300-301`).
- **기준**: PRODUCT §5 항목 0, ARCHITECTURE §7 Wizard addition, POSTMORTEM 2026-10-24 위저드 모달 스태킹.
- **최소 수정**: 프로젝트가 있지만 `list`가 아니면 4단계에서 Set Up…(3단계로 이동)을 제시한다. 4단계의 추가는 마법사의 채택·인라인 거부 경로로 보낸다.

#### U-5 — Settings › Projects에서 config 읽기가 실패하면 Retry가 없고, 메시지는 그 동작이 없는 Home으로 안내한다 (확정)
- **관점**: 2(R2-4).
- **비교**:
  - Projects는 마운트될 때만 읽는다(`settingsProjects.tsx:61-71`). 실패하면 Token CSS·Serve 섹션이 그려지지 않는다(`:113-114`). 남는 동작은 없다(`:111`). 메시지는 "…try again on Home."이다(`:67`).
  - Connections 읽기 실패는 Check Again을 준다(`settingsWindow.tsx:71,112`). 댓글 읽기 실패는 Retry를 준다(`CommentsPanel.tsx:109`). Home 문제 행도 Retry를 준다(`homeCards.ts:62-64`).
- **기준**: ARCHITECTURE §7 Config replies(실패한 읽기 뒤에도 마지막 데이터 유지), 앱 전체의 "읽기 실패에는 Retry" 관례.
- **최소 수정**: 정상 행의 실패 메시지 옆에 `read()`를 다시 부르는 Retry를 둔다.

#### U-6 — 작업 공간 상태 줄의 Set Up…(또는 re-root)이 성공한 뒤, 그리고 첫 실행 마법사를 닫은 뒤 키보드 포커스가 사라진다 (확정, 포커스 위치는 런타임 미검증)
- **관점**: 3(T-2, T-3).
- **비교**:
  - Home에서 Set Up…을 쓰면 성공한 뒤 행으로 포커스가 돌아온다(`App.tsx:181-196`, e2e `onboarding.ts:363`).
  - 작업 공간 상태 줄에서는 성공하면 상태 줄 전체가 언마운트된다(`App.tsx:282`). 대체 포커스 선택자가 Home 전용이라(`App.tsx:188`) 아무것도 포커스되지 않는다.
  - 마법사를 닫을 때의 대체 대상은 사이드바 Overview 행이다(`App.tsx:90-98`). 그런데 첫 실행에서는 Home이 보이는 상태라 사이드바가 `inert`다(`App.tsx:280`). 그래서 포커스가 `<body>`로 간다.
- **기준**: ARCHITECTURE §7 Focus("returning restores the prior workspace control or the sidebar tree if it disappeared"). §7 Onboarding의 "sidebar on first run"은 Home이 첫 화면이 되기 전의 문장이다.
- **최소 수정**: 모달을 닫을 때의 대체 포커스를 화면별로 고른다. 작업 공간에서는 `.side [role="treeitem"][tabindex="0"]`, Home에서는 지금 선택자를 쓴다. 또는 `inert` 안의 후보를 제외한다.

#### U-7 — 마법사 3단계가 없어진 동작("Restore it and Reopen, or Close it.")을 안내하고 복구 버튼이 없다 (확정, 버튼 제공 여부는 결정 필요)
- **관점**: 1(W1), 2(R2-10). 코드 감사 A-L7과 같은 원인이다.
- **비교**:
  - 마법사는 옛 `projectRow.ts:25` 문구와 상태명("Not found", "Not initialized")을 쓴다(`onboardingView.ts:329-332`). 옆에는 Open Project…만 있다(`Onboarding.tsx:343-346`).
  - Home·상태 줄·Settings는 Missing/Config error/CLI error 칩과 Locate…/Remove, Show in Finder/Retry/Details를 쓴다(`homeCards.ts:54-64`, `Home.tsx:51-62`, `settingsProjects.tsx:100-111`).
- **기준**: ARCHITECTURE §13 상태 표, PRODUCT §7 2026-10-24 Decision 4, 2026-10-25 "Not set up replaces Not initialized".
- **최소 수정**: 3단계의 문제 문구를 `cardRow`에서 가져오고, 가능하면 `ProblemActions`를 함께 그린다.

### 순위 2 — 오해를 부르는 상태·문구

| ID | 상태 | 관점 | 화면 · 근거(양쪽) | 기준 | 최소 수정 |
|---|---|---|---|---|---|
| U-8 | 확정 | 4 P1 | **primary 버튼의 키보드 포커스 링이 보이지 않는다.** `--accent`와 `--accent-line`이 같은 `#f0773a`이고(`tokens.css:19,22`), 링이 −1px offset으로 같은 색 테두리 위에 그려진다(`styles.css:32,47`, `settings.css:89,91`). 일반 버튼과 트리 행의 링은 보인다. DESIGN은 Fix…에 링이 보인다고 적었지만 Fix…도 primary다. | ARCH §7(키보드 경로), DESIGN app-setup | primary 변형에 offset 1px 또는 대비색 outline을 준다 |
| U-9 | 확정, 문구 결정 필요 | 1 W3, 4 | **같은 `ls` 행을 캔버스 유효성 기준으로 세 가지로 해석한다.** Overview는 id가 없으면 "Can't read this canvas"로 표시하고 썸네일을 요청하지 않는다(`ProjectOverview.tsx:30-39,95,202`). 같은 캔버스를 열면 정상으로 그려지고, 댓글은 read-only가 된다(`useComments.tsx:70`). 반대로 파싱 자체가 안 되는 캔버스는 "doan:width를 추가하라"고 안내한다(`CanvasController.ts:423`). POSTMORTEM 2026-10-21 "파서 오류가 meta 누락처럼 보임"이 UI에서 재발한 것이다. | ARCH §12 `doan ls`, PRODUCT §5 항목 3 | 표면별로 실제 조건을 쓴다(id 없음과 width 있음 / 읽을 수 없음). 코드 감사 A-L9와 함께 고친다 |
| U-10 | 확정, 일부 결정 필요 | 1 W2, 3 T-6 | **캔버스가 열려 있지 않은 작업 공간의 프로젝트가 문제 상태가 되면** 캔버스 영역에 "Pick a canvas from the list"가 남는다. 목록은 비어 있고(`CanvasController.ts:43,273`, `App.tsx:327-333`) Overview도 사라진다(`App.tsx:265`). Retry나 일시 오류 중에는 사이드바 트리도 "Canvases 0"으로 비는데(`Sidebar.tsx:35`) 캔버스는 마지막 문서를 그대로 둔다(`canvasView.ts:28-33`). 캔버스가 열려 있으면 §13 문장이 나온다(`CanvasController.ts:300-303`). | ARCH §13 메시지, §3 "A transient folder error keeps the prior view" | 문제 상태일 때는 §13 문장을 보여준다. 일시 오류 중 트리·Overview를 유지할지 결정한다 |
| U-11 | 확정 | 2 R2-6, 3 T-4 | **새 댓글 시작이 실패하면 "Couldn’t read comments"로 표시되고 목록이 가려진다.** `CommentsSession.ts:126`이 begin 오류를 `readError`에 넣는다. 그러면 `useComments.tsx:70,95`와 `CommentsPanel.tsx:100,108-109`가 read-only와 읽기 실패를 표시한다. 카드 변경 실패는 카드에, 저장 실패는 편집기에 표시된다(`CommentsPanel.tsx:148-156,191`). | PRODUCT §5 항목 5("a read error is not an empty list") | `createError`를 따로 두고 New comment 옆에 표시한다 |
| U-12 | 확정 | 1 W7, 2 R2-5, 4 P15 | **Settings의 "Details ▸"는 펼침처럼 보이지만** 메인 창을 띄우고 8초 토스트만 보여준다(`settingsProjects.tsx:16,100-104`, `index.ts:805-812`, `App.tsx:238-243`). Settings에는 오류 원문이 없다. Home과 상태 줄은 그 자리에서 펼친다(`Home.tsx:51-56,62`). | ARCH §13 표("Details (expand raw error text)"), PRODUCT §5 항목 0 | Projects projection에 오류 메시지를 담아 그 자리에서 펼친다 |
| U-13 | 확정, 어휘 통합은 결정 필요 | 1 W5 | **연결 행 하나가 서로 다른 상태어를 쓴다.** 행은 "doan command · Not connected"인데 Details는 "CLI link · Not installed"다. 행이 "Needs attention · Path is blocked."이면 Details 칩은 "Unavailable"이다. "Not installed"는 행에서는 에이전트 미설치, Details에서는 doan 파일 없음을 뜻한다(`connectionRowView.ts:8,21-48`, `ConnectionRows.tsx:65-83`, `onboardingView.ts:90-98,110,161-163,213-219`). 같은 대상을 "doan command", "CLI link", "CLI"로 부른다. | PRODUCT §5 항목 0 다섯 상태어, DESIGN app-setup | Details 칩을 요약 상태어에 맞추고, 대상 이름을 하나로 정한다 |
| U-14 | 확정 | 3 T-9, 2 R2-9 | **연결 상태 읽기가 실패하면 Home 칩과 마법사는 "Checking…"에 머문다.** Settings는 "Couldn’t read connections. Choose Check Again."과 행별 "Couldn’t check"를 표시한다(`Home.tsx:36`, `setupBroker.ts:79-81,93`, `Onboarding.tsx:115-116` vs `settingsWindow.tsx:70-72,115`). | PRODUCT §5 항목 0("Checking… before the first result") | `SetupStatus`에 실패 표시를 추가하고, 마법사도 `stale`을 오류로 처리한다 |
| U-15 | 확정 | 1 W4 | **한 프로젝트가 동시에 여러 이름으로 불린다.** 상단 바·상태 줄·Quick Open·제거 토스트는 카드 이름(`git.main` basename, `homeCards.ts:25-28`)을 쓴다. 캔버스 복구 문장과 Set Up 대화상자는 폴더 이름(`projectNames`, `CanvasController.ts:293,301-302`, `ProjectSetupDialog.tsx:73`)을 쓴다. 여러 개를 추가해도 Added 토스트는 마지막 하나만 부른다(`App.tsx:206-210`). | PRODUCT §7 2026-10-25 카드 이름 결정, ARCH §7 Toasts | 표시 이름 헬퍼 하나로 통일하고 Added 토스트에 개수를 표시한다 |
| U-16 | 확정, 일부 런타임 | 2 R2-16, 4 P17, audit A-M5 | **토스트가 창 숨김과 모달을 따라가지 않는다.** 타이머는 `document.hidden`만 본다(`Toast.tsx:11-12`). 첫 프롬프트 토스트는 `window:visible`을 쓴다(`FirstPrompt.tsx:42-51`). 토스트는 top layer가 아니어서 열린 모달 아래에서 Undo/Open을 누를 수 없는데 타이머는 계속 흐른다(`styles.css:314`, 모든 `showModal()` 대화상자). | ARCH §7 Toasts("hidden window pause the timer") | `onWindowVisible`과 모달 열림을 타이머 정지 조건에 넣는다 |
| U-17 | 확정 | 3 T-5 | **Delete comment 대화상자에서 Escape를 누르면 캔버스 선택도 지워진다.** `DeleteCommentDialog`에는 `onKeyDown`이 없어(`CommentsPanel.tsx:241-251`) 창의 `CanvasController.keydown`이 `escape()`를 부른다(`:649-661`). 다른 모달은 모두 Escape를 대화상자 안에서 멈춘다(`ProjectSetupDialog.tsx:67-71`, `CommentsPanel.tsx:223-228`, `AddProjectsDialog.tsx:28,47`, `Onboarding.tsx:56-61,310`). | ARCH §3 Clear and keyboard, POSTMORTEM 2026-10-23 transition timing | 같은 Escape 처리기를 추가한다 |
| U-18 | 확정 | 3 T-8 | **전달된 Settings 대상이 Projects 창의 "Add to serve?" 확인과 쓰기 결과를 언마운트한다.** Connections는 `onBusy`로 보호된다(`settingsWindow.tsx:28-33,60`). Projects는 busy를 알리지 않는다(`settingsProjects.tsx:71,76,115`). POSTMORTEM 2026-10-25 forwarded target 항목이 다른 창에서 재발한 것이다. | 해당 POSTMORTEM 예방 규칙 | `ProjectDetail`이 확인·쓰기 중에 `onBusy`를 보고하게 한다 |
| U-19 | 확정 | 4 P2 | **같은 수준의 실패 메시지가 화면마다 다르게 보인다.** 폴더 확인 오류(`AddProjectsDialog.tsx:48`)와 PATH 복사 실패(`ConnectionRows.tsx:78`)는 본문처럼 보인다. 같은 `COPY_FAILED`가 FirstPrompt에서는 `ob-msg error`(빨간 테두리, `FirstPrompt.tsx:111`)로 나온다. 체크리스트·Set Up 폼·Settings Projects도 오류 표현을 쓴다. | DESIGN app-setup(오류 11.5px + `--err` 테두리 선례) | 두 곳에 `ob-msg error`를 붙인다 |
| U-20 | 확정 | 1 W6 | **setup 실패 메시지에 내부 id가 드러난다.** "claude timed out. Check Again.", "codex failed."(`machine.ts:287,316,318`)인데 같은 main의 읽기 경로와 행은 "Codex"/"Claude Code"를 쓴다(`machine.ts:181-182`, `onboardingView.ts:52`). "Check Again." 표현도 세 가지다. | `onboardingView.ts:10`의 "internal names stop here" 원칙 | 표시 이름을 쓰고 표현을 하나로 맞춘다 |
| U-21 | 확정, 런타임 미검증 | 3 T-7, 2 R2-13 | **자기 행을 바꾸는 동작 뒤 포커스가 사라진다.** Home·상태 줄의 Retry, Home의 Locate…, Settings Projects 쓰기 뒤, 진행할 수 없는 Quick Open 선택 뒤가 해당한다(`App.tsx:227`, `Home.tsx:93`, `settingsProjects.tsx:107,113-115`, `QuickOpenDialog.tsx:66-70`). Sidebar·Overview·핀·Settings Connections는 포커스를 의도적으로 옮긴다(`Sidebar.tsx:76-85`, `ProjectOverview.tsx:163-170`, `settingsWindow.tsx:96-100`). | POSTMORTEM 2026-10-24 위저드, 2026-10-25 roving 규칙 | 같은 행이나 바뀐 root의 행에 포커스를 둔다 |
| U-22 | 확정 | 3 T-12, 2 | **오래된 Open 대상의 실패를 어떤 곳은 조용히, 어떤 곳은 토스트로 처리한다.** 조용한 곳: 첫 프롬프트 Open(`FirstPrompt.tsx:37-40`), 행이 사라진 Quick Open 선택(`App.tsx:255-257`). 토스트를 보이는 곳: 없는 프레임(`App.tsx:259`), 복원 시 없는 캔버스(`App.tsx:150`). | 같은 개념의 일관성 | "… is no longer in design/" 토스트를 재사용한다 |
| U-23 | 확정 | 2 R2-7 | Settings 전달이 메인 창의 모달 때문에 거부되면 "This project changed. Try again on Home."이라고 원인을 잘못 말한다(`index.ts:807`, `settingsProjects.tsx:102`). | ARCH §7 Projects projection | 실제 원인(메인 창 대화상자)을 말한다 |
| U-24 | 확정 | 2 R2-8 | 설치 페이지를 열지 못했을 때 Settings는 알리지만(`settingsWindow.tsx:116-118`) 마법사는 조용하다(`Onboarding.tsx:246`). | PRODUCT §5 항목 0(같은 행 재사용) | 마법사도 같은 메시지를 쓴다 |
| U-25 | 확정 | 3 T-10 | Quick Open은 아무것도 입력하지 않았는데 결과가 없으면 "No canvases or frames match"를 보여준다(`QuickOpenDialog.tsx:101`, `quickOpen.ts:89-91`). 다른 빈 상태는 부재와 다음 행동을 말한다(`Home.tsx:43`, `ProjectOverview.tsx:214-218`). | 빈 상태 관례 | 빈 쿼리에는 "No canvases yet"을 쓴다 |
| U-26 | 확정 | 2 R2-15 | 다음 행동이 없는 메시지("This page is not a listed canvas" `App.tsx:324`, Locate 거부 `addProjects.ts:334`)와 "Error:" 접두어 노출(`String(failure)`: `App.tsx:290`, `Onboarding.tsx:281,306`, `AddProjectsDialog.tsx:22`)이 있다. 다른 곳은 `error.message`를 쓴다. Home 배너의 비활성 Check Again에는 이유가 없다(`Home.tsx:39`). Settings는 이유를 보인다(`settingsWindow.tsx:113`). | 오류·복구 관례 | 다음 행동 문구를 추가하고 `error.message`로 통일한다 |
| U-27 | 결정 필요 | 1 W8 | 캔버스 문장 "Use Set Up… on Home."은 Set Up…이 같은 작업 공간 상태 줄에 있는데도 Home으로 보낸다(`CanvasController.ts:302` vs `Home.tsx:58-61`). Missing 문장은 Home으로 보내지 않는다. 두 문장 모두 문서화된 결정이다. | ARCH §13, PRODUCT §7 2026-10-25 | "on Home"을 빼거나 "above"로 바꾸는 결정을 내린다 |
| U-28 | 결정 필요 | 3 T-13 | 토스트의 Undo를 누르거나 토스트가 교체되면 포커스가 `<body>`로 간다(`toastState.ts:46,59-68`, `App.tsx:221`). 대화상자는 포커스를 되돌린다. | ARCH §7 Toasts·Focus | 복원된 행이나 이전 요소로 포커스를 돌린다 |
| U-29 | 결정 필요 | 3 T-11, 4 P18 | Inspector는 loading 중 표시가 없고 이전 행을 지운다(`CanvasController.ts:572-576`, `RightPanel.tsx:59-64`). 다른 비동기 패널은 Loading…/Reading…/스피너를 보인다. | DESIGN select-inspect(loading 미검증) | 이전 행을 흐리게 두거나 "Reading styles…"를 보인다 |
| U-30 | 확정 | 1 W9 | "The selected element is no longer in the canvas."가 프레임 선택을 잃었을 때도 나온다(`selection.ts:10`, `CanvasController.ts:555,613`). | PRODUCT §5 항목 4(요소와 프레임 구분) | "The selection is no longer in the canvas."(문서와 코드 함께) |
| U-31 | 확정(겹침 폭은 런타임) | 4 P16 | 댓글 핀(z 2)과 작업 공간 토스트(z 6)가 줌·Fit·Updated(z auto)와 알림 막대(z 1)를 덮는다. 토스트는 캔버스 영역이 아니라 창 기준으로 가운데에 놓여 960px 창에서 줌 그룹과 겹친다(`styles.css:69,85,87,89,182,314,341`). | DESIGN 캔버스 chrome | chrome에 z-index를 주고 토스트 위치를 조정한다 |
| U-32 | 결정 필요 | 2 R2-11 | Home에서 연결 대상을 지정하는 방식이 다르다. 배너 Fix…는 행을 지정하고(`Home.tsx:39`), 칩과 Finish 카드는 지정하지 않는다(`Home.tsx:37,41`). 문서상 의도된 동작이다. | PRODUCT §5 항목 0 | 선택적 개선: 칩에 `{connection}`을 넘긴다 |
| U-33 | 확정(무해) | 2 R2-12 | 메뉴의 Zoom/Fit은 `state.open`이면 활성이다(`menuState.ts:20`). 화면의 같은 버튼은 `hasFrame`이 있어야 활성이다(`App.tsx:334-340`). loading·실패·noWidth에서 메뉴는 눌러도 아무 일이 없다. | ARCH §7 메뉴 표 | `menu:state`에 `hasFrame`을 보낸다 |

### 순위 3 — 표현 불일치

| ID | 상태 | 관점 | 내용 · 근거 | 최소 수정 |
|---|---|---|---|---|
| U-34 | 확정 | 4 P3 | 마법사 1단계 Details의 `<code>` 칩에 `.ob-reason code` 규칙이 메인 창에만 없다(`styles.css:212` vs `settings.css:24`). POSTMORTEM "자식 누락" 유형이다. | `styles.css:212`에 선택자를 추가한다 |
| U-35 | 결정 필요(PRODUCT §8) | 4 P4 | 사이드바 캔버스 툴팁과 Fit 툴팁은 padding이 0이다(`* { padding:0 }` `styles.css:25`가 `tooltip.tsx:42`를 덮는다). 같은 경로를 보여주는 crumbs와 Overview는 `PathTip`이라 padding이 있다(`App.tsx:307`, `ProjectOverview.tsx:207`). | §8 결정 뒤 `PathTip`으로 통일하거나 reset을 layer로 옮긴다 |
| U-36 | 확정 | 4 P5 | worktree 메뉴의 상태 칩은 tone이 없다(`App.tsx:306`). tone 매핑은 세 곳에 중복돼 있다(`Home.tsx:59,101`, `settingsProjects.tsx:10`). | `CardRow`에 `tone`을 추가해 공유한다 |
| U-37 | 확정 | 4 P6 | root에 `color-scheme: dark`가 없다. 테마 스크롤바(`.native-scroll`)도 Home body·Quick Open 목록·Settings 창에는 없다. DESIGN은 Quick Open 목록이 `native-scroll`이라고 적었다(문서 drift). | `:root`에 `color-scheme: dark`를 주고, `.qo-list`를 고치거나 DESIGN을 고친다 |
| U-38 | 결정 필요 | 4 P7 | 두 창 모두 `backgroundColor`·`nativeTheme`이 없다(`index.ts:297-313,363-372`). 처음 그릴 때 흰 화면이 보일 수 있고, Light 시스템에서는 Settings 타이틀바와 네이티브 알림이 밝게 나온다. | `backgroundColor: "#121212"` 또는 `themeSource` 결정 |
| U-39 | 확정(dev 전용, 추론) | 4 P8 | `settings.css`와 `connectionRows.css`를 JS에서 import한다(`settings.ts:5`, `ConnectionRows.tsx:6`). ARCHITECTURE §7 "never imported from JS"와 어긋난다. dev CSP에서는 Settings가 스타일 없이 보일 수 있다. | `<link>`로 바꾸거나 문서를 고친다 |
| U-40 | 확정 | 4 P9 | 긴 내용의 전체 텍스트를 볼 방법이 없다. 작업 공간 상태 문장은 툴팁 없이 잘리고(`styles.css:336`, `Home.tsx:60`), Settings 상세 브랜치 `.meta`는 넘치며(`settings.css:9`), `.canvas-status`에는 `overflow-wrap`이 없다(`styles.css:80`). Quick Open 결과와 Overview 제목에 툴팁이 없고, worktree 메뉴 폭에 상한이 없다(`styles.css:287,292`). | 툴팁이나 `title`, 줄바꿈, 상한을 추가한다(일부 결정 필요) |
| U-41 | 결정 필요 | 4 P10 | hover가 일부 행에만 있고 버튼과 Settings `.pj-row`에는 없다(`styles.css:61,266,384,397`, `settings.css:58-63`). | `.pj-row:hover`부터 맞춘다 |
| U-42 | 확정 | 4 P11 | `.spinner`에 animation이 없어 로딩 표시가 회전하지 않는다(`styles.css:81`). 캔버스 Loading, 스캔 진행, FirstPrompt 대기에서 쓴다. | keyframes와 reduced-motion 처리를 추가한다 |
| U-43 | 확정 | 4 P12 | Settings Connections의 alert 오류는 `--warn` 테두리(`settings.css:52`)이고, 같은 창 Projects 오류는 `--err`(`settings.css:81`)다. | 오류에는 `--err`를 쓴다 |
| U-44 | 확정 | 4 P13 | 포커스된 잘못된 입력의 빨간 테두리가 포커스 링에 가려진다(`styles.css:434-435`). 댓글 textarea 링은 offset 0이고 `.fp-input`은 −1이다. | `.fp-input.invalid:focus-visible`에 `--err` outline을 준다 |
| U-45 | 확정(초안 유래) | 4 P14 | 인라인 code 칩의 명암 방향과 유무가 화면마다 다르다. 같은 문장이 상태 줄에서는 칩이고 Settings에서는 일반 텍스트다(`styles.css:212,299,337`, `Home.tsx:60`, `settingsProjects.tsx:110`). | 한쪽으로 맞추거나 차이를 문서화한다 |
| U-46 | 확정(표시 여부는 런타임) | 1 W13 | 네이티브 피커 제목이 제각각이다. 메뉴식 말줄임표가 있고, Locate는 프로젝트 이름이 없고, Set Up 폼의 token 피커에는 제목이 없다(`index.ts:420,435,458,552,645,820-821`). | 제목 규칙을 하나로 정한다 |
| U-47 | 확정 | 1 W11 | 같은 상태 계열에서 곧은 아포스트로피와 굽은 아포스트로피가 섞여 있다("Couldn't read" 칩 `AddProjectsDialog.tsx:33` vs "Couldn’t read" 토스트, `machine.ts:181,287,311,318`). | ’로 통일한다(문서화된 예외만 유지) |
| U-48 | 확정 | 1 W12 | 같은 제거 동작에 라벨이 세 개다: Remove, Remove from doan, Remove all(`Home.tsx:51,86,91`, `settingsProjects.tsx:100`). | "Remove from doan"으로 통일한다(Remove all은 유지) |
| U-49 | 결정 필요 | 1 W14 | 배너는 Settings에서 고칠 수 없는 원인(translocation, blocked)에도 "Fix…"를 쓴다(`Home.tsx:39`, `connectionRowView.ts:37,46`). | "Review…" 같은 라벨을 정한다 |
| U-50 | 결정 필요 | 1 W10, 4 P19 | 프레임 이름 규칙이 화면마다 다르다. 트리·Quick Open·Home은 title 우선이고 Inspector·댓글은 id 우선이다. 대체값도 다르다. id와 title이 모두 없는 프레임은 Home의 "Selected:" 줄이 사라진다(`homeCards.ts:79-82`, `Home.tsx:103`). 트리와 Inspector는 "(no id)"를 보인다(`canvasTree.ts:53-55`, `canvasView.ts:96-98`). | 표시 헬퍼 하나를 쓴다(Home은 트리의 `frameLabel`을 재사용한다) |
| U-51 | 확정 | 2 R2-14 | 확인 대화상자의 확인 버튼 가운데 Delete comment만 primary 강조가 없다(`CommentsPanel.tsx:250` vs `Onboarding.tsx:65`, `SettingsDialog.tsx:9`, `AddProjectsDialog.tsx:48`, `ProjectSetupDialog.tsx:80`). 편집기 Cancel이 입력한 글을 확인 없이 버리는 것은 결정이 필요하다. | 강조 규칙을 맞춘다(파괴 동작 강조는 결정이 필요하다) |
| U-52 | 기록만(초안 유래) | 4 P20 | 같은 오른쪽 열의 패널 제목 굵기와 여백이 다르다(Canvas/Inspector `.phead` 600·14px vs Comments `h3` 700·12px, `styles.css:96,137-138`). | 화면별 의도로 문서화한다 |

## 4. 화면·상태 커버리지

상태 표기: **소스 검토** = 해당 관점의 규칙을 소스로 추적함. **런타임 관찰** = 실행 화면 확인(이번에는 모두 없음). **미확인** = 소스로 판단할 수 없음.

| 화면 | 1 문구 | 2 동작·복구 | 3 상태 전환 | 4 표현 | 런타임 관찰 |
|---|---|---|---|---|---|
| S1 Home | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S2 Add 흐름(체크리스트, 확인, 드롭) | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S3 Set Up 대화상자 | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S4 작업 공간 셸·상태 줄·사이드바 | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S5 Overview | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S6 캔버스 뷰 | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토(2차) | 없음 |
| S7 Inspector·Canvas info | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토(2차) | 없음 |
| S8 댓글 패널·대화상자·핀 | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S9 Quick Open | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S10 Settings(Connections, Projects) | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S11 온보딩 마법사(PickOne/Confirm 대화상자 포함) | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토 | 없음 |
| S12 토스트 | 소스 검토 | 소스 검토 | 소스 검토 | 소스 검토(2차, 겹침 폭만 미확인) | 없음 |
| S13 네이티브 메뉴·창·메시지 박스 | 소스 검토(시트 제목 표시는 미확인) | 소스 검토 | 소스 검토(메뉴 활성화와 모달 상태 경합은 추론) | 미확인: macOS가 그림 | 없음 |
| S14 공유 토큰·프리미티브 | 소스 검토 | N/A: 동작 없음 | 동작 부분만 소스 검토(시각은 관점 4) | 소스 검토 | 없음 |

| 공유 개념 | 상태의 근원 | 검토 |
|---|---|---|
| 프로젝트 정체성·가용성 | main `folderState`/`shell`/`view` | 4관점 소스 검토 (U-3, U-7, U-10, U-15, U-27) |
| 에이전트 연결·setup 상태 | `setupBroker`/`setupCauses`/`setup/*` | 4관점 소스 검토 (U-13, U-14, U-20, U-24, U-32, U-49) |
| 선택·현재 프레임 | `CanvasController`, main selection | 4관점 소스 검토 (U-17, U-30, U-50) |
| 캔버스 유효성 | `doan ls` 행, `canvasView` | 4관점 소스 검토 (U-9) |
| 로딩·대기 | 화면별 | 4관점 소스 검토 (U-2, U-29, U-42) |
| 오류·복구 | main 응답 | 4관점 소스 검토 (U-1, U-5, U-11, U-19, U-26) |
| 파괴·확인 동작 | 여러 곳 | 소스 검토 (U-51, R2-14 확인 표: 프로젝트 제거는 Undo, serve 제거는 확인 없음 — 모두 문서화된 의도) |
| 클립보드 피드백 | main copy 응답 | 소스 검토 (모두 main의 await 뒤 성공 표시. U-19는 실패 표현) |

인벤토리에 없던 표면도 리뷰어들이 찾아 검토했다:
- 마법사 `PickOneDialog`·`ConfirmDialog`, Settings `SettingsDialog`
- 작업 공간 상태 줄 `ProblemActions`, Radix 행·worktree 메뉴
- 네이티브 "Can’t open project" 메시지 박스와 피커 제목
- 시작 복원 대기 구간, Settings 쓰기 중 닫기 거부

## 5. 의도된 차이로 기록한 것

결함으로 올리지 않았다. 근거는 scratch 파일에 있다.
- 실패 시 이전 데이터를 유지할지 비울지는 화면마다 다르다. 각 정책이 문서화돼 있다.
- 거부된 선택과 Details를 어떤 곳은 토스트로, 어떤 곳은 인라인으로 보인다.
- Settings는 자기 쓰기 중 닫기를 메시지 없이 거부한다(PRODUCT §7 app-setup).
- Locate의 non-list 메시지 한계는 이미 수용됐다.
- 대화상자의 초기 포커스는 종류별로 일관된다.
- 위젯 종류별로 키보드 모델이 다르다. Overview 카드 그리드의 Tab 모델만 문서화돼 있지 않다.
- 대화상자 폭, `.comments-btn` 크기, 작은 버튼 변형, 칩·배지 형태, destructive 색이 없는 점은 DESIGN의 문서화된 차이다.
- 프로젝트 제거는 확인 대신 Undo를 쓰고, serve 제거·token CSS 해제는 확인 없이 진행한다(PRODUCT §7 R5, Decision 4).

## 6. POSTMORTEM 적용 점검

| 항목 | 결과 |
|---|---|
| 2026-10-25 로딩 중 토스트 Open 누락 | 로딩은 해결됐다. 읽기 결과가 non-list면 여전히 버린다(U-3). 시작 복원에는 규칙이 적용되지 않았다(U-2) |
| 2026-10-25 forwarded Settings target이 확인을 버림 | Connections는 준수한다. Projects 창에서 재발했다(U-18) |
| 2026-10-25 제거 후 카드 키보드 탐색 / 기억된 캔버스 유지 / draft origin 기준 제거 / 다음 제거 중 Undo / Locate의 old selection | 준수 |
| 2026-10-25 읽을 수 없는 pick을 setup으로 제안 | 준수(문구의 아포스트로피만 U-47) |
| 2026-10-25 overflow hidden 체크리스트 | 준수(경계가 있는 목록은 모두 `overflow-y: auto`) |
| 2026-10-24 바깥에서 Set Up이 닫힐 때 포커스 | Home은 준수한다. 작업 공간에서는 재발했다(U-6) |
| 2026-10-24 위저드 키·클릭과 모달 스태킹 | 준수. 단, 레이어가 아닌 출력(토스트)이 위저드 아래로 가는 공백이 새로 있다(U-4, U-16) |
| 2026-10-24 setup 메뉴가 위저드 세션 폐기 | 해당 없음(위저드는 첫 실행 전용, `openSettings`는 위저드 중 거부) |
| 2026-10-24 `.value` 클래스 재사용 | 준수(`.ob-field .value` 범위 지정 유지) |
| 2026-10-23 draft guard 전환 타이밍 | 초안이 없을 때의 동기 경로는 준수한다. 요청이 걸린 `false` 경로는 U-1, Delete 대화상자 Escape는 U-17 |
| 2026-10-23 pin 완료 fence / 문서 없는 링크 / tooltip latch | 준수 |
| 2026-10-23 copy 조기 성공 | 준수(모든 복사가 main 응답을 기다린다) |
| 2026-10-23 mkdir 자식 미확인 종료 | 준수(`recovery-blocked`에 재시도 없음). 이동 영향은 U-1 |
| 2026-10-23 full-width 단언의 스크롤바 | 표현 영향만 있다. 기본 스크롤바를 쓰는 표면(U-37)은 이후 폭 단언에서 따로 다뤄야 한다 |
| 2026-10-22 zero-mismatch 표가 자식을 놓침 | 재발: `.ob-reason code`(U-34) |
| 2026-10-21 HTML 파서 오류가 meta 누락처럼 보임 | UI 단계에서 재발했다(U-9) |

## 7. 권장 다음 단계

1. U-1을 코드 감사 A-M1·A-M2와 같은 변경으로 묶는다. 먼저 요청이 걸린 초안의 대화상자 방침과 격리 상태의 root 간 이동 허용 여부를 정한다.
2. 다음으로 U-2~U-7을 고친다. 순위 1에 해당하고 각각 범위가 좁다. U-6은 포커스 대체 헬퍼 하나로 T-2와 T-3을 함께 해결한다.
3. 결정이 필요한 항목은 PRODUCT §7에 기록하고 문구와 표현을 정리한다. 대상: U-9, U-13, U-27, U-35(§8 툴팁), U-38, U-41, U-49, U-50.
4. 화면에 관한 주장은 수정 전후에 `/runtime-test`로 확인한다. 특히 U-8 포커스 링, U-31 겹침, U-16 토스트를 본다. 이 보고서는 정적 결과이므로, 시각적 일치는 실행 화면으로 확인해야 한다.
