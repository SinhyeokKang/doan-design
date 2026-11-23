# 프로젝트 대화의 handoff — design

## 결정

- **범위**: PRODUCT §3 Out of scope 4의 handoff 예외를 프로젝트 대화의 턴까지 넓힌다. 사람의 메시지로 시작된 턴이 에이전트가 요청한 새 캔버스에만 새 대화를 시작한다는 성격은 그대로다(사람이 범위 확인에서 정했다).
- **promotion**: 완전히 없앤다. 대비책으로 남기지 않는다(사람이 정했다).
- **기존 캔버스만 고친 턴**: 아무 일도 일어나지 않고 대화가 Overview에 남는다. handoff는 새 캔버스에만 된다는 규칙도 그대로다(사람이 정했다).
- **화면 이동**: 캔버스 handoff와 같은 규칙이다. 원본 페이지는 '그 대화를 보여주는 Overview'다. Home에서 보낸 대화가 새 캔버스를 바로 열던 동작은 이 규칙으로 대체한다(사람이 정했다).
- **Drawing 미리보기**: 없앤다. 캔버스 → 캔버스 handoff와 맞춘다. 캔버스 handoff의 대상 패널은 그리는 동안 원본 대화를 미리 보여주지 않으므로, 프로젝트 대화도 같게 한다(사람이 "캔버스 to 캔버스와 맞춰야 한다"고 했다).
- **원본 표기**: 새 대화의 첫 카드는 "Handed off from Overview", 토스트는 "Overview handed off to <target file>"과 "Overview handed off to <n> canvases"다. Open은 그 루트의 Overview를 열고 원본 대화를 요청한다(사람이 정했다).
- **Home 안내**: Home에서 시작한 대화는 이제 캔버스에 묶이지 않으므로 `HOME_GUIDANCE`가 모든 턴에 붙는다(지금도 `fromHome && !metadata.canvas` 조건이라 코드 변경은 없다). conductor's call — 문구가 "Home에서 캔버스 선택 없이 보냈다"는 사실만 말하므로 계속 맞다.

## 바뀌는 규칙과 바뀌지 않는 규칙

- **루트 잠금**: 한 루트에서 프로젝트 대화 하나만 일한다는 제한은 그대로다. 지금은 턴이 끝난 뒤 promotion 판정까지 루트를 잡는데, 판정이 없어지므로 handoff 요청이 있는 턴만 캔버스 대화와 같이 handoff가 모두 정해질 때까지 `working`으로 남는다(`settleHandoff`). 요청이 없는 턴은 끝나는 즉시 루트를 놓는다.
- **큐**: 캔버스 대화와 같다. handoff를 기다리는 동안 원본 큐는 잡혀 있고, `handoffQueueOutcome`대로 처리한다(새 대화 하나가 시작되면 큐가 그 대화로 옮겨 간다).
- **판정 시점**: handoff 판정은 지금도 `promotionDeadline`을 쓴다. promotion은 사라지지만 판정 시점 함수와 상수는 handoff와 missed 판정에 남는다. 이름을 바꿀지는 구현 때 정한다(동작 변화 없음).
- **거부 사유**: `not_canvas_conversation`은 더 나오지 않는다. 앱 소켓 v5 스키마의 오류 enum과 CLI의 처리는 예전 앱을 위해 남기고, 스키마 버전은 올리지 않는다. Plan(`plan_mode`), handoff로 시작된 턴(`handoff_turn`, 프로젝트 대화에는 해당 없음), 같은 경로 두 번(`already_requested`)은 그대로다. `same_canvas`는 원본 캔버스가 없는 프로젝트 대화에는 해당 없다.
- **겹치는 턴**: promotion의 `contested`·`taken` 규칙은 없어진다. 대신 한 캔버스에 여러 턴이 handoff를 요청할 수 있는데, 이는 캔버스 대화끼리 지금도 가능한 상황과 같다(각 요청을 따로 판정한다).
- **예전 기록**: `conversation.bound` 이벤트와 `startedBy: "promotion"`은 읽기만 남긴다. 새로 쓰지 않는다. 기존 기록의 스레드 표시("Moved here from <project> Overview")와 승격으로 묶인 대화의 캔버스 소속은 그대로다.
- **Move to Trash**: 지금 `projectEvidence()`가 판정 안 된 프로젝트 턴의 캔버스를 휴지통 이동에서 막는다. promotion이 없으면 이 증거도 없어지므로, handoff를 기다리는 턴의 요청 경로만 막는다(캔버스 대화의 handoff와 같은지 구현 전에 확인한다).

## 영향받는 구성 요소

- **app (main)**
  - `conversation/handoff.ts`: `handoffEligibility`가 캔버스 없는 Doan 연결 대화를 받아들인다. `handoffGuidanceFor`가 캔버스 조건을 뺀다. 알림 문구.
  - `conversation/prompt.ts`: `handoffPrompt`의 `context.from`이 프로젝트 원본을 나타낸다(예: 캔버스 대신 `{ overview: true }`). 문구는 "context.from is the canvas that conversation worked on"을 원본 종류에 맞게 고친다.
  - `conversation/service.ts`: promotion 판정(`judge`, `promoteTo`, 증거 `Evidence`, `contested`), project turn의 판정 대기와 `working` 결합, `judgement()`/`awaitJudged` 경로 정리. 프로젝트 턴에서 `HandoffTurn`과 `HANDOFF_GUIDANCE`. `startHandoff`의 원본 기록(첫 메시지 origin에 원본이 프로젝트임을 남긴다).
  - `conversation/project.ts`: `promotionTarget`, `contestedCanvas`, `candidates`, `canvasesAt` 삭제. `projectBusy`와 `promotionDeadline`은 남긴다.
  - `conversation/types.ts`, `store.ts`, `summary.ts`: 원본 종류를 담는 handoff 이벤트 필드, `startedBy` 계산. `conversation.bound`·`bind`·`promote`는 읽기만.
  - `prototype/promoted.ts`, `prototype/drawing.ts`, `targetRelay.ts`: 프로토타입 창의 promotion·drawing 중계 삭제.
  - `canvasTrash.ts`, `index.ts`: 위 Move to Trash 증거.
- **app (renderer)**
  - Overview: `overviewConversation.ts`(`OverviewChange{kind:"promoted"}`, `forget`), `overviewRun.ts`(promotions, moved 줄, `moveDraft`, `markPromotion`), `ProjectOverview.tsx`(moved 알림).
  - 캔버스 패널: `canvasConversation.ts`(`DRAWING_*`, `PROMOTED_TEXT`), `canvasRun.ts`(`drawingPreview`, drawing/promoted host), `newConversationFollow.ts`(promotion 따라가기), `CanvasConversationPanel.tsx`(미리보기 비활성 composer), `rightPanelOpen.ts`(`promotion` trigger), `App.tsx`(drawing host, `openConversationCanvas(…{kind:"promotion"})`).
  - Home: `homeRun.ts`(`canvasAppeared`의 자동 열기, `drawing()`/`binding()`, `BIND_GRACE_MS` 사본), `conversationStrip.ts`("Done · <canvas> is ready.").
  - handoff: `handoffView.ts`(원본 라벨 "Overview", `handoffMove`의 원본 페이지 판정), `App.tsx`의 handoff 도착 처리, `threadItems.ts`·`ConversationThread.tsx`의 `HandoffCard`(원본이 Overview일 때의 Open).
  - 프로토타입 창: `prototype/conversationRun.ts`, `PrototypeConversation.tsx`의 promotion 처리.
- **CLI**: `cli/internal/cli/handoff_rules.go`의 `not_app_conversation` 다음 단계 문구("works only in a canvas conversation in the Doan app")를 "works only in a conversation in the Doan app"으로 바꾼다. `not_canvas_conversation`의 처리는 예전 앱을 위해 남긴다.
- **eval**: 프로젝트 대화(Home 또는 Overview)에서 새 캔버스를 만들고 handoff하는 시나리오를 추가한다(R10의 프로젝트판). `turnPrompt`가 바뀌므로 R8d, R9b, R10, R11의 `prompt.md` 확인도 다시 돈다.
- **포맷**: 앱 소켓 v5는 바뀌지 않는다(위 '거부 사유'). 대화 기록은 기기 로컬이고 공유 스키마가 없다(ARCHITECTURE §11).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `handoffEligibility`: 캔버스 없는 Doan 연결 대화를 받아들이고, Plan·이미 요청한 경로는 지금처럼 거부한다.
- `handoffGuidanceFor`: 프로젝트 대화의 턴(Plan 아님)에 true.
- `handoffDecision`: `source`가 없는 경우(프로젝트 원본)의 판정. 지금도 `source?`라 동작 확인만 한다.
- `handoffPrompt`: 프로젝트 원본의 `context.from`과 문구.
- `handoffView.ts`의 원본 라벨·토스트 문구·`handoffMove`(원본 페이지가 그 대화를 보여주는 Overview일 때).
- `overviewRun`·`overviewConversation`: promotion 경로를 걷어낸 뒤의 동작(승격 변화가 더 오지 않음, 예전 기록의 `conversation.bound`가 와도 Overview를 바꾸지 않음).
- `canvasRun`: Drawing 미리보기 없이 새 대화 상태를 유지하고, handoff로 생긴 대화를 패널이 따르는 규칙은 캔버스 handoff와 같음.
- `summary`의 `startedBy`: 새 기록에서 `promotion`이 나오지 않고, 예전 기록은 그대로 읽힘.

## 포맷 변경

- 공유 스키마: 없다. 앱 소켓 v5의 오류 enum은 그대로다(`not_canvas_conversation`은 더 보내지 않을 뿐이다).
- 기기 로컬 대화 기록: handoff로 시작된 첫 메시지의 origin에 원본이 프로젝트 대화임을 담는 필드가 생긴다. 기존 기록과 함께 읽혀야 하므로 필드는 선택이고, 없으면 지금처럼 원본 캔버스로 본다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다. 에이전트가 받는 턴 프롬프트(`HANDOFF_GUIDANCE`)가 프로젝트 대화에도 붙는 것은 앱 프롬프트의 변화이고 가이드나 스킬 스텁은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 Out of scope 4의 handoff 예외를 넓힌다(사람이 승인했다). 문서 승격 task에서 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에는 닿지 않는다.
- 앱 소켓 credential(`DOAN_HANDOFF`)은 지금도 프로젝트 대화 runner에 주어진다(ARCHITECTURE §7 'Handoff' 'Key'). 새로 넓어지는 권한은 없다.

## PoC 의존

없다. 프로젝트 대화 runner가 이미 `DOAN_HANDOFF`를 받고, 소켓 경로는 캔버스 대화와 같다. 실제 에이전트가 프로젝트 대화에서 안내대로 `doan handoff`를 실행하는지는 eval 시나리오로 확인한다(tasks).

## 다른 feature와의 관계

- overview-conversation-list(구현 중, orchestrate conductor 진행)와 `overviewRun.ts`, `App.tsx`, `canvasConversationRows.ts` 주변이 겹친다. 그 feature의 '보이는 중 승격' 상태는 이 feature에서 사라진다. 구현은 그 feature가 develop에 머지된 뒤 시작한다.

## postmortem에서 가져온 함정

- **2026-11 'A handoff's first message that starts with a command name was drawn as a command turn'**(2026-11.md:397): 원본 종류를 첫 메시지 origin에 더할 때, 첫 메시지를 사람의 메시지로 그리지 않는 기존 처리를 깨지 않는다.
- **2026-11 'A handoff line after a turn's end kept the unseen dot on the conversation the person was looking at'**(2026-11.md:431): 원본이 Overview에 보이는 동안 handoff 줄이 오면 seen 처리가 Overview의 seen 규칙을 따르는지 테스트한다.
- **2026-11 'A queue taken back as a draft was still sent by the flush already under way'**(2026-11.md:855): 프로젝트 턴의 큐 처리를 promotion 판정에서 `settleHandoff`로 옮길 때 같은 경쟁을 테스트한다.
- **2026-11 'A project conversation's queue made while its rate-limited turn waited for judgement went out before the reset'**(2026-11.md:381): 판정 대기가 없어진 뒤 사용량 한도 대기 큐가 리셋 전에 나가지 않는지 확인한다.
- **2026-11 'The same conversation read as finished in its row while Delete said the agent was working'**(2026-11.md:603): `working`의 의미가 '판정 대기'에서 'handoff 대기'로 바뀐다. 목록 상태와 Delete가 같은 신호를 읽는지 테스트한다.
- **2026-11 'The promotion divider offered Open on its own canvas'**(2026-11.md:170): 예전 기록의 marker 읽기를 남길 때 이 수정을 유지한다.
- **2026-11 'Agents in Doan conversations held the same app-socket credential…'**(2026-11.md:414): 프로젝트 대화 runner의 `DOAN_HANDOFF`가 그 runner에만 유효한지 다시 확인한다.
- **2026-10 'Awaited conversation work outlived its current turn'**(2026-10.md:213): `checkHandoffSource`가 프로젝트 원본에도 같은 취소 규칙을 적용한다.
- **2026-11 'One missing handoff in an eval run was reported as three failed checks'**(2026-11.md:863): 새 eval 시나리오의 판정 항목을 이 수정에 맞춘다.

## 참고한 디자인 프리셋

- `shape`: 화면 구성은 바뀌지 않고, 기존 handoff 카드·토스트·캔버스 카드를 프로젝트 원본에도 쓴다. 새 시안은 필요 없다(원본 라벨 문구만 바뀐다).
