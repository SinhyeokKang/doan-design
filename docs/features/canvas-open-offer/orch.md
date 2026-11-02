# canvas-open-offer — orch

출처: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 3.

- 시작 해시: `d536e531`(origin/main)
- 통합 브랜치: `feat/canvas-open-offer`
- 지휘자: Claude Code 세션 c935fb51, worktree `canvas-open-offer-orch`
- 권한(체인 파일): 이 링크의 PR을 main에 병합한다. Codex 작업자를 섞어 쓸 수 있다.

## 결정 기록

- 실행 경로: tasks.md는 `/ship`이라고 적었지만, 체인 링크이므로 `/orchestrate`로 나눈다(링크 3 브리프). 지휘자 판단: Go CLI, 앱 main·renderer, 가이드·설정·eval의 파일이 겹치지 않아 병렬로 돌릴 수 있다.
- 커밋 경계: tasks.md는 T2와 T3를 한 커밋으로 묶었지만 배치가 다르므로 Go(T2)와 TS(T3)를 따로 커밋한다. T7·T8도 같은 배치 안에서 tasks.md의 경계를 따른다. 지휘자 판단: 각 커밋이 테스트를 통과한다는 규칙은 그대로 지킨다.
- Codex 사용: 지휘자 판단으로 이 링크에서는 Codex 작업자를 쓰지 않는다. 근거: 링크 1 끝에 Codex 상태줄의 주간 남은 양이 12%였고 링크 2의 `/agent-eval`이 같은 한도를 더 썼다. 지금 남은 양을 정확히 읽을 수단이 없다(대시보드는 18%로 멈춰 있다). T10 `/agent-eval`이 실제 Codex를 반드시 돌리므로 그 몫을 남긴다. 리뷰는 Claude 서브에이전트(Sonnet, 판단이 무거운 diff는 Opus)로 한다.
- 시작 시 사용량: Claude 7일 78%(2026-11-04 13:59 KST 초기화). Opus는 앱 main↔renderer 배치(B)에만 쓴다.
- T11 문서 승격: 지휘자 판단. PRODUCT·ARCHITECTURE·BACKLOG·README는 지휘자가 통합 뒤에 쓴다. `docs/USABILITY-EVAL.md`는 T10을 맡은 배치 D가 쓴다. 링크 1·2와 같다.
- POSTMORTEM 2026-11-03(링크 2): renderer가 main 이벤트의 선택 필드에 기대면 main 테스트가 그 필드를 보내는지 고정한다. B의 v4 요청 IPC(요청 id, 대상, frame)에 적용한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T2, T4 | `schema/app-socket.v4.schema.json`·`schema/fixtures/app-socket-v4/`·`schema/embed.go`, `cli/internal/formats/`, `app/src/formats/validate.ts`·`types.ts`·`validate.test.ts`, `cli/internal/cli/`의 `open.go`·`open_rules.go`·`open_test.go`·`onboarding.go`·`onboarding_test.go`·`run.go`·`run_test.go`·`args.go`·`args_test.go` | 없음 | Claude Sonnet high: 정해진 계약을 Go로 옮기는 일이 대부분이다. bootstrap 분리는 기존 테스트가 지키고, 판단이 무거운 지점은 리뷰에서 가른다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`(T1) | 통합, 리뷰 중 |
| B | T3, T5 | `app/src/main/deepLinks.ts`와 테스트, `app/src/main/runtime.ts`·새 `runtime.open.test.ts`, `app/src/main/index.ts`, `app/src/preload/`, `app/src/renderer/App.tsx`와 새 renderer 판정 helper·각 테스트 | T3 없음. T5는 A의 T1 커밋 통합 뒤 | Claude Opus high: main↔renderer 요청-응답, 요청 id, timeout, 준비 판정이 얽히고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, typecheck | 통합, 리뷰 중 |
| C | T7, T8, T9 | `app/src/main/agentSetup/`, `app/src/main/conversation/prompt.ts`와 테스트, `cli/internal/cli/skill.md`·`skill_test.go`, `eval/` | T7·T8 없음. T9의 W4 self-test는 A 통합 뒤 | Claude Sonnet high: 가이드 문구를 예산 안에서 쓰고 eval 시나리오를 만든다. 사실은 spec·design에 있다 | `go test ./...`, `npm --prefix app test`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 진행 |
| RA·RB·RC | 각 배치 리뷰 | 읽기만 | 각 배치 | Claude 서브에이전트: A·C는 Sonnet, B는 Opus | `/code-review` 보고서 | 대기 |
| D | T6, T10 | `.scratch/`, `docs/USABILITY-EVAL.md`, eval 결과로 고칠 가이드 문구(그때 C는 끝나 있다) | A·B·C 통합 | Claude Sonnet high: 격리 probe와 정해진 eval 명령을 돌리고 기록한다 | probe 완료 표식·exit 0, real-state 전후 같음, eval 라운드 기록 | 대기 |
| 지휘자 | T11 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `README.md`, 이 디렉터리 | D | — | `node .agents/skills/verify/scripts/verify.mjs --eval`, 디렉터리 없음 | 대기 |

리뷰 지적의 `/refactor`는 그 배치의 작업자가 한다.

## 파일 겹침과 순서

- A·B·C는 파일이 겹치지 않아 병렬로 돈다. `cli/internal/cli/`는 A와 C가 함께 쓰지만 파일이 다르다(A는 명령 코드, C는 `skill.md`·`skill_test.go`).
- A는 T1을 먼저 커밋한다. 지휘자가 그 커밋을 feat에 통합하면 B는 T5를, C는 T9의 가짜 소켓 v4를 그 위로 rebase해 이어 간다.
- C의 W4 self-test는 실제 `doan open`이 필요하므로 A 통합 뒤에 마친다.
- D는 A·B·C 통합 뒤에 시작한다. 실제 앱 probe와 패키지 빌드는 D만 한다.

## 기록

- 2026-11-03 Run `run_1457083b873f`. 셋 다 9cb17f46에서 시작했다.
  - A: task `task_d49957c7e72b`, dispatch `ctx_4182d3932f72`, worktree `canvas-open-offer-a`(브랜치 `SinhyeokKang/feat-canvas-open-offer`), launch.effective claude sonnet high.
  - B: task `task_a314f4d4fa44`, dispatch `ctx_d31531f856f6`, worktree `canvas-open-offer-b`(브랜치 `SinhyeokKang/feat-canvas-open-offer-2`), launch.effective claude opus high.
  - C: task `task_7766051f7a77`, dispatch `ctx_4d9116de62c1`, worktree `canvas-open-offer-c`(브랜치 `SinhyeokKang/feat-canvas-open-offer-3`), launch.effective claude sonnet high.
- A의 T1 커밋 8fbcd5a1을 2fb04f86으로 먼저 통합하고 B·C에 rebase를 알렸다.
- A 완료: 7a00b57a·6a260575를 602c9849·dfd6a832로 통합했다(작업자 보고: `verify.mjs` PASS, 마지막 한 줄 수정 뒤에는 `go test`·`go vet`만 다시 돌림. 통합 뒤 지휘자가 `go test ./cli/...`·`go vet ./...`을 다시 돌려 통과). 수정 회차에 쓰려고 작업자를 retain했다. C에 CLI가 들어왔다고 알렸다.
  - handoff의 차이: `not_ready`는 v4 응답의 오류 코드로 두었다. `busy`의 이유는 별도 필드 없이 앱의 message로 넘긴다. `args.go`는 바뀌지 않았다(`--frame`은 `run.go`의 flag). 사람용 한 줄 출력은 새 `Outcome.Text`다. 판정은 RA 결과를 보고 적는다.
- RA(A 리뷰, Claude Sonnet 서브에이전트)를 시작했다.
- B 완료: 060b7009·41cd6fd4를 3d79d73f·57722d4b로 통합했다(작업자 보고: `verify.mjs` PASS, 앱 테스트 5919. 통합 뒤 지휘자가 typecheck와 `npm --prefix app test` 5919 통과를 다시 확인). 수정 회차에 쓰려고 작업자를 retain했다. RB(Claude Opus 서브에이전트)를 시작했다.
  - 지휘자 판단(handoff 차이 1): first run을 다이얼로그 닫기보다 먼저 본다. 링크도 같다. 링크의 결과(이동하지 않음)는 그대로이고, 어차피 거절될 이동 때문에 wizard 안의 다이얼로그를 닫지 않게 될 뿐이다. 승격 때 ARCHITECTURE §7 'Deep links'에 적는다. RB가 반대하면 다시 본다.
  - 지휘자 판단(차이 3): `busy`의 이유는 앱이 쓴 message를 CLI가 `withoutSecrets`를 거쳐 보인다(A와 맞음). `not_ready`·`canvas_not_found`의 앱 문구는 CLI가 쓰지 않는다.
  - 지휘자 판단(차이 4): 준비 판정은 `openLinksReady()`(모든 루트) 그대로 둔다. spec 완료 조건 3의 "첫 프로젝트 읽기"를 포함하고, CLI가 15초 안에서 다시 시도한다.
  - 시간: 앱 renderer timeout 1500 ms, 앱 소켓 `LINE_WAIT_MS` 2000 ms, CLI 시도마다 2 s(`activeTimeout`). RB가 경계를 확인한다.
  - index.ts의 Electron 연결(요청 전송, 답 handler, 숨긴 앱 앞으로)은 단위 테스트가 없다. T6 probe가 맡는다.
- RA(A 리뷰, Claude Sonnet 서브에이전트): 🔴 0, 🟡 1, ⚪ 4. 🟡는 `not_ready`를 받은 뒤 다음 시도가 느리면(앱은 떠 있음) cap까지 다시 시도하지 않고 바로 `app_not_running`으로 끝나는 것이다(design 표는 `busy`). handoff 차이는 모두 수락했다. `onboarding start` 동작은 그대로임을 추적으로 확인했다. 보고서: `.scratch/orch/review-RA.md`.
  - 지휘자 판단: 🟡와 ⚪ 1(앱의 frame 결과가 요청과 맞지 않으면 `internal_error`), ⚪ 2(디렉터리 symlink 행)를 A 수정 회차로 보낸다. ⚪ 3은 B의 busy 문구가 고정 문자열이라 그대로 두고, ⚪ 4는 해가 없어 그대로 둔다.
- A 수정 회차 1: task `task_4baf04928122`, dispatch `ctx_4c2e230bd977`, 같은 터미널과 worktree. 시작을 확인했다.
