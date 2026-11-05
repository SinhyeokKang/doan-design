# agent-questions — spec

사람의 요청: "에이전트가 AskQuestion으로 턴 넘길 수 있게 하기". Doan 앱 대화에서 에이전트가 자기 질문 도구(Claude Code의 `AskUserQuestion`, Codex의 `request_user_input`)로 사람에게 묻고, 턴은 대화 안에서 답을 기다렸다가 그 답으로 이어진다. PoC는 다섯 provider 모두에 하고, 완료 조건은 Claude Code와 Codex를 다룬다. ACP provider의 구현 범위는 PoC 뒤 사람이 정한다(P6).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 4 'Autonomous agent wake-up'에 걸리지 않는다. 질문은 사람의 메시지로 이미 시작한 턴 안에서 일어나고, 사람의 답은 같은 턴을 이어 갈 뿐 새 에이전트 작업을 시작하지 않는다. 권한 요청과 같은 위치다(§3 'Agent conversation foundation contract' 'Resume and permissions': "Doan forwards the runtime's real approval requests and invents none").
- §3 In scope 6 'Conversation' 안의 일이다. Out of scope 1·2·3·5·6·7과는 관계가 없다.
- PRODUCT와 ARCHITECTURE에는 에이전트 질문에 대한 규칙이 없었다. 아래 규칙 가운데 그 두 문서가 정하지 않은 것은 사람이 결정했다(design '결정한 규칙'). Z1이 이를 PRODUCT·ARCHITECTURE로 옮긴다.

## 사용자

- **사람(앱 사용자)**: 대화 쓰레드에서 에이전트의 질문을 읽고, 선택지를 고르거나 직접 써서 답하거나 건너뛴다. 답을 기다리는 동안 사이드바 슬롯, Canvas conversations 행, agent indicator, toast, 알림이 권한 요청과 같이 "needs your answer"를 보인다.
- **에이전트(앱 대화 안의 Claude Code·Codex)**: 질문 도구를 부르면 사람의 실제 답을 도구 결과로 받는다. 지금처럼 답 없는 허용·거절이나 턴 실패를 받지 않는다. 터미널에서 실행 중인 세션과 guide, CLI는 바뀌지 않는다.

## 문제(관찰한 사실)

1. **Claude의 질문이 권한 요청으로 보인다.** Claude 러너는 모든 도구 승인을 `canUseTool` 하나로 받아 `permission.request`로 내보낸다(`app/src/main/conversation/runners.ts:286-292`). `AskUserQuestion`도 여기로 오면, 요약은 `claudePermissionSummary`가 `description`·`command`·경로·`pattern`을 찾지 못해 `GENERIC_SUMMARY.other` "Using a tool"이 되고(`transport.ts:46`, `:90-95`), 선택지는 Allow·Deny뿐이다. Allow는 입력을 그대로 돌려주므로(`runners.ts:358`) 답(`answers`)이 비어 있다. SDK 타입은 답을 "User answers collected by the permission component"로 입력의 `answers`에 담는다고 적는다(`app/node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:2685-2689`). 사람은 질문 문장도 선택지도 볼 수 없다. `AskUserQuestion`이 실제로 `canUseTool`에 오는지, 어떤 권한 모드에서 오는지, 답 없이 허용하면 에이전트가 무엇을 받는지는 실제 실행으로 확인하지 않았다(P1).
2. **Codex의 질문은 턴을 실패시킨다.** Codex app-server 0.166.0 스키마에는 서버 요청 `item/tool/requestUserInput`(EXPERIMENTAL)이 있다(`codex app-server generate-json-schema` 출력의 `ToolRequestUserInputParams.json`·`ToolRequestUserInputResponse.json`). Doan은 initialize에서 `experimentalApi: true`를 보내므로(`runners.ts:115`) 이 요청을 받을 수 있다. 그런데 `normalizeCodex`는 권한으로 읽지 못한 같은 턴의 서버 요청을 `unsupported`로 답하고 턴을 `turn.failed` `session_unavailable`로 끝낸다(`transport.ts:195-198`, `dispatcher.ts:61`, `:101-104`). 코드를 읽어 얻은 결론이고, Doan의 권한 모드에서 Codex가 이 도구를 실제로 쓰는지는 확인하지 않았다(P2). 이 기기의 `codex features list`는 `default_mode_request_user_input`을 "under development / false"로 보이므로, Default 협업 모드에서는 도구가 없을 수 있다.
3. **Doan의 design preset이 질문 도구를 쓰라고 한다.** `shape` preset은 "Use a structured question tool when available; otherwise ask and wait."라고 쓴다(`doan design-skill shape --json`). 앱 대화에서 이 preset을 고른 Claude는 1의 경로로 간다.
4. **ACP provider는 질문을 건너뛰거나 거절한다.** Cursor의 `cursor/ask_question` 확장 요청은 `skipped`로 바로 답한다(`acp.ts:68-69`). 그 밖의 클라이언트 요청은 `Method not found`다(`acp.ts:70-71`). Cursor가 실제로 `cursor/ask_question`을 보내는지(P3), Copilot과 Antigravity가 질문을 ACP나 자체 확장으로 보내는지와 지금의 답에 무엇이 일어나는지(P4·P5)는 확인하지 않았다.

## 완료 조건

1. **Claude 질문 카드.** Doan 대화(Doan 연결과 이어받은 터미널 세션 모두)에서 Claude Code가 `AskUserQuestion`을 부르면, 쓰레드에 질문 카드가 나타난다. 카드는 첫 질문 문장을 제목으로 보이고, 질문마다 문장과 선택지(label과 description)를 보인다. provider가 보낸 header는 카드에 보이지 않고 접힌 줄에만 쓴다. `multiSelect`인 질문은 여러 개를 고를 수 있다. 질문마다 직접 쓰는 답(Other)이 있다. 질문이 여럿이면 모든 질문에 답해야 Send가 켜진다. 턴은 답을 기다리는 상태가 되고 권한 요청과 같은 "needs your answer" 신호가 모두 켜진다. P1이 `canUseTool`이 `AskUserQuestion`으로 불리지 않는 권한 모드를 찾으면, 그 모드를 이 조건에서 어떻게 다룰지 사람이 정한다(tasks P1).
2. **답이 에이전트에 간다.** Send를 누르면 고른 선택지와 쓴 글이 `AskUserQuestion`의 답으로 Claude에 가고, 에이전트는 같은 턴에서 그 답으로 이어 간다. Doan이 보낸 답(`updatedInput.answers`)에 사람이 고른 label(여럿이면 모두)과 Other 글이 들어 있음은 runner 테스트로, 에이전트가 받은 도구 결과에 그것이 들어 있음은 P1 기록으로 보인다.
3. **건너뛰기.** Skip을 누르면 답 없이 질문이 끝나고 에이전트는 같은 턴을 이어 간다. Claude에는 `answers: {}`와 `annotations.unanswered: "skipped"`로 허용해 답한다(P1). 그 capability가 없는 세션은 `deny`로 답한다.
4. **Codex 질문.** Doan의 어떤 권한 모드에서도 Codex는 `item/tool/requestUserInput`을 보내지 않는다(P2, 0.166.0). 이 요청이 오면(협업 모드 등) 카드 없이 빈 답 `{answers: {}}`으로 답하고 턴은 실패하지 않는다(5). Codex의 async 질문(`agentMessage.questions`)은 지금처럼 에이전트 글로 보인다.
5. **실패하지 않음.** 읽을 수 없는 질문(형식이 틀림, 상한 초과, 같은 문장이나 id의 중복)과 이미 끝났거나 Stop한 턴의 질문은 턴을 실패시키지 않고 카드를 만들지 않는다. Claude는 거절 메시지로, Codex는 빈 답으로 답한다. 다른 thread·turn의 Codex 질문은 권한 요청과 같이 지금처럼 그 턴으로 route한다.
6. **끝난 질문.** 답한 질문은 한 줄로 접혀 header와 답을 보인다. 건너뛴 질문, Stop이나 턴 종료·앱 재시작으로 답을 받지 못한 질문도 각각 한 줄로 남는다. 재시작 뒤 답하지 않은 질문은 권한 요청과 같이 만료로 접힌다(§3 'Events and ownership').
7. **답 대기의 나머지 규칙은 권한 요청과 같다.** 대화의 phase는 `waiting`이고, 사이드바 슬롯·Canvas conversations 행·agent indicator("Agent needs your answer")·Show sidebar·Show conversation 점·다른 대화의 toast·Delete 불가·docked composer 이유 줄이 권한 요청과 같은 규칙을 따른다. 프로젝트를 막는 규칙도 권한 대기 규칙을 따른다: canvas-composer-polish 완료 조건 4가 들어오면 질문을 기다리는 project conversation은 같은 root의 Home·Overview 시작을 막지 않고, Remove from Doan은 지금처럼 그 대화를 실행 중으로 센다. 권한 요청 진입(toast·알림의 Open, 사이드바 슬롯, agent indicator의 Open)은 가장 새 미답 요청으로 스크롤하고, 그것이 질문이면 첫 질문의 첫 선택지(선택지가 없으면 답 입력칸)에 포커스를 준다. 알림은 Approval requests 스위치를 따르고 제목은 `<Provider> needs your answer`, 본문은 권한 알림과 같이 project · branch뿐이며 질문 문장을 담지 않는다. 답하거나 건너뛰면 그 알림은 닫힌다. 문제 workspace의 conversation strip은 `<Provider> needs your answer`와 첫 질문 문장(줄임), Skip·Stop만 보이고 답하는 컨트롤은 없다. 문제 workspace에서 기다리는 질문은 Skip이나 Stop으로만 끝낼 수 있고, 이를 알리는 새 문구는 더하지 않는다.
8. **보내기와 Stop.** 질문을 기다리는 동안 composer의 메시지는 큐로 가고, Claude·Codex는 Send now를 그대로 보인다. 큐의 메시지는 질문의 답으로 쓰지 않는다. Stop은 지금처럼 턴을 끝내고 질문은 답 없이 접힌다.
9. **기록.** 질문과 답은 대화 history에 남아 reload와 재시작 뒤에도 같은 쓰레드로 보인다. reload 뒤에도 기다리는 질문에는 답할 수 있고, 고르던 답만 사라진다(비목표). 앱 안에서 다른 대화나 canvas로 갔다 돌아와도 고르던 답은 질문마다 남고, 질문이 끝나면 지운다. Codex의 `isSecret` 질문은 입력을 가리고, Doan이 쓰는 기록(대화 history, 알림, 쓰레드 항목, 로그)에 답 글을 남기지 않는다. provider 자체의 기록(Codex의 rollout 등, Doan 연결이면 Doan userData 아래 profile에 쓰일 수 있음)과 에이전트가 답을 되풀이한 글은 이 조건 밖이다. 사람이 이 한계를 받아들였고, Z1에서 한계로 적는다.
10. **기존 동작 보존.** 권한 요청, MCP 도구 승인(mcp-connectors), MCP form elicitation 거절은 바뀌지 않는다. ACP provider의 동작은 P6의 결정 전까지 바뀌지 않는다. `runners.test.ts`·`transport.test.ts`·`codexIngress.test.ts`·`dispatcher.test.ts`·`state.test.ts`의 기존 기대값은 질문과 관계없는 경우에 그대로 통과한다.
11. **툴바 Export 이름.** 캔버스 툴바 Export 버튼의 이름(aria-label)과 tooltip은 `Export…` 대신 `Export canvas`다. 말줄임표는 붙이지 않는다. 사이드바 캔버스 행 메뉴의 `Export…`, Export를 쓸 수 없을 때의 이유 tooltip, 버튼 동작은 바뀌지 않는다. 질문과 관계없는 작은 조정이고 사람이 이 feature에 넣었다.
12. **Antigravity 질문.** Antigravity가 선택지 둘 이상이 모두 `allow_once`이고 거절 선택지가 없는 `session/request_permission`을 보내면, Doan은 이것을 권한 카드가 아니라 질문 카드로 보인다. 질문 하나, 단일 선택, 제목은 `toolCall.title`, 선택지는 각 option의 `name`(description 없음), Other 없음. Send는 고른 `optionId`로 답하고, Skip은 `{outcome: {outcome: "cancelled"}}`로 답한다. 접힌 줄은 header가 없으므로 질문 문장을 쓴다. Cursor와 Copilot의 동작은 바뀌지 않는다(P6).

## 비목표

- Cursor와 Copilot의 질문 구현. Cursor는 PoC가 플랜 제한에 막혔고(`cursor/ask_question`은 지금처럼 `skipped`), Copilot은 ACP에 질문 도구가 없다(P3, P4, P6).
- MCP 서버의 form elicitation에 답하는 화면. mcp-connectors가 정한 대로 거절한다.
- Claude 선택지의 `preview`(목업·코드 미리보기)와 답의 `annotations.notes` 입력. 카드는 label과 description만 보인다.
- Codex의 협업 모드(`collaborationMode`)를 바꿔 `request_user_input`을 켜는 것. Doan의 Plan은 지금처럼 승인 정책과 sandbox로만 매핑한다(`permissionMode.ts:100`).
- guide, skill stub, 대화 prompt(`prompt.ts`)에 질문 도구 사용법을 더하는 것. 에이전트는 이미 도구 설명으로 안다.
- 쓰레드 밖에서 질문에 답하는 것: 알림, toast, 사이드바 슬롯은 대화를 열 뿐 답하지 않는다. 문제 workspace의 conversation strip은 질문 문장(줄임)과 Skip·Stop만 보이고, 답은 대화 화면에서 한다.
- 질문 카드에 고르던 중인 답을 reload·재시작 너머로 보관하는 것.
- Codex가 `serverRequest/resolved`로 스스로 닫은 요청을 Doan 카드에 반영하는 것. 권한 요청에도 없는 처리이고, P2가 질문에서 이 알림을 보면 BACKLOG에 적는다.
