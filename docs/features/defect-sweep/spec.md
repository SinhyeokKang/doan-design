# defect-sweep — spec

docs/BACKLOG.md 'Known defects' 가운데 `/ship` 하나 크기로 고칠 수 있는 19건을 한 feature로 묶어 `/orchestrate` 배치로 고친다. 7건은 사용자 결정이 BACKLOG 각 항목의 "Decided:"에 있다(`a75964d0`). `/feature-review` 뒤 사용자가 B1·B2·B3·B4·C1·C2·D2·A2의 방향을 정했다(2026-11-07). thread 답 caret 결함은 별도 `/ship`(worktree `reply-caret-orch`)이 맡아서 여기서 뺀다.

## 사용자

- **사람**: 앱의 Settings, 캔버스 툴바, 대화 thread, Quick Open, `doan://` 링크를 쓰는 사람. 키보드 focus가 사라지지 않고, 실패와 취소가 사실대로 보인다.
- **에이전트**: `doan active`·`doan onboarding`이 응답 상한을 지키고, `doan export`가 SIGINT·SIGTERM으로 끝나도 임시 파일을 남기지 않는다. SIGKILL로 죽은 export는 여전히 임시 파일을 남길 수 있다.
- **개발**: 흔들리는 테스트 하나를 고치고, 빠진 회귀 고정을 더하고, `/agent-eval` 판정 하나를 고친다.

## 문제 (BACKLOG 원문 요약, 항목 번호는 이 문서 안에서만 쓴다)

### A. 포커스·키보드
- **A1** Settings > Agents의 Agent picker에서 Esc를 누르면 메뉴만 닫히지 않고 Settings를 떠나 Home으로 간다(BACKLOG 원문: App의 window keydown이 Radix가 메뉴를 지운 뒤에 메뉴가 있는지 본다). `2dec1854`가 App의 page Esc 처리에서 `defaultPrevented` 이벤트를 건너뛰게 했고 Radix DismissableLayer는 처리한 Esc를 `preventDefault`하므로, 이 결함은 이미 고쳐졌을 가능성이 크다. E1처럼 동작 테스트를 쓰고 실제 앱에서 확인한 뒤 BACKLOG 줄을 지운다.
- **A2** 캔버스 툴바 툴팁이 열린 채 Esc를 누르면 툴팁만 닫히고, 두 번째 Esc가 capture 모드나 pick을 끝낸다. Radix가 첫 Esc를 handled로 표시하고 `CanvasController.keydown`이 handled 이벤트를 건너뛴다. **결정**: 툴팁이 열린 채 누른 한 번의 Esc가 툴팁을 닫고, 툴팁이 없을 때 Esc가 했을 다음 한 단계(`escapeStep`: pick 취소, capture 취소, Select 도구로 돌아가기, 선택 해제 가운데 하나)도 한다.
- **A3** thread의 permission 카드를 클릭(Enter·Space 포함)으로 답하면 focus가 page body로 떨어진다. `composerRules.focusAfter`에는 이미 `answered` 규칙이 있고, `ConversationThread.tsx`의 focus effect가 question 답만 보고 permission 답에는 그 규칙을 연결하지 않는다.
- **A4** question 카드와 permission 카드의 Stop을 누르면 focus가 page body로 떨어진다. `focusAfter`에는 이미 composer로 가는 `stopped` 규칙이 있고, 빠진 것은 같은 focus effect의 연결이다.
- **A5** problem workspace의 question strip에서 Skip이 실패해도 신호가 없다(main의 `{error}`를 무시한다). 같은 strip의 permission 답 실패도 같다. **결정**: Skip이 실패하면 strip이 alert 아이콘과 "Couldn’t skip the question. Try again."을 보이고, permission 답이 실패하면 thread와 같은 "Couldn’t send your answer. Choose again."을 보인다. 두 버튼은 다시 누를 수 있다. 오류 줄은 다음 누름, 보이는 요청이 바뀔 때, 턴이 끝날 때 사라진다.
- **A6** 자기 `aria-describedby`가 있는 비활성 컨트롤 다섯 개(Canvas conversations 행 Delete, 툴바 Export, title menu의 Delete, 툴바 Capture area, Settings MCP 행 버튼)의 툴팁이 열리면 Radix(`concatAriaDescribedby`)가 content id를 그 속성에 합쳐 이유가 두 번 읽힌다. **결정**: 각 컨트롤은 자기 설명을 그대로 두고, Radix가 content id를 합치지 않게 한다.

### B. 대화 런타임
- **B1** 계정에 없는 기본 모델로 Codex 턴이 실패하면(`model_not_found`) "Codex stopped unexpectedly"와 파일을 바꿨을 수 있다는 경고가 보인다. **결정**: 그 모델은 `model/list`에 없으므로 ID를 받은 그대로 써서 원인만 말한다: "gpt-6-astra isn’t available for this account." thread에는 이 문장만 있고 파일 변경 경고와 버튼은 없다. Home strip도 같은 원인 문장을 보이고 Edit on Home은 그대로 둔다. thread를 다시 불러와도 같은 문장이 보인다.
- **B2** Codex의 첫 턴(`start`, handoff가 시작한 첫 턴 포함)은 모델의 `defaultReasoningEffort`를 보내지 않는다. 그래서 Codex 설정의 `model_reasoning_effort`가 있으면 첫 턴만 Effort trigger와 다른 수준으로 돈다. **결정**: 첫 턴도 뒤의 턴처럼 그 수준을 보내 사람의 Codex 설정을 덮는다.
- **B3** Claude `canUseTool`의 abort signal(`options.signal`)을 보지 않아서, CLI가 취소한 질문·permission 요청이 턴이 끝날 때까지 답할 수 있는 채로 남는다. **결정**: signal이 abort되면 기존 만료 기록을 쓰고 카드를 만료로 접는다("Expired without an answer · <request>", PRODUCT §5의 기존 문구). 그 카드에 focus가 있었거나 Other 입력에 보내지 않은 draft가 있었으면 focus는 A3의 `focusAfter` 규칙대로 옮긴다.
- **B4** Stop으로 만료된 permission 요청이 thread에 "Answered · <request>"로 남는다(BACKLOG에서는 Codex MCP 도구 승인 "Answered · Run <tool> on <connector>"로 보고됨). 원인은 renderer다: `threadItems.ts`가 `optionId: "expired"`인 `permission.resolved`도 `answered`로 두고 `ConversationThread.tsx`가 "Answered · …"를 그린다. 그래서 모든 provider의 Stop 만료 permission이 같다. **결정**: 기존 만료 문구 "Expired without an answer · <request>"로 접는다.
- **B5** Settings > New conversations의 Effort 메뉴가 Default 행을 맨 문자열 `default`로 표시한다. 어떤 provider가 `default`라는 수준을 보고하면 충돌한다(POSTMORTEM 2026-11-06). Model 메뉴는 이미 kind-tagged 값을 쓴다.

### C. 앱 기타
- **C1** Quick Open은 프로젝트를 읽는 동안 결과가 실시간으로 채워지는데, 문구 "Project is still being read. Try again shortly."가 다시 열라는 뜻으로 읽힌다. **결정**: Quick Open이 찾는 모든 자리(Home과 workspace)에서, 검색어가 있든 없든, 찾는 프로젝트 가운데 아직 읽는 것이 있는 동안 목록 끝에 spinner와 "Still reading <n> projects…"(1개면 "Still reading 1 project…") 행을 보인다. 다 읽으면 사라진다. 이 행은 option이 아니라 `role="listbox"` 밖의 polite status 행이다. 이 행 옆에 "No canvases to show"는 보이지 않는다. 검색어에 맞는 결과가 없으면 "No canvases match"와 이 행을 함께 보인다. reply chip의 "Try again shortly." 문구(`App.tsx` `replyChipRefusal`)는 바꾸지 않는다.
- **C2** symlink 경로로 등록한 프로젝트(`/tmp/<x>`)는 Doan 연결 시작이 모두 실패한다(`session_unavailable`). 원인은 `prepare.ts`가 `canonicalDirectory(request.root) !== request.root`이면 거절하는 것이다(코드에서 확인, 실행 재현은 M-2의 red 테스트). Claude는 시도하지 않았다. **결정**: 등록할 때(그리고 저장된 목록을 읽을 때) real path로 맞춘다. `prepare.ts`의 엄격한 fail-closed 비교(ARCHITECTURE §7 'Identity and admission')는 그대로 둔다.
- **C3** 페이지가 잠긴 동안(Add Projects selecting·cloning, 잠긴 Settings·Project Settings) 또는 dialog가 cancel을 거부하는 동안(실행 중인 Set Up, first run) 온 `doan://` 링크가 toast 없이 버려진다. **결정**: toast "Couldn’t open the link." 뒤에 막는 이유를 붙인다. 이유는 `doan open`의 `busy` 답이 쓰는 `deepLinks.ts` `BLOCKED` 문장에서 "in Doan"을 뺀 것이다. modal dialog가 열려 있어도 toast가 보이고 읽힌다.

### D. CLI
- **D1** `active.go`의 `readLine`이 65,537번째 바이트로 도착한 줄바꿈의 줄을 길이 검사 없이 돌려줘서, `doan active`와 `doan onboarding …`이 64 KiB 응답 상한(ARCHITECTURE §4 'Connection contract')을 1 byte 넘겨 받는다. 상한 65,536 byte는 줄바꿈을 포함한다. `doan work`는 길이를 직접 검사한다.
- **D2** 강제 종료된 `doan export`가 출력 폴더에 임시 파일 `.<name>.doan-<hex>`를 남길 수 있다. **결정**: SIGINT·SIGTERM만 처리한다(임시 파일을 지우고 끝낸다). SIGKILL로 남은 파일은 받아들인다. 다른 export의 임시 파일은 지우지 않는다.

### E. 테스트·eval
- **E1** `service.test.ts`가 quit과 persistence 실패가 진행 중인 steer를 해제한다는 것을 고정하지 않는다(terminal 이벤트와 archive만 고정).
- **E2** `app/src/main/shell.test.ts` "replace reports the move as a re-root focus, and only a real move"가 부하에서 가끔 실패한다(11번 중 2번). `shell.store([a, b])`가 각 폴더의 첫 `doan ls`를 기다리지 않아 `replace` 뒤에 focus 없는 목록이 하나 더 온다. BACKLOG에 같은 테스트가 두 항목으로 있다.
- **E3** `/agent-eval` D7b의 `read_harden_or_clarify_or_onboard` 판정이 shell 변수로 읽은 preset(`for p in harden clarify; do doan design-skill $p --json …`)을 놓친다. 이 판정은 D1–D13이 함께 쓰는 `presetLookups`·`presetChecks`(`eval/scenarios/D1/presets.ts`)와 judge의 `invocationSummary`(`eval/lib/judge.ts`)에 있다.

## 완료 조건

1. 위 19건이 각 항목의 결정과 설명대로 고쳐지고, 고친 항목마다 그 결함을 재현하는 동작 테스트가 바꾸기 전 red였다. 예외: A1과 E1은 이미 고쳐졌을 수 있어 green을 받아들이고 보고한다(E1은 unmark를 잠시 지워 red를 한 번 확인한다). E2·E3는 그 테스트·판정 자체를 고친다.
2. 앱 동작이 바뀐 항목(A1–A6, B1·B3·B4, C1–C3)은 짧은 실제 앱 probe나 그 항목을 판정하는 테스트로 확인한다. probe로 볼 수 없는 상태(실제 Codex `model_not_found`, Claude CLI의 취소)는 이벤트를 주입한 테스트로 고정하고, 미검증으로 보고한다.
3. 새 문구 B1·A5·C1·C3는 결정의 문장을 쓴다. C3의 이유 문장은 `deepLinks.ts` `BLOCKED`에서 가져온다.
4. `/verify` 통과. 고친 항목은 BACKLOG에서 지우고, 바뀐 동작은 PRODUCT·ARCHITECTURE·DESIGN에 현재 규칙으로 쓴다.

## 하지 않는 것

- 19건 밖의 BACKLOG 결함, thread 답 caret(별도 `/ship`).
- reply chip이 `decideOpen`의 `busy` 결과를 말없이 버리는 것(`App.tsx` `replyChip`): C3와 같은 모양이지만 이번 범위가 아니다.
- C2에서 symlink 경로 자체를 지원하는 새 규칙: 등록과 저장된 목록 읽기에서 real path로 맞추는 것까지만 한다. `prepare.ts`의 비교는 느슨하게 하지 않는다.
- 툴팁 동작 변경(지연·클릭 통과)은 PR #114로 끝났다.
