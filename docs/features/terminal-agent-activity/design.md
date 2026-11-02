# terminal-agent-activity — design

착수 조건: canvas-viewport-units 배치 G(D9·D10 캔버스 알림 dot, `docs/features/canvas-viewport-units/orch.md`)가 main에 merge된 뒤 시작한다. 이 feature는 G가 만드는 사이드바 알림 합성 위에 터미널 슬롯을 더한다.

## 흐름

1. 가이드가 에이전트에게 알린다: 캔버스를 고치기 전에 `doan work start <path>`(여러 캔버스면 여러 번), 작업과 `doan check`가 끝나면 응답을 끝내기 전에 고친 캔버스 경로와 함께 `doan work done`을 부르고, 결과의 링크를 마지막 답에 보인다. 사람에게 질문하려고 멈출 때도 `done`을 부른다. 오래 걸리는 작업 중에는 `start`를 다시 부른다(만료 연장).
2. CLI는 세션 식별(아래 '세션 식별')과 repo root, 캔버스 경로를 app socket v3로 보낸다. 환경에 `DOAN_APP_CONVERSATION=1`이 있으면 보내지 않는다.
3. 앱 main은 세션별 작업 중 캔버스 집합을 메모리에 두고, 그 목록을 renderer에 보낸다.
4. renderer는 그 목록을 사이드바 행 상태 자리의 '작업 중', 캔버스 페이지의 Agent indicator, 캔버스 대화 패널의 'Terminal session' 선택지에 쓴다.
5. 사람이 마지막 답의 `doan://` 링크를 누르면 macOS가 패키지된 앱에 넘기고, 앱은 그 캔버스로 이동만 한다(아래 'Deep link').

## 명령

- `doan work start <canvas path> [--repo <path>] [--json]`: 경로는 repo 안의 `.doan/canvases/*.html` 또는 `.doan/ds/*.html`이어야 한다(아직 없어도 된다). 그 밖이면 `usage_error`.
- `doan work done [<canvas path>…] [--repo <path>] [--json]`: 이 세션의 집합을 모두 비운다. 경로 인자는 링크를 만드는 데만 쓰고 `start`와 같이 `workTarget`으로 판정한다(틀리면 `usage_error`). CLI는 상태를 두지 않고 앱의 집합은 앱이 꺼져 있으면 알 수 없으므로, 링크를 만들 경로는 에이전트가 넘긴다. 경로가 없으면 `links`는 빈 목록이다.
- root는 `active`처럼 `repository()`(`cli/internal/cli/run.go`)로 찾는다. `.doan/config.json`이 없는 디렉터리에서는 다른 명령과 같이 `repo_not_found`, 깨진 config는 `invalid_config`로 exit 2다.
- 결과는 `start`가 `{delivered: boolean}`, `done`이 `{delivered: boolean, links: string[]}`이다. `links`는 CLI가 root와 경로로 만들고(`canvasLink`), `delivered`와 상관없이 돌려준다. 이 모양은 ARCHITECTURE §12에만 적고 스키마에는 두지 않는다(§11: 명령 `result`에는 스키마가 없다).
- 명령은 앱을 띄우지 않는다. `onboarding start`의 bootstrap을 쓰지 않는다.
- `doan check`와 다른 명령은 socket을 쓰지 않는다. ARCHITECTURE §4의 "every other command is file-backed"는 `work`를 더한 채 그대로다.

### 오류 대응

에이전트 작업을 막지 않는 것이 목적이다. 아래 경우는 모두 성공 envelope `{delivered: false}`, exit 0이다. ARCHITECTURE §12 exit 표의 예외(앱 오류인데 exit 3이 아니다)이므로 Z1에서 §12에 적는다.

| 경우 | `active`의 결과 | `work`의 결과 |
|---|---|---|
| `DOAN_APP_CONVERSATION=1` (앱 자신의 대화) | — | 보내지 않음, `delivered:false` |
| runtime 파일 없음·읽을 수 없음·형식 오류 | `app_not_running` | `delivered:false` |
| runtime 파일의 다른 버전 | `app_protocol_mismatch` | `delivered:false` |
| 낡은 socket(앱이 죽고 남은 파일)·dial 실패 | `app_not_running` | `delivered:false` |
| 권한 거부(sandbox가 socket을 막음) | `app_not_running` | `delivered:false` |
| 2초 연결 시간 제한 초과(`cli/internal/cli/active.go` `activeTimeout`, §4 'Connection contract'와 같은 계약) | `app_not_running` | `delivered:false` |
| `bad_token` | `app_not_running` | `delivered:false` |
| v3를 모르는 낡은 앱이 v1 `bad_request`로 답함, 다른 버전 응답(`app_protocol_mismatch`) | `internal_error` / `app_protocol_mismatch` | `delivered:false` |
| `project_not_open`(앱에 등록되지 않은 root) | `project_not_open` | `delivered:false` |
| 형식이 맞지 않는 응답 | `internal_error` | `delivered:false` |
| 인자 오류, 상대 경로 `DOAN_RUNTIME`(`active`와 같음) | `usage_error` | `usage_error`, exit 2 |
| repo를 못 찾음 | `repo_not_found` | `repo_not_found`, exit 2 |

앱이 v3 요청을 받아 성공으로 답했을 때만 `delivered:true`다. `delivered:false`인 모든 경우에도 `done`은 `links`를 돌려준다.

## 형식: app-socket v3

v1(`active`)과 v2(onboarding 전용) 옆에 `work` 전용 v3를 따로 둔다. v2를 확장하지 않는다. v1·v2와 그 fixture는 바꾸지 않는다.

- 요청: `{v: 3, token, action: "start" | "done", root, session?, provider?, path?}`. `path`는 `start`에만 있고, `/`로 구분한 repo 상대 경로이며 스키마 pattern(`^\.doan/(canvases|ds)/[^/]+\.html$` 꼴)을 따른다. `session`·`provider`는 함께 있거나 함께 없다(없으면 익명 세션).
- 응답: `{v: 3, ok: true}` 또는 `{v: 3, ok: false, error: {code, message}}`. code는 `bad_request`, `bad_token`, `project_not_open`.
- 스키마 원본 `schema/app-socket.v3.schema.json`, fixture `schema/fixtures/app-socket-v3/`(valid·invalid). v1 전용 reader가 `schema/fixtures/app-socket/`을 glob하므로 v2처럼 디렉터리를 나눈다.
- 검증기: `app/src/formats/validate.ts`와 `cli/internal/formats/validate.go`에 v3 request·response 검증기를 더한다.
- 앱 처리(`app/src/main/runtime.ts` `answerLine`): 숫자 `v`를 먼저 보고 `v: 3`이면 schema → token → 등록된 root 순서로 확인한다(v1과 같은 순서라 틀린 token은 어떤 root가 열려 있는지 알 수 없다). `path`는 앱이 pattern을 다시 확인한다. 그 밖의 `v`는 지금 경로 그대로다.

## 세션 식별

- Go 순수 함수 `workSession`이 환경 변수에서 고른다. 규칙은 `cli/internal/cli/sessions.go` `sessionSettings`와 같지만 함수는 따로 둔다(그 함수는 profile·runtime 경로까지 요구한다).
  - `CLAUDE_CODE_SESSION_ID` → provider `claude`.
  - `CODEX_THREAD_ID`, 없으면 `CODEX_SESSION_ID` → provider `codex`.
  - Claude와 Codex 변수가 함께 있거나, 두 Codex 변수가 서로 다르거나, 값이 없거나 형식이 나쁘면 익명.
- 세션 키는 `provider:id`다. 익명 세션은 root마다 하나이고, 그 `done`은 그 root의 익명 집합을 비운다(spec '알려진 한계').

## 상태 규칙

- 세션 상태: `start`가 캔버스를 집합에 더한다. `done`이 집합을 비운다. 표시 식별은 root + path다.
- 상한: 세션 수와 세션당 경로 수에 상한을 두고, 넘는 신호는 버린다. 값은 구현에서 상수로 정하고 테스트로 고정한다.
- 등록되지 않은 root의 신호는 버린다. 프로젝트를 앱에서 지우면 그 root의 세션도 지운다.
- 만료: 신호는 그 세션의 `work start`와 집합 안 캔버스의 파일 변경 두 가지뿐이다. 파일 변경은 기존 폴더 갱신(`app/src/main/index.ts`가 `folderRefreshes`로 얻는 `{root, changed}`, `app/src/main/conversation/refreshes.ts`)에서 받는다. 폴링하지 않는다. 둘 중 늦은 것에서 5분이 지나면 집합을 비운다. 시간 제한은 테스트에서 주입한다. 숫자는 `/agent-eval` 실행에서 편집 사이 간격을 보고 조정한다.
- 아직 목록에 없는 경로는 집합에 남겨 두고, 목록에 나타나면 표시한다.
- 상태는 메모리에만 둔다. 앱을 다시 켜면 비어 있고, 다음 `start`까지 아무것도 보이지 않는다. `sessions.jsonl`에 쓰지 않는다.
- 이 상태는 표시에만 쓴다. 프로젝트 재진입의 worktree 선택(PRODUCT §5 item 1 'Back and Forward' 항목)과 ARCHITECTURE §7 'Navigation persistence and IPC'에는 넣지 않는다.

## 앱 자신의 대화

- 앱이 대화 환경을 만드는 두 곳에 `DOAN_APP_CONVERSATION=1`을 둔다: `app/src/main/conversation/environment.ts` `agentEnv`, `app/src/main/agentAuth/environment.ts` `providerEnv`.
- `providerEnv`의 `RESERVED`에 `DOAN_APP_CONVERSATION`을 더해 `extra`가 덮어쓰지 못하게 한다. `agentEnv`에는 `RESERVED` 목록이 없고, 상속한 값 위에 표시를 덮어쓴다.
- CLI는 이 표시를 보면 보내지 않고 `delivered:false`, exit 0으로 끝난다. 인자와 repo는 그 전에 평소처럼 확인한다.

## Renderer IPC

- 주 창에만 보내는 `get`과 `changed` 한 쌍이다. renderer는 먼저 구독하고 그다음 읽는다.
- 값은 `{session, provider, root, path}` 목록이다. 경로만 보내지 않는 이유: 패널 선택지는 세션으로 판정하고, 나중 feature도 세션을 구별할 수 있어야 한다.
- 함정: POSTMORTEM 2026-11-01 "The canvas agent indicator kept another worktree's conversation and its Stop". worktree끼리 같은 경로를 가지므로 표시는 root + path로만 맞춘다. 같은 경로를 가진 두 worktree 사이를 오가는 테스트를 둔다.

## 표시

- **사이드바**: `Slot`(`app/src/renderer/homeConversations.ts`)에 출처(`app` | `terminal`)를 더한다. 행 상태 자리의 우선순위는 권한 요청 > 작업 중(앱 대화 또는 터미널) > 안 본 끝·안 본 캔버스다. 같은 행에서 앱 대화와 터미널이 모두 작업 중이면 앱 대화가 이긴다. 터미널 작업 중은 앱 대화의 작업 중과 같은 스피너이고, 놓이는 자리 규칙(캔버스 행, 화면 밖이면 프로젝트 행)도 같다.
  - 합성 코드: `app/src/renderer/conversationList.ts` `slotsFromList`, `app/src/renderer/ShellSidebar.tsx` `projectSlot`, 배치 G의 캔버스 알림 합성.
  - 캔버스 행이나 프로젝트 행의 터미널 슬롯을 누르면 그 캔버스를 연다. 여럿이면 가장 최근에 바뀐 캔버스를 연다. 캔버스 알림 dot의 D10 규칙(`docs/features/canvas-viewport-units/orch.md`)과 같다.
- **캔버스 페이지**: Agent indicator를 재사용한다. glow·dot field와 notice를 보이고 Stop은 두지 않는다. notice는 버튼이 없는 `role=status`이다. 버튼이 없으므로 notice 안쪽 여백을 따로 맞춘다(`/design-draft`에서 정하고 `/design-sync`에서 잰다).
  - 같은 페이지의 선택 안내(picking hint, Esc 키가 붙은 캡슐)도 notice와 같은 높이 40px(`--size-control`)를 쓴다(사용자 결정). 지금은 36px이다. `/design-sync`에서 잰다.
  - 합성은 `app/src/renderer/agentIndicator.ts` `canvasAgent`에서 한다: 앱 대화가 같은 캔버스에서 작업 중이거나 답을 기다리면 앱 대화의 indicator가 이긴다. 터미널 변형에는 Stop이 없다.
  - 전환: 앱 대화의 turn이 끝났는데 같은 캔버스에 터미널 세션이 남아 있으면, indicator는 사라지지 않고 터미널 변형으로 바뀐다(Stop만 없어진다. 문구는 그대로다). 터미널 세션도 끝나면 사라진다.
  - 로딩 중·실패·폭 없음인 캔버스에서는 보이고, 목록에 없는 페이지와 프로젝트 문제에서는 보이지 않는다. PRODUCT §5 item 2 'Agent indicator' 규칙과 같다.
- **캔버스 대화 패널**: 새 대화 상태의 'Terminal session' 이어 가기 선택지는, 그 연결 기록의 세션(`provider:id`)이 작업 중 목록에 있으면 비활성이고 이유 한 줄을 보인다. 새 대화는 그대로 고를 수 있다. `done`이나 만료로 목록에서 빠지면 다시 고를 수 있다. 이미 이어 가기가 선택돼 있었다면 새 대화로 바꾼다. 익명 세션은 연결 기록과 맞출 수 없으므로 막지 않는다.
- **문구**(clarify 프리셋으로 정했다):
  - notice: "Agent is working". 앱 대화의 notice와 같은 문구이고, 터미널 변형은 Stop만 보이지 않는다.
  - 슬롯 접근 이름: "Claude Code is working in a terminal", "Codex is working in a terminal", 익명 "An agent is working in a terminal". 앱 대화 슬롯 "`<provider>` is working"에 출처만 더한다.
  - 비활성 이유: "Still working in your terminal. You can continue it when it finishes." 선택지 제목 "Continue the `<provider>` session from your terminal"과 같은 "your terminal"을 쓰고, 언제 다시 고를 수 있는지 알린다.

## Deep link

- **형식**: `doan://open?root=<절대 root>&canvas=<repo 상대 캔버스 경로>[&frame=<frame id>]`. 매개변수 순서는 root, canvas, frame으로 고정하고 값은 퍼센트 인코딩한다. 정확한 인코딩은 공유 fixture가 고정한다. 앱 안의 답 칩 형식(`doan:<canvas-id>/frame/<id>`, `docs/features/agent-reply-chips/spec.md`)과는 따로 둔다.
- **만들기(Go)**: `canvasLink(root, path)`. CLI는 프레임을 모르므로 frame 인자를 두지 않는다. 가이드는 특정 프레임을 가리키고 싶을 때 `&frame=<인코딩한 frame id>`를 붙이라고 알린다.
- **읽기(TS)**: `parseOpenLink(url)` → `{root, canvas, frame?}` 또는 거절. 거절: scheme이 `doan:`이 아니거나 host가 `open`이 아님, 모르는 매개변수, 매개변수 중복·누락, 절대가 아니거나 `..`이 있는 root, `.doan/canvases|ds/*.html`(`/` 구분, `..` 없음) 밖의 canvas, 빈 frame, 길이 상한 초과(값은 구현에서 상수로 정한다).
- **공유 fixture**: Go가 만들고 TS가 읽으므로 `schema/fixtures/open-link/cases.json`을 두고 두 언어 테스트가 읽는다(선례: `schema/fixtures/brand/cases.json`, ARCHITECTURE §11 'Product-name fixtures'). 각 경우는 입력(root, path, frame?)과 기대 URL, 또는 거절할 URL이다. 형식이 아닌 테스트 데이터이므로 스키마는 두지 않는다.
- **등록**: electron-builder 설정(`app/package.json`의 `build`)에 `protocols`를 더해 패키지된 앱의 `Info.plist` `CFBundleURLTypes`에 `doan`을 넣는다. 개발 실행은 등록하지 않는다(`setAsDefaultProtocolClient`를 부르지 않는다).
- **받기(main)**: `app.on("open-url")`을 시작 초기, `ready` 전에 등록한다. Electron 45 `electron.d.ts`의 'open-url' 설명: `ready`에서 등록하면 앱을 띄운 URL을 놓친다. 앱이 켜져 있으면 macOS가 같은 인스턴스에 `open-url`을 보낸다(단일 인스턴스 잠금은 `app/src/main/index.ts`에 이미 있다).
- **대기**: 시작 중에 온 링크는 가장 마지막 하나만 들고 있다가, 시작 복원(PRODUCT §5 item 1 'Launch restores …')과 첫 폴더 목록이 끝난 뒤 처리한다. 복원한 화면 위로 링크의 캔버스가 열린다. 창을 닫아 숨긴 상태면 창을 보인다.
- **처리**: main이 `parseOpenLink`로 읽고, root가 등록된 root와 글자 그대로 같은지(ARCHITECTURE §4 'Selection ownership'과 같은 비교), canvas가 그 root 목록에 있는지 본다. 맞으면 주 창 renderer에 `{root, canvas, frame?}`을 보내고, renderer는 Quick Open과 같은 이동 경로로 캔버스를 연다. frame이 있으면 Quick Open의 프레임 이동처럼 뷰를 옮기고 강조만 하고 선택·패널·초안·`doan active`는 바꾸지 않는다. frame을 찾지 못하면 캔버스만 연다.
- **거절**: 형식 오류, 등록되지 않은 root, 목록에 없는 캔버스는 창을 보이고 짧은 안내만 띄운다. 문구(clarify 프리셋으로 정했다)는 모두 "Couldn’t open the link."로 시작하고(기존 "Couldn’t read conversations"·"Couldn’t stop …"과 같은 꼴) 이유를 한 문장 더한다:
  - 형식 오류: "Couldn’t open the link. It isn’t a Doan canvas link."
  - 등록되지 않은 root: "Couldn’t open the link. Its project isn’t in Doan. Add it from Add Projects, then open the link again." 링크는 프로젝트를 더하지 않으므로(아래 '이동만 한다') 사람이 할 다음 동작을 알린다.
  - 목록에 없는 캔버스: "Couldn’t open the link. The canvas isn’t in `<project>`." `<project>`는 사이드바의 프로젝트 이름이다. 옮겨졌는지 지워졌는지는 앱이 알 수 없으므로 원인을 말하지 않는다.
- **이동만 한다**: 링크는 쓰기, 보내기, 대화 시작, 프로젝트 추가, 설정 변경을 하지 않는다. 바뀌는 것은 일반 이동에 따라오는 기기 상태(마지막 화면, Back/Forward 기록, 배치 G의 캔버스 '봤다')뿐이다.

## Agent setup: Claude Code 허용 규칙

- Agent setup(`app/src/main/agentSetup/`)이 Claude Code 사용자 설정 파일의 `permissions.allow`에 `doan work start`·`doan work done` 허용 규칙을 더한다. Codex rule(`codexRuleText()`, `app/src/main/agentSetup/plan.ts`)과 같은 목적이다. 규칙 문자열은 설치된 Claude Code의 권한 규칙 문서로 확인해 정한다(기억으로 정하지 않는다).
- 대상 파일은 `~/.claude/settings.json`이다. 기존 provider 폴더 규칙대로 `~/.claude`가 있을 때만 쓰고(Doan은 provider 폴더를 만들지 않는다), 폴더가 있고 파일이 없으면 만든다. 의존 관계는 Codex rule과 같다: PATH에서 찾는 `doan`을 허용하므로 `current`와 `~/.local/bin/doan`이 준비돼야 쓴다.
- 쓰기 직전에 다시 읽고 합친다(`app/src/main/agentSetup/swap.ts`의 "쓰기 직전 다시 읽기" 규칙). Claude Code가 같은 파일을 쓰므로 통째로 덮어쓰지 않는다.
- ARCHITECTURE §7 'Agent setup'의 "The app never edits shell rc files or existing agent config files. Its only agent-config write is its own `~/.codex/rules/doan.rules`"가 이 쓰기로 바뀐다. Z1에서 현재 규칙으로 고친다.
- TS 순수 함수 `mergeClaudeAllow(text)`: 기존 JSON을 읽어 다른 키와 기존 allow 항목을 보존하고, 없는 규칙만 더한다. 같은 입력에 다시 적용해도 결과가 같다. 읽을 수 없거나 JSON이 깨졌거나 `permissions`·`allow`의 형태가 다르면 쓰지 않고, About의 agent setup 결과에 그 항목을 보인다(PRODUCT §5 item 0: Doan 것이 아닌 대상은 그대로 두고 About에 보인다).
- Cursor, Antigravity, Copilot은 사용자의 허용 설정에 따라 실행 허락을 물을 수 있다(받아들인 비용).

## 영향 받는 부분

- **CLI(Go)**: `cli/internal/cli/work.go`(새 명령), socket 클라이언트는 `active.go`의 runtime 읽기·연결 계약을 재사용, 가이드 `cli/internal/cli/skill.md`, exit 대응 `cli/internal/cli/envelope.go`는 바뀌지 않는다(`work`가 앱 오류를 성공으로 바꾼다).
- **형식**: `schema/app-socket.v3.schema.json`, `schema/fixtures/app-socket-v3/`, 두 검증기.
- **app main**: `runtime.ts` `answerLine`의 v3 분기, 활동 상태 모듈(새 파일), 폴더 갱신에서 변경 신호 받기(`index.ts`), renderer IPC, 두 환경 함수의 표시, Agent setup의 Claude 허용 규칙.
- **renderer**: 행 상태 자리 합성, Agent indicator의 터미널 변형, 'Terminal session' 선택지 비활성.
- **deep link**: `app/package.json` `build.protocols`, main의 `open-url` 처리와 대기(새 파일), renderer 이동, 공유 fixture `schema/fixtures/open-link/cases.json`.
- **eval**: `eval/lib/socket.ts` fake 앱의 v3 `work`, `eval/lib/types.ts` `CheckContext`의 `work()`, 새 시나리오.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Go `workTarget(root, path)`: 경로 판정(실제 경로, root 안, `.doan/canvases|ds/*.html`, 아직 없는 파일 허용, 심볼릭 링크로 밖을 가리키면 거부). 보낼 때는 `/` 구분 repo 상대 경로로 바꾼다.
- Go `workSession(claude, thread, legacy)`: 세션 식별 선택(위 '세션 식별').
- Go 응답 해석: 위 '오류 대응' 표의 각 경우 → `delivered`.
- TS `applyWork(state, message, now)`, `expireWork(state, now, lastChange)`: 시작·끝·만료(`start`와 파일 변경 중 늦은 것), 익명 세션, 두 세션이 같은 캔버스, 목록에 없는 경로, 상한, 등록되지 않은 root, 프로젝트 제거.
- TS 행 상태 자리 합성(출처, 우선순위, 같은 행에서 앱 대화 우선)과 터미널 슬롯의 여는 캔버스 고르기.
- TS `canvasAgent` 합성(앱 대화 우선, 터미널 변형, 앱 turn이 끝난 뒤 전환, 같은 경로 다른 worktree).
- TS 'Terminal session' 선택지 판정(연결 기록 세션이 작업 중이면 비활성).
- TS `mergeClaudeAllow(text)`.
- Go `canvasLink(root, path)`, TS `parseOpenLink(url)`: 공유 fixture `schema/fixtures/open-link/cases.json`.
- TS 링크 대기: 시작 중 받은 링크 중 마지막 것만 남기고, 준비된 뒤 한 번 처리.

## 규약 영향

- 가이드에 에이전트 규칙 하나를 더한다(캔버스 편집 전 `work start`, 응답을 끝내기 전에 고친 캔버스 경로와 함께 `work done`, 질문하려고 멈출 때도, 긴 작업 중에는 `start` 다시, `done` 결과의 링크를 마지막 답에 보이기). ARCHITECTURE §1 'Agent rules'에 올린다. `doan check` 규칙은 바뀌지 않는다.
- 가이드와 CLI가 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다. 새 시나리오의 check:
  - `start_before_edit`: 그 경로의 첫 `start` 시점에 파일이 seed와 같거나 없다.
  - `done_at_end`: 마지막 `done` 시점에 파일이 최종 내용과 같다.
  - `start_path`: `start` 경로가 바뀐 캔버스와 같다.
  - fake 앱(`eval/lib/socket.ts`)이 v3 `work`를 받고, 요청마다 받은 시점의 대상 캔버스 내용 해시를 기록한다. `CheckContext`(`eval/lib/types.ts`)에 `work()` 접근자를 더한다.
  - fail fixture: 편집 뒤 `start`, `done` 빠뜨림.
  - 마지막 답에 링크를 보였는지는 pass/fail check로 두지 않는다. ARCHITECTURE §14 'Check contract'는 답의 글이 아니라 호출 증거로 판정하므로, `rubric.md`에 적어 judge가 본다.
  - 실제 라운드 통과 기준: Claude Code와 Codex가 모두 통과. 아니면 가이드를 고쳐 다시 돈다.

## 결정 영향

- ARCHITECTURE §7 'Shell activity'의 "no provider transcripts, no activity text, no polling or store"는 그대로다. 에이전트가 직접 보내는 시작·끝 신호만 받는다. 'Shell activity'에 이 출처를 더한다.
- ARCHITECTURE §4: 앱이 필요한 명령에 `work`를 더한다(지금은 `active`와 `onboarding …`뿐). 앱이 없어도 실패하지 않는 첫 socket 명령이다. v3 Dispatch 분기를 적는다.
- ARCHITECTURE §7 'Agent setup'에 Claude 허용 규칙, 'Agent conversation runtime and IPC'에 `DOAN_APP_CONVERSATION` 표시를 더한다.
- ARCHITECTURE §12: `work` 명령, 결과 `{delivered}`, exit 예외.
- PRODUCT §3 Out of scope 4(자율 기동): 앱은 에이전트를 깨우지 않는다. 신호는 표시만 한다.
- PRODUCT §3 Out of scope 7과 'Association recording'은 바뀌지 않는다.
- PRODUCT §5 item 0 'Agent setup'에 Claude 허용 규칙을 더한다.
- PRODUCT §5 item 3 'Design navigation'에 'Deep links' 동작을 더한다. ARCHITECTURE §7에 scheme 등록·`open-url`·대기·IPC 절, §11에 `open-link` fixture, §12에 `work done`의 `links`를 더한다.
- **보안 경계**: 어느 웹 페이지든 `doan://` 링크를 열 수 있다. 그래서 링크는 등록된 root의 목록에 있는 캔버스로 이동만 하고, 쓰기·보내기·대화 시작·상태 변경을 하지 않는다. 나중에 링크에 동작을 더하려면 이 경계를 다시 정해야 한다. PRODUCT §3 Out of scope 4(자율 기동)도 그대로다: 링크는 에이전트를 깨우지 않는다.

## 참고: ego lite

- `ego-browser skill` v2.2.0(2026-11-02 확인): 에이전트가 `taskSpace(name)`으로 작업 단위를 열고, 끝나면 `task.finish()`를 정확히 한 번 부른다. space마다 `ownership`(agent/user)이 있고, `handOff()`·`takeOverTaskSpace()`로 사람과 주고받는다. 동작마다 `label`을 붙여 화면의 에이전트 커서 옆에 보인다. inactive space의 판정 규칙은 가이드에 없어 확인하지 못했다.
- ego는 모든 동작이 자기 API를 지나가므로 시작을 빠뜨릴 수 없다. Doan은 에이전트가 파일을 직접 고치므로 시작을 빠뜨릴 수 있고, 그 경우 지금과 같다.

## POSTMORTEM에서 가져온 함정

- 2026-10-31 "A linked default directory served its unconfigured target": 경로 판정은 실제 경로로 풀고 등록된 root 안인지 본다. 심볼릭 링크로 root 밖을 가리키는 경로는 거부한다.
- 2026-11-01 "The canvas agent indicator kept another worktree's conversation and its Stop": 표시 식별은 root + path다. 같은 경로를 가진 두 worktree 사이를 오가는 테스트를 둔다.
