# queue-send-now — spec

에이전트가 일하는 동안 큐에 넣은 메시지를 턴이 끝날 때까지 기다리지 않고, 진행 중인 턴에 바로 밀어 넣는다(steer). 큐 행마다 Send now 버튼을 둔다. 지금까지 한 작업은 멈추지 않고 이어진다. 멈춘 뒤 다시 보내는 방식(stop-then-send)이 아니다.

## 사용자

- **사람(앱 사용자)**: 프로젝트 Overview와 캔버스 대화 패널의 큐 행에서 Send now를 누른다. 메시지는 thread에서 실행 중인 턴 안, 누른 시점의 위치에 사람 메시지로 보이고, 에이전트는 같은 턴에서 그 메시지를 읽고 작업을 이어 간다.
- **에이전트(Claude Code, Codex)**: 실행 중인 턴에 사람 메시지를 하나 더 받는다. guide·skill·CLI 출력은 바뀌지 않는다.

## 문제 (관찰된 사실)

- 에이전트가 일하는 동안 보낸 메시지는 큐에 들어가고, 턴이 done으로 끝난 뒤에야 나간다. 턴이 failed·stopped로 끝나거나 archive·sign-out·refused send가 나면 큐는 draft로 돌아온다(PRODUCT §5 item 1 'Project conversations'). 방향을 바로잡는 메시지("그 프레임 말고 다른 프레임")도 턴이 끝날 때까지 기다려야 하고, 그동안 에이전트는 틀린 방향으로 작업을 계속한다.
- 지금 바로 전하는 방법은 Stop 후 다시 보내기뿐이고, 그러면 진행 중인 턴이 stopped로 끝나며 큐도 draft로 돌아온다.
- 큐 행에는 Remove만 있다(`app/src/renderer/DockedComposer.tsx`, `.doan/canvases/buzz-conversation.html` "each has Remove only").

## Provider별 조사 결과 (2026-11-03, 코드와 문서 확인. 실제 턴으로는 확인하지 않음)

| Provider | 지금 앱이 턴을 돌리는 방식 | 실행 중 턴에 메시지를 넣는 경로 | 판단 |
|---|---|---|---|
| Codex (설치본 0.166.0, 최소 0.164.0) | 대화마다 `app-server` 하나를 유지하고 턴마다 `turn/start`, 정지는 `turn/interrupt` (`app/src/main/conversation/runners.ts` `openCodex`) | `turn/steer` `{threadId, expectedTurnId, input, clientUserMessageId?}` → `{turnId}`. 설치본 0.166.0에서 `codex app-server generate-json-schema`로 뽑은 `v2/TurnSteerParams.json`에 있고, `expectedTurnId`는 "Required active turn id precondition. The request fails when it does not match the currently active turn."이다. 도입 PR(openai/codex #10821, 2026-02)의 설명: 실행 중인 turn이 없으면 JSON-RPC 오류, `cwd`·`model`·`sandbox` 같은 override를 받지 않음, `turn/started`를 보내지 않음(공식 저장소가 아닌 미러 forge.lthn.ai `core-agent-ide` 커밋 0d8b2b7에서 읽음). 공식 app-server README에는 steer 설명이 없다 | 지원 경로가 있다. 0.164.0에서의 동작, 권한 응답 대기 중 steer, 턴이 끝난 직후 steer의 실제 응답은 미확인 → PoC |
| Claude Code (CLI 2.1.317, SDK 0.3.312, 최소 2.1.312) | 턴마다 SDK `query()`를 새로 열고, streaming input 생성기가 메시지 하나만 내보낸다 (`openClaude`의 `messages()`) | streaming input 생성기는 메시지를 더 내보낼 수 있다. 공식 문서는 "Queued messages: send multiple messages that process sequentially, with ability to interrupt"라고만 한다(code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode). SDK 타입(`sdk.d.ts`)에는 `SDKUserMessage.priority?: 'now' \| 'next' \| 'later'`(설명 없음), "queued user message folded in mid-turn"(`user_message_uuid` 설명), result의 `queued_turn_count`("User-initiated sends still waiting in the command queue when this result was produced. Greater than 0 means at least one more user turn (and result) follows")가 있다 | 같은 턴에 접히는지(fold), 다음 턴으로 따로 도는지, `priority`별 차이가 문서로 확인되지 않는다 → PoC |
| ACP (Cursor, Antigravity, Copilot) | `session/prompt` 하나가 한 턴, 정지는 `session/cancel` (`acpRunner.ts`) | ACP 명세(agentclientprotocol.com/protocol/prompt-turn)는 턴 중 클라이언트가 할 수 있는 일로 권한 응답과 `session/cancel`만 적고, "Once a prompt turn completes, the Client may send another `session/prompt`"라고 한다. 실행 중 턴에 메시지를 더하는 수단은 없다 | 지원하지 않음 → Send now를 보이지 않는다(사용자 결정) |

## 완료 조건

1. Send now를 지원하는 provider의 대화에서 턴이 실행 중(running, 권한 응답 대기 포함)일 때, 큐 행마다 Remove 앞에 Send now 버튼이 있다.
2. Send now를 누르면 그 행의 메시지 하나가 실행 중인 턴에 들어간다. 턴은 끝나지 않고, 그때까지의 작업(편집, activity, 답변)은 그대로 남는다. 메시지는 큐에서 사라지고, thread에서 실행 중인 턴 안에 사람 메시지로 보인다. 에이전트의 이어지는 답변은 그 메시지 아래에 붙는다.
3. 큐에 메시지가 여러 개면 누른 행만 들어가고, 나머지는 기존 규칙대로 남는다(done 턴 뒤 한 메시지로 나가고, failed·stopped 등에서는 draft로 돌아온다).
4. 들어간 메시지의 anchor와 첨부는 일반 send와 같은 방식으로 에이전트에 전달되고 thread에 보인다.
5. 누른 뒤 들어가기 전에 턴이 끝나거나, provider가 밀어 넣기를 거절하면, 그 메시지는 큐에 그대로 남고 기존 규칙을 따른다: done 턴이면 큐와 함께 다음 턴으로 나가고, failed·stopped·archive·sign-out이면 draft로 돌아온다. 메시지가 사라지거나 두 번 나가지 않는다.
6. 밀어 넣는 중에 앱이 꺼지면, 재시작 뒤 그 메시지는 다른 큐 메시지와 같이 draft로 돌아온다(보낸 메시지가 draft로 돌아올 수는 있어도 사라지지는 않는다. 기존 `sending` 규칙과 같다).
7. Send now를 지원하지 않는 provider(ACP 세 provider, 그리고 PoC가 실패한 provider)의 대화에서는 큐 행에 Send now가 없고, 큐는 지금처럼 동작한다.
8. 턴이 실행 중이 아닐 때(준비 중, 턴이 끝나 판정·큐 전송을 기다리는 중)는 Send now가 없다.
9. 들어간 메시지는 실행 중인 턴의 permission mode·model·effort를 바꾸지 않는다. 대화의 모드 변경은 기존 규칙대로 다음 턴부터다.

## 비목표

- Stop 후 다시 보내기, 실행 중 작업을 중단하는 "지금 끼어들기"(Claude `priority: 'now'`가 중단이라면 그것도 쓰지 않는다).
- 큐 메시지 순서 바꾸기·편집, 큐 전체를 한 번에 밀어 넣는 버튼.
- 큐가 아닌 컴포저에서 바로 steer하기(running 중 Send 버튼을 steer로 바꾸기). 컴포저의 Queue는 그대로 큐에 넣는다.
- ACP provider 지원, provider 확장 메서드 탐색.
- terminal session(legacy-external) 대화의 동작 변경 이외의 별도 처리. 지원 provider면 같은 규칙을 따른다.

## 결정

1. **큐에 여러 개 있을 때 Send now의 단위**: 행마다 버튼을 두고, 누른 행 하나만 넣는다. 나머지는 원래 큐 규칙을 따른다.
2. **thread 표시**: 일반 사람 메시지와 같은 모양으로, 실행 중인 턴 안에서 누른 시점의 위치에 둔다. 별도 라벨은 두지 않는다.
3. **권한 응답 대기 중 Send now**: 보인다. 메시지는 provider가 받을 수 있는 시점(Claude는 다음 도구 경계, Codex는 서버가 정함)에 들어간다. PoC(T0)에서 대기 중 steer가 거절되거나 응답을 막으면, 대기 중에는 숨긴다.
4. **Claude가 같은 턴에 접지 않고 다음 턴으로 따로 돌릴 때**: PoC(T0)에서 `queued_turn_count > 0`인 result 뒤에 이어지는 턴이 확인되면, Doan은 CLI의 연속 턴을 Doan 턴 하나로 이어 받고 마지막 result에서 끝낸다. 같은 턴에 접히는 것도, 연속 턴도 확인되지 않으면 Claude에서도 Send now를 숨긴다.
5. **Edit on Home가 가져오는 요청**: 지금처럼 마지막 `user.message`를 가져온다. 밀어 넣은 메시지가 있던 턴이 실패하면, 처음 요청이 아니라 밀어 넣은 메시지가 돌아온다. Edit on Home 규칙은 이번 범위에서 바꾸지 않는다.
