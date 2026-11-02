# permission-mode — design

## 모드 대응

| 공통 모드 | id | Claude (SDK `permissionMode`) | Codex `turn/start` (`approvalPolicy` / `sandboxPolicy`) |
|---|---|---|---|
| Default | `default` | 넘기지 않는다 | `config/read`로 읽은 사용자 설정 값을 명시해서 넘긴다 |
| Accept edits | `acceptEdits` | `acceptEdits` | `on-request` / `{type:"workspaceWrite"}` |
| Plan (read-only) | `plan` | `plan` | `never` / `{type:"readOnly"}` |
| Full access | `bypass` | `bypassPermissions` + `allowDangerouslySkipPermissions: true` | `never` / `{type:"dangerFullAccess"}` |

- 근거:
  - Claude Agent SDK 0.3.312 `sdk.d.ts`의 `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`와 `Options.permissionMode`. `bypassPermissions`는 `allowDangerouslySkipPermissions`가 필요하다(`sdk.d.ts:2041`, `:2058`).
  - Codex 0.163.0 `codex app-server generate-json-schema`의 `v2/TurnStartParams`(`approvalPolicy`, `sandboxPolicy`)와 `v2/ThreadStartParams`(`approvalPolicy`, `sandbox`).
- Codex 형식은 둘로 갈린다. `thread/start`의 `sandbox`는 `SandboxMode` 문자열(`"read-only"|"workspace-write"|"danger-full-access"`)이고, `turn/start`의 `sandboxPolicy`는 객체(`{type:"readOnly"}`, `{type:"workspaceWrite", writableRoots, networkAccess}`, `{type:"dangerFullAccess"}`)다.
- Codex는 `turn/start`에서만 넘긴다. 스키마 설명이 "Override … for this turn and subsequent turns"라서 `thread/start`에 또 넘길 필요가 없다. 매 턴 model·effort를 넘기는 지금 방식(`runners.ts`)과 같다.
- Codex Plan은 `never`라서 권한 상승을 요청하지 않는다. 그래서 Codex 기본값으로 관찰된 `on-request`/`read-only`(ARCHITECTURE §7)와 구분된다.
- `{type:"workspaceWrite"}`만 넘기면 기본값 `networkAccess:false`, `writableRoots:[]`가 사용자 설정의 network·writable_roots를 덮을 수 있다. P2에서 확인하고, 덮는다면 `config/read` 값을 합쳐서 넘긴다.
- Claude는 턴마다 SDK를 새로 연다(ARCHITECTURE §7). 그래서 턴의 모드를 `query()` 옵션으로 넘기면 된다.
- 폴더 settings가 `bypassPermissions`를 막으면 SDK가 시작을 거부한다(`sdk.d.ts:351`, `permission_mode_not_claimable`). 이 경우는 기존 turn 실패 경로로 보인다. 어느 `turn.failed` code에 대응시킬지는 P1 관찰로 정해 여기에 적는다.
- Claude Plan은 계획이 끝나면 `ExitPlanMode` 도구로 승인을 요청한다. 이것은 지금의 `canUseTool` 승인 요청 경로로 그대로 보인다(새 UI 없음). 승인하면 SDK가 알려 준 다음 모드로 대화의 저장 모드를 바꾸고, renderer 피커가 그 값을 따른다. SDK가 그 모드를 어떻게 알려 주는지(승인 결과, system 메시지 등)와 공통 id 대응은 P1에서 확인한다. 공통 id에 대응되지 않으면 Default로 둔다.
- Codex override는 다음 턴에 남는다(스키마 문구로 확정). 그래서 Default 턴은 아무것도 넘기지 않는 대신, 턴마다 `config/read`로 사용자 설정의 approval·sandbox를 읽어 명시해서 넘긴다. 영속할 값이 없고, 이 feature 이전에 시작한 대화에도 맞는다. resume 뒤에도 같은 규칙이 성립하는지 P2에서 확인한다.
- ACP(Cursor·Antigravity·Copilot):
  - mode 목록은 `session/new`·`session/load` 응답의 `modes`(`availableModes`, `currentModeId`)나 `configOptions`의 mode 항목에 있다. 바꾸는 것은 `session/set_mode` 또는 `session/set_config_option`이다. 지금 ACP 모델 선택은 이미 `session/set_config_option`(`configId:"model"`)을 쓴다(`acpRunner.ts`).
  - 첫 턴 전에 목록이 있어야 사람이 첫 턴의 모드를 고를 수 있다. 그래서 ACP 모델 목록을 읽는 같은 `session/new` 응답(`models.ts`의 ACP 파서)에서 mode 목록도 함께 읽어 `models` IPC 응답에 싣는다. 새 요청을 더하지 않는다.
  - ACP는 턴마다 서버를 새로 연다(`acpRunner.ts`). 그래서 Default는 mode를 설정하지 않는 것으로 되돌릴 수 있다. Codex와 다르다.
  - 각 agent가 무엇을 알려주는지 P3에서 확인한다. 공통 id에 대응되는 mode만 피커에 보이고, 대응표는 P3 결과로 채운다.

## Default의 범위

Doan 연결 대화는 Doan 전용 profile에서 돈다(ARCHITECTURE §7 'Agent authentication'). 그래서 Default가 쓰는 '사용자 설정'은 그 profile의 사용자 설정과 프로젝트 설정(Claude `settingSources: ["user","project","local"]`, Codex의 프로젝트 config)이다. 터미널에서 쓰는 `~/.claude`·`~/.codex` 설정이 아닐 수 있다. P1·P2에서 실제로 어떤 값이 적용되는지 확인하고, Default 항목의 한 줄 설명에 반영한다.

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
  - `conversation/runners.ts`: Claude `query()`에 `permissionMode`(Full access면 `allowDangerouslySkipPermissions`도 함께). Codex `turn/start`에 대응값, Default 턴은 `config/read` 값.
  - `conversation/acpRunner.ts`: P3 결과에 따라 `session/set_mode` 또는 `session/set_config_option`.
  - `conversation/models.ts`: ACP `session/new` 응답에서 mode 목록도 읽는다.
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
- `codexPermission(mode, userConfig)`: 공통 id → `approvalPolicy`·`sandboxPolicy`. Default는 `config/read`로 읽은 사용자 설정 값.
- `acpModeFor(mode, availableModes)`: 대응되는 ACP mode id 또는 없음.
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

## PoC 의존

- P1 Claude: 네 모드가 실제로 그렇게 동작하는지, `ExitPlanMode` 승인 뒤 SDK가 다음 모드를 어떻게 알려 주는지, 폴더 settings가 bypass를 막을 때의 실패 형태, Doan profile에서 Default가 무엇인지.
- P2 Codex: Default 턴에 `config/read` 값을 넘기면 사용자 설정으로 돌아가는지(resume 뒤 포함), `workspaceWrite` 기본값이 사용자 network·writable_roots를 덮는지, Plan(`never`/`readOnly`)에서 편집 요청이 거부로 끝나는지.
- P3 ACP: Cursor·Antigravity·Copilot의 `modes`·`configOptions` mode 항목과 `session/set_mode`·`session/set_config_option` 동작.

## POSTMORTEM에서 가져온 함정

- Codex app-server 요청 처리: "return an explicit permission/unsupported/route disposition for every valid server request" (`docs/POSTMORTEM.md`, Codex dispatcher 항목). 모드를 바꿔도 모든 서버 요청에 응답하는 규칙은 그대로 지킨다. `rg -n 'raw\.error|normalizeCodex|params\.threadId' app/src/main --glob '!*.test.*'`를 다시 돌린다.

## 선행

- 메뉴 z-index 수정(PR #60 `fix/overview-menu-layer`)과 고르기만 해도 마지막 사용·Settings에 저장하는 규칙(PR #61 `fix/remember-model-picks`)은 main에 들어왔다. 새 피커는 같은 메뉴 계층을 쓰고, 저장 규칙을 권한 모드로 넓힌다.
