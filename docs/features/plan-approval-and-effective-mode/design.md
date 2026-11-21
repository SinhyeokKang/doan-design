# plan 승인과 실제 권한 모드 — design

## 영향 받는 구성 요소

- **app (Electron + TS)** 만 바뀐다. CLI(Go)·skill·`doan check`는 바뀌지 않는다.
  - main: `conversation/transport.ts`(Claude 메시지에서 모드 읽기), `conversation/runners.ts`(Claude 턴에서 값 전달), `conversation/service.ts`(저장 조건, plan 승인 저장), `conversation/store.ts`(index 항목 읽기·쓰기), `conversation/summary.ts`(renderer로 전달).
  - renderer: `permissionPicker.ts`(trigger·menu 문구, 경고 표시), 기존 대화의 picker를 보이는 composer(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `ComposerParts.tsx`), `styles.css`(경고 속성, docked 축소 기준). `HomeComposerView.tsx`와 Settings > Agents의 기본값 picker는 새 대화만 다루므로 바뀌지 않는다.
  - Antigravity `/plan`: `renderer/commandView.ts`의 Antigravity `/plan` 카드 규칙(문구, action 없음)과 그 테스트만 바뀐다. `providerCommands.ts`의 표(`UNSUPPORTED_COMMANDS.antigravity`에 `plan`, `COMMAND_ALLOWLIST.antigravity`는 없음)와 ACP runner는 그대로다.
- **형식**: 대화 index(`index.json`)에 선택 키 하나가 는다(아래 '형식 변경').

## 실제 모드를 정하는 규칙

- 값의 이름은 `claudeRunMode`이고, 값은 Claude 자신의 id다. 표시하는 값은 `auto`, `dontAsk`, `acceptEdits`, `plan`, `bypassPermissions`이다. 다섯 값 모두 P1에서 Ask first 턴의 init이 알렸다(`auto`·`bypassPermissions`는 Doan 연결 profile 설정에서만). `auto`·`dontAsk`에는 공통 id가 없으므로 공통 id(`PermissionModeId`)로 바꾸지 않는다.
- **"없음"은 키가 없는 것으로만 나타낸다.** `"default"` 같은 문자열을 "없음"의 뜻으로 쓰지 않는다(POSTMORTEM 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'. 예방: 비어 있음은 `null`이나 kind 태그로 나타내고, provider id 공간의 문자열로 쓰지 않는다).
- **정하는 때** (모두 doan-owned Claude 대화만. legacy-external은 service에서 `owner.kind === "doan"`으로 막는다. runner에서는 legacy run도 `input.permissionMode`가 비어 Ask first처럼 보이기 때문이다):
  1. **Ask first로 보낸 턴의 첫 `system/init`.** 턴이 Ask first로 보내졌고(`input.permissionMode === undefined`, runners.ts의 `=== "plan"` 검사와 같은 자리), 저장 모드가 아직 Ask first이며, `planApproved`와 같은 `live`·`turnId`·`accepted` 조건을 지킬 때만 따른다. 한 턴의 최상위(`parent_tool_use_id`가 없는) init 중 첫 번째만 센다. Send now로 steer한 메시지가 만드는 뒤의 init은 무시한다. 그 init은 같은 process에서 `setMode` 제안이 바꾼 모드를 알릴 수 있기 때문이다. 값이 `default`이거나 표시 목록에 없는 값이면 키를 지우고, 표시 목록의 값이면 저장한다.
  2. **Plan으로 보낸 턴의 승인.** 지금의 `planApproved` 규칙(턴이 같고, 저장 모드가 아직 `plan`일 때만)을 따른다. 승인 status가 저장 모드를 Ask first로 옮기면 `permissionMode`를 지우고, `claudeRunMode`를 status 값으로 정하거나(표시 목록의 값) 지운다(`default`). 이 둘을 **한 번의 index 저장**으로 한다. 승인 status가 Ask first가 아닌 모드(예: `acceptEdits`)를 알리면 저장 모드만 옮기고 `claudeRunMode`는 그대로 둔다. 그 값은 '마지막 Ask first 턴에서 본 설정의 모드'이고, 이 승인은 Ask first 턴을 관찰한 것이 아니기 때문이다('지우지 않는 때'와 같다). 두 번 저장하면 `changed`가 두 번 나가 trigger가 깜빡인다.
  3. **설정이 `plan`을 돌린 Ask first 턴의 승인.** Ask first로 보냈고 저장 모드가 아직 Ask first인 턴에서, 두 조건을 모두 만족할 때만 승인 `system/status`를 따른다. 첫째, 이 턴의 첫 최상위 init이 `plan`을 알렸다(`turnInit`). 저장된 `claudeRunMode`로 판단하지 않는다. 그 값은 이전 턴이 남긴 것일 수 있기 때문이다. 둘째, 이 status 바로 전에 process가 마지막으로 알린 모드(init이든 status든, `previous`)가 `plan`이다. 그래서 승인 뒤 같은 턴에서 Write에 "Always allow"로 허용한 `setMode`(`acceptEdits` status)는 승인으로 읽지 않는다. 조건을 만족하면 `claudeRunMode`만 그 값에 맞추고, 저장 모드는 그대로 Ask first다. P1에서 그 status는 항상 `default`였으므로 실제로는 키를 지운다.
- 그 밖의 `system/status` 모드 변경(예: Ask first 턴에서 "Allow with suggested permissions"의 `setMode`)은 따르지 않는다. 지금 runner가 Plan 턴의 status만 따르는 이유와 같다: 그 변경은 그 process 안에서만 유효하다. P1에서 Ask first 턴에 승인 밖의 status가 온다는 것을 확인했다: Write의 `setMode` 제안으로 허용하면 `permissionMode: "acceptEdits"` status가 오고, 그 뒤 steer가 만든 다음 턴의 init도 `acceptEdits`를 알린다.
- **지우지 않는 때**: picker 선택(`storeMode`), 다른 모드로 send(service의 send 경로 `store.save`), 이전 build로 되돌린 뒤 남은 키. 값은 "마지막 Ask first 턴에서 본 설정의 모드"이므로 어떤 모드가 저장돼 있든 그대로 둔다. 표시는 저장 모드가 Ask first일 때만 한다. 그래서 send 경로나 이전 build가 키를 남겨도 오래된 값이 잘못 보이지 않는다(POSTMORTEM 2026-11-02 'A picked model was forgotten: one start path skipped the memory and a fixed default overrode it'의 '한 경로가 상태를 빠뜨림' 유형을 규칙으로 피한다).
- **턴 실패·연결 변경**: `system/init` 전에 실패하거나 멈춘 턴, 연결이나 profile이 바뀐 뒤의 턴은 값을 바꾸지 않는다. 턴이 끝난 뒤(Stop 포함) 온 init·status도 따르지 않는다. Stop은 턴을 바로 끝내지만 CLI는 자기 result까지 frame을 계속 보내기 때문이다. 다음 Ask first 턴의 init이 올 때까지 이전 값이 남는다.
- `summary.ts`는 Claude doan-owned 항목에만 값을 싣는다.

## 표시

- **trigger**: 저장 모드가 Ask first이고 `claudeRunMode`가 있으면 라벨을 "Ask first · <이름>"으로 한다. 이름은 `auto` "Auto", `dontAsk` "Don’t ask", `acceptEdits` "Accept edits", `plan` "Plan (read-only)", `bypassPermissions` "Full access"이다. menu와 같은 용어를 쓴다.
- **aria-label**: "Permission: Ask first, Claude Code settings run <이름> mode".
- **Full access 경고**(`claudeRunMode`가 `bypassPermissions`일 때. P1에서 Doan 연결 profile 설정의 `bypassPermissions`가 `allowDangerouslySkipPermissions` 없이 적용되어 init이 그 값을 알렸다): 저장 모드는 `default`로 남으므로 지금의 `data-mode="bypass"` 규칙(`styles.css`의 `.composer-permission[data-mode="bypass"]`와 docked tray의 `:not([data-mode="bypass"])` 예외)이 걸리지 않는다. 그래서 저장 모드와 별개인 경고 속성(예: `data-warning`)을 trigger에 두고 두 CSS 규칙이 그 속성도 보게 한다. 아이콘은 `shield-alert`, aria-label에는 Full access와 같이 ", no approval requests"를 붙인다. 아이콘만 보이는 docked trigger도 plain Ask first와 구별된다.
- **menu의 Ask first 설명**: "Your Claude Code settings run <이름> mode". 나머지 행은 그대로다(사용자 결정: 현재형 문구 유지. 재시작 뒤 설정이 바뀐 경우의 한계는 spec에 적었다).
- **스크린리더**: 값이 바뀌면 composer의 기존 sr-only status(`HomeComposerView.tsx`·`DockedComposer.tsx`에 있는 것과 같은 방식)로 "Claude Code settings run <이름> mode"를 한 번 알린다. 대화의 이전 값과 같으면 알리지 않는다. 값이 지워질 때는 알리지 않는다.
- **좁은 docked composer**: Permission 라벨을 먼저 숨기는 container query(`styles.css`의 `@container (max-width: 431px)`)는 가장 넓은 모델·effort 라벨("GPT-5.6-Terra", Fast가 붙은 "Extra high")과 context ring 옆의 "Ask first"에 맞춘 값이다. 이 규칙은 그대로 둔다. plain "Ask first"와 다른 provider는 지금처럼 432 미만에서 라벨을 숨긴다(사용자 결정). 실제 모드가 붙은 trigger에만 규칙을 하나 더 건다. trigger에 실제 모드 표시 속성(초안은 `data-run-mode`)을 두고, content 너비 514 미만에서 Permission 라벨을 숨긴다(`@container (max-width: 513px)`). 이 값은 실제 모드가 Claude 대화에만 붙으므로 Claude의 가장 넓은 모델·effort 라벨("Sonnet 5.5", Fast가 붙은 "Extra high")과 context ring 옆의 가장 긴 라벨 "Ask first · Plan (read-only)"(513.6px)로 쟀다. 기준은 값마다 따로 두지 않고 하나로 한다. 초안의 Chrome 측정값이므로 `/design-sync`가 앱에서 다시 잰다. Sonnet에 Fast가 없으면 실제로 가장 넓은 조합은 Opus 5.5와 Fast(502.9px)이고, 그때 기준은 조금 일찍 숨기는 쪽으로 틀린다. 짝 모델이 없는 기본 행이 "Default (recommended)"를 보이면 plain "Ask first"도 지금 규칙을 넘는다. 이 한계는 이미 받아들인 것이다(`docs/design/canvas-conversation.md`). PRODUCT §5 item 1의 순서(Permission 먼저, 그다음 Effort, 그 뒤 모델 라벨 말줄임)를 지킨다. 아이콘만 보일 때도 aria-label과 tooltip(`IconTip`)이 실제 모드를 말한다.
- 문구는 Doan의 `clarify` preset을 읽고 정했다. 설정의 출처(Doan 연결 profile인지 프로젝트 파일인지)는 Claude가 알려 주지 않으므로 "Claude Code settings"로만 쓴다.
- UI 초안은 `/design-draft`로 그리고, 사용자가 앱에서 확인한 뒤 `/tdd`를 시작한다.
- **초안 요청**: `.doan/canvases/permission-run-mode.html`, canvas id `permission-run-mode`, 너비 1760. 기존 `permission-mode.html`은 이미 develop에 있는 화면의 초안이라 고치지 않고 새 파일에 그린다. frame:
  - `run-mode-trigger`: 기존 대화의 docked composer trigger. 값 없음, Auto, Don’t ask, 다른 모드를 고른 뒤 값이 숨은 상태, 스크린리더 알림 문구.
  - `run-mode-menu`: menu를 연 상태. Ask first 설명이 Auto·Don’t ask일 때.
  - `run-mode-docked-steps`: 실제 모드가 붙은 라벨에서 Permission이 아이콘으로 줄어드는 첫 단계와 tooltip, 같은 너비에서 라벨을 지키는 plain "Ask first".
  - `run-mode-plan-approved`: Plan 턴의 승인 전후. 승인 뒤 trigger는 덧붙인 값 없는 "Ask first"다(P1: 승인 status는 늘 `default`).
  - Full access(`bypassPermissions`), Accept edits, Plan 이름은 P1이 확인했으므로 `--revise`로 더했다(commit c0eb48c5c까지, 독립 리뷰 두 차례).
  - 사용자가 앱에서 첫 초안을 확정했고(commit aa311254e 기준), P1 이름을 더한 revise도 스크린샷으로 확정했다(commit c0eb48c5c 기준). 이 4개 frame이 `/design-sync`의 기준이다.

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
- Antigravity `/plan`은 카드로 남는다. PRODUCT §5 item 1 'Built-in commands'의 'Cards'에서 Antigravity `/plan`이 permission picker를 가리킨다는 부분을 새 문구("Doan can’t show Antigravity’s plan approval yet. Ask for a plan in a message instead.", 버튼 없음)로 바꾼다. BACKLOG 'Undecided'의 Antigravity `/plan` 항목은 P2 결과(승인은 다음 사람 메시지)와 아래 세 문제를 담아 고쳐 쓴다. 승격은 마지막 task에서 conductor가 한다.

## PoC 의존

- **P1 (Claude)**: 2026-11-22에 확인했다. Claude Code 2.1.312, Agent SDK 0.3.312(app이 고정한 버전), 유지된 provider profile의 Claude 설정 폴더(`CLAUDE_CONFIG_DIR`, team 로그인), Doan과 같은 `query` 옵션(`settingSources: ["user", "project", "local"]`, `managedSettings.forceLoginOrgUUID`, `canUseTool`, 입력을 열어 둔 메시지 stream). 기록한 frame은 `.scratch/poc-p1/frames/`에 있고, Claude 모드 reader의 테스트 fixture로 쓴다. 시험에서는 Write 한 번과 `node -e` 명령 한 번을 요청했다(`echo`는 읽기 전용이라 어느 모드에서도 묻지 않는다).
  - **Ask first 턴(모드를 넘기지 않음)의 최상위 `system/init` `permissionMode`와 묻는지 여부**:

    | `defaultMode` | 프로젝트 설정(`.claude/settings.json`) | Doan 연결 profile 설정(`settings.json`) |
    |---|---|---|
    | 없음 | `default`, Write·Bash를 묻는다 | — |
    | `auto` | `default`, Write·Bash를 묻는다(무시됨. `settings.local.json`도 같다) | `auto`, 묻지 않는다 |
    | `dontAsk` | `dontAsk`, 묻지 않고 Write·Bash를 거부한다(`permission_denials`) | 같다 |
    | `acceptEdits` | `acceptEdits`, Bash만 묻는다 | 같다 |
    | `plan` | `plan`, ExitPlanMode를 묻는다. 승인 뒤 Write·Bash를 묻는다 | 같다 |
    | `bypassPermissions` | `default`, Write·Bash를 묻는다(무시됨. `settings.local.json`도 같다) | `bypassPermissions`, 묻지 않는다. `allowDangerouslySkipPermissions` 없이 적용된다 |

  - **계정이 `auto`를 쓸 수 없을 때**: 관찰하지 못했다. 이 계정은 `auto`를 쓸 수 있었다(모드를 직접 넘기거나 flag 설정에 넣으면 init이 `auto`). 프로젝트 설정의 `auto`가 `default`로 시작하는 것은 계정 제한이 아니라 Claude가 그 설정 층의 `auto`를 받지 않기 때문이다.
  - **plan 승인 뒤 `system/status`**: Plan으로 보낸 턴을 승인하면(Doan처럼 `allow`만 돌려줌. ExitPlanMode 요청에는 제안이 없다) 프로젝트 설정이 없음·`auto`·`dontAsk`·`acceptEdits`일 때, profile 설정이 `auto`일 때 모두 `permissionMode: "default"`가 왔다. `defaultMode: "plan"`(프로젝트, profile 모두)인 Ask first 턴을 승인해도 `default`가 왔다. 승인 뒤 Write·Bash는 다시 묻는다. 승인 status는 `user_message_uuids` 대신 `uuid`만 싣는다.
  - **plan 승인 밖의 status**: 온다. 설정 없는 Ask first 턴에서 Write 요청을 그 제안(`setMode` `acceptEdits`, destination `session`)으로 허용하면 `permissionMode: "acceptEdits"` status가 온다.
  - **steer 뒤 init**: 도구 실행 중에 보낸 steer는 턴에 합쳐지고 init이 다시 오지 않는다(status의 `user_message_uuids`에 그 uuid가 실린다). 마지막 답 텍스트가 시작된 뒤 보낸 steer는 첫 result 뒤 다음 턴으로 돌고, 그 턴의 최상위 init이 새로 온다. 그 init은 같은 process의 현재 모드를 알린다: 설정이 없으면 `default`, 앞서 `setMode` 제안을 허용했으면 `acceptEdits`. 그래서 한 턴의 첫 init만 세는 규칙이 필요하다.
  - **subagent frame**: `parent_tool_use_id`가 붙은 `user`·`assistant` 메시지만 왔고, subagent의 init·status는 없었다.
  - profile 설정 시험은 유지된 profile의 `settings.json`을 잠시 고쳐 했고, 끝난 뒤 원래 내용으로 되돌렸다(sha256 일치).
- **P2 (Antigravity `/plan`)**: Antigravity ACP 서버 1.3.0에서 (b)로 확인했다(2026-11-22). `/plan` 턴은 계획을 `<GEMINI_HOME>/antigravity-acp/brain/<session>/` 아래 artifact 파일(`plan.md` 등)로 쓰고, 계획을 만들었다는 메시지(계획 파일 링크)와 함께 "click **Proceed**"를 안내하고 `stopReason: "end_turn"`으로 끝난다. 'Proceed'는 protocol 요청이 아니다. 서버가 보낸 것은 `session/update`와 표준 `session/request_permission`뿐이었고, 표준 밖 method는 없었다.
  - Ask first(`default`)에서는 계획 파일을 쓰기 전에 표준 권한 요청(`Run create_file?`, edit, 내용은 계획 전체를 담은 diff, `rawInput.ArtifactMetadata.RequestFeedback: true`, 선택지 `allow`·`deny`)이 한 번 온다. 이 요청은 실행 승인이 아니라 계획 파일 쓰기 승인이다. 허용하면 쓰기는 다른 tool call id로 돌고, 권한 요청의 tool call은 턴 끝에 `failed`("Tool call was approved but never executed.")로 온다.
  - 다음 사람 메시지로 "Proceed"를 보내면 계획을 실행한다. 서버를 내렸다가 `session/load`로 이어 보낸 경우(Doan의 턴마다 서버 하나)에도 실행했다. 실행 중 도구는 모드대로 다시 권한을 묻는다.
  - 거절 메시지나 다른 메시지를 보내면 실행하지 않고 답만 한 뒤 끝나며, wire에 남는 대기 요청은 없다. 계획 파일 쓰기를 거절하면 계획을 메시지로만 보낸다.
  - Accept edits·Full access에서 계획 파일 쓰기가 묻는지는 확인하지 않았다. probe에는 Doan의 fence를 걸지 않았다(fence는 `brain` 폴더 쓰기를 허용한다).
  - frame: `.scratch/poc-p2/frames/`(gitignored).
  - 결정 게이트(2026-11-22): 처음에는 카드를 빼고 `/plan`을 보내기로 했다(A1). 그 구현의 검토와 실제 앱 확인 뒤 사용자가 되돌리기로 했다(2026-11-22): 카드는 남기고 잘못된 문구만 고치며, 보내기는 나중 `/feature`에서 따로 다룬다.
  - **보내기를 되돌린 이유**(사실, 근거: 검토 `plan-approval-and-effective-mode` worktree의 `.scratch/evidence/review-A1.md`, 실제 앱 확인 `.scratch/runtime-test/plan-a1/`의 `log.txt`·`shots/`, 모두 gitignored):
    - 새 대화의 첫 메시지 `/plan`: renderer는 서버가 알린 명령 목록으로만 명령을 읽는데(`commandView.ts` `classifyFirstWord`), 새 대화에는 목록이 아직 없어 text로 읽는다. main은 표 전체로 읽는다(`providerCommands.ts` `commandName`). 그래서 preset이나 skill 줄이 붙으면 메시지가 `/plan`으로 시작하지 않아 보통 턴이 되고, anchor나 첨부가 있으면 main이 명령으로 읽어 `bad_request`로 실패한다. 실제 앱 확인은 preset·anchor·첨부 없는 첫 메시지만 다뤘다.
    - 대화 이름: 명령은 대화 이름을 정하지 않으므로(PRODUCT §5 'Built-in commands'), `/plan <할 일>`로 시작한 대화는 "Conversation"이었다가 다음 메시지 "Proceed"로 이름이 붙었다(`shots/02-permission-3.png`, `shots/04-after-turn.png`).
    - 계획 본문이 thread에 보이지 않았다. 계획 파일 권한 카드는 Doan profile 안의 절대 경로와 "Run create_file?"만 보였고, 허용 뒤에는 "Edited <경로>" 단계와 "계획을 만들었으니 검토하라"는 답만 남았다(`shots/02-permission-3.png`, `shots/02-expanded-*.png`). 사람은 읽지 못한 계획에 "Proceed"를 보내게 된다.
    - 확인된 다른 사실: 권한 요청의 tool call이 `failed`로 끝나는 update는 thread에 실패 단계로 보이지 않았다. 공유 profile에서 `/plan`은 다른 대화의 `brain` 폴더를 읽었다(단계마다 권한을 물음).

## 관련 POSTMORTEM

- 2026-10-30 'A renderer import of a main module left the built app's window blank': `permissionMode.ts`는 renderer가 값으로 import하므로 type만 import해야 한다. 어기면 빌드한 앱의 창이 비어 버린다(`rendererImports.test.ts`).
- 2026-11-06 'A menu's "nothing chosen" value shared its string with a real model id'(`ComposerParts.tsx`): "선택 없음"을 provider id 공간의 문자열로 나타내 오작동했다. `claudeRunMode`의 "없음"은 키가 없는 것으로만 나타낸다.
- 2026-11-02 'A picked model was forgotten: one start path skipped the memory and a fixed default overrode it': 상태를 쓰는 경로 하나가 빠져 오래된 값이 남았다. 이번에는 값을 지우는 경로를 두지 않고, 표시 조건으로 오래된 값을 막는다.
