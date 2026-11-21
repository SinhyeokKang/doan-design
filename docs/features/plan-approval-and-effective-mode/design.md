# plan 승인과 실제 권한 모드 — design

## 영향 받는 구성 요소

- **app (Electron + TS)** 만 바뀐다. CLI(Go)·skill·`doan check`는 바뀌지 않는다.
  - main: `conversation/transport.ts`(Claude 메시지에서 모드 읽기), `conversation/runners.ts`(Claude 턴에서 값 전달), `conversation/service.ts`(저장 조건, plan 승인 저장), `conversation/store.ts`(index 항목 읽기·쓰기), `conversation/summary.ts`(renderer로 전달).
  - renderer: `permissionPicker.ts`(trigger·menu 문구, 경고 표시), 기존 대화의 picker를 보이는 composer(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `ComposerParts.tsx`), `styles.css`(경고 속성, docked 축소 기준). `HomeComposerView.tsx`와 Settings > Agents의 기본값 picker는 새 대화만 다루므로 바뀌지 않는다.
  - Antigravity `/plan`: PoC P2와 결정 게이트 뒤에만, `renderer/commandView.ts`의 카드 규칙과 ACP runner(`conversation/acpRunner.ts`, `conversation/acp.ts`)가 바뀔 수 있다.
- **형식**: 대화 index(`index.json`)에 선택 키 하나가 는다(아래 '형식 변경').

## 실제 모드를 정하는 규칙

- 값의 이름은 `claudeRunMode`이고, 값은 Claude 자신의 id다. 지금 표시하는 값은 `auto`와 `dontAsk`이고, P1이 확인하면 `acceptEdits`, `plan`, `bypassPermissions`를 더한다. `auto`·`dontAsk`에는 공통 id가 없으므로 공통 id(`PermissionModeId`)로 바꾸지 않는다.
- **"없음"은 키가 없는 것으로만 나타낸다.** `"default"` 같은 문자열을 "없음"의 뜻으로 쓰지 않는다(POSTMORTEM 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'. 예방: 비어 있음은 `null`이나 kind 태그로 나타내고, provider id 공간의 문자열로 쓰지 않는다).
- **정하는 때** (모두 doan-owned Claude 대화만. legacy-external은 service에서 `owner.kind === "doan"`으로 막는다. runner에서는 legacy run도 `input.permissionMode`가 비어 Ask first처럼 보이기 때문이다):
  1. **Ask first로 보낸 턴의 첫 `system/init`.** 턴이 Ask first로 보내졌고(`input.permissionMode === undefined`, runners.ts의 `=== "plan"` 검사와 같은 자리), 저장 모드가 아직 Ask first이며, `planApproved`와 같은 `live`·`turnId`·`accepted` 조건을 지킬 때만 따른다. 한 턴의 최상위(`parent_tool_use_id`가 없는) init 중 첫 번째만 센다. Send now로 steer한 메시지가 만드는 뒤의 init은 무시한다. 그 init은 같은 process에서 `setMode` 제안이 바꾼 모드를 알릴 수 있기 때문이다. 값이 `default`이거나 표시 목록에 없는 값이면 키를 지우고, 표시 목록의 값이면 저장한다.
  2. **Plan으로 보낸 턴의 승인.** 지금의 `planApproved` 규칙(턴이 같고, 저장 모드가 아직 `plan`일 때만)을 따른다. `permissionMode`를 지우는 것과 `claudeRunMode`를 정하거나 지우는 것을 **한 번의 index 저장**으로 한다. 두 번 저장하면 `changed`가 두 번 나가 trigger가 깜빡인다.
  3. **설정이 `plan`을 돌린 Ask first 턴의 승인.** 저장된 `claudeRunMode`가 `plan`인 Ask first 턴에서 승인 `system/status`가 오면 `claudeRunMode`만 그 값으로 바꾼다. 저장 모드는 그대로 Ask first다. P1이 `plan`을 확인했을 때만 적용한다.
- 그 밖의 `system/status` 모드 변경(예: Ask first 턴에서 "Allow with suggested permissions"의 `setMode`)은 따르지 않는다. 지금 runner가 Plan 턴의 status만 따르는 이유와 같다: 그 변경은 그 process 안에서만 유효하다. P1에서 Ask first 턴에 승인 밖의 status가 오는지 확인한다.
- **지우지 않는 때**: picker 선택(`storeMode`), 다른 모드로 send(service의 send 경로 `store.save`), 이전 build로 되돌린 뒤 남은 키. 값은 "마지막 Ask first 턴에서 본 설정의 모드"이므로 어떤 모드가 저장돼 있든 그대로 둔다. 표시는 저장 모드가 Ask first일 때만 한다. 그래서 send 경로나 이전 build가 키를 남겨도 오래된 값이 잘못 보이지 않는다(POSTMORTEM 2026-11-02 'A picked model was forgotten: one start path skipped the memory and a fixed default overrode it'의 '한 경로가 상태를 빠뜨림' 유형을 규칙으로 피한다).
- **턴 실패·연결 변경**: `system/init` 전에 실패하거나 멈춘 턴, 연결이나 profile이 바뀐 뒤의 턴은 값을 바꾸지 않는다. 다음 Ask first 턴의 init이 올 때까지 이전 값이 남는다.
- `summary.ts`는 Claude doan-owned 항목에만 값을 싣는다.

## 표시

- **trigger**: 저장 모드가 Ask first이고 `claudeRunMode`가 있으면 라벨을 "Ask first · <이름>"으로 한다. 이름은 `auto` "Auto", `dontAsk` "Don't ask"이다. P1이 확인하면 `acceptEdits` "Accept edits", `plan` "Plan (read-only)", `bypassPermissions` "Full access"를 더한다. menu와 같은 용어를 쓴다.
- **aria-label**: "Permission: Ask first, Claude Code settings run <이름> mode".
- **Full access 경고**(P1이 `bypassPermissions`를 확인했을 때): 저장 모드는 `default`로 남으므로 지금의 `data-mode="bypass"` 규칙(`styles.css`의 `.composer-permission[data-mode="bypass"]`와 docked tray의 `:not([data-mode="bypass"])` 예외)이 걸리지 않는다. 그래서 저장 모드와 별개인 경고 속성(예: `data-warning`)을 trigger에 두고 두 CSS 규칙이 그 속성도 보게 한다. 아이콘은 `shield-alert`, aria-label에는 Full access와 같이 ", no approval requests"를 붙인다. 아이콘만 보이는 docked trigger도 plain Ask first와 구별된다.
- **menu의 Ask first 설명**: "Your Claude Code settings run <이름> mode". 나머지 행은 그대로다(사용자 결정: 현재형 문구 유지. 재시작 뒤 설정이 바뀐 경우의 한계는 spec에 적었다).
- **스크린리더**: 값이 바뀌면 composer의 기존 sr-only status(`HomeComposerView.tsx`·`DockedComposer.tsx`에 있는 것과 같은 방식)로 "Claude Code settings run <이름> mode"를 한 번 알린다. 대화의 이전 값과 같으면 알리지 않는다. 값이 지워질 때는 알리지 않는다.
- **좁은 docked composer**: Permission 라벨을 먼저 숨기는 container query(`styles.css`의 `@container (max-width: 431px)`)는 "Plan (read-only)" 기준으로 맞춘 값이다. 가장 긴 라벨("Ask first · Accept edits" 또는 "Ask first · Don't ask")로 `/design-draft`·`/design-sync`에서 기준을 다시 잰다. PRODUCT §5 item 1의 순서(Permission 먼저, 그다음 Effort, 그 뒤 모델 라벨 말줄임)를 지킨다. 아이콘만 보일 때도 aria-label과 tooltip(`IconTip`)이 실제 모드를 말한다.
- 문구는 Doan의 `clarify` preset을 읽고 정했다. 설정의 출처(Doan 연결 profile인지 프로젝트 파일인지)는 Claude가 알려 주지 않으므로 "Claude Code settings"로만 쓴다.
- UI 초안은 `/design-draft`로 그리고, 사용자가 앱에서 확인한 뒤 `/tdd`를 시작한다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- **Claude 모드 읽기** (`transport.ts`): 지금의 `claudeReportedMode`(status만 읽고 `claudeModeAfterPlan`으로 공통 id로 바꾼다)를 넓혀 하나의 reader로 만든다. reader는 최상위 `system/init`과 `system/status`에서 Claude 자신의 id를 그대로 돌려주고(`{ source: "init" | "status", mode }`), 공통 id로 바꾸는 일(`claudeModeAfterPlan`)과 `claudeRunMode`로 바꾸는 일은 호출하는 쪽이 한다. 같은 필드를 읽는 parser를 둘 두지 않는다. subagent 메시지와 다른 메시지는 `undefined`.
- **index 값 검사** (`readClaudeRunMode`, `store.ts`): 모르는 값이면 그 키만 버린다. 파일 전체를 무효로 만들지 않는다(지금 `permissionMode`의 예외와 같은 이유).
- **저장 조건** (service와 같은 자리의 순수 함수): (턴을 보낸 모드, 저장 모드, owner, 이 턴에서 init을 이미 셌는지, 읽은 값, 지금 `claudeRunMode`) → 저장 / 지우기 / 무시. plan 승인은 (새 저장 모드, 새 `claudeRunMode`)를 한 번에 돌려준다.
- **trigger view** (`permissionTrigger`·`permissionPickerView`, `permissionPicker.ts`): 라벨, aria-label, 아이콘, 경고, Ask first 설명. provider가 Claude이고 저장 모드가 Ask first일 때만 값을 반영한다.
- **알림 문구** (`runModeAnnouncement(previous, next)`): 바뀐 경우에만 문구를 돌려준다.

## 형식 변경

- `index.json` 항목에 선택 키 `claudeRunMode`를 더한다. ARCHITECTURE §11 'Shared formats'의 JSON Schema 대상이 아니다. index는 `store.ts`의 `parseIndex`가 읽는다.
- reader는 모르는 키를 무시하므로(ARCHITECTURE §7 'Device-local storage and limits', index v3) 버전 `v`는 올리지 않는다. 이전 build는 이 키를 무시하고, 저장할 때 그대로 남긴다. 위 규칙상 남은 키는 저장 모드가 Ask first일 때만 보이므로 문제가 없다.
- TS와 Go가 함께 읽는 fixture는 필요 없다. Go는 index를 읽지 않는다.
- renderer가 `permissionMode.ts`를 값으로 import하므로, 새 타입·검사기를 그 파일에 두면 type 이외의 import를 더하지 않는다(POSTMORTEM 2026-10-30, `rendererImports.test.ts`).

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE §7 'Permission modes'의 "`bypassPermissions`, `auto` and `dontAsk` read as Ask first"는 유지한다. 저장 모드는 그대로 Ask first이고, 이번 기능은 실제 모드를 따로 기록해 표시만 한다. Full access를 따라가지 않는 이유(사람이 고르지 않은 턴에 `allowDangerouslySkipPermissions`를 넘기게 됨)도 그대로 성립한다. 승격할 때 그 줄 뒤에 `claudeRunMode` 규칙을 더하고, `claudeModeAfterPlan` 주석도 맞게 고친다.
- PRODUCT §5 item 1 'Permission picker'에 실제 모드 표시 규칙이 는다(마지막 task에서 승격).
- Antigravity `/plan`을 보내게 되면 PRODUCT §5 item 1 'Built-in commands'의 카드 목록에서 빠진다. 사용자 결정 뒤에만 바꾼다.

## PoC 의존

- **P1 (Claude)**: 아직 확인하지 않은 가정이 있다. 기록한 frame은 Claude 모드 reader의 테스트 fixture로 쓴다.
  - `defaultMode`가 `auto`·`dontAsk`·`acceptEdits`·`plan`·`bypassPermissions`인 프로젝트에서, 모드를 넘기지 않은 턴의 `system/init` `permissionMode`가 그 값인가. `bypassPermissions`는 `allowDangerouslySkipPermissions` 없이 설정만으로 적용되는가.
  - 계정이 `auto`를 쓸 수 없을 때 `defaultMode: "auto"`의 init이 무엇을 알리는가(`default`로 떨어지는지).
  - `defaultMode: "auto"`에서 Plan 턴을 승인하면 `system/status`가 `auto`를 알리는가. `defaultMode: "plan"`인 Ask first 턴을 승인하면 무엇을 알리는가.
  - Ask first 턴에서 plan 승인 밖의 `system/status`가 `permissionMode`를 싣고 오는가. Send now로 steer한 뒤의 init은 무엇을 알리는가.
  - Ask first 턴에서 `auto`가 실제로 묻지 않는가. `dontAsk`는 허용되지 않은 도구를 묻지 않고 거부하는가.
  - 결과를 이 문서와 spec 완료 조건에 적고, 확인되지 않은 값은 표시 목록에서 뺀다.
- **P2 (Antigravity `/plan`)**: Antigravity ACP 서버 1.3.0(또는 현재 버전)에 `/plan`을 보내고 'Proceed' 승인이 protocol에서 어떤 모양인지 기록한다. 가능한 결과는 셋이다.
  - (a) `session/request_permission`으로 묻는다: 지금의 권한 카드로 답할 수 있을 수 있다. 카드를 빼고 실제 앱에서 확인한다.
  - (b) 계획을 답으로 보내고 다음 사람 메시지("Proceed")를 기다린다: 새 UI 없이 다음 턴으로 이어질 수 있다.
  - (c) ACP 표준 밖 확장으로 묻는다: 새 승인 UI가 필요하다.
  - 어느 경우든 결과를 보고 사용자에게 범위를 묻는다. 이 결정 전에는 Antigravity 쪽 코드를 쓰지 않는다. Claude 쪽 작업은 이 결정을 기다리지 않는다.

## 관련 POSTMORTEM

- 2026-10-30 'A renderer import of a main module left the built app's window blank': `permissionMode.ts`는 renderer가 값으로 import하므로 type만 import해야 한다. 어기면 빌드한 앱의 창이 비어 버린다(`rendererImports.test.ts`).
- 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'(`ComposerParts.tsx`): "선택 없음"을 provider id 공간의 문자열로 나타내 오작동했다. `claudeRunMode`의 "없음"은 키가 없는 것으로만 나타낸다.
- 2026-11-02 'A picked model was forgotten: one start path skipped the memory and a fixed default overrode it': 상태를 쓰는 경로 하나가 빠져 오래된 값이 남았다. 이번에는 값을 지우는 경로를 두지 않고, 표시 조건으로 오래된 값을 막는다.
