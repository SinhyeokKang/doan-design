# agent-conversation — design

## 전체 흐름

1. 에이전트가 터미널에서 캔버스를 쓰고 `doan check`를 돌린다. doan이 내용이 바뀐 캔버스를 그 세션에 묶어 기기 로컬에 기록한다('세션 기록').
2. 대화는 캔버스당 하나다(2026-10-26 user). UI는 `conversation:resumeTarget`으로 이어받을 세션이 있는지 미리 본다. 사람은 입력창에서 말하고, 필요하면 피커로 캔버스의 요소나 좌표를 골라 글 안에 앵커로 넣는다. 렌더러가 그 캔버스의 대화가 없으면 `conversation:start`로 열고, 있으면 `conversation:send`로 보낸다.
3. main이 기록된 세션을 **같은 세션 그대로** 이어받거나(`resume`), 새 세션을 연다(`new`, `newDesign`). 첫 메시지에 대상 정보를 붙여 보낸다('턴 프롬프트').
4. main이 에이전트 출력을 doan 대화 이벤트로 바꿔 받는 즉시 기기 로컬에 저장하고 렌더러에 보낸다.
5. 에이전트가 캔버스 파일을 쓰면 지금의 파일 감시와 다시 그리기가 그대로 반영한다.
6. 권한 요청은 에이전트 자체 설정을 따르고, 에이전트가 물으면 이벤트로 렌더러에 올린다('권한').

## 영향받는 구성 요소

- **CLI (Go)**: 셸에서 실행한 `doan check`만 세션 기록을 남긴다. MCP 경로에서는 환경에 id가 있어도 기록하지 않는다. 다른 명령의 동작과 출력은 바뀌지 않는다. `Context`에 기록 경로와 세션 필드를 더한다(`cli/internal/cli/run.go`의 "명령 본문은 환경을 읽지 않는다" 규칙을 지킨다).
- **앱 main**: 새 모듈 `app/src/main/conversation/`(가칭) — 에이전트 실행기(전송 어댑터), 세션 기록 읽기, 대화 저장, 프로세스 수명, IPC 처리.
- **앱 preload**: 대화 IPC를 main 창에만 노출한다. 렌더러 UI는 이번에 만들지 않는다.
- **skills**: D2 결정(2026-10-27): 본문과 stub을 바꾸지 않는다. 기존 가이드가 이미 `check`를 요구하며 셸 기록은 자동이다. MCP 사용자를 셸로 돌리거나 세션 id를 관리하라는 지시를 추가하지 않는다(PRODUCT §7).
- **포맷**: 세션 기록이 Go와 TS가 함께 읽는 공유 포맷이 된다('포맷 변경').
- **`doan mcp`**: `check`는 세션 기록을 남기지 않는다(PoC 9a). 공유 CLI 경로를 호출해도 기록을 명시적으로 끈다. 기존 `readOnlyHint: true`와 출력은 그대로다.
- **e2e 하네스**: `app/e2e/real-state.ts`의 감시 목록에 `sessions.jsonl`과 `conversations/`를 더한다. e2e와 eval이 같은 모듈을 쓰므로 둘 다 새 파일의 누출을 잡는다.

## PoC (먼저)

PRODUCT §6에 새 줄로 기록한다. 실험 코드는 `.scratch/agent-conversation/`.

| # | 무엇 | 통과 기준 |
|---|---|---|
| 9a | 세션 id 확보 | Claude Code의 Bash 도구 자식 프로세스와 MCP 서버 프로세스에서 세션 id를 읽는다. 2026-10-26 관찰: Claude Code 2.1.310의 Bash 자식 환경에 `CLAUDE_CODE_SESSION_ID`가 있다(이 세션 값과 일치). MCP 서버 쪽에서는 `/clear`, `/resume`, fork 뒤에도 값이 갱신되는지 본다. 갱신이 보장되지 않으면 MCP 경로는 기록하지 않는다. Codex의 대응 경로를 찾는다. 없으면 Codex는 새 세션만 지원한다(2026-10-26 user) |
| 9b | 전송 방식 | 같은 시나리오를 다음 후보로 돌린다. (A) 직접 CLI: Claude `claude -p --resume=<id> --output-format stream-json`(입력도 stream-json), Codex `codex exec resume <id> --json`. (B) ACP 어댑터: `claude-agent-acp`, `@agentclientprotocol/codex-acp`(레퍼런스 앱이 쓰는 방식, `~/code/buzz-app@c40dfdf4`의 `docs/view-claude-session.md`; `docs/codex-binding-readiness.md`는 그 repo에서 "superseded"로 표시됨). (C) Claude Agent SDK의 resume 옵션과 권한 콜백, `codex app-server` — 둘 다 기억에 의존한 후보라 존재와 동작부터 확인한다. 비교: 터미널에서 만든 기존 세션을 이어받는지, 응답·도구 활동이 스트리밍되는지, 권한 요청을 앱이 받아 답할 수 있는지, 중단, 사용자가 설치·로그인한 CLI를 그대로 쓰는지, 추가 설치 크기, 첫 응답까지 시간. 권한 요청을 앱으로 넘기지 못하는 방식은 고르지 않는다. 런타임마다 한 방식을 고른다 |
| 9c | 수정 반영 지연 | "버튼 색을 바꿔라" 한 턴에서 메시지 전송 → 캔버스 파일 변경 → 앱 다시 그리기까지 시간을 Claude·Codex 각각 5회 잰다 |
| 9d | 터미널 세션과 겹침 | 같은 세션을 그대로 이어받기로 했다(2026-10-26 user). 같은 세션이 터미널에 열려 있는 동안 앱이 이어 쓰면 무슨 일이 생기는지(기록 손상, 터미널 쪽 표시) 확인하고, 앱이 그 사실을 알아챌 수 있는지 찾는다(잠금 파일, 프로세스 목록 등). 알아챌 수 있으면 `session_in_use`로 막고 새 세션을 권한다. 알아챌 수 없으면 결과를 사용자에게 보고하고 결정을 다시 받는다 |
| 9e | 실행 환경 | 앱이 띄우는 에이전트에 온보딩 셸 탐색(PoC 7a)의 PATH, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, 그 앱의 `DOAN_RUNTIME`을 넘겨 실행된다. 기록된 `cwd`에서 spawn해야 resume이 세션을 찾는지, 기록에 설정 디렉터리도 남겨야 하는지 정한다. 격리 HOME 실험 계약은 PoC 7과 같다 |

### 검토 결과와 구현 기준 (2026-10-27)

위 표는 원래 실험 질문이다. 결과는 PRODUCT §6, 계약 결정은 PRODUCT §3·§7이다. P·R-P·F-P·R-F-P 인계는 `/Users/sinhyeokkang/orca/workspaces/doan-design/agent-conversation-poc/.scratch/handoff-{P,R-P,F-P,R-F-P}.md`에 있다. R-F-P가 두 검증 지적을 닫았지만 원래 P의 전체 설정 byte 동일성 실패와 failed 결과는 남아 있다. F-P의 새 지문 비교 통과는 그 실패를 지우지 않는다. 9c는 실험 Electron 렌더러 각 5회이며 실제 doan 성능·지연 상한·모델 간 비교가 아니다.

- Claude는 공식 Agent SDK **0.3.310**에서 설치된 Claude Code **2.1.310**을 `pathToClaudeCodeExecutable`로 지정한다. Codex는 설치된 **0.163.0**의 직접 app-server를 쓴다. ACP와 별도 agent CLI는 추가하지 않는다. 이 조합이 초기 구현 지원 대상이며 범위를 자동 확장하지 않는다. 다른 버전·프로토콜은 resume/send에서 `session_unavailable`, 새 세션 시작에서 `runtime_unsupported`로 거절한다. Codex managed daemon **0.164.0**은 경쟁 writer로 관찰했을 뿐 같은 버전 app-server 지원을 검증한 것이 아니다. 패키징과 실제 앱 통합은 A/E의 검증 대상이다.
- 두 런타임의 CLI-origin 동일 id·원래 transcript append를 확인했다. fork·실패 뒤 자동 새 세션 전환은 하지 않는다. Codex도 `resume` 대상이다. 기록이 없는 사용자는 명시적으로 `new`·`newDesign`을 고를 수 있다.
- 9d 사용자 결정(2026-10-27, 지휘자의 D 질문 답변): 검사 직후·앱 대화 도중 터미널이 붙는 경쟁을 수용하고 Claude resume을 제공한다. 매 resume/send 직전에 검사하며 이미 열린 터미널은 `session_in_use`, 버전·registry·PID 확인 불가는 `session_unavailable`로 차단한다. unknown 허용·원자적 배타성·실시간 동기화를 승인한 것은 아니다. 이 결정과 D 문서 검토 뒤 후속 구현 배치를 진행할 수 있다.

## 세션 기록

- **언제**: 셸 `doan check`(CLI)가 성공·실패와 상관없이 끝날 때. MCP `check`는 제외한다. 검사한 캔버스 중 **내용 해시가 그 캔버스의 직전 기록과 다른 것**만 한 줄씩 남긴다. 그래야 그 세션이 실제로 바꾼 캔버스만 그 세션 것으로 잡힌다. 해시는 코멘트 이벤트의 `canvasHash`와 같은 형식(`sha256:`)이다.
- **무엇**: `{v, at, root, canvas: {path, id?}, hash, runtime: "claude" | "codex", sessionId, cwd, configDir}`. `configDir`은 필수다. Claude는 `CLAUDE_CODE_SESSION_ID`, Codex는 `CODEX_THREAD_ID`(없으면 `CODEX_SESSION_ID`)를 쓴다. 두 Codex 값이 다르거나 두 런타임 변수가 함께 있으면 우선순위를 두지 않고 기록을 생략한다. 세션 id를 얻지 못해도 생략한다.
- **설정 식별**: `CLAUDE_CONFIG_DIR`·`CODEX_HOME`이 unset/빈 값이면 해당 HOME의 `.claude`·`.codex`로 정규화한다. 비어 있지 않은 상대경로·NUL 포함 값은 잘못된 값이며 기본값으로 바꾸지 않는다. CLI는 존재하는 디렉터리의 canonical 절대경로를 기록한다. 실패하면 기록하지 않는다. 앱은 읽은 `configDir`을 같은 규칙으로 검증한 뒤 현재 온보딩 셸 탐색으로 선택된 해당 런타임의 설정 디렉터리와 일치할 때만 쓴다. 기록만으로 다른 프로필을 선택하거나 인증 파일을 복사하지 않는다. repo 밖 configDir은 정상일 수 있으므로 cwd의 root 내부 제한을 적용하지 않는다.
- **어디**: 기기 로컬 `<userData 디렉터리>/sessions.jsonl`(2026-10-26 user). 디렉터리는 `DOAN_RUNTIME`의 디렉터리, 없으면 기본 userData(`~/Library/Application Support/doan/`)다. **디렉터리가 이미 있을 때만** 기록한다. 앱을 설치하거나 실행한 적 없는 CLI 전용 사용자에게는 파일을 만들지 않는다.
- **실패**: 경로 계산 실패(잘못된 `DOAN_RUNTIME` 포함), 디렉터리 없음, 쓰기 실패는 모두 기록만 건너뛴다. `check`의 출력과 exit code는 그대로다. 그래서 `active`용 `runtimePath()`를 그대로 쓰지 않고(잘못된 값이면 `usage_error`), 실패를 삼키는 별도 경로 계산을 둔다. ARCHITECTURE §4의 "`DOAN_RUNTIME`은 `active`에서만 해석한다" 문장을 함께 고친다.
- **동시 쓰기**: 한 줄을 `O_APPEND`로 한 번의 쓰기로 남긴다(코멘트 JSONL과 같은 전제, ARCHITECTURE §2). 크기 정리는 이번에 하지 않는다. 앱은 파일 끝에서부터 정해진 크기만 읽는다.
- **신뢰할 수 없는 입력**: 사용자 권한의 어떤 프로세스든 이 파일을 쓸 수 있다. 스키마로 `runtime`은 enum, `sessionId`는 패턴(앞 글자 `-` 금지), `root`·`cwd`·`configDir`은 NUL 없는 절대경로로 제한한다. 앱은 spawn 직전에 실제 디렉터리와 canonical 경로를 다시 확인하고, cwd가 canonical root 안인지 경로 단위로 비교한다(`/repo2`는 `/repo` 안이 아니다). symlink로 밖을 가리키거나 디렉터리가 사라지면 거절하고 root로 대신 실행하지 않는다. 세션 id는 SDK 옵션 또는 구조화된 RPC 값으로 넘기며 shell 문자열에 붙이지 않는다. 깨진 줄, 알 수 없는 `v`, 스키마 위반 줄은 건너뛴다.
- **고르기** (`pickSession`): `root`가 같고 캔버스 id(없으면 path)가 같은 기록 중 `at`이 가장 늦은 것(같으면 파일에서 뒤 줄). 먼저 최신 스키마 유효 기록을 고른 뒤 CLI·버전·cwd·configDir을 검사한다. 실행할 수 없으면 해당 이유를 반환하며 더 오래된 다른 세션으로 조용히 돌아가지 않는다. 깨진 줄만 건너뛴다. worktree가 다르면 `root`가 달라 섞이지 않는다(ARCHITECTURE §13).

## 대화

- **열기 방식**: `resume`(기록된 세션을 같은 세션으로 이어받기), `new`(같은 repo에서 새 세션), `newDesign`(프로젝트와 주제를 받아 새 세션. 지금 FirstPrompt 문장을 첫 메시지로 쓰고, 첫 캔버스가 생기면 대화의 앵커를 그 캔버스로 채운다). 두 런타임 모두 지원 버전과 검증된 세션 식별이 있으면 resume한다. 기록이 없으면 `no_session`이며 명시적인 새 세션만 가능하다.
- **캔버스당 하나**: 한 캔버스(id, 없으면 path)에 열린 대화는 하나다. `conversation:start`를 다시 부르면 기존 대화를 보관하고 새 대화를 연다. 보관한 대화는 읽기만 된다. `newDesign` 대화는 첫 캔버스가 생기면 그 캔버스의 대화가 된다.
- **앵커는 메시지에**: 앵커는 대화가 아니라 `user.message`에 붙는다. 한 메시지에 여러 개를 넣을 수 있고, 글 안의 자리는 `{{1}}`, `{{2}}` 같은 표지로 남는다.
- **턴 프롬프트** (`turnPrompt`): 사람의 글에서 표지마다 대상 정보를 풀어 붙인다. 대상 정보에는 repo 상대 캔버스 경로와 id, 프레임 id와 제목, 요소의 `data-doan-id` 또는 셀렉터·태그·글자 발췌(지금 코멘트 대상과 같은 정보), 좌표 마커면 프레임 기준 오프셋이 들어간다. 캔버스에서 온 글자는 데이터로 표시해서 사람의 말과 구분한다(스킬 규칙 A와 같다). 끝에 "고친 뒤 `doan check`를 돌려라"를 붙인다.
- **이벤트** (저장과 렌더러 공통, 모두 `{conversationId, seq, turnId, at}`를 가진다):
  - `user.message` — `{text, anchors: [anchor]}`. `text`의 `{{n}}`이 `anchors[n-1]`을 가리킨다.
  - `turn.started`
  - `message.delta`, `message.done` — 에이전트 글. delta도 저장해서 턴 중간에 렌더러를 다시 불러와도 글이 빠지지 않게 한다.
  - `activity` — `{kind: "edit" | "read" | "command" | "other", path?, insideDesign?, summary}`.
  - `permission.request` — `{requestId, tool, summary, options: [{id, label, kind: "allow" | "allowAlways" | "deny"}]}`. `permission.resolved` — `{requestId, optionId | "expired"}`.
  - `turn.done`
  - `turn.failed` — `{code, detail?}`. 코드는 `runtime_unsupported`, `cli_missing`, `not_logged_in`, `session_unavailable`, `session_in_use`, `process_exited`, `rate_limited`, `unknown`이다. 사람이 읽을 문장은 렌더러가 코드별로 쓰고, 원문 출력 발췌는 `detail`에 둔다.
  - `interrupted` — `{reason: "user" | "appQuit" | "crashed"}`.
  - `conversation.archived` — 새 대화가 이 대화를 대신했다.
- **동시성**: 한 대화에 턴은 하나만 돈다. 실행 중에 보낸 `send`는 `busy`로 거절하고 큐는 두지 않는다. 렌더러는 거절된 입력을 지우지 않는다.
- **앱 내부 세션 소유권**: main은 대화별 `busy`와 별도로 `{runtime, canonical configDir, sessionId}`에 실행 소유 대화를 기록한다. cwd·root·캔버스가 달라도 같은 키면 같은 세션이다. 세션을 열기 전에 검사와 예약을 한 번에 처리하고, 수락 전에 예약을 확보한다. 다른 대화가 같은 키를 시작 중·실행 중·소유 중이면 `session_in_use`로 거절하며 `user.message`와 보관 부수 효과를 남기지 않는다. 대기 중인 start도 이 예약에 포함해 같은 세션의 시작이 겹치지 않게 한다. 서로 다른 세션은 동시에 실행할 수 있다. 자기 대화가 유지하는 Codex 서버로 보내는 send는 소유권 때문에 거절하지 않으며 턴별 `busy`와 외부 점유 검사는 그대로 적용한다.
- **새 세션 예약**: `new`·`newDesign`은 id를 받기 전까지 해당 시작 요청/대화에 임시 예약을 두어 중복 실행을 막는다. 서로 다른 새 세션 요청을 하나의 빈 sessionId로 묶지 않는다. id를 받으면 main이 같은 처리 안에서 기존 키의 소유자를 검사하고 알려진 세션 키로 예약을 옮긴 뒤 수락한다. 충돌하면 `session_in_use`로 거절하고 생성한 프로세스를 정리한다. 임시 예약도 정리 완료 확인 전에는 해제하지 않는다. 이는 main 내부 실행 관리이며 프로세스 간 전역 잠금을 추가하지 않는다.
- **재시작**: 저장된 이벤트를 접을 때(`foldConversation`) `turn.done`, `turn.failed`, `interrupted` 없이 끝난 턴은 `interrupted{reason: "crashed"}`로, 답하지 않은 `permission.request`는 `expired`로 본다. 재시작 뒤 `send`는 저장된 세션을 다시 이어받는다.
- **저장**: 기기 로컬 `<userData>/conversations/<id>.jsonl`(이벤트 append, 각 줄에 `v: 1`)과 목록 인덱스(2026-10-26 user). 캔버스, 세션 참조(`{runtime, origin: "resumed" | "new" | "newDesign", sessionId, configDir, cwd}`), 제목, current/archived 상태를 담는다. 팀과 공유하지 않는다. 정리 정책은 이번에 두지 않는다.

## 권한

사용자가 Claude Code·Codex에 이미 설정해 둔 권한 규칙을 그대로 따른다. doan은 정책을 더하지 않는다(2026-10-26 user). 에이전트가 묻는 권한 요청은 모두 `permission.request`로 렌더러에 올리고, 사람이 고른 옵션을 그대로 돌려준다. 답이 없으면 프로세스가 사는 동안 기다린다. 중단, 종료, 크래시 때는 `expired`로 끝낸다. 권한 요청을 앱으로 넘기지 못하는 전송 방식은 고르지 않는다(PoC 9b). doan이 묻기를 생략하도록 강제하지 않는다. 사용자의 기존 정책이 이미 허용하거나 거절한 작업에 가짜 질문을 만들지도 않는다. Claude는 `settingSources: ["user", "project", "local"]`을 사용하고 bypass/manual override를 강제하지 않는다. Codex도 유효 approval/sandbox 설정을 상속하며 PoC의 read-only/on-request fixture나 ACP의 agent preset을 제품 기본값으로 강제하지 않는다.

`options`는 실제 요청에서 지원하는 선택지만 담는다. Claude allow/deny 콜백과 Codex accept/decline을 대응시키며 `allowAlways`는 해당 요청이 지속 허용을 실제로 지원할 때만 노출한다. Codex file approval의 `decline`은 거절 뒤 턴을 계속하고 `cancel`은 중단이므로 섞지 않는다. 허용/거절 응답 뒤 `permission.resolved`를 저장한다. 사용자가 중단하면 미해결 요청은 `expired`로 끝내고, Claude `aborted_tools`와 Codex `interrupted`는 `interrupted`로 변환한다. 명시적 중단 없이 transport가 중단을 보고한 경우도 성공으로 만들지 않고 `turn.failed{process_exited}`로 남긴다. 한 턴의 종료 이벤트(`turn.done`·`turn.failed`·`interrupted`)는 하나만 남긴다.

## 프로세스 수명

- Claude는 턴마다 SDK/CLI를 열고 동일 세션으로 재개한다. Codex는 대화마다 app-server 하나를 유지하고 턴 사이에도 살려 둔다(PoC에서 검증한 실행 방식). 보관·앱 종료 때 닫으며 재시작 때 같은 세션을 다시 연다. 동시에 도는 대화 수의 상한은 UI 자식이 정하고, 기반은 상한을 두지 않는다.
- 세션 소유권은 Claude 턴 프로세스의 종료, Codex 대화 서버의 종료를 확인한 뒤에만 해제한다. Codex의 턴 완료·idle은 서버 소유권을 풀지 않는다. 종료 이벤트 저장, kill 요청, 호출자 기한 만료는 종료 확인을 대신하지 않는다. 시작 실패나 보관·중단 시 정리가 실패하거나 종료 여부가 불확실하면 예약/소유권을 유지한다. spawn하지 않았음이 확인된 시작 실패만 프로세스 종료 대기 없이 예약을 취소한다. 외부 Claude 접속 경쟁에 관한 승인된 한계는 그대로다.
- 상태: `idle → starting → streaming ⇄ waitingPermission → idle`, 실패는 `failed`, 중단은 `interrupted`. 순수 상태 기계(`turnState`)다.
- 자식 프로세스는 프로세스 그룹으로 띄운다. 끝낼 때는 doan이 생성하고 소유한 그룹에만 SIGTERM을 보내고 짧은 유예 뒤 SIGKILL을 보낸다. 호출자 정리는 자식 종료 확인과 별개로 기한 안에 끝낸다(POSTMORTEM 2026-10-23 'A utility-process kill request left its caller pending').
- 앱 종료: `before-quit`은 동기라 자식 종료를 기다리지 않는다. 이벤트는 받는 즉시 append하므로 종료 때 남은 저장이 없다(POSTMORTEM 2026-10-25 'A crash during quit teardown lost the debounced ui-state'). 실행 중인 턴은 `interrupted{appQuit}`를 쓰고 프로세스 그룹을 끝낸다. 기존 종료 확인과 같은 경로를 쓴다(POSTMORTEM 2026-10-25 'Native hiding bypassed renderer-only lifetime checks', 'An uncertain comment request silently blocked every exit').
- 앱이 SIGKILL이나 크래시로 죽으면 에이전트 프로세스가 남아 파일을 계속 쓸 수 있다. 이 위험은 감수한다.
- 요청 순서: 늦게 끝난 이전 요청이 새 상태를 덮지 않게 대화 id, 순번, 요청 번호로 막는다(POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback').
- 실행 환경 (`agentEnv`): 셸 탐색 결과의 PATH와 설정 디렉터리, 그 앱의 `DOAN_RUNTIME`을 넘긴다. 상속받은 `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `CODEX_SESSION_ID`는 모두 지운다. 각 런타임이 새 자식 셸에 자기 id를 넣도록 한다. resume에는 검증한 configDir·cwd를, new/newDesign에는 현재 선택된 configDir·프로젝트 root를 쓴다. Codex MCP의 custom env 상속은 가정하지 않으며 MCP 기록을 켜지 않는다. 앱을 Claude Code 안에서 띄운 dev 실행에서 Codex 기록이 claude로 잘못 남지 않게 하기 위해서다.

## IPC 계약 (렌더러 ↔ main)

UI 자식이 이것만 보고 화면을 만든다. main 창의 main frame만 호출할 수 있고, 이벤트도 main 창에만 보낸다(Settings와 썸네일 창 제외). 렌더러는 enum, 불투명 id, 저장된 root, 캔버스 경로, 사람의 글만 보내고 main이 경로와 명령을 만든다(ARCHITECTURE §7 preload 규칙과 같다). 캔버스 경로는 그 root의 목록에 있는지 확인하고(`thumbnails:get`과 같은 검증), 셀렉터·글자·사람의 글에는 크기 상한을 둔다.

- `conversation:resumeTarget({root, canvas})` → `{available: true, runtime, lastCheckAt}` 또는 `{available: false, reason: "no_record" | "cli_missing" | "outside_root" | "session_unavailable" | "session_in_use"}`.
- `conversation:forCanvas({root, canvas})` → 그 캔버스의 현재 대화 요약(없으면 `null`)과 보관한 대화 요약 목록. 요약은 `{conversationId, canvas, title, state: "current" | "archived", turn: "idle" | "running" | "waitingPermission" | "failed", session: {runtime, origin}, lastAt}`.
- `conversation:start({root, mode: "resume" | "new" | "newDesign", runtime?, canvas?, subject?, text, anchors?})` → `{conversationId}` 또는 오류. `canvas`는 `newDesign`이 아니면 필수, `runtime`은 `new`·`newDesign`에서 필수, `subject`는 `newDesign`에서 필수다. 그 캔버스에 현재 대화가 있으면 보관하고 새로 연다.
- `conversation:send({conversationId, text, anchors?})`, `conversation:interrupt({conversationId})`, `conversation:answerPermission({conversationId, requestId, optionId})`.
- `conversation:read({conversationId})` → `{events, lastSeq, turn, pendingPermission?}`. 소비자는 먼저 `onConversationEvent` listener를 등록해 대상 대화 이벤트를 버퍼링하고, 그 뒤 `read`를 호출한다. snapshot과 버퍼를 `conversationId`별 `seq` 순으로 합쳐 중복을 제거한다. 병합 중 들어온 이벤트도 같은 버퍼로 받아 순서대로 처리하고, listener를 해제하거나 다시 등록하는 틈 없이 이후 이벤트 전달을 계속한다. 마지막 종료 이벤트 뒤에 후속 이벤트가 없어도 반영돼야 한다. 새 IPC나 replay API는 추가하지 않는다. T는 병합 규칙, A는 preload 구독·read 경계와 테스트 소비자를 검증하고 실제 UI 소비자는 이후 buzz-conversation이 구현한다.
- `onConversationEvent(listener)` → 위 이벤트.
- 오류 코드: `bad_request`, `project_not_open`, `canvas_not_found`, `no_agent`, `cli_missing`, `no_session`, `session_unavailable`, `runtime_unsupported`, `session_in_use`, `busy`, `not_logged_in`, `process_exited`, `rate_limited`, `unknown`, `not_found`(없는 대화), `stale`(이미 끝난 권한 요청).
- `resumeTarget`은 미리보기이며 실행 권한을 예약하지 않는다. `start`와 각 `send`는 root/cwd/configDir·버전·세션 점유를 다시 확인한다. 요청 수락 전 실패는 IPC 오류로 반환하고 기존 대화를 보관하거나 user.message를 추가하지 않는다. start는 위 main 내부 예약 확보와 세션 열기/점유 확인을 모두 마친 뒤에만 수락한다. 수락 후 transport 오류는 같은 코드의 `turn.failed`로 저장한다. 기록 없음은 `no_session`(미리보기는 `no_record`), root 밖 cwd는 `start`/`send`에서 `session_unavailable`(미리보기는 `outside_root`), 설정 불일치·사라진 세션·확인 불가 식별은 `session_unavailable`, 알려지지 않은 버전은 resume/send에서 `session_unavailable`, 새 세션 시작에서 `runtime_unsupported`다. 자동 재시도·fork·새 세션 전환은 하지 않는다.
- Codex `thread/resume`의 `already has an active writer` 거절은 `session_in_use`다. 빈 `thread/loaded/list`를 사용 가능 증거로 삼지 않는다. 터미널이 닫혀도 daemon이 잠금을 가질 수 있으며 사용자 daemon을 죽이거나 재설정하지 않는다.
- Claude는 검증된 버전의 `sessions/<pid>.json`에서 interactive 세션/config/cwd를 확인하고 OS PID와 `procStart`를 `TZ=UTC`로 대조한다. 살아 있는 같은 세션이면 `session_in_use`, 읽기·파싱·PID 정체 확인 실패는 `session_unavailable`다. 죽은 PID나 PID 재사용으로 옛 process임이 확인된 잔여 registry만 점유에서 제외한다. 확인한 버전에서 registry 디렉터리를 정상적으로 읽었고 살아 있는 일치 항목이 없을 때만 비점유로 본다. registry 디렉터리 부재·읽기 실패를 빈 목록으로 바꾸지 않는다. cwd가 달라도 같은 configDir·sessionId의 살아 있는 interactive process면 점유다. 매 resume/send 직전 재검사한다. 검사 후 접속 경쟁은 위 9d 사용자 결정으로 수용했으며 이후 접속을 막는 잠금으로 설명하지 않는다.
- 앵커(메시지 안): `{frame?: {id, title?}, element?: {doanId?, selector, text?}, point?: {frameId?, dx, dy}}`. 캔버스는 대화의 캔버스다. 한 메시지의 앵커는 정해진 개수 이하로 제한한다. 요소는 코멘트처럼 `data-doan-id` → 셀렉터 순으로 찾고, 못 찾으면 UI가 위치를 찾을 수 없는 상태를 보인다. 캔버스가 옮겨지면 revision-continuity의 id 기반 복원을 따른다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `pickSession(records, root, canvas, available)` — 이어받을 세션 고르기(`resumeTarget` 포함). 디렉터리·버전·점유 검사의 I/O는 호출부가 맡고 순수 함수에는 확인 결과를 전달한다.
2. `turnPrompt(anchor, text, context)` — 턴 프롬프트. 지시문이 담긴 캔버스 글자 케이스를 포함한다.
3. 런타임 출력 → doan 이벤트 변환(9b에서 고른 방식마다 하나). 픽스처는 PoC 출력에서 경로·세션 id·대화 내용을 지운 줄이다.
4. `foldConversation(events)` — 저장된 이벤트 → 대화 상태(재시작 규칙, 보관 포함). read snapshot과 구독 버퍼의 대화별 seq 정렬·중복 제거 규칙도 순수 함수로 검증한다.
8. `anchorTokens(text, anchors)` — 글의 `{{n}}` 표지와 앵커 목록이 맞는지 검사(빠진 번호, 남는 앵커, 상한).
5. `turnState(state, event)` — 프로세스 상태 기계. main이 전달한 세션 예약·소유 상태의 판정과 검증된 종료에 따른 해제 규칙도 순수 함수로 검증한다.
6. `agentEnv(probe, runtime, appRuntime)` — 실행 환경.
7. Go: `sessionFromEnv(env)`(두 런타임 변수·충돌하는 Codex id의 기록 생략 포함), `sessionRecordPath(env)`(실패 시 없음), 해시 비교로 남길 줄 고르기.

## 포맷 변경

- 세션 기록 `sessions.v1`이 Go(CLI가 씀)와 TS(앱이 읽음)의 공유 포맷이 된다. ARCHITECTURE §11에 JSON Schema(`sessions.v1.schema.json`)를 더하고, TS와 Go의 등록 목록을 늘리며, 같은 픽스처(`schema/fixtures/sessions/<case>/`)를 두 쪽 테스트가 읽는다. 오류 픽스처: 알 수 없는 `v`, 잘린 마지막 줄, JSON이 아닌 줄, 필드 누락, `-`로 시작하는 `sessionId`, 상대경로 `cwd`, 필수 `configDir` 누락·상대경로·NUL. 디렉터리 존재·canonical 동일성·root 내부 판정은 schema만으로 확인할 수 없으므로 C/T/A 테스트에서 검증한다. 숫자 `v` 정규화는 읽는 쪽이 맡는다. 새 포맷이라 `v: 1`부터 시작한다.
- 대화 저장 파일은 앱만 읽고 쓰므로 기기 로컬 비공유 파일이다. 각 줄에 `v: 1`을 넣어 두어 나중에 공유 포맷으로 올리기 쉽게 한다. ARCHITECTURE §11 'Device-local files without shared schemas' 목록에 더한다.
- 코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `check`의 출력도 그대로다(기록은 부수 효과). AGENTS.md Commands에서 `check`를 "read-only"라고 적은 문구는 승격 때 고친다.

## 결정 영향

- PRODUCT §3: In scope에 대화 항목을 더하고, Out of scope 3·4·7을 고친다(7은 "사람과 에이전트가 같은 파일을 동시에 편집하는 일은 하지 않는다"로 좁힌다). §4 Loop 문장과 In scope 2·3(코멘트)은 대화 UI 자식이 코멘트를 걷어낼 때 고친다. 이 feature 동안 사람이 쓰는 루프는 여전히 코멘트 루프이기 때문이다.
- PRODUCT §5 app-setup의 FirstPrompt(복사해서 붙이기)는 대화 UI가 붙을 때 Send로 바뀐다. 이 feature는 `newDesign` IPC만 만들고, 결정 기록은 D1에서 남긴다.
- ARCHITECTURE §4: `DOAN_RUNTIME` 해석 범위가 `active`에서 세션 기록 경로까지 넓어진다. 세션 기록은 소켓을 쓰지 않는다. "file-backed commands work without it"은 그대로다.
- ARCHITECTURE §5: MCP `check`는 기록에서 제외하며 기존 `readOnlyHint`를 유지한다고 적는다.
- serving scope, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작은 그대로다. 에이전트가 git을 다루는지는 사람이 에이전트에게 말한 대로이고 doan이 git을 조작하지 않는다.
- 앱이 에이전트를 띄우므로 에이전트는 사용자 권한으로 repo에서 돈다. repo 설정(git hooks, 에이전트 설정 파일)이 그대로 적용된다. doan은 sandbox를 약속하지 않는다(POSTMORTEM 2026-10-25 'Eval inspection executed repository-configured helpers'의 예방 문장과 같은 한계).

## 공통 함정 (POSTMORTEM)

- 2026-10-25 'An uncertain comment request silently blocked every exit' — 실행 중인 턴이 종료를 막지 않게 하고, 종료 승인이 저장 실패를 덮지 않게 한다.
- 2026-10-25 'Native hiding bypassed renderer-only lifetime checks' — 창 숨김과 Quit에서 프로세스 정리를 main이 맡는다.
- 2026-10-25 'An older install failure replaced newer feedback' — 스트림과 요청 응답은 대화 id와 순번으로 묶는다.
- 2026-10-25 'A crash during quit teardown lost the debounced ui-state' — 이벤트는 받는 즉시 저장한다.
- 2026-10-23 'A utility-process kill request left its caller pending' — 종료 요청과 호출자 정리를 분리한다.
- 2026-10-25 'Eval inspection executed repository-configured helpers' — 앱이 repo에서 돌리는 다른 하위 프로세스(git 등)는 이 예방을 따른다. 에이전트 자체는 sandbox하지 않는다.
- 2026-10-25 'Runtime checks could finish before the evidence or cleanup' — e2e에서 가짜 에이전트 프로세스가 남지 않았는지를 suite 끝 조건에 넣는다.

## 결정 기록

1. 세션 기록 위치: 기기 로컬 `<userData>/sessions.jsonl`, userData 디렉터리가 있을 때만 (2026-10-26 user; 디렉터리 조건은 리뷰 반영).
2. 대화 저장 위치: 기기 로컬 `<userData>/conversations/` (2026-10-26 user).
3. 권한: 에이전트 자체 설정을 따르고 doan은 정책을 더하지 않는다. 묻는 요청은 모두 대화창으로 올린다 (2026-10-26 user).
4. 이어받기: fork하지 않고 같은 세션에 이어 쓴다. 터미널에서 열려 있는지 알아챌 수 있으면 `session_in_use`로 막는다 (2026-10-26 user, PoC 9d).
5. Codex 세션 id를 얻지 못하면 Codex는 새 세션만 지원한다 (2026-10-26 user).
6. 대화는 캔버스당 하나다. 앵커는 메시지 안에 들어가고 한 메시지에 여럿일 수 있다. 끝내려면 새 대화를 시작하고 이전 대화는 보관한다. 리뷰 때 정한 '닫기·다시 열기'를 대체한다 (2026-10-26 user).
7. 새 디자인 시작(`newDesign`)은 이 feature 범위다 (2026-10-26 user).

## 대화 UI 자식에 넘길 것 (기반 범위 밖, 2026-10-26 user)

- 입력창 옆에 요소 피커를 둔다. 켜면 캔버스가 지금의 요소 선택 모드가 되고(Esc로 취소), 요소를 클릭하면 입력창 커서 자리에 인라인 칩이 들어가고 포커스가 입력창으로 돌아온다. 빈 곳 클릭은 좌표 칩이다. 보낸 메시지의 칩을 누르면 캔버스가 그 대상으로 이동하고 강조한다.
- 칩은 메신저의 멘션처럼 액센트로 하이라이트한다. 추천은 연한 채움(violet 3~4)과 진한 글자(violet 12)다. 레퍼런스는 일반 멘션을 무채색으로 두지만(`DESIGN.md` 'Mentions', `~/code/buzz-app@c40dfdf4`), doan의 앵커 칩은 메시지의 핵심 대상이라 액센트를 쓴다. 액센트 자리가 늘어나므로 부모 공통 결정 2를 고친다.
- 오른쪽 패널의 대화 탭은 그 캔버스의 현재 대화를 보인다. 대화 목록 버튼은 보관한 대화를 보는 용도로 줄어든다.
