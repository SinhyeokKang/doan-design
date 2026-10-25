# revision-recheck — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `9e04887`(main)
- 통합 브랜치: `feat-revision-recheck`(main에서 만듦)
- 지휘: Claude Code(Opus). review-loop 체인 링크 3(`.scratch/handoff/review-loop-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/revision-recheck/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-26 | 사용자 확인 질문을 하지 않고 권장안대로 진행한다. 결정 지점에서는 지휘자가 권장안을 골라 이 로그에 근거와 함께 적는다. 실제 사용자 상태를 바꾸는 일은 예외로 묻는다 | 사용자(체인 규칙, "이 루프 링크는 가능한 내 허가 없이 추천안대로 쭉 진행해", "링크 5까지 전부 다") |
| 2026-10-26 | 구현은 Claude Opus가 맡고 Codex를 적당히 섞는다. 기계적인 배치 A(fold)와 K(skill·R6)는 Codex `gpt-6.1-sol` medium, 독립 리뷰 일부는 Codex `gpt-6-astra` medium이 다른 계열로 읽는다. 쓸 때마다 진행 기록에 적는다 | 사용자(체인 규칙, "Codex 적당히 섞어 써도 괜찮아. 주 업무는 클로드 코드가 진행하되 적당히 섞어 사용해") |
| 2026-10-26 | 이 링크의 PR은 통합과 `/verify` 통과 뒤 main에 병합한다(`/orchestrate`의 병합 금지를 이 체인에서만 대체) | 사용자(체인 규칙, "링크마다 메인에 병합하면서 간다") |
| 2026-10-26 | tasks 1 측정 명령: 작업자가 `.scratch/revision-recheck/measure.mjs`(Playwright `_electron`, `app/e2e/runtime.ts`의 격리 방식)를 만들어 `node .scratch/revision-recheck/measure.mjs`로 돌린다. `comments:project`가 아직 없으므로, main과 같은 경로(`doan ls` 한 번 + 행 id별 댓글 파일 읽기 + `fold`)를 Node에서 재고, Home 첫 렌더 시간은 지금 앱에서 잰다. 각 3회, 전후로 `real-state.ts`를 확인하고 exit 0으로 끝낸다. M이 IPC를 만든 뒤 T(e2e 배치)가 실제 IPC로 한 번 다시 잰다 | 지휘자 판단 — AGENTS.md 'Commands'의 `/design-sync` 측정 스크립트 형식, 링크 1·2와 같은 방식. 기준(500ms) 초과면 tasks 1대로 8을 멈추고 대안을 정한다(이때도 지휘자가 권장안으로 정한다) |
| 2026-10-26 | tasks 14 남은 참조 검사: `git grep -n -e 'revision-recheck' -e 'features/revision-recheck' -- . ':!docs/features/*' ':!design/*'` | 지휘자 판단 — 링크 1·2와 같은 검사. `design/`의 확정 초안은 제외한다 |
| 2026-10-26 | `/design-sync`는 새 표면 `review-notice`, `review-bar`, `review-done`에만 돌린다(배치 B 안에서). 나머지(카드, Activity, Home, Overview)는 이미 main에 있는 화면이라 tasks의 측정과 e2e를 따른다 | design.md '초안 요청', 체인 규칙 |
| 2026-10-26 | `/agent-eval` 실제 회차를 돌리지 않는다. 10의 self-test까지만 한다 | tasks 11, 체인 규칙(유일한 실제 회차는 링크 5) |
| 2026-10-26 | Done 요약의 "Hand off…"는 넘기기 대화상자(`agent-handoff`, 링크 4)가 아직 없으므로 이 링크에서는 렌더하지 않는다. 요약은 다시 연 id 목록을 상태로 갖고, 대화상자를 여는 콜백이 주어질 때만 Hand off…를 보인다. 링크 4가 그 콜백을 연결하도록 `docs/features/agent-handoff/tasks.md`에 한 줄을 더하고 체인 인계 문서에 적는다 | 지휘자 판단 — 없는 대화상자를 흉내 내면 링크 4가 지울 코드가 생기고(AGENTS '앞서 만들기 금지'), 기존 Copy 흐름에 잇는 것은 승인되지 않은 동작이다 |
| 2026-10-26 | 3파의 C·V·H는 `styles.css`를 함께 고친다. V는 Activity 시각 열 규칙 하나, H는 Home·Overview 요약 규칙만 고치고, 각자 별도 커밋으로 둔다. 겹치는 hunk가 생기면 나중에 통합되는 배치가 통합 브랜치를 merge해 해결한다 | 지휘자 판단 — 규칙 블록이 서로 달라 겹칠 가능성이 낮고, CSS 몇 줄 때문에 배치를 직렬로 돌리면 한 파가 늘어난다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| X | 1 | `.scratch/revision-recheck/` | — | Opus medium (격리된 측정 스크립트) | 측정 로그, `real-state.ts` 전후 동일, exit 0 | 대기 |
| A | 2 | `app/src/formats/{fold,types}.ts`, `cli/internal/formats/{fold,types}.go`, `schema/fixtures/fold/`, 각 테스트, `cli` 패키지 `comments`·MCP 출력 테스트 | — | Codex `gpt-6.1-sol` medium (fixture가 규칙을 다 정한 기계적 변경) | `go test ./...`, `go vet ./...`, `npm --prefix app test` | 대기 |
| P | 3, 4 (renderer 순수 함수) | 새 파일 `app/src/comments/review.ts`·`resolution.ts`(이름은 작업자가 정함)와 테스트, `app/src/renderer/activity.ts`·`canvasView.ts`의 순수 함수와 테스트 | — | Opus high (Review 상태 기계의 진행·Done 범위 규칙) | test red→green, typecheck | 대기 |
| S | 3, 4 (service), 9 main | `app/src/main/comments/{service,events,transitions}.ts`, `app/src/comments/events.ts`, `app/src/preload/index.ts`의 intent 타입, 각 테스트 | — | Opus high (이벤트 2개 attempt의 saved/absent/unknown 판정과 재시도) | test red→green, typecheck | 대기 |
| L | 5 | `CanvasController.ts`, `canvasScript.ts`(필요 시), `useComments.tsx`(locate 표지), `CommentsPanel.tsx`(대상 줄 클릭), 각 테스트 | P 통합 | Opus high (선택 정체성 규칙의 예외, 리로드·이동 펜스) | test, typecheck | 대기 |
| M | 8 main | 새 `app/src/main/reviewState.ts`, `comments:project` IPC(`main/index.ts`, 새 main 모듈), `menuState.ts`와 Go 메뉴, `preload/index.ts`, 각 테스트 | S 통합 | Opus high (기기 로컬 저장소 검증, 늦은 응답 버림, 메뉴 상태) | test, typecheck | 대기 |
| K | 10 | `cli/internal/cli/skill.md`와 skill 테스트, 새 `eval/scenarios/R6/` | A 통합 | Codex `gpt-6.1-sol` medium (기존 R 시나리오 형식을 따르는 작업) | `go test ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS | 대기 |
| C | 6 | `CommentsPanel.tsx`, `CommentsSession.ts`, `useComments.tsx`, `styles.css`, 각 테스트 | L 통합 | Opus high (상태 줄 타이머 수명, 사라지는 카드의 포커스) | test, typecheck | 대기 |
| V | 7 | `activity.ts`, `canvasView.ts`, `RightPanel.tsx`, `CanvasController.ts`의 Activity 기록, 각 테스트 | L 통합 | Opus medium (P가 만든 순수 함수를 잇는 작업) | test, typecheck | 대기 |
| H | 8 Home·Overview | `Home.tsx`, `homeCards.ts`, `ProjectOverview.tsx`와 테스트, 필요한 `App.tsx` 연결 | M 통합 | Opus medium (IPC 결과를 표시) | test, typecheck | 대기 |
| B | 8 renderer, `/design-sync` | `CommentsPanel.tsx`, `useComments.tsx`, `CommentsSession.ts`, `App.tsx`, `styles.css`, 새 Review 모듈, 테스트, `docs/DESIGN.md` 측정값 | C, V, H, M 통합 | Opus high (Review 진행·Esc 우선순위·포커스, 알림의 동기 계산) | test, typecheck, `/design-sync` 측정 일치 | 대기 |
| E | 9 renderer | `CommentsPanel.tsx`, `useComments.tsx`, `CommentsSession.ts`, `styles.css`, 테스트 | B 통합 | Opus high (Save and reopen 결과 처리, 새 댓글 저장 뒤 삭제 확인) | test, typecheck | 대기 |
| T | 12 | 새 `app/e2e/revision-recheck.ts`, `app/e2e/runtime.ts` import, 낡은 단언이 생긴 다른 e2e 모듈 | E 통합 | Opus high (실제 창 시나리오, 재시작·숨김) | 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | Codex `gpt-6-astra` medium과 Opus high를 번갈아 쓴다(배치별로 진행 기록에 적는다) | `/code-review`, 🔴 0 | — |
| 지휘자 | 13 | — | 전부 통합 | — | `node .agents/skills/verify/scripts/verify.mjs --runtime --eval` 최종 PASS, exit 0 | 대기 |
| G | 14 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/USABILITY-EVAL.md`, `docs/DIRECTORY.md`, 이 디렉터리 삭제 | 13 | Opus medium (승격 위치가 tasks 14에 다 나와 있다) | 문서 diff 검토, 위 git grep 결과 없음 | 대기 |

tasks.md의 1~14는 모두 위 배치 중 하나에 속한다(11은 실행하지 않는 결정, 13은 지휘자).

## 순서와 파일 겹침

- 1파: X ∥ A ∥ P ∥ S. X는 `.scratch`만, A는 formats·fixture만, P는 새 순수 모듈과 `activity.ts`·`canvasView.ts`, S는 main comments만 고친다.
- 2파: L(P 뒤) ∥ M(S 뒤) ∥ K(A 뒤). L은 renderer, M은 main·preload, K는 skill·eval만 고친다.
- 3파: C ∥ V(L 뒤), H(M 뒤). C는 CommentsPanel·CommentsSession·useComments·styles, V는 activity·canvasView·RightPanel·CanvasController, H는 Home·homeCards·ProjectOverview를 고친다. V가 해결 Activity를 위해 CommentsSession을 고쳐야 하면 지휘자에게 묻는다(C가 가진다).
- 4파: B(C·V·H·M 뒤). 5파: E(B 뒤). 6파: T(E 뒤). 그 뒤 지휘자 `/verify --runtime --eval`, G, PR, 병합.
- 각 배치는 `--worktree new-child --base-branch feat-revision-recheck`로 만든 자기 worktree에서 돈다.
- 링크 1·2에서 남은 일: 화면 잠금 때문에 전체 runtime 묶음이 돌지 않았다. 이 링크의 `verify --runtime` 전에 `ioreg -n Root -d1`로 잠금 상태를 확인한다. 풀려 있으면 이 실행이 링크 1·2도 덮는다. 잠겨 있으면 통과로 세지 않고 그대로 보고한다.

## 진행 기록

- 2026-10-26: 시작. 화면 잠금 상태 `CGSSessionScreenIsLocked = Yes`.
- 2026-10-26: Run `run_1da72bfa7b5d`. 1파 시작 — X(`ctx_5b62f582630a`, Opus medium, `rr-x`), A(`ctx_b28aa5b1f1c9`, Codex `gpt-6.1-sol` medium, `rr-a`), P(`ctx_02705dfb7988`, Opus high, `rr-p`), S(`ctx_5feffb581d64`, Opus high, `rr-s`). `launch.effective`가 요청과 같다.
- 2026-10-26: A 알림 — 기존 fixture 5개 중 delete-followups(최종 삭제)와 human-unicode-tied-lifecycle(최종 해결)은 최종 상태가 같아 expected.json을 그대로 두고, 중간 상태는 prefix 단언으로 고정한다. 받아들였다.
- 2026-10-26: X 완료 — tasks 1 측정 결과를 tasks.md 1에 옮겼다(최대 149ms, 기준 500ms 안). 커밋 없음. X 해제.
- 2026-10-26: S 질문 — `edit-reopen` intent를 더하면 renderer `CommentsSession.ts:354`의 confirmCard 가드가 typecheck를 깨뜨린다. 허락: S가 그 가드에 `edit-reopen`을 더한다(edit처럼 초안 경로로 간다, E가 연결).
- 2026-10-26: A 완료(Codex Sol medium, `3b11f3d`, `4a91aa0`) — red 뒤 green, go test·vet, 앱 테스트 2426, typecheck 통과. 바뀐 기존 expected.json은 3개(승인한 차이). 통합(`e9a766b`, `8395a0f`), 통합 HEAD go test 통과(지휘자 실행). A 해제, `rr-a` 제거. R-A(Opus medium, 다른 계열 리뷰)와 K(Codex `gpt-6.1-sol` medium) 시작.
- 2026-10-26: S 완료(`1c1582a`, `c04a6a9`) — red 12건 뒤 green. 계획과 다른 점: fold가 에이전트의 edit·reopen을 무시하므로 '그 사이 에이전트 변경' 테스트는 사람 변경 → 거부, 에이전트 줄 → 저장(시각만 뒤로 밀림)으로 고정했다(받아들임). 통합(`2ff8385`, `a46f28e`), 통합 HEAD test 2443·typecheck 통과(지휘자 실행). S 해제, `rr-s` 제거. R-S(Codex `gpt-6-astra` medium), M(`ctx_0ad2d8a829fa`, Opus high, `rr-m`) 시작.
- 2026-10-26: M 질문 2건, 권장안대로 답했다. (1) P가 아직 통합되지 않아 `toReview`가 없다(브리프 오류). M은 나머지를 먼저 만들고, P 통합 뒤 지휘자 알림을 받으면 통합 브랜치를 merge해 연결한다. 그 전에 끝나면 연결을 미룬 항목으로 남긴다. (2) 프로젝트 제거에 Undo가 있으므로 제거가 확정될 때(토스트 만료 `folders:forget-removal`, 새 제거로 대체) 그 root 항목을 지우고, 첫 로드 때 `folders.json`에 없는 root를 정리한다. 복원하면 항목을 남긴다.
- 2026-10-26: R-A 완료(Opus medium) — 🔴 0 · 🟡 0 · ⚪ 3(TS는 resolvedBy를 확인하고 Go는 바로 역참조하는 비대칭, 출력은 같음 / ARCH §2 승격은 G가 함 / 인계 해시가 통합 해시와 다름). 고칠 것 없음. R-A 해제, `rr-r-a` 제거.
- 2026-10-26: P 완료(`ef24692`, `cea7bb6`) — red 뒤 green, test 2469·typecheck 통과. 계획과 다른 점(받아들임): `bottomLabel`이 이벤트 목록을 받아 Resolved를 건너뜀, 상대 시각 함수를 인자로 받음(`relativeTime`이 CommentsPanel 안에 있다), `toReview`가 `{since, lastReviewedAt?}`를 받음, `startReview` 추가, `reviewSummary`가 다시 연 id를 함께 돌려줌, 알 수 없는 rev는 reloaded. `resolution.ts`의 구조적 `LastResolution` 타입은 A 타입으로 바꿔야 한다(C에 넣는다). 통합(`fd5513a`, `2c3a463`), 통합 HEAD test 2489·typecheck 통과(지휘자 실행). P 해제, `rr-p` 제거. M에 P 통합을 알렸다. R-P(Codex `gpt-6-astra` medium), L(`ctx_0bff76ba8829`, Opus high, `rr-l`) 시작.
- 2026-10-26: R-S 완료(Codex Astra medium) — 🔴 0 · 🟡 0 · ⚪ 0. R-S 해제, `rr-r-s` 제거.
- 2026-10-26: K 완료(Codex Sol medium, `a931a40`, `b6b6c24`) — skill 한 줄(red 뒤 green), R6 시나리오(시드: 에이전트 해결 → 사람 다시 열기, pass/fail fixture). go test, eval 테스트 133, self-test 16개 시나리오 PASS. 통합(`8b4380a`, `4cd826c`), 통합 HEAD `cli` go test·eval 테스트 133 통과(지휘자 실행). K 해제, `rr-k` 제거. R-K(Opus medium, 다른 계열 리뷰) 시작.
- 2026-10-26: M 질문 — `comments:project`가 패널과 같은 방식으로 fold하도록 `service.ts`의 `readList`를 export해 재사용한다. 허락(잘못된 UTF-8 처리가 패널과 달라지지 않게 한다).
- 2026-10-26: R-P 완료(Codex Astra medium) — 🔴 0 · 🟡 1 · ⚪ 0. 🟡 P-1: Review 중 직접 다시 연 단계가 이후 삭제·재해결을 반영하지 않는다(재현 2건, `evidence-R-P/repro.mjs`). P의 다른 점 8개는 모두 받아들일 수 있다고 판정했다. 수정 배치 P2(Opus medium, `review.ts`만) 시작. 요약의 'Reopened M'은 이 Review에서 다시 열었고 아직 열린 댓글만 센다. R-P 해제, `rr-r-p` 제거.
- 2026-10-26: R-K 완료(Opus medium) — 🔴 0 · 🟡 1 · ⚪ 2. 🟡: R6 시드의 create `canvasHash`가 바뀐 뒤 파일의 해시라 `outdated: false`가 나오고, 생성 시점 본문이 나중의 잘못된 라벨을 미리 지목해 함정이 쉬워진다. 기록된 회차가 없으므로 같은 id에서 고친다(ARCH §14). ⚪ 2개(나머지 캔버스는 rubric으로만 판정, 인식 rubric이 judge 부분점을 낼 수 있음)는 링크 5 실제 회차에서 본다. 수정 배치 K2(Codex `gpt-6.1-sol` medium) 시작. R-K 해제, `rr-r-k` 제거.
- 2026-10-26: P2 완료(`0e8a2e0`, `a584d23`) — red 2건 뒤 green. 다시 읽은 결과가 직접 Reopen보다 앞서 삭제·재해결을 반영하고, 요약과 Hand off id는 아직 열린 것만 센다. 더한 규칙: 직접 다시 연 뒤 같은 resolvedAt을 보이는 읽기는 쓰기 전의 낡은 읽기로 보고 reopened를 유지한다(받아들임). 통합(`a58215a`, `e59b1cb`), R-P 재현 스크립트가 HEAD에서 2건 모두 PASS(지휘자 실행). P2 해제, `rr-p2` 제거.
- 2026-10-26: P2 통합 HEAD 앱 테스트 1회에 `onboarding/machine.test.ts` 2건 실패(실행마다 다른 테스트, 'stale' 상태), 그 파일 단독 3회는 76/76 통과. 부하 평균 23–27(작업자 4명 동시)에서 생긴 시간 의존 실패로 본다. 최종 게이트에서 다시 확인한다.
- 2026-10-26: K2 질문 — 시드 이력 오류가 POSTMORTEM 기존 eval 항목의 재발이다. 허락: K2가 `docs/POSTMORTEM.md` 기존 항목에 재발 줄을 별도 docs 커밋으로 더한다.
