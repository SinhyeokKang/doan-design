# setup-via-onboarding — design

## 방식

가이드 문구로 에이전트의 선택을 바꾼다. 세팅 요청이면 언제나 onboarding으로 시작한다. 첫 실행이 끝났는지는 `doan onboarding start`가 돌려주는 `completed`로 알고, 그 값으로 `complete`를 부를지만 가른다(spec 결정 2). 사용자가 Doan 세팅을 부탁했으니 창이 뜨는 것은 기대한 동작이다. 앱에 닿지 못하면 init으로 가고 알린다(spec 결정 3).

검토했지만 고르지 않은 안:
- **`completed`를 보고 init과 onboarding을 가르기**: 첫 실행이 끝났으면 init을 쓰게 되는데, init은 앱에 등록하지 않으므로 사람이 다시 Add Project를 해야 한다.
- **`doan init`이 첫 실행 상태를 안내**: init은 지금 파일만 다루는 명령이라(`run.go`: runtime 경로는 active·work·onboarding에서만 푼다) 소켓 조회와 새 요청 형식이 필요하다. 명시적 init 요청에만 도움이 된다. 비목표로 미룬다.
- **창 없는 상태 조회**: 새 소켓 요청과 schema가 필요하다. `start`의 `completed`로 충분하다.
- **O1을 넓히기**: O1은 경로를 주고 "Set up Doan"이라고 말한다. O3는 저장소 안에서 경로 없이 "이 저장소를 Doan에 세팅해 달라"고 해서 init과 헷갈리는 요청을 잰다. 요청이 다르므로 새 시나리오로 둔다.

## 영향 받는 부분

- **가이드** (`cli/internal/cli/skill.md`):
  - 'Onboarding' 첫 문장 "Use these commands when the user asks you to set up Doan."을 "set up Doan or set up a repository for Doan"으로 넓힌다. 같은 문단에 짧게 더한다: `completed`가 true이면 select에서 멈추고 `complete`를 부르지 않는다. 사용자가 token CSS를 말했으면 select 뒤에 `doan config --token-css`를 부른다. 앱에 닿지 못하면(`app_not_running`·`app_launch_failed`·`app_protocol_mismatch`·샌드박스 차단) `doan init`으로 세팅하고, 앱에 등록되지 않았다고 알린다.
  - step 1의 "On `app_not_running` or `app_launch_failed`, ask the user to open Doan …"은 세팅 요청에서 위 init 폴백과 충돌한다. 세팅 요청에서는 폴백을 따르고, 그 밖의 onboarding(사용자가 앱 첫 실행을 대신 해 달라고 한 경우)에서는 지금처럼 묻도록 한 문장으로 가른다.
  - Commands의 `doan init` 줄: 끝 문장 "Run it only when the user asks, and ask the user for the token CSS path first."를 그 자리에서 고친다. 예: "Run it only when the user names `doan init` or Doan cannot be reached (see Onboarding), and ask for the token CSS path first; it does not add the project to the Doan app." 문장을 덧붙이지 않는다.
  - 문구는 T3에서 정한다. 'Onboarding' 첫 문단, step 1, init 줄 밖은 고치지 않는다(POSTMORTEM 2026-10-29).
- **가이드 테스트** (`cli/internal/cli/skill_test.go`): 새 문구 고정. 출력 예산(`skillOutputBudget` 21,600B)은 일반 출력과 `--json` + `/Applications/Doan.app` bundle 안내 둘 다 검사한다. 더 큰 쪽은 `--json`+안내다. 링크 6 시작(`4a5622eb`)에서 `--json` 21,405 B + 안내 166 B = 21,571 B로, 남은 여유는 29 B다. 그래서 새 문구는 같은 크기만큼 'Onboarding' 첫 문단, step 1, init 줄 안에서 줄여 넣는다. step 1의 "Only `doan open` also opens the app"는 `doan open`이 닫힌 앱을 연다는 사실이 남은 유일한 자리이므로 지우지 않는다(링크 5). T3 시작 때 이 형태로 다시 잰다.
- **eval 하네스** (`eval/lib/socket.ts` `onboardingApp`): 지금 가짜 앱은 `completed = false`로 고정이고, 스크립트 키는 `{providers, changes, readyAfterCheck}`만 받는다. 선택 키 `completed`(boolean, 기본 false)를 더해 O3b가 첫 실행이 끝난 앱으로 시작하게 한다. `start`·`status` 응답의 `completed`가 그 값을 따른다. 기존 O1·O2 스크립트는 그대로 읽힌다.
- **eval 시나리오 O3** (`eval/scenarios/O3/`): O1의 가짜 앱 하네스(`onboardingApp`, `O1/harness.ts` 방식)를 쓴다. 가짜 앱은 `completed: false`로 시작한다. 에이전트는 seed 저장소 안에서 시작한다.
  - `prompt.md`: "Set this repository up for Doan. Doan may add its setup files; tell me what it adds." 경로, 명령 이름, "set up Doan"이라는 표현을 쓰지 않는다. 허락 문장이 있어야 가이드대로 묻지 않고 `select --initialize`까지 간다.
  - `onboarding.json`: Claude 연결·준비됨, 저장소 세팅 변경 세 개(O1과 같은 상태). seed는 항상 세팅이 필요한 저장소다(`changes`가 비지 않는다).
  - `checks.ts`: `ctx => [...o1Checks(ctx), noDoanInit(ctx)]`. O1의 판정은 `O1/checks.ts`의 기본 export(`inspected_repo_path`, `selected_with_initialize`, `complete_only_when_ready`, `completion_confirmed`)를 그대로 부른다. O1 파일은 고치지 않는다(시나리오는 첫 기록 라운드 뒤 고정, `docs/USABILITY-EVAL.md`).
  - "변경을 select 전에 알렸는가"는 자동 판정이 아니라 `rubric.md`에서 judge가 본다(O1 rubric과 같다, POSTMORTEM 2026-10-24).
  - `rubric.md`, `fixtures/{pass,fail}`, `seed/`. fail은 `doan init`으로 세팅을 끝낸 transcript다. pass transcript에는 사용자에게 보여 주는 설명 속 "doan init" 언급을 넣어 오탐이 없음을 고정한다(self-test는 `pass`·`fail` 두 fixture만 받는다, `eval/run.ts`).
- **eval 시나리오 O3b** (`eval/scenarios/O3b/`): O3와 같은 요청과 seed, `onboarding.json`에 `completed: true`. `checks.ts`: `noDoanInit`, inspect가 seed 루트를 봄, `select --initialize`, `complete`를 부르지 않음(`noComplete`). O1 판정 중 complete를 요구하는 것은 쓰지 않는다. fixture는 pass(select에서 멈춤)와 fail(`complete`까지 부름)이다.
- **앱·CLI 코드, 소켓 형식, schema**: 바뀌지 않는다.

## 순수 함수 (`/tdd` 대상)

- `noDoanInit(ctx)`: 문자열 검색이 아니라 기존 파서로 판정한다. `ctx.calls.commands.flatMap(commandWords).some(w => doanCommand(w) === "init")`(`R2/checks.ts`, `R7b/checks.ts`와 같은 방식). Claude `Bash`, Codex `exec_command`, code-mode `exec`, `sh -c` 감싸기, 번들 경로 `…/bin/doan`, `doan --json init`을 모두 잡는다. `doan onboarding … --initialize`와 설명 문장은 init으로 치지 않는다. Codex template literal의 `${}` 안은 추출되지 않는다는 한계가 있지만, 그 경우에도 `repo_untouched`가 init이 쓴 `.gitattributes`로 잡는다.
- `noComplete(ctx)`: 가짜 앱 요청 로그에 `complete`가 없다.
- `O3/checks.test.ts`, `O3b/checks.test.ts`: pass·fail과 음성 대조(`grep "doan init"`, `echo doan init`), 양성 대안(`<bundle>/bin/doan onboarding project select … --initialize`)을 고정한다.
- 가짜 앱의 `completed` 키: `eval/lib` 테스트로 기본값 false, true일 때 `start`·`status`의 값, 잘못된 타입 거절을 고정한다.
- 가이드 문구 고정(`skill_test.go`).

## 형식 변경

- 없다. 가이드는 형식이 아니고, 소켓·CLI 응답·schema는 그대로다. 가짜 앱 스크립트는 eval 내부 입력이다.

## 규약 영향

- ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. 가이드의 에이전트 규칙 몇 줄이 바뀐다.

## 결정 영향

- PRODUCT §2(`docs/PRODUCT.md`의 "ask their own agent to run first run through `doan onboarding`"), §5 item 0 'First run'의 "The person's own agent can drive the same session through `doan onboarding …`", item 8 `doan init` 설명에 spec 결정 1–5를 더한다(Z1).
- ARCHITECTURE: §4 onboarding 요청과 §14 'Agent evaluation'에 바뀌는 사실이 있는지 Z1에서 확인한다. §14가 시나리오를 나열하면 O3·O3b를 더한다.
- 구조 결정(서빙 범위, sandbox, append-only, 토큰 미취급, git 미조작)은 건드리지 않는다.

## PoC 의존

- "에이전트가 지금 init을 고른다"는 아직 재지 않았다. T2의 기준선 라운드가 이것을 잰다. 기준선에서 두 에이전트가 이미 O3·O3b를 모두 통과하면, 지휘자가 가이드 변경(T3)을 문구를 분명히 하는 수준으로 줄이고 시나리오는 회귀 방지용으로 남긴다. 그 판단과 근거는 orch.md에 적는다(체인 승인 뒤 링크마다 멈추지 않는다).
- 가이드를 고쳐도 에이전트가 `doan skill`을 읽지 않으면 효과가 없다. stub 설명(`app/src/main/onboarding/SKILL.md`)은 세팅을 말하지 않고, `doan help`는 `init`을 먼저 보인다. 그래서 T2는 각 실행에서 init·onboarding 호출 전에 `doan skill`을 읽었는지 기록한다. 실패가 stub 탓인지 가이드 탓인지 가르기 위해서다.

## 체인과의 관계

- 이 feature는 chain-261103의 링크 6이다(2026-11-03 사용자). 링크 2(project-settings), 3(canvas-open-offer), 5(canvas-row-menu)가 모두 `skill.md`를 고치고 `/agent-eval`을 돈다. 같은 파일과 같은 출력 예산을 나눠 쓰므로 링크 5가 병합된 뒤에 시작한다. T2의 기준선도 그 시점의 가이드로 잰다.
- 출력 예산: 앞 링크들이 가이드를 늘린 뒤의 남은 예산을 링크 시작 때 `--json`+bundle 안내로 다시 잰다. 들어가지 않으면 문구를 줄이거나 다른 문단을 다듬을지 지휘자가 정하고 기록한다.

## POSTMORTEM에서 가져온 함정

- 2026-11-02 'Evaluation unit checks inherited the real session-recording runtime': CLI를 부르는 eval 테스트는 절대 경로의 임시 `DOAN_RUNTIME`을 둔다. `harness.ts score`는 CLI를 부르지 않으므로 `checks.test.ts`가 CLI를 더 부르지 않는 한 해당하지 않는다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': 가이드가 길어지면 에이전트가 가운데를 잘라 읽는다. 문구는 'Onboarding' 첫 문단과 init 줄에만 짧게 넣고 출력 예산 테스트를 지킨다.
- 2026-10-24 'Evaluation checks rejected valid markup and natural review reports': `noDoanInit`은 명령만 보고 설명 속 "doan init" 언급을 위반으로 세지 않는다. 변경 안내 여부는 judge가 본다.
- 2026-10-24 'Agent shells bypassed the evaluation runner's packaged CLI': 가이드는 PATH에 `doan`이 없으면 `<Doan.app>/Contents/Resources/bin/doan`을 쓰라고 하는데, 이 Mac에는 실제 `/Applications/Doan.app`이 있다. T2·T4는 transcript에서 init·onboarding 호출이 작업 공간의 `doan`을 썼는지 확인한다.
