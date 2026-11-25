# 검사 범위 — tasks

순서: 기준 golden → 순수 함수(범위 판정, 인자 풀기) → CLI → 안내·프리셋·앱 프롬프트 → eval 시나리오 → 측정 → 승격. `[commit]`은 커밋 경계다. 구현은 comment-trim이 develop에 머지된 뒤 시작한다(거의 모든 파일을 건드리므로).

## T0. 인자 없는 출력의 golden

- 코드를 바꾸기 전에, fixture 저장소에서 인자 없는 `doan check`의 JSON 출력, 텍스트 출력, exit 코드를 golden으로 고정한다. fixture 저장소에는 다음이 들어 있다.
  - 공유 CSS의 중복 제거와 `undefined_token`
  - 캔버스 id 중복
  - 파싱되지 않는 캔버스
  - 확장자 대소문자가 다른 파일
  - 설정 결과
- 검증: `go test ./...`가 통과하고, 새 golden 테스트가 지금 코드에서 통과한다.
- `[commit]` `test:`

## T1. 범위 판정 (`cli/internal/check/`)

- `check.Input.Scope`를 더하고, `Run`이 design.md '범위 판정'대로 동작하게 한다. `Summarize`는 바꾸지 않는다.
- 검증: `go test ./...`가 통과한다. design.md '순수 함수로 뺄 부분'의 `Run` 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. T0 golden과 기존 테스트는 바뀌지 않고 통과한다.
- `[commit]` `test:` → `feat:`

## T2. 인자와 CLI (`cli/internal/cli/`)

- `checkScope`(design.md '경로와 범위 풀기')를 만들고, `Check`가 위치 인자를 받게 한다. 순서와 세션 기록 시점은 design.md를 따른다.
- `run.go`의 usage를 `check [<path>...]`로 바꾸고, 텍스트 요약 줄을 design.md '텍스트 출력'대로 바꾼다.
- 검증: `go test ./...`와 `go vet ./...`가 통과한다.
  - `checkScope` 표 테스트(design.md)가 먼저 실패를 보이고 나서 통과한다.
  - T0 golden이 그대로 통과한다(인자 없는 출력 불변).
  - `Check` 테스트:
    - 범위 밖 오류만 있으면 exit 0이고, 범위 안 오류가 있으면 exit 4다.
    - 파싱되지 않는 캔버스를 넘기면 `unparsable_canvas`, `canvases: 1`, exit 4다.
    - 설정 경로를 넘기면 결과가 인자 없는 실행과 같다(텍스트 요약 줄만 다르다).
    - 저장소 오류가 경로 오류보다 먼저 나온다.
    - 텍스트 요약 줄 "N canvases in scope (M checked)"를 고정한다.
  - 세션 기록 테스트(`sessions_test.go`):
    - 범위가 있는 검사도 인자 없는 검사와 같은 줄을 쓴다.
    - `usage_error`와 `canvas_not_found`로 끝나면 쓰지 않는다.
    - 기존 "`check unexpected`" 사례는 뜻이 바뀌므로(종류를 모르는 경로) 이름과 설명을 맞춘다.
- `go run ./cli/cmd/doan check <path> --repo <임시 repo> --json`으로 임시 저장소에서 한 번 손으로 확인한다(AGENTS.md 'Commands', 이 저장소가 아닌 임시 디렉터리).
- `[commit]` `test:` → `feat:`

## T3. 안내, 프리셋, 앱 프롬프트

- `cli/internal/cli/skill.md`의 가이드 E와 명령 설명 줄을 spec 완료 조건 9대로 바꾼다.
- `cli/internal/designskill/presets/`에서 `doan check`를 통과시키라는 문장(19개 파일, 여러 표현)을 같은 형태로 바꾼다.
- `app/src/main/conversation/prompt.ts`의 턴 프롬프트 문장을 같은 형태로 바꾸고, 그 테스트를 맞춘다.
- `schema/fixtures/cli-envelope/design-skill/get-clarify.json`을 다시 만든다.
- 검증:
  - `go test ./...`가 통과한다.
    - `skill_test.go`의 E 문장 고정 테스트와 안내 예산(`skillOutputBudget`, 22000)
    - `design_skill_test.go`에 새 단언: 어떤 프리셋에도 경로 없는 "`doan check`를 통과시키라"는 표현이 없다
    - `TestFixturesMatchCatalog`
  - `npm --prefix app test`가 통과한다(`designSkills.test.ts`, 프롬프트 테스트).
- `[commit]` `feat:`(안내와 프리셋은 제품의 일부다)

## T4. eval 시나리오

- 새 시나리오 id를 하나 만든다(예: W14, `/agent-eval` 스킬의 id 규칙을 따른다).
  - seed: 편집 대상 캔버스, 이미 오류가 있는 관계없는 캔버스, 두 캔버스가 함께 링크한 공유 CSS.
  - 과제: 대상 캔버스와 공유 CSS를 모두 고치게 하는 요청.
  - 검사:
    - 관계없는 캔버스가 바이트 단위로 같다.
    - 어떤 `doan check` 실행이 편집한 캔버스와 CSS 경로를 넘겼다(`doanInvocations`, `doanCommand(words) === "check"`).
    - `ctx.doan(["check", <편집한 경로>...])`가 exit 0이다.
  - pass와 fail fixture를 둔다.
- `eval/lib/transcript.ts` `shapeAccepted`에 `check` 항목을 두고, CLI가 거절하는 인자 모양(`["check","x.md"]` 등)을 대조 목록에 더한다.
- 검증: `node --test 'eval/**/*.test.ts'`가 통과하고, `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0이다.
- `[commit]` `test:`(시나리오와 eval 코드)

## T5. 통합 검증과 측정

- `node .agents/skills/verify/scripts/verify.mjs --eval`가 통과한다.
- `/agent-eval`을 전체 회차로 돌린다. 안내가 바뀌었기 때문이다(AGENTS.md 'Workflow'). 먼저 `npm --prefix app run package`로 CLI를 묶는다.
- 검증:
  - 새 시나리오가 Claude Code와 Codex 모두 통과한다.
  - 직전 회차에 통과했는데 이번에 실패한 시나리오는 `--repeat 2`로 다시 돌려, 재현되는 회귀가 없다.
  - 에이전트 버전이 직전 회차와 다르면 회차 기록에 적는다.
  - Claude Code가 경로가 다른 `doan check`마다 승인을 다시 묻는지 회차 기록에 적는다.
  - 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다.
- `[commit]` `docs(usability-eval): …`

## T6. 승격과 정리

- ARCHITECTURE:
  - §1 '`doan check` rules': "takes no arguments and checks the whole repo"를 새 규칙(언제나 전체 검사, 경로가 정하는 범위만 보고, exit도 그 범위)으로 바꾼다.
  - §1 에이전트 규칙 E와 하위 폴더 문장을 고친다.
  - §12 '`doan check`': 인자, 범위가 있을 때의 `summary` 값, 텍스트 요약 줄, `canvas_not_found`와 `usage_error`를 적는다.
  - §14: 새 시나리오를 적는다.
- PRODUCT: §5 item 11(정적 검사)과 루프(§4 "edit → `doan check`")에 범위를 적는다.
- README: CLI 표의 `doan check` 설명을 고친다.
- `docs/features/check-scope/`를 지운다.
- 검증: 세 문서에 새 규칙이 있고, 기능 디렉터리가 없다.
- `[commit]` `docs(ARCHITECTURE): …`, `docs(PRODUCT): …`, `docs(README): …`, `docs(feature): remove check-scope after promotion`
