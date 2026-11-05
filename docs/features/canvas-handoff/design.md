# canvas-handoff — design

용어는 spec 머리말을 따른다(핸드오프, 원래 대화, 이어받는 대화, 인계 메시지). 앱을 실행하거나 provider를 돌리지 않고 코드·타입·문서로 조사했다(2026-11-05). 실제 동작에 기대는 부분은 PoC(tasks P)로 먼저 확인한다.

## 조사 결과

- **대화 시작.** `ConversationService.start`(`app/src/main/conversation/service.ts`)는 `mode: "new"`와 `canvas`를 받으면 그 캔버스의 현재 대화를 archive하고, 그 대화가 일하는 중이면 `interrupted`(`reason: "user"`)까지 쓴다. 일하는 대화를 막는 것은 renderer 쪽 규칙("While the canvas's current conversation works, a restore and a new-conversation send are held", PRODUCT §5 item 2)이다. 그러므로 main이 직접 시작하는 핸드오프는 main에서 "현재 대화 없음"을 확인해야 한다.
- **promotion.** 새 캔버스 판정은 프로젝트 턴에만 있다. 턴 수락 때 `canvasesAtStart` snapshot을 두고, 턴이 끝난 뒤 첫 folder refresh(`refreshed`, `service.ts:545`)나 `BIND_GRACE_MS`(10 s) 타이머(`service.ts:643`)에서 `promotionTarget`(`project.ts`)으로 판정한다. 캔버스 턴에는 snapshot이 없다. promotion 쓰기는 다른 evidence의 `taken`에 그 캔버스를 더해 다른 턴이 같은 캔버스를 가져가지 못하게 한다(ARCHITECTURE §7 'Project conversations and promotion'). 판정을 기다리는 프로젝트 턴은 snapshot에 없는 새 캔버스를 편집 증거 없이도 후보로 삼는다(`project.ts:40`의 `candidates`). 그래서 같은 root의 다른 턴이 만든 캔버스를 가려내려고 `contested`를 두는데, 이 값은 프로젝트 evidence끼리만 계산한다(`service.ts:656-657`, ARCHITECTURE §7 'Overlapping turns').
- **app socket.** `answerLine`(`app/src/main/runtime.ts`)이 숫자 `v`로 먼저 나누고 schema → token → root 순서로 확인한다. v1–v4가 있고, 한 줄 요청·한 줄 응답, 64 KiB 줄 상한(`LINE_LIMIT`, `runtime.ts:15`), 연결부터 2 s 마감이다(ARCHITECTURE §4). CLI는 요청을 Go `json.Marshal`로 직렬화한다(`work.go:73`, `active.go:166`). `json.Marshal`은 `<`·`>`·`&`와 U+2028·U+2029를 `<` 같은 6바이트로 바꾸므로, 글자 하나가 줄에서 최대 6바이트를 차지한다.
- **앱 대화의 환경.** 모든 앱 대화의 child 환경에 `DOAN_RUNTIME`(이 앱의 runtime)과 `DOAN_APP_CONVERSATION=1`이 들어간다(`conversation/environment.ts`, `agentAuth/environment.ts` `providerEnv`의 `RESERVED`). Codex는 runner마다 `app-server`를 spawn하고(`runners.ts:78`) 그 runner는 대화의 여러 턴에 걸쳐 산다(ARCHITECTURE §7 'Agent usage': "a Codex turn its conversation's app-server"). Claude는 턴마다 SDK/CLI를 새로 띄우며 `env`를 넘긴다(`runners.ts:277`). 대화 id는 환경에 없다. CLI의 명령 본문은 환경을 읽지 않는다. `run.go`가 `DOAN_APP_CONVERSATION`을 읽어 `ctx.AppConversation`으로 넘긴다(`run.go:250`, ARCHITECTURE §12 'Structure').
- **Doan 프로필의 permission.** 사람의 `~/.codex/rules/doan.rules`와 `~/.claude/settings.json` allow 규칙은 터미널 세션용이고, Doan 프로필에는 skill stub만 들어간다(ARCHITECTURE §7 'Agent authentication' 'Profiles'). Claude 대화는 user/project/local setting source를 읽으므로 저장소의 `.claude/settings*.json` allow 규칙은 적용된다. Codex Default는 Codex가 이 폴더에 주는 Doan 프로필(`CODEX_HOME`)의 기본 approval·sandbox이고 사람의 Codex 설정이 아니다. Accept edits는 `on-request` + `workspaceWrite`, Plan은 `never` + `readOnly`, Full access는 `never` + `dangerFullAccess`이다(`permissionMode.ts` `codexPermission`). ACP는 Cursor(Default·Plan), Antigravity(Default·Accept edits·Full access), Copilot(Default·Plan·Full access)만 대응한다(`permissionMode.ts` `ACP`).
- **sandbox와 socket.** sandbox 안의 Codex 셸은 socket 연결이 `operation not permitted`로 막혀 `app_not_running`을 받는다(USABILITY-EVAL U-001). 그때 `nextSteps`는 "run `doan` outside the sandbox or request approval"이다(ARCHITECTURE §12). Codex Default에서 escalation 요청이 실제 앱에서 permission request로 보이는지는 확인되지 않았다(BACKLOG).
- **앱만 가르치는 선례.** reply chip 링크 형식은 앱의 턴 prompt(`LINK_GUIDANCE`, `prompt.ts`)만 가르치고 guide는 가르치지 않는다(ARCHITECTURE §7 'Input and prompt'). guide에는 출력 예산이 있다(`skillOutputBudget`, POSTMORTEM 2026-10-29).
- **eval.** R8c·R9는 `turnPrompt`로 만든 prompt를 앱 함수와 비교한다(`eval/lib/turn-prompt.ts`). 시나리오는 첫 기록 뒤 고정이고, 과제가 바뀌면 새 id를 쓴다(ARCHITECTURE §14).

## 1. 요청 수단 비교

| 수단 | permission 경로(permission 결정) | provider 범위 | 비용·위험 |
|---|---|---|---|
| **CLI `doan handoff` + app socket v5**(선택) | 셸 명령이므로 각 provider가 그 mode에서 셸 명령에 적용하는 승인·sandbox를 그대로 지난다 | 셸 도구가 있는 다섯 provider 모두(환경 변수 전달은 PoC P1) | 기존 v3·v4 패턴을 따른다. 대화를 알아보는 값이 환경에 필요하다(§3) |
| MCP 도구(Doan 자체 local 서버) | MCP 도구 승인 경로를 지난다 | Claude Code·Codex만. ACP provider는 MCP 서버를 쓰지 못한다(PRODUCT §3 In scope 9) | Doan 소유 stdio 서버를 새로 두어야 하고, 지금 규칙("no local (stdio) servers")과 따로 결정해야 한다. doan MCP 서버는 이미 한 번 없앴다(USABILITY-EVAL remove-mcp) |
| 답변 안의 표시(marker) | agent 행동이 아니므로 어떤 permission도 지나지 않는다 | 모두 | permission 결정에 맞지 않는다. agent 출력은 untrusted data라서(ARCHITECTURE §7 'Renderer primitives'), 캔버스 내용이 유도한 텍스트가 대화를 시작시킬 수 있다 |

이 설계의 선택: CLI. permission 결정("다른 행동과 같은 permission 경로")을 추가 장치 없이 만족하고, 다섯 provider에 같은 길을 준다.

## 2. 흐름

1. 원래 턴이 수락되면(시작·send 모두) main은 그 root의 나열된 캔버스 snapshot을 그 턴의 메모리에 둔다(프로젝트 턴의 `canvasesAtStart`와 같은 함수 `snapshot(root)`). 핸드오프를 받은 뒤 판정이 끝날 때까지 이 snapshot과 요청 경로는 그 root의 `contested` 계산에 들어간다(§5).
2. agent가 새 캔버스를 쓰고, 마지막 단계로 `doan handoff .doan/canvases/<name>.html --message - <<'EOF' … EOF`를 실행한다. provider는 그 mode의 규칙대로 실행하거나, 묻거나, 막는다(§4).
3. CLI가 인자·경로·파일 존재·환경을 확인하고 v5 요청을 보낸다(§3). main은 token → root → handoff 키 → 대화 조건을 확인하고 받아들이면 원래 대화에 `handoff.requested`를 쓴다. CLI는 `{requested: true, canvas}`를 내고, agent는 "이 답이 끝나면 <canvas>에서 이어진다"고 한 줄 말하고 턴을 끝낸다.
4. 원래 턴이 끝난다.
   - done: 턴이 끝난 때 요청 경로가 이미 나열돼 있으면 바로 `handoffDecision`으로 판정한다. 나열돼 있지 않으면 promotion처럼 다음 folder refresh(`refreshed`)나 `BIND_GRACE_MS` 타이머까지 기다렸다가 판정한다. 맞으면 이어받는 대화를 시작한다. 판정을 기다리는 동안 사람이 핸드오프를 취소하는 수단은 없다(사람의 결정). 바로 판정하는 규칙이 기다림을 줄인다.
   - done인데 사람이 큐에 넣은 메시지가 있으면(사람의 결정): 핸드오프는 그대로 진행한다. 원래 대화의 큐는 판정까지 나가지 않는다. 이어받는 대화가 시작되면 큐는 원래 대화로 가지 않고 이어받는 대화로 옮겨, 핸드오프 첫 턴이 끝난 뒤 그 대화의 다음 턴으로 나간다(지금처럼 `combineQueued`로 합친 한 send). 판정이 거절이면 큐는 지금처럼 원래 대화로 나간다.
   - failed·stopped·interrupted(archive·quit·sign-out 포함): 시작하지 않고 `handoff.resolved {outcome: "cancelled"}`를 쓴다. 큐는 지금처럼 draft로 돌아간다.
5. 이어받는 대화를 시작한다. `start`의 모든 수락 검사를 지나고, 수락 직전에 대상 캔버스에 현재 대화가 없는지 다시 확인한다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'). 수락되면 원래 대화에 `handoff.resolved {outcome: "started", conversationId, canvas}`, 거절되면 `{outcome: "refused", reason}`을 쓴다.
6. main이 renderer에 `conversation:handoff`를 보내고, renderer가 화면 이동이나 toast를 정한다(§6).

## 3. CLI와 app socket v5

- **명령** `doan handoff <canvas path> --message <text|-> [--json]`(`cli/internal/cli/handoff.go`, 규칙 `handoff_rules.go`). 경로는 `doan open`처럼 `workTarget`을 지나고, 없는 파일은 앱에 묻지 않고 `canvas_not_found`(exit 2)이다. `-`는 표준 입력을 상한까지만 읽는다. 앱을 띄우지 않는다(bootstrap 없음). 상대 `DOAN_RUNTIME`은 `usage_error`이다. 명령 본문은 환경을 읽지 않는다. `run.go`가 `DOAN_HANDOFF`를 읽어 ctx로 넘긴다(`ctx.AppConversation`과 같은 방식, ARCHITECTURE §12 'Structure').
- **대화 식별.** main은 Doan 연결 대화(캔버스 대화와 프로젝트 대화 모두)의 runner를 열 때마다 무작위 64 hex 키를 만들어 child 환경 `DOAN_HANDOFF`에 넣고, 메모리에서 키 → 대화 id를 기억한다. runner가 닫히면 지운다. 키는 디스크에 쓰지 않는다. 대화 id 대신 키를 쓰는 이유: 대화 id는 userData의 `index.json`에 있어 다른 provider의 agent도 읽을 수 있다(BACKLOG 'Agents of one provider can read another provider's Doan profile'). 키도 같은 사용자의 프로세스에 대한 보안 경계는 아니다. 경계는 지금처럼 socket token이고, 키는 어느 대화의 요청인지 정할 뿐이다. 이름에 `KEY`·`TOKEN`·`SECRET`을 넣지 않는다. Codex의 기본 `shell_environment_policy`가 그런 이름을 셸에서 뺀다(PoC P1로 확인). `RESERVED`에 넣어 provider extra가 덮어쓰지 못하게 한다. legacy external 대화에는 넣지 않는다. 프로젝트 대화에도 키를 주는 이유: Codex runner는 대화의 여러 턴에 걸쳐 살아서, 프로젝트 대화가 promotion으로 캔버스 대화가 되어도 같은 runner를 쓴다. 캔버스 대화 runner에만 키를 주면 그 대화는 prompt에 `HANDOFF_GUIDANCE`가 있는데 키가 없어 `not_app_conversation`을 받는다. 대화 종류는 main이 요청 때 `not_canvas_conversation`으로 확인한다.
- **CLI 쪽 거절.** `DOAN_HANDOFF`가 없거나 형식이 틀리면 앱에 묻지 않고 `not_app_conversation`(exit 2)이다. `nextSteps`는 "Doan 앱의 캔버스 대화에서만 쓴다. 사람에게 새 캔버스를 열어 대화를 시작하라고 말한다"이다.
- **요청** `{v: 5, token, root, handoff, path, text}`. `path`는 `^\.doan/canvases/[^/]+\.html$`(결정 2가 `.doan/canvases/`만 말하므로 `.doan/ds/`도 받는 v4 패턴보다 좁다, '포맷 변경'). `text`는 trim 뒤 비어 있지 않고 `\n`·`\t` 밖의 제어 문자가 없다. 상한은 직렬화한 요청 줄의 바이트로 정한다. CLI는 요청 줄을 `json.Marshal`로 만든 뒤 그 바이트가 `LINE_LIMIT`(64 KiB)에서 여유분을 뺀 값을 넘으면 앱에 보내지 않고 `usage_error`(exit 2)로 거절한다. 글자 하나가 최대 6바이트(`<`, ` ` 등)이므로, schema의 `maxLength`(`HANDOFF_TEXT_LIMIT`)는 최악의 6바이트에서도 줄 상한 안에 드는 값(예: 10,000 code point, 60,000 B)으로 낮춘다. JSON Schema의 `maxLength`는 ajv와 Go 모두 code point로 센다.
- **응답** `{v: 5, ok: true, requested: true}` 또는 오류 코드. app 확인 순서: schema → token → `isOpen(root)` → 키(모르면 `not_app_conversation`) → 그 대화의 root가 요청 root와 문자열로 같음(`root_mismatch`) → 실행 중인 턴(`not_running`) → 캔버스 대화(`not_canvas_conversation`) → Plan mode(`plan_mode`, 결정 1. 턴 시작 때의 mode가 아니라 요청 때 대화 metadata의 현재 mode로 본다. Claude는 Plan 승인 뒤 턴 안에서 mode를 바꾼다: `claudeReportedMode`(`transport.ts:118`) → `claudeModeAfterPlan`(`permissionMode.ts`) → `planApproved`(`runners.ts:350`)) → 핸드오프로 시작한 턴(`handoff_turn`, 결정 8) → 이 턴에 이미 받음(`already_requested`) → 원래 캔버스와 같은 경로(`same_canvas`). 나열·새 캔버스·현재 대화 확인은 턴이 끝난 뒤 판정한다(요청 때는 watcher가 아직 새 파일을 나열하지 않았을 수 있다).
- **CLI 결과와 exit.** 성공 `{requested: true, canvas}`(exit 0). app 거절 코드는 `root_mismatch` 밖에는 exit 5(PRODUCT의 "refusals the user or the app must resolve"와 `busy`의 자리), `not_app_conversation`·`canvas_not_found`·`usage_error`·`root_mismatch`는 2, `app_not_running`·`app_protocol_mismatch`·`project_not_open`은 3. `root_mismatch`(새 코드)는 `--repo`나 cwd로 정한 root가 그 대화의 root와 다를 때이고, `nextSteps`는 "대화의 cwd에서 `--repo` 없이 실행한다"이다. 이전 앱이 v5를 모르고 v1 `bad_request`로 답하면 `app_protocol_mismatch`이다. 코드마다 CLI가 자기 메시지와 `nextSteps`를 쓰고 앱의 글을 그대로 내지 않는다(v4와 같음). `app_not_running`의 `nextSteps`는 기존 sandbox 복구 순서를 그대로 쓴다. Codex가 escalation을 요청하게 하는 길이 이것이다(PoC P2).

## 4. permission 경로(permission 결정의 적용)

Doan은 핸드오프에 승인 카드를 만들지 않는다. provider가 셸 명령에 묻는 승인이 일반 permission request로 보인다(PRODUCT §3 'Resume and permissions': "Doan forwards the runtime's real approval requests"). 아래 표는 코드에서 읽은 예상이고, PoC P2가 실제를 기록한다. 대응은 결정 1이다. P2 결과가 이 표와 다르면 P3에서 사람에게 다시 묻는다.

| mode | Claude Code | Codex | ACP |
|---|---|---|---|
| Default | 사람·저장소 설정이 허용하지 않으면 Bash 승인 요청 | Doan 프로필(`CODEX_HOME`)이 이 폴더에 주는 기본값을 따른다. `on-request` + sandbox면 socket이 막히고 escalation 승인 요청, `never`(드문 경우)면 실패하고 agent가 사람에게 말한다 | provider 기본 mode의 셸 승인 |
| Accept edits | 편집만 자동이고 Bash는 승인 요청 | `on-request` + `workspaceWrite`: escalation 승인 요청 | Antigravity `auto_edit`의 셸 동작(PoC). Cursor·Copilot은 이 mode가 없다 |
| Plan | 실행을 막거나 묻는다(PoC). Doan은 `plan_mode`로 거절(결정 1) | `never` + `readOnly`: socket이 막히고 승인 요청도 없다. Doan도 거절 | Cursor·Copilot `plan`. Doan이 거절 |
| Full access | 묻지 않고 실행 | `dangerFullAccess`: 묻지 않고 socket에 닿는다 | Antigravity `yolo`, Copilot `allow_all`: 묻지 않음 |

- permission request의 요약은 provider가 준 것을 그대로 쓴다(`doan handoff …` 명령). Doan이 명령을 해석해 다시 쓰지 않는다.
- 사람이 거절하면 명령이 실행되지 않고 턴은 이어진다("Denying is not stopping"). 핸드오프는 일어나지 않는다.
- 이어받는 대화는 원래 대화의 permission mode로 시작한다(결정 6). 그 대화의 첫 턴은 핸드오프할 수 없으므로(결정 8), mode가 Full access여도 사람 없이 대화가 이어지는 고리는 한 번에서 멈춘다.

## 5. main(대화 서비스)

- **메모리 상태**(디스크 아님): 키 → 대화 id, 턴마다 `{snapshot, startedBy?: "handoff", handoff?: {path, text}}`. 판정 대기는 promotion의 judgement 대기와 같은 타이머·refresh 흐름을 쓴다(`refreshed(root, changed)`). 다만 턴이 끝난 때 요청 경로가 이미 나열돼 있으면 기다리지 않고 바로 판정한다(§2-4).
- **같은 root의 프로젝트 턴과 겹칠 때**: 판정을 기다리는 프로젝트 턴은 snapshot에 없는 새 캔버스를 편집 증거 없이도 가져갈 수 있다(조사 결과 'promotion'). 그래서 핸드오프를 받은 턴은 판정이 끝날 때까지 자기 snapshot과 요청 경로를 그 root의 `contested` 계산에 더한다. 지금 `contested`는 프로젝트 evidence만 보지만(`service.ts:656-657`), 여기에 대기 중인 핸드오프의 snapshot에 없는 캔버스와 요청 경로를 넣어 프로젝트 턴이 그 캔버스를 가져가지 못하게 한다.
- **판정 `handoffDecision`**(순수): 입력은 턴 결과(done/그 밖), 요청 경로, 나열된 행, snapshot, 원래 캔버스, 대상의 현재 대화 여부, refresh·타이머가 지났는지. 결과는 `start {canvas}` | `refused {reason}` | `cancelled` | `wait`. 요청 경로가 아직 나열되지 않았고 refresh·타이머가 지나지 않았으면 `wait`이다. reason은 `not_listed`(나열되지 않음·ID가 둘), `not_new`(snapshot에 있음, 결정 3), `has_conversation`, `same_canvas`.
- **이어받는 대화 시작**: `start`에 내부 옵션 `{origin: {kind: "handoff", conversationId, canvas}, requireNoCurrent: true, handoffText}`를 더한다. runtime·model·effort·permissionMode는 원래 대화 metadata에서 가져온다(permissionMode는 판정 때의 현재 값). attachment와 anchor는 없다. 인계 메시지는 `text`가 아니라 marker를 해석하지 않는 `handoffText`로만 prompt에 들어간다. `turnPrompt`는 `anchorTokens(text, [])`가 null이면 시작을 거절하므로(`prompt.ts:52`), 인계 메시지에 `{{1}}` 같은 글이 있어도 시작이 거절되지 않게 한다. `user.message`에 저장하고 화면에 보일 때도 이 글을 chip으로 바꾸지 않는다. 수락 직전 재확인에서 대상에 현재 대화가 생겼으면 archive하지 않고 거절한다(`has_conversation`). 수락되면 대상 캔버스를 그 root의 다른 evidence `taken`에 더한다(promotion 쓰기와 같음). 이어받는 첫 턴은 `startedBy: "handoff"`로 표시한다. 원래 대화에 큐가 있었으면 그 큐를 이어받는 대화로 옮긴다(§2-4, 사람의 결정).
- **이벤트**(`types.ts`, event JSONL v1에 타입 추가): 원래 대화에 `handoff.requested {canvas: {path}, text}`(같은 turnId, 턴 안), `handoff.resolved {outcome, conversationId?, canvas?, reason?}`(턴이 끝난 뒤, `conversation.bound`처럼). 이어받는 대화의 첫 `user.message`에 optional `origin`. 재시작 fold에서 `resolved`가 없는 `requested`는 취소로 보인다.
- **prompt**: `turnPrompt`에 `extras.handoff`를 더한다. 원래 쪽은 runner가 키를 가진 대화(Doan 연결, `handoffGuidanceFor`는 키를 주는 조건과 같은 조건을 쓴다)이면서 캔버스 대화이고 Plan이 아니며 핸드오프로 시작하지 않은 턴에만 `HANDOFF_GUIDANCE`를 넣는다. 초안: 이 턴이 `.doan/canvases/`에 작업이 이어질 새 캔버스를 만들었으면 마지막 단계로 `doan handoff <path> --message -`를 한 번 실행하고, 메시지에는 사람의 요청, 정한 것, 만든 것, 남은 일을 다음 agent가 혼자 읽고 이어갈 수 있게 쓴다. 사람이 이 캔버스에 머물라고 했으면 하지 않는다. 결과를 한 줄로 말한다. 이어받는 쪽 첫 턴은 `handoffPrompt`가 만든다. 인계 메시지는 `handoffText`로, 원래 캔버스는 `context.from`으로 넣고, "다른 Doan 대화의 agent가 사람의 요청을 받아 쓴 인계"라고 밝힌다. 캔버스 data와 댓글 본문은 지금처럼 untrusted data이다. 최종 문구는 구현 때 정하고 eval로 확인한다.
- **renderer에 알림**: 수락 뒤 `conversation:handoff {root, source: {conversationId, canvas}, target: {conversationId, canvas}}`(main window만). 목록은 기존 `conversation:listChanged`로 갱신된다.

## 6. renderer(UI)

- **원래 대화 thread**: `handoff.requested` 자리에 진행 줄("Hands off to <canvas> when this turn ends"), `resolved`에 따라 "Handed off to <canvas>" + Open, 거절 이유 줄, 취소 줄. `resolved`가 오면 진행 줄이 그 결과로 바뀌어 `requested` 자리에 한 줄만 남고, 턴 끝에 줄을 더하지 않는다. promotion 줄과 같은 계열의 한 줄이고, 색 왼쪽 선을 쓰지 않는다(사람의 규칙). 문구는 `/design-draft`에서 고정한다.
- **이어받는 대화 thread**: 첫 메시지를 인계 카드로 그린다. 머리 "Handed off from <source canvas>"와 Open(원래 캔버스를 패널이 원래 대화에 펼쳐진 채로 연다), 본문은 agent 답처럼 Markdown(reply chip 링크 포함, agent 출력 규칙 그대로)이다. 사람의 메시지 bubble과 구별된다. 대화 제목은 인계 메시지의 첫 줄이다(`messageLine`).
- **이동 `handoffMove`**(순수): 지금 화면이 원래 대화의 캔버스 페이지이고, page lock·dialog·first run이 없고, 원래 대화의 composer에 focus가 있으면서 draft가 비어 있지 않은(IME 조합 중 포함) 상태가 아니면 `move`, 아니면 `toast`. 사람이 쓰던 글을 화면 이동으로 끊지 않기 위해서다. move는 Quick Open과 같은 `openCanvas` 길로 대상 캔버스를 열고 패널을 이어받는 대화에 펼친다. canvas visit 하나라 Back이 원래 캔버스로 돌아간다. dialog를 닫지 않는다(deep link와 다름). 이동 뒤 키보드 focus는 composer가 아니라 받는 패널의 thread 머리(인계 카드)에 둔다. renderer 목록에 대상이 아직 없으면 그 read를 기다린다. 기다림의 상한은 main의 `BIND_GRACE_MS`와 같은 10 s이고, 상한이 지나면 move 대신 toast를 보인다. 기다리는 사이 사람이 다른 곳으로 가면 toast로 바뀐다(POSTMORTEM 2026-10-25 'A toast's Open was dropped while its project was still loading'). 기다리는 사이나 toast가 떠 있는 사이 대상 캔버스가 사라지면(지움·이름 바꿈) 이동하지 않고, toast의 Open은 열지 못한다는 toast로 답한다. toast는 "<source> handed off to <target>"과 Open이다.
- 패널이 접혀 있어도 move는 펼친다(사람이 보던 캔버스에서 작업이 옮겨 가므로). toast의 Open도 PRODUCT §5 item 2 'Opening'처럼 펼친다.
- 사이드바·Overview Canvas conversations·알림은 기존 규칙대로 이어받는 대화를 보인다. 새 알림 종류는 없다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

- Go `handoff_rules.go`: `handoffText`(trim, code point 상한, 제어 문자), `handoffKey`(환경 값 형식), 요청 조립과 직렬화한 줄의 바이트 상한, 응답 → envelope·exit 매핑.
- TS `conversation/handoff.ts`(import 없음 또는 type만): `handoffEligibility(turn, conversation)`(요청 때의 거절 코드), `handoffDecision(...)`(§5), `handoffGuidanceFor(metadata, turn)`(prompt에 넣을지).
- TS `prompt.ts`: `handoffPrompt(text, scope, from)`와 `turnPrompt`의 `extras.handoff`.
- TS `state.ts`·`summary.ts` fold: `handoff.requested`/`resolved`와 `user.message.origin`(재시작 fold 포함).
- TS renderer `handoffMove(screen, event)`, thread 항목 변환(`threadItems.ts` 계열).
- TS `runtime.ts` v5 분기의 확인 순서(`answerLine` 테스트, token 전에 아무것도 드러내지 않음).

## 포맷 변경

- **app socket v5 추가**: `schema/app-socket.v5.schema.json`, fixture `schema/fixtures/app-socket-v5/`(TS ajv와 Go 모두 읽음). v1–v4는 바뀌지 않는다. 새 버전 번호를 쓰는 것이므로 기존 `v`는 올리지 않는다. v5 `path` 패턴은 `^\.doan/canvases/[^/]+\.html$`이고 v4의 더 넓은 패턴(`^\.doan/(canvases|ds)/[^/]+\.html$`)에 묶이지 않는다. monorepo-services는 v3·v4 `path` 패턴을 서비스·하위 폴더까지 넓힌다(`docs/features/monorepo-services/design.md` §2.7, 결정 14). 두 feature의 병합 순서를 맞춰야 하고, 나중에 병합하는 쪽이 v5 패턴을 조정한다.
- **CLI 결과** `doan handoff` → `{requested, canvas}`. `work`·`open`처럼 결과 schema는 없다(ARCHITECTURE §11). 새 오류 코드는 snake_case 패턴 안이라 envelope `v`는 그대로다. `ExitCode`에 매핑을 더한다.
- **대화 이벤트**(TS 전용, `types.ts`): 새 타입 `handoff.requested`, `handoff.resolved`, `user.message.origin`. event JSONL은 v1 그대로이고, 이전 빌드는 이 줄을 손상으로 읽는다(`question.request` 때와 같이 되돌아가기는 지원하지 않는다, ARCHITECTURE §7 'Events'). `index.json`은 바뀌지 않는다.
- **child 환경**: `DOAN_HANDOFF`(Doan 연결 대화만, legacy external 제외).

## 관례 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- agent 규칙: guide(`skill.md`)와 stub은 바뀌지 않는다(결정 11). 앱 턴 prompt에 `HANDOFF_GUIDANCE`가 생긴다. `doan help`에 `handoff`가 "Doan app conversations only"로 나온다.

## 결정 영향

- **PRODUCT §3 Out of scope 4**를 좁게 푼다(spec 범위 확인, tasks Z1). 예외는 "사람의 메시지가 시작한 캔버스 대화 턴이, 그 대화의 permission mode를 지나, 그 턴이 만든 새 캔버스에 새 대화 하나를 시작할 수 있다. 핸드오프로 시작한 턴은 다시 핸드오프하지 못한다"이다. `doan work`, `doan open`, `doan://` 링크는 여전히 agent를 깨우지 않는다.
- **deep link 보안 경계**(ARCHITECTURE §7 'Deep links': "Giving links or `open` any action needs this boundary decided again")는 그대로다. 핸드오프는 링크나 `open`이 아니라 token이 필요한 별도 socket 버전이고, 실행 중인 Doan 대화의 키가 필요하다.
- **현재 대화 하나**(PRODUCT In scope 6)는 지킨다. 대상에 현재 대화가 있으면 시작하지 않으므로 핸드오프는 아무것도 archive하지 않는다.
- **token을 다루지 않음, git을 쓰지 않음**은 그대로다. 키는 Doan이 만든 무작위 값이고 provider credential이 아니다.
- **연쇄된 prompt injection**: 캔버스나 댓글 내용이 원래 agent를 유도해 인계 메시지를 쓰게 할 수 있다. 이어받는 대화는 원래 대화와 같은 permission mode라 권한이 넓어지지 않고, 그 첫 턴은 다시 넘기지 못한다. 인계 메시지는 사람의 메시지가 아니라고 prompt와 화면이 모두 밝힌다.

## PoC 의존

아직 확인되지 않은 가정이 셋이다. tasks P가 구현보다 먼저 확인한다.

- **P1 환경 전달**: Doan 연결 대화의 셸 도구가 Doan이 넣은 환경 변수를 본다. 지금 있는 `DOAN_APP_CONVERSATION`·`DOAN_RUNTIME`으로 다섯 provider를 확인한다(같은 경로이므로 `DOAN_HANDOFF`도 같다고 본다). Codex는 escalation으로 sandbox 밖에서 실행한 명령에서도 확인한다.
- **P2 permission 경로**: provider × mode마다 socket 명령(`doan active --json`을 대신 쓴다)이 승인 요청으로 보이는지, 묻지 않고 닿는지, 막히는지 기록한다. Codex Default·Accept edits에서 escalation이 Doan permission request로 보이는지가 중심이다(BACKLOG의 미확인 항목).
- **P3 Plan에서의 Claude Bash**: Claude Plan에서 Bash 명령이 어떻게 되는지(거부, 승인 요청, 실행). 결정 1은 어느 쪽이든 Doan이 거절하므로 바뀌지 않지만, permission request가 먼저 보이는지 기록한다. P2 안에서 함께 본다.

P1에서 어떤 provider가 환경을 보지 못하면 그 provider는 `not_app_conversation`으로 자연히 빠진다. 그 경우 지원 provider 목록을 PRODUCT에 적는다.

## POSTMORTEM에서 가져온 함정

- 2026-10-27 'Awaited conversation work outlived its current turn': "recheck current metadata and live execution identity after preparation and opening, before acceptance". 이어받는 대화의 수락 직전 재확인(§2-5)과 판정 대기 중 원래 대화가 archive되는 경우에 적용한다.
- 2026-10-27 'A rejected conversation replacement had already changed current history': "use the final index rename as the commit point". 이어받는 대화 시작은 기존 `acceptStart` journal을 그대로 쓰고, `handoff.resolved`는 그 결과 뒤에 쓴다.
- 2026-10-28 'A send right after turn.done was refused as busy …': 이전 프로세스가 reservation을 쥔 동안 같은 대화에 보내는 경우의 함정. 이어받는 대화는 새 대화라 이 대기는 없지만, 원래 대화의 queue flush와 같은 때 시작하므로 원래 대화의 live entry를 바꾸지 않는다.
- 2026-10-27 'Stable canvas lookup retained a stale execution path': "resolve an ID to exactly one listed canvas before preparation and final admission". 대상 캔버스는 `resolveListedCanvas`로 찾는다.
- 2026-10-26 ordering(ARCHITECTURE §7 'Project Overview conversations'): "A start or send reply carries the root's revision from before the call and never replaces a pick, New or entry request made since". renderer의 move는 그 사이에 사람이 한 선택을 덮지 않는다.
- 2026-10-25 'A toast's Open was dropped while its project was still loading': "an action offered before a read finishes must wait for that read". move와 toast Open이 대상 목록 read를 기다린다(§6).
- 2026-11-02 'A picked model was forgotten …': "Any new `startConversation` or `sendConversation` caller must pass through `onRemember`". 핸드오프는 main이 시작하고 사람이 고른 것이 아니므로 Last used를 바꾸지 않는다. renderer에 새 시작 호출을 만들지 않는다.
- 2026-10-29 'Codex cut the middle out of the doan guide …': guide를 바꾸지 않으므로 출력 예산은 그대로다. `nextSteps`가 늘면 예산 테스트를 확인한다.
- 2026-11-02 'Evaluation unit checks inherited the real session-recording runtime': 새 eval 시나리오와 CLI 테스트는 절대 경로의 임시 `DOAN_RUNTIME`을 쓴다.

## 읽은 design preset

`doan design-skill --json`으로 목록을 보고 `shape`(기존 화면 확장은 그 화면의 시각 체계를 물려받고, Operate 화면은 익숙한 컨트롤과 분명한 상태를 쓴다)와 `clarify`(상태마다 지금 필요한 사실 하나와 다음 행동, 같은 개념에 같은 말)를 읽었다. UI는 기존 thread 줄·카드·toast를 확장하고, 문구는 `/design-draft`에서 고정한다.

## 결정

사람이 아래 1–11을 모두 정했다(각 항목의 고르지 않은 안도 함께 적는다). 본문의 "결정 N"은 이 번호를 가리킨다.

1. **mode별 대응**(사람). Default·Accept edits는 provider의 승인 요청(Codex는 escalation)을 그대로 쓰고, Full access는 묻지 않는다. Plan은 provider가 통과시켜도 Doan이 `plan_mode`로 거절한다. Plan인지는 요청 때 대화 metadata의 현재 mode로 판단한다(사람의 결정). Claude는 Plan 승인 뒤 턴 안에서 mode를 바꾸므로(`claudeModeAfterPlan`), 승인 뒤 같은 턴의 요청은 거절하지 않는다. ACP는 그 provider의 대응된 mode가 셸 명령에 하는 대로 따르고, Doan은 Plan 거절만 더한다. picker가 없는 ACP provider는 Default로 본다. 이유: Plan은 읽기 전용이라 새 캔버스를 만들 수 없고, 나머지는 permission 결정대로 provider 경로에 맡기는 것이 가장 단순하다. 고르지 않은 것: Plan도 provider에 맡기기, Accept edits를 허용 mode로 보고 묻지 않기. PoC P2 결과가 §4 표와 다르면 P3에서 다시 묻는다.
2. **agent가 언제 넘기나**(사람). 턴이 `.doan/canvases/`에 작업이 이어질 새 캔버스를 만들었으면 넘긴다. 사람이 이 캔버스에 머물라고 했으면 넘기지 않는다. 이유: 요청 문장("새로운 캔버스를 생성 시")에 가장 가깝고, 묻는 mode에서는 사람이 승인 요청에서 한 번 더 고른다. 고르지 않은 것: 사람이 넘기라고 했을 때만, 기준 없이 agent 판단.
3. **대상 조건**(사람). 원래 턴이 수락된 뒤 새로 생겼고 현재 대화가 없는 캔버스만 대상이다. 이유: Out of scope 4의 예외를 "새 캔버스"로 좁게 지키고, 판정은 promotion과 같은 snapshot을 쓴다. 고르지 않은 것: 현재 대화가 없는 기존 캔버스도 허용.
4. **시작 시점**(사람). 원래 턴이 done으로 끝난 뒤 시작하고, 실패·중지·중단이면 취소한다. done일 때 사람이 큐에 넣은 메시지가 있어도 핸드오프는 진행하고, 큐는 이어받는 대화의 다음 턴으로 옮긴다(§2-4, 사람의 결정). 판정을 기다리는 동안 취소하는 수단은 없다(사람의 결정). 이유: 두 agent가 같은 새 캔버스를 동시에 고치지 않고, 사람이 Stop으로 핸드오프를 막을 수 있다. 고르지 않은 것: 요청을 받는 즉시 시작.
5. **화면 이동**(사람). 사람이 원래 캔버스를 보고 있고 page lock·dialog·first run이 없을 때만 옮기고, 그 밖에는 toast(Open)를 보인다. 이유: "그 캔버스로 이동"을 지키면서, 다른 일을 하는 사람의 화면을 빼앗지 않는다. 고르지 않은 것: 어디서든 옮기기(`doan open`처럼 dialog를 닫고), 옮기지 않고 toast만.
6. **이어받는 대화의 provider·설정**(사람). 원래 대화와 같은 provider, model, effort, permission mode로 시작한다. 이유: 사람이 이 작업에 고른 agent와 mode가 이어지고, mode가 바뀌어 권한이 넓어질 일이 없다. 고르지 않은 것: Settings 'New conversations' 기본값.
7. **원래 대화**(사람). 원래 캔버스의 현재 대화로 남고 "Handed off to <canvas>" 줄과 Open을 둔다. 이유: 원래 캔버스의 맥락이 남고, 사람이 그 대화에 이어서 보낼 수 있다. 고르지 않은 것: archive.
8. **고리**(사람). 핸드오프로 시작한 턴은 넘기지 못하고, 사람이 그 대화에 메시지를 보낸 뒤의 턴은 넘길 수 있다. 한 턴에 한 번이다. 사람이 핸드오프로 시작한 턴에 steer로 메시지를 넣어도 이 제한은 풀리지 않는다(사람의 결정). 이유: 모든 핸드오프가 사람의 메시지 하나에서 한 단계로 끝나 예외가 좁게 남는다. 고르지 않은 것: 깊이 N까지 연쇄, 제한 없음.
9. **원래 대화의 종류**(사람). Doan 연결의 캔버스 대화만 넘길 수 있다. 프로젝트 대화는 promotion에 맡기고, legacy external 대화와 터미널 agent는 거절한다. 이유: 요청이 캔버스 대화를 말하고, 프로젝트 대화에는 이미 새 캔버스에 묶이는 길이 있다. 고르지 않은 것: 프로젝트 대화도 허용.
10. **인계 메시지의 내용과 표시**(사람). agent가 쓴 요약만 넘기고 Doan은 원래 캔버스 참조만 더한다. 이어받는 thread 맨 위에 Markdown 인계 카드와 원래 캔버스 Open을 둔다. 이유: provider마다 transcript 위치와 형식이 달라 다른 provider가 읽기 어렵고, 다른 프로필을 읽게 하는 노출(BACKLOG)을 넓히지 않는다. 고르지 않은 것: 원래 대화의 transcript 경로나 history를 붙이기.
11. **어디서 가르치나**(사람). 앱 턴 prompt만 가르치고(LINK_GUIDANCE 선례), guide와 stub은 그대로 두며, `doan help`에만 명령이 보인다. 이유: 터미널 agent는 쓸 수 없는 명령이고, guide 출력 예산을 쓰지 않는다. 고르지 않은 것: guide에도 한 줄 넣기.
