# 검사 범위 — tasks

순서: 순수 함수(범위 판정) → CLI 인자 → 안내와 프리셋 → eval → 측정 → 승격. `[commit]`은 커밋 경계다. 구현은 comment-trim이 develop에 머지된 뒤 시작한다(거의 모든 파일을 건드리므로).

## T1. 범위 판정 (`cli/internal/check/`)

- `check.Input.Scope`를 더하고, `Run`과 `Summarize`가 design.md '범위 판정'대로 동작하게 한다.
- 검증: `go test ./...`가 통과한다. design.md '순수 함수로 뺄 부분'의 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. `Scope == nil`인 기존 테스트는 바뀌지 않고 통과한다.
- `[commit]` `test:` → `feat:`

## T2. CLI 인자 (`cli/internal/cli/check.go`)

- `Check`가 위치 인자를 받는다. `workTarget`으로 정규화하고, 중복을 제거한다. 거절된 경로는 `usage_error`, 없는 파일은 `canvas_not_found`다. 범위를 `checkInput` 결과에 싣는다.
- 세션 연결 기록(`recordSessions`)은 검사한 모든 캔버스를 대상으로 그대로 둔다.
- 검증: `go test ./...`와 `go vet ./...`가 통과한다. 테스트는 다음을 확인한다.
  - 인자 없는 출력이 지금 fixture와 같다.
  - 경로 하나와 여러 개, 절대 경로와 상대 경로, 중복 경로를 처리한다.
  - `.doan/` 밖 경로, 대문자 `.HTML`, 없는 파일을 거절한다.
  - 범위 밖 오류가 있어도 exit 0이고, 범위 안 오류가 있으면 exit 4다.
- `go run ./cli/cmd/doan check <path> --repo <임시 repo> --json`으로 임시 저장소에서 한 번 손으로 확인한다(AGENTS.md 'Commands', 이 저장소가 아닌 임시 디렉터리).
- `[commit]` `test:` → `feat:`

## T3. 안내와 프리셋

- `cli/internal/cli/skill.md`:
  - 가이드 E를 "After editing, make `doan check <edited canvas paths> --json` pass"로 바꾼다.
  - 명령 설명 줄에 두 형태를 적는다: 경로를 주면 그 캔버스와 그 캔버스가 얽힌 결과만, 없으면 저장소 전체.
- `cli/internal/designskill/presets/`의 "make `doan check` pass"를 같은 형태로 바꾼다.
- 검증: `go test ./...`가 통과한다(임베드된 안내와 프리셋 테스트). `grep -rn 'make \`doan check\` pass' cli/internal`의 결과가 0이다.
- `[commit]` `feat:`(안내와 프리셋은 제품의 일부다)

## T4. eval

- `eval/lib/transcript.ts`의 명령 인자 표에 `check`의 위치 인자를 반영한다.
- 시나리오 검사 가운데 "`doan check`를 돌렸는가"를 보는 것이 경로 인자가 있는 실행도 인정하는지 확인한다.
- 검증: `node --test 'eval/**/*.test.ts'`가 통과하고, `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0이다.
- `[commit]` `test:` / `fix:`(필요할 때만)

## T5. 측정

- `/agent-eval`을 돌린다. 안내, CLI 출력, 스킬 stub이 바뀌기 때문이다(AGENTS.md 'Workflow'). 먼저 `npm --prefix app run package`로 CLI를 묶는다.
- 검증:
  - 편집이 있는 시나리오에서 Claude Code와 Codex가 편집한 캔버스 경로를 넘겨 `doan check`를 돌린다(transcript로 확인한다).
  - 기존 시나리오의 통과 수가 직전 회차보다 줄지 않는다.
  - 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다.
- `[commit]` `docs(usability-eval): …`

## T6. 승격과 정리

- ARCHITECTURE:
  - §1 '`doan check` rules'의 "takes no arguments and checks the whole repo"를 새 규칙으로 바꾼다: 언제나 전체를 검사하고, 경로를 주면 그 범위만 보고하며, exit 코드도 그 범위로 정한다.
  - §1 에이전트 규칙 E와 §12 '`doan check`' 결과 설명에 범위가 있을 때의 `summary` 값을 적는다.
- PRODUCT: §5 item 11(정적 검사)과 루프(§4 "edit → `doan check`")에 범위를 적는다.
- `docs/features/check-scope/`를 지운다.
- 검증: 두 문서에 새 규칙이 있고, 기능 디렉터리가 없다.
- `[commit]` `docs(ARCHITECTURE): …`, `docs(PRODUCT): …`, `docs(feature): remove check-scope after promotion`
