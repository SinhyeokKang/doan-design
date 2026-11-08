# config-error-source — orch

- 원천: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261109](../chain-261109/chain.md) 링크 1. 시작 점검과 상시 권한은 체인 파일을 따른다.
- 시작 hash: `6ec7f924`
- 통합 branch: `feat/config-error-source`(lead가 develop에서 만들었다). PR은 develop으로 열고 병합은 lead가 한다.

## 결정 기록

- 남은 사람 결정은 없다(체인 시작 점검 1, design §13 결정 1–7).
- T0 초안은 사람의 앱 확인 대신 독립 reviewer(초안을 그리지 않은 subagent)가 feature 문서와 기존 첫 실행 장면을 기준으로 확인하고, conductor는 reviewer가 찾은 것을 고치게 한다(체인 시작 점검 2).
- 사용자 지시(lead가 전함): T0 초안은 `doan-onboarding.html`을 고치지 않고 새 canvas `.doan/canvases/config-error-source.html`에 그린다. 기존 첫 실행 Project 장면의 모양을 쓰고, 비교용으로 기존 'Configuration unreadable'과 'Folder unavailable' 상태를 옆에 둔다. tasks T0의 "`doan-onboarding.html`의 'Project · Configuration unreadable' 옆" 문장을 대신한다. 사용자는 구현 뒤에 확인하므로 구현은 기다리지 않는다.
- 사용자 지시(lead가 전함): PR 본문에 새 canvas 경로, frame id, `doan open <path> --frame <id>` 명령, reviewer 판정, 구현된 상태의 격리 실제 앱 스크린샷(잠긴 화면이면 미검증)을 적는다.
- 모델 경계: 사용자가 이 체인에서 Codex worker를 허가했다. 링크 시작 때 Codex 주간 사용량은 81%였다(`$CODEX_HOME` 최신 rollout의 `window_minutes: 10080`). 그래서 구현 batch는 모두 Claude가 맡고, Codex(`gpt-6-astra` medium)는 GO와 AP의 독립 리뷰에만 쓴다. conductor 재량 — memory 'worker-model-mix'(구현은 Claude, Codex는 리뷰 위주)와 남은 사용량.
- T1(형식)은 Go와 TS가 같은 fixture를 읽고 `envelope.go`를 T2와 함께 고치므로 GO batch에 묶는다. AP는 GO가 통합된 뒤 시작한다. conductor 재량 — 파일 겹침.
- T6 실제 앱 확인과 T7 `/agent-eval`은 별도 worker가 통합 HEAD에서 돌린다. 둘 다 GUI나 실제 agent를 쓰므로 겹치지 않게 T6 뒤에 T7을 돌린다. conductor 재량.
- T8 승격은 conductor가 문서마다 commit한다.

## Batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| DR | T0 초안 | 새 `.doan/canvases/config-error-source.html`, 필요하면 `docs/DESIGN.md`의 새 token 줄 | 없음 | Claude Opus medium — 기존 첫 실행 장면의 규약을 따라야 하는 판단, 결과가 작다 | `doan check --json` 오류 0, `doan ls --json`, 독립 reviewer | 통합 `f8a47220`, `b126c6fc` |
| GO | T1, T2 | `schema/`, `schema/fixtures/`, `cli/`, `app/src/formats/types.ts` | 없음 | Claude Opus medium — `Find`의 다섯 갈래와 부모 탐색 경계, 권한 테스트. 범위가 명확하다 | `go test ./...`, `go vet ./...`, `npm --prefix app test` | 통합 `85f20b4b`, `13305767` |
| GO-R | GO 리뷰 | 없음(보고만) | GO | Codex `gpt-6-astra` medium — 다른 family의 독립 리뷰 | `/code-review` 보고 | 진행 |
| AP | T3, T4, T5 | `app/src/main/`, `app/src/renderer/`(T5의 `Onboarding.tsx`와 `kind: "error"` 테스트 fixture) | GO 통합, T5는 DR 리뷰 통과 | Claude Opus high — 상태 분류가 add·locate·첫 실행·reveal에 퍼지고, 소켓 답과 창 IPC의 `detail` 분리가 틀리면 CLI가 답을 거절한다 | `npm --prefix app test`, typecheck, lint, T4 grep, `/verify` | 진행 |
| AP-R | AP 리뷰 | 없음(보고만) | AP | Codex `gpt-6-astra` medium — 다른 family의 독립 리뷰 | `/code-review` 보고 | 대기 |
| RT | T6 | 없음(`.scratch/runtime-test/config-error-source/`) | AP 통합 | Claude Opus medium — 격리 앱 probe, 관찰 판단 | 관찰과 스크린샷, 잠긴 화면이면 미검증 기록 | 대기 |
| EV | T7 | `docs/USABILITY-EVAL.md` | RT | Claude Opus medium — eval 실행과 결과 판정 | `node eval/run.ts` round, 기록 | 대기 |
| — | T8 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/DESIGN.md`, feature 디렉터리 삭제 | 전부 | conductor | 고친 절을 코드와 대조, T4 grep, `/verify` | 대기 |

## 겹침과 순서

- DR과 GO는 파일이 겹치지 않아 함께 돈다.
- AP는 GO의 `types.ts`·fixture에 기대므로 GO 통합 뒤 시작한다. T5는 DR 리뷰가 통과한 뒤 AP worker에게 새 Task로 보낸다.
- RT와 EV는 통합 HEAD에서 차례로 돈다.

## 리뷰와 통합 기록

- DR: 초안 `.doan/canvases/config-error-source.html`. 1차 독립 reviewer(Claude subagent) 판정은 PASS with minor notes였다. 🟡 두 건: 설정된 폴더의 흔한 경로는 setup 패널이 아니라 candidates 화면이고(`projectStep.ts` 270행, 341행, `Onboarding.tsx` 537–543행, conductor가 코드로 확인했다), detail이 2줄뿐이었다. DR worker가 고쳤다(`946b7faa`): 주 frame `project-unreadable`은 candidates 화면, 보조 frame `project-unreadable-setup`은 init 경로, `config_invalid` 비교 tile도 candidates 화면, detail은 3줄. 2차 판정은 PASS였다. conductor가 렌더 스크린샷을 보았다. `doan check`는 이 canvas에 지적이 없고, 기존 error 1건(`select-inspect.html`)과 `mock.css` warning 40건만 있다. 근거는 `.scratch/draft-review/`에 있다. DR worktree는 지웠고 branch는 남겼다.
- GO: `go test ./...`, `go vet ./...`, `npm --prefix app test`(9694 통과)가 worker 보고다. 리뷰(GO-R)와 AP를 함께 돌린다. GO-R 수정은 `cli/`·`schema/` 안에 머물러 AP 파일과 겹치지 않는다. conductor 재량.
- AP: DR 리뷰가 먼저 통과해서 T5를 처음부터 AP에 넣었다. conductor 재량 — 새 Task 한 번을 줄인다.
