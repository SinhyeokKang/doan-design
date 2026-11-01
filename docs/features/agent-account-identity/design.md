# agent-account-identity — design

## 1. 조사 결과 (2026-11-01, PoC는 `.scratch/account-identity/`)

토큰·비밀·전체 이메일은 기록하지 않았다. 이메일은 도메인만, ID는 길이와 sha256 앞 8자만 남겼다.

### Codex 0.164.0 (`/opt/homebrew/bin/codex`, `codex-cli 0.164.0`)

| 후보 | 결과 | 근거 |
|---|---|---|
| `codex login status` | 계정 없음. 로그인 상태면 "Logged in using ChatGPT"만 출력한다 | 바이너리 문자열(`@openai/codex-darwin-arm64/.../bin/codex`): "Logged in using ChatGPT", "…access token", "…personal access token" 등 |
| app-server `account/read` | **선택.** `{ account: { type: "chatgpt", email, planType }, requiresOpenaiAuth, workspaceRouting }` | 스키마: `codex app-server generate-json-schema [--experimental] --out <dir>` → `v2/GetAccountParams.json`(`refreshToken?: boolean`), `v2/GetAccountResponse.json`. `email`·`planType`은 안정 필드, `workspaceRouting`(`chatgptAccountId`, `backendOrigin`, `accountRoutingOverride`)은 `--experimental`에만 있다 |
| app-server `account/rateLimits/read` | `accountId`가 `workspaceRouting.chatgptAccountId`와 같다. 네트워크 요청이고 쓰지 않는다 | 실측 아래 |
| Doan 프로필 키체인 항목 내용 | 읽지 않았다. 대화상자 위험이 있고 app-server가 같은 이메일을 준다 | — |
| `auth.json`(file 저장)의 `id_token` 클레임 | Orca 방식. Doan은 키체인을 쓰므로 해당 없음(design §3 'Codex 저장 방식'). 0.164.0 바이너리는 `chatgpt_account_id`, `chatgpt_user_id`, `chatgpt_plan_type` 클레임 이름을 담고 있다. 실제 토큰에서는 확인하지 않았다 | 바이너리 문자열 |

실측(코디네이터 승인, 서명된 Doan 프로필 `.scratch/provider-profile/userData/agent-auth/profiles/codex`, Doan 대화 실행과 같은 인자 `-c cli_auth_credentials_store="keyring" -c allow_login_shell=false app-server`, `initialize`에 `capabilities.experimentalApi: true`):

```
notification account/updated {"authMode":"chatgpt","planType":"free"}
account/read { "account": { "type": "chatgpt", "email": "<…@gmail.com>", "planType": "free" },
  "requiresOpenaiAuth": true,
  "workspaceRouting": { "chatgptAccountId": "<len 36 sha256:2363b661>", "backendOrigin": "https://chatgpt.com", "accountRoutingOverride": "NO_CONSTRAINT" } }
account/rateLimits/read keys [ordinaryUsageAllowed, rateLimits, rateLimitsByLimitId, rateLimitResetCredits, accountId, rateLimitUpsell] accountId <len 36 sha256:2363b661>
```

- macOS 대화상자는 뜨지 않았고 `auth.json`도 생기지 않았다.
- app-server가 프로필에 만든 파일: `goals_1.sqlite*`, `installation_id`, `logs_2.sqlite`, `memories_1.sqlite*`, `models_cache.json`, `plugins/{.remote-plugin-install-staging,cache}`, `queue_1.sqlite*`, `skills/.system`, `state_5.sqlite*`. Doan의 Codex 대화 실행도 같은 파일을 만든다. `models_cache.json`이 생긴 것으로 보아 app-server는 시작할 때 네트워크를 쓴다.
- 빈 `CODEX_HOME`에서는 `account: null`, `workspaceRouting: null`이었다.
- 조회 시간 하한(P1, 2026-11-01 KST, `codex-cli 0.164.0`, 호스트 `gangsinhyeog-ui-MacBookPro-3.local`): 매회 새로 만든 빈 임시 `CODEX_HOME`에서 프로세스 시작부터 `account/read` 응답까지 5회 측정했다. 모두 종료 코드 0과 `account: null`을 반환했고, 중앙값은 100.252ms, 최대는 102.668ms였다. 최대가 2.5초 미만이므로 5초 예산을 유지한다. 로그인된 프로필의 조회 시간은 R1에서 확인한다.

### Antigravity ACP 서버 1.3.0 (`<userData>/agent-runtimes/antigravity-acp/1.3.0/agy_acp_server.par`)

| 후보 | 결과 | 근거 |
|---|---|---|
| `initialize` 응답 | 계정 없음. `agentCapabilities`, `authMethods`(4개), `agentInfo`만 있다 | 실측: 빈 임시 HOME, `GEMINI_HOME`, `AGY_ACP_FORCE_FILE_STORAGE=1`, `BROWSER=/usr/bin/false`로 `initialize`만 보냄(`.scratch/account-identity/agy-initialize.out`) |
| `authenticate` 응답 | 빈 `AuthenticateResponse()` | 서버 소스(바이너리 안 Python 원문) `acp_server/server.py` `async def authenticate` |
| `session/new` 응답 | `session_id`, `config_options`, `models`, `modes`만 | 같은 파일 `NewSessionResponse(` |
| `loadCodeAssist`·`fetchUserInfo`(CCPA) | 이메일 필드 없음. tier·project·region만 | 바이너리 안 discovery 문서의 `LoadCodeAssistResponse`, `FetchUserInfoResponse` |
| 서버 로그 | 이메일을 남기지 않는다 | `ccpa_connection/oauth_manager.py`의 `_fetch_account_email`은 `AGY_ACP_CCPA_PROJECT` 내부 계정 확인에만 쓰이고 로그에 이메일을 쓰지 않는다 |
| Google OIDC userinfo | **선택.** 서버 자신도 이메일을 이 길로만 얻는다 | `oauth_manager.py`: `_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"`, `Authorization: Bearer <access token>`, `info.get("email")`. 동의 범위에 `https://www.googleapis.com/auth/userinfo.email`이 있다(`_DEFAULT_SCOPES`) |

- 저장 파일: `oauth/credential_manager.py` `_save_credentials`는 `client_id`, `client_secret`, `refresh_token`, `token_uri`, `scopes`(google-auth `Credentials.scopes`, 문자열 배열)와 `project_id`만 쓴다. access token·`id_token`·만료 시각은 저장하지 않는다. 그래서 Doan이 이메일을 얻으려면 refresh-token grant로 access token을 직접 받아야 한다.
- 실제 userinfo 응답은 보지 못했다. 서명된 Antigravity 연결의 자격증명은 Doan 금고(`doan Safe Storage`로 암호화)에 있어, Doan 앱 밖에서 읽으면 키체인 대화상자가 뜰 수 있다. 실 응답 확인은 tasks R1로 미룬다.

### 참고: Orca 1.4.243

`/Applications/Orca.app/Contents/Resources/app.asar` → `out/main/index.js`(코디네이터가 풀어 둔 `/private/tmp/claude-501/orca-asar/x`에서 `chatgpt_account_id` 검색). Orca는 Codex `auth.json`의 `tokens.id_token`(JWT) 클레임을 풀어 email(`email` 또는 `https://api.openai.com/profile`.`email`), 계정 ID(`tokens.account_id` 또는 `https://api.openai.com/auth`.`chatgpt_account_id`), 워크스페이스 라벨(`workspace_name`, 없으면 `chatgpt_plan_type`에서 "Personal (Plus)", "Team" 등)을 얻는다. Doan의 Codex 프로필은 `auth.json`이 아니라 키체인에 자격증명을 두므로 이 방식을 쓸 수 없고, app-server가 같은 이메일을 준다. 같은 파일에 `acp_token`·`userinfo` 문자열이 없어, Orca는 Antigravity 계정을 보이지 않는 것으로 보인다. Orca 코드와 자격증명은 실행 중에 쓰지 않는다.

## 2. 설계

### 영향 받는 부분

- **app main** `app/src/main/agentAuth/`: `manager.ts`(조회 단계, Codex용 작은 `rpcExec`, attempt별 abort), `providers.ts`(`ProviderAuth.identity` 필드, `label` export), 새 파일 `identity.ts`(순수 함수).
- **app renderer**: 코드 변화 없음. `agentAuthView.ts`의 `detail` 주석("null when a connected account has nothing to show (Codex, Antigravity)")만 고친다. 계정 줄은 이미 `email ?? displayName`을 보인다.
- **CLI(Go)·스킬·형식**: 바뀌지 않는다. `AuthStatusDto.account.email`(`types.ts`)과 메타데이터 v1 `account.email`(`metadata.ts` `validAccount`)은 이미 있다. `app-socket.v2` 스키마는 계정 이메일을 싣지 않는다.

### 조회 단계 (`identity`)

`ProviderAuth`에 `identity: "codex-app-server" | "google-userinfo" | null`을 둔다. Codex와 Antigravity만 값이 있고, 나머지(그리고 기존 manager 테스트의 가짜 provider 동작)는 `null`이라 조회하지 않는다. 조회 결과는 `{ email } | null`이다. `id`·`workspace`는 언제나 status의 값(`null`)이다.

| 언제 | 위치 | `previous` |
|---|---|---|
| 로그인 | `signInFlow`의 `statusRun` 다음, vault seal·scrub 전. 로그인 중인 `profile`(Codex 교체면 staging 프로필)에서 | `null`. 교체 로그인에 이전 계정의 이메일을 붙이지 않는다 |
| check | `check`에서 `statusRun` 다음. Codex는 hold 안, Antigravity 요청은 `drop` 뒤(아래) | 결과를 적용하는 시점의 `this.state(provider).connection?.account` |
| `runConfirmed`(Copilot) | 조회하지 않는다 | — |

조회는 마지막 취소 지점과 메타데이터 커밋 앞에 있어, 커밋 뒤에 실패할 수 있는 단계가 생기지 않는다(POSTMORTEM 2026-10-29). 조회가 끝나면 취소 여부를 다시 확인한다.

**시간 예산**: provider마다 조회 전체에 5초 하나를 둔다(Codex는 프로세스 시작부터 응답까지, Antigravity는 두 요청 합). 예산은 attempt의 `AbortController`와 합쳐, `stop(attemptId)`(로그인 취소, sign-in·sign-out이 check를 대체할 때, quit)가 조회를 바로 끝낸다. 5초는 P1·R1 측정으로 확인한다.

**Codex**: manager에 작은 `rpcExec`를 둔다.

- spawn은 `this.options.spawn(command, [...auth.args, "app-server"], { input: true })`, 환경은 `launch(provider, attemptId, {}, profile)`라 staging 프로필도 된다. 프로세스는 attempt의 `processes`에 들어가고, 끝나면 그룹이 사라질 때까지 기다린다.
- 메시지는 대화 runner의 Codex dispatcher(`conversation/dispatcher.ts`)로 주고받는다. `AcpConnection`은 `jsonrpc: "2.0"`이 없는 메시지를 거절해 쓸 수 없다. dispatcher의 요청별 제한과 별개로 위 5초 예산이 전체를 끊는다.
- `initialize`(`clientInfo`, `capabilities.experimentalApi: true` — PoC와 대화 runner `runners.ts`와 같게) → `initialized` → `account/read { refreshToken: false }`. `account.type === "chatgpt"`이고 `email`이 `label` 규칙(`providers.ts`)에 맞을 때만 쓴다.
- 같은 `CODEX_HOME`에서 대화 app-server와 겹쳐도 건너뛰지 않는다. Codex 대화는 지금도 대화마다 app-server를 두고 `codex login status` check도 그 옆에서 돈다. 여러 프로세스가 같은 키체인 항목의 토큰을 갱신할 때의 위험은 이 feature 전부터 있는 것이고, 조회 하나가 새로 만드는 위험이 아니다(Z1 'Known limits').

**Antigravity**: 서버 status 프로세스가 끝난 뒤,

1. hold 안에서 프로필의 working copy `.gemini/antigravity-acp/acp_token.json`을 storage와 같은 방식(링크 거부)으로 읽어 필요한 값만 메모리에 둔다.
2. `drop` 뒤, 결과 적용 전에 두 요청을 보낸다. 로그인에서는 seal·scrub 전에 1을 하고, 요청도 그 자리에서 보낸다(hold·drop이 없는 흐름).
   - `POST https://oauth2.googleapis.com/token` (`application/x-www-form-urlencoded`: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`). 응답의 `access_token`만 쓴다.
   - `GET https://www.googleapis.com/oauth2/v3/userinfo`, `Authorization: Bearer <access_token>`. 응답의 `email`을 쓴다. `email_verified === false`면 쓰지 않는다.

요청을 hold 밖에 두는 이유: quit은 5초 기다린 뒤 hold를 강제로 놓는다(`manager.ts` `QUIT_WAIT_MS`). 그 뒤 늦게 끝난 check가 `drop`하면 이미 지운 working copy를 빈 사본으로 흡수해 금고를 비울 수 있다. 지금 check 안의 일은 모두 멈출 수 있는 프로세스라 이 길에 닿지 않는다. 멈출 수 없는 네트워크 요청을 hold 안에 넣으면 이 길이 열린다.

보안 제약:

- 파일의 `token_uri`가 정확히 `https://oauth2.googleapis.com/token`이 아니면 요청하지 않는다. 바뀐 파일이 client secret과 refresh token을 다른 곳으로 보내지 못하게 한다. userinfo 주소는 코드의 상수다.
- `scopes`가 문자열 배열이고 `https://www.googleapis.com/auth/userinfo.email`을 담지 않으면 요청하지 않는다.
- access token은 함수 안 변수로만 있고 반환값·상태·메타데이터·로그·`detail`·창에 나가지 않는다. 오류 기록에는 HTTP 상태와 Google `error` 코드만 남긴다.
- 응답에 `refresh_token`이 있어도 쓰지 않고 파일을 고치지 않는다. 있으면 값 없이 "Google returned a refresh token; Doan ignored it" 경고를 남긴다. Google이 이 클라이언트의 refresh grant에 새 refresh token을 주는지, 줄 때 이전 것이 무효가 되는지는 확인하지 않았다(R1에서 이 경고와 그 뒤 check·대화 성공으로 확인).
- 요청은 main의 `fetch`로 하고, 테스트를 위해 `AuthManagerOptions.fetch`로 주입한다. 서버 다운로드(`antigravity.ts`)와 같이 프록시 환경 변수를 따르지 않는다(알려진 한계).

**서버 토큰 파일과의 관계**: Doan은 파일을 읽기만 한다. working copy write-back 규칙은 그대로다. Doan이 받은 access token은 서버의 토큰과 따로 존재하고 서버 상태를 바꾸지 않는다.

### 실패

조회는 결과를 바꾸지 않는다. 다음은 모두 "조회 없음"이다: 프로세스 시작 실패·종료, 5초 예산 초과, JSON-RPC 오류, 응답 모양 다름, `account: null`·`type !== "chatgpt"`, HTTP 오류(`invalid_grant`, 401, 5xx), `fetch` 거절(네트워크 없음), 파일 없음·JSON 아님·모양 다름, 위 보안 제약 위반.

- 로그인: 이메일 없이 그대로 커밋한다. 상태 코드·`sign_in_failed`는 생기지 않는다.
- check: `withIdentity`가 `previous`(적용 시점의 상태 계정)의 `email`을 결과에 싣는다. 그래서 같은 앱 세션에서 한 번 보인 이메일은 이후 조회가 실패해도 사라지지 않는다. `state.ts`의 `checked` 처리(`stored.id === null`이면 결과 계정으로 바꾼다)는 바꾸지 않는다.
- 조회가 실패해도 연결은 `verified`가 되어 자동 check가 다시 돌지 않는다. 그래서 첫 조회가 실패하면 그 앱 세션 동안 계정 줄이 빈다(spec 완료 조건 3).
- check가 sign-in·sign-out에 대체되면 늦게 온 결과는 기존 규칙대로 `stale`이고, abort로 남은 요청도 멈춘다.
- 실패는 `console.error`로 provider와 원인 종류만 남긴다.
- 알려진 한계: 실행 중인 에이전트가 전용 프로필에서 다른 계정으로 다시 로그인하면(`state.ts`의 "A login inside the dedicated HOME can replace the account" 주석), `id: null`인 provider는 이를 알아채지 못한다. 다음 조회가 성공할 때까지 이전 이메일이 보일 수 있다.

### 순수 함수 (`/tdd` 대상, `identity.ts`)

| 함수 | 입력 → 출력 |
|---|---|
| `codexAccountEmail(reply)` | `account/read` 결과 → `string | undefined` (`type === "chatgpt"`, `label` 규칙) |
| `googleRefreshRequest(file)` | `acp_token.json` 내용(unknown) → `{ url, body } | null` (JSON 객체, `token_uri` 일치, `scopes` 배열과 `userinfo.email`, 필드 문자열, form 인코딩) |
| `googleAccessToken(reply)` | token 응답 → `{ token: string | null, refreshTokenReturned: boolean }` |
| `googleEmail(reply)` | userinfo 응답 → `string | undefined` (`email_verified === false` 제외) |
| `withIdentity(account, found, previous)` | 상태 계정, 조회 결과(`{ email } | null`), `previous`(`AccountIdentity | null`) → 결과 계정. `found`가 `null`이면 `previous?.email`을 쓴다. `id`·`workspace`·`displayName`은 `account`의 것 |

### 형식 변경

없다. JSON Schema, 메타데이터 버전(v1), `AuthStatusDto`, socket·CLI 응답이 그대로다.

### Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙에 닿지 않는다.

## 3. 결정 영향

### ARCHITECTURE §7 Antigravity 신원 조회 예외 (사용자 승인 2026-11-01)

지금 ARCHITECTURE §7은 "Doan uses each provider's official login; it ships no OAuth client of its own"이고, 금고는 provider 자격증명 파일을 바이트로만 다룬다. 구현 뒤 §7에는 기존 'GitHub token exception' 문단처럼 이름 붙은 예외 하나를 더한다.

- **Antigravity identity exception**: Antigravity 계정 이메일을 보이기 위해서만, Doan은 자기 연결의 working copy에서 Google 클라이언트와 refresh token을 읽어 refresh grant 한 번과 OIDC userinfo 한 번을 요청한다. 다른 provider나 다른 API로 넓히려면 따로 결정한다.
- access token은 메모리에만 두고, 자격증명 파일을 쓰거나 바꾸지 않는다. `token_uri`는 Google token 주소와 정확히 같아야 한다. 외부 자격증명(Orca, 터미널, 기본 프로필)은 여전히 읽지 않는다.
- 조회가 실패해도 로그인·check·실행은 실패하지 않는다.
- Doan이 자기 OAuth 클라이언트를 갖지 않는다는 규칙은 남는다. 쓰는 클라이언트는 provider 로그인이 저장한 것이다.
- ARCHITECTURE §9 "Doan does not handle GitHub tokens"와는 다른 문제다. Google access token은 이 조회에만 메모리에서 쓰인다.

### Codex 저장 방식 (사용자 결정 2026-11-01)

키체인(`cli_auth_credentials_store="keyring"`)을 유지하고 `account/read`를 쓴다. 비교한 대안은 `cli_auth_credentials_store="file"`로 `auth.json`을 금고 working copy로 두는 방식(Cursor·Copilot 패턴, Orca의 `id_token` 읽기)이다.

- 대안의 이점: 프로세스 없이 `id_token` 클레임을 읽는다. `chatgpt_user_id`가 실제 토큰에 있다면 사람 단위 ID가 될 수 있다(미확인).
- 대안의 비용: Codex 대화는 대화마다 상주 app-server를 두어, 평문 `auth.json`(access·refresh·id token)이 대화가 열린 동안 거의 계속 디스크에 있다. OpenAI refresh token이 회전하면 늦거나 실패한 write-back(크래시)이 금고의 토큰을 무효로 만들 수 있고, 시작 시 흡수 규칙은 Codex로 검증된 적이 없다. 기존 키체인 연결은 옮기려면 키체인을 읽어야 해(대화상자 위험) 사실상 다시 로그인해야 한다. ARCHITECTURE §7("an `auth.json` fallback fails the sign-in")과 PRODUCT §3 In scope 7("credentials in the OS keychain (Claude Code, Codex)")을 바꾸고, 실 로그인·갱신·staging 교체를 다시 검증해야 한다.
- 이미 정한 "이메일만, `id: null`"에는 대안이 더 주는 것이 없다. 사람 단위 Codex ID가 필요해지면 다시 본다(PRODUCT 'Open questions', Z1).

### ID를 쓰지 않는 이유

- Codex(사용자 결정): `chatgptAccountId`는 ChatGPT 계정·워크스페이스 ID라 Team·Business에서는 구성원이 같은 값을 가질 수 있다. 사람 단위 ID로 쓰면 다른 사람의 대화가 재개될 수 있다. 또 experimental 필드라 버전마다 바뀔 수 있다.
- Antigravity `sub`(설계 판단, 코디네이터 수락 2026-11-01): `sub`는 안정 ID지만, 저장된 ID가 있으면 `state.ts`의 check가 결과 ID와 다를 때 `account_mismatch`(재시도 불가)를 낸다. 일시적인 조회 실패가 `id: null`을 내면 계정 불일치로 읽혀 실행이 막힌다. 이를 막으려면 "조회 불가" 상태를 상태 기계에 새로 넣어야 한다. 이번 요구는 표시이고 재개 범위 확장은 요청되지 않았다. 열린 질문으로 남긴다(Z1).

### 저장하지 않는 이유 (코디네이터 결정 2026-11-01)

check는 sign-in·sign-out의 쓰기 슬롯(`writer`) 밖에서 돈다. check가 메타데이터를 읽고 고쳐 쓰면 동시에 커밋하는 로그인과 경합한다(POSTMORTEM 2026-10-29: 커밋 경계와 실패 가능 단계). 로그인 커밋은 이미 `checked.account`를 저장하므로 새 로그인은 이메일이 저장된다.

### PoC 의존

- Antigravity userinfo 실 응답 모양과, Doan의 refresh grant 뒤에도 서버 토큰이 계속 쓰이는지는 실측하지 않았다(R1).
- Codex 조회 시간은 재지 않았다. 5초 예산의 근거는 P1(빈 프로필, 하한)과 R1(서명된 프로필)이다.

## 4. POSTMORTEM에서 가져온 함정

- **2026-10-29 교체 로그인이 연결을 잃음**: "keep every fallible step before the metadata write". 조회는 커밋 전에 두고, 실패해도 예외를 던지지 않는다. `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts`로 커밋 뒤에 조회가 없음을 확인한다.
- **2026-10-30 격리 HOME의 키체인**: 격리 HOME에서는 `codex`(keyring)와 Electron `safeStorage`가 기본 키체인을 찾지 못한다. 실제 확인은 실제 HOME의 서명된 프로필에서, 코디네이터 승인 뒤 한다.
- **2026-10-30 Codex 로그인 페이지 두 번**: provider CLI가 직접 하는 일을 실제로 확인한다. app-server가 시작할 때 네트워크를 쓰고 파일을 만든다는 것을 §1에서 관찰했다.
