# agent-questions — design

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·guide·`doan check`·공유 JSON Schema(comment events, `.doan/config.json`, CLI envelope, `runtime.json`, app socket, `sessions.v1`)는 바뀌지 않는다. 대화 history의 이벤트 타입(TS 전용 저장 포맷)에 두 종류가 더해진다(아래 '포맷 변경').

### 1. 이벤트와 접기(main)

- `app/src/main/conversation/types.ts`에 질문 요청과 결과를 더한다. 권한 요청(`types.ts:26-29`)과 같은 모양으로 둔다.

  ```ts
  interface QuestionOption { label: string; description?: string }
  interface Question { id: string; header: string; question: string; options: QuestionOption[]; multiSelect: boolean; other: boolean; secret?: true }
  | { type: "question.request"; requestId: string; questions: Question[] }
  | { type: "question.resolved"; requestId: string; outcome: "answered" | "skipped" | "expired"; answers?: Record<string, string[]> }
  ```

  - `Question.id`: Codex는 요청의 question `id`를 쓴다. Claude는 질문에 id가 없고 답을 질문 문장으로 묶으므로(`sdk-tools.d.ts:2685-2689`), Doan이 순번(`"0"`…`"3"`)을 붙이고 runner가 문장으로 되돌린다.
  - `answers`: `answered`에만 있고, 질문 id마다 고른 label과 Other 글을 담는다. `secret` 질문의 답은 담지 않는다. 사람이 쓴 글이므로 `user.message`와 같은 데이터이며, 에이전트 출력처럼 untrusted로 다룬다(ARCHITECTURE §7 'Renderer primitives').
  - 상한: 질문 1–4개(Claude 1–4, Codex는 도구 설명상 1–3), 질문당 선택지 0–8개(Codex는 `options: null`이면 글로만 답), 문자열은 512 code unit(요약 상한 관례, `transport.ts:76`), Other 글 하나는 4,096 code unit. 같은 상한을 runner 파서, IPC 검증, store 검증이 함께 쓴다(`messageText.ts`의 `LIMITS`처럼 type-only 모듈 하나).
- `state.ts` `foldConversation`(`state.ts:55-58`, `:65-70`): `question.request`는 권한과 같은 `pending` 집합에 들어가 `turn`을 `waitingPermission`으로, `question.resolved`는 빼고 남은 것이 없으면 `streaming`으로 돌린다. 턴 종료·보관·재시작의 `expire()`는 질문도 만료로 접는다. 접은 결과에는 `questions: Record<string, "pending" | outcome>`를 따로 둔다. `TurnState`의 이름 `waitingPermission`은 바꾸지 않고 "사람의 답을 기다림"으로 주석을 고친다(이름을 바꾸면 무관한 소비자가 모두 바뀐다).
- `summary.ts`(`:35`, `:42-44`): phase는 접은 `turn`에서 오므로 질문 대기도 `waiting`이다. 미리보기는 마지막 미답 질문의 첫 질문 문장으로 `Needs your answer: <question>`.
- `service.ts` `read`(`:411-412`): `pendingPermission`과 같이 `pendingQuestion`을 돌려준다.
- `store.ts` `payload`(`:86-88`): 두 타입의 검증을 더한다. 모르는 타입은 지금처럼 손상으로 읽는다.

### 2. Claude runner

- `runners.ts` `canUseTool`(`:286-292`): `toolName === "AskUserQuestion"`이면 `claudeQuestion(input)`으로 읽는다.
  - 읽으면 pending 질문(입력, 순번↔문장 표, resolve)을 두고 `question.request`를 낸다.
  - 읽지 못하면 `{behavior: "deny", message}`로 바로 답한다. 메시지는 에이전트에게 질문을 답장 글로 하라고 말한다(문구는 P1 뒤 `/tdd`에서 고정). 권한 요청으로 보내지 않는다(Allow가 답 없는 결과를 만들기 때문).
- 답: `answerQuestion(requestId, answer)`가 `claudeQuestionResult`로 `{behavior: "allow", updatedInput: {...input, answers: {<문장>: "<label>, <label>"}}}`를 만든다. 여러 선택은 쉼표로 잇는다(`AskUserQuestionOutput.answers` 주석, `sdk-tools.d.ts:3959`). Other 글은 그 질문의 답 문자열이다. 이 모양은 SDK 타입 주석에서 읽은 것이고, 에이전트가 실제로 받는지는 P1이 확인한다.
- Skip: P1 결과에 따라 둘 중 하나다. (a) 세션의 `system/init` `capabilities`에 `ask_user_question_unanswered_v1`이 있으면 `annotations[<문장>].unanswered: "skipped"`와 빈 답으로 허용(`sdk.d.ts:6290`, `sdk-tools.d.ts:3982-3984`). (b) 없으면 `{behavior: "deny", message: "The person skipped the question."}`. 어느 쪽이든 턴은 이어진다.
- 만료(`expire`, `:294-296`): 권한과 같이 `deny` "Request expired."와 `question.resolved` `expired`.
- 활동: `AskUserQuestion`의 `tool_use`는 activity를 내지 않는다(`transport.ts:148-152`, `claudeActivity` `:99-102`). 질문 카드가 그 자리를 대신하고, 지금의 "Using a tool" 줄을 없앤다.
- Full access(`bypassPermissions`)와 사람의 `permissions.allow` 규칙에서 `canUseTool`이 불리지 않으면 Doan은 질문을 볼 수 없다. P1이 모드별로 기록하고, 불리지 않는 모드가 있으면 그 모드의 동작을 Z1에서 PRODUCT에 한계로 적는다.

### 3. Codex dispatcher

- `transport.ts` `normalizeCodex`(`:180-199`): `item/tool/requestUserInput`을 따로 읽는다.
  - 같은 thread·turn이고 턴이 끝나지 않았고 Stop하지 않았고 `isBlocking: true`이며 `codexQuestion(raw)`이 읽으면 → disposition `question`과 `question.request` 이벤트.
  - 그 밖(Stop·종료 뒤, `isBlocking: false`, 읽을 수 없음) → disposition `decline`, 응답 `{id, result: {answers: {}}}`. 턴은 실패하지 않는다. MCP elicitation의 `decline` 경로(`:190-194`)와 같은 모양이다.
  - 다른 thread·turn → 지금처럼 `route`.
- `dispatcher.ts`: 권한 표(`:12`)와 같이 질문 표를 둔다. `answerQuestion`은 `codexQuestionResponse`로 `{id, result: {answers: {<id>: {answers: [...]}}}}`를 쓰고 `question.resolved`를 낸다. Skip은 빈 `answers`. `expire`(`:81-86`)는 질문에 오류 대신 빈 답을 쓴다. 턴이 끝나는 중이므로 어느 쪽도 턴 결과를 바꾸지 않지만, 빈 답은 Codex가 "no answers → continue"로 읽는 정상 응답이다(Codex 0.166.0 바이너리의 협업 모드 지시문).
- `isSecret` 질문: 카드는 입력을 가리고, `question.resolved`에 답을 남기지 않는다.

### 4. ACP

- 바꾸지 않는다(이번 범위 밖). `Runner.answerQuestion`은 ACP runner에서 항상 `false`다.

### 5. IPC

- `ipc.ts`의 `conversationMethods`(`:10`)에 `answerQuestion`을 더한다. 입력: `{conversationId, requestId, outcome: "answered" | "skipped", answers?: Record<string, {selected: number[]; other?: string}>}`. `answerPermission`(`:181`)처럼 형식과 상한만 보고, 질문과 맞는지(선택지 번호 범위, `multiSelect`, Other 허용, 모든 질문에 답)는 main이 pending 질문으로 `questionAnswer`를 돌려 확인한다. 맞지 않으면 `bad_request`, pending이 없으면 `stale`(`service.ts:456`과 같음).
- `preload/index.ts`에 같은 이름의 호출을 더한다. 메인 창 main frame만 부를 수 있다는 규칙은 그대로다.

### 6. 알림과 진입(main·renderer)

- `notifications.ts`(`:21`, `:27`, `:37-39`): `question.request`는 `approval` 종류로 알리고, Approval requests 스위치를 따른다. 제목은 `<provider> needs your answer`. `question.resolved`는 그 알림을 닫는다.
- `conversationStrip.ts`(`:27`, `:85`): 질문 상태를 더한다. 문제 workspace의 strip은 제목 `<provider> needs your answer`, 본문은 첫 질문 문장(줄임), 동작은 Skip과 Stop뿐이다. 답은 대화 화면에서 한다.
- `CanvasConversationPanel.tsx`·`ProjectOverview.tsx`의 `turnOf`(`:98-113`, `:110-114`): 마지막 항목이 질문이어도 `waiting`.
- `rightPanelOpen.ts`·`overviewRun.ts`·`homeRun.ts`·`agentIndicator.ts`·`conversationList.ts`·`overviewConversation.ts`·`sidebarSize.ts`·`dockedRules.ts`는 phase `waiting`을 이미 쓰므로 바꾸지 않는다. 권한 진입의 "첫 선택지에 포커스"는 질문 카드의 첫 질문 첫 선택지로 간다.

### 7. 쓰레드 UI

- `threadItems.ts`(`:19`, `:142-150`): `question` 항목(`status: pending | answered | skipped | expired`)을 더한다. 턴 종료 때 같은 턴의 pending은 만료(`:84`와 같음).
- `ConversationThread.tsx`(`:291`, `:394-405`): `QuestionCard`를 더한다. `phaseText`는 질문 대기에도 `<provider> needs your answer`.
  - 카드는 권한 notice와 같은 `doan-notice thread-notice`, 새로 온 카드만 `role="alert"`(`entry.seq > liveAfter`).
  - 질문마다 header(작은 칩)와 문장, 선택지는 단일 선택이면 radio group, `multiSelect`면 checkbox group. 각 선택지는 label과 description 두 줄.
  - Other는 선택지 목록 끝의 선택지 하나이고, 고르면 한 줄 입력이 열린다. 선택지가 없는 Codex 질문은 입력만 있다. `secret`이면 `type="password"`.
  - 버튼: Send answer(질문이 둘 이상이면 Send answers, prominent), Skip, Stop. Send는 모든 질문에 답이 있을 때만 켜진다.
  - 고르던 상태는 카드 안의 React state이고, 순수 reducer(`questionDraft`)로 계산한다. 같은 쓰레드에서 다시 그려도 유지되고 reload에서는 사라진다.
  - 보내기 실패는 `answerReached`(`:231-237`)를 그대로 쓰고, 고른 상태를 유지한 채 "Couldn’t send your answer. Try again."을 보인다.
- 접힌 줄: 권한의 `ask-answered`와 같은 모양으로 `Answered · <header>: <answer>`, `Skipped · <header>`, `Expired without an answer · <header>`. 질문이 여럿이면 질문마다 한 줄. `secret`의 답은 `Answered · <header>`만.
- 좁은 패널(280 px)에서 선택지는 세로로 쌓이고 버튼 줄은 줄바꿈한다.

### UI 문구(영문, Doan의 `clarify` preset 기준)

| 자리 | 문구 | 이유 |
|---|---|---|
| 카드 제목, 쓰레드 status, 사이드바·행·indicator | `<Provider> needs your answer` / `Agent needs your answer` | 권한 대기와 같은 상태이므로 같은 말을 쓴다. 새 상태어를 만들지 않는다. |
| Other 선택지 / 입력 placeholder | `Other` / `Type your answer` | Claude·Codex가 자동으로 붙이는 선택지 이름과 같다. |
| 버튼 | `Send answer` · `Send answers` · `Skip` · `Stop` | 동작과 대상을 말한다. Skip은 답 없이 이어진다는 뜻만. |
| Send 비활성 tooltip | `Answer each question first.` | 무엇이 빠졌는지 말한다. |
| 보내기 실패 | `Couldn’t send your answer. Try again.` | 고른 답이 남아 있으므로 권한의 "Choose again."과 다르게 쓴다. |
| 미리보기 | `Needs your answer: <question>` | 권한 미리보기 패턴과 같다. |
| composer 이유 줄 | `Answer or stop the request above.`(그대로) | 질문도 위의 요청이다. |
| 알림 제목 | `<Provider> needs your answer`(Approval requests 스위치) | 승인과 다른 일을 같은 말로 부르지 않는다. |

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `claudeQuestion(input)` → `{ questions, textById } | null`: `AskUserQuestion` 입력 읽기, 순번 id, 상한, 잘못된 모양 거부.
2. `claudeQuestionResult(input, textById, answer)` → `PermissionResult`: 답 문장 키, 여러 선택 쉼표 잇기, Other, Skip의 두 형태(P1이 고른 쪽).
3. `codexQuestion(raw)` → `{ event, blocking } | null`: `ToolRequestUserInputParams` 읽기(`options: null`, `isOther`, `isSecret`, 상한).
4. `codexQuestionResponse(id, question, answer)` → wire 응답, Skip·만료의 빈 답.
5. `normalizeCodex`의 `item/tool/requestUserInput` disposition(question / decline / route), Stop·종료·다른 턴·`isBlocking: false`.
6. `questionAnswer(question, input)` → wire 이전의 공통 답 또는 `null`: 번호 범위, 단일·여러 선택, Other 허용, 모든 질문 답함, 상한.
7. `foldConversation`의 질문 pending·해결·만료, `summary` 미리보기와 phase.
8. `store.ts` `payload`의 두 이벤트 검증.
9. `claudeFrame`의 `AskUserQuestion` activity 생략.
10. renderer `threadItems`의 질문 항목, `phaseText`, `conversationStrip`의 질문 상태, `notificationFor`·`closesNotification`.
11. renderer `questionDraft` reducer: 선택·해제·Other 글 → 보낼 답과 Send 가능 여부.

## 포맷 변경

- **공유 JSON Schema(ARCHITECTURE §11)**: 없다. 대화 history는 TS 전용이다.
- **대화 history 이벤트(event JSONL v1)**: `question.request`·`question.resolved` 두 타입이 더해진다. `v`는 올리지 않는다. `conversation.bound`·`conversation.restored`를 더할 때와 같은 규칙이다(ARCHITECTURE §7 'Events': "A build older than these types reads their lines as damage; going back to it is not supported"). 질문이 한 번이라도 저장된 대화는 이 feature 이전 빌드에서 읽기 오류가 된다. 이 점을 Z1에서 ARCHITECTURE에 적는다.
- **index v2, `drafts.json`, preferences**: 바뀌지 않는다.
- **fixture**: `app/src/main/conversation/fixtures/`에 P1의 Claude 기록에서 줄인 `claude-ask-user-question.json`과 Codex 0.166.0 생성 스키마로 만든 합성 `codex-request-user-input.json`을 더하고, `README.md`에 출처를 적는다(기존 fixture 관례). Go는 읽지 않는다.

## 관례 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- 대화 prompt(`prompt.ts`)와 guide는 바뀌지 않는다. `/agent-eval`은 필요 없다(guide·CLI 출력·skill stub·`doan check` 규칙이 그대로).

## 결정 영향

- **append-only 이벤트**: 질문과 답은 새 이벤트로 덧붙이고, 재시작 접기는 이벤트를 쓰지 않고 만료로 읽는다(권한과 같음).
- **"Doan forwards the runtime's real approval requests and invents none"**: 질문도 provider가 보낸 것만 보인다. Doan은 질문을 만들거나 답을 대신 고르지 않는다. 예외는 카드를 보일 수 없는 경우(완료 조건 5, `isBlocking: false`)의 거절·빈 답이고, 이것은 MCP form elicitation 거절과 같은 위치다.
- **no token handling**: `secret` 질문의 답은 provider에 전달만 하고 저장하지 않는다.
- **foundation contract 'Events and ownership'**: "After a restart, unanswered approvals expire"를 질문까지 넓힌다(Z1).
- **Send now**: STEER_PROVIDERS와 조건(실행 중 또는 답 대기)을 바꾸지 않는다. 큐의 메시지는 질문의 답으로 쓰지 않는다. Claude에서 질문 대기 중의 steer가 언제 읽히는지는 P1이 기록한다. `STEER_READ_WAIT_MS` 규칙은 그대로다.

## PoC 의존

질문 경로의 핵심 가정은 실제 실행으로 확인하지 않았다. 둘 다 로그인한 provider 프로필과 실제 모델 호출이 필요하다(사용자 승인 필요).

- **P1 Claude**(설치 2.1.318, 최소 2.1.312, SDK 0.3.312): Doan과 같은 `query` 옵션(`settingSources`, `canUseTool`, 스트리밍 입력)으로 모델이 `AskUserQuestion`을 부르게 하고 다음을 기록한다.
  - Default·Accept edits·Plan·Full access에서 `canUseTool`이 `AskUserQuestion`으로 불리는지, 입력 모양.
  - `updatedInput.answers`로 준 답(단일, 여러 선택, Other 글)이 도구 결과로 모델에 가는지.
  - `system/init` `capabilities`에 `ask_user_question_unanswered_v1`이 있는지, Skip 두 형태 중 어느 것이 턴을 이어 가게 하는지.
  - 지금의 동작(입력 그대로 Allow, Deny)에서 에이전트가 받는 것(문제 1의 확인).
  - 질문 대기 중 Send now의 steer가 언제 읽히는지.
- **P2 Codex**(설치 0.166.0, 최소 0.164.0): Doan과 같은 app-server 턴(`experimentalApi: true`, Doan의 네 권한 모드)에서 `item/tool/requestUserInput`이 오는지, `isBlocking` 값, 답과 빈 답을 받아들이는지, `serverRequest/resolved`가 오는지. 0.164.0과 0.166.0의 `ToolRequestUserInput*` 스키마를 비교한다. 이 기기의 `codex features list`는 `default_mode_request_user_input`을 false로 보이므로, 요청이 오지 않으면 완료 조건 4를 5로 줄이고 Z1에 "Codex는 Doan 대화에서 질문 도구를 쓰지 않는다(버전)"를 적는다.

## POSTMORTEM에서 가져온 함정

- **2026-10-27 'Codex ingress confused unowned requests and notification errors'**: "return an explicit permission/unsupported/route disposition for every valid server request, including terminal-state and nullable/global cases." → `item/tool/requestUserInput`도 종료·Stop·다른 턴·`turnId` 없음에서 반드시 답한다. 질문 disposition 테스트에 잘못된 thread·turn·요청 id를 넣는다.
- **2026-10-27 'Protocol readiness lagged behind process and turn ownership'**: turn/start 답과 같은 chunk에 온 서버 요청이 사라지지 않게 큐에 두고 비운다. 질문 요청도 이 큐를 지난다. 한 chunk에 turn/start 답과 질문 요청을 함께 쓰는 fake app-server 테스트를 둔다.
- **2026-10-27 'Filtering error replies hid duplicate native settlement'**: 같은 서버·요청 id에 응답이 정확히 하나인지 센다. 질문 답 뒤 Stop, Stop 뒤 늦은 답에서 두 번 쓰지 않는지 테스트한다.
- **2026-10-27 'Successful appends crossed the history reader's byte limit'**: 질문 이벤트는 상한 안의 글만 담고, append 전 크기 검사를 그대로 지난다.
- **2026-10-28 'A send right after turn.done was refused as busy…'**: 답 뒤 턴이 끝나자마자 보내는 경우를 실제 앱 확인에 넣는다(`turn.done` 순간에 보내기).
- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: 질문 대기 표시도 root를 포함한 정체성으로 따라간다. 이미 phase를 쓰는 경로라 새 보관 상태를 만들지 않는다.
- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: 질문 상한과 타입을 renderer가 쓰므로 type-only 모듈에 두고 `rendererImports.test.ts`를 통과시킨다.

## 다른 feature와의 관계

- **mcp-connectors**(지금 브랜치): `normalizeCodex`의 elicitation `decline` 경로와 `codexApproval.ts`를 더했다. 이 feature는 그 위에서 같은 `decline` 모양을 쓰므로 mcp-connectors가 main에 들어간 뒤 main에서 시작한다.
- **canvas-composer-polish** 완료 조건 4: 답 대기 중인 project conversation이 같은 root를 막지 않게 바꾼다. 질문 대기는 같은 phase이므로 그 규칙을 그대로 따른다. 순서와 관계없이 별도 코드가 필요 없다.

## 읽은 design preset

`doan design-skill --json`(목록), `shape`(문제·상태·범위 정리, 열린 결정을 질문으로 남김), `clarify`(카드·버튼·실패·미리보기 문구).

## 결정한 규칙

PRODUCT·ARCHITECTURE가 정하지 않았던 점을 사람이 다음과 같이 정했다. Z1에서 PRODUCT·ARCHITECTURE로 옮긴다.

1. 질문 대기는 권한 대기와 같은 상태다(phase `waiting`). 신호, 막는 규칙, Stop, 재시작 뒤 만료가 모두 같다.
2. 질문마다 직접 쓰는 답(Other)을 허용한다.
3. Skip(답 없이 이어 가기)을 둔다.
4. 질문 대기 중 composer의 메시지는 큐로 가고 Send now는 그대로 둔다. 큐의 메시지는 질문의 답으로 쓰지 않는다.
5. Codex `isBlocking: false` 질문은 카드 없이 빈 답으로 바로 답한다.
6. ACP provider(Cursor `cursor/ask_question` 포함)는 이번 범위 밖이다.
7. Claude 선택지의 `preview`와 `annotations.notes`는 이번 범위 밖이다.
8. 문제 workspace의 conversation strip은 질문 문장(줄임)과 Skip·Stop만 보인다. 답은 대화 화면에서 한다.
9. 질문 알림은 Approval requests 스위치를 따르고, 제목은 `<Provider> needs your answer`다.
