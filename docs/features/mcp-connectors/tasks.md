# mcp-connectors — tasks

순서: PoC → UI 초안 → 의존성 → 픽스처·파일 스키마와 순수 함수 → main 셸(I/O) → 대화 → UI → 실제 앱 확인 → 문서 승격. UI 초안(U0)은 `/feature-review` 뒤, `/tdd` 전에 그리고, 사람이 앱에서 확인한 뒤 구현한다. 보조 과업 S1은 MCP 배치와 독립이라 병렬로 할 수 있다.

## P. PoC (구현 전)

PoC 코드는 `.scratch/mcp-poc/`에 둔다. 격리 HOME·userData·`Library/Keychains` 링크를 쓰고, 끝나면 만든 키체인 항목을 지우고 `app/runtime/real-state.ts` 스냅샷과 비교한다(2026-11-03 PoC와 같은 방식).

안전 규칙(모든 P task):
- 서버 이름은 `doan-*` 또는 `*-poc`만 쓴다. Codex 키체인 계정이 `<name>|<URL 해시>`라서, 터미널과 같은 이름(`notion`)을 쓰면 logout·교체가 사람의 터미널 토큰을 지운다.
- 시작 전과 끝난 뒤 `security dump-keychain` 결과에서 `Codex MCP Credentials` 계정 목록을 비교한다. 시작 전에 있던 항목은 끝난 뒤에도 그대로 있어야 한다.

- [x] P1. 상태 읽기와 토큰 파일 (design 'PoC 의존' P1). 해제 뒤 등록만 남은 Claude 서버를 대화에서 부르면 무엇이 일어나는지(인증 도구 노출, 링크 대기)도 확인한다.
  - 검증: 명령 미정 — `.scratch` probe. `.scratch/mcp-poc/fixtures/`에 `claude mcp get`·`codex mcp list --json`의 등록 전·인증 필요·연결됨 출력 파일 10개가 있다. Codex 프로필에 MCP 토큰 파일이 없음을 기록한다. 안전 규칙의 키체인 비교와 real-state 비교를 통과한다.
- [x] P2. Codex app-server의 설정 재읽기와 `mcpServer/startupStatus/updated` (P2). 대기 상한 값도 정한다.
  - 검증: 명령 미정 — `.scratch` probe. 실행 중인 app-server에서 등록 뒤 새 thread가 서버를 보는지, 이벤트 형태(픽스처 파일), 이벤트를 기다린 뒤의 첫 턴에서 도구가 보이는지를 기록한다. 안전 규칙 통과.
- [x] P3. Atlassian·Figma 프리셋 URL (P3).
  - 검증: 명령 미정 — `.scratch` probe. Claude·Codex 각각 연결과 도구 호출 한 번의 결과를 기록하고, 통과한 프리셋만 남긴다. 안전 규칙 통과.
- [x] P4. sign-out과 교체 프로필 (P4).
  - 검증: 명령 미정 — `.scratch` probe. `claude auth logout` 뒤 MCP 상태, 같은 프로필 `claude auth login` 뒤 MCP 토큰, Codex 교체 프로필에서 기존 `doan-*` 토큰이 쓰이는지 기록한다. 안전 규칙 통과.
- [x] P4b. node-pty 패키징: Electron 45에서 쓸 수 있는 node-pty 버전을 정한다. N-API prebuild 포함 여부(재빌드가 필요한지)와 macOS `spawn-helper`의 asarUnpack·실행 권한을 확인한다. 외부화·`asarUnpack` 설정으로 `npm --prefix app run package`가 만든 `Doan.app`에서 pty로 `claude mcp login`이 링크 파일에 URL을 쓰는지 확인한다. 실험 브랜치나 `.scratch` 복사본에서 하고 main에는 들이지 않는다. 패키지 앱은 AGENTS.md 'Commands'대로 격리 HOME에서 실행한다.
  - 검증: `npm --prefix app run package` 성공, `codesign --verify --deep --strict app/dist/mac-arm64/Doan.app` 통과, `app.asar.unpacked`에 `pty.node`가 있음, 패키지 앱 probe에서 링크 파일 생성.
  - 결과(2026-11-04): strict 검증은 node-pty 없이도 실패해(ad-hoc 서명, BACKLOG에 기록됨) 조건에서 뺐다. 이후 서명 조건은 "node-pty를 넣기 전과 후의 `codesign --verify` 출력이 같다(새 오류 없음)"다. 나머지는 통과. design 'pty: node-pty'.
- [x] P5. PoC 결과를 design.md에 반영한다(가정이 틀린 곳은 설계를 고친다).
  - 검증: design.md 'PoC 의존'의 각 항목이 결과 문장으로 바뀌었다.

── commit: `docs(feature): record mcp-connectors PoC results` ──

## U. UI 초안

- [x] U0. `/design-draft`로 설정 > MCP Connectors 초안을 새 파일 `.doan/canvases/mcp-connectors.html`에 그리고 사람이 앱에서 확인한다. Settings 셸은 기존 `buzz-settings.html`를 참고만 하고 그 파일은 고치지 않는다. A1의 전제다.
  - 검증: 설치된 `doan check --repo .` 통과, 사람의 확인.

## S. 보조 과업 (MCP 배치와 독립)

- [ ] S1. 앱 전체의 진행 상태 라벨에서 말줄임표를 뺀다(design '문구 규칙: 진행 상태'). 다음 입력을 여는 명령 라벨(`Add Project…`, `Open Project…`, `Quick Open…`, `Go to…`, `Settings…`, `Export…`, `Sign in again…`, `Update…`, `Open Agents settings…`, `Manage agents…`, `Sign in to an agent…`)과 placeholder `Which canvas or screen? Add details…`는 그대로 둔다.
  - 바꿀 라벨(grep으로 확인한 위치):
    - `Checking…`: `app/src/renderer/homeComposer.ts`, `app/src/renderer/SettingsAbout.tsx`, `app/src/main/aboutView.ts`
    - `Checking attachments…`: `app/src/renderer/homeComposer.ts`
    - `Stopping…`: `app/src/renderer/agentIndicator.ts`, `app/src/renderer/CanvasAgent.tsx`(주석: `app/src/renderer/styles.css`)
    - `Reading…`: `app/src/renderer/homeCards.ts`, `app/src/renderer/projectRow.ts`
    - `Reading project…`: `app/src/renderer/App.tsx`
    - `Sending…`: `app/src/renderer/DockedComposer.tsx`(주석: `app/src/main/conversation/runners.ts`, `app/src/renderer/conversationStore.ts`, `app/src/renderer/queueFocus.ts`)
    - `Setting Up…`: `app/src/renderer/onboardingView.ts`, `app/src/renderer/ProjectSetupDialog.tsx`
    - `Exporting…`: `app/src/renderer/ShellSidebar.tsx`
    - 조율자 목록에 없었지만 grep에서 함께 나온 진행 라벨(같은 규칙이라 포함한다): `Exporting “<stem>”…`(`app/src/renderer/canvasRowMessages.ts`), `Loading…`(`app/src/renderer/App.tsx`), `Loading canvas conversations…`(`app/src/renderer/CanvasConversationList.tsx`), `Loading conversation…`(`app/src/renderer/CanvasConversationPanel.tsx`, `ConversationThread.tsx`, `ProjectOverview.tsx`), `Reading styles…`(`app/src/renderer/RightPanel.tsx`)
    - 테스트 기대값: `app/src/main/about.test.ts`, `app/src/renderer/`의 `agentIndicator.test.ts`, `App.canvasRowMenu.test.tsx`, `CanvasAgent.hooks.test.tsx`, `CanvasConversationList.test.tsx`, `canvasRowMessages.test.ts`, `DockedComposer.queue.test.tsx`, `DockedComposer.test.tsx`, `dockedRules.test.ts`, `homeCards.test.ts`, `homeComposer.test.ts`, `HomeComposerView.interaction.test.tsx`, `overviewRun.test.ts`, `ProjectOverview.test.tsx`, `projectRow.test.ts`, `queueFocus.test.ts`, `RightPanel.test.tsx`, `SettingsAbout.test.tsx`, `ShellSidebar.interaction.test.tsx`
    - 문서: `docs/PRODUCT.md`(`Sending…`), `docs/DESIGN.md`(`Sending…`, `Stopping…`, `Loading conversation…`, `Reading styles…`, `Checking…`, `Exporting…`)
    - 디자인 시스템 캔버스(출시된 UI를 기록하고 코드를 따른다): `.doan/ds/project-setup.html`(`Setting Up…`), `.doan/ds/spinner.html`(`Reading…`). 출시된 화면의 다른 `.doan/canvases/` 초안은 고치지 않는다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, 설치된 `doan check --repo .` 통과. `rg -n '(Checking|Stopping|Reading|Sending|Setting Up|Exporting|Loading)[^"<]{0,40}…' app/src docs/PRODUCT.md docs/DESIGN.md .doan/ds/project-setup.html .doan/ds/spinner.html`가 아무것도 찾지 않는다(남겨 둘 명령 라벨은 이 단어로 시작하지 않아 걸리지 않는다).

── commit: `fix: drop the ellipsis from progress labels` ──

## B0. 의존성

- [ ] B0. node-pty 의존성과 빌드 설정(P4b 결과): `npm --prefix app install --save-exact node-pty@1.1.0`, main `rolldownOptions.external`, electron-builder `asarUnpack: ["node_modules/node-pty/**"]`(기본 재빌드 유지).
  - 검증: `npm --prefix app run build`, `npm --prefix app run package` 성공, node-pty를 넣기 전과 후의 `codesign --verify app/dist/mac-arm64/Doan.app` 출력이 같다(새 오류 없음, design 'pty: node-pty'), `app.asar.unpacked/node_modules/node-pty`에 `pty.node`와 실행 권한이 있는 `spawn-helper`가 있음.

── commit: `chore: add node-pty for MCP sign-in` ──

## A. 픽스처, 파일 스키마와 순수 함수

- [ ] A0. PoC 출력을 커밋할 테스트 픽스처로 옮긴다(A2·A3·C2의 전제). 원본은 `docs/features/mcp-connectors/poc/`에 있다(`.scratch/mcp-poc/`는 다른 머신에 없다. 이미 계정 식별자를 지운 사본). `claude mcp get`·`codex mcp list --json` 출력(P1), Claude MCP 인가 링크 세 개, P2 `mcpServer/startupStatus/updated` 이벤트와 `mcpServer/elicitation/request` 요청을 `app/src/main/mcpConnectors/fixtures/`와 대화 픽스처(`app/src/main/conversation/fixtures/`)에 둔다. `state`, `code`, 계정 id, 토큰처럼 보이는 값은 지우거나 가짜 값으로 바꾼다.
  - 검증: `npm --prefix app test` green. `grep -rn '\.scratch' app/src`에 테스트가 걸리지 않는다. 픽스처에 `state=`·`code=`의 실제 값과 PoC 계정 id가 없다(grep).
- [ ] A1. `mcp-connectors.json` 파서·patch(`parseConnectorsFile`, `patchConnectors`, provider별 `everConnected` 포함), `mcp-connectors-pending.json` 파서·patch(`parsePendingLogouts`, `patchPendingLogouts`), `parseConnectorUrl`(정규화 포함), `connectorName`, `PRESETS`(순수·타입 전용 모듈).
  - 검증: `npm --prefix app test` — 새 테스트가 먼저 red, 구현 뒤 green. 케이스: `parseConnectorUrl`이 `http://`·사용자 정보·fragment·길이 초과·빈 입력을 거부, 앞뒤 공백 제거, scheme·호스트 소문자, 기본 포트 443 제거, 경로 끝 슬래시 하나 제거, 정규화한 URL로 중복 판정(프리셋 URL 포함), `connectorName`의 `-2`·`-3` 접미어, 두 파일 각각 `v` 누락·빈 파일·더 새로운 `v`.
- [ ] A2. `parseClaudeMcpGet`, `parseCodexMcpList`(A0 픽스처), `connectorState`(`Checking`·`Disconnecting`·`Removing`·시간 초과·미뤄 둔 로그아웃 차단 포함), `plaintextLeftovers`, `mcpAuthLink`(A0 링크 픽스처, 허용되지 않는 redirect·scheme 거부), `reconcilePlan`(프리셋과 파일의 URL 서버가 아닌 `doan-*`만, 파일을 읽을 수 없으면 빈 목록, 터미널 이름은 대상 아님), `mcpLogoutPlan`(로그아웃 성공한 서버만 등록, 실패는 기록, sign-out이면 live 등록 제거, 같은 계정이면 단계 없음), `codexServerToml`(`URL.href`, TOML escape).
  - 검증: `npm --prefix app test` green.
- [ ] A3. `codexStartupGate`(A0 이벤트 픽스처, 대기 대상은 등록된 `doan-*` 전부, 1초 뒤 `wait_notice`, 10초 뒤 `start_without`), `codexMcpApproval`(A0 요청 픽스처: 선택지 Allow·Deny, `persist`에 `session`이 있을 때만 Allow for this session, `always` 없음, 응답 형태, `message`에서 도구 이름 읽기와 대체 summary "Run a tool on <Notion>", 표시 이름 `doan-*` → 커넥터 이름·그 밖의 서버는 그대로, 다른 `codex_approval_kind`는 `{action:"decline"}`), `claudePermissionSummary`의 `mcp__doan-<slug>__<tool>` 인식(도구 입력을 summary에 넣지 않음), `parseSettingsSection`의 `"mcp"`.
  - 검증: `npm --prefix app test` green.

── commit: `feat: add MCP connector rules` ──

## B. main 셸

- [ ] B1. `mcpConnectors/store`와 `pending` 기록 파일(temp+rename 쓰기, 읽을 수 없는 커넥터 파일은 오류로 두고 쓰기 거부, 기록 파일을 쓸 수 없으면 그 실행 동안 메모리 차단).
  - 검증: `npm --prefix app test` green(손상 파일·새 `v`, 기록 파일 쓰기 실패 → 메모리 차단, 커넥터 파일이 깨져도 기록 파일은 동작).
- [ ] B2. Claude·Codex 어댑터와 `service`: 연결·해제·삭제·취소, lease `use: "mcp"`(`acquire(provider, "mcp", added?)`로 링크 파일 환경 전달, `agentAuth/manager.ts`의 `hookLinks` export), Claude pty(node-pty)와 링크 파일, Codex 자동 열기 없음, 평문 파일 처리, reconcile, 세대 번호. `providers.ts` codex `args`에 `mcp_oauth_credentials_store="keyring"` 추가.
  - 검증: `npm --prefix app test` green(가짜 프로세스로 명령 인자·환경·취소·lease 확인), `npm --prefix app run typecheck`. 필수 케이스: 동시 시도의 직렬화·거부, 앱 종료 중 시도는 취소되고 결과를 쓰지 않음, pty 프로세스 그룹 정리, 같은 URL·같은 프리셋 두 번 추가, 링크 파일이 오지 않으면(Claude `browser` 설정) 시간 상한으로 실패, Claude 링크 대기 5분 상한 → 실패 이유, 상태 명령 시간 초과 → `Couldn’t check`, `"mcp"` lease가 `stop_required`에 들어가지 않음, Codex 대화 app-server 인자에 keyring 설정이 붙음, Codex 연결이 아무 링크도 열지 않음(POSTMORTEM 2026-10-30 'Doan opened a second Codex sign-in page'), 첫 연결 취소 뒤 등록이 남고 `Not connected`, Codex 콜백 시간 초과 → 이유 표시·등록 유지·다음 Connect는 `codex mcp login`, Claude `.credentials.json` → `storage_failed`와 파일 삭제, `mcpAuthLink`가 거부한 링크는 열지 않음, 실행 중인 시도가 있는 서버의 Remove는 IPC에서 거부, 삭제가 logout 다음 remove 순서, reconcile이 파일에 없는 `doan-*`만 지움(터미널 이름은 건드리지 않음, 빠진 등록은 넣지 않음), 성공한 Connect·Disconnect·Remove가 그 provider 세대를 올림, `admit()` busy → busy 실패 이유.
  - 타이밍: 상한은 가짜 타이머로 테스트하거나, 상한을 polling 간격(100ms)보다 크게 두고 테스트 한도를 내부 대기보다 크게 둔다(POSTMORTEM 2026-10-30 'Timing tests failed under machine load…').
- [ ] B3. sign-out·교체의 MCP 로그아웃: agentAuth manager가 주입된 `mcpLogout(provider, profileDir) → { failed: string[] }`를 부르고, 서버 이름은 provider 목록(`codex mcp list --json`, `claude mcp list`)의 `doan-*`에서 얻는다. Codex sign-out은 provider logout 앞에 서버마다 `codex mcp logout`(Claude sign-out은 `auth logout`이 MCP 토큰을 비우므로 더하지 않는다). 교체는 계정이 바뀔 때만: Claude는 commit 뒤 live 프로필에서 `claude mcp logout doan-*`, Codex는 기존 프로필로 서버마다 `mcp logout` 뒤 성공한 서버만 staging 프로필 `config.toml`에 `codexServerToml`로 등록. 실패는 `pending`에 기록하고 시작 때·Connect 직전에 다시 시도한다(임시 `CODEX_HOME` 사용 가능).
  - 검증: `npm --prefix app test` green — 케이스: sign-out 순서, 진행 중인 MCP 시도가 sign-out·교체 시작 때 취소되고 drain이 끝남, 실패한 교체가 기존 등록을 남김, MCP 로그아웃 실패 → sign-out은 끝나고 기록이 남고 live 등록이 지워짐, 시작 때 재시도 성공 → 기록 삭제, Connect의 재시도 실패 → 연결을 시작하지 않음, 교체에서 로그아웃 성공한 서버만 등록, 계정이 같으면 MCP 로그아웃 없음(Claude `accountId`), Codex는 교체 때마다 로그아웃, Claude 교체 뒤 로그아웃 실패 → 기록과 Claude Connect 차단, 커넥터 파일이 깨져도 로그아웃 대상은 provider 목록에서 나옴, 임시 `CODEX_HOME` 재시도(가짜 프로세스. 실제 동작은 E1).
- [ ] B4. IPC 채널(`mcp-connectors:*`)과 preload, `senderAllowed.ts` allowlist(invoke 채널만, `:changed` 이벤트는 제외), 입력 검증.
  - 검증: `npm --prefix app test` green(다른 frame 거부, 잘못된 URL·이름 거부, `senderAllowed.test.ts`의 채널 목록).

── commit: `feat: run MCP connector sign-ins through provider CLIs` ──

## C. 대화

- [ ] C1. Codex 턴 전 `codexStartupGate` 대기(10초)와 알림(runner에서 `threadId`로 걸러 수신), 세대 번호 기반 `config/mcpServer/reload`(재시작하지 않음).
  - 검증: `npm --prefix app test` green — `conversation/runners.test.ts`(대기 대상이 프로필에 등록된 `doan-*` 전부, 시작 전 대기, 1초 뒤 "Waiting for <Notion>" activity 한 줄, 상한 초과 시 그 줄이 "<Notion> wasn’t ready, so this turn started without it."로 바뀌고 서버 없이 시작, 다른 thread의 이벤트 무시, 재사용 thread의 누적 상태, reload 뒤 대상 상태를 비우고 새 값을 기다림)와 `conversation/service.test.ts`(runner가 연 때의 세대와 다르면 다음 턴 전에 reload 한 번, 새로 연 runner는 보내지 않음, 실행 중인 턴은 유지). 타이밍은 B2와 같은 규칙.
- [ ] C2. Codex MCP 도구 승인 dispatcher 배선: `codexMcpApproval`(A3)을 `codexPermission`에 연결하고, 표시 이름 맵을 `CodexContext`(`dispatcher.begin`)로 넘기고, 선택에 맞는 응답을 보낸다. 다른 `codex_approval_kind`는 `{action:"decline"}`으로 답해 턴을 끝내지 않는다(design 'Codex MCP 도구 승인').
  - 검증: `npm --prefix app test` green — `conversation/dispatcher.test.ts`·`conversation/transport.test.ts`. POSTMORTEM 2026-10-27 'Codex ingress confused unowned requests and notification errors' 케이스: 요청마다 명시적 disposition, 다른 `threadId`의 요청은 route, 턴이 끝난 뒤 온 요청은 decline되고 매달린 요청이 없음, 요청마다 응답이 정확히 한 번.
- [ ] C3. Claude MCP 권한 요약: 대화에서 `mcp__doan-<slug>__<tool>` 권한 요청의 summary가 "Run <tool> on <Notion>"이고 history에 도구 입력이 들어가지 않는다.
  - 검증: `npm --prefix app test` green — `conversation/transport.test.ts`.

── commit: `feat: wait for MCP servers before a Codex turn` / `feat: ask before an agent runs an MCP tool` ──

## D. UI

- [ ] D2. `SettingsMcpConnectors.tsx`: sign-in된 에이전트별 섹션, 섹션 안의 프리셋·URL 서버 항목(온보딩 provider 행 재사용)과 상태·동작, URL 추가 dialog와 … 메뉴 Remove, 실행 중 대화 안내, 오류 상태, 포커스와 읽어 주기. 카테고리 표시 조건과 `{section:"mcp"}`·저장된 섹션 `mcp` → Agents 대체(`settingsSections.ts`, `App.tsx`). Settings > Agents stop 확인(`agentAuthView.ts` `stopDialog`)의 sign-out 본문에 "Its MCP connectors need connecting again." 추가. 프리셋 로고를 `.doan/assets/mcp-logos/`에서 `app/src/renderer/public/mcp-logos/`로 옮긴다(출처 README 포함).
  - 검증: `npm --prefix app test` green, `npm --prefix app run build`. `SettingsMcpConnectors.test.tsx` 필수 케이스:
    - 섹션: 미지원 provider는 섹션이 없고 설명 한 줄만 있음, sign-in되지 않은 에이전트는 섹션이 없음, 섹션은 에이전트 이름 label의 group, 실행할 수 없는 에이전트는 섹션 머리 이유와 비활성 버튼, 프리셋은 파일이 비어도 보임, URL 서버가 모든 섹션에 보임, 접근 이름 "Connect Notion for Codex".
    - 상태: `Checking`(읽어 주지 않음), `Connecting`, `Disconnecting`·`Removing`(동작 비활성), `Couldn’t check`와 Retry, 한 에이전트에서 시도 중이면 그 섹션의 다른 Connect 비활성과 tooltip, 연결 중인 서버의 Remove 비활성, busy 문구 "Codex is busy signing in or out. Try again in a moment.", 실패 문구(Claude 링크 대기 시간 초과 포함), 실패 alert가 페이지를 다시 열어도 남음, 미뤄 둔 로그아웃 줄 "Doan is still disconnecting the previous account. Try again later.", Remove 실패 시 항목 유지와 오류 alert.
    - 안내: 실행 중 대화가 있을 때 "Applies from …’s next turn" notice가 섹션마다 하나이고 바뀐 항목 아래로 갱신됨, 다른 화면에서 실패 시 "Open MCP Connectors" toast와 카테고리가 숨겨졌을 때 Agents로 대체, 파일 오류 화면(URL 추가·삭제만 막힘), 더 새로운 `v`이면 URL 서버를 숨김.
    - 포커스와 읽어 주기: 포커스가 있던 버튼이 사라지거나 비활성이 되면 행 group으로, 추가 뒤 첫 섹션의 새 항목 행 group과 읽어 주기 한 번, dialog·메뉴 Cancel·Escape는 연 버튼으로, Remove 뒤 같은 섹션의 다음 항목(없으면 앞 항목), 페이지 live region은 하나이고 사람·백그라운드 변화만 에이전트 이름과 함께 읽음.
    - 페이지 전환: 보는 중에 두 에이전트가 모두 sign-in되지 않으면 Agents로 바뀌고 Agents 제목에 포커스, "MCP Connectors is available while Claude Code or Codex is signed in."을 한 번 읽음.
  - 그 밖의 테스트: 사이드바 순서(Agents, MCP Connectors, Notifications), 두 에이전트 모두 sign-in되지 않았을 때 카테고리가 빠지고 `{section:"mcp"}`·저장된 섹션 `mcp`가 Agents를 여는 것은 `settingsSections.test.ts`. stop 확인 문구는 `agentAuthView.test.ts`·`SettingsAgents.test.tsx`. `rendererImports.test.ts`가 계속 통과한다(`PRESETS`는 순수·타입 전용 모듈, POSTMORTEM 2026-10-30 'A renderer import of a main module…').
- [ ] D3. `/design-sync`로 초안과 구현을 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.

── commit: `feat: add the MCP Connectors settings category` / `docs(design): measure MCP Connectors settings` ──

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`: 격리 앱에서 Claude·Codex 각각 Notion 연결 → 새 대화 첫 턴에서 도구 호출(Codex 포함, 완료 조건 6) → Codex에서 쓰기 도구로 권한 요청의 Deny(호출 실패, 턴 계속)와 일반 Allow(실행) 한 번씩 → 해제 → 삭제. OAuth 승인은 사용자가 브라우저에서 한다(실제 Notion 계정 필요).
  - 패키지 앱: `npm --prefix app run package`로 만든 `Doan.app`에서 Claude Connect를 한 번 실행한다(main 프로세스의 node-pty). AGENTS.md 'Commands'의 격리를 쓰고, 격리 HOME에 `Library/Keychains`를 링크하고 끝나면 만든 항목을 지운다. 격리 프로필의 `Claude Code-credentials-<hash>`도 지운다(POSTMORTEM 2026-10-30 'Packaged-app probes failed for reasons of their own: keychain, signature identity and focus').
  - 권한 모드: Codex 대화에서 Plan이면 승인이 필요한 MCP 도구가 실패하고, Bypass이면 묻지 않고 실행되는지 확인한다(완료 조건 6).
  - 미뤄 둔 로그아웃: 로그인하지 않은 임시 `CODEX_HOME`(그 서버 항목만 있는 `config.toml`)에서 `codex mcp logout`이 키체인 항목을 지우는지 확인한다(design 'agentAuth').
  - 사전 조건: 사람의 터미널 쪽에 같은 URL의 `notion` 항목(Claude `~/.claude.json`, Codex `config.toml`과 키체인)이 있다.
  - 교체·sign-out: 커넥터가 연결된 계정에서 교체 sign-in을 취소한 뒤 상태가 `Connected`인지, 다른 계정으로 교체를 완료한 뒤 `Reconnect needed`이고 새 계정 대화에서 도구가 보이지 않는지, Doan sign-out 뒤 MCP 토큰이 사라지는지 확인한다(완료 조건 8·9, POSTMORTEM 2026-10-29).
  - 검증: `/runtime-test` 보고(스크린샷). 삭제가 끝난 뒤 real-state 비교 통과. 실제 `~/.claude.json`의 `mcpServers` 전체, `~/.codex/config.toml`의 `[mcp_servers]` 전체, `Codex MCP Credentials` 계정 목록의 전후 diff가 없다. real-state가 이 범위를 덮지 못하면 `app/runtime/` 확장을 이 task에 포함하고 `node --test 'app/runtime/*.test.ts'`로 검증한다.
- [ ] E2. `node .agents/skills/verify/scripts/verify.mjs`.
  - 검증: exit 0.

`/agent-eval`은 생략한다. 이 feature는 guide·CLI 출력·skill·`doan check` 규칙을 바꾸지 않아, eval이 재는 에이전트의 Doan 디자인 쓰기·읽기 경로에 닿지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §1 Problem(spec '문제'. 새 번호의 문제로 둘지와 §3으로 이어지는 화살표를 함께 정해 적는다), §3 In scope(MCP 커넥터와 지원 provider), §5 항목 0(Settings 카테고리 목록을 네 개로, MCP Connectors의 표시 조건과 동작), 대화·권한 규칙(Codex 턴 전 대기와 MCP 도구 승인, Claude MCP 권한 요약).
  - ARCHITECTURE: §7(새 모듈, 이름 규칙의 이유, lease 용도, Codex 대기와 세대 기반 reload, keyring 강제, `mcp-connectors.json`, 미뤄 둔 로그아웃 파일 `mcp-connectors-pending.json`, sign-out·교체의 `mcpLogout` 경계, Codex MCP 승인과 elicitation 처리), §7 'Agent authentication' 'Profiles'(staging 프로필 `config.toml`에 `[mcp_servers.doan-*]`를 쓰는 예외), §7 'Setup'(node-pty 외부화 예외와 이유), §11 'Device-local files without shared schemas' 목록에 두 파일.
  - DESIGN.md: 문구 규칙 한 줄(진행 상태 라벨은 말줄임표 없는 현재분사, 다음 입력을 여는 명령은 macOS 말줄임표 유지).
  - DIRECTORY.md: `app/src/main/mcpConnectors/`.
  - BACKLOG: Cursor·Copilot·Antigravity의 막힌 이유, MCP 도구 승인이 아닌 elicitation은 거절됨, claude.ai 커넥터와 겹친 도구, node-pty의 다른 OS 확인, 도구 이름 상한 미확인, ephemeral `thread/start` probe가 MCP 서버를 한 번 더 시작할 수 있음.
  - README: 'what works'에 MCP 커넥터를 더할지 판단한다.
  - 그리고 `docs/features/mcp-connectors/`를 지운다.
  - 검증: `grep -n 'MCP Connectors' docs/PRODUCT.md docs/ARCHITECTURE.md`, `grep -n 'mcp-connectors.json' docs/ARCHITECTURE.md`, `grep -n 'mcp-connectors-pending.json' docs/ARCHITECTURE.md`, `grep -n mcpConnectors docs/DIRECTORY.md`에 줄이 있고, `docs/features/mcp-connectors/`가 없다.

── commit: `docs(product): add MCP connectors` / `docs(architecture): describe MCP connectors` / `docs(design): state the progress label rule` / `docs(directory): add mcpConnectors` / `docs(backlog): record MCP gaps` / (필요하면) `docs(readme): …` / `docs(feature): remove mcp-connectors docs` ──
