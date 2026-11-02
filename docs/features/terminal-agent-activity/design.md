# terminal-agent-activity — design

## 흐름

1. Agent setup이 Claude Code 사용자 설정(`$CLAUDE_CONFIG_DIR/settings.json`, 없으면 `~/.claude/settings.json`)의 `hooks`에 doan 항목을 넣는다. 명령은 `~/.local/bin/doan hook claude`다.
2. hook 이벤트: `UserPromptSubmit`(턴 시작), `PreToolUse`(편집 도구: 파일 경로가 있는 도구), `Stop`(턴 끝), `SessionEnd`. hook은 stdin JSON(`session_id`, `cwd`, `hook_event_name`, `tool_input`)을 받는다. 정확한 필드와 이벤트 이름은 T0 PoC로 설치된 버전에서 확인한다.
3. `doan hook claude`는 stdin을 읽어 활동 메시지 하나를 만들고 app socket에 보낸다. 짧은 시간 제한 안에 보내고, 실패하든 성공하든 출력 없이 exit 0으로 끝난다. 파일에 아무것도 쓰지 않는다.
4. 앱 main은 활동 메시지를 받아 세션별 상태를 갱신하고, 세션이 지금 고치는 캔버스 집합을 renderer에 보낸다.
5. renderer는 그 집합을 사이드바 행 상태 자리의 '작업 중'과 캔버스 페이지의 Agent indicator에 쓴다.

## 상태 규칙

- 세션 상태: `UserPromptSubmit`로 턴이 열린다. 같은 턴의 `PreToolUse`가 캔버스 파일 경로를 가리키면 그 캔버스가 세션의 작업 중 집합에 들어간다. `Stop`·`SessionEnd`로 집합이 비워진다.
- 캔버스 판정: 도구 입력의 파일 경로를 실제 경로로 풀어 등록된 root 안의 `.doan/canvases/*.html` 또는 `.doan/ds/*.html`이면 캔버스다. 그 밖의 경로와 Bash 명령은 캔버스를 정하지 않는다.
- 만료: 세션의 마지막 신호 뒤 10분 동안 신호가 없으면 그 세션의 집합을 비운다(크래시나 강제 종료로 `Stop`이 오지 않는 경우). 숫자는 T0 PoC에서 긴 도구 호출 간격을 보고 정한다.
- 앱 자신의 대화: 앱이 시작한 Claude 세션의 `session_id`에서 온 신호는 버린다. 앱 대화의 '작업 중'은 지금처럼 앱 자신의 상태에서 나온다.
- 상태는 메모리에만 둔다. 앱을 다시 켜면 비어 있다.

## 표시

- 사이드바: 행 상태 자리의 우선순위는 권한 요청 > 작업 중(앱 대화 또는 터미널) > 안 본 끝·안 본 캔버스다. 터미널 작업 중은 앱 대화의 작업 중과 같은 스피너이고, 놓이는 자리 규칙(캔버스 행, 화면 밖이면 프로젝트 행)도 같다. 터미널 작업 중 슬롯을 누르면 그 캔버스를 연다.
- 캔버스 페이지: Agent indicator를 재사용한다. 터미널 세션이 이 캔버스를 고치는 동안 glow·dot field와 notice를 보이고 Stop은 두지 않는다. notice 문구는 clarify 프리셋으로 정한다(예: 터미널 에이전트가 고치고 있음을 알리는 짧은 문장). 앱 대화가 같은 캔버스에서 작업 중이면 앱 대화의 indicator가 이긴다.
- 캔버스 행이 화면에 보이면 스피너는 그 행에만 뜬다.

## Agent setup

- 설정 파일 병합: JSON을 읽어 `hooks`의 이벤트별 배열에 doan 항목을 더하거나 고친다. doan 항목은 명령 경로로 알아본다. 다른 항목, 키 순서 밖의 내용, 사용자의 다른 hook은 보존한다. 이미 같은 항목이 있으면 파일을 다시 쓰지 않는다(mtime 유지).
- 쓰기: 임시 파일 + rename, 원래 권한 유지. 설정 파일이 없으면 만든다. JSON이 깨졌거나 읽을 수 없으면 건너뛰고 About의 결과에 항목·경로·할 일을 보인다(PRODUCT §5 item 0의 기존 규칙).
- 설치 범위는 지금 Agent setup과 같다: `/Applications` 또는 `~/Applications`에서 연 패키지 앱만. 개발 실행은 쓰지 않는다.
- 앱 자신의 Claude 프로필(agent-auth)은 별도 설정 디렉터리이므로 hook을 넣지 않는다. 그래도 프로필이 사용자 설정을 읽는 경우에 대비해 위 `session_id` 필터를 둔다.

## 영향 받는 부분

- **CLI(Go)**: `cli/internal/cli/hook.go`(새 명령 `doan hook claude`), socket 클라이언트 재사용(`active`와 같은 경로).
- **형식**: app socket에 활동 요청을 더한다. `schema/app-socket.v3.schema.json`(v2를 확장하는 새 버전)과 TS·Go가 함께 읽는 fixture를 둔다. v1·v2 요청은 그대로다.
- **app main**: socket 서버의 새 요청 처리, 활동 상태 모듈(새 파일), renderer로 보내는 IPC, Agent setup의 설정 병합.
- **renderer**: 행 상태 자리 합성(알림 dot 배치 G의 `canvasNotice`와 같은 자리), 캔버스 페이지 Agent indicator의 Stop 없는 변형.
- **skills**: 가이드 변경 없음.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `hookActivity(payload, roots)`: hook stdin JSON → 활동 메시지 또는 없음(캔버스 경로 판정 포함). Go.
- `mergeClaudeHooks(settings, doanPath)`: 설정 JSON 병합(추가·갱신·이미 있음·깨진 입력). TS.
- `applyActivity(state, message, now, ownSessions)`, `expireActivity(state, now)`: 세션 상태 갱신과 만료, 캔버스 집합 계산. TS.
- 행 상태 자리 우선순위 합성(터미널 작업 중 포함). TS.

## 형식 변경

- `app-socket.v3`: 요청 `activity`(`provider`, `session`, `event`, `cwd`, `path?`). 응답은 빈 성공. 스키마 원본은 `schema/`, fixture는 `schema/fixtures/app-socket-v3/`(valid·invalid). 기존 v1·v2는 바꾸지 않는다.

## 규약 영향

- ARCHITECTURE §1 Conventions와 `doan check` 규칙은 바뀌지 않는다.
- 새 CLI 명령 `doan hook`은 사람이나 에이전트가 직접 부르는 명령이 아니다. 가이드에 싣지 않는다. CLI help에는 내부용이라고 적는다.

## 결정 영향

- ARCHITECTURE §7 'Shell activity'의 "no activity text, no polling or store"는 그대로다: transcript를 읽지 않고, 활동 내용(문장)을 다루지 않으며, 폴링이나 저장도 하지 않는다. hook이 보내는 사건만 받는다. 이 feature는 'Shell activity'에 "hook이 보내는 실시간 활동"을 새 출처로 더한다.
- PRODUCT §5 item 0 'Agent setup'은 링크와 Codex rule만 쓴다. Claude Code 사용자 설정에 hook을 쓰는 것을 더한다(Z1에서 갱신).
- PRODUCT §5 item 1 행 상태 자리와 'Agent indicator'에 터미널 작업 중을 더한다.
- PRODUCT §3 Out of scope 4(자율 기동): 앱은 에이전트를 깨우지 않는다. hook은 표시만 한다.

## PoC 의존

- T0: 설치된 Claude Code(최소 2.1.312)에서 hook 이벤트 이름, stdin 필드, `CLAUDE_CONFIG_DIR`을 따르는 설정 경로, 편집 도구의 `tool_input` 경로 필드, `Stop`이 턴마다 오는지, 긴 도구 호출 사이 간격을 확인한다. 사용자 로그인은 그대로 쓰고 hook은 `--settings`로 넘긴 임시 파일에만 둔다. 사용자 `settings.json`은 건드리지 않는다(사용자 승인).
- T0b: Codex(최소 0.164.0)에 hook에 해당하는 기능(턴 시작·도구 호출·턴 끝)이 있는지 확인한다. 없으면 Codex는 비목표로 옮긴다.

## POSTMORTEM에서 가져온 함정

- 2026-10-31 "A linked default directory served its unconfigured target": 경로 판정은 실제 경로로 풀고 등록된 root 안인지 본다. 심볼릭 링크로 root 밖을 가리키는 경로는 캔버스가 아니다.
- Agent setup 관련 항목(About 결과, 사용자 HOME 격리): 실행 검증은 임시 HOME·`CLAUDE_CONFIG_DIR`에서만 한다(AGENTS.md 'Commands'의 패키지 앱 격리 규칙).
