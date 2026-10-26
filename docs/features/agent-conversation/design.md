# agent-conversation — design

## 전체 흐름

1. 에이전트가 터미널에서 캔버스를 쓰고 `doan check`를 돌린다. doan이 내용이 바뀐 캔버스를 그 세션에 묶어 기기 로컬에 기록한다('세션 기록').
2. UI는 `conversation:resumeTarget`으로 이어받을 세션이 있는지 미리 본다. 사람이 대상(캔버스, 프레임, 요소 또는 좌표)을 고르고 말하면 렌더러가 `conversation:start`로 대화를 연다.
3. main이 기록된 세션을 **같은 세션 그대로** 이어받거나(`resume`), 새 세션을 연다(`new`, `newDesign`). 첫 메시지에 대상 정보를 붙여 보낸다('턴 프롬프트').
4. main이 에이전트 출력을 doan 대화 이벤트로 바꿔 받는 즉시 기기 로컬에 저장하고 렌더러에 보낸다.
5. 에이전트가 캔버스 파일을 쓰면 지금의 파일 감시와 다시 그리기가 그대로 반영한다.
6. 권한 요청은 에이전트 자체 설정을 따르고, 에이전트가 물으면 이벤트로 렌더러에 올린다('권한').

## 영향받는 구성 요소

- **CLI (Go)**: `doan check`와 MCP `check`가 세션 기록을 남긴다. 다른 명령의 동작과 출력은 바뀌지 않는다. `Context`에 기록 경로와 세션 필드를 더한다(`cli/internal/cli/run.go`의 "명령 본문은 환경을 읽지 않는다" 규칙을 지킨다).
- **앱 main**: 새 모듈 `app/src/main/conversation/`(가칭) — 에이전트 실행기(전송 어댑터), 세션 기록 읽기, 대화 저장, 프로세스 수명, IPC 처리.
- **앱 preload**: 대화 IPC를 main 창에만 노출한다. 렌더러 UI는 이번에 만들지 않는다.
- **skills**: `doan skill` 본문 변경은 PoC 뒤에 판단한다(tasks D2). 바꾸면 AGENTS.md 규칙대로 `/agent-eval`을 돌린다.
- **포맷**: 세션 기록이 Go와 TS가 함께 읽는 공유 포맷이 된다('포맷 변경').
- **`doan mcp`**: `check` 도구가 세션 기록을 남긴다. `readOnlyHint: true`(`cli/internal/cli/mcp.go:31`)는 유지한다. 기기 로컬 기록은 사용자의 repo나 에이전트 설정을 바꾸는 쓰기가 아니고, 힌트를 빼면 Codex `approval: never`에서 `check`가 다시 막힌다(USABILITY-EVAL U-002). 이 근거를 ARCHITECTURE §5에 날짜와 함께 적는다.
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

PoC 결과로 전송 방식과 세션 기록 경로가 정해지기 전에는 구현 task를 시작하지 않는다.

## 세션 기록

- **언제**: `doan check`(CLI)와 MCP `check`가 성공·실패와 상관없이 끝날 때. 검사한 캔버스 중 **내용 해시가 그 캔버스의 직전 기록과 다른 것**만 한 줄씩 남긴다. 그래야 그 세션이 실제로 바꾼 캔버스만 그 세션 것으로 잡힌다. 해시는 코멘트 이벤트의 `canvasHash`와 같은 형식(`sha256:`)이다.
- **무엇**: `{v, at, root, canvas: {path, id?}, hash, runtime: "claude" | "codex", sessionId, cwd}`. 세션 id를 얻지 못하면 남기지 않는다.
- **어디**: 기기 로컬 `<userData 디렉터리>/sessions.jsonl`(2026-10-26 user). 디렉터리는 `DOAN_RUNTIME`의 디렉터리, 없으면 기본 userData(`~/Library/Application Support/doan/`)다. **디렉터리가 이미 있을 때만** 기록한다. 앱을 설치하거나 실행한 적 없는 CLI 전용 사용자에게는 파일을 만들지 않는다.
- **실패**: 경로 계산 실패(잘못된 `DOAN_RUNTIME` 포함), 디렉터리 없음, 쓰기 실패는 모두 기록만 건너뛴다. `check`의 출력과 exit code는 그대로다. 그래서 `active`용 `runtimePath()`를 그대로 쓰지 않고(잘못된 값이면 `usage_error`), 실패를 삼키는 별도 경로 계산을 둔다. ARCHITECTURE §4의 "`DOAN_RUNTIME`은 `active`에서만 해석한다" 문장을 함께 고친다.
- **동시 쓰기**: 한 줄을 `O_APPEND`로 한 번의 쓰기로 남긴다(코멘트 JSONL과 같은 전제, ARCHITECTURE §2). 크기 정리는 이번에 하지 않는다. 앱은 파일 끝에서부터 정해진 크기만 읽는다.
- **신뢰할 수 없는 입력**: 사용자 권한의 어떤 프로세스든 이 파일을 쓸 수 있다. 스키마로 `runtime`은 enum, `sessionId`는 패턴(앞 글자 `-` 금지), `cwd`는 절대경로이면서 `root` 안으로 제한하고, argv에는 `--resume=<id>`처럼 붙여 넘긴다. 깨진 줄, 알 수 없는 `v`, 스키마 위반 줄은 건너뛴다.
- **고르기** (`pickSession`): `root`가 같고 캔버스 id(없으면 path)가 같은 기록 중 `at`이 가장 늦은 것(같으면 파일에서 뒤 줄). 런타임 CLI가 지금 없거나, 기록된 `cwd`가 그 `root` 밖이면 건너뛴다. worktree가 다르면 `root`가 달라 섞이지 않는다(ARCHITECTURE §13).

## 대화

- **열기 방식**: `resume`(기록된 세션을 같은 세션으로 이어받기), `new`(같은 repo에서 새 세션), `newDesign`(프로젝트와 주제를 받아 새 세션. 지금 FirstPrompt 문장을 첫 메시지로 쓰고, 첫 캔버스가 생기면 대화의 앵커를 그 캔버스로 채운다). Codex 세션 id를 얻지 못하면 Codex는 `new`와 `newDesign`만 지원한다.
- **턴 프롬프트** (`turnPrompt`): 사람의 말 앞에 대상 블록을 붙인다. 대상 블록에는 repo 상대 캔버스 경로와 id, 프레임 id와 제목, 요소의 `data-doan-id` 또는 셀렉터·태그·글자 발췌(지금 코멘트 대상과 같은 정보), 좌표 마커면 프레임 기준 오프셋이 들어간다. 캔버스에서 온 글자는 데이터로 표시해서 사람의 말과 구분한다(스킬 규칙 A와 같다). 끝에 "고친 뒤 `doan check`를 돌려라"를 붙인다.
- **이벤트** (저장과 렌더러 공통, 모두 `{conversationId, seq, turnId, at}`를 가진다):
  - `user.message` — 사람이 보낸 글.
  - `turn.started`
  - `message.delta`, `message.done` — 에이전트 글. delta도 저장해서 턴 중간에 렌더러를 다시 불러와도 글이 빠지지 않게 한다.
  - `activity` — `{kind: "edit" | "read" | "command" | "other", path?, insideDesign?, summary}`.
  - `permission.request` — `{requestId, tool, summary, options: [{id, label, kind: "allow" | "allowAlways" | "deny"}]}`. `permission.resolved` — `{requestId, optionId | "expired"}`.
  - `turn.done`
  - `turn.failed` — `{code, detail?}`. 코드는 `cli_missing`, `not_logged_in`, `session_unavailable`, `session_in_use`, `process_exited`, `rate_limited`, `unknown`이다. 사람이 읽을 문장은 렌더러가 코드별로 쓰고, 원문 출력 발췌는 `detail`에 둔다.
  - `interrupted` — `{reason: "user" | "appQuit" | "crashed"}`.
  - `conversation.closed`, `conversation.reopened`.
- **동시성**: 한 대화에 턴은 하나만 돈다. 실행 중에 보낸 `send`는 `busy`로 거절하고 큐는 두지 않는다. 렌더러는 거절된 입력을 지우지 않는다.
- **재시작**: 저장된 이벤트를 접을 때(`foldConversation`) `turn.done`, `turn.failed`, `interrupted` 없이 끝난 턴은 `interrupted{reason: "crashed"}`로, 답하지 않은 `permission.request`는 `expired`로 본다. 재시작 뒤 `send`는 저장된 세션을 다시 이어받는다.
- **저장**: 기기 로컬 `<userData>/conversations/<id>.jsonl`(이벤트 append, 각 줄에 `v: 1`)과 목록 인덱스(2026-10-26 user). 앵커, 세션 참조(`{runtime, origin: "resumed" | "new" | "newDesign", sessionId}`), 제목, open/closed 상태를 담는다. 팀과 공유하지 않는다. 정리 정책은 이번에 두지 않는다.

## 권한

사용자가 Claude Code·Codex에 이미 설정해 둔 권한 규칙을 그대로 따른다. doan은 정책을 더하지 않는다(2026-10-26 user). 에이전트가 묻는 권한 요청은 모두 `permission.request`로 렌더러에 올리고, 사람이 고른 옵션을 그대로 돌려준다. 답이 없으면 프로세스가 사는 동안 기다린다. 중단, 종료, 크래시 때는 `expired`로 끝낸다. 권한 요청을 앱으로 넘기지 못하는 전송 방식은 고르지 않는다(PoC 9b). 묻지 않고 넘어가는 실행은 하지 않는다.

## 프로세스 수명

- 대화마다 에이전트 프로세스 하나. 턴 사이에 살려 둘지는 PoC 9b·9c를 보고 정한다. 동시에 도는 대화 수의 상한은 UI 자식이 정하고, 기반은 상한을 두지 않는다.
- 상태: `idle → starting → streaming ⇄ waitingPermission → idle`, 실패는 `failed`, 중단은 `interrupted`. 순수 상태 기계(`turnState`)다.
- 자식 프로세스는 프로세스 그룹으로 띄운다. 끝낼 때는 그룹에 SIGTERM을 보내고 짧은 유예 뒤 SIGKILL을 보낸다. 호출자 정리는 자식 종료 확인과 별개로 기한 안에 끝낸다(POSTMORTEM 2026-10-23 'A utility-process kill request left its caller pending').
- 앱 종료: `before-quit`은 동기라 자식 종료를 기다리지 않는다. 이벤트는 받는 즉시 append하므로 종료 때 남은 저장이 없다(POSTMORTEM 2026-10-25 'A crash during quit teardown lost the debounced ui-state'). 실행 중인 턴은 `interrupted{appQuit}`를 쓰고 프로세스 그룹을 끝낸다. 기존 종료 확인과 같은 경로를 쓴다(POSTMORTEM 2026-10-25 'Native hiding bypassed renderer-only lifetime checks', 'An uncertain comment request silently blocked every exit').
- 앱이 SIGKILL이나 크래시로 죽으면 에이전트 프로세스가 남아 파일을 계속 쓸 수 있다. 이 위험은 감수한다.
- 요청 순서: 늦게 끝난 이전 요청이 새 상태를 덮지 않게 대화 id, 순번, 요청 번호로 막는다(POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback').
- 실행 환경 (`agentEnv`): 셸 탐색 결과의 PATH와 설정 디렉터리, 그 앱의 `DOAN_RUNTIME`을 넘긴다. 상속받은 에이전트 세션 변수(`CLAUDE_CODE_SESSION_ID` 등)는 지운다. 앱을 Claude Code 안에서 띄운 dev 실행에서 Codex 기록이 claude로 잘못 남지 않게 하기 위해서다.

## IPC 계약 (렌더러 ↔ main)

UI 자식이 이것만 보고 화면을 만든다. main 창의 main frame만 호출할 수 있고, 이벤트도 main 창에만 보낸다(Settings와 썸네일 창 제외). 렌더러는 enum, 불투명 id, 저장된 root, 캔버스 경로, 사람의 글만 보내고 main이 경로와 명령을 만든다(ARCHITECTURE §7 preload 규칙과 같다). 캔버스 경로는 그 root의 목록에 있는지 확인하고(`thumbnails:get`과 같은 검증), 셀렉터·글자·사람의 글에는 크기 상한을 둔다.

- `conversation:resumeTarget({root, canvas})` → `{available: true, runtime, lastCheckAt}` 또는 `{available: false, reason: "no_record" | "cli_missing" | "outside_root" | "runtime_unsupported"}`.
- `conversation:list(root)` → 대화 요약 `{conversationId, anchor?, title, state: "open" | "closed", turn: "idle" | "running" | "waitingPermission" | "failed", session: {runtime, origin}, lastAt}`.
- `conversation:start({root, mode: "resume" | "new" | "newDesign", runtime?, anchor?, subject?, text})` → `{conversationId}` 또는 오류. `runtime`은 `new`·`newDesign`에서 필수, `subject`는 `newDesign`에서 필수, `anchor`는 `newDesign`이 아니면 선택이다.
- `conversation:send({conversationId, text})`, `conversation:interrupt({conversationId})`, `conversation:answerPermission({conversationId, requestId, optionId})`, `conversation:close({conversationId})`, `conversation:reopen({conversationId})`.
- `conversation:read({conversationId})` → `{events, lastSeq, turn, pendingPermission?}`. 렌더러는 `read` 뒤 구독한 이벤트를 `seq`로 합쳐 빠짐과 중복을 막는다.
- `onConversationEvent(listener)` → 위 이벤트.
- 오류 코드: `bad_request`, `project_not_open`, `canvas_not_found`, `no_agent`, `cli_missing`, `no_session`, `session_in_use`, `busy`, `not_found`(없는 대화), `stale`(이미 끝난 권한 요청).
- 앵커: `{canvas: {path, id?}, frame?: {id, title?}, element?: {doanId?, selector, text?}, point?: {frameId?, dx, dy}}`. 요소는 코멘트처럼 `data-doan-id` → 셀렉터 순으로 찾고, 못 찾으면 UI가 위치를 찾을 수 없는 상태를 보인다. 캔버스가 옮겨지면 revision-continuity의 id 기반 복원을 따른다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `pickSession(records, root, canvas, available)` — 이어받을 세션 고르기(`resumeTarget` 포함).
2. `turnPrompt(anchor, text, context)` — 턴 프롬프트. 지시문이 담긴 캔버스 글자 케이스를 포함한다.
3. 런타임 출력 → doan 이벤트 변환(9b에서 고른 방식마다 하나). 픽스처는 PoC 출력에서 경로·세션 id·대화 내용을 지운 줄이다.
4. `foldConversation(events)` — 저장된 이벤트 → 대화 상태(재시작 규칙 포함).
5. `turnState(state, event)` — 프로세스 상태 기계.
6. `agentEnv(probe, runtime, appRuntime)` — 실행 환경.
7. Go: `sessionFromEnv(env)`(두 런타임 변수가 함께 있을 때의 우선순위 포함), `sessionRecordPath(env)`(실패 시 없음), 해시 비교로 남길 줄 고르기.

## 포맷 변경

- 세션 기록 `sessions.v1`이 Go(CLI가 씀)와 TS(앱이 읽음)의 공유 포맷이 된다. ARCHITECTURE §11에 JSON Schema(`sessions.v1.schema.json`)를 더하고, TS와 Go의 등록 목록을 늘리며, 같은 픽스처(`schema/fixtures/sessions/<case>/`)를 두 쪽 테스트가 읽는다. 오류 픽스처: 알 수 없는 `v`, 잘린 마지막 줄, JSON이 아닌 줄, 필드 누락, `-`로 시작하는 `sessionId`, root 밖 `cwd`. 숫자 `v` 정규화는 읽는 쪽이 맡는다. 새 포맷이라 `v: 1`부터 시작한다.
- 대화 저장 파일은 앱만 읽고 쓰므로 기기 로컬 비공유 파일이다. 각 줄에 `v: 1`을 넣어 두어 나중에 공유 포맷으로 올리기 쉽게 한다. ARCHITECTURE §11 'Device-local files without shared schemas' 목록에 더한다.
- 코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `check`의 출력도 그대로다(기록은 부수 효과). AGENTS.md Commands에서 `check`를 "read-only"라고 적은 문구는 승격 때 고친다.

## 결정 영향

- PRODUCT §3: In scope에 대화 항목을 더하고, Out of scope 3·4·7을 고친다(7은 "사람과 에이전트가 같은 파일을 동시에 편집하는 일은 하지 않는다"로 좁힌다). §4 Loop 문장과 In scope 2·3(코멘트)은 대화 UI 자식이 코멘트를 걷어낼 때 고친다. 이 feature 동안 사람이 쓰는 루프는 여전히 코멘트 루프이기 때문이다.
- PRODUCT §5 app-setup의 FirstPrompt(복사해서 붙이기)는 대화 UI가 붙을 때 Send로 바뀐다. 이 feature는 `newDesign` IPC만 만들고, 결정 기록은 D1에서 남긴다.
- ARCHITECTURE §4: `DOAN_RUNTIME` 해석 범위가 `active`에서 세션 기록 경로까지 넓어진다. 세션 기록은 소켓을 쓰지 않는다. "file-backed commands work without it"은 그대로다.
- ARCHITECTURE §5: MCP `check`의 `readOnlyHint` 유지 근거를 적는다.
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
6. 대화는 닫기와 다시 열기를 지원한다. 닫힌 대화의 핀은 UI가 숨긴다 (2026-10-26 user).
7. 새 디자인 시작(`newDesign`)은 이 feature 범위다 (2026-10-26 user).
