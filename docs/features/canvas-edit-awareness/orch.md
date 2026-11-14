# canvas-edit-awareness — orch

- 원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)
- 체인: [chain-261114-2](../chain-261114-2/chain.md) 링크 3. 링크 2(sidebar-canvas-conversations)와 병렬로 돌고, 병합은 링크 2 → 3 순서다.
- 시작 해시: `ef2bff835`(develop, 링크 1 #199 병합 뒤)
- 통합 브랜치: `feat/canvas-edit-awareness`(리드가 만듦)
- 컨덕터: Claude(Opus). 워커는 `--worktree new-child --base-branch feat/canvas-edit-awareness`로 띄운다.

## 모델 경계

- 사용자가 2026-11-14 이 체인의 링크 모두에 Codex 워커를 허가했다(체인 '상시 권한').
- Codex 남은 사용량(시작 시점, 2026-11-15 03:17): 주간(`window_minutes: 10080`) 44% 사용, 11-19 18:16 초기화. 이 링크에서 쓰는 범위: 기계적인 배치 S(Sol), 독립 리뷰 일부(Astra). 구현 배치 M·G·E는 Claude다.

## 결정 기록

- 컨덕터 판단 — tasks 1(인용 맞추기)은 컨덕터가 했다. `git grep` 여섯 개가 모두 찾혔고, 달라진 것은 `liveTurns()`가 `service.ts:656`, `conversationWork(request)`가 `index.ts:982`인 점뿐이다. `LiveTurn`은 아직 `{root, turnId, running}`이고 `liveTurns()`는 `store.list()`로 메타데이터를 읽는다. design.md를 고쳤다.
- 컨덕터 판단 — 가이드 예산: 지금 develop의 `doan skill --json`은 21,418 B(예산 21,600 B, 남은 182 B)다. design의 줄일 곳은 그대로 쓴다.
- 컨덕터 판단 — 스키마를 배치 S로 먼저 통합한다. CLI의 `readWorkResponse`(go:embed 스키마)와 eval fake 앱의 답 검사가 모두 이 스키마에 기대기 때문이다.
- 컨덕터 판단 — tasks 5(`/runtime-test`), 6(`/agent-eval`), 8(승격), 9(`/verify`)는 통합 HEAD에서 컨덕터가 한다. W9·W10 실패의 수정은 G(가이드) 또는 E(eval) 워커에게 보낸다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| S | tasks 2·3의 형식 부분: `response.others`, `$defs`(note·frame·provider), fixture, `types.ts` `WorkResponse.others?` | `schema/app-socket.v3.schema.json`, `schema/fixtures/app-socket-v3/response/**`, `app/src/formats/types.ts`, 스키마·fixture 테스트 | — | Codex Sol medium — 스키마와 fixture는 design에 모양이 다 적혀 있어 기계적이다 | `go test ./...`, `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| M | tasks 2·3의 main: `workOthers.ts`(`othersOnCanvas`, `WORK_OTHERS_MAX`), `LiveTurn` 확장, `liveTurns()`, `runtime.ts` 답 배선, `index.ts` | `app/src/main/workOthers.ts`·`.test.ts`, `conversationWork.ts`, `conversation/service.ts`(`liveTurns`만), `runtime.ts`, `runtime.work.test.ts`, `index.ts` | S | Claude Opus high — 신원 비교(루트+경로, 자신 빼기, 다른 턴), 파일별 만료가 틀리면 다른 세션을 놓치거나 자신을 보인다 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 대기 |
| G | tasks 2·3의 CLI·가이드: `readWorkResponse`, `work.go` 결과, `skill.md` 규칙 D·설명·예산 줄이기 | `cli/internal/cli/work.go`, `work_rules.go`, `work_test.go`, `skill.md`, `skill_test.go` | S | Claude Opus high — 가이드 문구가 W9·W10 결과를 정하고 예산 21,600 B 안에서 줄여야 한다 | `go test ./...`, `go vet ./...`, `TestSkillGuideFitsToolOutputCap` | 대기 |
| E | tasks 2의 eval 배선 + tasks 4: 키 `workOthers`, fake 앱 옵션, `workspace.ts`, 시나리오 W9·W10과 fixture | `eval/lib/scenario.ts`·`.test.ts`, `eval/lib/socket.ts`·`.test.ts`, `eval/lib/workspace.ts`, `eval/scenarios/W9/**`, `eval/scenarios/W10/**` | S | Claude Sonnet high — 기존 시나리오 틀을 따르지만 checks가 '묻기'를 바르게 가려야 한다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W9,W10` | 대기 |
| R-* | tasks 7: 배치마다 독립 `/code-review`, 마지막 통합 리뷰 | 보고만 | 각 배치 | M·G 리뷰 Codex Astra medium(다른 모델 계열의 시선), S·E 리뷰 Claude Sonnet medium, 통합 리뷰 Codex Astra medium | 보고서 🔴 0 | 대기 |
| 컨덕터 | tasks 1, 5, 6, 8, 9 | `docs/**`, `.scratch/**` | 통합 | — | tasks 각 항목의 검증 | 1 끝 |

## 파일 겹침과 순서

- S를 먼저 통합한다. 그 뒤 M·G·E는 파일이 겹치지 않아 병렬로 돈다(`types.ts`는 S만 고친다).
- 링크 2의 파일(렌더러, `uiState.ts`, `App.tsx` 등)과 겹치지 않는다. 링크 4의 파일(렌더러)과도 겹치지 않는다.

## 기록

- (리뷰 결과, 통합 해시, runtime-test·agent-eval 증거를 여기에 적는다)
