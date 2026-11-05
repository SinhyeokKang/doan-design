# provider-usage — design

## 조사 결과(2026-11-05, 실행하지 않고 타입·스키마·번들·`--help`로 확인)

실제 응답은 다섯 provider 모두 확인하지 않았다. 로그인과 모델 호출, 아래 조회 어느 것도 실행하지 않았다. 근거 사본은 `.scratch/provider-usage/research/`(Codex 0.166.0 생성 스키마 `codex-schema/`, Orca 발췌 `orca-line2515.js`·`orca-agy.js`)에 있다.

| provider | 공식 로컬 경로 | 모양 | 상태 |
|---|---|---|---|
| Claude Code (SDK 0.3.312, 최소 CLI 2.1.284) | `Query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` = control request `get_usage` (`app/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3123-3140`) | `rate_limits_available`, `rate_limits.{five_hour, seven_day, seven_day_opus, seven_day_sonnet, …}: {utilization 0–100 \| null, resets_at ISO \| null}`, `subscription_type` (`sdk.d.ts:4400-`). API key·Bedrock·Vertex·scope 없음이면 `rate_limits: null`(`:4417`). 턴 중에는 `rate_limit_event`(`:5908`) | 실험 API. CLI 2.1.316–318 바이너리에 `get_usage` 문자열이 있다. 2.1.284에 있는지, 모델 요청 없이 읽히는지 확인하지 않음 |
| Codex (0.166.0, 최소 0.158.0) | app-server `account/rateLimits/read`, 알림 `account/rateLimits/updated` | `rateLimits: {primary?, secondary?: {usedPercent, windowDurationMins?, resetsAt? (unix s)}, planType?, limitName?, rateLimitReachedType?, …}`, `rateLimitsByLimitId?`, `ordinaryUsageAllowed?`("clients must not infer recovery from percentages") (`v2/GetAccountRateLimitsResponse.json`) | 실험 표시 없음. BACKLOG는 0.163.0에서 봤다고 적었다. 0.158.0은 확인하지 않음 |
| GitHub Copilot (1.0.105) | `@experimental` JSON-RPC `account.getQuota`(번들 SDK `copilot-sdk/generated/rpc.d.ts:7408-7473`) | `quotaSnapshots{[type]: {entitlementRequests, usedRequests, remainingPercentage, resetDate?, isUnlimitedEntitlement, …}}` | SDK의 `--headless --stdio` 서버 모드용이고 Doan이 쓰는 ACP 모드가 아니다. ACP에서 되는지 확인하지 않음 |
| Antigravity | Doan이 쓰는 고정 ACP 서버(`agentAuth/providers.ts:133-137`)에는 없음. Orca는 `agy -p /usage --output-format json`을 쓴다 | `groups[].buckets[]: {remaining_fraction, window: "5h" \| "weekly", reset_time}` (Orca 발췌) | Doan은 `agy`를 쓰지 않는다. `-p`가 모델 요청인지 확인하지 않음 |
| Cursor (2026.10.22) | 없음. `--help`에 usage·quota 명령이 없다. `status --format json` 출력은 확인하지 않음 | — | Orca는 토큰을 읽어 비공개 웹 API를 부른다(완료 조건 6 위반이라 쓰지 않음) |

참고(Orca 1.4.240, `/Applications/Orca.app/Contents/Resources/app.asar` `out/main/index.js:2514-2515`): Codex는 app-server `account/rateLimits/read`, Claude는 자격 증명의 access token으로 `api.anthropic.com/api/oauth/usage`를 직접 부르고, Copilot은 사용량을 보이지 않는다. Doan은 Claude·Cursor에서 Orca의 방식을 따를 수 없다(ARCHITECTURE §7 'Agent authentication' "never reads, copies or changes those external credentials").

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·guide·`doan check`·공유 JSON Schema는 바뀌지 않는다.

### 1. 조회(main, provider별)

- 새 모듈 `app/src/main/agentAuth/usage.ts`(이름은 `/tdd`에서 고정): provider별 조회 함수와 결과의 공통 모양.

  ```ts
  interface UsageWindow { id: string; label: string; usedPercent: number; resetsAt?: number /* epoch ms */ }
  type UsageReading =
    | { status: "ok"; windows: UsageWindow[]; readAt: number }
    | { status: "unavailable"; reason: "not_supported" | "no_plan_limits" | "read_failed"; readAt: number }
  ```

  - `usedPercent`는 0–100으로 자른다. 링은 `windows`에서 가장 큰 값을 보인다(완료 조건 2).
  - 창 이름(`label`)은 Doan이 정한 영문이다(예: "5-hour", "Weekly", "Weekly · Opus"). provider의 원래 키는 `id`에 둔다.
- **Claude**: 연결의 `CLAUDE_CONFIG_DIR`로 SDK `query`를 열고(대화 runner와 같은 환경, `agentAuth/environment.ts:13`), `initializationResult()` 뒤에 usage control request를 부른 다음 닫는다. 모델 목록 조회(`runners.ts:296-304` `supportedModels`)와 같은 자리다. `rate_limits_available: false`이면 `no_plan_limits`. 실험 API라 응답 모양을 엄격히 검증하고, 모르는 모양은 `read_failed`로 읽는다. PoC U1.
- **Codex**: `codexEmail`(`agentAuth/manager.ts:697-735`)처럼 app-server를 띄워 `initialize` → `initialized` → `account/rateLimits/read` → 종료. `primary`·`secondary`를 창으로 읽고 `windowDurationMins`로 이름을 붙인다(300 → "5-hour", 10080 → "Weekly", 그 밖 → "<n>-hour"/"<n>-day"). PoC U2.
- **Copilot**: `copilot --headless --stdio`를 Doan의 Copilot 프로필(`HOME`)로 띄워 `account.getQuota`를 부르고 닫는다. `quotaSnapshots`의 각 종류를 창으로 읽는다(`usedPercent = 100 - remainingPercentage`, `isUnlimitedEntitlement`면 창에서 뺀다). PoC U3.
- **Antigravity**: 결정할 점 4. 출력 `groups[].buckets[]`의 `window`("5h"·"weekly")와 `1 - remaining_fraction`을 창으로 읽는다. PoC U4.
- **Cursor**: 결정할 점 3. PoC U5.

### 2. 캐시와 lease(main)

- 새 `UsageStore`(main 메모리, provider별 마지막 `UsageReading`). 디스크에 쓰지 않는다(완료 조건 7).
- 연결 revision(`agentAuth/ipc.ts`의 `changed` 스냅샷)이 바뀌어 sign-in·sign-out·교체가 보이면 그 provider 항목을 지운다(완료 조건 5).
- 조회는 연결의 lease를 잡는다. 용도는 `"listing"`과 같이 sign-out이 묻지 않고 멈추게 하는 쪽이다(POSTMORTEM 2026-10-30 'A model list read made sign-out ask to stop conversations'). 새 용도 `"usage"`를 둘지, `"listing"`을 같이 쓸지는 `/tdd`에서 정한다.
- 같은 provider 조회가 이미 진행 중이면 새로 띄우지 않고 그 결과를 기다린다. 조회 시간 제한은 provider 프로세스가 `initialize`에 답한 시점부터 센다(POSTMORTEM 2026-11-01 Antigravity sign-in).
- 턴 중 신호: Claude `rate_limit_event`와 Codex `account/rateLimits/updated`가 대화 runner에 오면 그 값으로 캐시를 고칠 수 있지만 이번에는 넣지 않는다. 턴이 끝난 뒤의 조회(결정할 점 2)가 같은 때를 덮는다.

### 3. IPC

- `agent-usage:read`(main window only, `senderAllowed.ts`): provider별 캐시를 돌려주고, 결정할 점 2의 규칙에 맞으면 새 조회를 시작한다. `agent-usage:changed`: 캐시가 바뀔 때 renderer에 보낸다.
- connection ID, 프로필 경로, 계정 ID, 진단 글은 창에 보내지 않는다(ARCHITECTURE §7 'Agent authentication' readiness 규칙과 같음).

### 4. UI(renderer)

- 링 버튼: 연결한 provider 순서(Settings > Agents의 순서)대로 링을 놓는다. 링 가운데에 `providerLogo(provider)`(`homeComposer.ts:187`). 버튼 하나의 접근 가능한 이름은 "Agent usage"이고, 각 링의 값은 이름 뒤에 붙인다(예: "Agent usage: Claude Code 42% used, Codex 80% used").
- 자리: BACKLOG의 세 후보 — 앱 셸 오른쪽 아래에 세로로(콘텐츠 패널 오른쪽의 좁은 자리), 헤더 오른쪽 끝에 가로로(`App.tsx:1822-1832` `TopBar`, `.shell-modes` 옆), 앱 셸 오른쪽 아래에 가로로. `/design-draft`가 세 자리를 모두 그리고 사람이 하나를 고른다.
- 자세한 내용: popover(`doan-menu`/popover 관례는 `/design-draft`에서 정함). provider마다 로고, 이름, 창별 막대와 "42% used · resets in 2h 10m", 마지막으로 읽은 시각. `unavailable`이면 이유 한 줄.
- 링 색: 사용 비율 구간에 따른 색 변화를 둘지는 `/design-draft`에서 그려 보고 사람이 정한다. 색 왼쪽 선은 쓰지 않는다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `claudeUsage(response)` → `UsageReading`: 창 고르기와 이름, `utilization` null 처리, `rate_limits_available: false`, 모르는 모양 거부.
2. `codexUsage(response)` → `UsageReading`: `primary`·`secondary`, `windowDurationMins` 이름, `resetsAt` 초 → ms, `rateLimitsByLimitId` 무시 여부.
3. `ringValue(reading)` → `number | null`: 가장 큰 `usedPercent`, unavailable이면 null.
4. `usageText(window, now)` → "42% used · resets in 2h 10m": 상대 시간, 지난 시각, `resetsAt` 없음.
5. `shouldRead(entry, now, trigger)` → boolean: 결정할 점 2의 규칙(5분 간격, 진행 중 조회, 창이 보이는지, 계기 종류).
6. `UsageStore`의 revision에 따른 지우기.
7. 링 버튼의 접근 가능한 이름 만들기.

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11): 없다.
- 저장 포맷: 없다(메모리만).
- fixture: PoC U1·U2의 실제 응답에서 개인 정보(계정 ID, plan 이름 외의 값)를 지운 `app/src/main/agentAuth/fixtures/claude-usage.json`, `codex-rate-limits.json`과 `README.md`의 출처. Go는 읽지 않는다.

## 관례 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. `/agent-eval`은 필요 없다(guide·CLI 출력·skill stub이 그대로).

## 결정 영향

- **외부 자격 증명을 읽지 않음**(ARCHITECTURE §7 'Agent authentication'): 지킨다. 터미널·Orca의 credential은 읽지 않는다. Doan vault의 Cursor credential만 결정할 점 3의 좁은 예외로 쓴다. 이 예외는 Z1에서 ARCHITECTURE의 Antigravity identity 예외 옆에 같은 형식으로 적는다.
- **readiness는 polling하지 않음**(ARCHITECTURE §7: "there is no polling"): readiness 규칙이고 사용량 조회에 그대로 걸리지는 않는다. 사용량도 주기 polling은 하지 않고 정한 계기에만 읽는다(결정할 점 2).
- **Copilot 상태 확인이 모델 요청 하나를 씀**(ARCHITECTURE §7 `verifyByRun`): 사용량 조회는 모델 요청을 쓰지 않는다(완료 조건 4). 모델 요청을 써야만 읽히는 provider는 넣지 않는다.

## PoC 의존

모두 사람의 승인과 로그인한 Doan 연결이 필요하다(실제 HOME의 Keychain, 이 기기의 공용 프로필 `.scratch/provider-profile/userData`를 agent-questions D1·D2와 함께 쓸 수 있음).

- **U1 Claude**: Doan과 같은 `query` 옵션으로 연 세션에서 usage control request가 (a) 모델 요청 없이 답하는지, (b) 응답 모양과 실제 창 키, (c) 최소 CLI 2.1.284에서도 있는지(SDK 동봉 CLI와 설치본), (d) Pro·Max 등 계정 종류에 따른 `rate_limits_available`. 없는 버전에서는 `not_supported`로 읽는다.
- **U2 Codex**: `account/rateLimits/read`가 (a) 0.158.0과 0.166.0에서 답하는지, (b) 실제 `primary`·`secondary`의 `windowDurationMins`, (c) 모델 요청이 아닌지, (d) `account/rateLimits/updated`가 대화 턴 중 오는지.
- **U3 Copilot**: `copilot --headless --stdio`로 Doan 프로필(`HOME`)에서 `account.getQuota`가 모델 요청 없이 답하는지, Doan 연결 credential로 되는지. ACP 모드에서 같은 메서드가 되는지.
- **U4 Antigravity**: 설치된 `agy`(이 기기 1.4.9)를 Doan의 Antigravity 프로필로 띄워 `/usage`가 (a) Doan 연결 credential로 되는지(Doan의 ACP 서버와 `agy`가 같은 credential 저장을 읽는지), (b) 모델 요청이 아닌지, (c) 프로필에 무엇을 쓰는지(전후 비교), (d) 최소 버전.
- **U5 Cursor**: Doan vault의 Cursor credential에서 access token을 꺼내는 방법(파일 위치와 모양), Orca가 부르는 엔드포인트의 응답 모양, 계정 플랜(지금 계정은 "Upgrade your plan"에 막혀 있다, agent-questions P3)에 따른 차이. `cursor-agent status --format json`에 사용량이 있으면 그쪽을 먼저 쓴다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A model list read made sign-out ask to stop conversations'**: 새 lease는 용도를 고른다. 사용량 조회가 sign-out의 `stop_required`에 잡히지 않게 한다.
- **2026-11-01 Antigravity sign-in**: 부하에서 ACP `initialize`가 약 30초 걸린다. 시간 제한은 `initialize` 답부터 센다.
- **2026-10-29 cancelled replacement**: 연결이 이미 있을 때 provider 명령이 프로필에 무엇을 쓰는지 먼저 읽는다. 사용량 조회가 프로필을 바꾸지 않는지 PoC에서 전후 비교한다.
- **2026-10-30 Packaged-app probes**: 격리한 HOME에는 Keychain이 없어 Codex keyring을 읽지 못한다. PoC는 실제 HOME의 Doan 프로필로 한다.

## 읽은 design preset

`doan design-skill --json`(목록), `shape`.

## 결정할 점

1. **provider 범위: 다섯 모두 시도한다.** Claude(SDK usage)와 Codex(`account/rateLimits/read`)는 구현한다. Copilot(`--headless --stdio`의 `account.getQuota`), Antigravity(`agy`), Cursor(웹 API, 결정 3)는 PoC U3–U5가 모델 요청 없이 읽힘을 보이면 구현하고, 그렇지 않으면 "Usage isn't available"로 둔다.
2. **읽는 때**: 앱 시작과 그 provider의 sign-in 뒤 한 번, 그 provider의 턴이 끝난 뒤, 자세한 내용(popover)을 열 때. 같은 provider는 마지막 조회에서 5분이 지나야 다시 읽는다(popover를 열 때도 같은 간격). 창이 보일 때만 읽는다. 주기 polling은 하지 않는다.
3. **Cursor는 Orca처럼 웹 API로 읽는다.** ARCHITECTURE §7 'Agent authentication'의 토큰 예외(지금은 Antigravity identity)를 'Cursor usage 읽기'로만 넓힌다: Doan vault의 Cursor credential에서 access token을 main 메모리에서만 꺼내, 읽기 전용 GET(`cursor.com/api/usage-summary` 등, Orca 1.4.240 `out/main/index.js:2514-2515`)만 보낸다. 토큰을 저장·로그·창으로 보내지 않는다. 비공개 API라 모양이 다르거나 실패하면 `read_failed`. Claude는 SDK 조회가 있으므로 Orca의 토큰 직접 호출을 쓰지 않는다.
4. **Antigravity는 설치된 `agy`가 있을 때만** 읽는다. 로그인 셸 PATH에서 찾은 `agy`를 Doan의 Antigravity 프로필(`HOME`·`GEMINI_HOME`, `agentAuth/environment.ts:36`)로 `agy -p /usage --output-format json`으로 띄우고(Orca와 같이 `AGY_CLI_DISABLE_AUTO_UPDATE=true`, 최소 버전은 PoC U4), 없으면 `not_supported`. Doan은 `agy`를 내려받지 않는다.
