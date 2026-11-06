# defect-sweep — design

항목마다 원인과 고칠 자리를 적는다. 줄 번호는 적지 않는다(main이 계속 움직인다). 작업자는 BACKLOG 원문(spec에 요약)과 아래 자리를 읽고 시작한다.

## 1. 항목별 설계

### A. 포커스·키보드 (renderer)
- **A1** `SettingsAgents.tsx`의 Agent picker `DropdownMenu.Content`에 `onEscapeKeyDown`에서 이벤트 전파를 막거나, App의 window keydown이 "메뉴가 열려 있었는지"를 keydown 시작 시점에 판정하게 한다. 다른 Settings 메뉴(Model, Effort, Permission)도 같은 경로인지 확인하고 같은 규칙으로 맞춘다. 판정 함수를 순수 함수로 뺀다.
- **A2** `CanvasController.keydown`이 handled 이벤트를 건너뛰는 규칙에 예외를 둔다: handled의 출처가 툴팁 dismiss면 capture·pick 종료도 처리한다. 판정은 순수 함수(이벤트 출처와 모드 → 할 일).
- **A3** permission 카드 답(클릭)도 `composerRules.focusAfter`를 거쳐 다음 요청이나 composer로 focus를 옮긴다.
- **A4** question 카드 Stop 뒤 focus를 `focusAfter`의 `stopped` 규칙으로 composer에 둔다(permission 카드 Stop도 같은 결함이면 함께).
- **A5** problem workspace question strip이 Skip과 permission 답의 `{error}`를 받아 strip 안 오류 줄(alert 아이콘 + 문장, `role="alert"`)을 보인다. 버튼은 다시 누를 수 있다.
- **A6** 자기 `aria-describedby`를 가진 비활성 컨트롤에서 Radix Tooltip이 id를 합치지 않게 한다. 후보: 그 컨트롤은 TooltipTrigger가 아닌 감싼 요소에 툴팁을 달거나, 컨트롤의 설명을 툴팁 하나로 합친다. 셋(Canvas conversations 행 Delete, 툴바 Export, title menu Delete)을 같은 방식으로 맞춘다. 정적 렌더 테스트로 `aria-describedby`에 id가 하나만 있는지 고정한다.

### B. 대화 런타임 (main + renderer)
- **B1** Codex runner가 turn 실패의 오류 코드 `model_not_found`(실측 페이로드는 BACKLOG 원문과 Codex 0.166.0 app-server의 오류 모양으로 확인)를 별도 실패 이유로 분류하고, thread 문구를 "<model display name> isn’t available for this account."로 바꾼다. 이 이유에는 파일 변경 경고를 붙이지 않는다(턴이 시작되지 않았다). 모델 이름은 이번 실행에서 받은 목록의 `displayName`, 없으면 ID다. 분류는 순수 함수.
- **B2** Codex `start`(첫 턴)도 send처럼 모델의 `defaultReasoningEffort`를 보낸다(사람이 고른 수준이 없을 때). ARCHITECTURE §7 'Models'의 그 문장을 고친다.
- **B3** Claude `canUseTool`의 `options.signal`이 abort되면 그 질문·permission 요청을 닫고 thread에서 "Not answered · <request>"로 접는다. 이미 답한 요청에는 영향이 없다.
- **B4** Stop으로 만료된 Codex MCP 승인을 "Answered"가 아니라 "Not answered"로 기록·표시한다. 기록 형식에 새 상태가 필요하면 아래 '형식 변경'을 따른다.
- **B5** Settings Effort 메뉴의 값을 Model 메뉴처럼 kind-tagged(예: unset과 level을 다른 접두어로)로 바꾼다. `newConversationSettings.ts`에 순수 함수로 둔다.

### C. 앱 기타
- **C1** Quick Open의 읽는 중 상태를 "남은 프로젝트 수"로 계산하는 순수 함수와 목록 끝의 spinner 행. 다 읽으면 행이 사라진다.
- **C2** 먼저 원인을 확인한다(`prepare.ts`의 canonical 비교). 확인되면 비교 양쪽을 real path로 맞추거나 등록 때 real path로 저장한다(UI 등록은 이미 real path). 실패를 재현하는 테스트를 먼저 쓴다.
- **C3** `doan://` 처리에서 페이지 잠금·dialog 거부로 버리는 자리에 toast를 띄운다. 이유 문장은 `doan open`의 `busy` 답이 쓰는 이유와 맞춘다. 판정(무엇이 막는지 → 문장)은 순수 함수.

### D. CLI (Go)
- **D1** `active.go`의 `readLine`이 줄바꿈을 포함해 64 KiB를 넘는 줄을 거절한다(`doan work`의 검사와 같은 경계). 경계 테스트: 65,536 byte 통과, 65,537 byte 거절.
- **D2** `doan export`가 시작할 때 같은 출력 폴더의 오래된 `.<name>.doan-<hex>` 임시 파일을 지우거나, 신호를 받으면 임시 파일을 지운다. 후보 중 더 단순한 쪽은 지휘자가 고른다(신호 처리는 SIGKILL을 막지 못하므로, 다음 실행 때 같은 출력 이름의 임시 파일만 정리하는 쪽을 권장). 다른 출력의 임시 파일은 건드리지 않는다.

### E. 테스트·eval
- **E1** `service.test.ts`에 quit과 persistence 실패가 진행 중인 steer를 unmark하는 케이스를 더한다. 지금 코드가 이미 그렇게 하면 테스트만 더하고 green이 정상이다(red가 아님을 보고).
- **E2** 테스트가 두 root의 첫 목록을 기다리거나 focus를 실은 호출을 찾게 고친다. BACKLOG의 중복 두 항목을 함께 지운다.
- **E3** D7b 판정이 shell 변수·반복문으로 읽은 preset을 transcript의 실제 `doan design-skill <id>` 실행이나 응답 본문으로 인식하게 고친다. `node eval/run.ts --self-test --scenarios D7b`로 pass·fail fixture를 고정한다.

## 2. 순수 함수 (`/tdd` 대상)

- A1 메뉴가 열려 있었는지 판정, A2 handled 출처와 모드 → 할 일, A3·A4 `focusAfter` 규칙 확장, A5 strip 오류 상태.
- B1 오류 분류와 문구, B5 kind-tagged 값 변환.
- C1 남은 프로젝트 수와 행, C3 막는 이유 → 문장.
- D1 줄 길이 경계, D2 정리할 임시 파일 고르기.

## 3. 형식 변경

- B3·B4가 thread 기록(대화 이벤트)에 "답하지 않음" 상태를 새로 써야 하면, 그 이벤트 형식의 정본(ARCHITECTURE §11 'Shared formats'에 있는 경우 JSON Schema와 TS·Go 공유 fixture)을 먼저 고친다. 대화 이벤트가 §11 대상이 아니면 TS 타입과 그 테스트로 고정한다. 작업자는 시작할 때 어느 쪽인지 확인하고 batch 보고에 적는다.
- 그 밖에는 없다.

## 4. 컨벤션·결정 영향

- ARCHITECTURE §1 컨벤션과 `doan check`: 없음.
- ARCHITECTURE §4 'Connection contract'(D1)는 이미 64 KiB 상한을 정한다. 코드를 문서에 맞춘다.
- ARCHITECTURE §7 'Models'(B2)의 "첫 턴은 보내지 않는다" 서술을 고친다.

## 5. 배치와 겹침 (`/orchestrate`용)

| batch | 항목 | 주로 고치는 파일 |
|---|---|---|
| F 포커스 | A1–A6 | `SettingsAgents.tsx`, `App.tsx`(keydown), `CanvasController`, `ConversationThread.tsx`·`composerRules`, problem workspace strip, `components/ui/tooltip.tsx` 또는 세 컨트롤 |
| R 런타임 | B1–B5 | `app/src/main/conversation/runners.ts`(Codex·Claude), 실패 문구, `ConversationThread.tsx`(Not answered), `newConversationSettings.ts`, `SettingsAgents.tsx` |
| M 앱 기타 | C1–C3 | Quick Open, `prepare.ts`, `App.tsx`(`doan://`) |
| C CLI | D1–D2 | `cli/internal/cli/active.go`, `cli/internal/export` |
| T 테스트·eval | E1–E3 | `service.test.ts`, `shell.test.ts`, `eval/` |

겹침: F와 R은 `SettingsAgents.tsx`와 `ConversationThread.tsx`, F와 M은 `App.tsx`를 함께 고친다. C와 T는 다른 batch와 겹치지 않는다. 그래서 C·T는 처음부터 병렬로 돌리고, F·R·M은 겹치는 파일의 순서를 지휘자가 정한다(예: F 먼저, R·M은 F가 통합된 뒤).

## 6. POSTMORTEM에서 가져온 함정

- 2026-11-06 "A menu's 'nothing chosen' value shared its string with a real model id": B5의 직접 원인이다. 값 공간을 kind로 나눈다.
- 2026-10-23 툴팁 두 건('Re-hovering a dismissed tooltip did not reopen it', 'A preceding canvas tooltip was cached'): A2·A6의 probe는 실제 포인터 이동으로 툴팁을 열고 닫으며, 이전 툴팁이 닫혔는지 확인한 뒤 읽는다.
- 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation': C3는 잠금 동안 링크를 계속 버린다(사용자 결정). 버린다는 사실만 toast로 알리고, 잠금 규칙은 바꾸지 않는다.

## 7. PoC 의존

없다. C2의 원인과 B1의 오류 페이로드 모양은 작업자가 첫 단계에서 확인한다(재현 테스트가 그 확인이다).
