# agent-conversation — design

## 전체 흐름

1. 에이전트가 터미널에서 캔버스를 쓰고 `doan check`를 돌린다. doan이 그 세션을 캔버스에 묶어 기기 로컬에 기록한다('세션 기록').
2. 사람이 앱에서 대상(캔버스, 프레임, 요소 또는 좌표)을 고르고 말한다. 렌더러는 IPC `conversation:start`로 대화를 연다.
3. main이 그 캔버스의 최근 세션을 찾아 **갈라내어(fork)** 이어받거나, 기록이 없으면 새 세션을 연다. 첫 메시지에 대상 정보를 붙여 보낸다('턴 프롬프트').
4. main이 에이전트 출력을 doan 대화 이벤트로 바꿔 렌더러에 스트리밍하고, 기기 로컬에 저장한다.
5. 에이전트가 캔버스 파일을 쓰면 지금의 파일 감시와 다시 그리기가 그대로 반영한다.
6. 권한 요청은 에이전트 자체 설정을 따르고, 에이전트가 물으면 이벤트로 렌더러에 올린다('권한').

## 영향받는 구성 요소

- **CLI (Go)**: `doan check`와 MCP `check`가 세션 기록을 남긴다. 다른 명령의 동작과 출력은 바뀌지 않는다.
- **앱 main**: 새 모듈 `app/src/main/conversation/`(가칭) — 에이전트 실행기(전송 어댑터), 세션 기록 읽기, 대화 저장, 프로세스 수명, IPC 처리.
- **앱 preload**: 대화 IPC를 노출한다. 렌더러 UI는 이번에 만들지 않는다.
- **skills**: `doan skill` 본문에 "대화로 받은 요청은 대상과 말을 따라 캔버스를 고치고 `doan check`를 돌린다"를 더할지 PoC 뒤에 정한다. 앱이 보내는 턴 프롬프트가 지시를 담으므로 스킬 변경은 최소로 둔다.
- **포맷**: 세션 기록이 Go와 TS가 함께 읽는 공유 포맷이 된다('포맷 변경').
- **`doan mcp`**: `check` 도구가 세션 기록을 남기는 것 말고는 바뀌지 않는다.

## PoC (먼저)

PRODUCT §6에 새 줄로 기록한다. 실험 코드는 `.scratch/agent-conversation/`.

| # | 무엇 | 통과 기준 |
|---|---|---|
| 9a | 세션 id 확보 | Claude Code의 Bash 도구 자식 프로세스와 MCP 서버 프로세스에서 세션 id를 읽는다. 2026-10-26 관찰: Claude Code 2.1.310의 Bash 자식 환경에 `CLAUDE_CODE_SESSION_ID`가 있다(이 세션 값과 일치). MCP 서버 쪽과 Codex(대응 변수 또는 다른 경로)는 미확인. Codex에서 못 얻으면 대안(transcript 위치에서 찾기)을 기록한다 |
| 9b | 전송 방식 | 같은 시나리오를 (A) 직접 CLI: Claude `claude -p --resume <id> --fork-session --output-format stream-json`(입력도 stream-json), Codex `codex exec resume <id> --json`과 `codex fork`, (B) ACP 어댑터: `claude-agent-acp`, `@agentclientprotocol/codex-acp`(레퍼런스 앱이 쓰는 방식, `docs/view-claude-session.md`, `docs/codex-binding-readiness.md` @c40dfdf4)로 돌린다. 비교: 터미널에서 만든 기존 세션을 갈라내어 이어받는지, 응답·도구 활동이 스트리밍되는지, 권한 요청을 앱이 받아 답할 수 있는지, 중단, 사용자가 이미 설치·로그인한 CLI를 그대로 쓰는지, 추가 설치 크기, 첫 응답까지 시간. 두 런타임에 한 방식을 고른다 |
| 9c | 수정 반영 지연 | "버튼 색을 바꿔라" 한 턴에서 메시지 전송 → 캔버스 파일 변경 → 앱 다시 그리기까지 시간을 Claude·Codex 각각 5회 잰다 |
| 9d | 터미널 세션과 겹침 | 같은 세션이 터미널에 열려 있는 동안 앱이 fork로 이어받아도 터미널 세션 기록이 바뀌지 않는다(세션 파일 바이트 비교) |
| 9e | 실행 환경 | 앱이 띄우는 에이전트에 온보딩 셸 탐색(PoC 7a)의 PATH, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`을 넘겨 실행된다. 격리 HOME에서의 실험 계약은 PoC 7과 같다 |

PoC 결과로 전송 방식과 세션 기록 경로가 정해지기 전에는 구현 task를 시작하지 않는다.

## 세션 기록

- **언제**: `doan check`(CLI)와 MCP `check`가 성공·실패와 상관없이 끝날 때, 검사한 캔버스마다 한 줄을 남긴다. 에이전트는 캔버스를 쓴 뒤 `check`를 돌리므로(PRODUCT §4 Loop 5, 스킬 규칙) 쓴 세션이 잡힌다.
- **무엇**: `{v, at, root, canvas: {path, id?}, runtime: "claude" | "codex", sessionId, cwd}`. 세션 id를 얻지 못하면(사람이 터미널에서 직접 돌린 경우 등) 남기지 않는다. 기록 실패는 `check` 결과에 영향을 주지 않는다.
- **어디**: 기기 로컬 파일 `<userData 디렉터리>/sessions.jsonl`(2026-10-26 user). CLI는 `runtime.json`의 기본 위치(또는 `DOAN_RUNTIME`의 디렉터리)에서 디렉터리를 정한다. 세션은 그 기기의 에이전트 기록이라 repo로 공유할 이유가 없다.
- **고르기**: 캔버스 id(없으면 path)가 같은 기록 중 가장 최근 것. 런타임 CLI가 지금 없거나, 세션이 다른 작업 디렉터리에 속하면 건너뛴다.

## 대화

- **열기 방식**: `resume`(기록된 세션을 fork해서 이어받기, 기본), `new`(같은 repo에서 새 세션), `newDesign`(프로젝트와 주제를 받아 새 세션, 지금 FirstPrompt 문장을 첫 메시지로).
- **턴 프롬프트**: 사람의 말 앞에 대상 블록을 붙인다 — repo 상대 캔버스 경로와 id, 프레임 id와 제목, 요소의 `data-doan-id` 또는 셀렉터·태그·글자 발췌(지금 코멘트 대상과 같은 정보), 좌표 마커면 보드 좌표와 그 지점의 프레임. 끝에 "고친 뒤 `doan check`를 돌려라"를 붙인다. 순수 함수로 만든다.
- **이벤트**: 렌더러와 저장에 쓰는 doan 이벤트 — `message.delta`(에이전트 글 조각), `message.done`, `activity`(도구 이름과 짧은 요약, 예: 파일 편집 경로), `permission.request`, `permission.resolved`, `turn.done`, `turn.failed`(코드와 사람이 읽을 문장), `interrupted`. 런타임별 원본 출력에서 이 이벤트로 바꾸는 부분은 런타임마다 순수 함수다.
- **동시성**: 한 대화에 턴은 하나만 돈다. 실행 중에 보낸 메시지는 거절하거나 큐에 넣는다(UI 자식이 고르게 IPC는 둘 다 지원하지 않고 거절만 한다, 결정 질문 없음 — 단순한 쪽).
- **저장**: 기기 로컬 `<userData>/conversations/<id>.jsonl`(이벤트 append)과 목록 인덱스(2026-10-26 user). 팀과 공유하지 않는다. 대상(앵커), 세션 참조, 제목, 상태를 담는다. 에이전트 transcript를 다시 읽지 않는다.

## 권한

사용자가 Claude Code·Codex에 이미 설정해 둔 권한 규칙을 그대로 따른다. doan은 정책을 더하지 않는다(2026-10-26 user). 에이전트가 묻는 권한 요청은 모두 `permission.request` 이벤트로 렌더러에 올리고, 사람의 답을 그대로 돌려준다. 런타임이 권한 요청을 앱으로 넘기지 못하면(PoC 9b) 그 전송 방식은 고르지 않거나, 그 사실을 사용자에게 확인한다(묻지 않고 넘어가는 실행은 하지 않는다).

## 프로세스 수명

- 대화마다 에이전트 프로세스 하나. 턴이 끝나면 다음 턴까지 살려 둘지(지연 감소) 끝낼지는 PoC 9b·9c를 보고 정한다.
- 상태: `idle → starting → streaming ⇄ waitingPermission → idle`, 실패는 `failed`, 사람 중단은 `interrupted`. 순수 상태 기계로 만든다.
- 앱 종료: `before-quit`에서 실행 중인 턴을 중단하고 프로세스를 끝낸 뒤 저장을 마친다. 기존 종료 확인(작성 중 코멘트 등)과 같은 경로를 쓴다(POSTMORTEM 2026-10-25 'Native hiding bypassed renderer-only lifetime checks', 'An uncertain comment request silently blocked every exit').
- 요청 순서: 늦게 끝난 이전 요청이 새 상태를 덮지 않게 요청 번호로 막는다(POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback').

## IPC 계약 (렌더러 ↔ main)

UI 자식이 이것만 보고 화면을 만든다. 렌더러는 enum, 불투명 id, 저장된 root, 사람의 글만 보내고 main이 경로와 명령을 만든다(ARCHITECTURE §7 preload 규칙과 같다).

- `conversation:list(root)` → 그 프로젝트의 대화 요약(앵커, 제목, 상태, 마지막 시각).
- `conversation:start({root, anchor, text, mode})` → `{conversationId}` 또는 오류(`no_agent`, `no_session`, `busy`, `project_not_open`).
- `conversation:send({conversationId, text})`, `conversation:interrupt({conversationId})`, `conversation:answerPermission({conversationId, requestId, decision})`.
- `conversation:read({conversationId})` → 저장된 이벤트.
- `onConversationEvent(listener)` → 위 이벤트 스트림(대화 id, 순번 포함).
- 앵커: `{canvas: {path, id?}, frame?: {id, title?}, element?: {doanId?, selector, text?}, point?: {x, y}}`(지금 코멘트 대상과 같은 모양에 좌표를 더함).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `pickSession(records, canvas, available)` — 기록 중 이어받을 세션 고르기.
2. `turnPrompt(anchor, text, context)` — 턴 프롬프트 만들기.
3. `claudeEvents(line)`, `codexEvents(line)`(또는 ACP 업데이트 변환) — 런타임 출력 → doan 이벤트.
4. `foldConversation(events)` — 저장된 이벤트 → 대화 상태(글, 활동, 대기 중 권한, 상태).
5. `turnState(state, event)` — 프로세스 상태 기계.
6. `agentEnv(probe, runtime)` — 에이전트 실행 환경(PATH, 설정 디렉터리).
7. Go: `sessionFromEnv(env)` — 환경에서 런타임과 세션 id 읽기, 기록 줄 만들기.

## 포맷 변경

- 세션 기록 `sessions.v1`이 Go(CLI가 씀)와 TS(앱이 읽음)의 공유 포맷이 된다. ARCHITECTURE §11에 JSON Schema와 픽스처를 더하고 TS와 Go 테스트가 같은 픽스처를 읽는다. 새 포맷이라 `v: 1`부터 시작한다.
- 대화 저장 파일은 앱만 읽고 쓰므로 기기 로컬 비공유 파일이다(`folders.json`처럼 스키마 없음). 바뀌면 그때 공유 포맷으로 올린다.
- 코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지는 바뀌지 않는다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `check`의 출력도 그대로다(기록은 부수 효과).

## 결정 영향

- PRODUCT §3 Out of scope 3·4·7과 §4 Loop 4를 바꾼다(spec '범위 확인').
- ARCHITECTURE의 "Only app-dependent `active` uses this socket; file-backed commands work without it"는 그대로다. 세션 기록은 소켓을 쓰지 않는다.
- serving scope, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작은 그대로다. 에이전트가 git을 다루는지는 사람이 에이전트에게 말한 대로이고 doan이 git을 조작하지 않는다.
- 앱이 에이전트를 띄우므로 에이전트는 사용자 권한으로 repo에서 돈다. repo 설정(git hooks, 에이전트 설정 파일)이 그대로 적용된다. doan은 sandbox를 약속하지 않는다(POSTMORTEM 2026-10-25 'Eval inspection executed repository-configured helpers'의 예방 문장과 같은 한계).

## 공통 함정 (POSTMORTEM)

- 2026-10-25 'An uncertain comment request silently blocked every exit' — 실행 중인 턴이 종료를 막지 않게 하고, 종료 승인이 저장 실패를 덮지 않게 한다.
- 2026-10-25 'Native hiding bypassed renderer-only lifetime checks' — 창 숨김과 Quit에서 프로세스 정리가 렌더러에만 의존하지 않게 main이 맡는다.
- 2026-10-25 'An older install failure replaced newer feedback' — 스트림과 요청 응답은 대화 id와 순번으로 묶는다.
- 2026-10-25 'Eval inspection executed repository-configured helpers' — 앱이 repo에서 돌리는 다른 하위 프로세스(git 등)는 이 예방을 따른다. 에이전트 자체는 sandbox하지 않는다.
- 2026-10-25 'Runtime checks could finish before the evidence or cleanup' — e2e에서 가짜 에이전트 프로세스 정리를 suite 끝 조건에 넣는다.

## 결정 기록

1. 세션 기록 위치: 기기 로컬 `<userData>/sessions.jsonl` (2026-10-26 user).
2. 대화 저장 위치: 기기 로컬 `<userData>/conversations/` (2026-10-26 user).
3. 권한: 에이전트 자체 설정을 따르고 doan은 정책을 더하지 않는다. 묻는 요청은 모두 대화창으로 올린다 (2026-10-26 user).
