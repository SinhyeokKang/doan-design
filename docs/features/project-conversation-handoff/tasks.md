# 프로젝트 대화의 handoff — tasks

`/orchestrate`로 실행한다. 규모가 커서 `/ship` 하나에 들어가지 않는다. 배치 분할은 아래 '배치'를 기본으로 하고 conductor가 `orch.md`에서 확정한다. 각 배치는 `/ship bypass`의 순서(test 커밋 하나 → 구현 커밋 하나)를 따르고, 문서 승격은 conductor가 문서별로 커밋한다.

## 배치(제안)

- **A — main + CLI**: tasks 2, 3의 main 부분, 5. `conversation/*`, `canvasTrash.ts`, `index.ts`(중계 제외), `cli/internal/cli/handoff_rules.go`.
- **B — renderer**: tasks 3의 renderer 부분. Overview, 캔버스 패널, Home, handoff 화면, `App.tsx`, `canvasRowMenu.ts`. 알림 타입(`HandoffNotice`의 원본)은 A와 B가 기다리지 않도록 배치 계획에서 먼저 형태를 정한다.
- **C — 프로토타입 창 promotion·drawing 제거**: `main/prototype/*`, `preload/prototype.ts`, `renderer/prototype/*`, `viewerApp.js` 재생성.
- **D — eval**: task 6.
- 파일이 겹치는 배치(`index.ts`, `preload/index.ts`)는 conductor가 순서를 정한다.

## tasks

0. **선행 조건 확인**: overview-conversation-list가 `origin/develop`에 머지됐는지 확인한다. 머지 뒤 `overviewRun.ts`, `App.tsx`, `canvasConversationRows.ts`를 다시 읽고, 그 feature의 '보이는 중 승격' 행 코드·테스트를 삭제 목록에 더한다.
   - 검증: `git log origin/develop`에 overview-conversation-list 머지 커밋이 있다.
1. **ACP PoC**: Cursor, Antigravity, GitHub Copilot을 실제 계정의 격리된 복사본(AGENTS.md 'Real agent sign-ins')으로 돌린다. `.scratch/`의 짧은 프로브로 각 provider에 새 캔버스를 만들게 하고, 아래를 기록한다. 끝나면 복사본과 임시 HOME을 지운다.
   - `tool_call`의 `kind: "edit"`와 `locations` 경로가 오는지
   - 앱의 handoff 안내를 받았을 때 `doan handoff`를 실행하는지
   - 결과는 `orch.md`에 적는다. 안 되는 provider는 문서 승격에서 BACKLOG에 남긴다. 어댑터 수정이 필요하면 배치 A에 더한다.
   - 검증: provider별로 관찰 결과(경로 도착 여부, handoff 실행 여부, 버전, 날짜)가 `orch.md`에 있다. 계정 사용량 한도 등으로 확인하지 못한 provider는 '미확인'과 이유를 적는다.
2. **main 순수 함수 테스트**: `handoffEligibility`(캔버스 없는 Doan 연결 대화 허용, Plan·중복 거부 유지, legacy external 거부 유지), `handoffGuidanceFor`(프로젝트 턴 true, Plan false), `handoffDecision`(source 없음), `missedHandoffs`(캔버스 없는 원본), `handoffNoticeKind`(프로젝트 원본), `handoffPrompt`(프로젝트 원본), `HANDOFF_GUIDANCE` 새 문구, `store.ts` `origin()`(canvas 없는 origin 허용, 첫 메시지가 명령 이름으로 시작해도 사람 메시지로 그리지 않음).
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
3. **서비스·renderer 테스트**(배치 A와 B가 각자 test 커밋에 넣는다)
   - **뒤집을 테스트**:
     - `handoff.test.ts:23`(`not_canvas_conversation`)과 `:151`(캔버스 없는 Doan 대화가 이제 true)
     - `service.handoff.test.ts:117`("refuses a project conversation…")과 `:1010`(프로젝트 턴도 이제 `handoff.missed`를 쓴다)
   - **삭제할 테스트**:
     - `project.test.ts`의 `promotionTarget` 블록과 `projectBusy` 블록(`:33` 바인딩 창 포함)
     - `prototype/promoted.test.ts`와 `prototype/drawing.test.ts` 전체
     - `service.test.ts`의 promotion·project limit 테스트(`:447`, `:578`, `:596`, `:615`, `:622`, `:877` "project conversation limit", `:962`, `:1175`)
     - `overviewConversation.test.ts:75`, `:143`, `:229`, `:237`과 `newConversationFollow.test.ts:29`
     - `canvasRun.test.ts`·`PrototypeConversation.test.tsx`의 promotion·drawing 부분
     - `preload/prototype.test.ts:55-66`의 `drawing`·`promoted` 채널, `targetRelay`·`prototype/ipc`·`senderAllowed`의 해당 채널 테스트
     - overview-conversation-list가 더한 '보이는 중 승격' 테스트
   - **유지할 테스트**:
     - `summary.test.ts:96`(예전 `startedBy: "promotion"`)
     - `storeRecovery`의 bind/promote 저널
     - `service.handoff.test.ts:464`
     - `handoff.test.ts:152`(legacy external은 false). 캔버스 없는 경우를 더해 넓힌다.
   - **다시 쓸 테스트**: `service.turnEnd.test.ts:50-127`("judging a project turn once its process group is gone")을 판정 없이 다시 쓰되, `turn.done`에 보낸 메시지가 이전 프로세스 그룹만 기다리는 동작(2026-10-28)을 유지한다.
   - **서비스에 더할 테스트**:
     - 프로젝트 대화의 `doan handoff`가 받아들여지고 done 턴 뒤 새 대화가 원본 설정으로 시작됨(Claude·Codex 런타임 각각)
     - 프로젝트 턴이 더 이상 묶이지 않음(새 캔버스 하나, 편집만, 둘 이상, 편집 A와 새 캔버스 B를 함께 한 턴은 B만 시작되고 A에 Drawn 카드)
     - 같은 루트 프로젝트 대화 둘이 동시에 시작·전송됨(`project_busy` 없음)
     - 프로젝트 턴과 캔버스 대화 턴이 같은 새 경로에 handoff하면 둘 다 시작됨
     - 큐: handoff 대기 중 잡히고 `handoffQueueOutcome`대로 처리됨, 초안으로 돌려받은 큐를 이미 시작된 flush가 보내지 않음(2026-11.md:855), 사용량 한도 대기 큐가 리셋 전에 나가지 않음(2026-11.md:381)
     - 실패·중지·사용량 한도로 끝난 턴, 종료와 시작 사이, 로그아웃이 요청을 취소함
     - 원본 삭제 뒤 시작이 취소됨(`checkHandoffSource`)
     - 대상 캔버스가 판정 전에 지워지면 `not_listed`
     - Plan 턴은 안내가 없고, 턴 중 plan 승인 뒤 요청은 받아들여지고 missed가 쓰이지 않음
     - 프로젝트 제거가 대기 중 handoff를 취소함
     - Move to Trash가 그리는 중인 캔버스를 막지 않음
     - 목록의 `working`과 Delete 가능 여부가 같은 신호를 읽음(2026-11.md:603)
   - **renderer 테스트**:
     - `handoffView.test.ts`: 원본 라벨, 토스트 두 문구에 프로젝트 이름, `handoffMove`·`handoffMultiStep`의 긍정과 부정(같은 루트 Overview가 다른 대화·New, 다른 worktree, 입력 중, 목록·메뉴 포커스, 오버레이, Home·Settings)
     - `App.handoff.test.tsx`: Overview 원본의 자동 이동, Back이 원본 대화를 보여주는 Overview로 돌아감(첫 진입 fresh start에 걸리지 않음), 복수 handoff가 원본 Overview에서 아무것도 안 띄움
     - `threadItems.test.ts`·`HandoffCard`: "Handed off from Overview", Open이 Overview 원본 대화를 요청, 원본 삭제 시 " · Conversation deleted"와 Open 없음
     - `newConversationFollow.test.ts`: handoff 대화가 자동 새 대화 상태의 빈 패널을 차지함(캔버스 원본·프로젝트 원본), 사람이 고른 New나 초안이 있으면 아님
     - `overviewRun.test.ts`·`overviewConversation.test.ts`: promotion 변화 없음, 예전 `conversation.bound`가 Overview를 바꾸지 않음, handoff 줄이 Overview의 seen 규칙을 따름(2026-11.md:431)
     - `canvasRun.test.ts`·`canvasConversation.test.ts`·`CanvasConversationPanel(.headless).test.tsx`·`rightPanelOpen`: Drawing 미리보기와 promotion 문구 없음
     - `homeRun.test.ts`: `canvasAppeared` 자동 열기·drawing·binding·`project_busy` 사유 줄 테스트(`:130`, `:148`, `:191`, `:214`, `:250`, `:442`, `:454`, `:524`) 삭제 또는 다시 씀
     - `conversationStrip.test.ts`: "Done"만
     - `canvasRowMenu.test.ts:74`: `TrashBlock "drawing"` 없음
     - `summary.test.ts`: 새 기록에 `startedBy: "promotion"` 없음
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(배치마다 test) ──
4. **구현(앱)**: design.md '영향받는 구성 요소'의 main·renderer·프로토타입 창을 구현하고 promotion과 루트 잠금 코드를 걷어낸다. `promotionDeadline`은 `settleDeadline`으로 바꾼다.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`·`npm --prefix app run lint` 통과, `node app/scripts/viewerInspect.mjs --check` 통과.
   - `/runtime-test` 프로브(실제 Claude Code와 Codex, AGENTS.md 'Real agent sign-ins'의 격리된 복사본, 브랜치에서 빌드한 `DOAN_CLI`, 임시 HOME·SHELL·userData; 끝나면 복사본을 지운다):
     - Overview에서 보낸 프로젝트 대화가 새 캔버스를 만들고 handoff → 자동 이동, 원본 대화가 Overview에 남음, 첫 카드 "Handed off from Overview"와 Open
     - Home에서 보낸 대화 → 토스트(자동 열기 없음)
     - Codex Ask 모드에서 `doan handoff` 승인 요청
     - 같은 루트 프로젝트 대화 둘 동시 실행
   - ── 커밋 경계(배치마다 feat) ──
5. **CLI 문구**: `handoff_rules.go`의 `not_app_conversation` 다음 단계 문구를 바꾸고 `handoff_rules_test.go`를 고친다(배치 A의 test·feat 커밋에 포함).
   - 검증: `go test ./...`·`go vet ./...` 통과(테스트 먼저 red).
6. **eval**(배치 D)
   - 러너: `scenario.ts`의 `handoff` 형식이 캔버스 없는 handoff를 받고, fake 앱(`socket.ts`)의 `same_canvas` 판단과 `workspace.ts`가 캔버스 없는 경우를 처리한다. `scenario.test.ts`·`socket*.test.ts`를 고친다.
   - 새 시나리오 `R12`: Home에서 보낸 대화가 새 캔버스를 만들고 handoff한다. `prompt.test.ts`는 `turnPrompt(…, {root}, {handoff: true, home: true})`로 `prompt.md`를 확인한다. pass·fail fixture를 함께 만든다.
   - R8d, R9b, R10, R11의 `prompt.md`를 새 `HANDOFF_GUIDANCE`에 맞춘다.
   - 검증: `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0, `node --test 'eval/**/*.test.ts'` 통과, `node .agents/skills/verify/scripts/verify.mjs --eval` PASS. 마지막 통합 전에 `npm --prefix app run package` 뒤 `/agent-eval`로 실제 Claude Code·Codex 라운드를 돌고 `docs/usability-eval/`에 기록한다(`docs(usability-eval)` 커밋).
   - ── 커밋 경계(test, 그다음 feat) ──
7. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/project-conversation-handoff/`를 지운다.
   - **PRODUCT**
     - §3 In scope 6과 Out of scope 4(handoff 예외 확대). §4 Loop 4는 확인만 한다.
     - §5 item 1:
       - 'Project conversations': promotion 문단 삭제, 루트 잠금 삭제, 판정 시점을 item 2 'Handoff'로 옮김
       - 사이드바 슬롯·Delete의 "awaiting its promotion judgment" 문구
       - Move to Trash(`:217` "still drawing it")
       - Home: `:262` "until promoted", `:263` 자동 열기·strip "Done · <canvas> is ready.", "Another conversation is still running" 사유
     - §5 item 2:
       - 'Canvas names'(`:281` "Moved to" 줄은 예전 기록 읽기로 남김)
       - 'Conversation panel'(`:289` drawing 문장, `:291` "A conversation a handoff started never takes its place"와 "a conversation promoted to this canvas")
       - 'Drawing and promotion' 삭제
       - 'Handoff'(프로젝트 원본, 토스트·카드 문구, 원본 삭제, 대상 패널, "Project conversations hand off through promotion instead" 삭제)
       - 프로토타입 창 'Content'(`:338`)와 'Toward the main window'(`:341`)
     - §5 item 3:
       - 'Promotion' 삭제, 'Which conversation shows'의 승격 문구
       - Delete(`:355` "A promotion line or notice")
       - 'Canvas cards'(`:359` "promotion deadline", `:360` "before a promotion notice")
       - 백그라운드 작업 줄(`:371` "a send waiting for the ended turn's judgement")
       - overview-conversation-list가 더한 '보이는 중 승격' 문장
   - **ARCHITECTURE**
     - §3과 §7 'Prototype window IPC'의 drawing·promotion 중계
     - §4 'Handoff over app-socket v5'의 검사 순서(`not_canvas_conversation` 더 보내지 않음)
     - §7:
       - 'Project conversations and promotion' 삭제(남는 판정 시점은 'Handoff'로)
       - 'Handoff'의 'Key'·Missed(`:640` "exists with a canvas")·판정 시점·대상 패널
       - 'Canvas lifecycle', 'Canvas cards'
       - `startedBy`(`:686`)
       - 대화 기록 하위 호환 문장(`:770`, canvas 없는 origin)
       - 턴 프롬프트 설명(`:729`)
     - §14 'Handoff scenarios'(`:1107` 캔버스 없는 시나리오, `:1112` R12)
   - **DESIGN**: `docs/design/project.md`, `docs/design/canvas-conversation.md`, `docs/design/conversation.md:58`, `:112`의 promotion·drawing 절과 측정값. 절이 사라지면 `docs/DESIGN.md` 색인도 고친다.
   - **BACKLOG**:
     - 'Undecided'의 이 feature 항목 삭제
     - `:103`(drawing·promoted notice), `:110`, `:111`(promotion 근거·판정 시점) 다시 씀
     - ACP PoC에서 확인하지 못한 provider를 'Not verified in the real app'에 기록
   - 검증: `grep -rniE "promot(ion|ed)|drawing preview|project_busy" docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/design docs/BACKLOG.md`의 남은 결과가 예전 기록 읽기에 관한 문장뿐이다. 문서만 바뀌므로 참조 확인으로 검증한다.
   - ── 커밋 경계(docs, 문서마다) ──
