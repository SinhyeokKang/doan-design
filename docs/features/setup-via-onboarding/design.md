# setup-via-onboarding — design

## 방식

가이드 문구로 에이전트의 선택을 바꾼다. 첫 실행 여부를 따로 묻지 않는다. 세팅 요청이면 언제나 onboarding이므로, 에이전트가 첫 실행 상태를 알아야 할 필요가 없다. 그래서 `onboarding start`의 부작용(창 표시, 꺼진 앱 열기) 문제도 생기지 않는다. 사용자가 Doan 세팅을 부탁했으니 창이 뜨는 것은 기대한 동작이다.

검토했지만 고르지 않은 안:
- **`onboarding start`로 `completed`를 보고 갈라 가기**: 첫 실행이 끝났으면 init을 쓰게 되는데, init은 앱에 등록하지 않으므로 사람이 다시 Add Project를 해야 한다. 결정 1이 더 단순하고 결과도 낫다.
- **`doan init`이 첫 실행 상태를 안내**: init은 지금 파일만 다루는 명령이라(`run.go`: runtime 경로는 active·work·onboarding에서만 푼다) 소켓 조회와 새 요청 형식이 필요하다. 명시적 init 요청에만 도움이 된다. 비목표로 미룬다.
- **창 없는 상태 조회**: 새 소켓 요청과 schema가 필요하다. 결정 1에서는 쓸 곳이 없다.

## 영향 받는 부분

- **가이드** (`cli/internal/cli/skill.md`): 'Onboarding' 첫 문장과 Commands의 `doan init` 줄. 지금 첫 문장 "Use these commands when the user asks you to set up Doan."을 "set up Doan or set up a repository for Doan"으로 넓히고, init을 쓰는 경우(사용자가 init을 말함, 앱을 쓸 수 없음)를 한 줄로 더한다. `doan init` 줄 끝에 "It does not add the project to the Doan app; for a setup request use Onboarding."을 더한다.
- **가이드 테스트** (`cli/internal/cli/skill_test.go`): 새 문구 고정. 출력 예산(`skillOutputBudget` 21,600B)을 넘지 않아야 한다. 지금 `doan skill` 출력은 19,121B(2026-11-03, `465c5fa9`)이고, 이 변경은 300B 안쪽을 목표로 한다.
- **eval**: 새 시나리오 `O3`(`eval/scenarios/O3/`). O1의 가짜 앱 하네스(`eval/lib/socket.ts` `onboardingApp`, `O1/harness.ts`)를 그대로 쓴다. 가짜 앱은 `completed: false`로 시작한다.
  - `prompt.md`: "I want to use Doan with the repo at {{repo}}. Set it up for me. Doan may add its setup files; tell me what it adds." — 명령 이름과 "set up Doan"이라는 표현을 쓰지 않는다.
  - `onboarding.json`: Claude 연결·준비됨, 저장소 세팅 변경 세 개(O1과 같은 상태).
  - `checks.ts`: `no_doan_init`(transcript에 `doan init` 호출 없음), `inspected_given_repo`, `selected_with_initialize`, `completed`, `changes_before_select`(O1과 같은 판정), `absolute_paths_only`. O1의 판정 함수를 재사용한다.
  - `rubric.md`, `fixtures/{pass,fail}`(fail은 `doan init`으로 끝낸 transcript), `seed/`.
- **앱·CLI 코드, 소켓 형식, schema**: 바뀌지 않는다.

## 순수 함수 (`/tdd` 대상)

- `O3/checks.ts`의 판정: `no_doan_init`(셸 명령 문자열에서 `doan init`과 `<bundle>/bin/doan init`을 모두 찾는다, `doan onboarding … --initialize`는 init으로 치지 않는다)과 O1 판정 재사용. `O3/checks.test.ts`가 pass·fail 각각을 고정한다.
- 가이드 문구 고정(`skill_test.go`).

## 형식 변경

- 없다. 가이드는 형식이 아니고, 소켓·CLI 응답·schema는 그대로다.

## 규약 영향

- ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. 가이드의 에이전트 규칙 한 줄이 바뀐다.

## 결정 영향

- PRODUCT §5 item 0 'First run'의 "The person's own agent can drive the same session through `doan onboarding …`"와 item 8 `doan init` 설명에, 세팅 요청은 onboarding으로 간다는 규칙을 더한다(Z1).
- 구조 결정(서빙 범위, sandbox, append-only, 토큰 미취급, git 미조작)은 건드리지 않는다.

## PoC 의존

- "에이전트가 지금 init을 고른다"는 아직 재지 않았다. T1의 기준선 라운드가 이것을 잰다. 기준선에서 두 에이전트가 이미 onboarding을 고르면, 가이드 변경(T3)은 문구를 분명히 하는 수준으로 줄이고 시나리오만 회귀 방지용으로 남긴다.

## 체인과의 관계

- 이 feature는 chain-261103의 링크 6이다(2026-11-03 사용자). 링크 2(project-settings), 3(canvas-open-offer), 5(canvas-row-menu)가 모두 `skill.md`를 고치고 `/agent-eval`을 돈다. 같은 파일과 같은 출력 예산을 나눠 쓰므로 링크 5가 병합된 뒤에 시작한다. T2의 기준선도 그 시점의 가이드로 잰다.
- 출력 예산: 앞 링크들이 가이드를 늘린 뒤의 남은 예산을 링크 시작 때 다시 잰다. 300B가 들어가지 않으면 문구를 줄이거나 다른 문단을 다듬을지 지휘자가 정하고 기록한다.

## POSTMORTEM에서 가져온 함정

- 2026-11-02 'Evaluation unit checks inherited the real session-recording runtime': CLI를 부르는 eval 테스트는 절대 경로의 임시 `DOAN_RUNTIME`을 둔다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': 가이드가 길어지면 에이전트가 가운데를 잘라 읽는다. 문구는 'Onboarding' 첫 문단과 init 줄에만 짧게 넣고 출력 예산 테스트를 지킨다.
- 2026-10-24 'Evaluation checks rejected valid markup and natural review reports': `no_doan_init`은 명령 문자열만 보고, `onboarding … --initialize`나 사용자에게 보여 주는 설명 속 "doan init" 언급을 위반으로 세지 않는다(음성 대조와 양성 대안을 함께 고정).
