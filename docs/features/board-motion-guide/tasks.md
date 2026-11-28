# 보드 클릭·모션 안내 — tasks

순서: eval 시나리오와 baseline → 보드 `:hover` 확인 → guide와 preset → eval 회차 → 승격. `[commit]`은 커밋 경계다.

## T1. eval 시나리오 W15

- design.md 'eval W15'대로 `eval/scenarios/W15/`를 만든다(prompt, seed, checks, rubric, pass·fail fixture).
- 검증: `node --test 'eval/**/*.test.ts'`가 통과하고, `node eval/run.ts --self-test --scenarios W15`가 `self-test PASS`와 exit 0이다.
- `[commit]` `test:`

## T1a. baseline 회차

- 지금 guide로 `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W15 --round <name>-baseline`.
- 검증: W15가 Claude Code나 Codex에서 실패한다(보드에 클릭 트리거). 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다. 둘 다 통과하면 사용자에게 알리고 시나리오를 다시 본다.
- `[commit]` `docs(usability-eval): …`

## T1b. 보드 `:hover` 확인

- 격리된 실제 앱에서 `:hover`로 색이 바뀌는 요소가 있는 캔버스를 열고, Select와 Hand에서 포인터를 올렸을 때 computed style이 바뀌는지 본다(`/runtime-test`).
- 검증: 두 도구의 관측값이 `.scratch/`에 있다. Select에서 동작하지 않으면 사용자에게 알리고 `:hover` 허용을 다시 정한다.

## T2. guide와 preset

- `cli/internal/cli/skill.md`에 보드 상호작용 규칙을 더하고, 예산에 맞게 다른 문장을 줄인다. `animate.md`, `delight.md`의 'Apply the change in Doan'을 세 갈래와 Play 안내로 바꾼다.
- 검증: `go test ./...`가 통과한다(예산 테스트, guide 새 규칙과 줄인 문장의 문구 고정, `TestPresetsKeepAgentEvalFixes`의 animate·delight 항목). `go vet ./...`가 통과한다. `rg -n -i 'replay control|visible trigger' cli/internal/designskill/presets`(일반 도구)가 비어 있다.
- `[commit]` `test:` → `feat:`(guide), `feat:`(presets)

## T3. eval 회차

- `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W15,W13,D5,W7,W8,W11,W12 --round <name>`.
- 검증: W15가 Claude Code와 Codex 모두 통과한다(실패하면 `--repeat 2`). 회귀 시나리오가 회귀하지 않는다. 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다. `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다.
- `[commit]` `docs(usability-eval): …`

## T4. 승격과 정리

- ARCHITECTURE §1 'Conventions'(agent rules)에 보드 상호작용 규칙을 적는다. W15가 특수한 메커니즘을 쓰면 §14에 더한다.
- `docs/USABILITY-EVAL.md`: 이 문제(보드의 재생 버튼)를 고친 이슈로 적는다.
- `docs/features/board-motion-guide/`를 지운다.
- 검증: ARCHITECTURE §1에 새 규칙이 있고 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(ARCHITECTURE): …`, `docs(USABILITY-EVAL): …`, `docs(feature): remove board-motion-guide after promotion`
