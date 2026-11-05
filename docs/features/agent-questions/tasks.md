# agent-questions — tasks

순서: PoC → UI 초안 → 순수 함수 → main 배선 → UI → 실제 앱 확인 → 문서 승격. 시작 전 조건: mcp-connectors가 main에 들어가 있다(design '다른 feature와의 관계'). 열린 결정은 design '결정한 규칙'에 정해져 있다.

## P. PoC

P1–P5는 로그인한 provider 프로필과 실제 모델 호출이 필요하다. 사람의 승인 뒤, 일회성 스크립트는 `.scratch/agent-questions/`에 두고 결과(버전, 모드별 관찰, 날짜)는 이 파일 아래 'P 결과'에 적는다.

- [x] P1. Claude `AskUserQuestion` 경로를 기록한다(design 'PoC 의존' P1의 항목). 결과로 Skip의 wire 형태와 Skip (a)의 `answers` 글, `canUseTool`이 불리지 않는 모드가 있는지 정한다. 그런 모드가 있으면 완료 조건 1에서 그 모드를 어떻게 다룰지 사람이 정하고(P6와 같은 결정 단계), 그 결정을 design '결정한 규칙'에 더한다.
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없어 실행 방법은 사람이 정한다(실제 Claude 로그인과 모델 호출). 결과를 'P 결과'에 적고, 줄인 기록을 A2의 fixture 재료로 남긴다.
- [x] P2. Codex `item/tool/requestUserInput` 경로를 기록한다(design P2). 결과로 완료 조건 4를 유지할지 5로 줄일지 정한다. 5로 줄이면 A3는 `decline` disposition과 빈 답만 남기고, B2의 질문 표, Codex `isSecret` 처리, Codex fixture는 하지 않는다.
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없어 실행 방법은 사람이 정한다(실제 Codex 로그인과 모델 호출). 결과를 'P 결과'에 적는다.
- [x] P3. Cursor(ACP) 질문 경로를 기록한다(design 'PoC 의존' P3–P5의 항목): `cursor/ask_question`을 보내는지, 모양, 답·건너뛰기의 모양, Doan의 지금 답 `skipped` 뒤의 동작. 2026-11-03 PoC가 계정 플랜 제한("Upgrade your plan")에 막혔으므로, 다시 막히면 막힘과 이유를 기록한다.
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없어 실행 방법은 사람이 정한다(격리한 Doan에서 Cursor Doan 연결 로그인과 모델 호출). 결과 또는 막힘을 'P 결과'에 적는다.
- [x] P4. GitHub Copilot(ACP) 질문 경로를 기록한다(같은 항목). 질문 요청은 ACP 트래픽에서 찾고, Doan의 지금 답(`Method not found` 등) 뒤의 동작을 적는다.
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없어 실행 방법은 사람이 정한다(격리한 Doan에서 Copilot Doan 연결 로그인과 모델 호출). 결과 또는 막힘을 'P 결과'에 적는다.
- [x] P5. Antigravity(ACP) 질문 경로를 기록한다(같은 항목).
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없어 실행 방법은 사람이 정한다(격리한 Doan에서 Antigravity Doan 연결 로그인과 모델 호출). 결과 또는 막힘을 'P 결과'에 적는다.
- [x] P6. (사람의 결정) P3–P5 결과로 ACP provider마다 질문 구현을 넣을지 정한다. 넣는 provider가 있으면 spec 완료 조건, design §4, 이 파일의 A·B·C·D 작업에 그 범위를 더한다.
  - 검증: 사람의 결정을 design '결정한 규칙' 6에 적고, 바뀐 spec·design·tasks를 커밋한다.

### P 결과

**P1 Claude (2026-11-05).** Agent SDK 0.3.312가 띄운 Claude Code 2.1.312(SDK 동봉 CLI, 설치본은 2.1.318), 모델 `sonnet`, Doan과 같은 `settingSources: ["user", "project", "local"]`와 `canUseTool`. 사람의 CLI 로그인으로 돌렸고 작업 폴더는 `.scratch/agent-questions/work/`. 스크립트와 기록은 `.scratch/agent-questions/`(`p1-claude.mjs`, `out/p1-*.json`).
- `canUseTool`은 Default·Accept edits·Plan·Full access(`bypassPermissions` + `allowDangerouslySkipPermissions`)와 permissionMode를 넘기지 않은 실행(사람 profile의 `defaultMode: "auto"`, 이어받은 터미널 세션과 같은 경로) 다섯 경우 모두 `AskUserQuestion`으로 불렸다. 불리지 않는 모드는 없었다. `permissions.allow`에 `AskUserQuestion`을 넣은 경우는 확인하지 않았다.
- 입력은 `{questions: [{question, header, options: [{label, description}], multiSelect}]}`이다. 도구 목록(`system/init` `tools`)에 `AskUserQuestion`이 있고, `capabilities`에 `ask_user_question_unanswered_v1`이 있다.
- 답: `updatedInput: {...input, answers: {<문장>: "Blue"}}`로 허용하면 도구 결과가 `Your questions have been answered: "<문장>"="Blue". …`이다. 선택지 label이 아닌 글(Other "Green, but only for the header")과 여러 선택("Agents, Notifications, Keyboard shortcuts")은 `The user answered: "<문장>"="<글>". Read the answers carefully …`로 간다. 모델은 같은 턴에서 그 글을 그대로 받았다.
- 지금 동작(입력 그대로 Allow): 도구 결과는 `The user did not answer the questions.`, `answers: {}`. 오류는 아니고 턴은 이어진다(문제 1 확인).
- Skip: (a) `answers: {}`와 `annotations: {<문장>: {unanswered: "skipped"}}`로 허용하면 도구 결과가 `The user did not answer the questions.`(오류 아님)이고 턴이 이어진다. `answers`에 글("(skipped)")을 넣으면 모델은 그것을 답으로 읽으므로 넣지 않는다. (b) `deny` "The person skipped the question."은 `is_error: true` 도구 결과가 되고 턴은 이어진다. **결정: Skip은 (a)다. capability가 없는 세션에서는 (b)를 쓴다.**
- 질문 대기 중 steer: 대기 중에 스트리밍 입력으로 보낸 메시지는 답(8초 뒤)이 간 다음에 읽혔다. 모델은 최종 답에서 그 메시지를 따랐다. 질문의 답으로 쓰이지 않았다.

**P2 Codex (2026-11-05).** codex-cli 0.166.0 `app-server`, `initialize`의 `experimentalApi: true`, ephemeral thread, Doan의 네 권한 모드(approvalPolicy·sandboxPolicy), 사람의 CLI 로그인, 기본 모델 `gpt-6.1-sol`. 스크립트와 기록은 `.scratch/agent-questions/`(`p2-codex.mjs`, `out/p2-*.json`).
- Doan의 네 권한 모드 어디에서도 `item/tool/requestUserInput` 서버 요청은 오지 않았다. 모델에게 보이는 도구는 `request_user_input`과 `request_user_input_async`다. blocking 쪽을 부르라고 하면 모델은 "Default 모드에서 비활성화"라고 답했다.
- 대신 Default·Plan·Full access에서 모델은 `request_user_input_async`를 썼다. 결과는 `item/completed`의 `agentMessage`이고 `text`는 질문과 선택지의 Markdown 목록, `questions: [{title, options: [string]}]`, `delivery: "async"`, `phase: "final_answer"`다. 턴은 정상으로 끝난다. Doan은 지금 이 메시지를 에이전트 글로 보이므로 턴이 실패하지 않는다. Accept edits에서는 모델이 도구를 쓰지 않았다(한 번 실행).
- 협업 모드를 Plan(`collaborationMode: {mode: "plan"}`, Doan은 쓰지 않음, 비목표)으로 두면 `item/tool/requestUserInput`(`isBlocking: true`, `autoResolutionMs: null`, `isOther: true`, `isSecret: false`, question `id`·`header`·`question`·`options[{label, description}]`)이 온다. `{answers: {<id>: {answers: ["Blue"]}}}`로 답하면 모델이 "Blue"를 받았다. 빈 `{answers: {}}`에는 "No answer received."로 이어 가고 턴은 성공했다. 두 경우 모두 답 뒤에 `serverRequest/resolved`가 왔다(Doan의 답에 대한 정상 통지이고, Codex가 스스로 닫은 요청은 아니다). Other 글의 `user_note:` 접두어, 답 글을 되돌려 보내는 알림, Stop 경계는 Plan 협업 모드에서만 의미가 있어 확인하지 않았다.
- **결정(완료 조건 4의 규칙대로): 완료 조건 4는 5로 줄인다.** A3는 `decline` disposition과 빈 답만 남기고, B2의 질문 표, Codex `isSecret` 처리, Codex fixture는 하지 않는다. Z1에 "Codex는 Doan 대화에서 blocking 질문 도구를 쓰지 않는다(0.166.0, Default 협업 모드)"를 적는다.
- 새로 본 것: async 질문 `agentMessage.questions`는 design에 없다. 지금은 글로만 보이고 답은 다음 메시지로 한다. 카드로 보일지는 이 feature 밖이므로 Z1에서 BACKLOG에 적는다.

**정리.** Claude SDK 세션 기록(`<CLAUDE_CONFIG_DIR>/projects/-Users-sinhyeokkang-code-doan-design--scratch-agent-questions-work/`, PoC가 만든 10개뿐)을 지웠다. Codex thread는 ephemeral이라 `~/.codex/sessions`에 남은 기록이 없다. 로그인 자체는 사람의 기존 로그인이라 sign out하지 않았다.

**P3 Cursor (2026-11-05) — 막힘.** cursor-agent 2026.10.22-27dcf5f `acp`, 사람의 CLI 로그인(PoC를 위해 `cursor-agent login`). `session/prompt`가 질문 없이 "Upgrade your plan to continue"로 끝났다(`stopReason: end_turn`). 2026-11-03 PoC와 같은 계정 플랜 제한이다. Cursor가 `cursor/ask_question`을 보내는지는 확인하지 못했다.

**P4 GitHub Copilot (2026-11-05).** Copilot CLI 1.0.105 `--acp --stdio`, 사람의 CLI 로그인. 묻는 도구로 물어보라고 하자 모델은 "No ask_user tool available"을 셸로 출력하려 했다(권한 요청, Deny). 도구 목록을 말하게 하자 `bash`·`view`·`apply_patch` 등을 대고 "사용자에게 묻고 기다리는 도구는 없다"고 답했다. ACP 표준 요청이든 확장이든 질문 요청은 오지 않았다. **Doan의 지금 동작과 다를 것이 없다.**

**P5 Antigravity (2026-11-05).** Doan과 같은 Google ACP 서버 1.3.0(Doan 코드의 URL과 sha256 세 개로 검증), `AGY_ACP_FORCE_FILE_STORAGE=1`, 임시 HOME, 브라우저 로그인 `oauth-personal`, 모델 `gemini-3.8-flash-high`, Default 모드.
- 질문은 **표준 `session/request_permission`**으로 온다. `toolCall: {toolCallId: "interaction_…", title: "<질문 문장>", rawInput: {}}`, `options: [{optionId: "1", name: "Red", kind: "allow_once"}, {optionId: "2", name: "Blue", kind: "allow_once"}]`. 선택지가 모두 `allow_once`이고 거절 선택지가 없다. description, 여러 선택, 직접 쓰는 답은 없다. 고른 `optionId`가 답이 된다(PoC는 "1"을 골랐고 모델은 "Red"라고 답했다).
- **Doan의 지금 동작(코드에서 읽음, 실행하지 않음)**: `acpPermission`은 첫 `allow_once`만 Allow로 잡고 거절이 없으니 Deny도 없다. 카드는 제목 "<Provider> needs your answer", 요약에 질문 문장, 버튼 Allow(= 첫 선택지)와 Stop뿐이다. 사람은 첫 선택지밖에 고를 수 없고 그것이 무엇인지도 보이지 않는다.

**정리.** PoC가 만든 Copilot 세션 2개(`~/.copilot/session-state/`)와 Cursor ACP 세션 1개(`~/.cursor/acp-sessions/`)를 지웠다. Antigravity는 ACP `logout`으로 토큰을 지운 뒤 임시 HOME과 내려받은 zip을 지웠다(서버 바이너리는 `.scratch/agent-questions/agy/bin/`에 남김). Cursor CLI 로그인은 PoC 전에는 없었고 지금은 남아 있다(사람이 정한다). Copilot 로그인은 기존 것이다.


── commit: `docs(feature): record agent-questions PoC results` ──

## U. UI 초안

- [x] U0. `/design-draft`로 새 초안 `.doan/canvases/agent-questions.html`을 그린다. 프레임: 쓰레드의 질문 카드(단일 선택, 여러 선택 + Other 입력, 질문 둘, 선택지 없는 글 답, secret 입력), Send 비활성 tooltip, 보내는 중, 보내기 실패 줄, 접힌 줄(답함·건너뜀·만료·secret), 280 px 패널, Overview의 같은 카드, 문제 workspace strip(질문 문장, Skip·Stop). 기존 초안은 고치지 않는다. 사람이 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 base와 같은 finding만 낸다, 사람의 확인.
  - 결과: 초안의 frame은 `in-context`(맥락 보기, 비교 안 함), `question-card`, `keyboard`, `send-states`, `folded`, `with-permission`, `panel-280`, `overview`, `problem-strip`이다. 그리는 중 정한 것은 design '결정한 규칙' 16–21과 §7(입력 기본 크기, Send spinner)에 적었다. `doan check`는 base와 같은 13건(error 1건은 `select-inspect`의 기존 `implements_not_found`)이다. 사람이 앱에서 확인했다(2026-11-05).

── commit: `docs(design): draft agent questions` ──

## A. 순수 함수

- [ ] A1. 질문 타입·상한 모듈(type-only), `store.ts` `payload`의 두 이벤트 검증, `foldConversation`·`summary`의 질문 pending(종류를 붙인 map)·해결·만료·미리보기.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green(`state.test.ts`·`summary.test.ts`·`io.test.ts`(payload 검증): 상한 경계, 모르는 필드, 재시작 만료, 권한과 질문이 섞인 턴, `permission.resolved`가 같은 id의 질문을 풀지 않음, 미리보기는 종류와 관계없이 가장 새 요청), `rendererImports.test.ts` 통과.
- [ ] A2. `claudeQuestion`, `claudeQuestionResult`, `claudeFrame`의 `AskUserQuestion` activity 생략, fixture `claude-ask-user-question.json`(P1 기록에서 줄임)과 `fixtures/README.md` 출처.
  - 검증: `npm --prefix app test` — `transport.test.ts`: fixture 입력, 단일·여러 선택·Other·Skip(P1이 정한 형태)·잘못된 입력·상한 초과·같은 문장 중복, 순번↔문장 왕복, 기존 Claude 기대값 유지.
- [ ] A3. `codexQuestion`, `codexQuestionResponse`, `normalizeCodex`의 질문 disposition, fixture `codex-request-user-input.json`(Codex 0.166.0 생성 스키마로 만든 합성)과 `fixtures/README.md` 출처.
  - 검증: `npm --prefix app test` — `codexIngress.test.ts`: 아래 표의 경우마다 disposition과 wire 응답이 맞고 턴 실패가 없음, `options: null`이면 `other: true`, 선택지가 있고 `isOther: false`이면 `other: false`, `isSecret`, 같은 id 중복, 기존 권한·elicitation 기대값 유지.

    | 경우 | disposition | 응답 |
    |---|---|---|
    | 같은 턴, 읽음, `isBlocking: true`, Stop·종료 전 | `question` | 사람의 답을 기다림 |
    | 같은 턴의 Stop 뒤·종료 뒤 | `decline` | `{answers: {}}` |
    | `turnId` 없음 | `decline` | `{answers: {}}` |
    | `isBlocking: false` | `decline` | `{answers: {}}` |
    | 읽을 수 없음(형식, 상한, 중복) | `decline` | `{answers: {}}` |
    | 다른 thread·turn | `route` | 지금처럼 `-32601` 오류 |
- [ ] A4. `questionAnswer`(import 없는 공통 모듈, main 검증과 renderer Send 판정이 함께 씀).
  - 검증: `npm --prefix app test` — 번호 범위, 단일 질문에 둘, 여러 선택과 0개, Other 비허용 질문의 글, `options: null` 질문의 글 허용, 공백만 있는 글, 빠진 질문, Other 글 4,096 초과, `rendererImports.test.ts` 통과.
- [ ] A5. main 알림 `notificationFor`·`closesNotification`. renderer: `threadItems`의 질문 항목과 `phaseText`, `conversationStrip` 질문 상태, `scrollTarget`, `permissionToastKey`, `turnOf`·`steerPhaseOf`, `focusAfter`의 질문 대상, `questionDraft` reducer.
  - 검증: `npm --prefix app test` — `notifications.test.ts`·`notifyService.test.ts`(Approval requests 스위치, 제목 "needs your answer", 본문에 질문 문장 없음, `question.resolved`로 닫힘), `threadItems` 테스트(턴 종료 때 pending 만료, `live=false`의 `foldCrashed` 만료, `live=true` reload의 pending 카드), `overviewRun.test.ts`(질문만 기다릴 때 `scrollTarget`이 질문 항목, 권한과 질문이 함께면 가장 새 것), `homeConversations.test.ts`(질문의 toast 키), `CanvasConversationPanel.test.tsx`(질문 대기의 `steerPhaseOf` `waiting`), `composerRules.test.ts`(답한 뒤 다음 질문·권한·composer), 새 `questionDraft.test.ts`(Send 가능 조건, 보내는 중 잠금), 고르던 답의 `requestId`별 보관과 `question.resolved` 때 지움(새 `conversationStore.test.ts`).

── commit: `feat: read and fold agent questions` ──

## B. main 배선

- [ ] B1. Claude runner의 질문 경로(`runners.ts` `canUseTool`, `answerQuestion`, `expire`, 권한과 나눈 pending map).
  - 검증: `npm --prefix app test` — `runners.test.ts`(실제 SDK와 credential 없는 fake executable): 질문 → 답 → 같은 턴 계속, Skip, Stop 중 만료, Stop 뒤와 `close()` 뒤에 온 질문의 즉시 거절, 질문 대기 중 steer, 질문 둘이나 질문과 권한이 함께 기다릴 때 각각 답함, `answer(questionId, "allow")`의 거절, owner 없는 run(이어받은 터미널 세션)의 질문, 응답이 한 번뿐.
- [ ] B2. Codex dispatcher의 질문 표, 답·Skip·만료의 빈 답.
  - 검증: `npm --prefix app test` — `dispatcher.test.ts`: 같은 chunk의 turn/start 답과 질문 요청, 답 뒤 Stop과 Stop 뒤 답에서 서버·요청 id당 응답 하나, 다른 턴 route, 같은 서버 id가 권한 표와 질문 표에 겹치면 protocol fail.
- [ ] B3. service `answerQuestion`(runner의 `"ok" | "stale" | "bad_request"`를 오류로), 선택적 `Runner.answerQuestion`, IPC `answerQuestion`, preload `answerConversationQuestion`.
  - 검증: `npm --prefix app test` — `ipc.test.ts`(형식·상한·`bad_request`·`stale`), `service.test.ts`(질문 대기 phase, 답 뒤 `turn.done` 순간의 send, `answerQuestion` 없는 runner는 `stale`, 질문 대기 중 보관·교체에서 `question.resolved` `expired`와 Codex 빈 답이 각각 한 번, 합성 secret으로 답한 뒤 history 파일과 이후 이벤트에 그 글이 없음 — `transport.test.ts:109-113`의 `not.toContain` 방식), `npm --prefix app run typecheck`.

- [ ] B4. Antigravity 질문(design §4): `acpQuestion`(순수 함수), `onRequestOf`의 갈래, `acpRunner.ts` `answerQuestion`(selected·cancelled), 접힌 줄의 header 없는 경우.
  - 검증: `npm --prefix app test` — `acp.test.ts`(P5 모양은 질문, 거절 선택지가 있거나 option이 하나거나 이름이 겹치거나 상한 초과면 지금의 권한 요청, Cursor·Copilot 경로 그대로), `acpRunner.test.ts`(답은 `selected` + 고른 `optionId`, Skip·만료·Stop은 `cancelled`, 응답은 정확히 하나), `threadItems` 테스트(header 없는 접힌 줄).

── commit: `feat: let Claude and Codex ask the person in a conversation` / `feat: show Antigravity's questions as question cards` ──

## C. UI

- [ ] C1. `QuestionCard`와 접힌 줄(`ConversationThread.tsx`, `onAnswerQuestion` prop, `answerReached`의 거절 사유), host 두 곳의 preload 호출, 진입 스크롤·포커스(`CanvasConversationPanel.tsx`·`ProjectOverview.tsx`), `homeRun.ts`의 질문 갈래(design §6), strip(`ConversationStripView.tsx`의 Skip), 알림 배선(Approval requests 스위치). canvas-composer-polish가 먼저 들어가 있으면 질문 대기가 같은 root의 시작을 막지 않는지도 확인한다.
  - 검증: `npm --prefix app test`(쓰레드 interaction 테스트: radio·checkbox 키보드, Other 입력과 IME 조합 중 Return, Send `aria-disabled`와 이유, 보내는 중 잠금, `stale`이면 오류 줄 없음, 그 밖의 실패 뒤 선택 유지, 보낸 뒤 포커스, `role="alert"`는 새 카드의 제목(첫 질문 문장)만, 도착 때 포커스를 옮기지 않음; `ConversationStripView.test.tsx`: 질문 strip에 답 컨트롤 없이 Skip과 Stop만 있음, Skip 뒤 Stop 포커스; 다른 대화로 갔다 돌아온 뒤 고르던 답 유지; 진입 때 첫 선택지나 입력칸 포커스; canvas-composer-polish가 들어가 있으면 `homeRun` 테스트의 시작 판정), `npm --prefix app run typecheck`, `npm --prefix app run build`.

- [ ] C2. 캔버스 툴바 Export 버튼의 `aria-label`과 tooltip을 `Export canvas`로 바꾼다(`CanvasTools.tsx`, spec 완료 조건 11). 이유 tooltip과 행 메뉴의 `Export…`는 그대로 둔다.
  - 검증: `npm --prefix app test` — `CanvasTools.test.tsx`의 기대값(`aria-label`, tooltip 목록)을 먼저 `Export canvas`로 바꿔 red를 본 뒤 green, `ShellSidebar.interaction.test.tsx`의 행 메뉴 `Export…` 기대값은 그대로 통과.

- [ ] C3. 캔버스 이름을 파일 stem으로 통일한다(spec 완료 조건 13). `canvasLabel`이 `<title>`을 보지 않게 하고, 쓰지 않게 된 `CanvasRow.title`을 `main/view.ts`의 타입과 파싱에서 지운다. `CanvasRow.title`을 읽는 곳이 더 없는지 `grep -rn "\.title" app/src`로 확인한다(대화·preset·frame의 title은 다른 것이다).
  - 검증: `npm --prefix app test` — `<title>`이 있는 row에도 `canvasLabel`이 stem을 돌려주는 테스트를 먼저 red로 본 뒤 green, title 표시를 기대하던 기존 테스트는 stem 기대로 고친다. `/runtime-test`(D2)에서 헤더(`agent-questions / 1. …`), 사이드바, Quick Open을 실제 앱에서 보고, 같은 캔버스를 `doan export`한 HTML 헤더와 이름이 같은지 비교한다.

── commit: `feat: show agent questions in the conversation thread` / `fix: name the canvas toolbar Export button` / `fix: show canvas file stems everywhere in the app` ──

## D. 실제 앱 확인

- [ ] D1. `/design-sync`로 질문 카드와 접힌 줄을 초안과 맞추고 DESIGN.md에 측정값을 적는다. pending 카드는 재시작하면 만료로 접히므로 살아 있는 턴이 필요하다. 그 실행 방법(로그인 프로필 또는 fake provider)은 D2와 같이 사람이 정한다.
  - 검증: `/design-sync` 보고의 측정 일치. DESIGN.md는 `/design-sync`가 커밋한다.
- [ ] D2. `/runtime-test`: Antigravity 대화에서 질문 카드 → 답 → 이어짐과 Skip(`cancelled`) 뒤의 동작, Claude 대화에서 질문 → 답 → 이어짐, 여러 선택과 Other, Skip, Stop, 다른 화면에서의 toast·사이드바 슬롯·agent indicator와 그 진입 포커스, 질문 대기 중 큐와 Send now(결정 4), Delete 불가와 docked composer 이유 줄, 같은 대화 reload 뒤 답하기, 답 뒤 `turn.done` 순간의 send. P2가 Codex 요청을 확인했으면 Codex도 같은 항목, P6가 넣은 ACP provider도 같은 항목. 로그인한 provider 프로필이 필요하므로 사람의 승인을 받고, 없으면 unit 테스트로만 확인했다고 적는다.
  - 검증: `/runtime-test` 보고(스크린샷). 쓴 로그인 프로필은 끝난 뒤 sign out하고 지우며, 사람의 실제 상태가 확인 전과 같은지 보고에 적는다.
- [ ] D3. 공통 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill stub·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §3 'Agent conversation foundation contract'('Resume and permissions'에 질문 전달, 'Events and ownership'에 재시작 뒤 질문 만료), §5 item 1('Project conversations'의 답 대기, Send now 조건), item 0 'Notifications'(질문 알림), item 2 'Conversation panel'·'Agent indicator'와 item 3 'Project Overview'(질문 카드, 첫 선택지 포커스), strip 규칙, P1·P2가 남긴 한계(질문을 볼 수 없는 모드, Codex 버전 조건), `isSecret` 답이 provider 자체 기록에 남을 수 있다는 한계. design '결정한 규칙' 열다섯 항목을 모두 반영한다.
  - ARCHITECTURE §7 'Agent conversation runtime and IPC': 'Events'에 `question.request`·`question.resolved`와 이전 빌드에서 손상으로 읽힘, 'Permissions and terminals'에 Claude `AskUserQuestion`과 Codex `item/tool/requestUserInput` 경로·빈 답 규칙, IPC `answerQuestion`, secret 답을 저장하지 않음.
  - DESIGN.md: 'Label ellipsis'에 툴바 Export 버튼(`Export canvas`)의 예외, 'Canvas area' Tooltips 표의 Export "Export…"를 "Export canvas"로. PRODUCT §5 'Toolbar'의 "Export… exports the open canvas"를 툴바 버튼 이름에 맞게 고친다.
  - PRODUCT §5: 앱의 캔버스 이름은 어디서나 파일 stem이라는 규칙을 현재 규칙으로 적고, 'Canvas header'와 답장 칩 항목의 "canvas name"이 stem을 뜻하도록 맞춘다.
  - BACKLOG.md: P2에서 본 `serverRequest/resolved`가 있으면 그 항목, P6에서 구현하지 않기로 한 ACP provider의 질문과 막힌 PoC.
  - 그리고 `docs/features/agent-questions/`를 지운다.
  - 검증: `grep -n 'question.request' docs/ARCHITECTURE.md`에 줄이 있다, `grep -n -i 'question' docs/PRODUCT.md`에 질문 카드 규칙이 있다, BACKLOG에 적을 항목이 있었으면 `grep -n -i 'question' docs/BACKLOG.md`에 그 줄이 있다, `docs/features/agent-questions/`가 없다.

── commit: `docs(product): agent questions in conversations` / `docs(architecture): agent question events and transport` / (BACKLOG을 고쳤으면) `docs(backlog): record agent-question gaps` / `docs(feature): remove agent-questions docs` ──
