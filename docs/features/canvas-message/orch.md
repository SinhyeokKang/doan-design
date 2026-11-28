# canvas-message — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261128-1](../chain-261128-1/chain.md) 링크 1. 상시 권한과 진행 규칙은 chain 파일과 chain 스킬 §3 'Conductor'를 따른다.
- 시작 hash: `0ef551850` (origin/develop, canvas-chip PR #428 머지)
- 통합 branch: `feat/canvas-message` (lead가 만들었다). PR은 develop으로 열고 머지는 lead가 한다.
- 시작 점검: `git ls-tree origin/develop docs/features/check-scope docs/features/thread-polish docs/features/canvas-chip` 출력이 비어 있다(2026-11-28 확인).

## 결정 기록

- 새 eval 시나리오 번호는 R14–R17이다(tasks 9b의 R13–R16). — 컨덕터 판단: canvas-chip이 R13(캔버스 앵커 Home 대화)을 이미 썼다. tasks 9c의 "R13–R16"도 R14–R17로 읽는다.
- `turnPrompt`로 다시 만드는 기존 eval 프롬프트 fixture에 R13을 더한다(tasks 5의 R8d, R9b, R10, R11, R12와 함께). — 컨덕터 판단: R13도 `handoff: true`로 `turnPrompt`를 부른다.
- 받는 대화가 사용량 한도 예약 상태(`scheduling(id)`)일 때의 `send`: 턴을 돌리지 않고 실패한 턴도 쓰지 않는다. 메시지는 받는 대화의 큐에 에이전트 행으로 들어가고(흐린 상태), 보낸 쪽 카드는 Queued in이다. 리셋에 맞춰 예약하지 않는다. — 컨덕터 판단(B 질문): design '앱 main'의 "한도 실패로 끝낸다"와 "큐 행으로 남는다"가 충돌해, spec '큐에 든 에이전트 메시지'(한도 실패 뒤 흐린 행)와 Out of scope 4의 한도 예외를 넓히지 않는다는 결정에 맞는 쪽을 골랐다. PRODUCT 승격 때 적는다.
- 에이전트 큐 행은 `ConversationSummary.agentQueue`로 렌더러에 간다(목록 변경마다 전달, 흐린 상태 포함, ×는 기존 `removeQueued`). — 컨덕터 판단(B 질문): 새 ipc 채널보다 기존 요약 전달에 얹는 쪽이 단순하다.
- eval 판정(D 리뷰의 제품 질문): R14·R15에서 틀린 명령은 fail이다. 새 캔버스 시나리오(R10–R12)의 `doan send`는 틀린 명령으로 개수 검사 하나만 실패한다. R17은 아무것도 보내지 않아야 pass이고, 요청받은 한 번 전달 경로는 시나리오를 더하지 않고 단위 테스트로 본다. `no_handoff`는 id를 그대로 두고 `send`도 센다. — 컨덕터 판단: spec의 "사람이 한 말대로 고른다", 새 캔버스에는 `handoff`를 쓰는 가이드, 완료 조건의 범위.
- Codex 대화의 `doan send`는 승인 규칙(`doan-handoff.rules`)에 넣지 않고 대화의 permission mode를 따른다. — 사용자 결정(A 리뷰의 질문). PRODUCT §5 'Resume and permissions' 승격 때 적는다.
- CLI의 `chain_one`·`chain_limit` 안내는 spec 카드 문구에 맞추고, 이 턴에 다시 보내지 말라는 단계를 붙인다. — 컨덕터 판단(A 리뷰).
- `chain_one`·`chain_limit`도 보낸 쪽 기록에 거절로 남겨 카드가 보이게 한다(소켓 거절은 그대로). — 컨덕터 판단: spec 완료 조건이 세 연쇄 거절 모두 카드 문구를 요구하는데, B는 두 코드를 소켓 거절로만 냈다.
- 흐린 에이전트 행은 사람 메시지로 시작한 턴(0단계)이 done으로 끝난 뒤에만 나간다. 대화 큐에 에이전트 행이 있으면 새 `send`도 큐 끝에 들어가 앞지르지 않는다. — 컨덕터 판단(B 리뷰 🟡 3): spec '큐에 든 에이전트 메시지'의 문장 그대로다.
- 대화 없는 캔버스로 거의 동시에 온 `send` 둘은 새 대화 둘을 시작할 수 있다. 한계로 PRODUCT에 적는다. — 컨덕터 판단: 겹치는 창이 시작 준비 몇 초다.
- 판정과 전달 사이에 대상 대화가 지워지면 `not_found`로 거절하고, 카드 문구는 C가 정한다. 삭제 대화상자는 에이전트 행을 세지 않는다. — 컨덕터 판단: spec "그 뒤의 운명은 추적하지 않는다".
- 받는 대화의 제목은 `sent` 기록의 target에 스냅숏으로 싣고, 렌더러는 목록의 지금 제목을 먼저 쓴다. 에이전트 큐 행은 사람 행 사이의 자리를 받아 실제 보내는 순서로 그린다. — 컨덕터 판단(C의 needs): spec이 대화가 지워진 뒤에도 `Sent to “<title>” · Conversation deleted`를 요구하고, 드래프트 queue 2번 타일이 섞인 순서를 그린다.
- C 리뷰의 제품 질문: 지워진 대상으로의 `send` 거절은 "Didn’t send. That conversation was deleted."(clarify preset으로 다듬음), 다른 `send` 거절은 provider를 말하지 않는 중립 한 줄, 기존 캔버스 handoff는 "new canvas"로 세지 않는다, Overview 보낸 쪽 Open은 `in the Overview`, 흐린 에이전트 행도 docked buddy의 큐 표시에 센다. — 컨덕터 판단: 드래프트 문구 결과 spec 범위 안의 문구·표시 결정이다.
- 흐린 에이전트 행이 사람의 다음 done 턴까지 남는 드문 경계 셋(flush 경로의 exit 대기 시간 초과, exit 대기 중 새 send, `draft` 결과의 give-back)은 고치지 않고 한계로 적는다. — 컨덕터 판단(B 재리뷰): 시간 초과·삭제·Stop이 겹쳐야 하고 행이 사라지지는 않는다.
- `/agent-eval` 실제 회차는 real HOME의 지금 로그인으로 돌린다(사용자 결정). 범위는 앱 turn prompt를 쓰는 R8d·R9b·R10–R17이고, eval 하네스 변경(`transcript.ts`, eval Codex 규칙, 가짜 앱)을 보는 W1·R2·X1 회차를 따로 더한다. — 사용자 결정: 필요한 시나리오만 고르되 넉넉하게 잡는다. 다른 시나리오는 이 기능이 바꾸지 않은 가이드와 stub을 쓴다.
- 모델 계열을 넘지 않는다. 워커는 모두 Claude다. — chain 파일 '상시 권한'.

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A cli-schema | 2, 3·4·5의 Go 부분(`send.go`, `send_rules.go`, `send_test.go`, `handoff*.go`의 v5 새 코드, `envelope.go`, `run.go`, `skill.md`·`skill_test.go`·가이드, `canvas_path_test.go`) | `schema/`, `cli/`, `app/src/formats/validate.ts`·`validate.test.ts`·`types.ts`(B 질문 뒤 더함) | 없음 | Sonnet high: 기존 handoff 명령과 v5 스키마를 본뜨는 일이 대부분이다. 이전 앱·이전 CLI 호환 fixture만 판단이 든다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `npm --prefix app run typecheck` | 진행 중 |
| B app-main | 3·4·5의 TS main 부분: `conversation/handoff.ts`·`queue.ts`·`drafts.ts`·`types.ts`·`service.ts`·`prompt.ts`·`ipc.ts`(필요시), `runtime.ts`(v8 분기는 지연 항목), 프로토타입 창 알림(`prototype/`, `preload/`), 기존 eval 프롬프트 fixture(`eval/lib/turn-prompt.ts`, `eval/scenarios/{R8d,R9b,R10,R11,R12,R13}/prompt.*`) | 위 파일과 그 테스트 | 없음. `runtime.ts` v8 분기는 A 통합 뒤 | Opus high: 큐·handoff 정착·재시작 merge·동시 send가 얽힌 동시성 일이고, 틀리면 drafts가 깨지거나 메시지가 사라진다 | `npm --prefix app test`, `go test ./...`, `node --test 'eval/**/*.test.ts'`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 진행 중 |
| D eval | 9a(`eval/lib/socket.ts`, `scenario.ts`, `handoff.ts`), 9b(새 시나리오 R14–R17; 각 `prompt.md`는 B 통합 뒤 지연 항목) | `eval/lib/`(`turn-prompt.ts` 제외), `eval/scenarios/R14`–`R17` | 없음. 새 `prompt.md`는 B 통합 뒤 | Sonnet high: 기존 R10–R12 시나리오를 본뜨는 일이다. 요청 하나당 한 번 세는 판정(postmortem)만 주의한다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios R14,R15,R16,R17`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 진행 중 |
| C renderer | 6 | `app/src/renderer/`(`handoffView.ts`, `threadItems.ts`, `canvasCardText.ts`, 큐 줄, `ConversationThread.tsx`, 토스트, `styles.css`)와 그 테스트 | B 통합(`types.ts`, `handoff.ts`의 새 모양) | Opus medium: 드래프트 문구·상태를 기존 부품에 맞추는 일이라 판단이 들지만 동시성은 없다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| E design-sync | 7 | `docs/design/conversation.md`, `.scratch/design-sync/canvas-message-*`, 차이를 고치는 renderer 파일 | C 통합 | Opus medium: 실제 앱 측정과 드래프트 대조 | measure 스크립트 두 개의 결과가 드래프트와 맞음 | 대기 |
| F eval-round | 9c | `docs/usability-eval/`, `docs/USABILITY-EVAL.md` | A·B·C·D 통합, `npm --prefix app run package` | Sonnet medium: 정해진 회차 실행과 기록 | R14–R17, R10–R12가 두 에이전트에서 pass, 회차 기록 | 대기 |
| 컨덕터 | 8 `/runtime-test`, 10 `/verify --eval`, 11 디렉터리 삭제와 승격 검토(승격 초안은 문서 워커 `cm-docs`, Opus high: 큰 문서 두 개를 읽고 결정 30여 개를 옮기는 일이라 컨덕터 문맥 대신 맡긴다) | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, README, `orch.md` | 모든 배치 통합 | — | tasks 8·10·11의 확인 | 대기 |

- tasks 1(드래프트)은 끝났다.
- tasks 3(`/tdd`)은 배치마다 자기 파일의 테스트로 나눈다. 각 워커가 `/deliver`의 tdd 단계에서 red를 본다.
- 리뷰: 배치마다 독립 리뷰 워커(`/code-review`, 보고만)를 둔다. B는 Opus high, A·C·D는 Sonnet high.

## 파일 겹침과 순서

- 1차 병렬: A, B, D. 겹치는 파일이 없다. A는 `schema/`·`cli/`·`app/src/formats/`, B는 `app/src/main/`과 기존 시나리오의 프롬프트, D는 `eval/lib/`와 새 시나리오.
- B의 지연 항목: `runtime.ts`의 v8 분기와 대화 토큰은 A의 v8 스키마와 `validate.ts`가 들어온 뒤 새 Task로 보낸다.
- D의 지연 항목: R14–R17의 `prompt.md`와 `prompt.test.ts`는 B의 `prompt.ts`가 들어온 뒤 새 Task로 보낸다.
- 2차: C는 B 통합 뒤 시작한다(`types.ts`의 `origin`·큐 행 모양을 쓴다).
- 3차: E(C 통합 뒤), 컨덕터의 runtime-test, F(패키지 뒤), verify, 문서 승격.
- canvas-chip의 미확인 화면(BACKLOG 'Canvas chips': 캔버스 패널의 send·큐 flush·Send now 경로)은 B가 큐 경로를 바꾸므로 컨덕터의 runtime-test에서 함께 본다. GUI probe는 lead와 메일로 맞춘다.

## 진행 기록
- 2026-11-28 Orca run `run_cde5124c4283`. 1차 병렬 시작: A `ctx_5a4af9e2d35d`(Sonnet high, worktree `cm-a-cli`), B `ctx_c291797803ee`(Opus high, `cm-b-main`), D `ctx_ee4f782308c8`(Sonnet high, `cm-d-eval`). 모두 `ea851c5c8`에서 갈라졌다.
- D 끝(`worker_done`): 커밋 `bdc59d14d`·`aae5d9878`·`6d06d719c`·`f5d848d92`. A의 v8 스키마·`doan send` 없이는 gate가 통과하지 않아 A 통합 뒤 cherry-pick한다. R14–R17 `prompt.*`는 지연. 리뷰 워커 `ctx_13212fca8c7b`(Sonnet high) 시작.
- D 리뷰(`ctx_13212fca8c7b`): 🔴 0, 🟡 2, 🟢 5. 🟡 둘과 🟢 1·3·5를 고치는 1회차를 D에 보냈다(`ctx_2d3a226c2b97`). 🟢 2·4는 둔다.
- A 끝(`worker_done`): 5커밋을 `147d4523c`..`ca193dafc`로 통합했다. `go vet ./...`, `go test ./...` 통과. `npm --prefix app run typecheck`는 `runtime.ts` `HANDOFF_MESSAGES`의 두 코드 때문에 B의 지연 항목 전까지 실패한다. 리뷰 워커 `ctx_d0460af75ab0`(Sonnet high) 시작.
  - A가 남긴 것: `app/src/brand/candidates.ts` `SUBCOMMANDS`와 Go 거울(`brand_test.go`)에 `send`가 없다. A 리뷰 수정 회차에 넣는다. 가이드(`skill.md`)는 ARCHITECTURE §7대로 handoff·send를 가르치지 않아 바꾸지 않았다(tasks 5의 `skill.md`는 변경 없음으로 끝).
- D 1회차 끝: 6커밋을 `372067696`..`f18976ea1`로 통합했다. `node --test 'eval/**/*.test.ts'`에서 1건 실패: `transcript.test.ts`의 run.go 플래그 표 읽기가 A의 `case "handoff", "send":`에서 첫 이름만 읽는다. D에 2회차로 보냈다(`ctx_acdf4b003369`). `R8d/checks.test.ts`가 전체 실행에서 한 번 65초 뒤 "Promise resolution is still pending"으로 실패했고 혼자서는 34초에 통과했다. 부하로 보고 verify에서 다시 본다.
- B 끝: 4커밋을 `582bcf0ea`..`95e36011a`로, D 2회차를 `149d4b6e7`로 통합했다. typecheck는 `runtime.ts` 한 곳만 실패(예상), `node --test 'eval/**/*.test.ts'` 553 통과.
- A 리뷰(`ctx_d0460af75ab0`): 🔴 0, 🟡 4, 🟢 6. 🟡 1은 D가 이미 고쳤다. 1회차를 A에 보냈다(`ctx_7c66ab95fba1`, brand `SUBCOMMANDS` 포함).
- B 지연 항목(runtime v8·토큰·`HANDOFF_MESSAGES`)과 연쇄 거절 기록을 B에 보냈다(`ctx_e3005a4317f8`). B 리뷰 워커 `ctx_9b30ccad5f17`(Opus high, 컨덕터 checkout에서 읽기만).
- D 지연 항목(R14–R17 `prompt.*`, `eval/lib/turn-prompt.ts` 소유 이전)을 D에 보냈다(`ctx_ca89cb794c7b`).
- C 시작: `ctx_410f3077dcae`(Opus medium, `cm-c-renderer`, `95e36011a` 기준).
- B 리뷰(`ctx_9b30ccad5f17`): 🔴 0, 🟡 3, 🟢 5. 수정 1회차 지시를 준비했고, B가 runtime Task를 끝내면 보낸다.
- 컨덕터 checkout의 `npm --prefix app test`(B 통합 시점): 3건 실패, 모두 부하 시간 초과다(`doanyRender` 2건 20초 초과, `editLines` 50 ms 성능 검사). 이 branch가 바꾸지 않은 파일이고 load average가 60–72였다. 최종 verify에서 다시 본다.
- D prompt Task 끝: `316991c39`를 통합했다. 컨덕터 checkout에서 R14–R17과 `eval/lib` 테스트 299 통과, `node eval/run.ts --self-test --scenarios R14,R15,R16,R17` PASS(exit 0). D 배치의 남은 일은 없다. R8d Electron 테스트의 부하 시간 초과는 최종 verify에서 본다.
- A 1회차 끝: 3커밋을 통합했다. `go vet ./...`, `go test ./...`, `vitest src/formats src/brand`(2232) 통과. A 배치는 남은 일이 없다.
- B runtime Task 끝: 2커밋을 통합했다(`e90b7c36b`까지). typecheck가 깨끗해졌다. 연쇄 거절 기록 모양은 `handoff.requested` + 거절 `handoff.resolved`(reason `chain_one`·`chain_limit`)이고, 턴이 도는 동안 쓰여 카드가 처음부터 거절로 보인다. B 수정 1회차를 보냈다.
- C 끝: 3커밋을 통합했다(`3a5eb6002`·`b3871697b`·`dee2b2c39`의 cherry-pick). 통합 HEAD에서 typecheck 깨끗, 관련 테스트 6파일 247 통과. C 리뷰 워커 `ctx_ff4cd598de36`(Sonnet high) 시작. C의 main 요구 둘(제목 스냅숏, 에이전트 행 자리)은 B 1회차 뒤 2회차로 보낸다.
- C 리뷰(`ctx_ff4cd598de36`): 🔴 0, 🟡 5, 🟢 8. 1회차를 C에 보냈다(`ctx_fb981c51a08b`). 🟡 5(새로 시작한 대상의 "Conversation deleted" 깜빡임 가능성)는 runtime probe 항목으로 둔다.
- B 1회차 끝: 2커밋을 통합했다. typecheck 깨끗. 흐린 행 규칙은 `armedAgents`(메모리만; 재시작 뒤에는 모두 흐림)로 구현됐다. postmortem 후보: 흐린 에이전트 행이 언제 나가는지 규칙이 없었고, exit 대기 시간 초과 busy가 쉬는 대화에 행을 남겼다. B 2회차(제목 스냅숏, 에이전트 행 자리)를 보냈다(`ctx_56dd881fb766`).
- C 1회차 끝: 2커밋을 통합했다. typecheck 깨끗. Nit 9(다른 대화의 send 알림이 기다리던 0단계 handoff 이동을 토스트로 바꿀 수 있음)는 한계로 적는다. C 2회차는 B 2회차 뒤에 보낸다.
- B 2회차 끝: 2커밋을 통합했다(`sent` target.title, `agentQueue[].after`). typecheck 깨끗. C 2회차를 보냈다.
- C 2회차 끝: 2커밋을 통합했다(제목 스냅숏 사용, 보내는 순서대로 그리는 큐). typecheck 깨끗, feat 푸시. B 재리뷰 `ctx_9900518b2700`(Opus high) 진행 중. E(design-sync)를 C 워커에 새 Task로 보냈다(`ctx_34897d12e0e6`, `cm-c-renderer`). lead에 GUI probe 시작을 메일로 알렸다.
- B 재리뷰(`ctx_9900518b2700`): 🔴 0, 🟡 1(한도 예약 중 `after`가 실제 순서와 다름), 🟢 6. 3회차를 B에 보냈다.
- 문서 승격 워커 `ctx_5eb59000c7c9`(Opus high, `cm-docs`) 시작: PRODUCT·ARCHITECTURE·BACKLOG·README. `docs/design/`은 design-sync 몫이라 제외.
- 문서 승격 끝: 5커밋(PRODUCT, ARCHITECTURE, BACKLOG, README, DIRECTORY)을 검토하고 통합했다. tasks 11의 두 grep 결과 없음. BACKLOG의 미확인 목록은 runtime probe 뒤 컨덕터가 고친다.
- 정리: D·문서 워커를 해제하고 `cm-d-eval`, `cm-docs` worktree를 지웠다(branch는 남김). handoff와 리뷰 사본은 `.scratch/canvas-message/`.
- B 3회차 끝: 2커밋 통합, typecheck 깨끗. B 배치 끝. 워커 해제, `cm-b-main` 제거(branch 남김). F(eval 회차) 시작 `ctx_6078cd5e0177`(Sonnet medium, `cm-f-eval`).
- F를 범위 변경으로 다시 시작했다: 첫 워커 `ctx_6078cd5e0177`은 설치 전에 멈췄고(전체 회차 지시였다), `ctx_29453f216114`가 같은 worktree에서 R8d·R9b·R10–R17 회차를 돌린다. 끝나면 W1·R2·X1 회차를 후속 Task로 돌린다.
- E(design-sync) 끝: 커밋을 통합하고 push했다(`b9c092080`까지). 패널 1757행 중 74, Overview 658행 중 20 차이를 `docs/design/conversation.md`에 기록했다. C 리뷰 🟡 5는 대화별 유예로 고쳤고 실제 시작으로는 runtime probe에서 본다.
- F 1차 회차 `cm-f-scoped-1` 무효: Claude 사용량 한도(R14–R17), Codex 판정자 judge_error(R12–R17), real-state의 `sessions.jsonl` 변경(사용자의 실행 중인 Doan). 리셋 뒤 실패한 실행만 반복 회차로 돌리라고 답했다.
- runtime probe(tasks 8)를 워커에 맡겼다: `ctx_c104c5d84e42`(Opus medium, 컨덕터 checkout에서 `.scratch`만 씀). 항목 9개에 canvas-chip의 패널 경로 재작성 확인을 넣었다.
