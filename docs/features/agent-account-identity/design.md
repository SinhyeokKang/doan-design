# agent-account-identity — design

## 1. 조사 결과 (2026-11-01, PoC는 `.scratch/account-identity/`)

토큰·비밀·전체 이메일은 기록하지 않았다. 이메일은 도메인만, ID는 길이와 sha256 앞 8자만 남겼다.

### Codex 0.164.0 (`/opt/homebrew/bin/codex`, `codex-cli 0.164.0`)

| 후보 | 결과 | 근거 |
|---|---|---|
| `codex login status` | 계정 없음. 로그인 상태면 "Logged in using ChatGPT"만 출력한다 | 바이너리 문자열(`@openai/codex-darwin-arm64/.../bin/codex`): "Logged in using ChatGPT", "…access token", "…personal access token" 등 |
| app-server `account/read` | **선택.** `{ account: { type: "chatgpt", email, planType }, requiresOpenaiAuth, workspaceRouting }` | 스키마: `codex app-server generate-json-schema [--experimental] --out <dir>` → `v2/GetAccountParams.json`(`refreshToken?: boolean`), `v2/GetAccountResponse.json`. `email`·`planType`은 안정 필드, `workspaceRouting`(`chatgptAccountId`, `backendOrigin`, `accountRoutingOverride`)은 `--experimental`에만 있다 |
| app-server `account/rateLimits/read` | `accountId`가 `workspaceRouting.chatgptAccountId`와 같다. 네트워크 요청이고 쓰지 않는다 | 실측 아래 |
| Doan 프로필 키체인 항목 내용 | 읽지 않았다. 대화상자 위험이 있고 app-server가 같은 값을 준다 | — |

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
- 걸린 시간은 재지 않았다(tasks P1).

### Antigravity ACP 서버 1.3.0 (`<userData>/agent-runtimes/antigravity-acp/1.3.0/agy_acp_server.par`)

| 후보 | 결과 | 근거 |
|---|---|---|
| `initialize` 응답 | 계정 없음. `agentCapabilities`, `authMethods`(4개), `agentInfo`만 있다 | 실측: 빈 임시 HOME, `GEMINI_HOME`, `AGY_ACP_FORCE_FILE_STORAGE=1`, `BROWSER=/usr/bin/false`로 `initialize`만 보냄(`.scratch/account-identity/agy-initialize.out`) |
| `authenticate` 응답 | 빈 `AuthenticateResponse()` | 서버 소스(바이너리 안 Python 원문) `acp_server/server.py` `async def authenticate` |
| `session/new` 응답 | `session_id`, `config_options`, `models`, `modes`만 | 같은 파일 `NewSessionResponse(` |
| `loadCodeAssist`·`fetchUserInfo`(CCPA) | 이메일 필드 없음. tier·project·region만 | 바이너리 안 discovery 문서의 `LoadCodeAssistResponse`, `FetchUserInfoResponse` |
| 서버 로그 | 이메일을 남기지 않는다 | `ccpa_connection/oauth_manager.py`의 `_fetch_account_email`은 `AGY_ACP_CCPA_PROJECT` 내부 계정 확인에만 쓰이고 로그에 이메일을 쓰지 않는다 |
| Google OIDC userinfo | **선택.** 서버 자신도 이메일을 이 길로만 얻는다 | `oauth_manager.py`: `_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"`, `Authorization: Bearer <access token>`, `info.get("email")`. 동의 범위에 `https://www.googleapis.com/auth/userinfo.email`이 있다(`_DEFAULT_SCOPES`) |

- 저장 파일: `oauth/credential_manager.py` `_save_credentials`는 `client_id`, `client_secret`, `refresh_token`, `token_uri`, `scopes`와 `project_id`만 쓴다. access token·`id_token`·만료 시각은 저장하지 않는다. 그래서 Doan이 이메일을 얻으려면 refresh-token grant로 access token을 직접 받아야 한다.
- 실제 userinfo 응답은 보지 못했다. 서명된 Antigravity 연결의 자격증명은 Doan 금고(`doan Safe Storage`로 암호화)에 있어, Doan 앱 밖에서 읽으면 키체인 대화상자가 뜰 수 있다. 실 응답 확인은 tasks R1로 미룬다.

### 참고: Orca 1.4.243

`/Applications/Orca.app/Contents/Resources/app.asar` → `out/main/index.js`(코디네이터가 풀어 둔 `/private/tmp/claude-501/orca-asar/x`에서 `chatgpt_account_id` 검색). Orca는 Codex `auth.json`의 `tokens.id_token`(JWT) 클레임을 풀어 email(`email` 또는 `https://api.openai.com/profile`.`email`), 계정 ID(`tokens.account_id` 또는 `https://api.openai.com/auth`.`chatgpt_account_id`), 워크스페이스 라벨(`workspace_name`, 없으면 `chatgpt_plan_type`에서 "Personal (Plus)", "Team" 등)을 얻는다. Doan의 Codex 프로필은 `auth.json`이 아니라 키체인에 자격증명을 두므로 이 방식을 쓸 수 없고, app-server가 같은 이메일을 준다. 같은 파일에 `acp_token`·`userinfo` 문자열이 없어, Orca는 Antigravity 계정을 보이지 않는 것으로 보인다. Orca 코드와 자격증명은 실행 중에 쓰지 않는다.

## 2. 설계

### 영향 받는 부분

- **app main** `app/src/main/agentAuth/`: `manager.ts`(조회 단계 추가), `providers.ts`(provider별 조회 정의), 새 파일 `identity.ts`(순수 함수와 조회 I/O).
- **app renderer**: 코드 변화 없음. `agentAuthView.ts`의 `detail` 주석("null when a connected account has nothing to show (Codex, Antigravity)")만 고친다. 계정 줄은 이미 `email ?? displayName`을 보인다.
- **CLI(Go)·스킬·형식**: 바뀌지 않는다. `AuthStatusDto.account`와 메타데이터 v1 `account.email`은 이미 있다.

### 조회 단계 (`identity`)

provider status가 `connected`를 돌려준 뒤, 같은 attempt 안에서 한 번 계정을 조회한다. 결과는 `CheckResult.account`의 `email`(과 `displayName`)만 채운다. `id`·`workspace`는 언제나 `null`이다.

| 언제 | 위치 | 조건 |
|---|---|---|
| 로그인 | `signInFlow`의 `statusRun` 다음, vault seal·scrub 전 | 로그인 중인 `profile`(Codex 교체면 staging 프로필)에서. 마지막 취소 지점 앞이라 커밋 뒤에 실패할 수 있는 단계가 생기지 않는다(POSTMORTEM 2026-10-29 교체 로그인) |
| check | `check`의 `hold` 안, `statusRun` 다음, `drop` 전 | Antigravity working copy가 프로필에 있을 때 읽는다 |
| `runConfirmed`(Copilot) | 조회하지 않는다 | Copilot은 대상이 아니다 |

**Codex**: 프로필에서 `codex <adapter args> app-server`를 띄워 `initialize`(`clientInfo`만, `experimentalApi` 없음) → `initialized` → `account/read { refreshToken: false }`을 보내고 프로세스 그룹을 닫는다. `account.type === "chatgpt"`이고 `email`이 라벨 규칙(`providers.ts` `label`)에 맞을 때만 쓴다. 프로세스는 attempt의 프로세스 집합에 들어가 취소·종료·quit가 함께 멈춘다.

- **같은 프로필의 다른 app-server와 겹치지 않는다**: 이 provider에 Doan 대화나 lease가 있으면(`running` 또는 `leased`) Codex 조회를 건너뛴다. 두 app-server가 같은 `CODEX_HOME`에서 각자 토큰을 갱신하면 한쪽의 refresh token이 무효가 될 수 있다. 로그인의 staging 프로필은 다른 `CODEX_HOME`이라 해당하지 않는다.
- line JSON-RPC는 기존 도우미를 쓴다(`conversation/acp.ts` `AcpConnection` 또는 `runners.ts`의 Codex dispatcher 중 Codex `initialize`와 맞는 것). 새 의존성은 없다.

**Antigravity**: 서버 status 프로세스가 끝난 뒤, 프로필의 working copy `.gemini/antigravity-acp/acp_token.json`을 읽어 main에서 두 번 요청한다.

1. `POST https://oauth2.googleapis.com/token` (`application/x-www-form-urlencoded`: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`). 응답의 `access_token`만 쓴다.
2. `GET https://www.googleapis.com/oauth2/v3/userinfo`, `Authorization: Bearer <access_token>`. 응답의 `email`을 쓴다. `email_verified === false`면 쓰지 않는다.

보안 제약:

- 파일의 `token_uri`가 정확히 `https://oauth2.googleapis.com/token`이 아니면 요청하지 않는다. 바뀐 파일이 client secret과 refresh token을 다른 곳으로 보내지 못하게 한다. userinfo 주소는 코드의 상수다.
- `scopes`에 `https://www.googleapis.com/auth/userinfo.email`이 없으면 요청하지 않는다.
- access token은 함수 안 변수로만 있고 반환값·상태·메타데이터·로그·`detail`·창에 나가지 않는다. 오류 기록에는 HTTP 상태와 Google `error` 코드만 남긴다.
- 응답에 `refresh_token`이 있어도 쓰지 않고 파일을 고치지 않는다. Doan은 자격증명 파일에 쓰지 않는다. Google이 이 클라이언트의 refresh grant에 새 refresh token을 주는지, 줄 때 이전 것이 무효가 되는지는 확인하지 않았다(tasks R1에서 응답에 `refresh_token` 키가 있는지 기록하고, 조회 뒤 check와 새 대화가 성공하는지로 확인).
- 요청은 Electron main의 전역 `fetch`로 하고, 각 요청에 10초 제한을 둔다. 서버 다운로드(`antigravity.ts`)와 같이 프록시 환경 변수를 따르지 않는다(알려진 한계).

**서버 토큰 파일과의 관계**: 조회는 서버 프로세스가 끝난 뒤 hold 안에서 파일을 읽기만 한다. working copy write-back(마지막 프로세스가 바뀐 사본을 금고에 쓰는 규칙)은 그대로다. Doan이 받은 access token은 서버의 토큰과 따로 존재하고 서버 상태를 바꾸지 않는다.

### 실패

조회는 결과를 바꾸지 않는다. 다음은 모두 "조회 없음"으로 처리한다: 프로세스 시작 실패·종료, 시간 초과(Codex 10초, Antigravity 요청마다 10초), JSON-RPC 오류, 응답 모양 다름, `account: null`·`type !== "chatgpt"`, HTTP 오류, `invalid_grant`, 파일 없음·모양 다름, 위 보안 제약 위반, Codex 실행 중 건너뜀.

- 로그인: 이메일 없이 그대로 커밋한다. 상태 코드·`sign_in_failed`는 생기지 않는다.
- check: 저장된 연결이 있으면 그 연결의 `email`·`displayName`을 결과에 그대로 싣는다. 같은 연결 안에서는 로그인이 바뀌지 않으므로(교체는 새 연결 ID) 이전 값이 맞다. `state.ts`의 `checked` 처리(`stored.id === null`이면 결과 계정으로 바꾼다)는 바꾸지 않는다.
- 취소: 조회 중 취소는 기존처럼 `Cancelled`로 끝난다. 조회가 취소 판단을 늦추지 않도록 조회 뒤 다시 확인한다.
- 실패는 `console.error`로 provider와 원인 종류만 남긴다.

### 순수 함수 (`/tdd` 대상)

| 함수 | 입력 → 출력 |
|---|---|
| `codexAccountEmail(reply)` | `account/read` 결과 → `string | undefined` (`type === "chatgpt"`, 라벨 규칙) |
| `googleRefreshRequest(file)` | `acp_token.json` 내용 → `{ url, body } | null` (`token_uri`·scope·필드 검사, form 본문) |
| `googleAccessToken(reply)` | token 응답 → `string | null` |
| `googleEmail(reply)` | userinfo 응답 → `string | undefined` (`email_verified === false` 제외) |
| `withIdentity(account, found, previous)` | 상태 계정, 조회 결과(`{ email?, displayName? } | null`), 저장된 연결 계정 → 결과 계정. `null`이면 `previous`의 표시 필드를 쓴다. `id`·`workspace`는 `account`의 것 |
| `skipCodexIdentity(running, leased)` | 건너뛸지 |

### 형식 변경

없다. JSON Schema, 메타데이터 버전(v1), `AuthStatusDto`, socket·CLI 응답이 그대로다.

### Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙에 닿지 않는다.

## 3. 결정 영향

### ARCHITECTURE §7 경계 확장 (사용자 승인 2026-11-01)

지금 ARCHITECTURE §7은 "Doan uses each provider's official login; it ships no OAuth client of its own"이고, 금고는 provider 자격증명 파일을 바이트로만 다룬다. 이 feature 뒤 규칙은 이렇다(구현 뒤 §7에 적는다):

- Doan은 연결된 계정을 보이기 위해서만, 자기 연결에 저장된 provider의 OAuth 클라이언트와 refresh token으로 읽기 전용 신원 조회를 할 수 있다. 지금은 Antigravity의 Google userinfo 하나다.
- access token은 메모리에만 두고, 자격증명 파일을 쓰거나 바꾸지 않으며, 신원 조회 외 API를 부르지 않는다. 외부 자격증명(Orca, 터미널, 기본 프로필)은 여전히 읽지 않는다.
- 조회가 실패해도 로그인·check·실행은 실패하지 않는다.
- Doan이 자기 OAuth 클라이언트를 갖지 않는다는 규칙은 남는다. 쓰는 클라이언트는 provider 로그인이 저장한 것이다.
- ARCHITECTURE §9 "Doan does not handle GitHub tokens"와는 다른 문제다. Google access token은 이 조회에만 메모리에서 쓰인다.

### ID를 쓰지 않는 이유

- Codex(사용자 결정): `chatgptAccountId`는 ChatGPT 계정·워크스페이스 ID라 Team·Business에서는 구성원이 같은 값을 가질 수 있다. 사람 단위 ID로 쓰면 다른 사람의 대화가 재개될 수 있다. 또 experimental 필드라 버전마다 바뀔 수 있다.
- Antigravity `sub`(이 feature의 판단, 코디네이터 수락 2026-11-01): `sub`는 안정 ID지만, 저장된 ID가 있으면 `state.ts`의 check가 결과 ID와 다를 때 `account_mismatch`(재시도 불가)를 낸다. 일시적인 조회 실패가 `id: null`을 내면 계정 불일치로 읽혀 실행이 막힌다. 이를 막으려면 "조회 불가" 상태를 상태 기계에 새로 넣어야 한다. 이번 요구는 표시이고 재개 범위 확장은 요청되지 않았다. 열린 질문으로 남긴다(tasks Z1).

### 저장하지 않는 이유 (코디네이터 결정 2026-11-01)

check는 sign-in·sign-out의 쓰기 슬롯(`writer`) 밖에서 돈다. check가 메타데이터를 읽고 고쳐 쓰면 동시에 커밋하는 로그인과 경합한다(POSTMORTEM 2026-10-29: 커밋 경계와 실패 가능 단계). 로그인 커밋은 이미 `checked.account`를 저장하므로 새 로그인은 이메일이 저장된다.

### PoC 의존

- Antigravity userinfo 실 응답 모양과, Doan의 refresh grant 뒤에도 서버 토큰이 계속 쓰이는지는 실측하지 않았다(tasks R1).
- Codex 조회 시간(app-server 시작 + `account/read`)은 재지 않았다(tasks P1).

## 4. POSTMORTEM에서 가져온 함정

- **2026-10-29 교체 로그인이 연결을 잃음**: "keep every fallible step before the metadata write". 조회는 커밋 전에 두고, 실패해도 예외를 던지지 않는다. `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts`로 커밋 뒤에 조회가 없음을 확인한다.
- **2026-10-30 격리 HOME의 키체인**: 격리 HOME에서는 `codex`(keyring)와 Electron `safeStorage`가 기본 키체인을 찾지 못한다. 실제 로그인 확인은 실제 HOME의 서명된 프로필에서, 코디네이터 승인 뒤 한다.
- **2026-10-30 Codex 로그인 페이지 두 번**: provider CLI가 직접 하는 일을 실제로 확인한다. app-server가 시작할 때 네트워크를 쓰고 파일을 만든다는 것을 §1에서 관찰했다.
