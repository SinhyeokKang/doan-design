# setup-via-onboarding — tasks

착수 조건: chain-261103의 링크 6이다(2026-11-03 사용자). 링크 5가 병합된 뒤의 main에서 T1부터 시작한다(design '체인과의 관계'). `/agent-eval`(T2·T4)은 그 HEAD에서 `npm --prefix app ci`, Electron 다운로드, `npm --prefix app run package`를 한 뒤 돌린다. `python3.12`가 필요하고, 실제 HOME의 `claude`·`codex` 로그인을 쓴다(AGENTS 'Commands'). 앱 프로필 로그인은 필요 없다.

링크 시작 때 지휘자가 정해 이 파일에 적는 것: O1·O2·D12·D9·D10h 각각의 기준 라운드(`docs/USABILITY-EVAL.md`에서 그 시나리오의 최신 기록 라운드. D10h가 대체됐으면 그때의 현재 id), 가이드 출력 크기(`doan skill --json` + bundle 안내).

링크 시작(`4a5622eb`)에서 정한 값:
- 기준 라운드: O1·O2·D12·D9는 `project-settings-guide`(2026-11-03; O1-claude는 judge만 fail이었고 `project-settings-guide-repeat`에서 pass/pass). D10h는 `eval-d10h-261101`(2026-11-01, claude partial(judge만), codex pass). D10h는 대체되지 않았다.
- 가이드 출력 크기: `doan skill --json` 21,405 B + bundle 안내 166 B = 21,571 / 21,600 B(29 B 남음). 일반 출력은 20,730 B.

## E. 하네스와 시나리오

- [ ] T1. 가짜 앱 `completed`, 시나리오 O3·O3b(design '영향 받는 부분').
  - `eval/lib/socket.ts` `onboardingApp`: 선택 키 `completed`(기본 false). 테스트로 기본값, true일 때 `start`·`status`의 값, 잘못된 타입 거절, 기존 O1·O2 스크립트가 그대로 읽히는 것을 고정한다.
  - O3: `scenario.json`, `prompt.md`, `onboarding.json`, `seed/`(세팅이 필요한 저장소), `rubric.md`(변경을 select 전에 알렸는지, 허락 문장이 있으니 다시 묻지 않는지), `checks.ts`(O1 기본 export + `noDoanInit`), `checks.test.ts`, `fixtures/pass`(설명 속 "doan init" 언급 포함), `fixtures/fail`(`doan init`으로 세팅을 끝냄).
  - O3b: 같은 구성에 `onboarding.json`의 `completed: true`, `checks.ts`(`noDoanInit`, inspect, `select --initialize`, `noComplete`), `fixtures/pass`(select에서 멈춤), `fixtures/fail`(`complete`까지 부름).
  - `checks.test.ts`: `noDoanInit`의 음성 대조(`grep "doan init"`, `echo doan init`, 설명 문장)와 양성 대안(`<bundle>/bin/doan onboarding project select … --initialize`, `sh -c 'doan init'`, `doan --json init`).
  - 검증: `node --test 'eval/**/*.test.ts'` green, `node eval/run.ts --self-test --scenarios O3,O3b`가 `self-test PASS`와 exit 0.

── commit: `test(eval): fake app completed state` / `test(eval): O3 and O3b setup requests go through onboarding` ──

- [ ] T2. 기준선: 가이드를 바꾸기 전에 `node eval/run.ts --scenarios O3,O3b --repeat 3 --round o3-baseline`(기본으로 Claude Code와 Codex 둘 다).
  - `docs/USABILITY-EVAL.md`에 라운드를 적는다: 결과, 가이드 해시와 CLI 버전, 각 실행이 고른 명령(init 또는 onboarding, complete 여부), init·onboarding 호출 전에 `doan skill`을 읽었는지, 그 호출이 작업 공간의 `doan`을 썼는지(`/Applications/Doan.app`이 아닌지).
  - init을 고르거나 O3b에서 complete를 부른 실행은 issue 행(layer `guide` 또는 `stub`, transcript 줄)으로 남긴다. 소켓에 닿지 못한 실행(Codex 샌드박스 등)은 에이전트의 선택으로 세지 않고 runner·시나리오 결함으로 분류한다(`/agent-eval` 단계 3).
  - 두 에이전트가 이미 O3·O3b를 모두 통과하면 지휘자가 T3을 문구를 분명히 하는 수준으로 줄이고 그 판단을 orch.md에 적는다(design 'PoC 의존'). 묻지 않는다.
  - 검증: `docs/USABILITY-EVAL.md`에 `o3-baseline` 라운드와 위 기록이 있다.

── commit: `docs(usability): O3 baseline round` ──

## G. 가이드

- [ ] T3. `cli/internal/cli/skill.md` 'Onboarding' 첫 문단(결정 1·2·3·5, step 1과의 구분)과 Commands의 `doan init` 줄 끝 문장(그 자리에서 고침). 먼저 `doan skill --json` + bundle 안내 크기를 재고, 여유가 모자라면 줄일 곳을 정해 orch.md에 적는다. `skill_test.go`가 새 문구를 고정한다.
  - 검증: `go test ./...`(출력 예산 테스트 포함), `go vet ./...`.
- [ ] T4. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

── commit: `docs(guide): setup requests go through onboarding` ──

## R. 확인

- [ ] T5. `/agent-eval`: T3·T4가 끝난 HEAD에서 패키지를 다시 만들고 `node eval/run.ts --scenarios O3,O3b,O1,O2,D12,D9,D10h --round o3-guide`. O3·O3b가 두 에이전트 모두 통과하면 그대로 두고, 실패하면 `--repeat 2 --round o3-guide-repeat`로 다시 본다. O1·O2·D12·D9·D10h는 기준 라운드처럼 통과한다(모든 check 통과, judge 판정이 기준보다 나쁘지 않음).
  - 실패는 issue 행으로 남기고 layer로 분류한다. 가이드를 고쳐야 하면 T3으로 돌아간다.
  - 검증: `docs/USABILITY-EVAL.md`에 `o3-guide` 라운드와 일곱 시나리오의 결과, 기준 라운드 대비.

── commit: `docs(usability): O3 after the guide change` ──

## Z. 정리

- [ ] Z1. 현재 규칙으로 고친다.
  - PRODUCT §2(사람이 에이전트에게 맡기는 세팅), §5 item 0 'First run'(에이전트가 세팅 요청을 onboarding으로 진행, 첫 실행 뒤에는 select까지), item 8 `doan init`(앱에 등록하지 않음, 세팅 요청은 onboarding, 앱에 닿지 못할 때의 폴백).
  - ARCHITECTURE §4·§14에서 바뀐 사실이 있으면 고친다. §14가 시나리오를 나열하면 O3·O3b를 더한다.
  - BACKLOG에서 이 feature가 닫는 항목이 있으면 지운다.
  - `docs/features/setup-via-onboarding/`을 지운다.
  - 검증:
    - `grep -n "set up a repository" docs/PRODUCT.md`가 item 0 또는 item 8의 새 규칙을 보여 준다.
    - `grep -n "does not add the project" docs/PRODUCT.md`(또는 Z1에서 쓴 같은 뜻의 문구)가 item 8에 있다.
    - `grep -n "O3" docs/ARCHITECTURE.md` 결과가 §14의 나열 방식과 맞다(나열하지 않으면 결과 없음이 맞다).
    - `ls docs/features/setup-via-onboarding` 실패.

── commit: `docs(product): setup requests go through onboarding` / `docs(architecture): …`(바뀐 것이 있을 때) / `docs(feature): remove setup-via-onboarding` ──
