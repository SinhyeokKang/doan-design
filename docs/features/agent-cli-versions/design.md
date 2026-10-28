# agent-cli-versions — design

작성: 2026-10-28. [spec](./spec.md)의 완료 조건을 어떻게 만족할지 정리한다.

## 영향 받는 구성 요소

- **앱 main(TS)만** 바뀐다.
  - `app/src/main/conversation/sessions.ts`: `SUPPORTED_VERSIONS`·`supportedRuntime`·`sessionAvailability`의 정확한 비교
  - `app/src/main/conversation/prepare.ts`: `ACP_VERSIONS`·`supportedVersion`, legacy·Doan 연결 준비의 버전 거부(41행, 145행)
  - `app/src/main/conversation/io.ts`: `claudeOccupancy`의 registry `version` 비교, `CODEX_ROLLOUT_VERSIONS`
  - `app/src/main/conversation/runners.ts`·`acpRunner.ts`: 호환성 실패 분류와 기록 호출
  - `app/src/main/agentAuth/facts.ts`·`state.ts`·`types.ts`: tool facts와 readiness 순서
  - 관련 테스트와 `app/src/main/conversation/fixtures/README.md`
- CLI(Go)·`doan mcp`·skills·공유 형식(comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket)은 바뀌지 않는다. 대화 index v2·event v1·auth metadata v1·vault v1도 그대로다.

## 버전 정책

| 대상 | 규칙 | 값 |
|---|---|---|
| Claude Code CLI(설치본) | 최소 버전 이상 | 2.1.312 |
| Agent SDK(번들 의존성) | 정확히 일치. Doan이 `app/package.json`에 고정하므로 사용자 환경에서 바뀌지 않는다 | 0.3.312 |
| Codex CLI | 최소 버전 이상 | 0.164.0 |
| Cursor CLI | 최소 버전 이상. `-<hex>` 빌드 접미사는 비교하지 않는다 | 2026.10.22 |
| Copilot CLI | 최소 버전 이상 | 1.0.105 |
| Antigravity ACP 서버 | 정확히 일치. Doan이 sha를 검사해 내려받으므로 자동 업데이트로 어긋나지 않는다. `initialize`의 `agentInfo.version` 검사도 유지한다 | 1.3.0 |
| Codex rollout 헤더 `cli_version` | 하한 이상. 하한은 Doan이 지원한 가장 오래된 Codex이다 | 0.163.0 |
| Claude registry `version` | 최소 버전 이상 | Claude Code 최소와 같음 |

- **최소 버전의 기록 위치**: 한 상수 `MINIMUM_VERSIONS`(`sessions.ts` 또는 기존 상수 자리)에 둔다. `SUPPORTED_VERSIONS`·`ACP_VERSIONS`는 이 상수와 SDK 정확 버전으로 대체한다. 공급자별 규칙 엔진·설정 파일·원격 목록은 만들지 않는다.
- **최소 버전 올리기**: 결정으로만 올린다. 근거는 새 최소 버전에서 그 공급자의 실제 앱 확인(로그인 유지, 새 대화, 재개, 권한 요청 1회)이고, PRODUCT §6에 날짜와 함께 남기고 §7에 한 줄을 추가한다. 최소를 올려도 Codex rollout 하한은 따라 올리지 않는다. 하한을 올리는 것은 그 이전 버전이 만든 대화를 포기하는 별도 결정이다. 2026-10-28의 누적 목록 규칙("목록에서 빼는 것은 별도 결정")을 하한으로 옮긴 것이다.
- **왜 Codex만 별도 하한인가**: Codex는 rollout을 재개해도 첫 `session_meta`의 `cli_version`을 다시 쓰지 않는다(POSTMORTEM 2026-10-27 follow-up). 최소 버전 정책에서는 최소 이상 어떤 버전이든 rollout을 만들 수 있으므로 열거 목록으로는 자기 대화를 다시 찾지 못한다.

### 버전 문자열 해석

- `--version` 출력에서 첫 `\d+\.\d+\.\d+`를 core로 읽고 숫자로 비교한다. 지금 정규식(`prepare.ts` `supportedVersion`)과 같은 위치에서 찾는다.
- 뒤에 `-`가 붙으면: Cursor는 빌드 해시이므로 무시한다. 다른 공급자는 prerelease로 보고, core가 최소와 같으면 최소보다 낮은 것으로 판정한다(semver 순서). core가 최소보다 크면 받아들인다.
- core를 찾지 못하면 `unknown`이다. 지금처럼 readiness는 `version_unknown` → retry, 실행은 거부한다.

## 실행 시점 호환성 검사

원칙: **Doan이 읽는 프로토콜 형식이 맞지 않는다는 명시적 증거**만 비호환이다. 프로세스 종료·시간 초과·로그인·rate limit·`session_in_use`·세션 없음은 기존 코드를 유지하고 기록하지 않는다. 한 번의 일시적 실패가 같은 버전 동안 공급자를 막지 않게 하려는 것이다.

| 공급자 | 비호환 증거 | 실행 결과 |
|---|---|---|
| Claude | SDK `initializationResult()`가 control protocol 오류로 거부되거나 형식이 맞지 않는 결과를 낸다. 단, `credential_override`(PIN_REFUSED)·`not_logged_in`·프로세스 종료 분류가 우선한다 | 새 세션 `runtime_unsupported`, 저장된 대화 `session_unavailable` |
| Codex | `initialize` 응답이 객체가 아니거나, `thread/start`·`thread/resume` 응답에 `thread.id`가 없거나, 수락 전 stdout이 JSON-RPC로 해석되지 않는다. `already has an active writer`는 `session_in_use`로 남는다 | 같음 |
| Cursor·Copilot | ACP `initialize`가 객체가 아니거나 `protocolVersion !== 1`이거나, 필요한 auth method가 없거나, `session/new` 응답에 session ID가 없다. `session/load` 실패는 세션 없음으로 보고 기록하지 않는다 | 같음(`acpRunner.ts` 73·78행의 기존 거부에 기록만 추가) |
| Antigravity | 기록하지 않는다. 서버가 Doan의 고정 다운로드이므로 불일치는 설치 손상이고 기존 재검증 경로를 탄다 | 기존과 같음 |

- **수락 뒤의 형식 오류**: Codex는 수락 후 형식이 맞지 않는 메시지를 지금처럼 `turn.failed` `session_unavailable`로 끝낸다(`failProtocol`). 이때도 비호환을 기록한다. event의 오류 코드는 바꾸지 않는다.
- **Claude 신호 확인**: 설치된 SDK 0.3.312가 control protocol 오류를 프로세스 종료와 구분해 노출하는지 `/tdd` 전에 SDK 타입·소스에서 확인한다. 구분할 수 없으면 Claude는 형식이 맞지 않는 `initializationResult()`만 기록하고, 이 한계를 ARCHITECTURE Known limits에 쓴다. 새 CLI가 SDK 인자를 거부하고 바로 종료하는 경우는 `process_exited`로 남는다.

## readiness와 기록

- `ToolFacts.version`에 `"incompatible"`을 더한다. `ReadinessCause`에 `version_incompatible`을 더하고 action은 `retry`이다(2026-10-28 사용자 확정).
- readiness 순서: `cli_missing` → install, `version_unsupported` → update(**최소보다 낮을 때만**), `version_unknown` → retry, `version_incompatible` → retry, 이후는 지금과 같다(`busy` → wait …).
- 기록: main이 공급자별로 `{version}` 하나를 메모리에 둔다. 실행 준비가 읽은 core+접미사 문자열을 실행기 실패까지 넘겨 기록한다. Doan 연결과 legacy external 경로 모두 기록한다. 두 경로 모두 로그인 셸 PATH에서 같은 CLI를 찾기 때문이다.
- 해제: tool facts를 다시 읽어 버전이 기록과 다르면 기록을 지운다. 앱을 다시 시작하면 사라진다. 디스크에 저장하지 않는다. retry는 facts를 다시 읽을 뿐 기록을 지우지 않으므로, 같은 버전이면 계속 `version_incompatible`이다.
- facts 재조회 시점: 지금은 실행이 CLI 없음·미지원 버전을 만나면 `toolsFailed(provider)`로 다시 읽는다. 비호환 기록도 같은 경로로 readiness 변경 이벤트(`agent-auth:changed`)를 낸다. 폴링은 추가하지 않는다.
- Status DTO 형태는 그대로이고 `readiness.cause`의 값만 늘어난다. 설치 버전·최소 버전 숫자는 노출하지 않는다.

## 세션 형식 검사

- Codex: `codexSessionExists`의 `CODEX_ROLLOUT_VERSIONS.includes(...)`를 "헤더 `cli_version`의 core가 하한 0.163.0 이상"으로 바꾼다. 해석할 수 없는 값은 존재하지 않는 것이다. 유일한 regular rollout, 첫 줄 `session_meta`, ID·canonical cwd 일치 조건은 그대로다.
- Claude: `claudeOccupancy`의 `raw.version !== SUPPORTED_VERSIONS.claude`를 "해석 가능하고 Claude 최소 이상"으로 바꾼다. 최소보다 낮은 터미널이 남긴 record는 지금처럼 `unknown`(재개 불가, fail closed)이다. 나머지 필드 검증과 PID/start 확인은 그대로다.
- ACP: 세션 디렉터리·파일 존재와 최종 `session/load` 승인은 그대로다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `parseCliVersion(provider, output)` → `{core, suffix} | null`: Cursor 빌드 해시, prerelease, 앞뒤 텍스트(`codex-cli 0.164.0`, `GitHub Copilot CLI 1.0.105.`, `2.1.312 (Claude Code)`), 숫자 자릿수 비교(`0.99.0` < `0.164.0`).
2. `versionStatus(provider, output)` → `"supported" | "unsupported" | "unknown"`: 최소 미만·같음·초과, prerelease 경계, Antigravity 제외.
3. `codexRolloutAccepted(cliVersion)`: 하한 미만·같음·초과·해석 불가. `MINIMUM_VERSIONS.codex`가 하한 이상이라는 불변식 테스트(지금 `prepare.test.ts`가 목록에 현재 버전이 있는지 고정하는 것을 대체).
4. 호환성 분류: Codex `initialize`·`thread/*` 응답 검사, ACP `initialize`·`session/new` 검사, Claude 초기화 결과 검사 → `incompatible | 기존 코드`. 종료·시간 초과·`session_in_use`·`credential_override`가 비호환으로 분류되지 않는지.
5. readiness: `version_incompatible`의 위치(순서)와 기록 해제 규칙(같은 버전 유지, 다른 버전 해제).

## 형식 변경

공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. `v`도 그대로다. TS 내부 타입 `ToolFacts`·`ReadinessCause`와 IPC Status DTO의 `readiness.cause` 값에 `version_incompatible`이 추가된다. 아직 이 값을 쓰는 UI가 없고, buzz-onboarding이 첫 소비자이다. buzz-onboarding이 계획한 app-socket v2가 readiness를 CLI로 내보낸다면 그 fixture에 이 값을 포함해야 한다(그쪽 tasks 소관).

## 관례 영향

ARCHITECTURE §1 Conventions와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- 바뀌는 결정: PRODUCT §3 'Agent conversation foundation contract'의 "These exact versions are the supported implementation baseline ... not an approved semver range"와 "Unknown versions/protocols refuse ... until verified", §7 2026-10-28의 `CODEX_ROLLOUT_VERSIONS` 누적 목록 행, ARCHITECTURE §7의 Transport 항목·Agent authentication 표의 "Supported version" 열·Versions 항목·readiness 순서·Known limits의 "a different installed version blocks that provider's runs until Doan pins it". 마지막 작업에서 새 행으로 대체를 기록하고 기존 행은 지우지 않는다.
- 유지되는 결정: fail closed(검증할 수 없는 버전·registry·PID는 여전히 재개 불가), 자동 fork·takeover 없음, SDK 바이너리 대체 없음, CLI 자동 설치 없음(Antigravity 예외 유지), 권한 설정 강제 없음. 최소 이상 새 버전에서 Doan이 모르는 요청은 지금처럼 명시적 오류로 답한다(`runners.ts`의 unsupported/unowned 처리).
- 받아들이는 위험: 형식은 맞지만 의미가 바뀐 새 버전(예: 권한 선택지 의미 변화, 오류 문구 변화로 `credential_override` 판정 누락)은 검사로 잡지 못한다. 출력 문구에 기대는 분류(`PIN_REFUSED`, 로그인 링크 형식)는 새 버전에서 기존 일반 코드로 떨어질 수 있다. 이것을 Known limits에 쓴다.

## PoC 의존

없다. PRODUCT §6의 미통과 가정에 기대지 않는다. 최소보다 새 버전의 실제 실행은 증거가 없는 상태로 남긴다(spec 완료 조건 7).

## POSTMORTEM에서 가져온 함정

- **2026-10-27 — A session association was mistaken for stored Codex session presence**: "require one bounded, regular, no-follow rollout whose first `session_meta` identifies the requested session and canonical cwd ... Exhausted bounds and uncertain evidence mean unavailable." 하한 비교로 바꿔도 헤더 버전은 존재 증거 조건 중 하나일 뿐이며 다른 조건을 완화하지 않는다. follow-up: "the header keeps the creating version when a newer Codex resumes the rollout, so the list must not follow the installed version alone." 하한이 설치 최소를 따라 올라가지 않는 이유다.
- **2026-10-27 — Protocol readiness lagged behind process and turn ownership**: 호환성 실패를 기록하는 지점이 프로세스 그룹 정리·예약 해제 순서를 바꾸지 않아야 한다. 기록은 실패 분류와 같은 자리에서 동기적으로 하고, 소유권 해제는 지금처럼 그룹이 사라진 것을 관찰한 뒤에 한다.
- **2026-10-27 — SDK process death reached failure classification before group release**: "classify only observed exits paired with the supported SDK's `process_exited_nonzero` or `process_killed_by_signal` error class." Claude 비호환 분류는 이 종료 분류보다 뒤에 둔다. 종료를 비호환으로 오인하지 않는다.
