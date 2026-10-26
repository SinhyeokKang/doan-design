# agent-handoff — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `c1ad75b`(main)
- 통합 브랜치: `feat-agent-handoff`(main에서 만듦)
- 지휘: Claude Code(Opus). review-loop 체인 링크 4(`.scratch/handoff/review-loop-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/agent-handoff/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-26 | 사용자 확인 질문을 하지 않고 권장안대로 진행한다. 결정 지점에서는 지휘자가 권장안을 골라 이 로그에 근거와 함께 적는다. 실제 사용자 상태를 바꾸는 일은 예외로 묻는다 | 사용자(체인 규칙, "이 루프 링크는 가능한 내 허가 없이 추천안대로 쭉 진행해", "링크 5까지 전부 다") |
| 2026-10-26 | 구현은 Claude Opus가 맡고 Codex를 적당히 섞는다. 기계적인 배치 K(skill·CLI 문구)와 F(문구 세 곳)는 Codex `gpt-6.1-sol` medium, 독립 리뷰 일부는 Codex `gpt-6-astra` medium이 다른 계열로 읽는다. 쓸 때마다 진행 기록에 적는다 | 사용자(체인 규칙, "Codex 적당히 섞어 써도 괜찮아. 주 업무는 클로드 코드가 진행하되 적당히 섞어 사용해") |
| 2026-10-26 | 이 링크의 PR은 통합과 `/verify` 통과 뒤 main에 병합한다(`/orchestrate`의 병합 금지를 이 체인에서만 대체) | 사용자(체인 규칙, "링크마다 메인에 병합하면서 간다") |
| 2026-10-26 | tasks 1(`/tdd`)은 따로 배치를 두지 않는다. 각 구현 배치가 자기 범위의 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다(`/ship`의 tdd 단계) | 지휘자 판단 — 링크 1~3과 같은 방식. 테스트 목록은 tasks 1에 있고 배치별로 나눠 브리프에 넣는다 |
| 2026-10-26 | tasks 11 남은 참조 검사: `git grep -n -e 'Copy all open' -e 'open this project in Doan' -e 'Selected:' -- . ':!docs/features/*' ':!design/*'`. 결과 중 제품 문구가 아닌 것(예: e2e 정규식이 새 문구를 가리키는 경우)은 내용을 보고 판정한다 | 지휘자 판단 — tasks 11의 'command undecided'를 링크 1~3과 같은 git grep 형식으로 정한다. `design/`의 확정 초안은 제외한다 |
| 2026-10-26 | `/design-sync`는 새 표면 `dialog`, `dialog-states`, `copy-states`에만 돌린다(배치 D 안에서). `handed-off`, `fix-this`는 이미 main에 있는 화면에 더하는 부분이라 tasks의 테스트와 e2e를 따른다 | design.md '초안 요청', 체인 규칙 |
| 2026-10-26 | `/agent-eval` 실제 회차를 돌리지 않는다. 7의 self-test까지만 한다 | tasks 8, 체인 규칙(유일한 실제 회차는 링크 5) |
| 2026-10-26 | worktree 안내의 데이터: 앱이 이미 가진 프로젝트 행(상단 '⎇ branch' 전환 메뉴가 쓰는 같은 저장소 worktree 목록과 `cardRow(...).summary.branch`)을 쓴다. 새 IPC를 만들지 않는다 | 지휘자 판단 — 같은 저장소의 worktree 수와 브랜치를 앱이 이미 화면에 보인다(`App.tsx` worktree 메뉴). 같은 근거로 맥락 줄 `project › ⎇ branch › canvas title`을 만든다 |
| 2026-10-26 | "Copy remains available."은 D가 `CommentsPanel.tsx`에서 "Hand off remains available."로, "Copy all open includes them."은 F가 `panelText.ts`에서 "Hand off… includes them."으로 바꾼다 | design.md §1, 파일 소유 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1·2·3 (공유 순수 함수와 main 복사 검증) | `app/src/comments/projection.ts`, 새 `app/src/comments/handoff.ts`, `app/src/main/comments/service.ts`, `app/src/preload/index.ts`의 복사 타입, 각 테스트. typecheck를 지키기 위한 `CommentsSession.ts`·`CommentsPanel.tsx`·`useComments.tsx` 호출부의 최소 수정(새 `CopyScope`로 바꾸기만) | — | Opus high (main 재확인과 `not_open` 거부, 읽기와 클립보드 쓰기 사이 resolve 경합) | test red→green, typecheck | 대기 |
| K | 1·2·6 (Go 쪽) | `cli/internal/cli/active.go`, `cli/internal/cli/skill.md`, `skill_test.go`, `active_test.go`, 문구를 단언하는 다른 Go 테스트 | — | Codex `gpt-6.1-sol` medium (문구가 design.md §6에 다 정해진 변경) | `go test ./...`, `go vet ./...` | 대기 |
| F | 1·5 (문구) | `app/src/renderer/RightPanel.tsx`, `Home.tsx`, `homeCards.ts` 주석, `app/src/comments/panelText.ts`, 각 테스트, `app/e2e/projects-home.ts`의 `/^Selected:/` 단언 | — | Codex `gpt-6.1-sol` medium (확정 초안 `fix-this` 프레임의 문구 세 곳) | test, typecheck | 대기 |
| D | 1·4·5(worktree 안내), `/design-sync` | `CommentsPanel.tsx`, `CommentsSession.ts`, `useComments.tsx`, 새 Hand off 대화상자 컴포넌트, `ReviewBar.tsx` 연결, `App.tsx`(worktree 행 전달), `styles.css`, 각 테스트, `docs/DESIGN.md`(이 표면), `.scratch/design-sync/agent-handoff/` | P 통합 | Opus high (대화상자 우선순위 체인, 포커스·IME, 복사 결과를 요청 정체성으로 판정, Handed off 수명) | test, typecheck, `/design-sync` 측정 일치 | 대기 |
| W | 7 | `eval/lib/scenario.ts`·`workspace.ts`(와 필요한 러너 파일), eval 단위 테스트, 새 `eval/scenarios/{H6,R7,H7}/` | P·K 통합 | Opus high (두 번째 worktree 구성, cwd와 root 분리, fail fixture 판정) | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS | 대기 |
| T | 9 | `app/e2e/comments-ui.ts`, 낡은 단언이 생긴 다른 e2e 모듈 | D·F 통합 | Opus high (실제 창, 클립보드 저장·복원, CLI resolve 경합) | 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | Codex `gpt-6-astra` medium과 Opus를 번갈아 쓴다(배치별로 진행 기록에 적는다) | `/code-review`, 🔴 0 | — |
| 지휘자 | 10 | — | 전부 통합 | — | `node .agents/skills/verify/scripts/verify.mjs --runtime --eval` 최종 PASS, exit 0 | 대기 |
| G | 11 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/USABILITY-EVAL.md`, `docs/DIRECTORY.md`, 이 디렉터리 삭제 | 10 | Opus medium (승격 위치가 tasks 11에 다 나와 있다) | 문서 diff 검토, 위 git grep 결과 판정 | 대기 |

tasks.md의 1~11은 모두 위 배치 중 하나에 속한다(1은 각 배치의 tdd 단계, 8은 실행하지 않는 결정, 10은 지휘자).

## 순서와 파일 겹침

- 1파: P ∥ K ∥ F. P는 공유 순수 모듈·main·preload와 복사 호출부만, K는 Go만, F는 RightPanel·Home·panelText·projects-home e2e만 고친다. P가 호출부를 고치는 세 파일(CommentsSession·CommentsPanel·useComments)은 F가 건드리지 않는다.
- 2파: D(P 뒤) ∥ W(P·K 뒤). D는 renderer, W는 eval만 고친다. W의 H6은 P의 `copyText` 결과와 같은 `prompt.md`를 쓴다.
- 3파: T(D·F 뒤). 그 뒤 지휘자 `/verify --runtime --eval`, G, PR, 병합.
- 각 배치는 `--worktree new-child --base-branch feat-agent-handoff`로 만든 자기 worktree에서 돈다.
- 링크 1~3에서 남은 일: 화면 잠금 때문에 전체 runtime 묶음이 comments-ui 08에서 멈췄다. 이 링크의 `verify --runtime` 전에 `ioreg -n Root -d1`로 잠금 상태를 확인한다. 풀려 있으면 이 실행이 링크 1~3도 덮는다. 잠겨 있으면 통과로 세지 않고 그대로 보고한다.

## 진행 기록

- 2026-10-26: 시작. 화면 잠금 상태 `CGSSessionScreenIsLocked = Yes`.
