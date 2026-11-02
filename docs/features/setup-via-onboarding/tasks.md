# setup-via-onboarding — tasks

착수 조건: chain-261103의 링크 6이다(2026-11-03 사용자). 링크 5가 병합된 뒤의 main에서 T1부터 시작한다(design '체인과의 관계').

## E. 시나리오와 기준선

- [ ] T1. eval 시나리오 `O3`: `scenario.json`, `prompt.md`, `onboarding.json`, `seed/`, `rubric.md`, `checks.ts`(`no_doan_init` + O1 판정 재사용), `checks.test.ts`, `fixtures/{pass,fail}`(fail은 `doan init`으로 세팅을 끝낸 transcript, 다른 fail은 설명 속 "doan init" 언급만 있는 pass 변형으로 오탐이 없음을 고정).
  - 검증: `node --test 'eval/**/*.test.ts'` green, `node eval/run.ts --self-test --scenarios O3` 가 `self-test PASS`와 exit 0.

── commit: `test(eval): O3 setup request goes through onboarding` ──

- [ ] T2. 기준선: 가이드를 바꾸기 전에 `npm --prefix app run package` 후 `node eval/run.ts --scenarios O3 --round o3-baseline`(Claude Code, Codex). 결과와 각 에이전트가 고른 명령을 `docs/USABILITY-EVAL.md`에 기록한다. 두 에이전트 모두 이미 onboarding을 고르면 design 'PoC 의존'대로 T3 범위를 줄일지 사용자에게 묻는다.
  - 검증: `docs/USABILITY-EVAL.md`에 `o3-baseline` 라운드가 있다.

── commit: `docs(usability): O3 baseline round` ──

## G. 가이드

- [ ] T3. `cli/internal/cli/skill.md` 'Onboarding' 첫 문단과 Commands의 `doan init` 줄(design '영향 받는 부분'). `skill_test.go`가 새 문구를 고정한다.
  - 검증: `go test ./...`(출력 예산 테스트 포함), `go vet ./...`.

── commit: `docs(guide): setup requests go through onboarding` ──

## R. 확인

- [ ] T4. `/agent-eval`: `npm --prefix app run package` 후 `node eval/run.ts --scenarios O3,O1,O2,D12 --round o3-guide`. O3가 두 에이전트 모두 통과하고 O1·O2·D12가 이전 라운드처럼 통과한다.
  - 검증: `docs/USABILITY-EVAL.md`에 `o3-guide` 라운드, 네 시나리오의 결과.
- [ ] T5. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

── commit: `docs(usability): O3 after the guide change` ──

## Z. 정리

- [ ] Z1. PRODUCT §5 item 0 'First run'(에이전트가 세팅 요청을 onboarding으로 진행)과 item 8 `doan init`(앱에 등록하지 않음, 세팅 요청은 onboarding)을 현재 규칙으로 고친다. `docs/features/setup-via-onboarding/`을 지운다.
  - 검증: `grep -n "onboarding" docs/PRODUCT.md`에 새 규칙이 보이고, `ls docs/features/setup-via-onboarding` 실패.

── commit: `docs(product): setup requests go through onboarding` / `docs(feature): remove setup-via-onboarding` ──
