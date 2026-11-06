# defect-sweep — spec

docs/BACKLOG.md 'Known defects' 가운데 `/ship` 하나 크기로 고칠 수 있는 19건을 한 feature로 묶어 `/orchestrate` 배치로 고친다. 7건은 사용자 결정이 BACKLOG 각 항목의 "Decided:"에 있다(`a75964d0`). thread 답 caret 결함은 별도 `/ship`(worktree `reply-caret-orch`)이 맡아서 여기서 뺀다.

## 사용자

- **사람**: 앱의 Settings, 캔버스 툴바, 대화 thread, Quick Open, `doan://` 링크를 쓰는 사람. 키보드 focus가 사라지지 않고, 실패와 취소가 사실대로 보인다.
- **에이전트**: `doan active`·`doan onboarding`이 응답 상한을 지키고, `doan export`가 임시 파일을 남기지 않는다.
- **개발**: 흔들리는 테스트 하나를 고치고, 빠진 회귀 고정을 더하고, `/agent-eval` 판정 하나를 고친다.

## 문제 (BACKLOG 원문 요약, 항목 번호는 이 문서 안에서만 쓴다)

### A. 포커스·키보드
- **A1** Settings > Agents의 Agent picker에서 Esc를 누르면 메뉴만 닫히지 않고 Settings를 떠나 Home으로 간다. picker의 `DropdownMenu.Content`(`SettingsAgents.tsx`)가 Esc를 막지 않고, App의 window keydown이 Radix가 메뉴를 지운 뒤에 메뉴가 있는지 본다.
- **A2** 캔버스 툴바 툴팁이 열린 채 Esc를 누르면 툴팁만 닫히고, 두 번째 Esc가 capture 모드나 pick을 끝낸다. Radix가 첫 Esc를 handled로 표시하고 `CanvasController.keydown`이 handled 이벤트를 건너뛴다. **결정**: 한 번의 Esc가 툴팁을 닫고 capture 모드나 pick도 끝낸다.
- **A3** thread의 permission 카드를 클릭으로 답하면 focus가 page body로 떨어진다. permission 답은 question 답이 쓰는 `composerRules.focusAfter`를 쓰지 않는다.
- **A4** question 카드의 Stop을 누르면 focus가 page body로 떨어진다. `composerRules.focusAfter`에는 이미 composer로 가는 `stopped` 규칙이 있다.
- **A5** problem workspace의 question strip에서 Skip이 실패해도 신호가 없다(main의 `{error}`를 무시한다). **결정**: strip이 alert 아이콘과 "Couldn’t skip the question. Try again."을 보이고 Skip은 다시 누를 수 있다. 같은 strip의 permission 답 실패도 같은 규칙을 따른다.
- **A6** 자기 `aria-describedby`가 있는 비활성 컨트롤(Canvas conversations 행 Delete, 툴바 Export, title menu의 Delete)의 툴팁이 열리면 Radix가 content id를 그 속성에 합쳐 이유가 두 번 읽힌다.

### B. 대화 런타임
- **B1** 계정에 없는 기본 모델로 Codex 턴이 실패하면(`model_not_found`) "Codex stopped unexpectedly"와 파일을 바꿨을 수 있다는 경고가 보인다. **결정**: 원인만 모델 이름으로 말한다("GPT-6-Astra isn’t available for this account."). 파일 변경 경고와 버튼은 없다.
- **B2** Codex의 첫 턴(`start`)은 모델의 `defaultReasoningEffort`를 보내지 않는다. 그래서 Codex 설정의 `model_reasoning_effort`가 있으면 첫 턴만 Effort trigger와 다른 수준으로 돈다.
- **B3** Claude `canUseTool`의 abort signal(`options.signal`)을 보지 않아서, CLI가 취소한 질문·permission 요청이 턴이 끝날 때까지 답할 수 있는 채로 남는다. **결정**: 취소된 요청은 "Not answered · <request>"로 접힌다.
- **B4** Stop으로 만료된 Codex MCP 도구 승인(Doan이 답하고 Codex는 Decline으로 처리)이 thread에 "Answered · Run <tool> on <connector>"로 남는다. **결정**: "Not answered · Run <tool> on <connector>".
- **B5** Settings > New conversations의 Effort 메뉴가 Default 행을 맨 문자열 `default`로 표시한다. 어떤 provider가 `default`라는 수준을 보고하면 충돌한다(POSTMORTEM 2026-11-06). Model 메뉴는 이미 kind-tagged 값을 쓴다.

### C. 앱 기타
- **C1** Home의 Quick Open은 프로젝트를 읽는 동안 결과가 실시간으로 채워지는데, 문구 "Try again shortly."가 다시 열라는 뜻으로 읽힌다. **결정**: 읽는 동안 목록 끝에 spinner와 "Still reading <n> projects…"를 보이고, 다 읽으면 사라진다.
- **C2** symlink 경로로 등록한 프로젝트(`/tmp/<x>`)는 Doan 연결 시작이 모두 실패한다(`session_unavailable`). `prepare.ts`의 `canonicalDirectory(request.root) !== request.root` 검사로 추정하며, 확인되지 않았다. Claude는 시도하지 않았다.
- **C3** 페이지가 잠긴 동안(Add Projects selecting·cloning, 잠긴 Settings·Project Settings) 또는 dialog가 cancel을 거부하는 동안(실행 중인 Set Up, first run) 온 `doan://` 링크가 toast 없이 버려진다. **결정**: toast로 그 페이지나 dialog가 바쁜 동안 링크를 열 수 없고 끝나면 다시 시도하라고 알린다(`doan open`의 `busy` 답과 같은 규칙).

### D. CLI
- **D1** `active.go`의 `readLine`이 65,537번째 바이트로 도착한 줄바꿈의 줄을 길이 검사 없이 돌려줘서, `doan active`와 `doan onboarding …`이 64 KiB 응답 상한(ARCHITECTURE §4 'Connection contract')을 1 byte 넘겨 받는다. `doan work`는 길이를 직접 검사한다.
- **D2** 강제 종료된 `doan export`가 출력 폴더에 임시 파일 `.<name>.doan-<hex>`를 남길 수 있다.

### E. 테스트·eval
- **E1** `service.test.ts`가 quit과 persistence 실패가 진행 중인 steer를 해제한다는 것을 고정하지 않는다(terminal 이벤트와 archive만 고정).
- **E2** `app/src/main/shell.test.ts` "replace reports the move as a re-root focus, and only a real move"가 부하에서 가끔 실패한다(11번 중 2번). `shell.store([a, b])`가 각 폴더의 첫 `doan ls`를 기다리지 않아 `replace` 뒤에 focus 없는 목록이 하나 더 온다. BACKLOG에 같은 테스트가 두 항목으로 있다.
- **E3** `/agent-eval` D7b의 `read_harden_or_clarify_or_onboard` 판정이 shell 변수로 읽은 preset(`for p in harden clarify; do doan design-skill $p --json …`)을 놓친다.

## 완료 조건

1. 위 19건이 각 항목의 결정과 설명대로 고쳐지고, 고친 항목마다 그 결함을 재현하는 테스트가 바꾸기 전 red였다(E2·E3는 그 테스트·판정 자체를 고친다).
2. 앱 동작이 바뀐 항목(A1–A6, B1·B3·B4, C1–C3)은 짧은 실제 앱 probe나 그 항목을 판정하는 테스트로 확인한다. probe로 볼 수 없는 상태(실제 Codex `model_not_found`, Claude CLI의 취소)는 이벤트를 주입한 테스트로 고정하고, 미검증으로 보고한다.
3. 새 문구 B1·A5·C1·C3는 결정의 문장을 쓰고, 정해지지 않은 부분(C3 toast의 페이지·dialog별 이유 말)은 `clarify` preset으로 정한다.
4. `/verify` 통과. 고친 항목은 BACKLOG에서 지우고, 바뀐 동작은 PRODUCT·ARCHITECTURE·DESIGN에 현재 규칙으로 쓴다.

## 하지 않는 것

- 19건 밖의 BACKLOG 결함, thread 답 caret(별도 `/ship`).
- C2에서 symlink 경로 자체를 지원하는 새 규칙: 원인을 확인한 뒤, 등록이나 비교에서 real path로 맞추는 것까지만 한다. 원인이 추정과 다르면 지휘자가 범위를 판단한다.
- 툴팁 동작 변경(지연·클릭 통과)은 PR #114로 끝났다.
