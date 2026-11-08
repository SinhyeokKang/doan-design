# config-error-source — orch

- 원천: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261109](../chain-261109/chain.md) 링크 1. 시작 점검과 상시 권한은 체인 파일을 따른다.
- 시작 hash: `6ec7f924`
- 통합 branch: `feat/config-error-source`(lead가 develop에서 만들었다). PR은 develop으로 열고 병합은 lead가 한다.

## 결정 기록

- 남은 사람 결정은 없다(체인 시작 점검 1, design §13 결정 1–7).
- T0 초안은 사람의 앱 확인 대신 독립 reviewer(초안을 그리지 않은 subagent)가 feature 문서와 기존 첫 실행 장면을 기준으로 확인하고, 결과를 PR 본문에 적는다(체인 시작 점검 2).
- 모델 경계: 사용자가 이 체인에서 Codex worker를 허가했다. 링크 시작 때 Codex 주간 사용량은 81%였다(`$CODEX_HOME` 최신 rollout의 `window_minutes: 10080`). 그래서 구현 batch는 모두 Claude가 맡고, Codex(`gpt-6-astra` medium)는 GO와 AP의 독립 리뷰에만 쓴다. conductor 재량 — memory 'worker-model-mix'(구현은 Claude, Codex는 리뷰 위주)와 남은 사용량.
- T1(형식)은 Go와 TS가 같은 fixture를 읽고 `envelope.go`를 T2와 함께 고치므로 GO batch에 묶는다. AP는 GO가 통합된 뒤 시작한다. conductor 재량 — 파일 겹침.
- T6 실제 앱 확인과 T7 `/agent-eval`은 별도 worker가 통합 HEAD에서 돌린다. 둘 다 GUI나 실제 agent를 쓰므로 겹치지 않게 T6 뒤에 T7을 돌린다. conductor 재량.
- T8 승격은 conductor가 문서마다 commit한다.

## Batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| DR | T0 초안 | `.doan/canvases/`의 첫 실행 초안(또는 새 초안 파일), 필요하면 `docs/DESIGN.md`의 새 token 줄 | 없음 | Claude Opus medium — 기존 첫 실행 장면의 규약을 따라야 하는 판단, 결과가 작다 | `doan check --json` 오류 0, `doan ls --json`, 독립 reviewer | 대기 |
| GO | T1, T2 | `schema/`, `schema/fixtures/`, `cli/`, `app/src/formats/types.ts` | 없음 | Claude Opus medium — `Find`의 다섯 갈래와 부모 탐색 경계, 권한 테스트. 범위가 명확하다 | `go test ./...`, `go vet ./...`, `npm --prefix app test` | 대기 |
| GO-R | GO 리뷰 | 없음(보고만) | GO | Codex `gpt-6-astra` medium — 다른 family의 독립 리뷰 | `/code-review` 보고 | 대기 |
| AP | T3, T4, T5 | `app/src/main/`, `app/src/renderer/`(T5의 `Onboarding.tsx`와 `kind: "error"` 테스트 fixture) | GO 통합, T5는 DR 리뷰 통과 | Claude Opus high — 상태 분류가 add·locate·첫 실행·reveal에 퍼지고, 소켓 답과 창 IPC의 `detail` 분리가 틀리면 CLI가 답을 거절한다 | `npm --prefix app test`, typecheck, lint, T4 grep, `/verify` | 대기 |
| AP-R | AP 리뷰 | 없음(보고만) | AP | Codex `gpt-6-astra` medium — 다른 family의 독립 리뷰 | `/code-review` 보고 | 대기 |
| RT | T6 | 없음(`.scratch/runtime-test/config-error-source/`) | AP 통합 | Claude Opus medium — 격리 앱 probe, 관찰 판단 | 관찰과 스크린샷, 잠긴 화면이면 미검증 기록 | 대기 |
| EV | T7 | `docs/USABILITY-EVAL.md` | RT | Claude Opus medium — eval 실행과 결과 판정 | `node eval/run.ts` round, 기록 | 대기 |
| — | T8 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/DESIGN.md`, feature 디렉터리 삭제 | 전부 | conductor | 고친 절을 코드와 대조, T4 grep, `/verify` | 대기 |

## 겹침과 순서

- DR과 GO는 파일이 겹치지 않아 함께 돈다.
- AP는 GO의 `types.ts`·fixture에 기대므로 GO 통합 뒤 시작한다. T5는 DR 리뷰가 통과한 뒤 AP worker에게 새 Task로 보낸다.
- RT와 EV는 통합 HEAD에서 차례로 돈다.

## 리뷰와 통합 기록

(진행하며 적는다)
