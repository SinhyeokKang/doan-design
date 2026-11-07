# defect-sweep — design

항목마다 원인과 고칠 자리를 적는다. 줄 번호는 적지 않는다(main이 계속 움직인다). 작업자는 BACKLOG 원문(spec에 요약)과 아래 자리를 읽고 시작한다.

## 1. 항목별 설계

### A. 포커스·키보드 (renderer)
- **A1** `2dec1854` 이후 App의 page Esc 처리(`App.tsx` window keydown)는 `defaultPrevented` 이벤트를 건너뛰고, Radix DismissableLayer는 메뉴를 닫은 Esc를 `preventDefault`한다. 그래서 고칠 코드는 없을 가능성이 크다. `App.settings.test.tsx`에 동작 테스트 두 개를 더한다: Agent picker가 열린 채 Esc를 누르면 Settings에 머문다, 메뉴가 없을 때 Esc는 Settings를 떠난다. green이면 그대로 받아들이고 보고하며, red일 때만 `App.tsx`를 고친다. 순수 함수는 만들지 않는다.
- **A2** `CanvasTools.tsx`의 툴바 `TooltipContent`에 `onEscapeKeyDown`을 달아, 그 Esc에서 controller가 기존 `escapeStep`(`canvasTool.ts`)이 정하는 다음 한 단계를 실행한다(`CanvasController`의 Esc 처리와 같은 단계, 툴바 버튼이므로 `editable: false`). 툴팁이 닫히는 것은 Radix가 그대로 한다. 선례: `AgentUsageButton.tsx` `IconTip`, `ConversationDeleteDialog.tsx`. `CanvasController.keydown`이 handled 이벤트를 건너뛰는 규칙은 바꾸지 않는다.
- **A3** `ConversationThread.tsx`의 focus effect는 지금 `sendQuestion`이 남긴 question 답(`sentFrom`)만 본다. permission 카드 답(클릭, Enter·Space)도 같은 effect를 거쳐 `focusAfter({kind: "answered"})`로 다음 요청의 option이나 composer로 focus를 옮긴다. `focusAfter` 자체는 바꾸지 않는다.
- **A4** question 카드와 permission 카드의 Stop 뒤에도 같은 effect가 `focusAfter({kind: "stopped"})`로 composer에 focus를 둔다.
- **A5** `ConversationStripView.tsx`가 Skip(`answerConversationQuestion`)과 permission 답(`answerConversationPermission`)의 `{error}` 답을 받아, strip 안 오류 줄(alert 아이콘 + 문장, `role="alert"`)을 보인다. Skip은 "Couldn’t skip the question. Try again.", permission 답은 thread와 같은 "Couldn’t send your answer. Choose again."이다. 버튼은 다시 누를 수 있다. 오류 줄은 다음 누름, 보이는 요청(`requestId`)이 바뀔 때, 턴이 끝날 때 사라진다. 상태 규칙은 `conversationStrip.ts`에 둔다.
- **A6** 다섯 컨트롤(Canvas conversations 행 Delete, 툴바 Export, title menu Delete, 툴바 Capture area의 `CAPTURE_REASON_ID`(`CanvasTools.tsx`), `SettingsMcpConnectors.tsx`의 `RowButton`)은 자기 설명(`aria-describedby`)을 그대로 둔다. Radix Tooltip trigger가 열릴 때 `concatAriaDescribedby`로 content id를 합치는 것을 막는다. 고칠 자리는 되도록 `components/ui/tooltip.tsx` 한 곳이다. 툴팁을 감싼 요소로 옮기는 방법은 쓰지 않는다.

### B. 대화 런타임 (main + renderer)
- **B4** (R의 첫 항목) `threadItems.ts`의 `permission.resolved` 처리가 `optionId === "expired"`이면 status를 `expired`로 둔다. 그러면 `ConversationThread.tsx`가 이미 그리는 "Expired without an answer · <summary>"가 나온다. main은 이미 만료 기록(`permission.resolved` `optionId: "expired"`)을 쓰므로 renderer만 고치고, 모든 provider에 같이 적용된다.
- **B3** Claude runner(`runners.ts`)의 `canUseTool`이 `options.signal`을 듣는다. abort되면 그 요청을 `pending`·`questions`에서 지우고, 이미 쓰는 만료 기록(permission은 `permission.resolved` `optionId: "expired"`, question은 `question.resolved` `outcome: "expired"`, Stop의 `expire()`와 같은 모양)을 쓴다. thread는 그 카드를 만료로 접는다(question은 `questionLines`의 "Expired without an answer · <headers>"). 이미 답한 요청에는 영향이 없다. 그 카드에 focus가 있었거나 Other 입력에 보내지 않은 draft가 있었으면, A3의 focus effect가 접힌 카드를 보고 `focusAfter({kind: "answered"})`대로 다음 요청이나 composer로 focus를 옮긴다.
- **B1** `transport.ts`의 공용 분류(`transportError`·`failed`)가 모델이 없다는 실패를 새 FailureCode로 분류한다. 근거는 관찰된 오류다: Doan이 받은 `turn.failed`의 `detail`이 "The 'gpt-6-astra' model is not supported…"(기록에서 잘린 채 남음)였고, 그 턴의 Codex rollout에 `codex_error_info: "model_not_found"`가 있었다(main checkout의 `.scratch/handoff-G.md`). app-server의 turn error가 `codexErrorInfo`를 싣는지는 확인하지 않았으므로, 작업자는 Codex 0.166.0 app-server의 오류 모양을 확인해 fixture로 고정한다.
  - 모델 ID는 오류 payload에서 읽는다. 실행의 모델 설정은 쓸 수 없다: `ipc.ts`는 이번 실행의 `model/list`에 있는 모델만 받으므로(`validateSendExtras`), 목록에 없는 모델은 Doan이 보낸 적이 없다. 관찰된 실패도 Codex 설정의 기본 모델이었다.
  - 모델 ID는 끝 기록(`turn.failed`)에 실려 thread를 다시 불러와도 남는다. `types.ts`의 `FailureCode`와 `turn.failed` 타입, `store.ts`의 `turn.failed` 검증(코드 목록과 새 필드)을 함께 고친다.
  - thread(`ConversationThread.tsx` `endView`)는 "<model ID> isn’t available for this account." 한 문장만 보이고, 파일 변경 경고와 버튼은 없다(턴이 시작되지 않았다). Home strip(`conversationStrip.ts` `FAILURES`, 지금은 `STOPPED`로 떨어진다)은 같은 원인 문장을 보이고 Edit on Home·Dismiss는 그대로 둔다. renderer의 `TurnEnd`와 strip의 실패 상태가 모델 ID를 받는다.
- **B2** 첫 턴의 빈틈은 두 자리다: `ipc.ts`의 start 분기는 send 분기와 달리 `home.models?.defaultEffort`를 구하지 않고, `service.start`는 `defaultEffort`를 받지 않는다. `startHandoff`도 `choice(m)`만 넘겨서 handoff의 첫 턴도 같다. start와 handoff도 send·queue처럼 고른 모델에 저장된 effort가 없으면 그 모델의 `defaultEffort`를 그 턴에만 보낸다(send의 `TurnChoice`, queue의 `queueOptions.defaultEffort`와 같은 조건). 사람의 Codex 설정 `model_reasoning_effort`는 뒤의 턴처럼 덮인다.
- **B5** Settings Effort 메뉴의 값을 Model 메뉴처럼 kind-tagged(예: unset과 level을 다른 접두어로)로 바꾼다. `newConversationSettings.ts`에 순수 함수로 둔다.

### C. 앱 기타
- **C1** `quickOpen.ts`가 Quick Open이 찾는 범위(Home은 모든 프로젝트, workspace는 그 범위)에서 아직 읽는(`kind: "loading"`) 프로젝트 수를 센다. `QuickOpenDialog.tsx`는 그 수가 1 이상인 동안 `role="listbox"` 밖, 목록 끝에 spinner와 "Still reading <n> projects…"(1개면 "Still reading 1 project…") 행을 polite status로 그린다. 검색어 유무와 상관없다. 이 행이 있는 동안 `emptyText`는 "Project is still being read. Try again shortly."와 "No canvases to show"를 내지 않는다. 검색어에 맞는 결과가 없으면 기존 "No … match" 문장과 이 행을 함께 보인다. `App.tsx` `replyChipRefusal`의 같은 문장은 그대로 둔다.
- **C2** `prepare.ts`의 Doan 연결 시작은 `canonicalDirectory(request.root)`와 `request.root`가 다르면 `session_unavailable`로 거절한다(터미널 세션 이어하기 경로도 root와 configDir에 같은 비교를 한다). 이 비교는 그대로 두고, 프로젝트를 등록할 때와 저장된 `folders.json` 목록을 읽을 때 root를 real path로 맞춘다(UI 등록 `app/src/main/addProjects.ts`·`shell.ts`는 이미 real path다). 읽은 목록에서 두 항목이 같은 real path가 되면 하나만 둔다.
  - `doan://` 링크와 `doan open --repo`: CLI는 `repo.Find`에서 root를 real path(`EvalSymlinks`와 disk spelling)로 바꿔 보내고, 링크(`work_rules.go` `canvasLink`)도 그 root로 만든다. 그래서 정규화 뒤에는 symlink 경로로 등록됐던 프로젝트에도 맞는다(지금은 `/tmp/<x>` 등록과 어긋난다). 사람이 symlink spelling으로 직접 쓴 링크는 등록된 root와 문자열이 같아야 한다는 규칙(`deepLinks.ts` `resolveOpenTarget`)대로 "unregistered-root"로 거절된다. 이 규칙은 바꾸지 않는다.
  - red 테스트는 symlink root의 Codex 시작과 Claude 시작, 그리고 symlink인 configDir(Claude `CLAUDE_CONFIG_DIR`, Codex `CODEX_HOME`)를 다룬다.
- **C3** `App.tsx` `openLink`는 `decideOpen`(`openDecision.ts`)이 `busy`(`OpenBlock`)를 돌려주면 말없이 돌아간다. 그 자리에서 toast "Couldn’t open the link. <reason>"을 띄운다. 이유는 `deepLinks.ts` `BLOCKED`에서 "in Doan"을 뺀 문장이다:
  - `add_projects`: "The Add Projects page is in the middle of a task. Finish or cancel it, then try again."
  - `settings`: "Settings is in the middle of a change. Finish or cancel it, then try again."
  - `project_settings`: "Project Settings is in the middle of a change. Finish or cancel it, then try again."
  - `first_run`: "Finish Doan's first run, then try again."
  - `dialog`: "A dialog is busy and did not close. Finish it, then try again."
  - 그리는 자리: Set Up(`ProjectSetupDialog.tsx`)은 `showModal()`, first run(`Onboarding.tsx`)은 `openModal`로 modal dialog를 연다. 지금 toast는 App 루트(`toast.element`)에 있어 modal 밖이고, modal이 열린 동안 inert이며 `toastHeld`로 timer도 멈춘다. 그래서 modal dialog가 열려 있으면 이 toast는 그 dialog 안에 그려서 보이고 읽히게 한다. dialog 안의 toast는 timer를 멈추지 않는다. modal이 없는 잠긴 페이지에서는 기존 자리에 그린다.
  - 이유 문장을 고르는 함수(`OpenBlock` → 문장)는 순수 함수로 둔다.

### D. CLI (Go)
- **D1** `active.go`의 `readLine`이 줄바꿈을 포함해 `maxResponseLine`(65,536 byte)을 넘는 줄을 거절한다. 지금은 `ReadBytes`가 줄바꿈을 65,537번째 byte에서 찾으면 길이 검사 없이 돌려준다. `doan work`(`work.go`)의 직접 검사와 같은 경계다. 테스트는 `TestWorkResponseLineCap`처럼 `doan active`와 `doan onboarding` 호출자 둘 다에서 65,536 byte 통과, 65,537 byte 거절을 본다.
- **D2** `cli/internal/cli/export.go`가 임시 파일을 만든 뒤 쓰기와 rename이 끝날 때까지 SIGINT·SIGTERM을 받으면, 자기 임시 파일을 지우고 끝낸다. SIGKILL로 남은 파일은 받아들인다. 시작할 때 같은 출력 이름의 오래된 임시 파일을 지우는 정리는 하지 않는다: 그 파일이 진행 중인 다른 export의 것일 수 있다(POSTMORTEM 2026-10-25 'Startup cache collection deleted a live thumbnail temporary file').

### E. 테스트·eval
- **E1** `service.test.ts`에 quit과 persistence 실패가 진행 중인 steer를 unmark하는 케이스를 더한다. 지금 코드가 이미 그렇게 하면 green이 정상이다. unmark를 잠시 지워 그 테스트가 red가 되는 것을 한 번 확인하고 되돌린 뒤 보고한다.
- **E2** 먼저 fake에서 두 번째 root의 첫 `doan ls`를 늦춰, 지금의 assertion이 매번 실패하게 만든다. 그 상태에서 테스트가 두 root의 첫 목록을 기다리거나 focus를 실은 호출을 찾게 고친다. 연속 통과 횟수는 증거가 아니다. BACKLOG의 중복 두 항목을 함께 지운다.
- **E3** 공용 `presetLookups`·`presetChecks`(`eval/scenarios/D1/presets.ts`, D1–D13이 쓴다)와 judge의 `buildJudgePrompt` `doanDesignSkill` 요약(`eval/lib/judge.ts`)이, 둘이 함께 쓰는 `commandWords`·`doanPositionals`(`eval/lib/transcript.ts`)를 거쳐 shell 변수·반복문으로 실제 실행한 `doan design-skill <id>`를 인식하게 고친다. 응답 본문으로 인식하는 방법은 쓰지 않는다. red 단위 케이스:
  - 양성: `for p in harden clarify; do doan design-skill $p …` → harden·clarify를 읽음.
  - 음성: `echo doan design-skill $p`는 읽음이 아니다.
  - 음성: `for p in harden polish`는 `preset_reads_allowed`에서 실패한다.
  - `judge.test.ts`의 음성(인용된 guide 문장은 읽음이 아니다, 테스트 helper `invocationSummary`)은 그대로 통과한다.

## 2. red 테스트 (`/tdd` 대상)

동작 수준에서 결함을 재현한다. "모듈이 없다"로만 red인 테스트는 인정하지 않는다.

- A1 `App.settings.test.tsx`: 열린 Agent picker에서 Esc → Settings에 머묾, 메뉴 없을 때 Esc → 떠남(green 허용).
- A2 툴팁이 열린 툴바에서 Esc 한 번 → 툴팁이 닫히고 `escapeStep`의 단계(예: capture 종료)가 일어남.
- A3·A4 `ConversationThread.interaction.test.tsx`·`ConversationThread.question.test.tsx`: permission 답(클릭, Enter·Space) 뒤, question 카드 Stop 뒤, permission 카드 Stop 뒤의 `document.activeElement`. 다른 요청이 남은 경우와 마지막 요청인 경우 둘 다.
- A5 strip의 Skip·permission 답이 `{error}`를 받으면 오류 줄이 보이고, 세 조건에서 사라짐.
- A6 다섯 컨트롤을 툴팁이 열린 채 렌더(jsdom)해 `aria-describedby`에 id가 하나인지.
- B1 실제 오류 모양 fixture → 새 FailureCode와 모델 ID, 다시 불러온 thread와 strip의 문장.
- B3 abort signal 주입 → 만료 기록, 접힌 카드, focus 위치.
- B4 `optionId: "expired"` → "Expired without an answer · <summary>".
- B5 provider가 `default`라는 수준을 보고해도 Default 행과 그 수준이 구분됨.
- C1 읽는 프로젝트가 있는 Home·workspace Quick Open에서 행과 수, 검색어 유무, 빈 문장.
- C2 symlink root의 Codex·Claude 시작, symlink configDir.
- C3 각 `OpenBlock`에서 링크 → toast 문장, modal dialog가 열린 동안 toast가 dialog 안에 있음.
- D1 두 호출자의 65,536·65,537 byte 경계. D2 신호를 받은 export가 자기 임시 파일만 지움.

## 3. 형식 변경

- JSON Schema 변경은 없다. 대화 이벤트는 device-local 파일이다(ARCHITECTURE §11 'Device-local files without shared schemas').
- B1만 형식을 바꾼다: 새 `FailureCode`와 `turn.failed`의 모델 ID를 `types.ts` 타입, `store.ts` 검증, 그 테스트로 고정한다.
- B3·B4는 기존 만료 기록(`permission.resolved` `optionId: "expired"`, `question.resolved` `outcome: "expired"`)을 쓰고 형식을 바꾸지 않는다.

## 4. 컨벤션·결정 영향

- ARCHITECTURE §1 컨벤션과 `doan check`: 없음.
- ARCHITECTURE §4 'Connection contract'(D1)는 이미 64 KiB 상한을 정한다. 코드를 문서에 맞춘다.
- ARCHITECTURE §7 'Models'(B2)의 문장("a turn whose model has no stored effort names that model's `defaultEffort` for that turn only")은 첫 턴을 빼지 않으므로 고치지 않는다. PRODUCT §5 'Effort labels'도 첫 턴을 따로 말하지 않아 고칠 것이 없다.
- ARCHITECTURE §7 'Identity and admission'(C2)의 엄격한 비교는 그대로다.
- PRODUCT §5의 "Expired without an answer · …"(B3·B4)와 DESIGN 'Folded lines' 행은 문구가 바뀌지 않는다.

## 5. 배치와 겹침 (`/orchestrate`용)

| batch | 항목 | 주로 고치는 파일 |
|---|---|---|
| F 포커스 | A1–A6 | `App.settings.test.tsx`(A1이 red일 때만 `App.tsx`), `CanvasTools.tsx`, `ConversationThread.tsx`, `ConversationStripView.tsx`·`conversationStrip.ts`(A5), `components/ui/tooltip.tsx`, `SettingsMcpConnectors.tsx` |
| R 런타임 | B1–B5 | `threadItems.ts`(B4 먼저), `app/src/main/conversation/runners.ts`(B3), `transport.ts`·`types.ts`·`store.ts`·`ConversationThread.tsx`·`ConversationStripView.tsx`·`conversationStrip.ts`(B1), `ipc.ts`·`service.ts`(B2), `newConversationSettings.ts`·`SettingsAgents.tsx`(B5) |
| M 앱 기타 | C1–C3 | `quickOpen.ts`·`QuickOpenDialog.tsx`, 등록·`folders.json` 읽기(C2, `prepare.ts`는 테스트만), `openDecision.ts`·`App.tsx`(`openLink`)·`Toast.tsx` |
| C CLI | D1–D2 | `cli/internal/cli/active.go`, `cli/internal/cli/export.go` |
| T 테스트·eval | E1–E3 | `service.test.ts`, `shell.test.ts`, `eval/scenarios/D1/presets.ts`, `eval/lib/judge.ts` |

겹침: F와 R은 `ConversationThread.tsx`(A3·A4의 focus effect, B1·B4의 문구)와 `ConversationStripView.tsx`·`conversationStrip.ts`(A5의 오류 줄, B1의 실패 문구)를 함께 고친다. B3의 focus 이동은 A3의 focus effect에 기댄다. F와 M은 A1이 red일 때만 `App.tsx`가 겹친다. C와 T는 다른 batch와 겹치지 않는다. 그래서 C·T는 처음부터 병렬로 돌리고, F·R·M은 겹치는 파일의 순서를 지휘자가 정한다(예: F 먼저, R·M은 F가 통합된 뒤). R은 B4·B3의 만료 처리부터 시작한다.

## 6. POSTMORTEM에서 가져온 함정

- 2026-11-06 "A menu's 'nothing chosen' value shared its string with a real model id": B5의 직접 원인이다. 값 공간을 kind로 나눈다.
- 2026-10-23 툴팁 두 건('Re-hovering a dismissed tooltip did not reopen it', 'A preceding canvas tooltip was cached'): A2·A6의 probe는 실제 포인터 이동으로 툴팁을 열고 닫으며, 이전 툴팁이 닫혔는지 확인한 뒤 읽는다.
- 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation': C3는 잠금 동안 링크를 계속 버린다(사용자 결정). 버린다는 사실만 toast로 알리고, 잠금 규칙은 바꾸지 않는다.
- 2026-10-25 'Startup cache collection deleted a live thumbnail temporary file': D2가 시작 때 정리를 하지 않고 다른 export의 임시 파일을 건드리지 않는 이유다.

## 7. PoC 의존

없다. B1의 app-server 오류 모양(`codexErrorInfo` 유무)은 작업자가 첫 단계에서 확인해 fixture로 고정한다.
