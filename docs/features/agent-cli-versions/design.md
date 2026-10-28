# agent-cli-versions — design

작성: 2026-10-28. feature-review 반영(2026-10-28). [spec](./spec.md)의 완료 조건을 어떻게 만족할지 정리한다.

## 영향 받는 구성 요소

- **앱 main(TS)만** 바뀐다.
  - `app/src/main/conversation/sessions.ts`: `SUPPORTED_VERSIONS`·`supportedRuntime`. `sessionAvailability`도 같은 비교를 쓰지만 프로덕션 호출처는 없고 테스트만 쓴다.
  - `app/src/main/conversation/prepare.ts`: legacy 준비의 버전 거부(40–41행, resume 미리보기 `ipc.ts:33`도 이 경로), `ACP_VERSIONS`·`supportedVersion`, Doan 연결 준비의 버전 거부(145행)
  - `app/src/main/conversation/io.ts`: `claudeOccupancy`의 registry `version` 비교(76행), `CODEX_ROLLOUT_VERSIONS`(91·115행)
  - `app/src/main/conversation/service.ts`: `Prepared`에 비호환 기록·해제 클로저 추가
  - `app/src/main/conversation/runners.ts`(Codex)·`acpRunner.ts`: handshake 판정과 클로저 호출
  - `app/src/main/agentAuth/facts.ts`·`state.ts`·`types.ts`·`ipc.ts`: tool facts의 내부 설치 버전, readiness 순서, actions, 기록 보관, `check` 분기
  - `app/src/main/index.ts`(612–624행): AuthIpc와 `createAccountPrepare` 연결
  - 관련 테스트, `app/src/main/conversation/fixtures/README.md`, 버전을 말하는 코드 주석(`io.ts:86–90`, `prepare.ts:90–91·108–110`)
- CLI(Go)·`doan mcp`·skills·공유 형식(comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket)은 바뀌지 않는다. 대화 index v2·event v1·auth metadata v1·vault v1도 그대로다.

## 버전 정책

| 대상 | 규칙 | 값 |
|---|---|---|
| Claude Code CLI(설치본) | 최소 버전 이상 | 2.1.312 |
| Agent SDK(번들 의존성) | 정확히 일치. 실행 시점 검사가 아니라 테스트 불변식이다(아래) | 0.3.312 |
| Codex CLI | 최소 버전 이상 | 0.164.0 |
| Cursor CLI | 최소 버전 이상 | 2026.10.22 |
| Copilot CLI | 최소 버전 이상 | 1.0.105 |
| Antigravity ACP 서버 | 정확히 일치. Doan이 sha를 검사해 내려받으므로 자동 업데이트로 어긋나지 않는다. 인증 경로의 `initialize` `agentInfo.version` 검사(`agentAuth/manager.ts:392–397`)도 유지한다 | 1.3.0 |
| Codex rollout 헤더 `cli_version` | 고정 하한 이상. Doan이 지원한 가장 오래된 Codex이다 | 0.163.0 |
| Claude registry `version` | 고정 하한 이상(2026-10-28 사용자 확정) | 2.1.312 |

- **최소 버전의 기록 위치**: 한 상수 `MINIMUM_VERSIONS`(지금 `SUPPORTED_VERSIONS` 자리)에 둔다. `ACP_VERSIONS`는 이 상수로 합친다. 두 하한은 별도 상수다. 공급자별 규칙 엔진·설정 파일·원격 목록은 만들지 않는다.
- **SDK 고정**: 지금 `supportedRuntime`은 상수 `BUNDLED_CLAUDE_SDK`(`prepare.ts:15`)와 상수 `SUPPORTED_VERSIONS.claudeSdk`를 실행마다 비교할 뿐이다. 실제 고정은 `prepare.test.ts:70–71`이 한다. 실행 시점의 `sdkVersion` 인자를 없애고, SDK 상수 하나와 `app/package.json`·설치된 SDK 버전이 같다는 테스트 불변식으로 남긴다.
- **최소 버전 올리기**: 결정으로만 올린다. 근거는 새 최소 버전에서 그 공급자의 실제 앱 확인이다(로그인 유지, 새 대화, 재개, 권한 요청 1회). PRODUCT §6에 날짜와 함께 남기고 §7에 한 줄을 추가한다. 최소를 올려도 두 하한은 따라 올리지 않는다. 하한을 올리는 것은 그 이전 버전이 만든 대화나 열린 터미널의 재개를 포기하는 별도 결정이다. 2026-10-28의 누적 목록 규칙("목록에서 빼는 것은 별도 결정")을 하한으로 옮긴 것이다.
- **왜 하한을 따로 두는가**:
  - Codex는 rollout을 재개해도 첫 `session_meta`의 `cli_version`을 다시 쓰지 않는다(POSTMORTEM 2026-10-27 follow-up). 0.163.0이 만든 대화가 0.164.0에서 재개된 것은 실제 앱에서 관찰됐다(PRODUCT §6 2026-10-28 agent-auth 항목). 최소 이상 어떤 버전이든 rollout을 만들 수 있으므로 열거 목록으로는 자기 대화를 다시 찾지 못한다.
  - Claude registry record는 Doan이 실행한 CLI뿐 아니라 그 프로필의 모든 터미널 Claude 프로세스가 쓴다. record 하나가 검사에 걸리면 그 프로필의 재개 전체가 `unknown`이 되므로(`io.ts:70–76`), 최소를 올린 뒤에도 남아 있는 이전 버전 터미널이 재개 전체를 막지 않게 한다.

### 버전 문자열 해석 (2026-10-28 사용자 확정)

- `--version` 출력에서 첫 `\d+\.\d+\.\d+`를 core로 읽고 숫자 세 개로 비교한다(`0.99.0` < `0.164.0`). 네 CLI의 실제 출력(`2.1.312 (Claude Code)`, `codex-cli 0.164.0`, `2026.10.22-27dcf5f`, `GitHub Copilot CLI 1.0.105.`)은 모두 이 규칙으로 읽힌다.
- core 바로 뒤의 `-<접미사>`는 비교하지 않는다. 대신 core+접미사 문자열(설치 버전)을 비호환 기록의 키로 쓴다. 그래서 같은 core의 다른 Cursor 빌드는 다른 설치 버전이다.
- core를 찾지 못하면 `unknown`이다. readiness는 `version_unknown` → retry, 실행은 지금처럼 거부한다.
- 저장된 필드(rollout `cli_version`, registry `version`)는 출력 검색이 아니다. 전체 문자열이 `x.y.z` 또는 `x.y.z-<접미사>`여야 하고(`v0.164.0`, `0.164.0 x`는 거부), core로 하한과 비교한다.
- legacy 준비의 정규식(`prepare.ts:40`)과 Doan 연결의 정규식(`prepare.ts:95`)을 이 함수 하나로 대체한다.

## 실행 시점 호환성 검사 (2026-10-28 사용자 확정)

원칙: **새 세션 handshake에서 Doan이 읽는 프로토콜 형식이 맞지 않는다는 명시적 증거**만 비호환이다. 한 번의 일시적 실패나 대화 하나의 문제가 그 버전의 공급자 전체를 막지 않게 하려는 것이다.

| 공급자 | 기록하는 증거(새 세션 실행만) | 오류 코드(현재 코드 유지) |
|---|---|---|
| Codex | `initialize`가 JSON-RPC error를 돌려주거나 결과가 객체가 아니다. `thread/start` 결과에 `thread.id`가 없다(`runners.ts:58`) | `initialize`는 지금처럼 `transportError` 매핑, `thread/start`는 `session_unavailable` |
| Cursor·Copilot | ACP `initialize` 결과가 객체가 아니거나 `protocolVersion !== 1`이다(`acpRunner.ts:73`). 필요한 auth method가 없다(78행). `session/new` 결과에 session ID가 없다(83–84행) | `runtime_unsupported`(73·78행), `session_unavailable`(84행) |

- **기록하지 않는 것**:
  - Claude. Doan은 `initializationResult()`의 필드를 읽지 않는다(`runners.ts:126`). 0.3.310의 `control_request_failed` errorClass는 `sdk.d.ts`에 문서화돼 있지 않다. 초기화 실패는 사용자 훅·플러그인·설정 때문에도 난다. 새 CLI가 SDK 인자를 거부하고 바로 종료하는 경우는 `process_exited`로 남는다. 이 한계를 Known limits에 쓴다.
  - Antigravity. `openAcp`는 Antigravity와 공용이므로 `input.runtime`으로 대상을 Cursor·Copilot에 한정한다.
  - 재개(`thread/resume`, `session/load`)와 ACP `loadSession` capability 없음(`acpRunner.ts:75`). 다운그레이드한 CLI로 새 버전 rollout을 재개하는 경우처럼 대화 하나의 문제일 수 있기 때문이다.
  - 턴 중 오류. Codex `failProtocol`에는 RPC 시간 초과(`dispatcher.ts:25`), 쓰기 실패(`dispatcher.ts:27·58·80`), 버퍼·큐 한도(`runners.ts:35·39`)가 함께 들어온다. 모르는 서버 요청은 지금처럼 unsupported로 답한다(`dispatcher.ts:43·79`).
  - legacy external 실행. 사용자 자신의 프로필·훅·config를 쓰고 readiness 배선도 없다(`createPrepare`에 콜백 없음, `index.ts:624`). legacy는 최소 버전 규칙만 같이 쓴다.
  - 프로세스 종료, 시간 초과, `not_logged_in`, `rate_limited`, `session_in_use`, `credential_override`.
- **순서**: 기록 클로저는 오류를 던지기 전에 동기적으로 부른다. 클로저가 기록하고 `changed()`를 발행한 뒤에야 IPC 거부가 반환된다. 프로세스 그룹 정리와 예약 해제 순서는 바꾸지 않는다.

## 기록과 readiness

- **소유자**: AuthIpc가 공급자별 비호환 설치 버전 하나(`Map<Provider, string>`)를 메모리에 둔다. 디스크에 저장하지 않으므로 앱을 다시 시작하면 사라진다.
- **전달**: `createAccountPrepare`가 145행에서 읽은 설치 버전을 묶은 클로저 두 개를 `Prepared`에 담는다. `incompatible()`은 기록하고, `compatible()`은 같은 버전의 기록을 지운다. 기존 `confirm` 클로저(`prepare.ts:172`, `acpRunner.ts:112`)와 같은 방식이다. Codex 서버는 send 사이에 재사용되므로 서버를 연 Prepared의 버전이 쓰인다.
- **기록**: 위 표의 증거가 나오면 `incompatible()` → AuthIpc가 기록하고 `changed()`를 직접 부른다. probe 결과가 같아도 발행된다(`refresh`의 JSON 비교를 거치지 않는다).
- **해제**(2026-10-28 사용자 확정):
  - 실행 준비가 기록과 다른 설치 버전을 읽으면 지우고 `refreshTools`를 부른다. 예를 들어 Cursor가 스스로 업데이트한 경우다.
  - Doan 연결 실행에서 `initialize`가 통과하고, 새 세션이면 `thread/start`·`session/new`까지 통과하면 `compatible()`로 지운다.
  - 앱 재시작.
- **기록은 실행을 막지 않는다**: prepare는 기록을 보지 않는다. 같은 버전이어도 다음 실행은 handshake를 다시 시도한다.
- **적용 시점**: `snapshot()`이 `authStatus`를 만들 때 적용한다. facts의 설치 버전이 기록과 같으면 version을 `incompatible`로 본다. 그래서 기록 전에 시작한 `refresh`가 늦게 끝나도 비호환이 ready로 덮이지 않는다.
- **ToolFacts**: `version`에 `"incompatible"`을 더하고, 내부 필드 `installed?: string`(core+접미사)를 더한다. `installed`는 Status DTO에 나가지 않는다(`authStatus`가 필드별로 DTO를 만든다).
- **readiness 순서**: `cli_missing` → install, `version_unsupported` → update(**최소보다 낮을 때만**), `version_unknown` → retry, `version_incompatible` → retry, 이후는 지금과 같다(`busy` → wait …).
- **actions**: readiness cause가 `version_unknown`·`version_incompatible`이면 `actions`에 `retry`를 더한다. 지금 `actions()`는 state만 보므로 `authStatus`에서 readiness와 함께 정한다.
- **check 분기**(2026-10-28 사용자 확정): 그 공급자의 readiness cause가 버전 원인이면 `agent-auth:check`는 facts만 다시 읽는다. `backend.check`(상태 확인, Copilot은 모델 요청 1회)는 부르지 않는다. 응답은 시도가 없으므로 기존 `AuthReply`의 `{ok: true}`이고 결과는 `changed`로 온다. 그 밖의 경우는 지금과 같다(`ipc.ts:78–81`).

## 세션 형식 검사

- Codex: `codexSessionExists`의 `CODEX_ROLLOUT_VERSIONS.includes(...)`를 "헤더 `cli_version`이 형식에 맞고 core가 하한 0.163.0 이상"으로 바꾼다. 형식이 맞지 않으면 존재하지 않는 것이다. 유일한 regular rollout, 첫 줄 `session_meta`, ID·canonical cwd 일치 조건은 그대로다.
- Claude: `claudeOccupancy`의 `raw.version !== SUPPORTED_VERSIONS.claude`를 "형식에 맞고 core가 하한 2.1.312 이상"으로 바꾼다. 하한 미만 record는 지금처럼 그 프로필 전체를 `unknown`(재개 불가, fail closed)으로 만든다. 이 동작은 테스트로 고정한다. 나머지 필드 검증과 PID/start 확인, 모르는 파일 이름이 하나라도 있으면 `unknown`인 규칙(`io.ts:70–72`)도 그대로다.
- ACP: 세션 디렉터리·파일 존재와 최종 `session/load` 승인은 그대로다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `parseCliVersion(output)` → `{core, installed} | null`: 네 CLI의 실제 출력, 접미사(`-27dcf5f`, `-beta.1`, `+build`), 접미사 없는 Cursor, 앞줄에 다른 버전이 있는 출력(첫 match를 쓴다는 사실 고정), 자릿수 비교.
2. `versionStatus(provider, output)` → `"supported" | "unsupported" | "unknown"`: 최소 미만·같음·초과, 해석 불가는 `unknown`, Antigravity는 거치지 않음.
3. `storedVersionAtLeast(value, floor)`: 전체 문자열 형식, 하한 미만·같음·초과. `codexSessionExists`와 `claudeOccupancy`가 쓴다. 불변식: Codex 하한 ≤ Codex 최소, Claude registry 하한 ≤ Claude 최소, SDK 상수 = `app/package.json` 버전.
4. handshake 판정: Codex `initialize`(error·비객체)·`thread/start`, ACP `initialize`·auth method·`session/new` → `incompatible | ok`. 재개·종료·시간 초과·`session_in_use`·`loadSession` 없음·Antigravity가 `incompatible`이 되지 않는다.
5. readiness·actions·기록 적용: `version_incompatible`의 순서, 버전 원인의 `retry` action, 기록과 facts 설치 버전의 일치·불일치.

## 형식 변경

공유 JSON Schema(ARCHITECTURE §11)와 `v`는 바뀌지 않는다. TS 내부 타입 `ToolFacts`·`ReadinessCause`·`Prepared`와 IPC Status DTO의 `readiness.cause` 값(`version_incompatible`), 버전 원인의 `actions`(`retry`)가 바뀐다. 아직 이 값을 쓰는 UI가 없고 buzz-onboarding이 첫 소비자이다. buzz-onboarding이 계획한 app-socket v2가 readiness를 CLI로 내보낸다면 그 fixture에 이 값을 포함해야 한다(그쪽 F6 소관).

## 관례 영향

ARCHITECTURE §1 Conventions와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **바뀌는 결정**: 마지막 작업에서 새 행으로 대체를 기록하고 기존 행은 지우지 않는다.
  - PRODUCT §3 'Agent conversation foundation contract'의 "These exact versions are the supported implementation baseline ... not an approved semver range"와 "Unknown versions/protocols refuse ... until verified"
  - PRODUCT §7 2026-10-27 agent-conversation D1 행의 "exact verified versions only, no unverified range"
  - PRODUCT §7 2026-10-28 `CODEX_ROLLOUT_VERSIONS` 누적 목록 행
  - ARCHITECTURE §7 Transport 항목, Agent authentication 표의 "Supported version" 열, Versions 항목, readiness 순서, IPC errors 문단, Known limits의 "a different installed version blocks that provider's runs until Doan pins it"
- **유지되는 결정**: fail closed(검증할 수 없는 버전·registry·PID는 여전히 재개 불가), 자동 fork·takeover 없음, SDK 바이너리 대체 없음, CLI 자동 설치 없음(Antigravity 예외 유지), 권한 설정 강제 없음. 최소 이상 새 버전에서 Doan이 모르는 요청은 지금처럼 명시적 오류로 답한다.
- **IPC errors 계약 추가**: `runtime_unsupported`·`session_unavailable`은 여러 원인이 공유한다. 소비자는 공급자 readiness로 원인을 정한다. 비호환은 거부가 반환되기 전에 readiness에 반영돼 있다. 지금 `not_logged_in`에 있는 같은 규칙을 넓힌 것이다.
- **받아들이는 위험** (Known limits에 쓴다):
  - 형식은 맞지만 의미가 바뀐 새 버전은 검사로 잡지 못한다. 예를 들어 권한 선택지의 의미가 바뀐 경우다.
  - 출력 문구에 기대는 분류(`PIN_REFUSED` → `credential_override`, 로그인 링크 형식)는 새 버전에서 기존 일반 코드로 떨어질 수 있다.
  - Claude 비호환은 기록되지 않는다.
  - 새 Claude가 `sessions/`에 모르는 파일을 하나 더 만들면 그 프로필의 재개가 모두 막히고 기록되지 않는다.
  - 사전 탐지가 없으므로 비호환 공급자도 첫 실행 전까지는 ready로 보인다.

## PoC 의존

없다. PRODUCT §6의 미통과 가정에 기대지 않는다. 최소보다 새 버전의 실제 실행은 증거가 없는 상태로 남긴다(spec 완료 조건 9).

## POSTMORTEM에서 가져온 함정

- **2026-10-27 — A session association was mistaken for stored Codex session presence**: "require one bounded, regular, no-follow rollout whose first `session_meta` identifies the requested session and canonical cwd ... Exhausted bounds and uncertain evidence mean unavailable." 하한 비교로 바꿔도 헤더 버전은 존재 증거 조건 중 하나일 뿐이며 다른 조건을 완화하지 않는다. follow-up: "the header keeps the creating version when a newer Codex resumes the rollout, so the list must not follow the installed version alone." 하한이 설치 최소를 따라 올라가지 않는 이유다.
- **2026-10-27 — Protocol readiness lagged behind process and turn ownership**: 비호환 기록이 프로세스 그룹 정리·예약 해제 순서를 바꾸지 않아야 한다. 기록은 판정과 같은 자리에서 동기적으로 하고, 소유권 해제는 지금처럼 그룹이 사라진 것을 관찰한 뒤에 한다.
- **2026-10-27 — SDK process death reached failure classification before group release**: "classify only observed exits paired with the supported SDK's `process_exited_nonzero` or `process_killed_by_signal` error class." Claude를 기록 대상에서 뺀 이유 중 하나다. 종료를 비호환으로 오인하지 않는다.
- **2026-10-27 — Codex ingress confused unowned requests and notification errors**: 모르는 서버 요청과 알림 오류는 명시적 오류 응답이나 프로토콜 실패로 처리된다. 이것은 handshake 증거가 아니므로 기록하지 않는다. `failProtocol`을 비호환 기록 지점으로 쓰지 않는 이유다.
