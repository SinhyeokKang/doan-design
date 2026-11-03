# setup-via-onboarding — orch

출처: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). chain-261103의 링크 6(마지막)이다([chain.md](../chain-261103/chain.md)).

- 시작 해시: `4a5622eb`(origin/main, 링크 6 시작 기록)
- 통합 브랜치: `feat/setup-via-onboarding`
- 지휘자: Claude Code 세션 d0c0b53b, worktree `setup-via-onboarding-orch`

## 결정 기록

- intake: design의 출력 예산 수치가 옛 값(`465c5fa9`, 여유 약 1,655 B)이라 링크 6 시작 값(21,571 / 21,600 B, 29 B 남음)으로 고쳤다. 새 문구는 'Onboarding' 첫 문단, step 1, init 줄 안에서 줄여 넣는다. step 1의 "Only `doan open` also opens the app"는 남긴다(링크 5 인계). 지휘자 판단 — 근거: chain.md 링크 5 완료 기록, tasks T3 "여유가 모자라면 줄일 곳을 정해 orch.md에 적는다".
- intake: design이 전제한 가이드 문장("Use these commands when the user asks you to set up Doan.", step 1의 "On `app_not_running` or `app_launch_failed`, ask the user to open Doan …", init 줄 끝 "Run it only when the user asks, and ask the user for the token CSS path first.")은 지금 `skill.md`에 그대로 있다. 고칠 전제는 없다.
- intake: 기준 라운드와 가이드 크기를 tasks에 적었다(O1·O2·D12·D9 `project-settings-guide`, D10h `eval-d10h-261101`).
- 지휘자 판단: T3(가이드)는 T1과 병렬로 쓰되, T2 기준선 패키지가 만들어질 때까지 feat에 통합하지 않는다. 기준선은 가이드를 바꾸기 전의 HEAD에서 재야 하기 때문이다. 기준선에서 두 에이전트가 이미 O3·O3b를 모두 통과하면 T3을 문구를 분명히 하는 수준으로 줄일지 그때 정한다(design 'PoC 의존').
- 지휘자 판단: Codex(사용자 지시, chain.md 2026-11-03 사용자 기록)는 독립 리뷰 두 번(RA, RG)에 쓴다. 기계적 배치로 뗄 만한 것이 없다. T1은 주 구현이고, T2·T5는 실제 Claude·Codex를 띄우는 eval이라 Codex 샌드박스 안에서 돌리기 어렵다.
- G 질문(2026-11-03): 허용한 세 곳만 줄여도 `--json`+안내가 22,049 B로 449 B 넘었다. 지휘자 판단으로 'Onboarding' 절의 나머지(step 2–8, 넘겨줄 때 문단, cancel·`--request` 문단)도 줄이도록 넓혔다. 사실과 `onboarding_test.go`·`skill_test.go`가 고정한 문구는 지키고, 'Onboarding'과 init 줄 밖은 고치지 않는다. 근거: 출력 예산은 테스트가 정하는 한도이고, POSTMORTEM 2026-10-29의 위험은 길이다. 그 절을 쓰는 O1·O2는 T5가 다시 잰다.
- G 질문(2026-11-03): 결정 3("묻지 않고 init")과 init 줄의 "token CSS 경로를 먼저 묻는다"가 부딪힌다. 지휘자 판단으로, 명시적 `doan init` 요청에서만 token CSS를 먼저 묻고 폴백에서는 묻지 않는다. 사용자가 경로를 말했을 때만 `--token-css`로 넘긴다. 근거: 결정 3의 이유("답할 사람이 없는 실행도 멈추지 않게")와 결정 5("init에 넘긴다"). 아침 보고에 넣는다.

## 사용량

- 시작: Codex 주간(window 10080분) 91% 사용, 9% 남음, 2026-11-04 15:35 KST 초기화(링크 5 X1 eval rollout 기준. `~/.codex/sessions`의 최신 rollout에는 30일 창만 있다). 크레딧 잔액 있음. Claude 7일은 링크 5 중간 82%(2026-11-04 13:59 KST 초기화).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1 | `eval/lib/socket.ts`(+테스트), 새 `eval/scenarios/O3/**`·`O3b/**` | 없음 | Claude Sonnet high — 기존 판정을 재사용하는 시나리오 작업이지만 오탐 방지 판정이 있다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios O3,O3b` | 대기 |
| G | T3 | `cli/internal/cli/skill.md`, `skill_test.go` | 없음(통합은 B의 기준선 뒤) | Claude Opus high — 29 B 예산 안에서 에이전트 행동을 바꾸는 문구다. 틀리면 기존 O1·O2·D12가 흔들린다 | `go test ./...`, `go vet ./...` | 대기 |
| B | T2, 뒤에 T5 | `docs/USABILITY-EVAL.md` | A 통합(T2), G 통합과 T4(T5) | Claude Sonnet high — 실제 eval 실행과 기록. 판단은 실패 분류 정도다 | 라운드 기록 | 대기 |
| RA | A 리뷰 | 보고만 | A | Codex gpt-6-astra medium — 독립 리뷰(사용자 지시) | 보고 | 대기 |
| RG | G 리뷰 | 보고만 | G | Codex gpt-6-astra medium — 독립 리뷰(사용자 지시) | 보고 | 대기 |
| 지휘자 | T4, Z1 | 통합, 문서 승격 | 모든 배치 | — | `verify.mjs --eval`, Z1 grep | 대기 |

겹침: A와 G는 파일이 겹치지 않아 병렬이다. B는 `docs/USABILITY-EVAL.md`만 쓴다. 순서: A·G 병렬 → A 통합 → B(T2) → G 통합 → T4 → B(T5) → Z1.

tasks 항목과 배치: T1→A, T2→B, T3→G, T4→지휘자, T5→B, Z1→지휘자. 주인 없는 항목은 없다.

## 진행

- A(T1) 완료: 작업자 커밋 29b21977·3ea098dc를 feat에 b04006b9·88b08b90으로 cherry-pick했다(리뷰 전 선통합). 브랜치 `setup-via-onboarding-a`로 남겼다. gate: eval 단위 267/267, self-test O3·O3b PASS(작업자 보고).
- RA(Codex gpt-6-astra medium, `launch.effective` 확인)와 B(T2 기준선, Claude Sonnet high)를 띄웠다. B는 G가 통합되기 전의 feat에서 시작했다.
- RA 결과: 🔴 0, 🟡 1(`noDoanInit`이 `env …`·`/usr/bin/env …`로 감싼 init을 놓친다. select 뒤 init은 기존 config 때문에 파일을 쓰지 않아 `repo_untouched`도 못 잡는다), 🟢 1(O3b 테스트 제목). 보고서 `.scratch/orch/review-RA.md`. A에 수정 1회를 보냈다. 고치는 곳은 `O3/setup-checks.ts` 안으로 정했다(지휘자 판단: 공용 파서 `eval/lib/transcript.ts`를 바꾸면 다른 시나리오의 기록 라운드와 비교가 흔들린다). B에는 라운드가 끝난 뒤 env로 감싼 init이 있었는지 transcript에서 확인해 적으라고 보냈다.
- G(T3) 완료: 커밋 72c82427, 브랜치 `setup-via-onboarding-g`로 남겼다. `--json`+안내 21,599 / 21,600 B(1 B 남음), 일반 출력+안내 20,924 B. `go test ./...`·`go vet ./...` 통과(작업자 보고). 기준선이 끝날 때까지 feat에 넣지 않는다. RG(Codex gpt-6-astra medium)를 띄웠다.
- A 수정 1회 완료: 커밋 8f72756a를 feat에 1d5d3546으로 넣었다. `noDoanInit`이 `env`·절대 경로 `env`와 그 `NAME=value`·`-i`·`-u NAME`·`--`를 벗긴다(`O3/setup-checks.ts` 안). 지휘자가 diff를 직접 확인했다(작은 수정이라 Codex 재리뷰는 하지 않았다). eval 단위 267/267, self-test PASS(작업자 보고). A 작업자를 놓고 worktree를 지웠다. 브랜치 `setup-via-onboarding-a`는 8f72756a로 남겼다.
- RG 결과: 🔴 0, 🟡 1(첫 문단의 init 폴백이 저장소 세팅이 아닌 onboarding에도 걸려 step 1과 겹친다), 🟢 2(`--repo` 제약 문장이 약해짐, 예산 1 B). 보고서 `.scratch/orch/review-RG.md`. G에 수정 1회를 보냈다. RG 작업자를 놓고 worktree를 지웠다.
- B(T2) 완료: `o3-baseline`(O3·O3b × 3, 두 에이전트, judge 모두 실행). O3는 6/6 pass, O3b는 0/6이다. 여섯 실행 모두 `completed: true`를 받고도 `complete`를 불렀다(U-023, layer guide). init을 고른 실행은 없고, 모두 먼저 `doan skill`을 읽었으며 작업 공간의 `doan`을 썼다. env로 감싼 init도 없었다. runner exit 0, real-state 그대로(Keychain 포함). 커밋 754169f3를 feat에 1bb01457로 넣었고 브랜치 `setup-via-onboarding-b1`로 남겼다.
- 지휘자 판단(design 'PoC 의존'): 기준선이 O3b에서 실패하므로 T3을 줄이지 않고 G의 문구 그대로 간다.
- 사용량: B의 마지막 Codex rollout 기준 Codex 주간 93% 사용(7% 남음, 2026-11-04 15:35 KST 초기화).

