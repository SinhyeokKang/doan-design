# provider-usage — tasks

순서: PoC → UI 초안 → 순수 함수 → main 조회·캐시·IPC → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정할 점'에 있다.

## P. PoC

모두 사람의 승인, 로그인한 Doan 연결, 일회성 스크립트 `.scratch/provider-usage/`가 필요하다. 실제 HOME의 Keychain과 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 쓴다. 이는 AGENTS.md의 HOME 격리 규칙의 예외이고, 사람이 승인했다(agent-questions orch.md 결정 1). 정리는 E2 뒤 공용 프로필 정리와 함께 한다. 결과(버전, 응답 모양, 공통 기준 (i)–(iv)의 판정, 프로필·vault 전후 비교, 날짜)는 이 파일 아래 'P 결과'에 적고, 개인 정보를 지운 응답을 A1의 fixture 재료로 남긴다.

실행 방법(사람의 결정): 새 공용 프로필(실제 HOME, userData `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`)에서 dev 앱으로 다섯 provider에 sign-in하고, 브라우저 승인은 지휘자를 거쳐 사람에게 묻는다. `.scratch/provider-usage/`의 일회성 스크립트가 provider마다 조회를 부른다. 조회 전후에 프로필·vault 이미지 해시와 provider의 사용량 값을 비교하고, (iv)는 같은 연결로 dev 앱에서 짧은 대화를 돌리는 동안 조회한다. `agy`에서 Keychain 대화상자가 뜨면 U4를 바로 멈춘다.

- [x] U1. Claude usage control request(design 'PoC 의존' U1).
  - 검증: 'P 결과'에 U1 (a)–(d)와 공통 기준 (i)–(iv)의 판정이 모두 있다.
- [x] U2. Codex `account/rateLimits/read`(U2).
  - 검증: 'P 결과'에 U2 (a)–(c)와 공통 기준의 판정, 0.158.0·0.166.0 각각의 응답이 있다.
- [x] U3. Copilot `--headless --stdio` `account.getQuota`(U3).
  - 검증: 'P 결과'에 U3 (a)–(d)와 공통 기준의 판정, 또는 막힘과 이유가 있다.
- [ ] U4. Antigravity 설치본 `agy -p /usage`(U4). Keychain 대화상자가 뜨면 바로 중단한다.
  - 검증: 'P 결과'에 U4 (a)–(c)와 공통 기준의 판정, 또는 막힘과 이유가 있다.
  - 막힘: `agy`가 Doan 연결의 credential을 읽지 않고 자체 Google 로그인을 요구했다('P 결과' U4). 별도 로그인은 Doan 연결이 아니므로 진행하지 않았다.
- [x] U5. Cursor credential과 usage 엔드포인트 하나(U5).
  - 검증: 'P 결과'에 U5 (a)–(e), 고른 엔드포인트와 헤더, 공통 기준의 판정, 또는 막힘과 이유가 있다.
  - (iv)는 계정의 "Upgrade your plan to continue" 막힘 때문에 진행 중인 대화로 확인하지 못했다('P 결과' U5).
- [x] U6. (사람의 결정) U3–U5 결과로 Copilot·Antigravity·Cursor를 구현에 넣을지 정한다(design 결정할 점 1). 빼는 provider는 `not_supported`로 두고 spec·design·이 파일의 A1·B1·C1에서 그 부분을 지운다.
  - 검증: 결정을 design '결정할 점'에 적고 바뀐 spec·design·tasks를 커밋한다.
  - 결정(사람): Copilot과 Cursor를 넣고 Antigravity는 뺀다(`not_supported`). design 결정할 점 1·4에 적었다.
  - 권고(PoC): Copilot은 넣는다(headless 조회가 공통 기준을 지킴, `hasQuota: false` 종류는 뺀다). Antigravity는 뺀다(`agy`가 별도 로그인을 요구). Cursor는 넣는다(GET 하나가 공통 기준을 지킴, 비공개 API라 모양이 다르면 `read_failed`).

### P 결과

2026-11-05, 이 기기(macOS 26.3.1, arm64). 공용 프로필에 다섯 provider를 모두 연결했다: Claude Code(team plan), Codex(free), Cursor(free), Antigravity, GitHub Copilot(free). 증거와 스크립트는 `.scratch/provider-usage/`(스크립트), `evidence/`(전후 스냅샷·스크린샷·타임라인), `work/`(원 응답), `out/`(개인 정보를 지운 응답, A1의 fixture 재료)에 있다.

**조회를 부른 방법.** dev 앱(`app/out` 빌드, `electron app --user-data-dir=<공용 프로필>`, 실제 HOME·`/bin/zsh`, 임시 `DOAN_RUNTIME`·repo)을 Node inspector로 띄우고, 시작 때 main의 `AuthManager`를 잡아 두었다(코드 변경 없음). 조회마다 `auth.acquire(provider, "listing")`로 lease를 잡아 앱과 같은 `command`·`env`·`profileDir`를 받고, 그 env로 바깥 Node 스크립트가 조회한 뒤 lease를 놓았다(`lease.mjs`). vault provider(Copilot·Cursor·Antigravity)는 lease가 프로필에 쓴 작업 사본을 쓴다. 앱 프로세스 안에서 조회하지 않은 이유: 번들된 SDK와 모듈 변수에 inspector로 닿을 수 없고, lease와 작업 사본이 앱과 같으면 결과도 같다.

**판정 방법.** (i) 조회 응답의 세션 비용·사용량 값, 새 thread·session 유무. 다만 한 번의 대화 턴도 Claude 5시간(3%), Codex(38%), Copilot chat(`usedRequests` 5)의 값을 바꾸지 않아, 사용량 값만으로는 모델 요청 하나를 가려내지 못한다. 그래서 (i)은 프로토콜(세션 비용 0, thread·session 없음, GET 하나)과 함께 판정했다. (ii) `snap-prof.mjs`로 프로필 파일 해시, vault 이미지 해시, provider Keychain 항목(서비스·계정·만든 시각·바뀐 시각)을 전후 비교했다. (iii) `agy`·Copilot 조회는 `SecurityAgent` 프로세스를 200ms마다 감시했고 한 번도 뜨지 않았다. Claude·Codex 조회는 감시하지 않았으나 0.2–1초 안에 사람의 조작 없이 끝났다. (iv) dev 앱에서 같은 연결로 "one to one hundred fifty" 대화를 보내고, 턴 중에 조회했다. 겹침은 대화 기록의 `turn.started`·`turn.done` 시각과 조회 시작·끝 시각으로 확인했다.

#### U1 Claude — 통과

- 버전: SDK 0.3.312, 설치본 CLI 2.1.318, SDK 동봉 CLI 2.1.312, 최소 버전 2.1.284(`.scratch/provider-usage/clis/claude-2.1.284`에 따로 설치).
- 호출(`u1-claude.mjs`): `query({ prompt: <아무것도 보내지 않는 입력>, options: { cwd: <userData>/usage-probe-cwd, env: <lease env>, pathToClaudeCodeExecutable, settingSources: ["user","project","local"] } })` → `initializationResult()` → `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` → abort. 초기화 0.4–1.4초, 조회 0.2–0.3초.
- (b) 응답 모양(`out/claude-usage-2.1.318.json`): `session{total_cost_usd 0, model_usage {}}`, `subscription_type "team"`, `rate_limits_available true`, `behaviors null`. `rate_limits`의 한도 창은 `five_hour{utilization 3, resets_at}`, `seven_day{utilization 99, resets_at}`이고 각 항목에 `limit_dollars`·`used_dollars`·`remaining_dollars`·`locked_reason`(모두 null)이 더 있다. `seven_day_opus`·`seven_day_sonnet` 등과 이름 없는 키 여러 개(`tangelo` 등)는 null이다. 그 밖에 `extra_usage`, `limits[]`(`kind`·`group`·`percent`·`severity "normal"|"critical"`·`is_active`·`scope`), `spend`, `model_scoped[]`가 있다. 파서는 모르는 키를 거부하지 말고 무시해야 한다(design §1 "모르는 모양은 `read_failed`"는 필요한 키가 없거나 타입이 다를 때로 좁힌다). 한도에 닿았음을 직접 말하는 필드는 이번 응답에서 확인하지 못했다(99%에서도 `locked_reason` null, `limits[].severity "critical"`).
- (c) 2.1.284, 2.1.312, 2.1.318 모두 같은 모양으로 답했다(`out/claude-usage-2.1.284.json`).
- (d) team 계정에서 `rate_limits_available: true`. API key·Bedrock 등 다른 계정 종류는 확인하지 않았다.
- 열린 `Query`(`u1-open.mjs`, Haiku 4.5로 "Reply with exactly OK." 한 턴): `result` 뒤 같은 `Query`의 usage가 답했다. 이때 `session.total_cost_usd`는 그 턴의 비용(0.0498)이므로 링 값에 쓰지 않는다. 턴 중에 온 `rate_limit_event`의 모양은 `out/claude-open-query.json`(`rateLimitType`, `utilization` 0–1, `unifiedWindows.five_hour|seven_day{utilization, resetsAt(초), status "allowed"|"allowed_warning"}`).
- (i) 통과: 새 세션 조회 여덟 번(대화 중 두 번 포함) 모두 `total_cost_usd 0`, `model_usage {}`. (ii) 세션·transcript 없음(`projects/` 없음, `sessions/`는 빈 디렉터리), Keychain 항목 `Claude Code-credentials-45991d82`의 바뀐 시각 그대로. 다만 프로필 파일은 같지 않다: 첫 조회 때 Claude Code 시작 동기화(`skills/synced/`, `plugins/`, `cache/model-catalog/`, `backups/.claude.json.backup.*`)가 생겼고, 이후 조회마다 `remote-settings.json.*`·`policy-limits.json.*` 도장이 바뀐다. 이는 모델 목록 조회 등 모든 Claude 프로세스가 같이 쓰는 파일이다(`evidence/u1-before*.json`/`u1-after*.json`). (iii) 대화상자 없음(위 판정 방법). (iv) 통과: 조회 04:48:54.5–56.1Z가 턴 04:48:54.2–59.7Z 안에 있고, 턴은 `turn.done`으로 끝났으며 연결은 그대로였다(`evidence/19-settings-final.png`).

#### U2 Codex — 통과

- 버전: 설치본 0.166.0, 최소 0.158.0(`.scratch/provider-usage/clis/codex-0.158.0`).
- 호출(`u2-codex.mjs`): `codex -c cli_auth_credentials_store="keyring" -c mcp_oauth_credentials_store="keyring" app-server`(cwd = 프로필) → `initialize {clientInfo, capabilities.experimentalApi}` → `initialized` → `account/rateLimits/read`(params 없음). 초기화 0.4–0.6초, 조회 0.7–1초.
- (b) 0.158.0과 0.166.0 모두 같은 모양으로 답했다(`out/codex-ratelimits-0.158.0.json`, `out/codex-ratelimits-0.166.0.json`). 새 app-server 앞에 알림 `remoteControl/status/changed`(0.166.0은 `account/updated`도)가 온다.
- (c) free 계정: `rateLimits{limitId "codex", primary{usedPercent 38, windowDurationMins 43200, resetsAt(초)}, secondary null, planType "free", rateLimitReachedType null, credits, spendControlReached false}`, `rateLimitsByLimitId.codex`(같은 값), `ordinaryUsageAllowed true`, `rateLimitResetCredits`, `accountId`(지움). 한도 창이 30일(43200분) 하나다. design §1의 이름 규칙에서 "30-day"가 된다. 5시간·주간 한도 창은 이 계정에서 보지 못했다.
- 살아 있는 app-server(`u2-open.mjs`): 임시 thread에서 턴 하나가 끝난 뒤 같은 app-server의 `account/rateLimits/read`가 답했다. 턴 중에 `account/rateLimits/updated`가 같은 모양으로 왔다(`out/codex-live-app-server.json`).
- (i) 통과: `state_5.sqlite`의 `threads` 0건, `sessions/` 없음, `usedPercent` 38 그대로. (ii) 세션 없음, Keychain 항목 그대로. 프로필 파일은 `*.sqlite-wal`·`-shm`, `models_cache.json`, `tmp/arg0/`가 바뀐다(app-server 시작마다). (iii) 대화상자 없음. (iv) 통과: 조회 04:51:20.6–22.8Z가 턴 04:51:18.5–33.6Z 안에 있고, 턴이 끝났으며 연결은 그대로였다.

#### U3 Copilot — 통과(headless)

- 버전: Copilot CLI 1.0.105(SDK 프로토콜 3). 정의는 `~/Library/Caches/copilot/pkg/darwin-arm64/1.0.105/copilot-sdk/generated/rpc.d.ts`의 `AccountGetQuotaResult`, 실행 인자는 같은 SDK `index.js` `startCLIServer`.
- 호출(`u3-copilot.mjs`): `copilot --headless --no-auto-update --stdio`(cwd = Doan 소유 빈 폴더, lease env, `Content-Length` framing) → `connect {supportedTaskKinds}` → `account.getQuota {}`. 시작 0.6–1.2초, 조회 1ms 안팎.
- (b) Doan 연결의 credential(lease 작업 사본의 `.copilot/config.json`)로 답했다.
- 응답 모양(`out/copilot-quota-headless.json`): `quotaSnapshots{chat, completions, premium_interactions}` 각각 `isUnlimitedEntitlement`, `entitlementRequests`, `usedRequests`, `remainingPercentage`, `usageAllowedWithExhaustedQuota`, `overage`, `overageAllowedWithExhaustedQuota`, `resetDate`, 그리고 `rpc.d.ts`에 없는 `hasQuota`·`tokenBasedBilling`. free 계정의 `premium_interactions`는 `entitlementRequests 0`, `remainingPercentage 0`, `hasQuota false`다. design §1의 `usedPercent = 100 - remainingPercentage`를 그대로 쓰면 100%로 보이므로 `hasQuota: false`(또는 엔타이틀먼트 0)는 한도 창에서 빼야 한다. `resetDate`는 세 종류 모두 `2026-11-05T04:43:41Z`로 sign-in 시각과 같아, 조회 때 이미 지난 시각이었다. "지난 한도 창" 규칙이 이 값을 계속 지난 것으로 볼 수 있다.
- (c) ACP 모드(`copilot --acp --stdio`, `initialize` 뒤): `account.getQuota`는 `-32601 "Method not found"`(`out/copilot-acp-getquota.json`). 대화의 ACP 프로세스는 재사용할 수 없고 조회마다 headless 프로세스를 따로 띄워야 한다.
- (d) 한도에 닿았음을 바로 말하는 불리언은 없다. `remainingPercentage 0`과 `usageAllowedWithExhaustedQuota false`의 조합이 후보이나 실제로 닿은 상태는 보지 못했다.
- (i) 통과: `usedRequests` 5가 조회 전후로 같고, 서버 로그는 "Destroying 0 active sessions"다. 한 턴 뒤에도 5로 남아, 이 값만으로는 모델 요청을 가려내지 못한다. (ii) 통과: vault 이미지 같음(`f0fbf480…`), 프로필은 `.copilot/logs/process-*.log`만 늘고 `session-state/`는 그대로. (iii) `SecurityAgent` 없음. (iv) 통과: 조회 04:53:45.6–48.9Z가 턴 04:53:43.4–53.0Z 안에 있고, 턴이 끝났으며 연결은 그대로였다.

#### U4 Antigravity — 막힘(`not_supported`)

- 버전: 설치본 `agy` 1.4.9. 최소 버전(c)은 확인하지 못했다.
- 호출(`u4-agy.mjs`): `agy -p /usage --output-format json --print-timeout 20s`, env = Antigravity lease env(`HOME`=프로필, `GEMINI_HOME`=`<프로필>/.gemini`, `AGY_ACP_FORCE_FILE_STORAGE=1`, `$BROWSER`=Doan 훅) + `AGY_CLI_DISABLE_AUTO_UPDATE=true`.
- (b) `agy`는 Doan ACP 서버의 credential(`.gemini/antigravity-acp/acp_token.json`)을 읽지 않았다. stderr에 "Authentication required. Please visit the URL to log in"과 Google OAuth 링크(redirect `antigravity.google/oauth-callback`)를 내고 "paste the authorization code"를 기다렸다. 45초에 강제 종료했다(`out/agy-usage-blocked.json`). 이 링크는 `$BROWSER` 훅을 거쳐 사람의 브라우저에 열렸고, 사람이 승인해 받은 코드를 지휘자가 전달했다. 그때는 기다리는 프로세스가 없어 코드를 쓰지 않았다. credential은 어디에도 생기지 않았다(프로필 파일에 토큰 없음, provider Keychain 항목 변화 없음).
- (a) (iii) 별도 로그인 전에는 `SecurityAgent`가 뜨지 않았다. 별도 로그인을 마치면 `agy`가 keyring에 저장하려 할 수 있으나(B1 이력) 진행하지 않았다. (ii) 어김: `agy`가 Doan 프로필에 `.gemini/antigravity-cli/`(로그, crash 파일, `jetski_state.pbtxt` 등)와 `.gemini/config/`(빈 `mcp_config.json`, `projects/default-cli-project.json`)를 새로 썼다. vault 이미지는 같다. 이 파일들은 지우지 않았다(공용 프로필 정리 대상). (i)·(iv)는 조회가 답하지 않아 판정하지 않았다.

#### U5 Cursor — 통과, (iv)는 계정 plan으로 제한

- 버전: `cursor-agent` 2026.10.22-27dcf5f. `cursor-agent status --format json`에는 사용량이 없다(`status`, `isAuthenticated`, `hasAccessToken`, `hasRefreshToken`, `userInfo{email, userId, firstName, lastName, createdAt}`).
- (a) 토큰 위치: lease 작업 사본 `<프로필>/.cursor/auth.json`의 `accessToken`(JWT, claim `sub`·`time`·`randomness`·`exp`·`iss`·`scope`·`aud`·`type`, `sub` 모양 `xxxxxx-xxxxxx|xxxx_…`, 만료까지 약 60일)과 `refreshToken`. 토큰은 메모리에서만 썼고 파일·로그에 남기지 않았다(`out/` 검사).
- (b) 고른 엔드포인트(`u5-cursor.mjs`): `GET https://cursor.com/api/usage-summary`, 헤더 `Cookie: WorkosCursorSessionToken=<encodeURIComponent(sub)>%3A%3A<accessToken>`, `Accept: application/json`, `Origin: https://cursor.com`, `Referer: https://cursor.com/dashboard`, `redirect: "manual"`(Orca 1.4.240과 같은 헤더). Origin·Referer 없이도 되는지는 확인하지 않았다. 200, JSON 590바이트, 약 0.4초. Orca의 나머지 두 엔드포인트(`POST /api/dashboard/get-current-period-usage`, `GET /api/usage?user=`)는 부르지 않았다.
- 응답 모양(`out/cursor-usage-summary.json`): `billingCycleStart`·`billingCycleEnd`(ISO), `membershipType "free"`, `limitType "user"`, `isUnlimited false`, `autoModelSelectedDisplayMessage`, `namedModelSelectedDisplayMessage`, `individualUsage{plan{enabled, used, limit, remaining, breakdown{included, bonus, total}, autoPercentUsed 100, apiPercentUsed 0, totalPercentUsed 50}, onDemand{enabled false, …}}`, `teamUsage {}`.
- (c) `cursor.com`은 리다이렉트하지 않는다. `www.cursor.com/api/usage-summary`는 `308 → https://cursor.com/api/usage-summary`(`out/cursor-redirect-check.txt`). host를 `cursor.com`으로 고정하고 리다이렉트를 거부해도 된다.
- (d) 서명을 바꾼 토큰: `401 {"error":"not_authenticated", …}`(`out/cursor-usage-summary-401.json`). 쿠키가 없을 때도 같다. 실제로 만료된 토큰은 확인하지 않았다.
- (e) free 계정은 `autoPercentUsed 100`인데 한도에 닿았다는 불리언이 없다. dev 앱의 Cursor 대화는 `Auto`와 `gpt-5.4-nano` 모두 "Upgrade your plan to continue"로 막혔다(`apiPercentUsed 0`이어도). 유료 plan의 응답은 보지 못했다.
- (i) 통과: 계정 조회 GET 하나이고 모델 요청이 아니다. (ii) 통과: 조회 전후 프로필 파일과 vault 이미지(`d1236a58…`)가 같다. (iii) 통과: 파일 저장소라 Keychain을 쓰지 않는다. (iv) 제한: 대화가 plan 때문에 0.6초 만에 막혀, 조회(04:52:57.9–59.3Z)가 짧은 턴(04:52:58.1–58.7Z)과 겹친 것만 확인했다. 대화 뒤에도 연결은 그대로였고 vault 이미지도 같았다. 토큰 갱신과 겹치는 경우는 확인하지 못했다.

── commit: `docs(feature): record provider-usage PoC results` ──

## D. UI 초안

- [ ] D0. `/design-draft`로 `.doan/canvases/provider-usage.html`을 그린다. 프레임:
  - 링 버튼의 세 자리(사람이 헤더 오른쪽 끝을 골랐다)(셸 오른쪽 아래 세로, 헤더 오른쪽 끝 가로, 셸 오른쪽 아래 가로) 비교. 각 자리의 충돌(toast, docked composer Send, drag region, 좁은 앱 창, provider 0 → 1)을 함께 그린다.
  - 화면마다(workspace, Home, Settings, Add Projects) 버튼의 위치.
  - 링 상태: 값 있음, 한도에 닿음, 처음 읽는 중, unavailable, 쓸 수 없는 연결, 무제한. provider 1개와 5개, 좁은 앱 창에서 접힌 링.
  - popover: 한도 창별 막대와 글, "Updated …"·"Updating…", 이유별 한 줄 문구(design §4), 열린 동안 provider가 빠지거나 생기는 경우.
  - 사람이 자리와 링 색 규칙을 고르고 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 main HEAD에서 낸 finding 목록과 같은 목록을 내고, 설치된 `doan ls --repo . --json`에 새 캔버스가 있다. 사람의 확인.
  - 결과: frame `place-stack`, `place-header`, `place-row`, `ring-states`, `popover`, `popover-live`. `doan check` 13건(main과 같음), 폭 2640. 로고 경로를 `.doan/assets/provider-logos/`로 고쳤다. 사람이 자리를 헤더 오른쪽 끝으로 골랐다(design 결정할 점 10). 초안 확정은 PoC(U1–U6) 뒤에 한다(사람). 그래서 D0는 열린 채로 두고, PoC가 끝나면 아래 '초안 확인'과 함께 확정한다. 링 색과 그리며 정한 나머지는 아래 '초안 확인'에 남는다.

### 초안 확인(남은 것)

초안에 popover 오른쪽 위 새로고침 버튼("Refresh usage", 쉼·읽는 중)을 더 그린다(결정할 점 11). 그리며 정한 것으로 사람의 확인이 필요하다: 링 색(Neutral / Bands 70·90), 좁은 앱 창의 링 접기 규칙을 둘지(헤더에서 960×600에도 다섯 개가 들어감), 문구 "Reset · updating"·"Updated just now", popover 제목 "Agent usage", 이유 줄 모양(read_failed 오류, blocked 경고, 나머지 subtle), 한도 보고 없는 100%는 "100% used"만, 링 track 색의 component constant를 새 token으로 올릴지.

── commit: `docs(design): draft provider usage` ──

## A. 순수 함수

- [ ] A1. `UsageReading`·`UsageEntry` 타입(type-only, renderer가 import), `claudeUsage`, `codexUsage`, U6에서 넣은 provider의 파서. fixture `app/src/main/agentAuth/fixtures/<provider>-usage.json`과 `README.md`의 출처.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green: fixture 입력, null·빠진 한도 창, `rate_limits_available: false`, 상한 밖 비율 자르기, 모르는 모양 `read_failed`, `rateLimitReachedType` → `limited`, Copilot 모두 무제한 → `unlimited`·빈 `windows`, `Method not found`·모르는 control request → `not_supported`, `rendererImports.test.ts` 통과.
- [ ] A2. `ringValue`, `usageText`, `shouldRead`, 버튼 설명 글, `UsageStore`의 지우기.
  - 검증: `npm --prefix app test` —
    - `ringValue`: 지난 한도 창 제외, 빈 `windows`·`unlimited`·unavailable·`blocked` → null.
    - `usageText`: 분·시간·일, 한도에 닿음, 지난 시각, `resetsAt` 없음.
    - `shouldRead`: 앱 시작·sign-in·턴 끝·popover 열기·새로고침, 5분 간격, 새로고침의 간격 무시, popover 열기의 예외(지난 한도 창, 마지막 실패), 진행 중 조회, 앱 창이 보이지 않을 때, 쓸 수 없는 연결, legacy external 턴은 계기가 아님, 앱 재시작 뒤 빈 캐시.
    - `UsageStore`: `connectionId`가 바뀌면 지움, 조회 시작 뒤 `connectionId`가 바뀐 결과는 버림.
    - 설명 글: 다섯 provider가 고정 순서로, unavailable·한도에 닿음 포함.

── commit: `feat: read provider usage responses` ──

## B. main 조회·캐시·IPC

- [ ] B1. provider별 조회(design §1): 앱 시작·sign-in·popover용 새 프로세스(Claude 빈 작업 폴더 `cwd`와 `skipBehaviors`, Codex app-server, U6에서 넣은 provider)와 턴 끝의 살아 있는 runner 재사용(Claude 열린 `Query`, Codex app-server). lease 용도(design §2, POSTMORTEM 2026-10-30), sign-out의 `stopRuns`에 묶기, `initialize` 답부터 세는 시간 제한과 `initialize` 상한, 같은 provider 조회 합치기, Cursor는 엔드포인트 하나·host 고정·리다이렉트 거부·응답 상한·토큰 갱신 없음.
  - 검증: `npm --prefix app test` — fake executable(credential 없음)과 fake HTTP로 각 조회의 성공·실패·시간 초과·`initialize` 없음, 계기 두 번이 프로세스 하나와 같은 결과를 받음, 조회 중 sign-out이 `stop_required`를 묻지 않고 조회 프로세스를 멈춤, 조회가 대화 시작을 막지 않음, 턴 끝 조회가 새 프로세스를 띄우지 않음, Cursor 리다이렉트·다른 host 거부, Cursor 토큰이 반환값·로그·오류 글에 없음(`not.toContain`).
- [ ] B2. `UsageStore`(메모리만), `connectionId` 키와 늦은 결과 버리기, 쓸 수 없는 연결의 `blocked`, 턴 끝 계기(Doan 연결 대화만), IPC `agent-usage:read`(`senderAllowed.ts` `mainOnly`)·`agent-usage:changed`, main의 앱 창 표시 판단.
  - 검증: `npm --prefix app test` — sign-in·sign-out·교체 뒤 이전 값 없음, 디스크에 쓰지 않음, 다른 sender 거절, `agent-usage:changed`와 `agent-usage:read` 응답과 `UsageStore` 내용에 connection ID·프로필 경로·계정 ID·Cursor 토큰이 없음(`not.toContain`), 앱 창이 숨겨지면 읽지 않음. `npm --prefix app run typecheck`.

── commit: `feat: read agent account usage in main` ──

## C. UI

- [ ] C1. 링 버튼과 popover(헤더 오른쪽 끝, 모든 화면, no-drag), preload 호출.
  - 검증: `npm --prefix app test` — 링 값과 빈 링, 고정 순서, 버튼 이름 고정과 설명 글, `aria-haspopup`·`aria-expanded`, 클릭·Space·Return으로 열기, Esc·바깥 클릭으로 닫고 버튼으로 포커스 복귀, 이유별 문구, 설정 버튼(누르면 popover를 닫고 Settings > Agents), 연결이 하나면 링에 로고 없음, 새로고침 버튼(이름, 누르면 간격 무시하고 읽기, 읽는 중 `aria-busy`와 spinner, 연타가 provider마다 조회 하나), "Updating…" 중 이전 값 유지, 상대 시간 1분 갱신, 열린 동안 provider가 빠지고 생김, 마지막 provider가 빠지면 닫고 `.shell-modes`의 현재 탭으로 포커스, 연결이 없을 때 버튼 없음. `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat: show agent usage rings` ──

## E. 실제 앱 확인

- [ ] E1. `/design-sync`로 링과 popover를 초안과 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.
- [ ] E2. `/runtime-test`: 공용 프로필로 연결한 provider마다 링 값이 PoC 값과 같은지, 턴 뒤 갱신(새 프로세스 없음), 5분 간격과 popover 열기의 예외, sign-out 뒤 링 사라짐, unavailable provider, 쓸 수 없는 연결의 문구. 사람의 승인을 받는다.
  - 검증: `/runtime-test` 보고(스크린샷). 사람 상태(프로필, vault, Keychain 항목)가 확인 전과 같은지 보고에 적는다.
- [ ] E3. 공통 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill stub·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §3 In scope 7 'Agent authentication'의 하위 항목으로 사용량 표시를 더한다(결정할 점 9). §5에 링 버튼의 자리와 동작, 모든 화면, popover, 읽는 때, 이유별 문구, provider별 지원 범위.
  - ARCHITECTURE §7 'Agent authentication': 사용량 조회 경로(provider별, 턴 끝 재사용), lease 용도와 `stopRuns`, `connectionId` 키의 메모리 캐시, 응답으로 정하는 `not_supported`, Cursor usage 토큰 예외(Antigravity identity 예외와 같은 형식), Antigravity는 읽지 않음.
  - BACKLOG.md: 사용량 항목을 지우고, 구현하지 않은 provider와 막힌 PoC를 적는다.
  - 그리고 `docs/features/provider-usage/`를 지운다.
  - 검증: `grep -n 'account/rateLimits/read' docs/ARCHITECTURE.md`에 줄이 있다, `grep -n 'Agent usage' docs/PRODUCT.md`에 줄이 있다, `grep -n 'remaining usage or rate limits' docs/BACKLOG.md`에 줄이 없다, `docs/features/provider-usage/`가 없다.

── commit: `docs(product): agent usage rings` / `docs(architecture): agent usage reads` / `docs(backlog): settle agent usage` / `docs(feature): remove provider-usage docs` ──
