# mcp-connectors — tasks

순서: PoC → UI 초안 → 의존성 → 파일 스키마와 순수 함수 → main 셸(I/O) → Codex 대화 → UI → 실제 앱 확인 → 문서 승격. UI 초안(U0)은 `/feature-review` 뒤, `/tdd` 전에 그리고, 사람이 앱에서 확인한 뒤 구현한다.

## P. PoC (구현 전)

PoC 코드는 `.scratch/mcp-poc/`에 둔다. 격리 HOME·userData·`Library/Keychains` 링크를 쓰고, 끝나면 만든 키체인 항목을 지우고 `app/runtime/real-state.ts` 스냅샷과 비교한다(2026-11-03 PoC와 같은 방식).

안전 규칙(모든 P task):
- 서버 이름은 `doan-*` 또는 `*-poc`만 쓴다. Codex 키체인 계정이 `<name>|<URL 해시>`라서, 터미널과 같은 이름(`notion`)을 쓰면 logout·교체가 사람의 터미널 토큰을 지운다.
- 시작 전과 끝난 뒤 `security dump-keychain` 결과에서 `Codex MCP Credentials` 계정 목록을 비교한다. 시작 전에 있던 항목은 끝난 뒤에도 그대로 있어야 한다.

- [ ] P1. 상태 읽기와 토큰 파일 (design 'PoC 의존' P1). 해제 뒤 등록만 남은 Claude 서버를 대화에서 부르면 무엇이 일어나는지(인증 도구 노출, 링크 대기)도 확인한다.
  - 검증: 명령 미정 — `.scratch` probe. `.scratch/mcp-poc/fixtures/`에 `claude mcp get`·`codex mcp list --json`의 등록 전·인증 필요·연결됨 출력 파일 여섯 개가 있다. Codex 프로필에 MCP 토큰 파일이 없음을 기록한다. 안전 규칙의 키체인 비교와 real-state 비교를 통과한다.
- [ ] P2. Codex app-server의 설정 재읽기와 `mcpServer/startupStatus/updated` (P2). 대기 상한 값도 정한다.
  - 검증: 명령 미정 — `.scratch` probe. 실행 중인 app-server에서 등록 뒤 새 thread가 서버를 보는지, 이벤트 형태(픽스처 파일), 이벤트를 기다린 뒤의 첫 턴에서 도구가 보이는지를 기록한다. 안전 규칙 통과.
- [ ] P3. Atlassian·Figma 프리셋 URL (P3).
  - 검증: 명령 미정 — `.scratch` probe. Claude·Codex 각각 연결과 도구 호출 한 번의 결과를 기록하고, 통과한 프리셋만 남긴다. 안전 규칙 통과.
- [ ] P4. sign-out과 교체 프로필 (P4).
  - 검증: 명령 미정 — `.scratch` probe. `claude auth logout` 뒤 MCP 상태, 같은 프로필 `claude auth login` 뒤 MCP 토큰, Codex 교체 프로필에서 기존 `doan-*` 토큰이 쓰이는지 기록한다. 안전 규칙 통과.
- [ ] P4b. node-pty 패키징: Electron 45에서 쓸 수 있는 node-pty 버전을 정한다. N-API prebuild 포함 여부(재빌드가 필요한지)와 macOS `spawn-helper`의 asarUnpack·실행 권한을 확인한다. 외부화·`asarUnpack` 설정으로 `npm --prefix app run package`가 만든 `Doan.app`에서 pty로 `claude mcp login`이 링크 파일에 URL을 쓰는지 확인한다. 실험 브랜치나 `.scratch` 복사본에서 하고 main에는 들이지 않는다. 패키지 앱은 AGENTS.md 'Commands'대로 격리 HOME에서 실행한다.
  - 검증: `npm --prefix app run package` 성공, `codesign --verify --deep --strict app/dist/mac-arm64/Doan.app` 통과, `app.asar.unpacked`에 `pty.node`가 있음, 패키지 앱 probe에서 링크 파일 생성.
- [ ] P5. PoC 결과를 design.md에 반영한다(가정이 틀린 곳은 설계를 고친다).
  - 검증: design.md 'PoC 의존'의 각 항목이 결과 문장으로 바뀌었다.

── commit: `docs(feature): record mcp-connectors PoC results` ──

## U. UI 초안

- [ ] U0. `/design-draft`로 설정 > MCP Connectors 초안을 새 파일 `.doan/canvases/mcp-connectors.html`에 그리고 사람이 앱에서 확인한다. Settings 셸은 기존 `buzz-settings.html`를 참고만 하고 그 파일은 고치지 않는다. A1의 전제다.
  - 검증: `DOAN_RUNTIME=<임시 경로> go run ./cli/cmd/doan check --repo .` 통과, 사람의 확인.

## B0. 의존성

- [ ] B0. node-pty 의존성과 빌드 설정(P4b 결과): `npm --prefix app install --save-exact node-pty@<version>`, main 외부화, electron-builder `asarUnpack`(필요하면 재빌드).
  - 검증: `npm --prefix app run build`, `npm --prefix app run package` 성공, `codesign --verify --deep --strict` 통과.

── commit: `chore: add node-pty for MCP sign-in` ──

## A. 파일 스키마와 순수 함수

- [ ] A1. `mcp-connectors.json` 파서·patch(`parseConnectorsFile`, `patchConnectors`, provider별 `everConnected` 포함), `parseConnectorUrl`, `connectorName`, `PRESETS`.
  - 검증: `npm --prefix app test` — 새 테스트가 먼저 red, 구현 뒤 green. 케이스: `parseConnectorUrl`이 `http://`·사용자 정보·fragment·길이 초과를 거부, `connectorName`의 `-2`·`-3` 접미어, `v` 누락·빈 파일·더 새로운 `v`.
- [ ] A2. `parseClaudeMcpGet`, `parseCodexMcpList`(P1 픽스처), `connectorState`(`Checking…`·시간 초과 포함), `plaintextLeftovers`, `mcpAuthLink`(PoC 링크 픽스처, 허용되지 않는 redirect·scheme 거부).
  - 검증: `npm --prefix app test` green.
- [ ] A3. `codexStartupGate`(P2 이벤트 픽스처, `Connected` 서버만 대기), `parseSettingsSection`의 `"mcp"`.
  - 검증: `npm --prefix app test` green.

── commit: `feat: add MCP connector rules` ──

## B. main 셸

- [ ] B1. `mcpConnectors/store`(temp+rename 쓰기, 읽을 수 없는 파일은 오류로 두고 쓰기 거부).
  - 검증: `npm --prefix app test` green(손상 파일·새 `v` 케이스 포함).
- [ ] B2. Claude·Codex 어댑터와 `service`: 연결·해제·삭제·취소, lease `use: "mcp"`, Claude pty(node-pty)와 링크 파일, Codex 자동 열기 없음, 평문 파일 처리. `providers.ts` codex `args`에 `mcp_oauth_credentials_store="keyring"` 추가.
  - 검증: `npm --prefix app test` green(가짜 프로세스로 명령 인자·환경·취소·lease 확인), `npm --prefix app run typecheck`. 필수 케이스: 동시 시도의 직렬화·거부, 앱 종료 중 시도는 취소되고 결과를 쓰지 않음, pty 프로세스 그룹 정리, 같은 URL·같은 프리셋 두 번 추가, 링크 파일이 오지 않으면(Claude `browser` 설정) 시간 상한으로 실패, 상태 명령 시간 초과 → `Couldn’t check`, `"mcp"` lease가 `stop_required`에 들어가지 않음, Codex 대화 app-server 인자에 keyring 설정이 붙음, 첫 연결 취소 뒤 등록이 남고 `Not connected`, 삭제가 logout 다음 remove 순서, reconcile이 파일에 없는 `doan-*`를 지우고 빠진 등록을 다시 넣음(터미널 이름은 건드리지 않음).
- [ ] B3. agentAuth sign-out에 Doan 커넥터 MCP 로그아웃을 더하고, 교체 sign-in 규칙을 P4 결과대로 맞춘다(Claude는 live 프로필 경로, Codex는 staging 경로).
  - 검증: `npm --prefix app test` green(sign-out 순서, 진행 중인 MCP 시도가 sign-out·교체 시작 때 취소되고 drain이 끝남, 실패한 교체가 기존 등록을 남기는 케이스, Claude·Codex 교체 경로 각각, 미뤄 둔 Codex MCP 로그아웃이 있는 동안 연결이 막히고 Connect가 재시도를 먼저 돌림).
- [ ] B4. IPC 채널(`mcp-connectors:*`)과 preload, `senderAllowed.ts` allowlist, 입력 검증.
  - 검증: `npm --prefix app test` green(다른 frame 거부, 잘못된 URL·이름 거부, `senderAllowed.test.ts`의 채널 목록).

── commit: `feat: run MCP connector sign-ins through provider CLIs` ──

## C. Codex 대화

- [ ] C1. 턴 전 `codexStartupGate` 대기와 상한 초과 알림(runner에서 이벤트 수신), 커넥터 변경 뒤 app-server 재시작(P2 결과가 재시작을 요구할 때. 재시작 대상은 P5에서 design에 적는다).
  - 검증: `npm --prefix app test` green — `conversation/runners.test.ts`(시작 전 대기, 상한 초과 시 서버 없이 시작하고 알림 한 줄, 재사용 서버의 누적 상태)와 `conversation/service.test.ts`(커넥터 변경 뒤 다음 턴에서 재시작, 실행 중인 턴은 유지).

── commit: `feat: wait for MCP servers before a Codex turn` ──

## D. UI

- [ ] D2. `SettingsMcpConnectors.tsx`: 목록, 추가(프리셋·URL), 에이전트별 상태와 동작, 실행 중 대화 안내, 빈 상태와 오류 상태.
  - 검증: `npm --prefix app test` green, `npm --prefix app run build`. `SettingsMcpConnectors.test.tsx` 필수 케이스: 미지원 provider는 행이 없고 설명 한 줄만 있음, Doan 연결이 없거나 CLI가 없을 때 이유와 설정 > Agents 동작, `Checking…`, 실행 중 대화가 있을 때 "다음 턴부터 적용" 안내, 빈 목록, `Couldn’t check`와 Retry, 파일 오류 화면. 사이드바 순서(Agents, MCP Connectors, Notifications)는 `settingsSections.test.ts`에서 확인한다.
- [ ] D3. `/design-sync`로 초안과 구현을 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.

── commit: `feat: add the MCP Connectors settings category` / `docs(design): measure MCP Connectors settings` ──

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`: 격리 앱에서 Claude·Codex 각각 Notion 연결 → 새 대화 첫 턴에서 도구 호출(Codex 포함, 완료 조건 6) → 해제 → 삭제. OAuth 승인은 사용자가 브라우저에서 한다(실제 Notion 계정 필요).
  - 사전 조건: 사람의 터미널 쪽에 같은 URL의 `notion` 항목(Claude `~/.claude.json`, Codex `config.toml`과 키체인)이 있다.
  - 교체·sign-out: 커넥터가 연결된 계정에서 교체 sign-in을 취소한 뒤 상태가 `Connected`인지, 교체를 완료한 뒤 `Reconnect needed`이고 새 계정 대화에서 도구가 보이지 않는지, Doan sign-out 뒤 MCP 토큰이 사라지는지 확인한다(완료 조건 8·9, POSTMORTEM 2026-10-29).
  - 검증: `/runtime-test` 보고(스크린샷). 삭제가 끝난 뒤 real-state 비교 통과. 실제 `~/.claude.json`의 `mcpServers` 전체, `~/.codex/config.toml`의 `[mcp_servers]` 전체, `Codex MCP Credentials` 계정 목록의 전후 diff가 없다. real-state가 이 범위를 덮지 못하면 `app/runtime/` 확장을 이 task에 포함하고 `node --test 'app/runtime/*.test.ts'`로 검증한다.
- [ ] E2. `node .agents/skills/verify/scripts/verify.mjs`.
  - 검증: exit 0.

`/agent-eval`은 생략한다. 이 feature는 guide·CLI 출력·skill·`doan check` 규칙을 바꾸지 않아, eval이 재는 에이전트의 Doan 디자인 쓰기·읽기 경로에 닿지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §1 Problem(spec '문제'), §3 In scope(MCP 커넥터와 지원 provider), §5 항목 0(Settings 카테고리 목록과 MCP Connectors 동작).
  - ARCHITECTURE: §7(새 모듈, 이름 규칙의 이유, lease 용도, Codex 대기, keyring 강제, `mcp-connectors.json`), §7 'Setup'(node-pty 외부화 예외와 이유), §11 'Device-local files without shared schemas' 목록에 `mcp-connectors.json`.
  - DIRECTORY.md: `app/src/main/mcpConnectors/`.
  - BACKLOG: Cursor·Copilot·Antigravity의 막힌 이유.
  - README: 'what works'에 MCP 커넥터를 더할지 판단한다.
  - 그리고 `docs/features/mcp-connectors/`를 지운다.
  - 검증: `grep -n 'MCP Connectors' docs/PRODUCT.md docs/ARCHITECTURE.md`, `grep -n 'mcp-connectors.json' docs/ARCHITECTURE.md`, `grep -n mcpConnectors docs/DIRECTORY.md`에 줄이 있고, `docs/features/mcp-connectors/`가 없다.

── commit: `docs(product): add MCP connectors` / `docs(architecture): describe MCP connectors` / `docs(directory): add mcpConnectors` / `docs(backlog): record MCP gaps for ACP providers` / (필요하면) `docs(readme): …` / `docs(feature): remove mcp-connectors docs` ──
