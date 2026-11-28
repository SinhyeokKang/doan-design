# 보드 클릭·모션 안내 — tasks

순서: eval 시나리오(먼저 실패) → guide와 preset 텍스트 → eval 회차 → 승격. `[commit]`은 커밋 경계다.

## T1. eval 시나리오

- 새 시나리오 id 하나(`/agent-eval` 스킬의 id 규칙): 기존 캔버스에 "버튼을 누르면 카드가 펼쳐지는 모션을 보여 달라" 같은 요청. 검사: 보드(프로토타입 표시가 없는 영역)에 클릭으로 동작하는 컨트롤이나 `click` 핸들러가 없다(로드 때 재생과 `:hover`는 통과). 모션은 `data-doan-prototype` 프레임 안에 있거나 정지 상태로 그려졌다. `doan check`가 통과한다. pass와 fail fixture를 둔다.
- 검증: `node --test 'eval/**/*.test.ts'`가 통과하고, `node eval/run.ts --self-test --scenarios <새 id>`가 `self-test PASS`와 exit 0이다.
- `[commit]` `test:`

## T1b. 보드 `:hover` 확인

- 격리된 실제 앱에서 `:hover`로 색이 바뀌는 요소가 있는 캔버스를 열고, Select와 Hand에서 포인터를 올렸을 때 computed style이 바뀌는지 본다(`/runtime-test`).
- 검증: 두 도구에서 관측값이 `.scratch/`에 있다. 동작하지 않으면 사용자에게 알리고 spec의 `:hover` 허용을 다시 정한다.

## T2. guide와 preset

- `cli/internal/cli/skill.md`에 보드 상호작용 규칙을 더한다. `animate.md`, `delight.md`의 트리거 문장을 바꾸고 `catalog.json`의 두 preset 버전을 올린다. 보드 클릭을 전제하는 다른 preset 문장을 찾아 고친다.
- 검증: `go test ./...`가 통과한다(예산 테스트 `TestSkillGuideFitsToolOutputCap`, preset 테스트 포함). `go vet ./...`가 통과한다. `rg -n -i 'replay control|visible trigger' cli/internal/designskill/presets`가 비어 있다.
- `[commit]` `feat:`(guide), `feat:`(presets)

## T3. eval 회차

- `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <새 id>,<guide를 읽는 기존 시나리오 몇 개> --round <name>`. 기존 시나리오는 guide 변경에 영향받는 것(프로토타입: R10~R12 중 해당, W 시리즈 중 guide 전체를 읽는 것)을 `/agent-eval` 스킬 기준으로 고른다.
- 검증: 새 시나리오가 Claude Code와 Codex 모두 통과하고, 기존 시나리오가 회귀하지 않는다. 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다. `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다.
- `[commit]` `docs(usability-eval): …`

## T4. 승격과 정리

- ARCHITECTURE §1 'Conventions'(agent rules)에 보드 상호작용 규칙을 적고, §14에 새 시나리오를 더한다.
- `docs/USABILITY-EVAL.md`: 이 문제(보드의 재생 버튼)를 고친 이슈로 적는다.
- `docs/features/board-motion-guide/`를 지운다.
- 검증: ARCHITECTURE §1에 새 규칙이 있고 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(ARCHITECTURE): …`, `docs(USABILITY-EVAL): …`, `docs(feature): remove board-motion-guide after promotion`
