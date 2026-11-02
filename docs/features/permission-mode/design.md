# permission-mode — design

## 모드 대응

| 공통 모드 | id | Claude (SDK `permissionMode`) | Codex (`approvalPolicy` / sandbox) |
|---|---|---|---|
| 기본(내 설정) | `default` | 넘기지 않는다 | 넘기지 않는다 (되돌리기는 PoC P2) |
| 편집 자동 승인 | `acceptEdits` | `acceptEdits` | `on-request` / `workspace-write` |
| 계획(읽기 전용) | `plan` | `plan` | `on-request` / `read-only` |
| 모두 허용 | `bypass` | `bypassPermissions` | `never` / `danger-full-access` |

- 근거: Claude Agent SDK 0.3.312 `sdk.d.ts`의 `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`와 `Options.permissionMode`. Codex 0.163.0 `codex app-server generate-json-schema`의 `v2/TurnStartParams`(`approvalPolicy`, `sandboxPolicy`)와 `v2/ThreadStartParams`(`approvalPolicy`, `sandbox`).
- Claude는 턴마다 SDK를 새로 연다(ARCHITECTURE §7). 그래서 턴의 모드를 `query()` 옵션으로 넘기면 된다. `bypassPermissions`는 SDK가 `allowDangerouslySkipPermissions`도 요구하는지 P1에서 확인한다.
- Claude `plan`은 계획이 끝나면 `ExitPlanMode` 도구로 승인을 요청한다. 이것은 지금의 `canUseTool` 승인 요청 경로로 그대로 보인다(새 UI 없음). 승인한 뒤 남은 턴이 어느 모드로 이어지는지는 P1에서 본다.
- Codex는 app-server 하나가 턴 사이에도 유지되고, 턴의 override가 thread에 남는다("A resumed session keeps the approval/sandbox policy stored with it", ARCHITECTURE §7 'Permissions and terminals'). 그래서 '기본'으로 돌아갈 때 아무것도 넘기지 않으면 직전 override가 남을 수 있다. P2에서 확인하고, 남는다면 thread를 시작할 때의 값을 기록해 두었다가 되돌릴 때 그 값을 명시해서 넘긴다.
- ACP(Cursor·Antigravity·Copilot): `session/new`·`session/load` 응답의 `modes`(`availableModes`, `currentModeId`)와 `session/set_mode`로 바꾼다(ACP 규격). 각 agent가 무엇을 알려주는지 P3에서 확인한다. 공통 id에 대응되는 mode만 피커에 보이고, 대응표는 P3 결과로 채운다.

## '기본(내 설정)'의 범위

Doan 연결 대화는 Doan 전용 profile에서 돈다(ARCHITECTURE §7 'Agent authentication'). 그래서 '내 설정'은 그 profile의 사용자 설정과 프로젝트 설정(Claude `settingSources: ["user","project","local"]`, Codex의 프로젝트 config)이고, 터미널에서 쓰는 `~/.claude`·`~/.codex` 설정이 아닐 수 있다. P1·P2에서 실제로 어떤 값이 적용되는지 확인하고 피커 문구에 반영한다.

## 영향 받는 부분

- **app main**
  - `conversation/runners.ts`: Claude `query()`에 `permissionMode`. Codex `thread/start`와 `turn/start`에 대응값.
  - `conversation/acpRunner.ts`: P3 결과에 따라 `session/set_mode`.
  - `conversation/service.ts`: `TurnChoice`에 `permissionMode`를 더한다. 저장된 대화 choice와 send extras도 같이 바뀐다.
  - `conversation/store.ts`: 대화 metadata에 `permissionMode?`를 더하고 검증한다.
  - `conversation/ipc.ts`: 받은 값을 공통 id 목록으로 검증한다(모델처럼 renderer 값을 믿지 않는다).
  - `preferences.ts`: `NewConversationPreference`에 `permissionMode?`.
- **app renderer**
  - `ComposerParts.tsx`: `PermissionPicker`(Effort 피커와 같은 DropdownMenu, 같은 `doan-floating doan-menu`).
  - `HomeComposerView.tsx`, `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`: 도구 줄에 피커를 넣고 send·start에 값을 싣는다.
  - `restore/uiState.ts`: 마지막 사용 `models[provider]`에 `permissionMode`를 더한다.
  - `SettingsAgents.tsx`: 'New conversations'에 Permission 행.
  - 경고색: '모두 허용' 트리거는 위험 역할 토큰을 쓴다(DESIGN에 측정값을 남긴다).
- **CLI·skills·`doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `permissionOptions(provider, acpModes?)`: 피커에 보일 공통 모드 목록. Claude·Codex는 4개, ACP는 대응되는 것만, 없으면 빈 목록(피커 숨김).
- `claudePermission(mode)`, `codexPermission(mode, threadStart?)`: 공통 id → provider 옵션. Codex의 '기본'은 P2 결과에 따라 아무것도 넘기지 않거나 기록된 시작 값을 넘긴다.
- `acpModeFor(mode, availableModes)`: 대응되는 ACP mode id 또는 없음.
- `permissionTrigger(mode)`: 트리거 라벨과 경고 여부.
- 마지막 사용·Settings 기본값의 읽기/쓰기 규칙(#6의 규칙을 그대로 따르는 확장): 저장된 provider의 모드가 그 provider에서 고를 수 없으면 '기본'.
- metadata·preferences·ui-state 검증: 알 수 없는 id는 버리고 '기본'으로 읽는다.

## 형식 변경

- 공유 JSON Schema(`schema/`)는 바뀌지 않는다. 대화 metadata, `preferences.json`, ui-state는 app 전용 형식이고 각 모듈이 검증한다.
- 세 형식 모두 선택 필드를 더할 뿐이라 `v`는 그대로다. 옛 빌드가 새 필드를 만나면 무시하는지 각 검증 함수의 테스트로 확인한다(알 수 없는 키를 거부하는 검증이면 `v`를 올려야 한다. T2에서 확인).

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §3 'Agent conversation foundation contract' 'Resume and permissions'의 "The user's own permission and sandbox settings apply with no forced bypass or preset"을 바꾼다. 새 규칙: 기본은 사용자 설정이고, 사람이 고른 모드만 적용한다. Doan이 스스로 모드를 고르지 않는다. 승인 요청을 지어내지 않는다는 규칙은 그대로다.
- ARCHITECTURE §7 'Agent conversation runtime and IPC'의 "so the user's own permission settings apply"와 'Permissions and terminals'를 새 규칙으로 고친다.
- §3 Out of scope 4(자율 깨우기)와는 관계없다. 모드는 사람이 보낸 턴에만 적용된다.

## PoC 의존

- P1 Claude: 네 모드가 실제로 그렇게 동작하는지, `bypassPermissions`에 추가 플래그가 필요한지, `plan` 승인 뒤의 모드, Doan profile에서 '기본'이 무엇인지.
- P2 Codex: 턴 override가 다음 턴과 resume에 남는지, '기본'으로 되돌리는 방법, `read-only`에서 편집 요청이 거부로 끝나는지.
- P3 ACP: Cursor·Antigravity·Copilot의 `modes` 목록과 `session/set_mode` 동작.

## POSTMORTEM에서 가져온 함정

- Codex app-server 요청 처리: "return an explicit permission/unsupported/route disposition for every valid server request" (`docs/POSTMORTEM.md`, Codex dispatcher 항목). 모드를 바꿔도 모든 서버 요청에 응답하는 규칙은 그대로 지킨다. `rg -n 'raw\.error|normalizeCodex|params\.threadId' app/src/main --glob '!*.test.*'`를 다시 돌린다.
- 메뉴가 Overview 패널 뒤에 가려지는 문제(#3, 이번 실사용 이슈)는 `/ship`에서 고친다. 새 피커도 같은 메뉴 계층을 쓰므로 그 수정 뒤에 구현한다.

## 선행

- `/ship` 묶음의 #6(고르기만 해도 마지막 사용과 Settings에 저장)과 #3(메뉴 z-index)이 먼저 main에 들어온다. 이 feature는 그 규칙을 권한 모드로 넓힌다.
