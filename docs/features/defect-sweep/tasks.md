# defect-sweep — tasks

batch는 design §5 표를 따른다. 각 항목은 `/tdd regression`(동작 수준 재현 테스트 red, design §2) → 고침 → 그 항목 테스트 green 순서다. A1·E1은 green을 받아들이고 보고한다. 항목마다 커밋을 나눈다(`fix: …`, 테스트·eval만이면 `test: …`).

## C. CLI (병렬 시작 가능)
- C-1 D1 `readLine` 길이 경계. — 검증: `go test ./...` (`TestWorkResponseLineCap`처럼 `doan active`와 `doan onboarding` 호출자 각각 65,536 byte(줄바꿈 포함) 통과·65,537 byte 거절, 바꾸기 전 65,537이 통과해 red), `go vet ./...`.
- C-2 D2 `export.go` 신호 처리. — 검증: `go test ./...` (SIGINT·SIGTERM을 받은 export가 자기 임시 파일을 지우고 끝나는 케이스, 같은 폴더의 다른 export 임시 파일은 남는 케이스).

## T. 테스트·eval (병렬 시작 가능)
- T-1 E1 steer unmark 고정. — 검증: `npm --prefix app test` (새 케이스 green, unmark를 잠시 지웠을 때 red였는지 보고).
- T-2 E2 shell.test 대기 고침. — 검증: fake에서 두 번째 root의 첫 `doan ls`를 늦춘 상태로 옛 assertion이 매번 실패하는 것을 확인하고, 고친 테스트가 같은 지연에서 통과. `npm --prefix app test`.
- T-3 E3 공용 preset 판정. — 검증: `node --test 'eval/**/*.test.ts'` (양성 `for p in harden clarify; do doan design-skill $p …`, 음성 `echo doan design-skill $p`와 `for p in harden polish`의 `preset_reads_allowed` 실패가 바꾸기 전 red, `judge.test.ts`의 인용 guide 음성은 그대로 통과), 필터 없는 `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0.

## F. 포커스
- F-1 A1 Settings 메뉴 Esc. — 검증: `npm --prefix app test` (`App.settings.test.tsx`: 열린 Agent picker에서 Esc → Settings에 머묾, 메뉴 없을 때 Esc → 떠남. green이면 보고하고 코드는 고치지 않는다).
- F-2 A2 툴바 툴팁 Esc 한 번. — 검증: `npm --prefix app test` (툴팁이 열린 채 Esc 한 번에 툴팁이 닫히고 `escapeStep`의 단계가 일어남).
- F-3 A3·A4 카드 답·Stop 뒤 focus. — 검증: `npm --prefix app test` (`ConversationThread.interaction.test.tsx`·`ConversationThread.question.test.tsx`의 `document.activeElement`: permission 답(클릭·Enter·Space), question 카드 Stop, permission 카드 Stop, 다른 요청이 남은 경우와 마지막인 경우).
- F-4 A5 strip 오류 줄. — 검증: `npm --prefix app test` (Skip·permission 답 `{error}` → 문장과 alert, 다음 누름·요청 변경·턴 끝에서 사라짐).
- F-5 A6 툴팁 `aria-describedby` 한 개. — 검증: `npm --prefix app test` (다섯 컨트롤을 툴팁이 열린 채 jsdom으로 렌더).
- F-6 `/runtime-test`: A1(Esc로 Settings에 머묾, 메뉴 없을 때 떠남), A2(Esc 한 번에 툴팁과 capture 종료), A3·A4(focus 위치), A5(실패 주입 시 오류 줄), A6(설명 id 하나). — 검증: probe 기록과 스크린샷.

## R. 런타임
- R-1 B4 만료 permission 접기. — 검증: `npm --prefix app test` (`optionId: "expired"` → "Expired without an answer · <summary>").
- R-2 B3 Claude 취소 요청 만료. — 검증: `npm --prefix app test` (abort signal 주입 → 만료 기록, 접힌 카드, focus 위치).
- R-3 B1 모델 없음 분류와 문구. — 검증: `npm --prefix app test` (실제 오류 모양 fixture, `store.ts` 검증, 다시 불러온 thread와 strip의 문장).
- R-4 B2 첫 턴 effort. — 검증: `npm --prefix app test` (start와 handoff 첫 턴 요청에 그 모델의 `defaultEffort`).
- R-5 B5 Effort 값 kind-tag. — 검증: `npm --prefix app test`.
- R-6 `/runtime-test`: B4(사용자 승인을 받으면 공용 프로필 Codex로, 아니면 이벤트 주입)와 Settings Effort 메뉴. 실제 `model_not_found`와 Claude CLI 취소는 재현하지 못하면 미검증으로 보고한다. — 검증: probe 기록.

## M. 앱 기타
- M-1 C1 Quick Open 읽는 중 행. — 검증: `npm --prefix app test` (Home·workspace, 검색어 유무, 1개·여러 개 문장, listbox 밖 status, 빈 문장).
- M-2 C2 symlink 경로 등록. — 검증: `npm --prefix app test` (symlink root의 Codex·Claude 시작과 symlink configDir 재현 테스트가 바꾸기 전 red).
- M-3 C3 잠긴 페이지의 `doan://` toast. — 검증: `npm --prefix app test` (각 `OpenBlock` → 문장, modal dialog가 열린 동안 dialog 안의 toast).
- M-4 `/runtime-test`: C1·C3(Set Up 실행 중 링크), C2는 symlink 임시 repo로 Codex 시작이 거절되지 않는지(로그인 필요하면 공용 프로필, 사용자 승인). — 검증: probe 기록.

## Z. 통합과 승격
- Z-1 통합 HEAD에서 `/verify` (`node .agents/skills/verify/scripts/verify.mjs --eval`, T-3이 eval을 바꾸므로). — 검증: PASS.
- Z-2 승격: 고친 19건(E2의 중복 포함 20줄)을 BACKLOG에서 지운다. 고친다:
  - PRODUCT: A1·A2·A5·C1·C3의 동작과 문구, B1의 thread·strip 문구. B3·B4는 문구가 바뀌지 않으므로 고치지 않는다.
  - ARCHITECTURE: §12 `doan export`의 "a killed process can leave it" 문장을 SIGINT·SIGTERM은 지우고 SIGKILL은 남길 수 있다로(D2). 'Reply line' 항목(readLine BACKLOG 항목을 가리킨다)을 D1 뒤의 현재 규칙으로. §4 D1 상한 구현. §7 'Models'는 고치지 않는다(design §4).
  - DESIGN: 새 행·오류 줄·toast의 측정값.
  - docs/USABILITY-EVAL.md: D7b checker false negative 기록 뒤에, 그 checker 수정이 적용됐다는 메모를 더한다(기존 기록은 그대로 둔다).
  - `docs/features/defect-sweep/`을 지운다.
  - 검증: `test ! -e docs/features/defect-sweep`, `grep -rn 'features/defect-sweep' docs AGENTS.md README.md`가 결과 없음, 20줄이 BACKLOG에서 사라졌는지 grep(각 항목의 고유 문구), 고친 문장이 코드와 맞는지 diff로 확인.
