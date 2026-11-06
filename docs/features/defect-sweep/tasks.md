# defect-sweep — tasks

batch는 design §5 표를 따른다. 각 항목은 `/tdd regression`(재현 테스트 red) → 고침 → 그 항목 테스트 green 순서다. 항목마다 커밋을 나눈다(`fix: …`, 테스트·eval만이면 `test: …`).

## C. CLI (병렬 시작 가능)
- C-1 D1 `readLine` 길이 경계. — 검증: `go test ./...` (65,536 통과·65,537 거절 케이스), `go vet ./...`.
- C-2 D2 export 임시 파일 정리. — 검증: `go test ./...` (같은 출력 이름의 오래된 임시 파일만 지우는 케이스).

## T. 테스트·eval (병렬 시작 가능)
- T-1 E1 steer unmark 고정. — 검증: `npm --prefix app test` (새 케이스 결과와 red 여부 보고).
- T-2 E2 shell.test 대기 고침. — 검증: `npm --prefix app test`를 연속 5번 돌려 그 테스트가 매번 통과.
- T-3 E3 D7b 판정. — 검증: `node eval/run.ts --self-test --scenarios D7b`가 `self-test PASS`, `node --test 'eval/**/*.test.ts'` 통과.

## F. 포커스
- F-1 A1 Settings 메뉴 Esc. — 검증: `npm --prefix app test` (메뉴 열림 판정 순수 함수, SettingsAgents 테스트).
- F-2 A2 툴바 툴팁 Esc 한 번. — 검증: `npm --prefix app test`.
- F-3 A3·A4 카드 답·Stop 뒤 focus. — 검증: `npm --prefix app test` (`focusAfter` 케이스).
- F-4 A5 strip 오류 줄. — 검증: `npm --prefix app test`.
- F-5 A6 툴팁 `aria-describedby` 한 개. — 검증: `npm --prefix app test` (세 컨트롤의 정적 렌더).
- F-6 `/runtime-test`: A1(Esc로 Settings에 머묾), A2(Esc 한 번에 capture 종료), A3·A4(focus 위치), A6(설명 id 하나). — 검증: probe 기록과 스크린샷.

## R. 런타임
- R-1 B1 `model_not_found` 분류와 문구. — 검증: `npm --prefix app test` (실제 오류 페이로드 모양의 fixture).
- R-2 B2 첫 턴 effort. — 검증: `npm --prefix app test` (start 요청에 `defaultReasoningEffort`).
- R-3 B3 Claude 취소 요청 Not answered. — 검증: `npm --prefix app test` (abort signal 주입).
- R-4 B4 MCP 만료 Not answered. — 검증: `npm --prefix app test` (형식을 바꿨으면 그 fixture 테스트도).
- R-5 B5 Effort 값 kind-tag. — 검증: `npm --prefix app test`.
- R-6 `/runtime-test`: B4(가능하면 공용 프로필 Codex로, 아니면 이벤트 주입)와 Settings Effort 메뉴. 실제 `model_not_found`와 Claude CLI 취소는 재현하지 못하면 미검증으로 보고한다. — 검증: probe 기록.

## M. 앱 기타
- M-1 C1 Quick Open 읽는 중 행. — 검증: `npm --prefix app test`.
- M-2 C2 symlink 경로 시작. — 검증: `npm --prefix app test` (symlink 경로 재현 테스트가 바꾸기 전 red).
- M-3 C3 잠긴 페이지의 `doan://` toast. — 검증: `npm --prefix app test` (막는 이유 → 문장).
- M-4 `/runtime-test`: C1·C3, C2는 symlink 임시 repo로 Codex 시작이 거절되지 않는지(로그인 필요하면 공용 프로필, 사용자 승인). — 검증: probe 기록.

## Z. 통합과 승격
- Z-1 통합 HEAD에서 `/verify` (`node .agents/skills/verify/scripts/verify.mjs --eval`, T-3이 eval을 바꾸므로). — 검증: PASS.
- Z-2 승격: 고친 19건(E2의 중복 포함 20줄)을 BACKLOG에서 지운다. PRODUCT(A1·A2·A5·C1·C3의 동작과 문구, B1·B3·B4의 thread 문구), ARCHITECTURE(§4 D1 상한 구현, §7 'Models' B2, B3·B4의 기록 형식이 바뀌었으면 그 절), DESIGN(새 행·오류 줄·toast가 있으면 측정값)을 현재 규칙으로 고친다. `docs/features/defect-sweep/`을 지운다. — 검증: `test ! -e docs/features/defect-sweep`, `grep -rn 'features/defect-sweep' docs AGENTS.md README.md`가 결과 없음, 고친 문장이 코드와 맞는지 diff로 확인.
