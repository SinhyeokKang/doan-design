# provider-usage — design

용어: **한도 창**은 provider의 rate limit 창(5시간, 주간 등)이다. **앱 창**은 Doan의 창이다. 둘을 "창"으로 줄여 쓰지 않는다.

## 조사 결과(2026-11-05, 실행하지 않고 타입·스키마·번들·`--help`로 확인)

실제 응답은 다섯 provider 모두 확인하지 않았다. 로그인과 모델 호출, 아래 조회 어느 것도 실행하지 않았다. 근거 사본은 `.scratch/provider-usage/research/`에 있다: Codex 0.166.0 생성 스키마 `codex-schema/`, Orca 발췌 `orca-line2515.js`(`orca-agy.js`는 같은 파일의 사본).

| provider | 공식 로컬 경로 | 모양 | 상태 |
|---|---|---|---|
| Claude Code (SDK 0.3.312, 최소 CLI 2.1.284) | `Query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({skipBehaviors})` = control request `get_usage` (`app/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3123-3140`) | `rate_limits_available`, `rate_limits.{five_hour, seven_day, seven_day_opus, seven_day_sonnet, …}: {utilization 0–100 \| null, resets_at ISO \| null}`, `subscription_type` (`sdk.d.ts:4400-`). API key·Bedrock·Vertex·scope 없음이면 `rate_limits: null`(`:4417`). 턴 중에는 `rate_limit_event`(`:5908`) | 실험 API. CLI 2.1.316–318 바이너리에 `get_usage` 문자열이 있다. 2.1.284에 있는지, 모델 요청 없이 읽히는지 확인하지 않음 |
| Codex (0.166.0, 최소 0.158.0) | app-server `account/rateLimits/read`, 알림 `account/rateLimits/updated` | `rateLimits: {primary?, secondary?: {usedPercent, windowDurationMins?, resetsAt? (unix s)}, planType?, limitName?, rateLimitReachedType?, …}`, `rateLimitsByLimitId?`, `ordinaryUsageAllowed?`("clients must not infer recovery from percentages") (`v2/GetAccountRateLimitsResponse.json`) | 실험 표시 없음. BACKLOG는 0.163.0에서 봤다고 적었다. 0.158.0은 확인하지 않음 |
| GitHub Copilot (1.0.105) | `@experimental` JSON-RPC `account.getQuota`(번들 SDK `copilot-sdk/generated/rpc.d.ts:7408-7473`) | `quotaSnapshots{[type]: {entitlementRequests, usedRequests, remainingPercentage, resetDate?, isUnlimitedEntitlement, …}}` | SDK의 `--headless --stdio` 서버 모드용이고 Doan이 쓰는 ACP 모드가 아니다. ACP에서 되는지 확인하지 않음 |
| Antigravity | Doan이 쓰는 고정 ACP 서버(`agentAuth/providers.ts:131-137`)에는 없음. Orca는 `agy -p /usage --output-format json`을 쓴다 | `groups[].buckets[]: {remaining_fraction, window: "5h" \| "weekly", reset_time}` (Orca 발췌) | Doan은 `agy`를 쓰지 않는다. `providers.ts:131-132`: dedicated HOME에서 `agy`의 keyring 저장이 Keychain 대화상자를 띄워 ACP 서버로 바꿨다. `-p`가 모델 요청인지 확인하지 않음 |
| Cursor (2026.10.22) | CLI에는 없음(`--help`에 usage·quota 명령 없음, `status --format json` 출력은 확인하지 않음). Orca는 토큰을 Cookie로 넣고 Origin·Referer를 dashboard로 맞춰 `cursor.com`의 엔드포인트 셋을 부른다 | Orca 발췌 | 결정할 점 3의 좁은 예외로 하나만 쓴다 |

참고(Orca 1.4.240, `/Applications/Orca.app/Contents/Resources/app.asar` `out/main/index.js:2514-2515`): Codex는 app-server `account/rateLimits/read`, Claude는 자격 증명의 access token으로 `api.anthropic.com/api/oauth/usage`를 직접 부르고, Copilot은 사용량을 보이지 않는다. Doan은 Claude에서 Orca의 방식을 따르지 않는다(SDK 조회가 있다).

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·guide·`doan check`·공유 JSON Schema는 바뀌지 않는다.

### 1. 조회(main, provider별)

- 새 모듈 `app/src/main/agentAuth/usage.ts`(이름은 `/tdd`에서 고정): provider별 조회 함수와 결과의 공통 모양. 타입은 type-only 모듈에 두어 renderer가 import한다(`rendererImports.test.ts`).

  ```ts
  interface UsageWindow { id: string; label: string; usedPercent: number; resetsAt?: number /* epoch ms */; limited?: true }
  type UsageReading =
    | { status: "ok"; windows: UsageWindow[]; unlimited?: true; readAt: number }
    | { status: "unavailable"; reason: "not_supported" | "no_plan_limits" | "read_failed"; readAt: number }
  // renderer가 받는 항목. connection이 쓸 수 없는 상태면 reading 대신 그 이유(Settings > Agents와 같은 원인 코드)를 받는다.
  interface UsageEntry { provider: Provider; reading?: UsageReading; inFlight: boolean; blocked?: ReadinessCause }
  ```

  - `usedPercent`는 0–100으로 자른다.
  - `limited`는 provider가 한도에 닿았다고 직접 말할 때만 둔다(Codex `rateLimitReachedType`, Copilot `usageAllowedWithExhaustedQuota: false`이면서 남은 비율 0 등, PoC가 고정). 비율에서 추론하지 않는다(Codex 스키마 "clients must not infer recovery from percentages").
  - `unlimited`는 모든 한도 창이 무제한일 때(Copilot `isUnlimitedEntitlement`)만 둔다. 이때 `windows`는 비어 있다.
  - 한도 창 이름(`label`)은 Doan이 정한 영문이다(예: "5-hour", "Weekly", "Weekly · Opus"). provider의 원래 키는 `id`에 둔다.
- 최소 버전에 조회가 없을 때: 버전 번호로 나누지 않는다(ARCHITECTURE §7 "no per-version feature gating"). 조회가 `Method not found`나 모르는 control request로 답하면 `not_supported`로 읽는다. 최소 버전은 올리지 않는다.
- **Claude**:
  - 턴 끝: 그 대화 runner의 열린 `Query`에서 usage를 부른다(새 프로세스 없음).
  - 앱 시작·sign-in·popover: 연결의 `CLAUDE_CONFIG_DIR`(`agentAuth/environment.ts:13`)로 SDK `query`를 Doan 소유의 빈 작업 폴더(userData 아래, repo가 아님)를 `cwd`로 열고, `initializationResult()` 뒤에 `usage_…({skipBehaviors: true})`를 부른 다음 닫는다. repo를 `cwd`로 쓰지 않는 이유: 그 repo 설정의 `apiKeyHelper` 같은 pin이 `credential_override`를 낼 수 있다. 모델 목록 조회의 진입점은 `app/src/main/conversation/runners.ts:31-34` `listModels`, `supportedModels`는 `:323`이다.
  - `rate_limits_available: false`이면 `no_plan_limits`. 실험 API라 응답 모양을 엄격히 검증하고, 모르는 모양은 `read_failed`. PoC U1.
- **Codex**:
  - 턴 끝: 대화 사이에도 살아 있는 그 대화의 app-server(ARCHITECTURE §7)에 `account/rateLimits/read`를 보낸다.
  - 앱 시작·sign-in·popover: `codexEmail`(`agentAuth/manager.ts:694-735`)처럼 app-server를 띄워 `initialize` → `initialized` → `account/rateLimits/read` → 종료.
  - `primary`·`secondary`를 한도 창으로 읽고 `windowDurationMins`로 이름을 붙인다(300 → "5-hour", 10080 → "Weekly", 그 밖 → "<n>-hour"/"<n>-day"). `rateLimitsByLimitId`와 `ordinaryUsageAllowed`는 이번에 읽지 않는다. PoC U2.
- **Copilot**: `copilot --headless --stdio`를 Doan의 Copilot 프로필(`HOME`)로 띄워 `account.getQuota`를 부르고 닫는다. `quotaSnapshots`의 각 종류를 한도 창으로 읽는다(`usedPercent = 100 - remainingPercentage`, `isUnlimitedEntitlement`면 빼고, 모두 빠지면 `unlimited`). PoC U3.
- **Antigravity**: 결정할 점 4. 출력 `groups[].buckets[]`의 `window`("5h"·"weekly")와 `1 - remaining_fraction`을 한도 창으로 읽는다. PoC U4.
- **Cursor**: 결정할 점 3. PoC U5.
- 쓸 수 없는 연결(sign-in 만료, 확인 안 됨, CLI 버전 미달 등 `readiness()`가 쓸 수 없다고 하는 상태)은 조회하지 않고 `blocked`에 그 원인을 담는다(결정할 점 5).

### 2. 캐시와 lease(main)

- 새 `UsageStore`(main 메모리, provider별 마지막 `UsageReading`). 디스크에 쓰지 않는다(완료 조건 7). 앱을 다시 시작하면 비어 있고, 앱 시작 계기가 다시 읽는다.
- 키는 provider와 `connectionId`다(모델 목록 캐시와 같은 방식, ARCHITECTURE §7). 연결이 바뀌면(sign-in·sign-out·교체로 `connectionId`가 바뀜) 그 provider 항목을 지운다. 전체 snapshot revision(`agentAuth/ipc.ts:51,69`)은 check·facts에도 오르므로 기준으로 쓰지 않는다.
- 조회 시작 때의 `connectionId`와 끝날 때의 것이 다르면 그 결과는 버린다(교체 중 옛 계정의 값이 새 계정에 붙지 않게).
- 조회는 연결의 lease를 잡는다. 용도는 `"listing"`과 같이 sign-out이 묻지 않고 멈추게 하는 쪽이다(POSTMORTEM 2026-10-30 'A model list read made sign-out ask to stop conversations'). 새 용도 `"usage"`를 둘지 `"listing"`을 같이 쓸지는 `/tdd`에서 정한다. sign-out이 조회 프로세스를 멈추도록 `index.ts`의 `stopRuns`(지금은 대화 서비스만 묶임)에 사용량 조회도 묶는다.
- vault provider(Copilot·Antigravity·Cursor)의 조회는 lease의 작업 사본에서 하고, hold/drop의 write-back이 vault 이미지를 바꾸지 않는지 PoC에서 전후 비교한다.
- 같은 provider 조회가 진행 중이면 새로 띄우지 않고 그 결과를 기다린다. 시간 제한은 provider 프로세스가 `initialize`에 답한 시점부터 세고(POSTMORTEM 2026-11-01 Antigravity sign-in), `initialize`가 오지 않을 때를 막는 상한을 따로 둔다(값은 `/tdd`).
- 턴 중 신호: Claude `rate_limit_event`와 Codex `account/rateLimits/updated`로 캐시를 고치는 일은 이번에 넣지 않는다. 턴이 끝난 뒤의 조회가 같은 때를 덮는다.

### 3. IPC

- `agent-usage:read`(`senderAllowed.ts`의 `mainOnly`): provider별 `UsageEntry`를 돌려주고, 결정할 점 2의 규칙에 맞으면 새 조회를 시작한다. `agent-usage:changed`: 항목이 바뀔 때(조회 시작·끝 포함) renderer에 보낸다.
- "앱 창이 보일 때만"은 main이 판단한다(main window의 표시 상태). renderer는 popover 열기를 계기로만 알린다.
- connection ID, 프로필 경로, 계정 ID, 토큰, 진단 글은 앱 창에 보내지 않는다(ARCHITECTURE §7 'Agent authentication' readiness 규칙과 같음).

### 4. UI(renderer)

- 링 버튼은 모든 화면(workspace, Home, Settings, Add Projects)에 보인다(결정할 점 6). 연결이 하나도 없으면 버튼이 없다.
- 링 순서는 `PROVIDERS`의 고정 순서(`homeComposer.ts:190-191`)다. 링 가운데에 `providerLogo(provider)`(`homeComposer.ts:187`).
- 링 값: `ok`인 한도 창 가운데 다시 채워지는 시각이 지나지 않은 것의 가장 큰 `usedPercent`. 지난 한도 창은 링 값에서 뺀다. `unavailable`·`blocked`·`unlimited`·처음 읽는 중이면 빈 링(로고만).
- 접근성: 버튼 이름은 "Agent usage"로 고정하고(값이 바뀌어도 이름은 그대로), provider별 값은 `aria-describedby`로 붙인다(예: "Claude Code 42% used. Codex limit reached. Cursor usage unavailable."). `aria-haspopup="dialog"`와 `aria-expanded`.
- 상호작용(macOS 도구 막대 상태 버튼 관례): 클릭·Space·Return으로 연다. popover는 non-modal dialog이고, 열면 popover 본문에 포커스를 둔다. Esc나 바깥 클릭으로 닫히고 포커스는 버튼으로 돌아간다(PRODUCT §5 Esc 순서 "menu or popover first"). hover tooltip은 "Agent usage"만. 새로고침 버튼은 없다. 열려 있는 동안 상대 시간을 1분마다 고친다.
- popover 행(provider마다): 로고, 이름, 한도 창별 막대와 글.
  - 값 있음: "42% used · resets in 2h 10m". 한도에 닿음(`limited`): "Limit reached · resets in 1h". 다시 채워지는 시각이 지남: "Resets passed · updating"(문구는 `/design-draft`에서 고정).
  - 마지막으로 읽은 시각: "Updated 3m ago". 다시 읽는 중에는 이전 값을 두고 이 줄만 "Updating…".
  - 처음 읽는 중: "Reading usage…".
  - `unlimited`: "Unlimited".
  - `not_supported`(설치된 `agy`가 없을 때 포함, 결정할 점 7): "Usage isn't available for <Provider>."
  - `no_plan_limits`: "<Provider> isn't on a plan with usage limits."
  - `read_failed`: "Couldn't read usage. Doan tries again when you open this." (결정할 점 8)
  - `blocked`: Settings > Agents와 같은 원인 문구(`SettingsAgents.tsx` `unavailable()`, 예: "Claude Code's sign-in expired").
- popover가 열린 동안: sign-out한 provider의 행을 지운다. 마지막 provider가 빠지면 popover를 닫고, 버튼이 사라지므로 포커스는 `.shell-modes`의 현재 탭으로 옮긴다. 새로 연결한 provider는 행을 붙이고 "Reading usage…"로 시작한다.
- 자리: 헤더 오른쪽 끝, `.shell-modes` 옆에 가로로 둔다(`App.tsx:1824` `TopBar`, `:1834` `.shell-modes`, 결정할 점 10). 버튼은 drag region 예외(no-drag)다. provider가 0 → 1이 되면 헤더의 다른 요소가 밀리지 않도록 자리를 정한다(값은 `/design-sync`). 초안 `place-header` frame이 기준이고, `place-stack`·`place-row`(셸 오른쪽 아래)는 비교용으로 남긴다.
- 링 색: 사용 비율 구간에 따른 색 변화를 둘지는 `/design-draft`에서 그려 보고 사람이 정한다. 색만으로 알리지 않고 popover 글("Limit reached")이 함께 있다. 색 왼쪽 선은 쓰지 않는다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `claudeUsage(response)` → `UsageReading`: 한도 창 고르기와 이름, `utilization` null 처리, `rate_limits_available: false`, 모르는 모양 거부.
2. `codexUsage(response)` → `UsageReading`: `primary`·`secondary`, `windowDurationMins` 이름, `resetsAt` 초 → ms, `rateLimitReachedType` → `limited`.
3. U6에서 넣은 provider의 파서(`copilotUsage`, `agyUsage`, `cursorUsage`). `unlimited`, `limited`.
4. `ringValue(reading, now)` → `number | null`: 지난 한도 창을 뺀 가장 큰 `usedPercent`, 빈 `windows`·`unlimited`·unavailable이면 null.
5. `usageText(window, now)`: 상대 시간(분·시간·일), 한도에 닿음, 지난 시각, `resetsAt` 없음.
6. `shouldRead(entry, now, trigger)` → boolean: 결정할 점 2·8의 규칙(5분 간격, popover 열기의 예외 — 지난 한도 창이 있거나 마지막 조회가 실패했으면 바로, 진행 중 조회, 앱 창이 보이는지, 쓸 수 없는 연결, 계기 종류).
7. `UsageStore`의 `connectionId`에 따른 지우기와 늦게 끝난 조회 버리기.
8. 링 버튼의 설명 글(`aria-describedby`) 만들기.

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11): 없다.
- 저장 포맷: 없다(메모리만).
- fixture: PoC의 실제 응답에서 개인 정보(계정 ID, plan 이름 외의 값)를 지운 `app/src/main/agentAuth/fixtures/<provider>-usage.json`(예: `claude-usage.json`, `codex-usage.json`)과 `README.md`의 출처. Go는 읽지 않는다.

## 관례 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. `/agent-eval`은 필요 없다(guide·CLI 출력·skill stub이 그대로).

## 결정 영향

- **외부 자격 증명을 읽지 않음**(ARCHITECTURE §7 'Agent authentication'): 지킨다. 터미널·Orca의 credential은 읽지 않는다. Doan vault의 Cursor credential만 결정할 점 3의 좁은 예외로 쓴다. 이 예외는 Z1에서 ARCHITECTURE의 Antigravity identity 예외 옆에 같은 형식으로 적는다.
- **사람의 메시지만 agent 작업을 시작함**(PRODUCT §3 Out of scope 4): 사용량 조회는 모델 요청을 쓰지 않고, 프로필에 세션·transcript를 남기지 않는다(PoC 통과 기준).
- **readiness는 polling하지 않음**(ARCHITECTURE §7: "there is no polling"): 사용량도 주기 polling은 하지 않고 정한 계기에만 읽는다(결정할 점 2).
- **no per-version feature gating**(ARCHITECTURE §7): 버전 번호가 아니라 조회의 응답으로 `not_supported`를 정한다.
- **Copilot 상태 확인이 모델 요청 하나를 씀**(ARCHITECTURE §7 `verifyByRun`): 사용량 조회는 모델 요청을 쓰지 않는다(완료 조건 4). 모델 요청을 써야만 읽히는 provider는 넣지 않는다.

## PoC 의존

모두 사람의 승인과 로그인한 Doan 연결이 필요하다(실제 HOME의 Keychain, 이 기기의 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 agent-questions D1·D2와 함께 쓸 수 있음). 모든 U의 통과 기준은 공통으로 (i) 모델 요청이 없음(provider의 요청 기록이나 사용량이 조회 전후로 같음), (ii) 프로필과 vault 이미지가 조회 전후로 같음(새 세션·transcript 없음), (iii) Keychain 대화상자가 뜨지 않음, (iv) 같은 연결로 대화가 진행 중일 때 조회해도 그 대화가 계속되고 토큰 갱신이 겹쳐 sign-in이 풀리지 않음이다. 하나라도 어기면 그 provider는 `not_supported`로 둔다.

- **U1 Claude**: Doan과 같은 `query` 옵션(빈 작업 폴더 `cwd`, `skipBehaviors: true`)으로 연 세션과, 대화 runner의 열린 `Query`에서 usage control request가 (a) 공통 기준을 지키는지, (b) 응답 모양과 실제 한도 창 키, (c) 최소 CLI 2.1.284에서 답하는지 아니면 어떤 오류로 답하는지(SDK 동봉 CLI와 설치본), (d) 계정 종류에 따른 `rate_limits_available`.
- **U2 Codex**: `account/rateLimits/read`가 새 app-server와 대화의 살아 있는 app-server 양쪽에서 (a) 공통 기준, (b) 0.158.0과 0.166.0에서 답하는지(0.158.0은 `npm install --prefix .scratch/provider-usage/clis/codex-0.158.0`로 따로 설치), (c) 실제 `primary`·`secondary`의 `windowDurationMins`와 `rateLimitReachedType`.
- **U3 Copilot**: `copilot --headless --stdio`로 Doan 프로필(`HOME`)에서 `account.getQuota`가 (a) 공통 기준, (b) Doan 연결 credential로 되는지, (c) ACP 모드에서 같은 메서드가 되는지, (d) 한도에 닿았음을 말하는 필드.
- **U4 Antigravity**: 설치된 `agy`(이 기기 1.4.9)를 Doan의 Antigravity 프로필로 띄워 `/usage`가 (a) 공통 기준 — 특히 Keychain 대화상자(`providers.ts:131-132`의 이력). 대화상자가 뜨면 바로 중단하고 `not_supported`로 정한다. (b) Doan의 ACP 서버가 쓰는 credential(`AGY_ACP_FORCE_FILE_STORAGE`의 파일)을 `agy`가 읽는지, 별도 로그인을 부르는지, (c) 최소 버전(Orca는 1.1.11). 사람이 설치한 `agy`는 Doan의 최소 버전 체계 밖에 있다.
- **U5 Cursor**: (a) Doan vault의 Cursor credential에서 access token을 꺼내는 위치와 모양(lease의 작업 사본, `manager.ts:736` `tokenFile`·`readWorking`과 같은 방식), (b) Orca의 세 엔드포인트 가운데 사용량을 주는 GET 하나와 그 응답 모양, 필요한 헤더(Cookie, Origin·Referer), (c) 리다이렉트 여부, (d) 토큰 만료 때의 응답, (e) 계정 플랜(지금 계정은 "Upgrade your plan"에 막혀 있다, agent-questions P3)에 따른 차이. `cursor-agent status --format json`에 사용량이 있으면 그쪽을 먼저 쓴다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A model list read made sign-out ask to stop conversations'**: 새 lease는 용도를 고른다. 사용량 조회가 sign-out의 `stop_required`에 잡히지 않게 한다.
- **2026-11-01 Antigravity sign-in**: 부하에서 ACP `initialize`가 약 30초 걸린다. 시간 제한은 `initialize` 답부터 센다.
- **2026-10-29 cancelled replacement**: 연결이 이미 있을 때 provider 명령이 프로필에 무엇을 쓰는지 먼저 읽는다. 사용량 조회가 프로필을 바꾸지 않는지 PoC에서 전후 비교한다.
- **2026-10-30 Packaged-app probes**: 격리한 HOME에는 Keychain이 없어 Codex keyring을 읽지 못한다. PoC는 실제 HOME의 Doan 프로필로 한다.

## 읽은 design preset

`doan design-skill --json`(목록), `shape`, 리뷰에서 `clarify`.

## 결정할 점

1. **provider 범위: 다섯 모두 시도한다.** Claude(SDK usage)와 Codex(`account/rateLimits/read`)는 구현한다. Copilot(`--headless --stdio`의 `account.getQuota`), Antigravity(`agy`), Cursor(웹 API, 결정 3)는 PoC U3–U5가 공통 기준을 지키면 구현하고, 그렇지 않으면 "Usage isn't available"로 둔다.
2. **읽는 때**: 앱 시작과 그 provider의 sign-in 뒤 한 번, 그 provider의 Doan 연결 대화 턴이 끝난 뒤(legacy external 턴은 아님), 자세한 내용(popover)을 열 때. 같은 provider는 마지막 조회에서 5분이 지나야 다시 읽는다. 예외: popover를 열 때 지난 한도 창이 있으면 간격과 관계없이 읽는다. 앱 창이 보일 때만 읽는다. 주기 polling은 하지 않는다.
3. **Cursor는 웹 API 하나로 읽는다.** ARCHITECTURE §7 'Agent authentication'의 토큰 예외(지금은 Antigravity identity)를 'Cursor usage 읽기'로만 넓힌다. U5가 고른 GET 엔드포인트 하나, host `cursor.com` 고정, 리다이렉트 거부, 응답 크기·시간 상한. 토큰은 lease로 잡은 작업 사본에서 main 메모리로만 읽고, 갱신하지 않는다(만료는 `read_failed`). 토큰을 저장·로그·IPC·오류 글에 넣지 않는다. 비공개 API라 모양이 다르거나 실패하면 `read_failed`. Claude는 SDK 조회가 있으므로 Orca의 토큰 직접 호출을 쓰지 않는다.
4. **Antigravity는 설치된 `agy`가 있을 때만** 읽는다. 로그인 셸 PATH에서 찾은 `agy`를 Doan의 Antigravity 프로필(`HOME`·`GEMINI_HOME`, `agentAuth/environment.ts:36`)로 `agy -p /usage --output-format json`으로 띄우고(Orca와 같이 `AGY_CLI_DISABLE_AUTO_UPDATE=true`), 없으면 `not_supported`. Doan은 `agy`를 내려받지 않는다.
5. **쓸 수 없는 연결**(sign-in 만료, 확인 안 됨, CLI 버전 미달)은 링을 남기고(빈 링), 조회하지 않으며, popover 행에 Settings > Agents와 같은 원인 문구를 보인다.
6. **링 버튼은 모든 화면**(workspace, Home, Settings, Add Projects)에 보인다.
7. **설치된 `agy`가 없을 때**도 다른 `not_supported`와 같은 문구 "Usage isn't available for Antigravity."를 쓴다.
8. **실패한 조회**: 다음 계기는 5분 간격을 따르되, popover를 열 때는 마지막 조회가 실패였으면 바로 다시 읽는다.
9. **PRODUCT 위치**: Z1에서 §3 In scope 7 'Agent authentication'의 하위 항목으로 올린다. §1에 새 문제를 더하지 않는다.
10. **자리는 헤더 오른쪽 끝**(초안 `place-header`). 모든 화면에 헤더가 있어 결정할 점 6과 맞고, 셸 오른쪽 아래 두 후보는 toast 자리와 겹치며 대화 패널의 Send와 붙는다. 960×600에서도 링 다섯 개가 들어간다(초안 검토).
