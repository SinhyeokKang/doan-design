# mcp-connectors — design

## 개요

Doan은 커넥터 목록(이름, URL, 프리셋)만 자기 파일에 두고, 실제 등록·인증·토큰은 각 provider CLI에 맡긴다. 커넥터 하나를 provider에 연결하는 일은 "그 provider의 Doan 프로필에 서버를 등록하고 그 CLI의 MCP 로그인을 실행하는 것"이다. 대화는 프로필 설정을 그대로 읽으므로, Claude는 대화 runner를 바꾸지 않고, Codex는 서버 준비 대기와 app-server 재시작만 더한다.

## 영향받는 구성 요소

- **app main (새 모듈 `app/src/main/mcpConnectors/`)**
  - `store`: `<userData>/mcp-connectors.json` 읽기·쓰기. 쓰기 방식은 `preferences.ts`와 같다(검증된 patch, 직렬화, temp+rename, 더 새로운 `v`는 쓰지 않음, 읽을 수 없는 파일은 빈 목록으로 읽지 않고 오류).
  - `providers`: Claude·Codex 어댑터. 명령은 기존 `agentAuth/providers.ts`의 `command`·`args`와 `agentAuth/environment.ts`의 `providerEnv`를 그대로 쓴다(프로필 변수, `DOAN_RUNTIME`, allowlist).
    - Claude: 등록 `claude mcp add --transport http --scope user <name> <url>`, 로그인 `claude mcp login <name>`을 node-pty로 실행, 해제 `claude mcp logout <name>`, 삭제 `claude mcp remove <name> -s user`, 상태 `claude mcp get <name>`.
    - Codex: 모든 호출에 `-c cli_auth_credentials_store="keyring" -c mcp_oauth_credentials_store="keyring"`를 붙인다(기존 auth와 같은 이유: `auto`는 조용히 파일로 쓸 수 있다). 등록+로그인 `codex mcp add <name> --url <url>`(등록되어 있지 않을 때, OAuth를 스스로 시작), 재로그인 `codex mcp login <name>`, 해제 `codex mcp logout <name>`, 삭제 `codex mcp remove <name>`, 상태 `codex mcp list --json`.
  - `service`: 시도(attempt) 하나씩 직렬화, provider별 lease, 상태 갱신, 렌더러 이벤트.
- **agentAuth**: lease에 새 용도 `"mcp"`를 더한다(POSTMORTEM 2026-10-30 'A model list read made sign-out ask to stop conversations': 새 lease는 용도를 골라야 한다). `stop_required`는 지금처럼 run만 센다. sign-out 순서에 "그 provider의 Doan 커넥터 전부 MCP 로그아웃"을 더한다. 인증 링크는 기존 `BROWSER` hook·링크 파일·소유 창 규칙을 재사용한다.
- **conversation (Codex)**: app-server가 MCP 설정을 시작할 때만 읽는지 PoC로 확인한다(task P2). 그렇다면 커넥터가 바뀐 provider의 idle app-server를 다음 턴 전에 다시 띄운다. 턴 시작 전에는 Doan 커넥터 서버의 `mcpServer/startupStatus/updated`를 기다린다(상한 있음, 넘으면 그 서버 없이 시작하고 대화에 알림 한 줄). Claude는 턴마다 SDK를 새로 띄우고 `settingSources`에 `user`가 있어 바꿀 것이 없다.
- **IPC (`app/src/main/mcpConnectors/ipc.ts`, preload)**: `mcp:list`, `mcp:add`, `mcp:connect`, `mcp:disconnect`, `mcp:remove`, `mcp:cancel`, 이벤트 `mcp:changed`. 경계는 Settings IPC와 같다(메인 창의 main frame만, 입력 검증, 실패는 `{error: code}`).
- **renderer**: `settingsSections.ts`에 `"mcp"`, `SettingsMcpConnectors.tsx`(새 카테고리). 행·상태·동작은 Settings > Agents 행과 같은 프리미티브와 문구 규칙을 쓴다.
- **CLI(Go)·skills·shared formats·app socket**: 바뀌지 않는다.

## pty: node-pty

- `claude mcp login`은 TTY가 없으면 `stdin isn't a terminal`로 실패한다(PoC). PoC는 `/usr/bin/script -q`로 통과했지만, 사용자 결정(포팅 고려)에 따라 macOS·Linux pty와 Windows ConPTY를 같은 API로 다루는 node-pty를 쓴다. 다른 OS 지원 자체는 PRODUCT에 없는 미정 사항이고, 이 feature는 macOS에서만 확인한다.
- 의존성 추가: `npm --prefix app install --save-exact node-pty@<version>`(AGENTS.md 'Commands'). 버전은 Electron 45에서 빌드되는 최신 안정판으로 task에서 정한다.
- 번들 제약: main은 의존성을 번들한다(`externalizeDeps: false`, ARCHITECTURE §7 'Setup'). 네이티브 `.node` 바이너리는 번들할 수 없으므로 node-pty만 외부화하고, electron-builder에서 `asarUnpack`과 Electron ABI 재빌드가 필요하다. 패키지 앱에서 서명(ad-hoc tester build 포함)과 실행을 확인한다.
- pty 출력은 TTY 제어 문자가 섞이므로 링크는 출력이 아니라 `BROWSER` hook의 링크 파일로만 받는다. 출력은 실패 진단(마지막 일부)으로만 쓴다.
- pty 프로세스도 Doan이 띄운 프로세스 그룹으로 정리한다(ARCHITECTURE §7 'Quit and process cleanup').

## 이름 규칙

- provider에 등록하는 서버 이름은 `doan-<slug>`다. 프리셋은 고정 slug(`notion`, `atlassian`, `figma`), URL 추가는 호스트에서 만든 slug에 겹치면 `-2`, `-3`을 붙인다.
- 이유: Codex 키체인 계정이 `<name>|<URL 해시>`이고 해시가 URL에서만 나온다(PoC). 터미널 Codex의 `notion`과 이름이 같으면 같은 키체인 항목을 공유하게 되어, Doan의 해제·삭제·sign-out이 터미널 토큰을 지운다. `doan-` 접두어로 갈라 둔다. Claude는 토큰이 프로필 키체인 항목 안에 있어 충돌하지 않지만 규칙을 하나로 둔다.
- 에이전트가 보는 도구 이름은 Claude `mcp__doan-notion__…`, Codex `mcp__doan_notion__…`가 된다.

## 상태 판정

에이전트별 상태는 다음 사실에서 순수 함수로 정한다.

1. provider 준비 상태(`readiness()`): Doan 연결이 없거나 실행할 수 없으면 커넥터 상태 대신 그 이유.
2. 진행 중인 시도: `연결 중`(취소 가능).
3. provider 상태 명령의 결과: 등록 안 됨 → `연결 필요`, 등록됨+인증 필요 → `다시 연결 필요`(한 번이라도 연결했던 경우) 또는 `연결 필요`, 연결됨 → `연결됨`, 명령 실패·파싱 실패 → `확인 실패`(Retry).

상태 명령은 네트워크를 쓴다(Claude `mcp get`은 서버 health check를 한다). 그래서 상태는 MCP Connectors 화면에 들어올 때, 시도가 끝났을 때, Retry 때만 읽고 polling하지 않는다. 에이전트 sign-in 화면처럼 마지막으로 읽은 값을 보인다.

## 토큰 저장 확인

- Claude: 로그인 뒤 프로필에 `.credentials.json`이 생기면 `storage_failed`로 처리하고 지운다(기존 sign-in의 plaintext 규칙과 같다).
- Codex: `mcp_oauth_credentials_store="keyring"`로 강제하고, 로그인 뒤 프로필에 MCP 토큰 파일(파일명은 task P1에서 확인)이 생기면 같은 처리를 한다.
- Doan은 키체인 항목을 직접 읽거나 지우지 않는다. 삭제는 항상 provider의 logout·remove 명령으로 한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `parseConnectorUrl(text)`: `https://`만, 사용자 정보·fragment 없음, 길이 상한. 잘못된 입력의 이유 코드.
- `connectorName(preset | url, existing)`: `doan-<slug>` 생성과 중복 접미어.
- `PRESETS`: 프리셋 표(이름, URL). task P3에서 확인한 것만 넣는다.
- `parseConnectorsFile(json)` / `patchConnectors(...)`: `mcp-connectors.json` 스키마(테스트가 스키마).
- `parseClaudeMcpGet(stdout)`, `parseCodexMcpList(json)`: 상태 명령 출력 → `registered`·`auth` 사실. 픽스처는 PoC에서 받은 실제 출력.
- `connectorState(readiness, attempt, facts, everConnected)`: 위 '상태 판정'.
- `codexStartupGate(events, names, elapsed)`: 턴 시작 여부(`wait` / `start` / `start_without(names)`).
- `plaintextLeftovers(provider, files)`: 지워야 할 평문 파일.
- `parseSettingsSection`: `"mcp"` 추가.

## 포맷 변경

- 새 기기 로컬 파일 `<userData>/mcp-connectors.json`(`v: 1`). TS만 읽고 쓰므로 공유 JSON Schema(ARCHITECTURE §11)에는 넣지 않고, `preferences.json`처럼 테스트가 스키마다. repo에는 아무것도 쓰지 않는다.
- 공유 포맷의 `v`, 픽스처, CLI 응답, app socket 메시지는 바뀌지 않는다.

## 컨벤션 영향

없음. 캔버스 컨벤션, 에이전트 규칙, `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **"Doan ships no OAuth client"**(ARCHITECTURE §7 'Agent authentication'): 유지한다. OAuth client는 provider CLI의 것(CIMD)이고, Doan은 링크를 전달할 뿐이다.
- **Doan은 외부 자격 증명을 읽거나 바꾸지 않는다**: 유지한다. `doan-` 이름 규칙이 Codex 키체인 공유를 막는다(위 '이름 규칙').
- **Child environment allowlist**: MCP 명령도 `providerEnv`로 실행한다. 새로 들어가는 변수는 기존 `BROWSER`와 링크 파일 변수뿐이다.
- **의존성 추가**: node-pty는 사용자 승인으로 들인다(위 'pty: node-pty'). main 번들 규칙의 예외가 하나 생기므로 ARCHITECTURE §7 'Setup'에 이유와 함께 적는다.
- **프로세스 정리**(ARCHITECTURE §7 'Quit and process cleanup'): node-pty가 만든 pty 아래의 `claude` 프로세스도 Doan이 띄운 분리 그룹으로 다룬다. 종료 시 시도는 취소되고 결과를 쓰지 않는다.
- **대화는 sign-in을 제공하지 않는다**(PRODUCT §3 In scope 7): MCP 연결도 설정에서만 한다.
- PRODUCT §3에 이 기능이 아직 없다. In scope 7(또는 새 항목)과 §5 항목 0의 Settings 카테고리 목록을 고치는 task를 마지막에 둔다.

## POSTMORTEM에서 가져온 함정

- 2026-10-30 'Doan opened a second Codex sign-in page': Codex는 브라우저를 스스로 연다. MCP 연결에서도 Codex 링크는 자동으로 열지 않는다(`AUTO_OPEN`·`OPENS_OWN_BROWSER` 목록과 같은 판단을 따른다).
- 2026-10-28 'Claude sign-in surfaced a manual-code link…': Claude는 `BROWSER` hook의 출력을 보지 않으므로 링크는 링크 파일로 받는다. Claude의 `browser` 설정은 `BROWSER`보다 우선하므로, 그 설정이 있으면 링크가 오지 않는다(기존 sign-in과 같은 실패로 보인다).
- 2026-10-30 'A model list read made sign-out ask to stop conversations': 새 lease 용도 `"mcp"`를 정하고 `stop_required`에서 뺀다.
- 2026-10-29 'A cancelled replacement sign-in lost a working connection…': 교체 sign-in이 끝나지 않으면 기존 프로필의 MCP 등록과 토큰은 그대로 둔다.

## 계정 교체 (사용자 결정: 등록만 옮기고 다시 연결)

- 교체가 commit된 뒤에만 움직인다. 새 프로필에 `doan-*` 서버를 다시 등록하고(Codex는 `mcp add`가 OAuth를 시작하므로 등록은 `config.toml`에 provider 명령 대신 같은 내용을 쓰는 방법이 필요한지 P4에서 확인), 상태는 `다시 연결 필요`로 둔다.
- Codex 키체인 항목은 프로필이 아니라 `<name>|<URL 해시>`로 정해지므로, 그대로 두면 새 계정이 이전 계정의 MCP 토큰을 쓴다. 그래서 교체 commit 직후, 기존 프로필이 logout되기 전에 그 프로필로 `codex mcp logout doan-*`를 먼저 실행한다. Claude 토큰은 기존 프로필의 키체인 항목과 함께 사라지는지 P4에서 확인한다.
- 이 정리가 실패하면 기존 프로필 정리(`cleanup.json`)와 같은 방식으로 기록하고 다음 시작 때 다시 시도한다. 그동안 새 프로필의 커넥터는 `다시 연결 필요`로 두고 연결을 막지 않는다. 막을지 여부는 P4 결과로 다시 본다.
- 2026-10-30 'Packaged-app probes failed…: keychain…': 실제 앱 확인(runtime-test)은 격리 HOME에 `Library/Keychains` 링크가 필요하고, 끝나면 만든 항목을 지운다.

## PoC 의존 (구현 전에 확인)

- **P1. 상태 읽기와 토큰 파일**: `claude mcp get`의 출력 형태(JSON 옵션이 없음), `codex mcp list --json`에 인증 상태가 들어 있는지, Codex keyring 강제 시 프로필에 MCP 토큰 파일이 생기지 않는지.
- **P2. Codex app-server의 설정 재읽기와 준비 이벤트**: 실행 중인 app-server가 새로 등록된 서버를 다음 `thread/start`에서 읽는지, 아니면 재시작이 필요한지. `mcpServer/startupStatus/updated`의 형태와 Doan이 턴 전에 기다릴 수 있는지.
- **P3. 프리셋 URL**: Atlassian과 Figma 원격 MCP가 Claude Code·Codex의 CIMD client를 받아 주는지. 통과한 것만 프리셋에 넣는다.
- **P4. sign-out과 교체**: `claude auth logout`이 프로필 키체인 항목의 MCP 토큰도 지우는지. Codex의 `<name>|<URL 해시>` 항목이 교체된 프로필에서도 그대로 쓰이는지.

## 범위 밖에서 함께 발견한 것 (BACKLOG 후보, 이 feature가 고치지 않음)

- Antigravity 대화 중 실제 `~/.gemini/antigravity-cli`에 language server 로그가 생기고 실제 키체인 항목 `gemini | antigravity`가 수정됐다(2026-11-03 13:35, 격리 HOME 실행 중). 원인 미확인.
- Antigravity 에이전트가 셸 도구로 다른 provider 프로필(`profiles/claude/projects/…jsonl`)을 읽었다. 모든 프로필이 같은 userData 아래에 있어 대화 기록이 provider 사이에 노출된다.
