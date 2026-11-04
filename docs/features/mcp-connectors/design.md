# mcp-connectors — design

## 개요

Doan은 커넥터 목록(이름, URL, 프리셋)만 자기 파일에 두고, 실제 등록·인증·토큰은 각 provider CLI에 맡긴다. 커넥터 하나를 provider에 연결하는 일은 "그 provider의 Doan 프로필에 서버를 등록하고 그 CLI의 MCP 로그인을 실행하는 것"이다. 대화는 프로필 설정을 그대로 읽으므로, Claude는 대화 runner를 바꾸지 않고, Codex는 서버 준비 대기와 app-server 재시작만 더한다.

## 영향받는 구성 요소

- **app main (새 모듈 `app/src/main/mcpConnectors/`)**
  - `store`: `<userData>/mcp-connectors.json` 읽기·쓰기. 쓰기는 `preferences.ts`처럼 검증된 patch, 직렬화, temp+rename으로 하고, 더 새로운 `v`는 쓰지 않는다. 깨진 파일 처리는 `preferences.ts`(기본값으로 읽고 `.broken-*`로 옮김)가 아니라 agent-auth metadata 방식(ARCHITECTURE §7 'Agent authentication')을 따른다: 읽을 수 없으면 오류로 두고 추가·삭제를 막는다. 등록이 provider 쪽에 남아 있으므로, 빈 목록으로 읽으면 Doan 목록과 provider 등록이 어긋나기 때문이다. 커넥터마다 provider별 `everConnected`(한 번이라도 연결에 성공했는지)를 저장한다. `Reconnect needed` 판정에 쓴다.
  - `providers`: Claude·Codex 어댑터. 명령은 기존 `agentAuth/providers.ts`의 `command`·`args`와 `agentAuth/environment.ts`의 `providerEnv`를 그대로 쓴다(프로필 변수, `DOAN_RUNTIME`, allowlist).
    - Claude: 등록 `claude mcp add --transport http --scope user <name> <url>`, 로그인 `claude mcp login <name>`을 node-pty로 실행, 해제 `claude mcp logout <name>`, 삭제 `claude mcp remove <name> -s user`, 상태 `claude mcp get <name>`.
    - Codex: `-c mcp_oauth_credentials_store="keyring"`를 `agentAuth/providers.ts` codex `args`에 더해, MCP 명령뿐 아니라 대화 app-server를 포함한 모든 Codex 프로세스에 붙인다(기존 `cli_auth_credentials_store`와 같은 이유: `auto`는 조용히 파일로 쓸 수 있고, 대화 중 토큰 갱신도 저장을 일으킨다). 등록+로그인 `codex mcp add <name> --url <url>`(등록되어 있지 않을 때, OAuth를 스스로 시작), 재로그인 `codex mcp login <name>`, 해제 `codex mcp logout <name>`, 삭제 `codex mcp remove <name>`, 상태 `codex mcp list --json`.
  - `service`: 시도(attempt) 하나씩 직렬화, provider별 lease, 상태 갱신, 렌더러 이벤트.
- **agentAuth**: `acquire(provider, use: "run" | "listing")`(`agentAuth/manager.ts`)의 `use` 타입을 넓혀 `"mcp"`를 더한다(POSTMORTEM 2026-10-30 'A model list read made sign-out ask to stop conversations': 새 lease는 용도를 골라야 한다). `stop_required`는 지금처럼 run만 센다. sign-out·교체의 drain은 lease가 0이 될 때까지 기다리는데 `stopRuns`(`app/src/main/index.ts`)는 대화만 멈추므로, `stopRuns` 배선에 그 provider의 MCP 시도 취소를 더한다. 진행 중인 MCP 시도는 sign-out·교체가 시작되면 취소되고, 취소는 알리지 않는다. Codex sign-out 순서에 "Doan 커넥터 전부 `codex mcp logout`"을 provider logout 앞에 더한다(Codex 키체인 항목은 프로필 logout으로 지워지지 않는다, P1). Claude는 `claude auth logout`이 프로필 키체인 항목의 MCP 토큰도 비우므로(P4) 별도 MCP 로그아웃을 하지 않는다. Codex sign-out은 writer slot 안에서 돌고 `admit()`가 `busy`를 돌려주므로, MCP 로그아웃은 lease 경로가 아니라 manager 내부 실행으로 한다. MCP 로그아웃이 실패해도 sign-out은 진행한다. 실패한 것은 교체 때와 같은 '미뤄 둔 로그아웃'으로 `mcp-connectors.json`에 기록하고 다음 시작 때 다시 시도하며, 그동안 그 커넥터의 연결을 막는다(아래 '계정 교체'). `doan-*` 등록은 남긴다. 인증 링크는 기존 `BROWSER` hook·링크 파일·소유 창 규칙을 재사용한다. 단, 기존 `claudeLink`(`agentAuth/providers.ts`)는 `https://claude.com/cai/oauth/authorize`만 통과시키므로, MCP 링크는 새 순수 함수 `mcpAuthLink`로 검증한다(ARCHITECTURE §7: main이 모든 URL을 고정한다).
- **conversation (Codex)**: 실행 중인 app-server는 새 `thread/start`마다 `config.toml`의 MCP 서버를 다시 읽지만, 이미 시작된 thread는 `config/mcpServer/reload`를 받아야 새 서버를 본다(P2). 그래서 커넥터가 바뀐 provider의 app-server에는 다음 턴 전에 `config/mcpServer/reload`를 한 번 보낸다(재시작하지 않는다). 턴 시작 전에는 Doan 커넥터 서버 가운데 `Connected`인 서버만 그 thread의 `mcpServer/startupStatus/updated`(`{threadId, name, status: starting|ready|failed|cancelled, error, failureReason}`)가 `starting`이 아닌 값이 될 때까지 기다린다. 상한은 10초다(P2에서 원격 서버는 thread 시작 뒤 1–1.6초에 `ready`). 넘으면 그 서버 없이 시작하고 대화에 알림 한 줄을 남긴다. 등록만 되고 토큰이 없는 서버는 약 45ms 만에 `failed`가 되지만, 상태 판정과 맞추려고 대기 대상에서 뺀다. 이 알림에는 `threadId`는 있고 `turnId`가 없으며 thread 시작 전에는 오지 않는다. transport 리듀서(`conversation/transport.ts`)는 턴 이벤트만 다루므로 `thread/start`와 `turn/start` 사이의 runner(`conversation/runners.ts`)에서 `threadId`로 걸러 받는다. 재사용되는 thread는 reload나 `turn/start` 때 다시 오는 상태를 누적해 판정한다. 상한 초과 알림은 기존 대화 이벤트 `activity`의 `kind: "other"`(`conversation/types.ts`)로 남기고 문구는 "<Notion> wasn’t ready, so this turn started without it."이다. 새 이벤트 타입을 만들지 않으므로 history 포맷은 바뀌지 않는다. Claude는 턴마다 SDK를 새로 띄우고 `settingSources`에 `user`가 있어 바꿀 것이 없다.
- **conversation (Codex MCP 도구 승인)**: Codex는 승인이 필요한 MCP 도구(읽기 전용 표시가 없는 도구)를 부르기 전에 서버 요청 `mcpServer/elicitation/request`를 보낸다(P2). `_meta.codex_approval_kind`가 `"mcp_tool_call"`이고 `_meta.persist`에 `["session","always"]`, `message`에 "Allow the <server> MCP server to run tool "<tool>"?"가 온다. 지금 dispatcher는 모르는 요청에 `-32601`로 답해 호출이 거부되므로, `codexPermission`(`conversation/transport.ts`)이 이 요청을 기존 `permission.request`로 바꾼다. 선택지는 Allow(`{action:"accept", content:{}}`), Deny(`{action:"decline"}`), Allow for this session(`persist`에 `session`이 있을 때만, `{action:"accept", content:{}, _meta:{persist:"session"}}`)이다. `always`는 provider 설정에 영구 승인을 쓰므로 제공하지 않는다. `tool`은 `"mcpToolCall"`, summary는 "Run <tool> on <Notion>"이고 표시 이름은 `serverName`(`doan-<slug>`)을 커넥터 목록에서 찾아 쓴다(내부 이름을 보이지 않는다, spec 완료 조건 2). Doan 커넥터가 아닌 서버(`codex_apps` 등)는 `serverName`을 그대로 쓴다. `codex_approval_kind`가 다른 elicitation(폼 입력)은 이번 범위가 아니고 지금처럼 거부된다. PoC: session 승인 뒤 같은 턴의 두 번째 호출은 요청 없이 완료됐다. Claude는 SDK `canUseTool`이 MCP 도구에도 불리므로 바꿀 것이 없다.
- **IPC (`app/src/main/mcpConnectors/ipc.ts`, preload)**: 기존 `agent-auth:*`와 같은 kebab 접두어로 `mcp-connectors:list`, `:add`, `:connect`, `:disconnect`, `:remove`, `:cancel`, `:open-link`(링크 다시 열기. 창은 URL을 지정하지 못하고 main이 가진 링크만 연다), 이벤트 `:changed`(상태와 소유 창에 보낼 링크 포함). 채널은 `app/src/main/senderAllowed.ts`의 명시 allowlist에 더한다. 경계는 Settings IPC와 같다(메인 창의 main frame만, 입력 검증, 실패는 `{error: code}`).
- **renderer**: `settingsSections.ts`에 `"mcp"`(target은 `{section:"mcp"}`만. 커넥터·provider 단위 target은 쓰는 곳이 생길 때 더한다), `SettingsMcpConnectors.tsx`(새 카테고리). 행·상태·동작은 Settings > Agents 행과 같은 프리미티브와 문구 규칙을 쓴다.
- **CLI(Go)·skills·shared formats·app socket**: 바뀌지 않는다.

## pty: node-pty

- `claude mcp login`은 TTY가 없으면 `stdin isn't a terminal`로 실패한다(PoC). PoC는 `/usr/bin/script -q`로 통과했지만, 사용자 결정(포팅 고려)에 따라 macOS·Linux pty와 Windows ConPTY를 같은 API로 다루는 node-pty를 쓴다. 다른 OS 지원 자체는 PRODUCT에 없는 미정 사항이고, 이 feature는 macOS에서만 확인한다.
- 의존성: node-pty 1.1.0(exact). darwin-arm64 N-API prebuild가 있어 Electron 45에서 그대로 로드된다(P4b).
- 번들 제약: main은 의존성을 번들한다(`externalizeDeps: false`, ARCHITECTURE §7 'Setup'). 네이티브 `.node` 바이너리는 번들할 수 없으므로 main `rolldownOptions.external: ["node-pty"]`로 node-pty만 외부화하고, electron-builder에 `asarUnpack: ["node_modules/node-pty/**"]`를 둔다. require는 `app.asar` 경로로 한다(Electron이 unpacked로 돌려준다. `app.asar.unpacked` 경로를 직접 쓰면 실패한다).
- electron-builder 기본 `npmRebuild`가 node-pty를 소스에서 다시 빌드하므로 패키징 기기에 Xcode command line tools가 필요하다. npm에 올라간 prebuild의 `spawn-helper`는 실행 권한이 없어(0644) `posix_spawnp`로 실패하고, 다시 빌드한 것은 0755다. 재빌드를 끄려면 `spawn-helper`에 실행 권한을 주는 단계가 따로 필요하다. 지금은 기본 재빌드를 쓴다.
- 서명: `codesign --verify --deep --strict`는 node-pty가 없어도 실패한다("code has no resources but signature indicates they must be present", electron-builder `identity: null`의 ad-hoc 서명). 서명 검증 개선은 BACKLOG 범위이고, 이 feature의 패키징 확인은 `codesign --verify`(strict 없이)와 패키지 앱에서 pty 로그인 링크가 생기는지로 한다.
- P4b 패키지 앱 probe: Electron-as-node로 pty에서 `claude mcp login`을 띄우자 링크 파일이 약 1초 안에 생겼고, `claude`가 프로세스 그룹 리더였으며 그룹 종료 뒤 남은 프로세스가 없었다. main 프로세스에서의 실행과 GUI 흐름은 E1에서 확인한다.
- pty 출력은 TTY 제어 문자가 섞이므로 링크는 출력이 아니라 `BROWSER` hook의 링크 파일로만 받는다. 출력은 실패 진단(마지막 일부)으로만 쓴다.
- pty 프로세스도 Doan이 띄운 프로세스 그룹으로 정리한다(ARCHITECTURE §7 'Quit and process cleanup'). node-pty `kill()`은 pid 하나에만 신호를 보내므로 `OwnedGroup(pty.pid)`로 그룹 전체를 정리하고, forkpty의 setsid로 pid가 그룹 리더라는 사실을 테스트로 고정한다. 종료는 `onExit` 뒤 그룹 liveness를 확인해 판정한다(POSTMORTEM 2026-10-27 'SDK process death reached failure classification before group release').

## 이름 규칙

- provider에 등록하는 서버 이름은 `doan-<slug>`다. 프리셋은 고정 slug(`notion`, `atlassian`, `figma`), URL 추가는 호스트에서 만든 slug다. slug는 `[a-z0-9-]`만 쓰고 16자까지다. `mcp__doan-<slug>__`가 27자 이하가 되어 도구 이름에 37자 이상이 남는다. PoC에서 본 가장 긴 이름은 `mcp__doan-atlassian__getJiraProjectIssueTypesMetadata`(53자)이고 65자 이름(claude.ai Notion)도 Claude에서 로드됐다. provider의 도구 이름 상한 자체는 확인하지 못했다. 같은 프리셋과 같은 URL은 다시 추가할 수 없다. URL은 다르고 slug만 겹치면 `-2`, `-3`을 붙인다.
- 이유: Codex 키체인 계정이 `<name>|<URL 해시>`이고 해시가 URL에서만 나온다(PoC). 터미널 Codex의 `notion`과 이름이 같으면 같은 키체인 항목을 공유하게 되어, Doan의 해제·삭제·sign-out이 터미널 토큰을 지운다. `doan-` 접두어로 갈라 둔다. Claude는 토큰이 프로필 키체인 항목 안에 있어 충돌하지 않지만 규칙을 하나로 둔다.
- 에이전트가 보는 도구 이름은 Claude `mcp__doan-notion__…`, Codex `mcp__doan_notion__…`가 된다(P3에서 `mcp__doan_figma__whoami` 확인). Codex 승인 요청과 `mcpServer/startupStatus/updated`의 서버 이름은 하이픈 그대로 `doan-notion`이다.

## 등록 정합

- 첫 연결을 취소하거나 실패해도 provider 등록(Codex `mcp add`가 남긴 것 포함)은 남기고 `Not connected`(등록됨+인증 필요)로 본다. Codex `mcp add`의 OAuth는 콜백을 기다리다 `timed out waiting for OAuth callback`으로 끝날 수 있고, 이때도 등록은 남는다(P3, Figma 첫 시도). 다음 Connect는 `codex mcp login <name>`으로 한다.
- 쓰기 순서: 추가는 `mcp-connectors.json` 먼저, provider 등록은 그다음이다. 삭제는 준비된 provider마다 logout 다음 remove를 하고(Codex `mcp logout`은 `config.toml`의 URL로 키체인 키를 만들기 때문에 순서가 바뀌면 토큰이 남는다), 그 뒤 파일에서 지운다.
- reconcile: provider가 준비될 때(앱 시작, sign-in 끝, 교체 commit)마다 그 프로필에서 파일에 없는 `doan-*` 등록을 logout·remove하고, 파일에 있는데 등록이 없는 커넥터는 다시 등록한다(상태는 `Not connected` 또는 `Reconnect needed`). Doan 연결이 없는 provider에서 Remove한 커넥터도 이 단계에서 지워진다. `doan-` 접두어는 Doan이 만든 것이므로 지워도 터미널 설정에 닿지 않는다.

## 상태 판정

에이전트별 상태는 다음 사실에서 순수 함수로 정한다.

1. provider 준비 상태(`readiness()`): Doan 연결이 없거나 실행할 수 없으면 커넥터 상태 대신 그 이유.
2. 진행 중인 시도: `Connecting…`(취소 가능).
3. 상태 명령을 읽는 중이고 마지막으로 읽은 값이 없음: `Checking…`(동작 비활성).
4. provider 상태 명령의 결과: 등록 안 됨 → `Not connected`, 등록됨+인증 필요 → `Reconnect needed`(저장된 `everConnected`가 참일 때) 또는 `Not connected`, 연결됨 → `Connected`, 명령 실패·파싱 실패·시간 초과 → `Couldn’t check`(Retry).

상태 명령은 네트워크를 쓴다(Claude `mcp get`은 서버 health check를 한다). 그래서 상태는 MCP Connectors 화면에 들어올 때, 시도가 끝났을 때, Retry 때, 그리고 그 provider의 auth 상태가 바뀌었을 때(sign-out, 만료, 교체 commit)만 읽고 polling하지 않는다. 에이전트 sign-in 화면처럼 마지막으로 읽은 값을 보인다.

## 토큰 저장 확인

- Claude: 로그인 뒤 프로필에 `.credentials.json`이 생기면 `storage_failed`로 처리하고 지운다(기존 sign-in의 plaintext 규칙과 같다).
- Codex: `mcp_oauth_credentials_store="keyring"`로 강제한다. P1에서 로그인 뒤 프로필에는 `mcp-oauth-locks/*.lock`과 `tmp/`만 생기고 토큰 파일은 없었다. keyring을 강제하면 파일이 생기지 않으므로 Codex에는 평문 파일 검사를 두지 않는다(`plaintextLeftovers`는 Claude만).
- Doan은 키체인 항목을 직접 읽거나 지우지 않는다. 삭제는 항상 provider의 logout·remove 명령으로 한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `parseConnectorUrl(text)`: `https://`만, 사용자 정보·fragment 없음, 길이 상한. 잘못된 입력의 이유 코드.
- `connectorName(preset | url, existing)`: `doan-<slug>` 생성과 중복 접미어.
- `PRESETS`: Notion `https://mcp.notion.com/mcp`, Atlassian `https://mcp.atlassian.com/v1/mcp`, Figma `https://mcp.figma.com/mcp`. 세 프리셋 모두 Claude·Codex에서 연결과 도구 호출 한 번이 통과했다(P1·P3).
- `parseConnectorsFile(json)` / `patchConnectors(...)`: `mcp-connectors.json` 스키마(테스트가 스키마).
- `parseClaudeMcpGet(stdout)`, `parseCodexMcpList(json)`: 상태 명령 출력 → `registered`·`auth` 사실. 픽스처는 PoC에서 받은 실제 출력.
- `connectorState(readiness, attempt, facts, everConnected)`: 위 '상태 판정'.
- `mcpAuthLink(raw)`: Claude MCP 인가 링크 검증. `https`, 사용자 정보·fragment 없음, `response_type=code`, `code_challenge` 있음, `redirect_uri`가 `http://localhost` 또는 `127.0.0.1`의 1024–65535 포트 `/callback`, 길이 상한. 호스트는 제한하지 않는다(서버마다 다르다: `mcp.notion.com`, `mcp.atlassian.com`, `www.figma.com`). 픽스처는 PoC 링크 세 개다.
- `codexMcpApproval(raw, names)`: `mcpServer/elicitation/request` → `permission.request`와 응답(위 'Codex MCP 도구 승인'). 픽스처는 P2 요청이다.
- `codexStartupGate(events, names, elapsed)`: 턴 시작 여부(`wait` / `start` / `start_without(names)`).
- `plaintextLeftovers(provider, files)`: 지워야 할 평문 파일.
- `parseSettingsSection`: `"mcp"` 추가.

## 포맷 변경

- 새 기기 로컬 파일 `<userData>/mcp-connectors.json`(`v: 1`). TS만 읽고 쓰므로 공유 JSON Schema(ARCHITECTURE §11)에는 넣지 않고, `preferences.json`처럼 테스트가 스키마다. repo에는 아무것도 쓰지 않는다.
- 공유 포맷의 `v`, 픽스처, CLI 응답, app socket 메시지는 바뀌지 않는다.

## 컨벤션 영향

없음. 캔버스 컨벤션, 에이전트 규칙, `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **"Doan ships no OAuth client"**(ARCHITECTURE §7 'Agent authentication'): 유지한다. OAuth client는 provider CLI가 만든다(Notion은 CIMD, Atlassian·Figma는 각 CLI의 DCR 등록, P3). Doan은 링크를 전달할 뿐이다.
- **Doan은 외부 자격 증명을 읽거나 바꾸지 않는다**: 유지한다. `doan-` 이름 규칙이 Codex 키체인 공유를 막는다(위 '이름 규칙').
- **Child environment allowlist**: MCP 명령도 `providerEnv`로 실행한다. 새로 들어가는 변수는 기존 `BROWSER`와 링크 파일 변수뿐이다.
- **의존성 추가**: node-pty는 사용자 승인으로 들인다(위 'pty: node-pty'). main 번들 규칙의 예외가 하나 생기므로 ARCHITECTURE §7 'Setup'에 이유와 함께 적는다.
- **프로세스 정리**(ARCHITECTURE §7 'Quit and process cleanup'): node-pty가 만든 pty 아래의 `claude` 프로세스도 Doan이 띄운 분리 그룹으로 다룬다. 종료 시 시도는 취소되고 결과를 쓰지 않는다.
- **대화는 sign-in을 제공하지 않는다**(PRODUCT §3 In scope 7): MCP 연결도 설정에서만 한다.
- PRODUCT §1·§3에 이 기능이 아직 없다(범위 확장은 사용자가 승인함). §1 Problem(spec '문제'), §3 In scope 7(또는 새 항목), §5 항목 0의 Settings 카테고리 목록을 고치는 task를 마지막에 둔다.

## POSTMORTEM에서 가져온 함정

- 2026-10-30 'Doan opened a second Codex sign-in page': Codex는 브라우저를 스스로 연다. MCP 연결에서도 Codex 링크는 자동으로 열지 않는다(`AUTO_OPEN`·`OPENS_OWN_BROWSER` 목록과 같은 판단을 따른다).
- 2026-10-28 'Claude sign-in surfaced a manual-code link…': Claude는 `BROWSER` hook의 출력을 보지 않으므로 링크는 링크 파일로 받는다. Claude의 `browser` 설정은 `BROWSER`보다 우선하므로, 그 설정이 있으면 링크가 오지 않는다(기존 sign-in과 같은 실패로 보인다).
- 2026-10-30 'A model list read made sign-out ask to stop conversations': 새 lease 용도 `"mcp"`를 정하고 `stop_required`에서 뺀다.
- 2026-10-29 'A cancelled replacement sign-in lost a working connection…': 교체 sign-in이 끝나지 않으면 기존 프로필의 MCP 등록과 토큰은 그대로 둔다.

## 계정 교체 (사용자 결정: 등록만 옮기고 다시 연결)

- staging 프로필을 쓰는 provider는 `loginClears`인 Codex뿐이다(`agentAuth/manager.ts`, `providers.ts`). Claude 교체는 live 프로필에서 일어나므로 `doan-*` 등록은 그대로 남는다. 같은 프로필에서 `claude auth login`을 다시 해도 MCP 토큰은 같은 키체인 항목에 남아 계속 쓰인다(P4: 재로그인 뒤 `Connected`, `atlassianUserInfo` 성공). 그래서 교체 commit 뒤 live 프로필에서 `claude mcp logout doan-*`를 실행하고 상태를 `Reconnect needed`로 둔다.
- 아래는 Codex 경로다. 교체가 commit된 뒤에만 움직인다. `codex mcp add`는 토큰이 이미 있어도 OAuth를 새로 시작하고 기본 브라우저를 연다(P4). 그래서 새 프로필의 `config.toml`에는 Doan이 `[mcp_servers.doan-<slug>]`와 `url`만 직접 쓴다. 교체 staging 프로필은 Doan이 새로 만든 디렉터리라 이 파일에 사람의 설정이 없다. 상태는 `Reconnect needed`로 둔다.
- Codex 키체인 항목은 프로필이 아니라 `<name>|<URL 해시>`로 정해진다. P4에서 로그인하지 않은 새 프로필에 같은 이름과 URL만 써도 `auth_status`가 `o_auth`였다. 그대로 두면 새 계정이 이전 계정의 MCP 토큰을 쓰므로, 교체 commit 직후, 기존 프로필이 logout되기 전에 그 프로필로 `codex mcp logout doan-*`를 먼저 실행한다.
- 이 정리가 실패하면 미뤄 둔 로그아웃을 `mcp-connectors.json`에 기록하고(`cleanup.json` 포맷은 바꾸지 않는다) 다음 시작 때 다시 시도한다. 키체인 키가 프로필과 무관하므로, 그사이 새 계정으로 연결하면 미뤄 둔 재시도가 새 토큰을 지운다. 그래서 기록이 남아 있는 동안 그 커넥터의 Codex 연결을 막는다. 행에는 "Doan is still disconnecting the previous account. Try again later."를 보이고, Connect를 누르면 재시도를 먼저 한 번 돌린 뒤 성공했을 때만 연결을 시작한다.
- 2026-10-30 'Packaged-app probes failed…: keychain…': 실제 앱 확인(runtime-test)은 격리 HOME에 `Library/Keychains` 링크가 필요하고, 끝나면 만든 항목을 지운다.

## PoC 결과 (2026-11-04, Claude Code 2.1.318, Codex 0.166.0, 격리 프로필)

원본 출력은 `.scratch/mcp-poc/`(커밋하지 않음)에 있고, 픽스처로 쓸 출력은 A2·A3에서 테스트 픽스처로 옮긴다.

- **P1. 상태 읽기와 토큰 파일**: `claude mcp get <name>`은 JSON 옵션이 없다. 등록 전에는 exit 1과 `No MCP server named "<name>"…`, 등록 뒤에는 `Status:` 줄이 `! Needs authentication` 또는 `✔ Connected`다(해제 뒤에도 `! Needs authentication`). `codex mcp list --json`은 등록 전 `[]`, 항목마다 `auth_status`가 `not_logged_in` 또는 `o_auth`다. Claude 토큰은 프로필 키체인 항목 `Claude Code-credentials-<config dir 해시>`의 `mcpOAuth`에 들어가고 `.credentials.json`은 생기지 않는다. Codex 토큰은 `Codex MCP Credentials | doan-<slug>|<URL 해시>`에 들어가고, 터미널의 `notion` 항목과 해시는 같지만 이름이 달라 겹치지 않았다. `codex mcp logout`은 그 항목만 지웠다. 해제 뒤 등록만 남은 Claude 서버는 대화 init에서 `needs-auth`로 보이고 도구가 하나도 노출되지 않으며, 턴은 링크를 기다리지 않고 끝난다.
- **P2. Codex app-server**: 위 'conversation (Codex)'와 'Codex MCP 도구 승인'. 재시작은 필요 없다.
- **P3. 프리셋**: 세 프리셋 모두 통과(위 `PRESETS`). Atlassian·Figma는 CIMD가 아니라 DCR로 client를 등록했다.
- **P4. sign-out과 교체**: `claude auth logout`은 MCP 토큰을 비운다(키체인 항목에는 `accessToken`이 빈 `mcpOAuth` 항목만 남고 상태는 `! Needs authentication`). 같은 프로필 `claude auth login`은 MCP 토큰을 남긴다. Codex `<name>|<URL 해시>` 토큰은 다른 프로필에서도 쓰인다. 반영은 위 '계정 교체'와 'agentAuth'.
- **P4b. node-pty 패키징**: 위 'pty: node-pty'.
- 함께 본 것: claude.ai 계정 커넥터는 격리 프로필에서도 sign-in만 하면 로드됐다(spec 비목표의 "도구가 두 벌 보일 수 있다"가 실제로 생긴다). Claude 계정 토큰과 MCP 토큰은 같은 키체인 항목에 있다.

## 초안 요청 (`/design-draft`, task U0)

- 캔버스: `.doan/canvases/mcp-connectors.html`, id `mcp-connectors`, 너비 2560(`buzz-settings.html`과 같음). Settings 셸·사이드바·행 프리미티브는 `buzz-settings.html`과 Settings > Agents 구현을 따르고, 그 파일은 고치지 않는다.
- 프레임(`/design-sync`가 비교하는 것은 1–8):
  1. `empty` — 빈 목록: 카테고리 설명(claude.ai 커넥터 한 줄, 미지원 provider 한 줄), "No connectors yet.", Add connector.
  2. `list` — 커넥터 세 개(Notion, Atlassian, 긴 호스트의 Custom URL). 에이전트 줄에 여섯 상태(`Checking…`, `Not connected`, `Connecting…`, `Connected`, `Reconnect needed`, `Couldn’t check`+Retry)가 모두 한 번 이상 나온다. Codex가 sign-in되지 않은 경우의 이유 줄("Codex isn’t signed in")과 설정 > Agents 동작도 같은 프레임에 둔다.
  3. `add-menu` — Add connector 메뉴: 프리셋(이미 추가한 Notion은 비활성 + "Added"), 구분선, "Custom URL…".
  4. `custom-url` — Custom URL dialog: 기본 상태, 잘못된 URL 인라인 오류, "Already added as <name>." 타일.
  5. `connecting` — Claude 연결 중(Open again, Cancel)과 Codex 연결 중("Codex opened your default browser. Allow access to <Notion> there, then return here.", Cancel) 두 줄.
  6. `failed` — 연결 실패 alert(Agents alert 형식, 이유 + Retry). 이유 문구는 초안에서 정한다: 링크가 오지 않음(Claude `browser` 설정), 승인 시간 초과(Codex 콜백), 평문 토큰 파일 발견(`storage_failed`), CLI 실패.
  7. `remove-alert` — Remove 확인 alert(spec 완료 조건 8 문구), 뒤 페이지 잠금.
  8. `running-notice` — 실행 중 대화가 있는 provider 줄 아래 info notice(spec 완료 조건 10).
  9. `file-error` — `mcp-connectors.json`을 읽을 수 없을 때의 notice(Settings storage 규칙), 추가·삭제 비활성.
  10. `elsewhere` — 다른 화면에 있을 때 실패 toast("Open MCP Connectors" 동작), Agents sign-out 확인 본문에 더하는 한 줄 "Its MCP connectors need connecting again."
  11. `conversation` — Codex 대화: 서버 준비 상한 초과 activity 줄("<Notion> wasn’t ready, so this turn started without it.")과 MCP 도구 권한 요청(summary "Run <tool> on <Notion>", Allow / Deny / Allow for this session). 대화 화면은 shipped 화면을 복사하고 이 두 요소만 새로 표시한다.
- 10·11은 shipped 화면 위에 더하는 요소라 `/design-sync` 비교 대상이 아니고, 구현은 기존 측정값을 따른다.

## 범위 밖에서 함께 발견한 것 (이 feature가 고치지 않음)

PoC 중 발견한 Antigravity의 실제 `~/.gemini`·키체인 수정과 provider 사이 프로필 노출은 이미 `docs/BACKLOG.md`에 기록되어 있다.
