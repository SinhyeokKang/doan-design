# 프로젝트 대화의 handoff — design

## 결정

- **범위**: PRODUCT §3 Out of scope 4의 handoff 예외를 프로젝트 대화의 턴까지 넓힌다. 사람의 메시지로 시작된 턴이 에이전트가 요청한 새 캔버스에만 새 대화를 시작한다는 성격은 그대로다(사람이 범위 확인에서 정했다).
- **promotion**: 완전히 없앤다. 대비책으로 남기지 않는다(사람이 정했다).
- **기존 캔버스만 고친 턴**: 아무 일도 일어나지 않고 대화가 Overview에 남는다. handoff는 새 캔버스에만 된다(사람이 정했다).
- **루트 잠금**: 없앤다. 캔버스 대화처럼 프로젝트 대화도 여럿이 동시에 돈다. 잠금은 promotion이 새 캔버스를 엉뚱한 대화에 묶지 않게 하려던 것이고, handoff는 턴마다 자기 시작 시점 스냅샷으로 판정하므로 그 이유가 사라진다(사람이 "정책 일관성"을 이유로 정했다).
- **화면 이동**: 캔버스 handoff와 같은 규칙이다. 원본 페이지는 '그 루트의 Overview가 원본 대화를 보여주는 상태'다. 단일과 복수 모두 이 조건으로 판단한다. Home에서 보낸 대화가 새 캔버스를 바로 열던 동작은 이 규칙으로 대체한다(사람이 정했다).
- **대상 캔버스 패널**: 패널이 '대화가 없어서' 자동으로 새 대화 상태이고 초안이 비어 있으면 handoff로 생긴 대화가 차지한다. 캔버스 → 캔버스 handoff에도 적용해 두 경우를 맞춘다. 지금 PRODUCT의 "A conversation a handoff started never takes its place"가 바뀐다(사람이 정했다).
- **Drawing 미리보기**: 없앤다. 캔버스 → 캔버스 handoff에도 미리보기가 없으므로 두 경우가 같아진다(사람이 "다 같이 하거나 다 같이 안 하거나" 중 안 하는 쪽을 골랐다). handoff 뒤 그 캔버스에 남는 것은 원본 대화가 아니라 새 대화라서, 남지 않을 대화를 비활성 composer로 보여줄 이유가 없다. 그리는 동안의 진행은 에이전트가 `doan work update`를 보내면 대상 캔버스 보드의 작업 표시(PRODUCT §5 item 2 'Agent indicator')가 보여준다. 캔버스 → 캔버스와 같은 조건이다.
- **원본 표기**: 새 대화의 첫 카드는 "Handed off from Overview"(캔버스 헤더가 프로젝트를 이미 보여준다), 토스트는 "<project> Overview handed off to <target file>"과 "<project> Overview handed off to <n> canvases"다. 토스트는 다른 프로젝트나 Home에서도 뜨므로 프로젝트 이름을 붙인다(사람이 정했다).
- **원본 대화 삭제**: 첫 카드의 Open을 숨기고 머리에 " · Conversation deleted"를 붙인다. 원본 캔버스가 사라진 카드의 " · No longer in <project>"와 같은 방식이다. 복수 토스트의 Open도 원본이 없으면 같은 판단을 한다(사람이 정했다).
- **안내 문구**: `HANDOFF_GUIDANCE`를 "…or to stay on this canvas or in this conversation"으로 넓힌다. 캔버스 대화 프롬프트도 바뀐다(사람이 정했다).
- **conversation strip**: 끝난 상태는 "Done"과 Dismiss만 보여주고, handoff는 토스트가 알린다(사람이 정했다).
- **ACP provider**: 맨 앞에 PoC task를 둔다. ACP runner는 이미 `tool_call`의 `kind: "edit"`와 `locations`를 편집 경로로 읽는다(`acp.ts`, `acpRunner.test.ts`). 실제 Cursor·Antigravity·Copilot 서버가 보내는지만 확인되지 않았다. 필요하면 어댑터 수정도 이 feature에서 한다(사람이 정했다).
- **Home 안내**: Home에서 시작한 대화는 이제 캔버스에 묶이지 않으므로 `HOME_GUIDANCE`가 모든 턴에 붙는다(`fromHome && !metadata.canvas` 조건이라 코드 변경은 없다). conductor's call — 문구가 "Home에서 캔버스 선택 없이 보냈다"는 사실만 말하므로 계속 맞다.

## 바뀌는 규칙과 바뀌지 않는 규칙

- **루트 잠금 제거**: `projectBusy`, `checkProject`(`project_busy`), 판정 증거(`Evidence`)와 `projectEvidence`, `BIND_GRACE_MS`의 잠금 용도, `live.project`, list의 `projectTurnId`를 걷어낸다. renderer의 `project_busy` 사유 줄(`dockedRules.ts`, `HomeComposerView.tsx`, `homeRun.ts`의 `running()`과 `BIND_GRACE_MS` 사본)도 없앤다. 이유: 잠금이 사라지면 `working`과 거부가 서로 다른 신호를 읽는 문제(postmortem 2026-11-17)도 함께 사라진다.
- **working·큐**: 프로젝트 대화도 캔버스 대화와 같다. handoff를 기다리는 동안 원본 큐는 잡혀 있고 `working`이 true이며(`queue()`, `settleHandoff`), `handoffQueueOutcome`대로 처리한다. `awaitJudged`와 `this.judging`은 handoff 대기(`handoffWait`)에 남고 `judgement()`만 없앤다.
- **판정 시점**: `promotionDeadline`을 `settleDeadline`으로 이름만 바꿔 남긴다. 쓰는 곳은 handoff 판정, missed 판정, 캔버스 카드(`drawWatches`, `canvas.drawn`) 셋이다. 동작 변화는 없다.
- **원본이 프로젝트일 때 main**:
  - `HandoffOrigin.canvas`를 선택으로 바꾸고, 없으면 원본이 Overview(프로젝트 대화)다. 새 필드는 없다. `store.ts`의 `origin()` 검증도 같이 바꾼다. `startedBy`(`summary.ts`)는 바뀌지 않는다.
  - `turn.source`가 없을 때도 알림을 보낸다(`settleHandoff`). `HandoffNotice`·`HandoffMultiNotice`의 `source`를 '캔버스 또는 Overview'로 바꾼다.
  - missed 판정(`writeMissed`, `MissedInput.source`)이 캔버스 없는 원본에도 동작한다.
  - `checkHandoffSource`와 취소 규칙은 그대로 적용된다.
  - 이전 빌드는 canvas 없는 origin을 읽지 못한다(ARCHITECTURE의 대화 기록 하위 호환 문장에 이 경우를 더한다).
- **거부 사유**: `not_canvas_conversation`은 더 나오지 않는다. 앱 소켓 v5의 오류 enum과 CLI 처리는 예전 앱을 위해 남기고 스키마 버전은 올리지 않는다. ARCHITECTURE §4의 검사 순서 문장에 "더 보내지 않음"을 적는다. Plan(`plan_mode`), 같은 경로 두 번(`already_requested`)은 그대로다. `handoff_turn`·`same_canvas`는 프로젝트 원본에 해당 없다.
- **겹치는 턴**: promotion의 `contested`·`taken`이 없어진다. 한 새 캔버스에 여러 턴(프로젝트·캔버스 대화 어느 쪽이든)이 handoff를 요청하면 각자 판정되어 둘 다 시작될 수 있다. 캔버스 대화끼리 지금도 가능한 상황과 같다.
- **Move to Trash**: `trashBusy`의 `evidence` 인자를 지운다(`canvasTrash.ts`, `index.ts`). renderer의 `trashBlock` `"drawing"`과 `homeRun.drawing` 인자(`canvasRowMenu.ts`, `App.tsx`)도 없앤다. 캔버스 handoff 대상은 지금도 막지 않고, 판정 중 휴지통으로 간 대상은 `not_listed`로 거부된다.
- **프로젝트 제거**: 제거의 Stop이 그 루트 대화의 대기 중 handoff를 `cancelHandoff`로 취소한다(삭제가 이미 하는 것과 같다). 지금은 `interruptProjectTurn`이 큐만 돌려주고 handoff를 기다려서, 제거 중인 루트에 새 대화가 시작될 수 있다.
- **화면 이동 판정(renderer)**: `HandoffScreen`에 'Overview가 보여주는 루트와 대화'를 더한다. '고름'은 `overviewRun`의 revision이나 intent 변화(목록·메뉴 선택, New, 다른 대화에서 보내기)다. '입력 중'은 Overview composer의 초안·IME, 그리고 Conversations 목록이나 열린 헤더 메뉴의 키보드 포커스다. 문제·읽기 오버레이가 덮은 Overview는 원본을 보여주지 않는 것으로 본다.
- **대상 패널**: `newConversationFollow`가 `startedBy === "promotion"` 대신 handoff로 시작된 대화를 따른다(자동 새 대화 상태이고 초안이 빈 경우만). 캔버스 원본과 프로젝트 원본 모두 해당한다.
- **예전 기록**: `conversation.bound` 이벤트, `bind`/`promote` 저널, `startedBy: "promotion"`은 읽기만 남긴다. 기존 기록의 스레드 표시("Moved here from <project> Overview")와 승격으로 묶인 대화의 캔버스 소속은 그대로다.

## 영향받는 구성 요소

- **app (main)**
  - `conversation/handoff.ts`: `handoffEligibility`(캔버스 없는 Doan 연결 대화 허용), `handoffGuidanceFor`(캔버스 조건 제거), `missedHandoffs`·`MissedInput`, `handoffNoticeKind`, `HandoffNotice`·`HandoffMultiNotice`의 원본 타입, 알림 문구.
  - `conversation/prompt.ts`: `HANDOFF_GUIDANCE` 문구, `handoffPrompt`의 `context.from`이 프로젝트 원본을 나타냄(예: `from` 없음과 원본 설명 문장 변경).
  - `conversation/service.ts`: promotion 판정(`judge`, `promoteTo`, `Evidence`, `contested`, `judgement()`), `checkProject`·`live.project`, 프로젝트 턴의 `HandoffTurn`과 `HANDOFF_GUIDANCE`, `startHandoff`의 origin, `settleHandoff` 알림, `writeMissed`, 제거 시 `cancelHandoff`, `projectTurnId`.
  - `conversation/project.ts`: `projectBusy`, `promotionTarget`, `contestedCanvas`, `candidates`, `canvasesAt` 삭제. `promotionDeadline` → `settleDeadline`.
  - `conversation/types.ts`, `store.ts`, `summary.ts`: `HandoffOrigin.canvas` 선택, `origin()` 검증. `conversation.bound`·`bind`·`promote`는 읽기만.
  - `conversation/ipc.ts`, `preload/index.ts`: `project_busy` 경로.
  - `prototype/promoted.ts`, `prototype/drawing.ts`, `targetRelay.ts`, `prototype/ipc.ts`의 `promoted`·`promotedChanged`·`drawing`·`setDrawing` 채널, `preload/prototype.ts`, `index.ts`의 중계 연결: 삭제. 그 뒤 `node app/scripts/viewerInspect.mjs`로 `cli/internal/export/viewer/viewerApp.js`를 다시 만든다.
  - `canvasTrash.ts`, `index.ts`: Move to Trash 증거 삭제.
- **app (renderer)**
  - Overview: `overviewConversation.ts`(`OverviewChange{kind:"promoted"}`, `forget`), `overviewRun.ts`(promotions, moved 줄, `moveDraft`, `markPromotion`), `ProjectOverview.tsx`(moved 알림). overview-conversation-list의 '보이는 중 승격' 행 규칙.
  - 캔버스 패널: `canvasConversation.ts`(`DRAWING_*`, `PROMOTED_TEXT`), `canvasRun.ts`(`drawingPreview`, drawing/promoted host), `newConversationFollow.ts`(handoff 따라가기), `CanvasConversationPanel.tsx`(미리보기 비활성 composer), `rightPanelOpen.ts`(`promotion` trigger), `App.tsx`(drawing host, `openConversationCanvas(…{kind:"promotion"})`, `onOpenHandoff`의 Overview 경로).
  - Home: `homeRun.ts`(`canvasAppeared`의 자동 열기, `drawing()`/`binding()`, `BIND_GRACE_MS` 사본, `running()`), `conversationStrip.ts`("Done"), `conversationList.ts`(판정 대기 working), `dockedRules.ts`, `HomeComposerView.tsx`.
  - handoff: `handoffView.ts`(원본 라벨, 토스트 문구, `handoffMove`·`handoffMultiStep`의 원본 페이지 판정), `App.tsx`의 handoff 도착 처리와 `HandoffScreen`, `threadItems.ts`·`ConversationThread.tsx`의 `HandoffCard`(Overview 원본의 Open, 원본 삭제 시 머리).
  - 기타 promotion 참조: `conversationStore.ts`, `canvasCardText.ts`, `agentIndicator.ts`, `canvasRowMenu.ts`.
  - 프로토타입 창: `prototype/conversationRun.ts`, `PrototypeConversation.tsx`의 promotion·drawing 처리.
- **CLI**: `cli/internal/cli/handoff_rules.go`의 `not_app_conversation` 다음 단계 문구를 "works only in a conversation in the Doan app"으로 바꾼다. `not_canvas_conversation` 처리는 남긴다.
- **eval**: 러너가 캔버스 없는 handoff 시나리오를 받는다(`eval/lib/scenario.ts`의 `handoff` 형식, `socket.ts`의 fake 앱 `same_canvas` 판단, `workspace.ts`). 새 시나리오 `R12`는 Home에서 보낸 대화(`turnPrompt(…, {root}, {handoff: true, home: true})`)가 새 캔버스를 만들고 handoff한다. `HANDOFF_GUIDANCE`가 바뀌므로 R8d, R9b, R10, R11의 `prompt.md`도 다시 맞춘다.
- **ACP 어댑터**: PoC 결과에 따라 `acp.ts`의 편집 경로 읽기를 고칠 수 있다.
- **포맷**: 앱 소켓 v5는 바뀌지 않는다. 대화 기록은 기기 로컬이고 공유 스키마가 없다(ARCHITECTURE §11).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `handoffEligibility`, `handoffGuidanceFor`, `handoffDecision`(source 없음), `missedHandoffs`, `handoffNoticeKind`, `handoffPrompt`, `HANDOFF_GUIDANCE` 문구.
- `store.ts`의 `origin()` 검증(canvas 없는 origin 허용).
- `handoffView.ts`: 원본 라벨, 토스트 문구, `handoffMove`·`handoffMultiStep`의 원본 페이지 판정(긍정과 부정: 같은 루트 Overview가 다른 대화나 New를 보여줌, 다른 worktree, 입력 중, 목록 포커스, 오버레이, Home·Settings).
- `newConversationFollow`: handoff로 시작된 대화가 자동 새 대화 상태의 빈 패널을 차지함, 사람이 고른 New나 초안이 있으면 아님.
- `overviewRun`·`overviewConversation`: promotion 경로를 걷어낸 뒤 동작(예전 기록의 `conversation.bound`가 Overview를 바꾸지 않음).
- `canvasRun`: Drawing 미리보기 없음.
- `conversationStrip`: "Done"만.
- `summary`: 새 기록에 `startedBy: "promotion"`이 없고 예전 기록은 읽힘.

## 포맷 변경

- 공유 스키마: 없다. 앱 소켓 v5의 오류 enum은 그대로다.
- 기기 로컬 대화 기록: `HandoffOrigin.canvas`가 선택이 된다. 없으면 원본이 Overview다. 이전 빌드는 이 기록을 읽지 못한다(ARCHITECTURE에 적는다).
- eval 시나리오 형식(`scenario.json`의 `handoff`): 캔버스 없는 형태를 받는다. eval 전용이다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다. 앱의 턴 프롬프트(`HANDOFF_GUIDANCE`)가 바뀌고 가이드나 스킬 스텁은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 Out of scope 4의 handoff 예외를 넓힌다(사람이 승인했다). 문서 승격 task에서 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에는 닿지 않는다.
- 앱 소켓 credential(`DOAN_HANDOFF`)은 지금도 프로젝트 대화 runner마다 주어진다(ARCHITECTURE §7 'Handoff' 'Key'). 새로 넓어지는 권한은 없다.

## PoC 의존

- **ACP provider의 편집 경로와 `doan handoff` 실행**: 확인된 적 없다. tasks 1에서 PoC로 먼저 확인한다.
- Claude Code·Codex가 프로젝트 대화에서 안내대로 `doan handoff`를 실행하는지는 eval R12와 `/agent-eval`로 확인한다. Codex의 `doan-handoff.rules`가 Ask 모드에서 승인을 묻는 경로는 프로젝트 대화에서 실제로 돌아본 적이 없으므로 runtime 프로브에 넣는다.

## 다른 feature와의 관계

- overview-conversation-list(구현 중)와 `overviewRun.ts`, `App.tsx`, `canvasConversationRows.ts`, PRODUCT의 Overview 목록 문장이 겹친다. 그 feature의 '보이는 중 승격' 상태와 시안 프레임 `promoted`는 이 feature에서 사라진다. 구현은 그 feature가 develop에 머지된 뒤 시작한다(tasks 0).

## postmortem에서 가져온 함정

- **2026-11 'A handoff's first message that starts with a command name was drawn as a command turn'**(2026-11.md:397): canvas 없는 origin에서도 첫 메시지를 사람의 메시지로 그리지 않는다.
- **2026-11 'A handoff line after a turn's end kept the unseen dot on the conversation the person was looking at'**(2026-11.md:431): 원본이 Overview에 보이는 동안 handoff 줄이 오면 Overview의 seen 규칙을 따른다.
- **2026-11 'A queue taken back as a draft was still sent by the flush already under way'**(2026-11.md:855): 프로젝트 턴의 큐가 `settleHandoff` 경로로 옮겨 갈 때 같은 경쟁을 테스트한다.
- **2026-11 'A project conversation's queue made while its rate-limited turn waited for judgement went out before the reset'**(2026-11.md:381): 판정 대기가 없어진 뒤 사용량 한도 대기 큐가 리셋 전에 나가지 않는다.
- **2026-11 'The same conversation read as finished in its row while Delete said the agent was working'**(2026-11.md:603): `working`의 의미가 'handoff 대기'만 남는다. 목록 상태와 Delete가 같은 신호를 읽는다.
- **2026-11 'The promotion divider offered Open on its own canvas'**(2026-11.md:170): 예전 기록의 marker 읽기를 남길 때 이 수정을 유지한다.
- **2026-11 'Agents in Doan conversations held the same app-socket credential…'**(2026-11.md:414): 프로젝트 대화 runner의 `DOAN_HANDOFF`가 그 runner에만 유효하다.
- **2026-11-14 프로토타입 창의 drawing 수정**(2026-11.md:789, :816): drawing 중계를 지울 때 그 수정이 막던 경로가 다른 형태로 남지 않는지 확인한다.
- **2026-10 'Awaited conversation work outlived its current turn'**(2026-10.md:213): `checkHandoffSource`가 프로젝트 원본에도 같은 취소 규칙을 적용한다(원본 삭제 뒤 시작 취소).
- **2026-10-28 프로세스 그룹 대기**(`service.turnEnd.test.ts`): `turn.done`에 보낸 메시지가 이전 프로세스 그룹만 기다리는 동작을 판정 제거 뒤에도 유지한다.
- **2026-11 'One missing handoff in an eval run was reported as three failed checks'**(2026-11.md:863): R12의 판정 항목을 이 수정에 맞춘다.

## 참고한 디자인 프리셋

- `shape`: 화면 구성은 바뀌지 않고, 기존 handoff 카드·토스트·캔버스 카드를 프로젝트 원본에도 쓴다. 새 시안은 필요 없다(문구만 바뀐다).
