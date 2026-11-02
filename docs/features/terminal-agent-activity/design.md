# terminal-agent-activity — design

## 흐름

1. 가이드가 에이전트에게 알린다: 캔버스를 고치기 전에 `doan work start <path>`(여러 캔버스면 여러 번), 작업과 `doan check`가 끝나면 `doan work done`.
2. CLI는 세션 식별자(`CLAUDE_CODE_SESSION_ID`, 또는 `CODEX_THREAD_ID`·`CODEX_SESSION_ID`. `cli/internal/cli/sessions.go`와 같은 규칙)와 repo root, 캔버스 경로를 app socket으로 보낸다. 식별자가 없으면(다른 provider) root마다 하나의 익명 세션으로 본다.
3. 앱 main은 세션별 작업 중 캔버스 집합을 메모리에 두고 renderer에 보낸다.
4. renderer는 그 집합을 사이드바 행 상태 자리의 '작업 중'과 캔버스 페이지의 Agent indicator에 쓴다.

## 명령

- `doan work start <canvas path> [--repo <path>] [--json]`: 경로는 repo 안의 `.doan/canvases/*.html` 또는 `.doan/ds/*.html`이어야 한다(아직 없어도 된다). 그 밖이면 `usage_error`.
- `doan work done [--repo <path>] [--json]`: 이 세션의 집합을 비운다.
- 두 명령 모두 앱이 없거나 socket 오류이면 성공 envelope에 `delivered: false`를 싣고 exit 0이다. 에이전트 작업을 막지 않는 것이 목적이다. 짧은 시간 제한을 둔다.
- `doan check`와 다른 `doan` 명령은 세션의 마지막 신호 시각만 갱신한다(아래 만료). 별도 전송이 필요한지는 T0에서 정한다. 필요하면 이미 socket을 쓰는 경로만 쓴다.

## 상태 규칙

- 세션 상태: `start`가 캔버스를 집합에 더한다. `done`이 집합을 비운다.
- 만료: 세션의 마지막 신호와 집합 안 캔버스 파일의 마지막 변경(mtime) 중 늦은 것에서 5분이 지나면 집합을 비운다. 숫자는 `/agent-eval` 실행에서 편집 사이 간격을 보고 조정한다.
- 아직 목록에 없는 경로는 집합에 남겨 두고, 목록에 나타나면 표시한다.
- 앱 자신의 대화: 앱이 시작한 세션의 식별자에서 온 신호는 버린다.
- 상태는 메모리에만 둔다. 앱을 다시 켜면 비어 있다.

## 표시

- 사이드바: 행 상태 자리의 우선순위는 권한 요청 > 작업 중(앱 대화 또는 터미널) > 안 본 끝·안 본 캔버스다. 터미널 작업 중은 앱 대화의 작업 중과 같은 스피너이고, 놓이는 자리 규칙(캔버스 행, 화면 밖이면 프로젝트 행)도 같다. 터미널 작업 중 슬롯을 누르면 그 캔버스를 연다.
- 캔버스 페이지: Agent indicator를 재사용한다. glow·dot field와 notice를 보이고 Stop은 두지 않는다. notice 문구는 clarify 프리셋으로 정한다. 앱 대화가 같은 캔버스에서 작업 중이면 앱 대화의 indicator가 이긴다.

## 영향 받는 부분

- **CLI(Go)**: `cli/internal/cli/work.go`(새 명령), socket 클라이언트 재사용(`active`와 같은 경로), 가이드 `cli/internal/cli/skill.md`.
- **형식**: app socket에 `work` 요청을 더한다. `schema/app-socket.v3.schema.json`(v2를 확장하는 새 버전)과 TS·Go가 함께 읽는 fixture를 둔다. v1·v2는 그대로다. CLI 응답 envelope의 `work` 결과 모양도 스키마에 둔다.
- **app main**: socket 서버의 v3 `work` 처리, 활동 상태 모듈(새 파일), renderer로 보내는 IPC.
- **renderer**: 행 상태 자리 합성(알림 dot 배치의 `canvasNotice`와 같은 자리), Agent indicator의 Stop 없는 변형.
- **Agent setup**: 바뀌지 않는다. Codex는 기존 Doan rule로 `doan` 명령을 sandbox 밖에서 묻지 않고 실행한다. 다른 provider는 사용자의 허용 설정에 따라 실행 허락을 물을 수 있다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Go `workTarget(root, path)`: 경로 판정(실제 경로, root 안, `.doan/canvases|ds/*.html`, 아직 없는 파일 허용, 심볼릭 링크로 밖을 가리키면 거부).
- Go 세션 식별자 선택(sessions.go 규칙 재사용).
- TS `applyWork(state, message, now, ownSessions)`, `expireWork(state, now, mtimes)`: 시작·끝·만료·앱 자신의 세션 무시·두 세션이 같은 캔버스.
- TS 행 상태 자리 우선순위 합성(터미널 작업 중 포함).

## 형식 변경

- `app-socket.v3`: 요청 `work`(`action: start|done`, `session?`, `provider?`, `root`, `path?`). 응답은 빈 성공. 스키마 원본은 `schema/`, fixture는 `schema/fixtures/app-socket-v3/`(valid·invalid). 기존 v1·v2는 바꾸지 않는다.

## 규약 영향

- 가이드에 에이전트 규칙 하나를 더한다(캔버스 편집 전 `work start`, 끝나면 `work done`). ARCHITECTURE §1 'Agent rules'에 올린다. `doan check` 규칙은 바뀌지 않는다.
- 가이드와 CLI가 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다. 시작·끝 호출을 재는 시나리오를 더한다.

## 결정 영향

- ARCHITECTURE §7 'Shell activity'의 "no provider transcripts, no activity text, no polling or store"는 그대로다. 에이전트가 직접 보내는 시작·끝 신호만 받는다. 'Shell activity'에 이 출처를 더한다.
- ARCHITECTURE §4: socket이 필요한 명령에 `work`를 더한다(지금은 `active`와 `onboarding …`뿐). 앱이 없어도 실패하지 않는 첫 socket 명령이다.
- PRODUCT §3 Out of scope 4(자율 기동): 앱은 에이전트를 깨우지 않는다. 신호는 표시만 한다.
- PRODUCT §5 item 0 'Agent setup'은 바뀌지 않는다.

## 참고: ego lite

- `ego-browser skill` v2.2.0(2026-11-02 확인): 에이전트가 `taskSpace(name)`으로 작업 단위를 열고, 끝나면 `task.finish()`를 정확히 한 번 부른다. space마다 `ownership`(agent/user)이 있고, `handOff()`·`takeOverTaskSpace()`로 사람과 주고받는다. 동작마다 `label`을 붙여 화면의 에이전트 커서 옆에 보인다. inactive space의 판정 규칙은 가이드에 없어 확인하지 못했다.
- ego는 모든 동작이 자기 API를 지나가므로 시작을 빠뜨릴 수 없다. Doan은 에이전트가 파일을 직접 고치므로 시작을 빠뜨릴 수 있고, 그 경우 지금과 같다.

## PoC 의존

- T0: 실제 터미널 에이전트(Claude Code, Codex)가 가이드만 보고 `work start`·`done`을 부르는지, 앱 자신의 대화에서 세션 식별자를 걸러낼 수 있는지(앱 대화의 Bash 도구에도 같은 환경 변수가 있는지) 확인한다. `/agent-eval` 시나리오로 잰다(T9).

## POSTMORTEM에서 가져온 함정

- 2026-10-31 "A linked default directory served its unconfigured target": 경로 판정은 실제 경로로 풀고 등록된 root 안인지 본다. 심볼릭 링크로 root 밖을 가리키는 경로는 거부한다.
