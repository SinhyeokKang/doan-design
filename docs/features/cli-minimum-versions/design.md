# cli-minimum-versions — design

## 영향받는 구성 요소

- **app(TS)**: 상수와 그 테스트가 중심이다. 실험 결과에 따라 Claude registry를 읽는 코드가 바뀔 수 있다(아래 'floor').
  - `app/src/main/conversation/minimumVersions.ts:5` `MINIMUM_VERSIONS`.
  - `app/src/main/conversation/sessions.ts:10-13` `CODEX_ROLLOUT_FLOOR`, `CLAUDE_REGISTRY_FLOOR`.
  - 버전을 적은 테스트와 주석: `sessions.test.ts`, `prepare.test.ts`, `facts.test.ts`, `about.test.ts`, `SettingsAbout.test.tsx`, `io.test.ts`, `providers.test.ts`, `providers.ts`의 provider 주석, `conversation/fixtures/README.md`.
- **CLI(Go)·skills·guide·`doan check`**: 바뀌지 않는다.
- **renderer**: 코드는 바뀌지 않는다. 표시하는 숫자만 `MINIMUM_VERSIONS`를 따라간다.
- **공유 포맷**: 바뀌지 않는다(아래 '포맷 변경').

## 지금 구조 (조사)

### 최소 버전과 floor

- **최소 버전(minimum)**: 지금 설치된 실행 파일의 버전을 판정하는 기준이다. `--version` 출력에서 처음 나오는 `x.y.z`를 자리별 숫자로 비교한다. suffix(Cursor의 build hash 등)는 비교하지 않고, `x.y.z`가 없으면 `unknown`이다(`sessions.ts:14-32`, ARCHITECTURE.md:433). Cursor는 `2026.10.22-27dcf5f`처럼 날짜 모양이지만 같은 규칙으로 비교한다(`facts.test.ts:16`).
- **floor**: 앞서 저장된 세션 기록 안의 버전을 판정하는 기준이다. 저장된 세션은 그것을 쓴 버전을 계속 담고 있으므로 floor는 최소 버전을 따라가지 않는다(ARCHITECTURE.md:434, `sessions.ts:10-11`). floor는 Claude Code와 Codex에만 있다.
  - Codex: rollout 첫 줄 `session_meta`의 `cli_version`이 `CODEX_ROLLOUT_FLOOR` 0.163.0 이상이어야 그 세션이 있는 것으로 본다(`io.ts:142-171`). Codex는 resume할 때 이 header를 다시 쓰지 않는다.
  - Claude: 프로필 `sessions/<pid>.json` registry 기록이 **하나라도** `CLAUDE_REGISTRY_FLOOR` 2.1.312 미만이거나 모양이 맞지 않으면, 그 프로필의 occupancy가 `unknown`이 되고 resume이 거절된다(`io.ts:63-86`). `procStart`, `kind`, `cwd`, `version` 필드가 필요하고, 2.1.312가 남기는 `<pid>.<sha256>.key` 파일은 건너뛴다(`io.ts:70-71`).
  - Cursor·Copilot의 저장 세션은 버전을 보지 않는다. 프로필의 세션 디렉터리(`.cursor/acp-sessions`, `.copilot/session-state`)에 그 세션이 있는지만 보고(`prepare.ts:103`), 서버가 `initialize`에서 `loadSession`을 알려야 resume한다(`acpRunner.ts:85`).
- 테스트가 "floor ≤ 최소 버전"을 고정한다(`sessions.test.ts:94-99`, `prepare.test.ts:156-159`). 최소 버전을 floor 아래로 내리면 이 테스트가 먼저 실패한다.

### 최소 버전을 읽는 곳과 사람이 보는 것

| 읽는 곳 | 판정 | 사람이 보는 것 |
|---|---|---|
| `agentAuth/facts.ts:22-35` `toolFacts` → `agentAuth/state.ts:112-113` | `version_unsupported`(action `update`), `version_unknown`(action `retry`) | Settings > Agents·첫 실행 행: "This version is older than Doan supports." + Update(`renderer/agentAuthView.ts:76`). 상태 "Needs an update"(`:163`), 메뉴 "Update…"(`:211`), "<name> needs an update"(`SettingsAgents.tsx:165`) |
| `aboutView.ts:28-30` | 표시만 | "Doan needs <최소 버전> or later.", 상태 "Update needed"(`aboutView.ts:38`) |
| `conversation/prepare.ts:43-44` (legacy external, Claude Code·Codex) | 대화마다 `--version`을 다시 읽음 | 새 대화 `runtime_unsupported`, resume·send `session_unavailable` |
| `conversation/prepare.ts:166-169` (Doan 연결, Antigravity 제외) | 위와 같음 | 위와 같음 |
| `conversation/sessions.ts:85-90` `supportedRuntime`, `sessionAvailability` | 터미널 세션 제안 | 이어 가기를 제안하지 않음 |

- 실행 중 호환성 기록(`conversation/handshake.ts`)은 Doan 연결 Codex의 `initialize`·`thread/start`와 Cursor·Copilot의 ACP `initialize`·`session/new`만 판정한다. Claude는 판정하지 않는다(`handshake.ts:23`). 그래서 오래된 Claude Code가 SDK와 맞지 않으면 Update가 아니라 턴 실패로만 보인다(ARCHITECTURE.md:576 "Claude incompatibility is never recorded").
  - 사람이 보는 것: Home은 "Claude Code stopped before it could start. Try again."(`homeComposer.ts:144`), 대화 화면은 "Claude Code stopped unexpectedly"와 "It may have changed files before it stopped."(`ConversationThread.tsx:104`)다. 그동안 Settings > Agents는 Connected, About은 "Supported"로 남고, Retry는 같은 실패를 되풀이한다.
- 최소 버전 아래 CLI로 기존 대화를 resume하거나 send하면 Update가 아니라 "<name> couldn’t continue"와 "Edit your request and send it again."(`ConversationThread.tsx:103`)을 본다. PRODUCT.md:58이 정한 동작이고 이번 작업에서 바꾸지 않는다.

### Antigravity

- 최소 버전이 없다. `MINIMUM_VERSIONS`에 키가 없고, 도구 사실은 늘 `supported`다(`facts.ts:24`). About은 "Downloaded by Doan"과 "Doan downloads its sign-in server when you first sign in."을 보인다(`aboutView.ts:29`, `:34`).
- 사람이 설치하는 CLI가 아니다. Doan이 고정 버전 1.3.0의 압축 파일을 SHA-256으로 확인하며 받고(`agentAuth/antigravity.ts:12-21`), sign-in 때 `initialize`의 `agentInfo.version`이 1.3.0인지 확인한다(`agentAuth/manager.ts:604-610`).
- 그래서 사람이 Antigravity에서 Update를 볼 길이 없다. 최소 버전을 새로 둘 필요가 없다. About은 Antigravity에 늘 "Downloaded by Doan"을 보이므로(`aboutView.ts:34`) 테스터의 Copy details로는 확인할 것이 없다. 이번 작업은 위 코드 근거를 'E 결과'에 적는 것으로 끝낸다.

### 최소 버전을 낮출 때 floor가 받는 영향

사람의 결정: 새 최소 버전이 floor 아래면 floor도 새 최소 버전까지 같이 내린다.

- **Claude**: floor가 최소 버전과 같은 2.1.312다. 최소 버전만 X(< 2.1.312)로 내리면, X가 프로필에 쓴 registry 기록 때문에 그 프로필의 모든 Claude resume이 `session_unavailable`이 된다. Doan 연결도 같다(`prepare.ts:53-56`, `:181`). 그래서 Claude 최소 버전을 낮추면 `CLAUDE_REGISTRY_FLOOR`도 X로 내린다. X의 registry 모양(필드, 디렉터리 안 다른 파일)이 `claudeOccupancy`의 검사를 통과하지 않으면 `io.ts`의 registry 읽기를 그 모양에 맞게 고칠 수 있다. 단 PID와 시작 시각으로 프로세스를 확인하는 검사와 `kind` 검사가 그대로 동작할 때만이다. "a missing, unreadable or malformed registry is unavailable, never an empty one"(ARCHITECTURE.md:442)과 PRODUCT §3 'Live terminal policy'를 지키지 못하는 모양이면 그 후보는 실패다. 고칠 수 있으면 E3의 실험 빌드에 그 수정을 넣고 통과 기준 4와 10을 그 빌드로 본다.
- **Codex**: floor가 0.163.0이다. 0.163.0까지는 floor를 바꾸지 않는다. 그 아래로 내리면 `CODEX_ROLLOUT_FLOOR`도 같이 내린다. 그러면 지금은 거절되는 오래된 rollout(예: 0.145.0이 만든 세션은 B2에서 `session_unavailable`로 거절됐다, `e47e7929`)도 새 floor 이상이면 받아들이게 된다.
- **Codex writer lock**: `codexOccupancy`는 Codex 0.164.0 이상이 `flock`으로 잡는 `thread-writer-locks/<threadId>.lock`을 읽는다(`io.ts:116-140`, ARCHITECTURE.md:442). 0.164.0 미만이 lock을 만들지 않으면 lock 디렉터리가 없어 `free`로 읽힌다. 그때 터미널 점유 판정은 `thread/resume`의 `-32600 … already has an active writer`에만 기댄다. 0.164.0 미만 후보는 legacy external 확인에서 이 거절이 나와야 통과다(PRODUCT §3 'Live terminal policy').
- floor를 낮추는 것은 대화를 버리지 않고 더 많은 저장 세션을 받아들이는 쪽이다. ARCHITECTURE.md:434는 floor를 올리는 것만 별도 결정으로 정해 두었다. Z1에서 "floor는 낮아진 최소 버전을 따라 내려간다"는 규칙을 더한다. 지금 PRODUCT.md:58과 ARCHITECTURE.md:434, `sessions.ts:10-11` 주석은 floor가 최소 버전을 따르지 않는다고 적었으므로 그 문장도 고친다.

## 확인 목록

Doan이 기대는 provider 표면이다. **조용한 실패**는 오류 없이 동작만 달라지는 경우라서, 실제 앱 확인에서 결과를 직접 봐야 한다.

### Claude Code (번들 SDK 0.3.312 + 설치된 실행 파일)

| id | 표면 | Doan이 읽는 곳 | 없을 때 | 지금까지 증거 |
|---|---|---|---|---|
| C1 | `--version` 출력 `x.y.z (Claude Code)` | `sessions.ts:24-32` | `version_unknown` | 2.1.312 이상 |
| C2 | SDK가 넘기는 실행 인자를 CLI가 받아들임: `settingSources` user/project/local, `includePartialMessages`, `resume`/`sessionId`, `model`, `effort`, `permissionMode`, `allowDangerouslySkipPermissions`, 스트리밍 입력, `canUseTool` | `runners.ts:263-274` | 프로세스가 바로 끝나 턴 실패. Update로 보이지 않음 | 2.1.312, 2.1.316, 2.1.317 |
| C3 | sign-in: `auth login`이 `BROWSER` hook으로 localhost 콜백 링크를 넘김, `auth status --json`의 `loggedIn`, 프로필 `.claude.json`의 `oauthAccount`, `auth logout` | `providers.ts:52-75`, `:121`, POSTMORTEM 2026-10-28 'Claude sign-in surfaced a manual-code link' | sign-in 실패, `check_failed`. 링크 동작이 다르면 붙여 넣기 링크로 막힘 | 2.1.312 |
| C4 | 모델 목록 `supportedModels()` | `runners.ts:304` | 모델 picker 비어 있음 | 2.1.312 이상 |
| C5 | 권한 요청: `canUseTool` | `runners.ts:286-290` | 요청 없이 실행되거나 거절 — 조용한 실패 가능 | 2.1.312 |
| C6 | 권한 모드 acceptEdits·plan·bypassPermissions, Plan 승인 뒤 `system/status`의 `permissionMode` | `permissionMode.ts:47-52`, `transport.ts:115` | 모드가 적용되지 않음 — 조용한 실패 | 2.1.316 (permission-mode P1) |
| C7 | Send now: 열린 입력 generator에 `uuid`를 단 메시지, `system/status`·`system/init`의 `user_message_uuids` echo | `transport.ts:122-124`, ARCHITECTURE.md:437 | echo가 없으면 `STEER_READ_WAIT_MS`(30 s, `runners.ts:226`) 뒤 턴이 끝나고 메시지가 queue로 돌아감 | 2.1.312, 2.1.317 |
| C8 | registry `sessions/<pid>.json` 모양(`pid`, `sessionId`, `procStart`, `cwd`, `version`, `kind`)과 디렉터리의 다른 파일 | `io.ts:63-86` | 그 프로필의 모든 resume `session_unavailable` | 2.1.312 |
| C9 | transcript 존재 확인 | `prepare.ts:57`, `:178` | resume `session_unavailable` | 2.1.312 |
| C10 | MCP: `mcp add --transport http --scope user`, pty의 `mcp login`, `mcp logout`, `mcp remove -s user`, `mcp list`, `mcp get` | `mcpConnectors/service.ts:85-87` | Connect·Remove 실패 | 2.1.317, 2.1.318 |
| C11 | credential 격리: 기본이 아닌 `CLAUDE_CONFIG_DIR`마다 따로 만드는 Keychain 항목 | `providers.ts:120` | 사람의 기본 Claude credential을 덮어씀 — 조용한 실패 | 2.1.312 (PoC 10) |
| C12 | 조직 고정: `managedSettings.forceLoginOrgUUID`, 거절 stderr "managed settings require a first-party login" | `runners.ts:229`, `:299`, ARCHITECTURE.md:552 | repo의 `apiKeyHelper`가 Doan 로그인을 대신함 — 조용한 실패. 문구가 다르면 `credential_override`가 아닌 다른 실패 | 2.1.312 |
| C13 | skill stub 찾기 `<CLAUDE_CONFIG_DIR>/skills`, 도구 셸의 `CLAUDE_CODE_SESSION_ID` | `providers.ts:112-114`, ARCHITECTURE.md:213 | 에이전트가 `doan`을 모름. 셸 `doan check`가 연결을 남기지 못함 — 조용한 실패 | 2.1.312 |

### Codex (설치된 `app-server`)

| id | 표면 | Doan이 읽는 곳 | 없을 때 | 지금까지 증거 |
|---|---|---|---|---|
| X1 | `--version` 출력 `codex-cli x.y.z` | `sessions.ts:24-32` | `version_unknown` | 0.163.0 이상 |
| X2 | `-c` 설정 키 `cli_auth_credentials_store="keyring"`(canonical `CODEX_HOME`으로 구분하는 keyring 항목), `mcp_oauth_credentials_store="keyring"`, `allow_login_shell=false` | `providers.ts:123-125`, `prepare.ts:100` | 앞의 둘을 모르면 평문 `auth.json`이 생겨 `storage_failed`. `allow_login_shell`을 모르면 도구 셸 PATH에서 번들 `doan`이 앞에 오지 않음 — 조용한 실패 | 0.164.0, 0.166.0 |
| X3 | `login`, stderr의 `login status`, `logout`, login이 기존 로그인을 먼저 지우는지 | `providers.ts:30-32`, `:104-108` | sign-in 실패. 지우는 동작이 다르면 교체 sign-in이 기존 연결을 잃음(POSTMORTEM 2026-10-29) | 0.163.0, 0.164.0 |
| X4 | `initialize {capabilities: {experimentalApi: true}}` | `runners.ts:115`, `handshake.ts:12-17` | 새 대화에서 `version_incompatible` 기록 | 0.163.0 이상 |
| X5 | `account/read` | `agentAuth/manager.ts:723` | 계정 이메일 없음 | 0.163.0 이상 |
| X6 | `model/list` | `runners.ts:120` | 모델 picker 비어 있음 | 0.164.0 이상 |
| X7 | `thread/start {cwd}`, `thread/resume {threadId}` | `runners.ts:123` | 새 대화 `version_incompatible`, resume `session_unavailable` | 0.163.0 이상 |
| X8 | ephemeral `thread/start`의 `approvalPolicy`·`sandbox`, `config/read` | `runners.ts:133-137`, `permissionMode.ts:69-81` | 응답이 없으면 열기 거절. `ephemeral`을 무시하면 rollout이 하나 더 생김 — 조용한 실패 | 0.163.0 (schema와 P2) |
| X9 | `turn/start`의 `model`, `effort`, `approvalPolicy`, `sandboxPolicy` | `runners.ts:189` | 무시하면 모드·모델이 적용되지 않음 — 조용한 실패 | 0.163.0 (P2) |
| X10 | `turn/steer {threadId, expectedTurnId, input, clientUserMessageId}`와 `userMessage` item의 `clientId` echo | `dispatcher.ts:34`, ARCHITECTURE.md:438 | Send now 실패 | 0.164.0, 0.166.0 |
| X11 | `turn/interrupt` | `runners.ts:165` | Stop이 서버 프로세스를 멈추는 쪽으로 감 | 0.163.0 이상 |
| X12 | 알림 `item/started`, `item/completed`, `item/agentMessage/delta`, `turn/completed`. 요청 `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` | `transport.ts:207-279` | 모양이 다르면 fail closed(`session_unavailable`) | 0.163.0 (생성 schema) 이상 |
| X13 | MCP: `config/mcpServer/reload`, `mcpServer/startupStatus/updated`, `mcpServer/elicitation/request`, `mcp add --url`, `mcp login`, `mcp logout`, `mcp remove`, `mcp list --json` | `runners.ts:151`, `mcpStartup.ts:45`, `mcpConnectors/codexApproval.ts:15`, `mcpConnectors/service.ts:90-92` | reload 오류는 견딤. startup 알림이 없으면 `doan-` 서버가 있는 턴마다 10 s(`startupGate.ts:12`) 기다린 뒤 "wasn’t ready" 줄을 남김 — 조용한 지연 | 0.166.0만 |
| X14 | 저장: rollout 첫 줄 `session_meta`(`id`, `cwd`, `cli_version`), writer lock 파일 | `io.ts:116-171` | resume `session_unavailable`, 점유 판정 약해짐 | 0.163.0, 0.164.0 |
| X15 | 터미널이 잡은 thread의 `thread/resume` 거절 `-32600 … already has an active writer` | ARCHITECTURE.md:442 | legacy external에서 두 writer | 0.164.0 |
| X16 | skill stub 찾기 `<CODEX_HOME>/skills`, 도구 셸의 `CODEX_THREAD_ID` 또는 `CODEX_SESSION_ID` | `providers.ts:112-114`, ARCHITECTURE.md:213 | 에이전트가 `doan`을 모름. 셸 `doan check`가 연결을 남기지 못함 — 조용한 실패 | 0.163.0, 0.164.0 |

### Cursor (`cursor-agent`, dedicated HOME, ACP)

Send now와 MCP Connectors는 Cursor에 없다(ACP runner에는 `steer`가 없고, `MCP_PROVIDERS`는 Claude Code·Codex뿐이다, `steerSupport.ts:8`, `mcpConnectors/presets.ts:8`).

| id | 표면 | Doan이 읽는 곳 | 없을 때 | 지금까지 증거 |
|---|---|---|---|---|
| U1 | `--version` 출력(`2026.10.22-27dcf5f`) | `sessions.ts:24-32` | `version_unknown` | 2026.10.22 |
| U2 | sign-in: `AGENT_CLI_CREDENTIAL_STORE=file`로 `~/.cursor/auth.json`에 저장, `login`(기본 브라우저를 직접 엶), `status --format json`의 `isAuthenticated`·`hasRefreshToken`·`userInfo` | `providers.ts:76-85`, `:127-132`, ARCHITECTURE.md:565 | 저장 위치가 다르면 vault가 비어 sign-in 실패. 이 switch를 모르면 모든 프로필이 함께 쓰는 기본 Keychain 항목에 써서 사람의 Cursor 로그인을 덮어쓸 수 있음. 상태 모양이 다르면 `check_failed` | 2026.10.22 |
| U3 | ACP `agent acp`: `initialize`(`protocolVersion` 1, `authMethods`에 `cursor_login`, `agentCapabilities.loadSession`) | `handshake.ts:25-33`, `acpRunner.ts:85` | 새 대화 `version_incompatible`. `loadSession`이 없으면 resume `session_unavailable` | 2026.10.22 |
| U4 | `session/new`, `session/load`, `session/prompt`, `session/update`, `session/cancel` | `acpRunner.ts:49-135` | 대화 실패 | 2026.10.22 |
| U5 | 모델과 모드 목록(`session/new` 응답), `session/set_config_option`의 `model`·`mode`(Default `agent`, Plan `plan`) | `acpRunner.ts:99-109`, `permissionMode.ts:24` | 모드가 목록에 없으면 Default로 둠 — 조용한 실패 가능 | 2026.10.22 |
| U6 | 권한 요청 `session/request_permission`, `cursor/ask_question`(건너뜀 응답) | `acp.ts:67-69` | Cursor는 workspace 안의 편집을 묻지 않는다(ARCHITECTURE.md:578). 다른 요청이 오지 않으면 지금 최소 버전과 같은 동작인지 비교한다 | 2026.10.22 |
| U7 | 저장 세션 `.cursor/acp-sessions` | `prepare.ts:103` | resume `session_unavailable` | 2026.10.22 |
| U8 | skill stub 찾기 `~/.cursor/skills`(dedicated HOME) | `providers.ts:115-117` | 에이전트가 `doan`을 모름 — 조용한 실패 | 2026.10.22 (B3) |

### Copilot (`copilot`, dedicated HOME, ACP preview)

Send now와 MCP Connectors는 Copilot에 없다(위와 같은 근거).

| id | 표면 | Doan이 읽는 곳 | 없을 때 | 지금까지 증거 |
|---|---|---|---|---|
| P1 | `--version` 출력(`GitHub Copilot CLI 1.0.105.`) | `sessions.ts:24-32` | `version_unknown` | 1.0.105 |
| P2 | sign-in: `login`, 설정 `storeTokenPlaintext: true`로 `.copilot/config.json`에 저장, `lastLoggedInUser` | `providers.ts:93-103`, `:139-145` | 설정을 모르면 토큰이 공유 `copilot-cli` Keychain 항목으로 가 vault가 비고, 사람의 Copilot 로그인을 덮어쓸 수 있음 | 1.0.105 |
| P3 | 상태 확인: `-p "Reply with exactly OK" --available-tools ""`(1.0.105에는 status 명령이 없음). 확인 한 번에 Copilot 요청 하나를 씀 | `providers.ts:141-143` | `check_failed` | 1.0.105 |
| P4 | ACP `--acp --stdio`: `initialize`(`protocolVersion` 1, `loadSession`) | `handshake.ts:25-33`, `acpRunner.ts:85` | 새 대화 `version_incompatible`, resume `session_unavailable` | 1.0.105 |
| P5 | `session/new`, `session/load`, `session/prompt`, `session/update`, `session/cancel` | `acpRunner.ts:49-135` | 대화 실패 | 1.0.105 |
| P6 | 모드와 `allow_all`: Default·Plan·Full access(`#agent`, `#plan`, `allow_all` on/off)를 `session/set_config_option`으로 턴마다 설정 | `permissionMode.ts:26`, `acpRunner.ts:102-109` | 모드가 목록에 없으면 Default로 둠 — 조용한 실패 가능 | 1.0.105 |
| P7 | 권한 요청 `session/request_permission` | `acp.ts:67` | 요청 없이 실행되거나 거절 — 조용한 실패 가능 | 1.0.105 |
| P8 | 저장 세션 `.copilot/session-state` | `prepare.ts:103` | resume `session_unavailable` | 1.0.105 |
| P9 | skill stub 찾기 `~/.copilot/skills`(dedicated HOME) | `providers.ts:115-117` | 에이전트가 `doan`을 모름 — 조용한 실패 | 1.0.105 (B3) |

## 통과 기준

사람의 결정: 아래를 모두 통과한 버전만 새 최소 버전이 될 수 있다. 하나라도 실패하면 그 버전은 후보에서 빠진다. 최소 버전 아래를 기능을 줄여 받아들이지 않는다.

1. sign-in 유지(두 방향): (a) 후보별 userData에서 지금 설치본으로 sign-in한 뒤 PATH만 후보로 바꾸고 앱을 다시 시작해도 연결이 ready로 남는다. (b) 후보로 sign-in한 연결이 PATH를 지금 설치본으로 바꾼 뒤에도 ready로 남는다. Claude Code와 Codex의 credential은 프로필 경로로 구분하는 Keychain 항목이라, 다른 경로로 복사한 프로필은 sign-in되지 않은 상태가 된다(`providers.ts:120`, `:123`). 그래서 프로필을 복사하지 않는다.
2. 새 sign-in: 후보 CLI로 새로 sign-in하면 Connected가 되고, credential이 그 프로필 전용 위치(C11, X2, U2, P2)에 저장되며 사람의 기본 항목은 바뀌지 않는다. 교체 sign-in을 취소해도 기존 연결과 credential이 남는다(POSTMORTEM 2026-10-29).
3. 새 대화 하나가 `turn.done`까지 간다. 모델을 하나 골라 보낸 턴이 그 모델로 돈다.
4. 앱을 다시 시작한 뒤 그 대화가 resume된다. 후보로 만든 대화는 PATH를 지금 설치본(이 Mac의 Claude Code 2.1.318, Codex 0.166.0 등)으로 바꾼 뒤에도 resume된다. floor를 낮추는 목적이 이 경로다.
5. 권한 요청 하나를 허용하고 하나를 거절한다(Cursor는 U6의 규칙을 따른다).
6. provider가 매핑한 권한 모드마다 그 모드의 효과가 보인다(Claude Code: Accept edits·Plan·Full access, Codex: Read only·Accept edits·Full access와 Default, Cursor: Default·Plan, Copilot: Default·Plan·Full access).
7. Send now(Claude Code·Codex): 실행 중 턴에 보낸 메시지가 같은 턴 안에서 읽힌다. Stop이 턴을 멈춘다.
8. MCP Connectors(Claude Code·Codex): 프리셋 하나를 Connect하고, 대화에서 그 도구를 한 번 부르고, Disconnect·Remove한다. Codex는 턴 시작 전에 10 s 대기가 없다.
9. 조용한 실패 확인: Codex는 서버를 연 뒤 rollout 수가 하나만 늘고(X8), 대화 안에서 `command -v doan`이 번들 `doan`을 가리킨다(X2). Cursor·Copilot은 모드 목록에 매핑할 모드가 있다(U5, P6). 네 provider 모두 대화 안의 에이전트가 `doan skill`을 읽는다(C13, X16, U8, P9). Claude Code는 `.claude/settings.json`에 `apiKeyHelper`가 있는 repo에서 `credential_override`로 거절된다(C12).
10. legacy external(Claude Code·Codex): 임시 프로필의 터미널에서 후보 CLI로 세션을 만들고 `doan check`로 연결을 남긴 뒤(`sessions.jsonl`에 그 세션의 줄이 생긴다, C13, X16) 앱에서 이어 간다. 그 세션을 지금 설치본으로도 이어 간다. 터미널이 세션을 잡고 있을 때 `session_in_use`가 나온다(Codex 0.164.0 미만은 X15).

## 실험 환경

- **후보 고르기**: 테스터들이 보낸 Copy details의 provider별 가장 오래된 버전이 범위의 하한이다. 그 하한부터 지금 최소 버전 바로 아래까지의 릴리스를 모두 받아 정적 검사로 거른다. 실제 앱 확인은 provider마다 두 개 이하로 한다. 첫 후보는 정적 검사를 통과한 가장 오래된 버전이다. 첫 후보가 실패하면, 두 번째 후보는 첫 후보가 실패한 원인보다 새로운 릴리스 가운데 정적 검사를 통과한 가장 오래된 버전이다. 같은 원인으로 두 번 실패하지 않게 하기 위해서다.
- **Claude Code의 사이 릴리스**: 버전 검사는 통과하지만 SDK와 맞지 않는 Claude Code는 Update가 아니라 턴 실패로만 보인다(위 '최소 버전을 읽는 곳과 사람이 보는 것'). 그래서 새 최소 버전과 지금 최소 버전 사이에 정적 검사 C2에서 실패한 릴리스가 있으면, 새 최소 버전을 그 릴리스보다 위로 잡는다. 후보가 없는 provider와 전제와 다른 보고는 spec.md '범위'를 따른다.
- **후보 CLI 설치**: 사람의 설치본 옆 `.scratch/cli-minimum-versions/clis/<provider>-<version>/`에 둔다. 사람은 E0에서 내려받을 릴리스 목록을 한 번에 승인한다. 목록 밖의 버전은 받지 않는다. `-g`, `claude install`, `claude update`, Homebrew, Cursor 설치 스크립트처럼 사람의 설치 경로를 바꾸는 방법은 쓰지 않는다. npm 패키지가 있는 CLI(Codex `@openai/codex`, Claude Code `@anthropic-ai/claude-code`, Copilot `@github/copilot`)는 npm `--prefix`를 쓴다. 그렇게 설치할 수 없는 후보(예: 옛 버전을 받을 경로가 없는 Cursor)는 E1에서 그 사실을 적고 후보에서 뺀다.
- **자체 업데이트**: Cursor와 Copilot은 스스로 업데이트한다(ARCHITECTURE.md:576). Claude Code가 스스로 업데이트하는지와 그것을 끄는 switch는 E1에서 출처와 함께 확인한다. 도구 사실 probe는 실제 HOME에서 CLI를 돌리고 `~/.codex`와 `~/.local/share/cursor-agent`에 쓴다(ARCHITECTURE.md:577).
  - 막기: 앱은 터미널 환경 변수를 넘기지 않는다(`launchEnv`, ARCHITECTURE.md:439). 그래서 PATH의 후보 항목을 wrapper script로 둔다. wrapper는 그 CLI의 문서화된 자동 업데이트 끄기 switch를 설정하고 후보를 `exec`한다(Doan은 실행 가능한 일반 파일이면 받는다, `prepare.ts:41`). switch가 없는 CLI는 그 사실을 'E 결과'에 적는다.
  - 알아차리기: probe마다 전후로 후보의 `--version`을 적고, 사람의 설치본을 '사람의 상태 보호'대로 비교한다. 사람의 설치본이 바뀌면 실험을 멈추고 사람에게 알린다. 후보의 버전이 실행 중 바뀌면 그 실행의 결과는 버린다.
- **앱이 후보를 찾게 하기**: 앱은 로그인 셸이 출력한 PATH에서 CLI를 찾는다(`onboarding/machine.ts:41-48`, `agentAuth/facts.ts:28-33`). 가짜 `SHELL`이 후보의 bin 디렉터리를 맨 앞에 둔 PATH를 출력하게 한다. npm으로 설치한 실행 파일은 `node`가 필요하므로 PATH에 node도 넣는다. `app/runtime/environment.ts:18`의 가짜 셸은 PATH를 `/usr/bin:/bin`으로 두므로 실험용 사본을 `.scratch`에 만든다.
- **HOME과 로그인**: Doan 연결 sign-in은 임시 HOME에서 실패한다(Keychain). 그래서 AGENTS.md의 dev 실행 규칙(임시 HOME)과 POSTMORTEM 2026-10-30 'A dev-build measurement started an unisolated Electron…'에서 벗어나, 사람이 승인한 대로 실제 HOME, 임시 `DOAN_RUNTIME`·repo, 후보별 userData(`.scratch/cli-minimum-versions/userData/<provider>-<version>/`)를 쓴다. probe는 에이전트가 돌리고, 로그인은 사람이 자기 브라우저에서 승인한다. 오래된 CLI가 새 버전이 만든 프로필을 망가뜨릴 수 있으므로(다운그레이드) 후보마다 userData와 프로필을 새로 만든다. 사람의 실제 Doan userData는 복사하지 않는다. agent setup은 패키지된 앱에서만 돌므로(`agentSetup/runner.ts:207` `isPackaged`) dev 앱은 실제 HOME에서도 skill 링크나 `doan` 링크를 만들지 않는다. '사람의 상태 보호'의 비교는 실험 스크립트 전체를 감싼다.
- **legacy external**: 가짜 셸이 임시 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`을 출력하게 해서 오래된 CLI가 사람의 `~/.claude`·`~/.codex`에 쓰지 않게 한다. 사람은 그 임시 프로필에도 터미널에서 따로 로그인한다. 그 터미널은 다음을 갖춘다.
  - 가짜 셸이 출력한 것과 글자까지 같은 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`. Claude의 Keychain 항목은 이 문자열로 구분된다.
  - PATH 맨 앞의 `<tmp>/doan`과 `DOAN_RUNTIME=<후보별 userData>/runtime.json`. 사람의 `~/.local/bin/doan`으로 `doan check`를 돌리면 실제 runtime에 연결을 남긴다(ARCHITECTURE.md:213).
  - 임시 프로필의 `skills/doan`. agent setup은 `~/.claude/skills`에만 링크하므로 임시 `CLAUDE_CONFIG_DIR`에는 따로 둔다.
- **실험 빌드**: 앱은 최소 버전 아래의 CLI를 거절하므로, 실험 worktree에서 `minimumVersions.ts`와 floor를 후보 값으로 잠시 바꾼 dev 앱을 쓴다. registry 모양 때문에 `io.ts`를 고쳐야 하면 그 수정도 여기에 넣는다(위 'floor'). 이 변경은 커밋하지 않고, 실험이 끝나면 되돌린다. 실험 worktree는 이 feature 브랜치의 checkout이고, C1도 같은 checkout에서 한다. `.scratch/cli-minimum-versions/`가 그 checkout 안에 있기 때문이다.
- **사람의 상태 보호**: 실험은 며칠 걸리고 그동안 사람도 자기 Claude·Codex를 쓴다. 그래서 실험 전체의 전후가 아니라 단계마다 전후를 비교한다.
  - 비교 대상: `app/runtime/real-state.ts`의 fingerprint, `~/.local/bin/claude` 링크 대상과 `~/.local/share/claude/versions/` 목록, `~/.local/bin/cursor-agent` 링크 대상과 `~/.local/share/cursor-agent/versions/` 목록, 전역 npm의 `@openai/codex`·`@github/copilot` 버전(`npm ls -g`). 디렉터리 수정 시각은 사람의 사용과 도구 사실 probe로 바뀌므로 비교하지 않는다.
  - Keychain: `real-state.ts`는 이름이 claude·codex·cursor·doan 등과 맞는 항목을 모두 hash한다. 그래서 sign-in하는 단계는 만들 항목(service와 프로필 경로)을 단계 전에 적고, 나머지가 같은지 본다. 사람의 token refresh로 바뀐 항목은 그 사실을 적는다. 설명할 수 없는 차이가 나오면 실험을 멈춘다.
  - `doan Safe Storage`: dev 앱도 `app.setName("doan")`(`index.ts:77`)이라 패키지된 Doan과 같은 이름의 Keychain 항목을 쓴다. 실험 전에 이미 있던 항목은 지우지 않는다. 서명이 다른 dev 앱이 그 항목에 접근하면 macOS가 확인 창을 띄울 수 있으므로 사람에게 미리 알린다.

## 정적 검사 (로그인 없음)

실제 앱 확인은 로그인과 사람의 승인이 필요해서 비싸다. 그래서 먼저 로그인 없이 범위를 줄인다. 임시 HOME에서 돌린다.

- **credential 격리 (먼저)**: 실제 sign-in 전에 후보마다 credential을 프로필 전용 위치에 저장하는지 로그인 없이 본다. Cursor는 `AGENT_CLI_CREDENTIAL_STORE=file`을, Copilot은 `storeTokenPlaintext`를 아는지(번들 JS에서 찾는다), Claude Code는 `CLAUDE_CONFIG_DIR`로 구분한 Keychain 항목 이름을 쓰는지(실행 파일의 문자열), Codex는 `cli_auth_credentials_store`를 아는지 본다. 확인되지 않은 후보는 sign-in하지 않고 후보에서 뺀다(C11, X2, U2, P2).
- **Codex**: 후보마다 `codex app-server generate-json-schema --experimental --out <DIR>`로 프로토콜 schema를 만들고(permission-mode PoC가 0.163.0에서 쓴 방법, `94edc615`), X4~X13의 method·필드가 있는지 본다. Doan은 `experimentalApi`를 켜므로(`runners.ts:115`) `--experimental` 없이 만든 schema에는 Doan이 쓰는 method·필드가 빠질 수 있다. `codex --help`, `codex mcp --help`, `codex login --help`로 X3·X13의 하위 명령을 본다. 그 버전에 schema 생성 명령이 없으면 정적 표에 "schema 없음"으로 적고, 그 항목은 실제 앱 확인에서 본다.
- **Claude Code**: SDK 0.3.312가 넘기는 인자를 인자를 기록하는 가짜 실행 파일로 받아 둔다(POSTMORTEM 2026-10-27 'Protocol readiness lagged…'에서 SDK를 합성 실행 파일로 돌린 방법). 다만 `--help`에 나오지 않는 인자가 있을 수 있고, `canUseTool`·권한 모드·`supportedModels`는 인자가 아니라 stdin의 control protocol로 오간다. 그래서 C2는 `--help` 비교로 판정하지 않는다. 임시 `CLAUDE_CONFIG_DIR`에서 실제 SDK `query()`를 후보로 띄워 초기화와 `supportedModels()`까지 가는지 본다. 모르는 인자가 있으면 프로세스가 바로 끝난다. 로그인 없이 거기까지 가지 못하면 그 사실을 적고 실제 앱 확인에서 본다. `claude auth --help`, `claude mcp --help`로 C3·C10의 하위 명령을 본다.
- **Cursor·Copilot**: 후보의 ACP 서버를 띄워 `initialize`만 보낸다. 로그인 없이 `protocolVersion`, `authMethods`, `loadSession`을 본다(U3, P4). `--help`로 `login`·`status`·`acp` 하위 명령과 Copilot의 `--acp --stdio`를 본다. `session/new`부터는 로그인이 필요하므로 실제 앱 확인에서 본다.
- 정적 검사는 조용한 실패(C5~C7, C12, C13, X2의 `allow_login_shell`, X8의 `ephemeral`, X9, X16, U5, U6, U8, P6, P7, P9)를 증명하지 못한다. 그것은 실제 앱 확인에서만 본다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `versionStatus`(`sessions.ts:29-32`): provider마다 새 경계의 표 테스트(새 최소 버전 = supported, 한 단계 아래 = unsupported, suffix). 함수는 바뀌지 않는다.
- `storedVersionAtLeast`(`sessions.ts:34-37`)와 floor 상수: 새 floor 경계, "floor ≤ 최소 버전" 불변식.
- `aboutView`의 `needs`(`aboutView.ts:28-30`): "Doan needs <새 버전> or later." 문구.
- Claude registry 기록 판정(`io.ts:72-76`): 후보 버전의 registry 모양이 지금 검사를 통과하지 못하고, 위 'floor'의 조건대로 고칠 수 있을 때만. 그때는 기록 하나를 판정하는 부분을 순수 함수로 빼고 후보 버전의 실제 기록 fixture로 고정한다.

## 포맷 변경

없다. JSON Schema, 대화 이벤트, 세션 연결 기록(`v` 1), `runtime.json`, IPC 모양은 바뀌지 않는다. 오래된 CLI가 쓴 rollout, registry, ACP 세션 파일은 provider의 파일이고 Doan의 포맷이 아니다. floor를 낮추면 받아들이는 저장 세션의 범위만 넓어진다.

## 규칙 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE §7 'Versions'(ARCHITECTURE.md:530)는 "A minimum rises only by decision, backed by a real-app check"만 적었다. Z1에서 최소 버전을 낮출 때 그 버전이 '통과 기준'을 모두 통과해야 한다는 규칙을 더한다. 올릴 때의 규칙(sign-in 유지, 새 대화, resume, 권한 요청 하나)은 바꾸지 않는다. PRODUCT §3의 "verified minimums"는 그대로 지켜진다.
- Z1에서 같은 'Versions'에 다음 규칙도 더한다: 나중 feature가 Doan이 기대는 provider 표면을 더하면, 그 표면을 지금 최소 버전에서 확인하거나 최소 버전을 올리는 결정을 한다. 버전별 기능 게이팅이 없으므로, 확인하지 않은 표면은 낮춘 최소 버전에서 조용히 실패할 수 있다.
- Cursor·Copilot의 최소 버전은 PRODUCT에 적지 않는다. 그 값의 원천은 `minimumVersions.ts`이고, PRODUCT.md:58은 Claude Code·Codex의 숫자만 적는다.
- floor는 낮아진 최소 버전을 따라 내려간다. 올리는 것은 지금처럼 별도 결정이다(ARCHITECTURE.md:434).
- "Doan installs no provider CLI"(ARCHITECTURE.md:530)는 지켜진다. 후보 CLI 설치는 실험 환경의 `.scratch`에서만 하고 제품은 아무것도 설치하지 않는다.
- ARCHITECTURE.md:576의 accepted risk("Claude incompatibility is never recorded")는 그대로다. 오래된 Claude Code가 SDK와 맞지 않으면 사람은 Update가 아니라 턴 실패를 본다. 그래서 C2를 정적 검사와 실제 앱 확인에서 모두 본다.

## POSTMORTEM에서 가져온 함정

- **2026-10-29 'A cancelled replacement sign-in lost a working connection'**: "Run `rg -n 'loginClears: true' app/src/main/agentAuth/providers.ts` when a provider minimum rises." Codex 0.164.0의 `codex login`은 로그인 서버를 띄우기 전에 기존 로그인을 지운다. 오래된 버전은 다르게 동작할 수 있으므로 통과 기준 2에서 교체 sign-in을 취소한 뒤 기존 연결과 credential이 남는지 본다. 이 확인은 최소 버전을 낮출 때도 한다.
- **2026-10-28 'Claude sign-in surfaced a manual-code link…'**: "for every provider whose `login` is a CLI subcommand, run its login under the probe with a fake `open` first on PATH and a logging `$BROWSER`, and record which link it prints and which it opens." Claude Code, Codex, Cursor, Copilot 후보마다 어떤 링크를 출력하고 어떤 링크를 여는지 적는다.
- **2026-10-27 'A session association was mistaken for stored Codex session presence'**: rollout header의 `cli_version`은 만든 버전으로 남는다. floor는 설치 버전을 따라가지 않는다. Codex floor를 바꿀 때 이 규칙을 지킨다.
- **2026-10-27 'Codex ingress confused unowned requests and notification errors'**: 생성 schema가 pure test가 놓친 요청 모양을 드러냈다. 후보 버전마다 schema를 만들어 비교하는 정적 검사의 근거다.
- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: `MINIMUM_VERSIONS`는 renderer가 읽으므로 `minimumVersions.ts`는 다른 main 모듈을 import하지 않는다. 상수만 바꾼다.

## PoC 의존성

있다. 이 feature 전체가 실험 결과에 기댄다.

- 어느 오래된 버전이 통과 기준을 통과하는지 아무도 확인하지 않았다. 이미 있는 증거(Codex 0.163.0 P2, steer의 0.164.0·2.1.312)는 각자의 probe만 다뤘다. Cursor와 Copilot은 지금 최소 버전 말고 확인한 버전이 없다.
- 오래된 CLI를 사람의 설치본을 건드리지 않고 나란히 설치하는 방법, 특히 Cursor의 옛 버전을 받을 경로는 E1에서 확인한다.
- 통과 기준 8의 MCP 항목(C10, X13)은 mcp-connectors의 코드다. 그래서 mcp-connectors가 main에 합쳐진 뒤 main에서 시작한다.

## `/agent-eval`

필요하지 않다. 이 변경은 guide, CLI 출력·메시지, `doan check` 규칙, skill stub을 바꾸지 않는다(AGENTS.md 'Workflow' `/agent-eval`). eval은 이 Mac에 설치된 Claude Code·Codex로 패키지된 CLI를 쓰게 하는 것이라, 앱의 최소 버전과 관계가 없다.
