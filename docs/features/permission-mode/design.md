# permission-mode — design

## 모드 대응

| 공통 모드 | id | Claude (SDK `permissionMode`) | Codex `turn/start` (`approvalPolicy` / `sandboxPolicy`) |
|---|---|---|---|
| Default | `default` | 넘기지 않는다 | 서버를 열 때 보낸 `thread/start {cwd, ephemeral:true}` 응답의 `approvalPolicy`·`sandbox`를 명시해서 넘긴다 |
| Accept edits | `acceptEdits` | `acceptEdits` | `on-request` / `{type:"workspaceWrite", networkAccess, writableRoots}`(두 값은 `config/read`의 `sandbox_workspace_write`에 있을 때만 싣는다) |
| Plan (read-only) | `plan` | `plan` | `never` / `{type:"readOnly"}` |
| Full access | `bypass` | `bypassPermissions` + `allowDangerouslySkipPermissions: true` | `never` / `{type:"dangerFullAccess"}` |

ACP는 서버가 알린 mode id로 대응한다. "없음"인 모드는 그 provider의 피커에 보이지 않는다.

| 공통 모드 | Cursor (`agent acp`) | Antigravity (ACP 서버 1.3.0) | Copilot (`--acp --stdio`) |
|---|---|---|---|
| Default | `agent`를 명시해서 설정한다 | `default`를 명시해서 설정한다 | mode `…#agent`와 `allow_all: "off"`를 명시해서 설정한다 |
| Accept edits | 없음 | `auto_edit` | 없음 |
| Plan (read-only) | `plan` | 없음 | `…#plan`(+ `allow_all: "off"`) |
| Full access | 없음 | `yolo` | `…#agent` + `allow_all: "on"` |

- Copilot mode id는 URL이다: `https://agentclientprotocol.com/protocol/session-modes#agent`·`#plan`·`#autopilot`. 표의 `…#`는 이 앞부분을 줄인 것이다.
- 대응하지 않는 mode: Cursor `ask`(Q&A, 편집 없음), Copilot `#autopilot`(서버 설명이 "experimental", allow-all로 끝날 때까지 혼자 돈다). 피커에 보이지 않는다.
- 근거:
  - Claude Agent SDK 0.3.312 `sdk.d.ts`의 `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`와 `Options.permissionMode`. `bypassPermissions`는 `allowDangerouslySkipPermissions`가 필요하다(`sdk.d.ts:2041`, `:2058`).
  - Codex 0.163.0 `codex app-server generate-json-schema`의 `v2/TurnStartParams`(`approvalPolicy`, `sandboxPolicy`)와 `v2/ThreadStartParams`(`approvalPolicy`, `sandbox`, `ephemeral`).
  - ACP 표는 P3 실측(아래 'PoC 결과')이다.
- Codex 형식은 둘로 갈린다. `thread/start`의 `sandbox`는 `SandboxMode` 문자열(`"read-only"|"workspace-write"|"danger-full-access"`)이고, `turn/start`의 `sandboxPolicy`와 `thread/start`·`thread/resume` 응답의 `sandbox`는 객체(`{type:"readOnly"}`, `{type:"workspaceWrite", writableRoots, networkAccess}`, `{type:"dangerFullAccess"}`)다. Default 값은 응답 객체를 그대로 `sandboxPolicy`로 넘긴다.
- Codex는 `turn/start`에서만 모드를 넘긴다. 매 턴 model·effort를 넘기는 지금 방식(`runners.ts`)과 같다.
- Codex override는 다음 턴에도, `thread/resume` 뒤에도 남는다(P2). `approvalPolicy:null`·`sandboxPolicy:null`을 넘겨도 지워지지 않는다. 그래서 Default 턴도 값을 명시해야 한다.
- Codex Default 값은 `config/read`로 정하지 않는다. 사용자가 approval·sandbox를 정하지 않았으면 `config/read`가 `null`을 돌려주고, 실제 기본값은 프로젝트 trust에 따라 달라진다(trusted가 아니면 `on-request`/`readOnly`, trusted면 `on-request`/`workspaceWrite`). 그래서 runner가 서버를 열 때 `thread/start {cwd, ephemeral:true}`를 한 번 보내 그 응답 값을 쓴다(사용자 결정). 이 요청은 rollout을 남기지 않고 모델 요청도 하지 않는다(P2). 새 대화와 resume한 대화 모두 같은 서버에서 한 번 보낸다.
- Codex Accept edits에 `{type:"workspaceWrite"}`만 넘기면 사용자 설정의 `network_access=true`가 `networkAccess:false`로 덮인다. `writable_roots`는 덮이지 않았다(P2). 그래서 `config/read`의 `sandbox_workspace_write`에 있는 `network_access`·`writable_roots`를 실어 넘긴다.
- Codex Plan은 `never`라서 권한 상승을 요청하지 않는다. 편집 요청은 승인 요청 없이 쓰기 거부로 끝났다(P2).
- Claude는 턴마다 SDK를 새로 연다(ARCHITECTURE §7). 그래서 턴의 모드를 `query()` 옵션으로 넘기면 된다.
- 폴더 settings(`permissions.disableBypassPermissionsMode: "disable"`)가 bypass를 막아도 `query()`는 실패하지 않는다. 경고 없이 `default`로 시작하고(init `permissionMode:"default"`), 편집마다 `canUseTool` 승인 요청을 띄운다(P1). 그래서 대응할 `turn.failed` code가 없다. Doan은 따로 처리하지 않는다. 피커는 Full access를 보이지만 그 턴은 승인 요청을 띄운다. `permission_mode_not_claimable`은 prewarm `claim()`에만 있는 실패다(`sdk.d.ts:351`).
- Claude Plan은 계획이 끝나면 `ExitPlanMode` 도구로 승인을 요청한다. 지금의 `canUseTool` 승인 요청 경로로 그대로 보인다(새 UI 없음). 이 요청에는 `suggestions`가 없어서 Allow·Deny만 보인다.
- Plan 승인 뒤 SDK는 `{type:"system", subtype:"status", permissionMode}` 메시지로 다음 모드를 알린다(P1 실측값은 `"default"`). main은 이 값을 공통 id로 바꿔 대화의 저장 모드를 바꾸고, renderer 피커가 그 값을 따른다. 대응은 `default`→`default`, `acceptEdits`→`acceptEdits`, `plan`→`plan`, `bypassPermissions`→`bypass`이고, `auto`·`dontAsk`는 Default로 둔다. 지금 `normalizeClaude`(`transport.ts`)는 이 메시지를 읽지 않으므로 읽도록 넓힌다.
- Claude Plan 턴은 계획 파일을 승인 없이 `<CLAUDE_CONFIG_DIR>/plans/`에 쓴다(P1). Doan에서는 Doan profile 안이고, 프로젝트는 바뀌지 않는다.
- ACP(Cursor·Antigravity·Copilot):
  - mode 목록은 `session/new`·`session/load` 응답의 `modes`(`availableModes`, `currentModeId`)에 있다. 세 provider 모두 같은 목록을 `configOptions`의 `{id:"mode", category:"mode"}` 항목으로도 알린다. Copilot은 `{id:"allow_all", category:"permissions", options: on/off}`도 알린다.
  - 바꾸는 요청은 `session/set_config_option`(`configId:"mode"`, Copilot은 `configId:"allow_all"`도)으로 통일한다. 세 provider 모두 받는다. ACP 모델 선택이 이미 같은 요청을 쓴다(`acpRunner.ts`). 세 provider 모두 `session/set_mode`도 받는다.
  - 첫 턴 전에 목록이 있어야 사람이 첫 턴의 모드를 고를 수 있다. 그래서 ACP 모델 목록을 읽는 같은 `session/new` 응답(`models.ts`의 ACP 파서)에서 mode 목록도 함께 읽어 `models` IPC 응답에 싣는다. 새 요청을 더하지 않는다.
  - ACP는 턴마다 서버를 새로 열지만, 세 provider 모두 고른 mode를 세션에 저장한다. `session/load` 응답은 마지막에 고른 mode를 돌려준다(Copilot은 `allow_all`도). 그래서 Default 턴도 mode를 명시해서 설정한다. mode를 설정하지 않는 것으로는 Default로 돌아가지 않는다.
  - `session/load` 응답의 현재 mode가 이미 고른 값이면 다시 설정하지 않아도 된다. 지금 모델 설정과 같은 규칙이다(`acpRunner.ts`).

## Default의 범위

Doan 연결 대화는 Doan 전용 profile에서 돈다(ARCHITECTURE §7 'Agent authentication'). Default는 그 profile과 프로젝트의 설정을 따른다. 터미널의 `~/.claude`·`~/.codex`·`~/.cursor`·`~/.copilot`·`~/.gemini` 설정은 적용되지 않는다. 초안의 Default 설명("Follows Doan’s Claude Code settings", "Follows Doan’s Codex settings")과 맞는다.

- **Claude**: `permissions.defaultMode`를 Doan profile의 `settings.json`(`<userData>/agent-auth/profiles/claude/settings.json`), 프로젝트 `.claude/settings.json`, `.claude/settings.local.json`에서 읽는다(`settingSources: ["user","project","local"]`). 어디에도 없으면 `default`로 시작하고, 편집마다 승인 요청을 띄운다. 지금 Doan profile에는 `settings.json`이 없다. 이 기기 터미널의 `~/.claude/settings.json`에는 `defaultMode:"auto"`가 있지만 적용되지 않았다. 이 계정은 `auto`를 받지만, 지정이 없을 때 `auto`로 시작하지는 않았다(P1).
- **Codex**: Doan profile의 `CODEX_HOME/config.toml`과 프로젝트 trust가 정한다. 그 결과를 `thread/start {ephemeral:true}` 응답으로 읽는다. 지금 Doan의 Codex profile은 비어 있다(연결 없음). 빈 config와 trust 항목이 없는 프로젝트에서 응답은 `on-request`/`readOnly`였다(P2).
- **Cursor**: Default는 `agent` mode다. 그 안의 승인은 profile HOME의 `.cursor/cli-config.json`(`permissions.allow`·`deny`, `approvalMode`)이 정한다. 새 로그인의 값은 `approvalMode:"allowlist"`, `permissions.allow:["Shell(ls)"]`였다.
- **Antigravity**: Default는 `default` mode("Default permission prompt flow")다. 편집에 승인 요청을 띄웠다(P3).
- **Copilot**: Default는 `…#agent` mode와 `allow_all:"off"`다. 편집에 승인 요청을 띄웠다(P3). Doan이 `allow_all`을 명시하므로, profile이 allow-all을 켜 두었더라도 Default 턴은 끈 상태로 돈다.

## 저장 규칙

모드는 모델과 따로 저장한다. 지금 모델·노력 저장은 모델이 있을 때만 일어나서, 그대로 끼우면 모델 목록을 읽기 전에 고른 모드와 Default로 되돌린 값이 버려진다.

- **send**: 지금 `service.ts`의 `const chosen = extras.model ? choice(extras) : choice(metadata)`는 모델이 실린 send에서만 저장된 choice를 바꾼다. 모드는 이와 따로 판정한다. extras에 `permissionMode`가 있으면 그 값으로 바꾸고, 없으면 저장값을 유지한다. `"default"`는 명시값으로 받고, metadata에서는 키를 지운다.
- **queue**: 큐에 쌓인 메시지는 보낼 때의 피커 값을 실어 보낸다. queue 경로(`ipc.ts`)가 `permissionMode`를 받도록 넓힌다.
- **legacy-external 대화**: model·effort처럼 `permissionMode`도 `bad_request`로 거부한다(`ipc.ts`).
- **ui-state 마지막 사용**: `HomeModel`에 끼우지 않는다. `parseHome`은 `model`이 빈 `models[provider]` 항목을 버리기 때문이다(`restore/uiState.ts`). 대신 `HomeMemory.permissions?: Partial<Record<Provider, PermissionModeId>>`로 따로 둔다.
- **Settings 'New conversations'**: `preferenceAfterPick`은 `!choice.model`이면 아무것도 돌려주지 않는다(`renderer/rememberChoice.ts`). 모델 없이도 모드만 반영하도록 넓힌다.
- **Plan 승인 뒤 전환**: main이 대화 metadata의 모드를 바꾸고, renderer는 대화 상태에서 그 값을 받아 피커에 보인다. 마지막 사용 값도 함께 바뀐다(결정 7과 같은 규칙).

## 잘못된 값 읽기

저장된 `permissionMode`가 알 수 없는 id이면 그 필드만 Default로 읽는다. 기존 규칙의 예외다.

- preferences는 "a wrong known field breaks the whole file"이고(ARCHITECTURE §7 'Settings IPC' 'Preferences'), store index의 `metadata()`도 틀린 알려진 필드가 있으면 index 전체를 invalid로 본다(`store.ts`).
- 예외로 두는 이유: 나중 빌드가 mode id를 더하면, 그 값 하나 때문에 옛 빌드에서 설정 파일이나 대화 index 전체가 깨진다. Default로 읽으면 실행이 오히려 더 좁아지는 쪽이라 Full access로 도는 경로가 생기지 않는다.
- 이 예외와 이유를 Z1에서 ARCHITECTURE에 적는다.

## 영향 받는 부분

- **app main**
  - `conversation/runners.ts`: Claude `query()`에 `permissionMode`(Full access면 `allowDangerouslySkipPermissions`도 함께). Codex 서버를 열 때 `thread/start {cwd, ephemeral:true}`로 Default 값을 읽고, `turn/start`에 대응값을 넘긴다. Accept edits는 `config/read`의 `sandbox_workspace_write`를 합친다. `transport.ts`: Claude `system/status`의 `permissionMode`를 읽어 Plan 승인 뒤 모드를 main에 알린다.
  - `conversation/acpRunner.ts`: `session/new`·`session/load` 뒤 `session/set_config_option`(`configId:"mode"`, Copilot은 `allow_all`도)으로 고른 모드를 설정한다. Default 턴도 명시해서 설정한다.
  - `conversation/models.ts`: ACP `session/new` 응답의 `modes`(Copilot은 `configOptions`의 `allow_all`도)에서 mode 목록을 읽는다.
  - `conversation/service.ts`: `TurnChoice`에 `permissionMode`를 더하고, 위 '저장 규칙'대로 모델과 따로 판정한다. Plan 승인 뒤 저장 모드를 바꾼다.
  - `conversation/store.ts`: 대화 metadata에 `permissionMode?`를 더하고 검증한다.
  - `conversation/ipc.ts`: 받은 값을 공통 id 목록으로 검증한다(모델처럼 renderer 값을 믿지 않는다). send·queue가 받고, legacy-external은 거부한다.
  - `preferences.ts`: `NewConversationPreference`에 `permissionMode?`. renderer patch를 검증하는 `exact` 키 목록을 넓힌다.
- **app renderer**
  - `ComposerParts.tsx`: `PermissionPicker`(Effort 피커와 같은 DropdownMenu, 같은 `doan-floating doan-menu`). 터미널 세션이면 고정 트리거.
  - `HomeComposerView.tsx`(도구 줄), `DockedComposer.tsx`(`composer-tray`의 Effort 뒤), `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`: 피커를 넣고 send·start·queue에 값을 싣는다. 320px 패널에서 넘칠 때의 처리는 `/design-draft`에서 정한다.
  - `restore/uiState.ts`: `HomeMemory.permissions`.
  - `rememberChoice.ts`, `App.tsx`, `homeComposer.ts`(`NewConversationDefault`): 마지막 사용과 Settings 기본값에 모드를 반영한다.
  - `SettingsAgents.tsx`: 'New conversations'에 Permission 행. Agent가 Last used이면 숨는다.
  - 경고 표시: Full access 트리거는 모드명, 경고 아이콘, `text-warning`·`affordance-warning`을 쓴다(DESIGN에 측정값을 남긴다).
- **CLI·skills·`doan check`**: 바뀌지 않는다.

## 초안 요청 (`/design-draft`)

- 캔버스: `.doan/canvases/permission-mode.html`, id `permission-mode`.
- frame: `home-toolrow`(Home 도구 줄 닫힘·Full access), `picker-menu`(열린 메뉴와 항목 설명), `docked-tray`(Overview·캔버스 패널 tray, 폭 단계), `docked-fixed`(터미널 세션 고정 트리거), `plan-approved`(Plan 승인 뒤 피커 전환), `settings-row`(New conversations의 Permission 행).
- Home·Settings·대화 패널의 기존 부분은 코드대로 복사한다.
- 사용자가 초안(`6e4be0f7`)을 확정했다. 메뉴 항목 설명 문구와 모드 아이콘(shield · file-pen-line · eye · shield-alert)도 초안대로 쓴다.

## 폭이 모자랄 때 (DockedComposer tray)

- Home 도구 줄은 `min(680px, 100%)`이고 최소 창 960px에서도 넉넉하다. 그래서 단계가 없다.
- DockedComposer tray는 패널 최소 320px에서 Pick·모델·Effort·Permission이 다 들어가지 않는다. tray 폭(container query)에 따라 순서대로 줄인다.
  1. Permission 라벨을 숨기고 아이콘만 보인다.
  2. 그래도 모자라면 Effort도 아이콘만 보인다.
  3. 마지막으로 모델 라벨을 말줄임한다. Pick, 로고, chevron은 줄이지 않는다.
- tray가 두 줄로 줄바꿈되지 않는다. 높이는 그대로다.
- 모드마다 아이콘이 달라서, 아이콘만 남아도 모드를 구분할 수 있다. Full access는 경고 아이콘과 경고색을 유지한다.
- 숨은 라벨은 tooltip과 aria-label에 남는다.
- 단계 경계 폭은 초안이 정하고, `/design-sync`에서 측정한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `permissionOptions(provider, acpModes?)`: 피커에 보일 공통 모드 목록. Claude·Codex는 4개, ACP는 대응되는 것만, 없으면 빈 목록(피커 숨김).
- `claudePermission(mode)`: 공통 id → `permissionMode`와 `allowDangerouslySkipPermissions`.
- `codexPermission(mode, defaults, workspace)`: 공통 id → `approvalPolicy`·`sandboxPolicy`. `defaults`는 `thread/start {ephemeral:true}` 응답의 `{approvalPolicy, sandbox}`이고 Default가 그대로 쓴다. `workspace`는 `config/read`의 `sandbox_workspace_write`이고 Accept edits가 `networkAccess`·`writableRoots`에 쓴다.
- `acpModeFor(provider, mode, availableModes)`: 대응표대로 설정할 `set_config_option` 목록(`mode`, Copilot은 `allow_all`도) 또는 없음. 서버가 알린 목록에 그 mode id가 없으면 없음.
- `claudeModeAfterPlan(sdkMode)`: SDK `permissionMode` → 공통 id(대응이 없으면 `default`).
- `permissionTrigger(mode)`: 트리거 라벨, 아이콘, 경고 여부.
- 마지막 사용·Settings 기본값의 읽기/쓰기 규칙(PRODUCT §5 item 0 'New conversations' 규칙의 확장): 모델 없이도 모드를 반영하고, 저장된 provider의 모드를 그 provider에서 고를 수 없으면 Default.
- metadata·preferences·ui-state 검증: 알 수 없는 id는 그 필드만 Default로 읽는다.

## 형식 변경

- 공유 JSON Schema(`schema/`)는 바뀌지 않는다. 대화 metadata, `preferences.json`, ui-state는 app 전용 형식이고 각 모듈이 검증한다.
- 옛 빌드가 새 필드를 만나도 깨지지 않는다(코드로 확인함):
  - index.json의 `metadata()`는 모르는 키를 검사하지 않는다(ARCHITECTURE "the reader ignores unknown keys"). 옛 빌드는 `...rest`로 이 키를 보존한다(`service.ts`).
  - `parsePreferences`는 모르는 필드를 무시한다(`exact=false`). renderer patch만 `exact`로 거부하므로 키 목록을 넓힌다.
  - ui-state는 `v`가 없다. 선택 필드를 더할 뿐이다.
- 그래서 index와 preferences의 `v`는 그대로다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 'Agent conversation foundation contract' 'Resume and permissions'의 "The user's own permission and sandbox settings apply with no forced bypass or preset"을 spec '문제'의 새 규칙으로 바꾼다.
- PRODUCT §5 item 0 'New conversations', item 1 Composer(도구 줄), item 2 'New conversation'("the composer's provider, model, effort and attachments")과 'Terminal session'("takes no model, effort or attachments")에 권한 모드를 더한다.
- ARCHITECTURE §7 'Agent conversation runtime and IPC'의 "so the user's own permission settings apply", 'Permissions and terminals', "Codex (default on-request/read-only)"를 새 규칙으로 고친다. '잘못된 값 읽기' 예외를 'Settings IPC' 'Preferences'와 index 설명에 적는다.
- §3 Out of scope 4(자율 깨우기)와는 관계없다. 모드는 사람이 보낸 턴에만 적용된다.

## PoC 결과 (2026-11-02)

확인함: 네 모드의 대응, Claude Plan 승인 뒤 전환, bypass 차단 시의 동작, Codex override 유지와 Default 복귀, ACP mode 목록과 설정 요청. 스크립트와 로그는 `.scratch/permission-mode/`에 있다(커밋하지 않는다). 모든 실행은 `/tmp/permission-mode-poc/` 아래의 임시 저장소와 임시 profile에서 했다.

- **P1 Claude** (claude 2.1.316, SDK 0.3.312, Doan Claude 계정, 모델 haiku). 파일 편집 턴 하나씩.

  | 모드 | init `permissionMode` | 승인 요청 | 편집 |
  |---|---|---|---|
  | 넘기지 않음(Default) | `default` | 있음(`Write`, suggestion `setMode acceptEdits`) | 됨(승인 뒤) |
  | `default` | `default` | 있음 | 됨(승인 뒤) |
  | `acceptEdits` | `acceptEdits` | 없음 | 됨 |
  | `plan` | `plan` | `ExitPlanMode`만(suggestion 없음). 승인 뒤 `system/status` `permissionMode:"default"`, 이어진 편집에 다시 승인 요청 | 됨(두 번째 승인 뒤) |
  | `bypassPermissions` + flag | `bypassPermissions` | 없음 | 됨 |
  | bypass + 폴더 `disableBypassPermissionsMode` | `default` | 있음 | 됨(승인 뒤). 실패 없음 |

  - Plan 승인에 `updatedPermissions`를 실어도(`plan-always`) 결과는 같았다.
  - Default의 출처는 모델 요청 없이 `initializationResult().current_permission_mode`로 확인했다. profile `settings.json`의 `acceptEdits`, 프로젝트 `settings.json`의 `acceptEdits`, `settings.local.json`의 `plan`이 각각 적용됐다.
- **P2 Codex** (codex-cli 0.163.0 app-server, 임시 `CODEX_HOME` 새 로그인, file store). 사용자 설정은 `on-request`/`read-only`, `sandbox_workspace_write.network_access=true`, `writable_roots=[…]`.

  | 턴 | 넘긴 값 | 적용된 값(`thread/settings/updated`) | 결과 |
  |---|---|---|---|
  | Plan | `never` / `readOnly` | 같음 | 승인 요청 없음, 쓰기 거부("operation not permitted") |
  | Default(사용자 값) | `on-request` / `readOnly` | 같음 | 쓰기 거부, 모델이 권한 상승을 요청하지 않음 |
  | Accept edits | `on-request` / `workspaceWrite`(network·roots 포함) | 같음 | 승인 요청 없음, 편집 됨 |
  | Full access | `never` / `dangerFullAccess` | 같음 | 승인 요청 없음, 편집 됨 |
  | resume(새 서버) 뒤 | 없음 | `thread/resume` 응답이 직전 턴의 `never`/`dangerFullAccess` | — |
  | resume 뒤 Default | 사용자 값 | `on-request`/`readOnly`로 돌아감 | 쓰기 거부 |

  - override 없이 보낸 턴은 설정을 바꾸지 않았고(`thread/settings/updated` 없음), `null`을 넘긴 턴도 같았다.
  - `{type:"workspaceWrite"}`만 넘기면 `networkAccess:false`, `writableRoots`는 사용자 값 그대로였다.
  - 설정이 비어 있으면 `config/read`는 `approval_policy`·`sandbox_mode`·`sandbox_workspace_write`가 `null`이었다. 같은 서버의 `thread/start {ephemeral:true}` 응답은 trusted 프로젝트에서 `on-request`/`workspaceWrite`였고, `sessions/`에 rollout을 남기지 않았다. 이 확인은 로그인 없이 했다.
- **P3 ACP** (임시 HOME 새 로그인, 모두 file store).

  | provider | `modes.availableModes` | 기본 `currentModeId` | `session/load` 뒤 mode | 측정한 턴 |
  |---|---|---|---|---|
  | Cursor 2026.10.22 | `agent`·`plan`·`ask` | `agent` | 저장된다(코드: `agentStore.setMetadata("mode")`) | 모델 요청이 "Upgrade your plan to continue"로 끝나서 편집 결과는 확인하지 못했다 |
  | Antigravity 1.3.0 | `default`·`auto_edit`·`yolo` | `default` | 직전 값(`auto_edit`) | `auto_edit`: 편집 승인 없음(셸 명령은 승인 요청). `default`: 편집 승인 요청. `yolo`: 승인 없음 |
  | Copilot 1.0.105 | `…#agent`·`…#plan`·`…#autopilot` | `…#agent` | 직전 값(`…#plan`), `allow_all`도 직전 값(`on`) | `…#plan`: 저장소 편집이 실패하고 계획을 세션 폴더에 씀, 승인 요청 없음. `allow_all:on`: 편집 승인 없음. `…#agent`+`off`: 편집 승인 요청 |

  - `session/set_config_option`은 세 provider 모두 `current_mode_update`를 보내고 새 `configOptions`를 돌려준다. Cursor는 모르는 mode id를 "Invalid mode ID: … Valid modes: agent, plan, ask" 오류로 거부한다.
  - Cursor `session/load`는 모델 요청이 실패한 세션을 찾지 못해서, 저장 여부는 번들 코드로만 확인했다.

## POSTMORTEM에서 가져온 함정

- Codex app-server 요청 처리: "return an explicit permission/unsupported/route disposition for every valid server request" (`docs/POSTMORTEM.md`, Codex dispatcher 항목). 모드를 바꿔도 모든 서버 요청에 응답하는 규칙은 그대로 지킨다. `rg -n 'raw\.error|normalizeCodex|params\.threadId' app/src/main --glob '!*.test.*'`를 다시 돌린다.

## 선행

- 메뉴 z-index 수정(PR #60 `fix/overview-menu-layer`)과 고르기만 해도 마지막 사용·Settings에 저장하는 규칙(PR #61 `fix/remember-model-picks`)은 main에 들어왔다. 새 피커는 같은 메뉴 계층을 쓰고, 저장 규칙을 권한 모드로 넓힌다.
