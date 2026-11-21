# plan 승인과 실제 권한 모드 — design

## 영향 받는 구성 요소

- **app (Electron + TS)** 만 바뀐다. CLI(Go)·skill·`doan check`는 바뀌지 않는다.
  - main: `conversation/transport.ts`(Claude 메시지에서 실제 모드 읽기), `conversation/runners.ts`(Claude 턴에서 값 전달), `conversation/service.ts`(저장·지우기), `conversation/store.ts`(index 항목 읽기·쓰기), `conversation/summary.ts`(renderer로 전달).
  - renderer: `permissionPicker.ts`(trigger·menu 문구), 이 view를 쓰는 composer들(`HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `ComposerParts.tsx`). Settings > Agents의 기본값 picker는 대화가 없으므로 바뀌지 않는다.
  - Antigravity `/plan`: PoC P2 결과에 따라 `renderer/commandView.ts`의 카드 규칙과 ACP runner(`conversation/acpRunner.ts`, `conversation/acp.ts`)가 바뀔 수 있다.
- **형식**: 대화 index(`index.json`)에 선택 키 하나가 는다(아래 '형식 변경').

## 실제 모드를 정하는 규칙

- 값의 이름은 `claudeRunMode`이고, 값은 Claude 자신의 id다: `acceptEdits`, `plan`, `bypassPermissions`, `auto`, `dontAsk`. `auto`·`dontAsk`에는 공통 id가 없으므로 공통 id(`PermissionModeId`)로 바꾸지 않는다.
- **"없음"은 키가 없는 것으로만 나타낸다.** `"default"` 같은 문자열을 "없음"의 뜻으로 쓰지 않는다(POSTMORTEM 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'. 예방: 비어 있음은 `null`이나 kind 태그로 나타내고, provider id 공간의 문자열로 쓰지 않는다).
- 언제 정하는가:
  1. 저장 모드가 Ask first인 Claude 턴에서, 최상위(`parent_tool_use_id`가 없는) `system/init`의 `permissionMode`. `default`면 키를 지우고, 위 다섯 값이면 저장한다. 다른 값은 무시한다(키를 그대로 둔다).
  2. Plan으로 보낸 턴에서 plan이 승인되어 저장 모드가 Ask first가 될 때, 같은 `system/status`의 `permissionMode`. 지금의 `planApproved` 규칙(턴이 같고, 저장 모드가 아직 `plan`일 때만)을 그대로 따른다.
- 언제 지우는가: 사람이 picker나 send로 Ask first가 아닌 모드를 저장할 때(`storeMode`). 다음 턴은 그 모드를 명시해서 보내므로 설정이 끼어들지 않는다. 다시 Ask first를 골라도 키는 다음 턴의 `system/init`까지 비어 있다.
- legacy-external 대화는 모드를 넘기지 않고 picker도 고정("Set in your terminal")이므로 정하지 않는다.
- Ask first 턴 중간에 Claude가 다른 이유로 `system/status` 모드를 바꾸는 경우(예: "Allow with suggested permissions"의 `setMode`)는 따르지 않는다. 지금 runner가 Plan 턴의 status만 따르는 이유와 같다: 그 변경은 그 process 안에서만 유효하다.

## 표시

- trigger: 저장 모드가 Ask first이고 `claudeRunMode`가 있으면 라벨을 "Ask first · <이름>"으로 한다. 이름은 `auto` "Auto", `dontAsk` "Don't ask", `acceptEdits` "Accept edits", `plan` "Plan", `bypassPermissions` "Full access"이다(P1이 확인한 값만 남긴다).
- aria-label: "Permission: Ask first, Claude Code settings run <이름> mode". `bypassPermissions`이면 Full access와 같이 ", no approval requests"를 붙이고 warning ink를 쓴다. 색만으로 뜻을 전하지 않는다는 지금 규칙(`permissionTrigger`)을 따른다.
- menu의 Ask first 설명: "Your Claude Code settings run <이름> mode". 나머지 행은 그대로다.
- 좁은 docked composer가 trigger를 아이콘으로 줄이는 규칙(PRODUCT §5 item 1)은 그대로다. 아이콘만 보일 때도 aria-label이 실제 모드를 말한다.
- 문구는 Doan의 `clarify` preset을 따라 정했다. 설정의 출처(Doan 연결 profile인지 프로젝트 파일인지)는 Claude가 알려 주지 않으므로 "Claude Code settings"로만 쓴다.
- UI 초안은 `/design-draft`로 그린다(`/feature-review` 뒤, `/tdd` 전).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `claudeRunModeOf(raw)` (`transport.ts`): 최상위 `system/init`이나 `system/status`에서 `permissionMode`를 읽어 `{ kind: "clear" } | { kind: "set", mode } | undefined`를 돌려준다. 다른 메시지, subagent 메시지, 모르는 값은 `undefined`.
- `readClaudeRunMode(value)` (`store.ts` 또는 `permissionMode.ts`): index에서 읽은 값을 검사한다. 모르는 값이면 그 키만 버린다. 파일 전체를 무효로 만들지 않는다(지금 `permissionMode`의 예외와 같은 이유).
- `permissionTrigger(mode, runMode?)`·`permissionPickerView(…, runMode?)` (`permissionPicker.ts`): 라벨, aria-label, warning, Ask first 설명.
- service의 저장·지우기 결정은 `planApproved`·`storeMode`와 같은 자리에서 순수한 조건 함수로 뺀다(턴·저장 모드·값 → 저장/지우기/무시).

## 형식 변경

- `index.json` 항목에 선택 키 `claudeRunMode`를 더한다. ARCHITECTURE §11의 JSON Schema 대상이 아니다. index는 `store.ts`의 `parseIndex`가 읽는다.
- reader는 모르는 키를 무시하므로(ARCHITECTURE §7 'Storage', index v3) 버전 `v`는 올리지 않는다. 이전 build는 이 키를 무시한다.
- 키를 쓰는 조건이 `permissionMode`가 없을 때(Ask first)뿐이라는 것을 store 테스트로 고정한다.
- renderer가 `permissionMode.ts`를 값으로 import하므로, 새 타입·검사기를 그 파일에 두면 type 이외의 import를 더하지 않는다(POSTMORTEM 2026-10-30, `rendererImports.test.ts`).

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE §7 'Permission modes'의 "`bypassPermissions`, `auto` and `dontAsk` read as Ask first"는 유지한다. 저장 모드는 그대로 Ask first이고, 이번 기능은 실제 모드를 따로 기록해 표시만 한다. Full access를 따라가지 않는 이유(사람이 고르지 않은 턴에 `allowDangerouslySkipPermissions`를 넘기게 됨)도 그대로 성립한다.
- PRODUCT §5 item 1 'Permission picker'에 한 문장이 는다(마지막 task에서 승격).
- Antigravity `/plan`을 보내게 되면 PRODUCT §5 item 1 'Built-in commands'의 카드 목록에서 빠진다. 사용자 결정 뒤에만 바꾼다.

## PoC 의존

- **P1 (Claude)**: 아직 확인하지 않은 가정이 있다.
  - `defaultMode`가 `auto`·`dontAsk`·`acceptEdits`·`plan`·`bypassPermissions`인 프로젝트에서, 모드를 넘기지 않은 턴의 `system/init` `permissionMode`가 그 값인가. `bypassPermissions`는 `allowDangerouslySkipPermissions` 없이 설정만으로 적용되는가.
  - `defaultMode: "auto"`에서 Plan 턴을 승인하면 `system/status`가 `auto`를 알리는가(P1 이전 PoC는 `defaultMode`가 없는 환경에서 `default`만 관찰했다).
  - Ask first 턴에서 `auto`가 실제로 묻지 않는가. `dontAsk`는 허용되지 않은 도구를 묻지 않고 거부하는가.
  - 결과를 이 문서에 적고, 확인되지 않은 값은 표시 목록에서 뺀다.
- **P2 (Antigravity `/plan`)**: Antigravity ACP 서버 1.3.0에 `/plan`을 보내고 'Proceed' 승인이 protocol에서 어떤 모양인지 기록한다. 가능한 결과는 셋이다.
  - (a) `session/request_permission`으로 묻는다: 지금의 권한 카드로 답할 수 있을 수 있다. 카드를 빼고 실제 앱에서 확인한다.
  - (b) 계획을 답으로 보내고 다음 사람 메시지("Proceed")를 기다린다: 새 UI 없이 다음 턴으로 이어질 수 있다.
  - (c) ACP 표준 밖 확장으로 묻는다: 새 승인 UI가 필요하다.
  - 어느 경우든 결과를 보고 사용자에게 범위를 묻는다. 이 결정 전에는 Antigravity 쪽 코드를 쓰지 않는다.

## 관련 POSTMORTEM

- 2026-10-30 'A renderer import of a main module left the built app's window blank': `permissionMode.ts`는 renderer가 값으로 import하므로 type만 import해야 한다. 어기면 빌드한 앱의 창이 비어 버린다(`rendererImports.test.ts`).
- 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'(`ComposerParts.tsx`): "선택 없음"을 provider id 공간의 문자열로 나타내 오작동했다. `claudeRunMode`의 "없음"은 키가 없는 것으로만 나타낸다.
