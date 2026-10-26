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
| 2026-10-26 | worktree 안내의 데이터: 열린 항목의 `GitInfo.worktrees`(git 자신의 worktree 목록, `app/src/main/view.ts`)가 2개 이상일 때 안내를 보인다. 안내의 브랜치·경로는 열린 항목(지시문 root)의 것이다. 새 IPC를 만들지 않는다. 맥락 줄 `project › ⎇ branch › canvas title`은 앱의 프로젝트 행과 `cardRow(...).summary.branch`로 만든다 | 지휘자 판단(P 질문, 처음의 '앱 프로젝트 행 수' 결정을 바꿈) — spec은 '같은 저장소에 worktree가 둘 이상'이다. Doan에 더하지 않은 worktree(H7 상황)도 git 목록에는 잡힌다 |
| 2026-10-26 | tasks 9의 새 런타임 시나리오는 `app/e2e/comments-ui.ts`에 덧붙이지 않고 새 모듈 `app/e2e/agent-handoff.ts`에 둔다(`runtime.ts` 가져오기 목록에 추가). `comments-ui.ts`에서는 옛 Copy 단계만 Hand off 대화상자로 바꾼다 | 지휘자 판단 — 화면이 잠겨 있으면 comments-ui가 08단계(네이티브 포커스)에서 멈춘다(링크 1~3). 뒤에 덧붙인 단계는 이 링크 게이트에서 돌지 않으므로, 단독으로 돌릴 수 있는 모듈로 둔다(링크 3의 revision-recheck.ts와 같은 방식) |
| 2026-10-26 | "Copy remains available."은 D가 `CommentsPanel.tsx`에서 "Hand off remains available."로, "Copy all open includes them."은 F가 `panelText.ts`에서 "Hand off… includes them."으로 바꾼다 | design.md §1, 파일 소유 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | 1·2·3 (공유 순수 함수와 main 복사 검증) | `app/src/comments/projection.ts`, 새 `app/src/comments/handoff.ts`, `app/src/main/comments/service.ts`, `app/src/preload/index.ts`의 복사 타입, 각 테스트. typecheck를 지키기 위한 `CommentsSession.ts`·`CommentsPanel.tsx`·`useComments.tsx` 호출부의 최소 수정(새 `CopyScope`로 바꾸기만) | — | Opus high (main 재확인과 `not_open` 거부, 읽기와 클립보드 쓰기 사이 resolve 경합) | test red→green, typecheck | 대기 |
| K | 1·2·6 (Go 쪽) | `cli/internal/cli/active.go`, `cli/internal/cli/skill.md`, `skill_test.go`, `active_test.go`, 문구를 단언하는 다른 Go 테스트 | — | Codex `gpt-6.1-sol` medium (문구가 design.md §6에 다 정해진 변경) | `go test ./...`, `go vet ./...` | 대기 |
| F | 1·5 (문구) | `app/src/renderer/RightPanel.tsx`, `Home.tsx`, `homeCards.ts` 주석, `app/src/comments/panelText.ts`, 각 테스트, `app/e2e/projects-home.ts`의 `/^Selected:/` 단언 | — | Codex `gpt-6.1-sol` medium (확정 초안 `fix-this` 프레임의 문구 세 곳) | test, typecheck | 대기 |
| D | 1·4·5(worktree 안내), `/design-sync` | `CommentsPanel.tsx`, `CommentsSession.ts`, `useComments.tsx`, 새 Hand off 대화상자 컴포넌트, `ReviewBar.tsx` 연결, `App.tsx`(worktree 행 전달), `styles.css`, 각 테스트, `docs/DESIGN.md`(이 표면), `.scratch/design-sync/agent-handoff/` | P 통합 | Opus high (대화상자 우선순위 체인, 포커스·IME, 복사 결과를 요청 정체성으로 판정, Handed off 수명) | test, typecheck, `/design-sync` 측정 일치 | 대기 |
| W | 7 | `eval/lib/scenario.ts`·`workspace.ts`(와 필요한 러너 파일), eval 단위 테스트, 새 `eval/scenarios/{H6,R7,H7}/` | P·K 통합 | Opus high (두 번째 worktree 구성, cwd와 root 분리, fail fixture 판정) | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS | 대기 |
| T | 9 | 새 `app/e2e/agent-handoff.ts`, `runtime.ts` 가져오기, `comments-ui.ts`의 Copy 단계, 낡은 단언이 생긴 다른 e2e 모듈 | D·F 통합 | Opus high (실제 창, 클립보드 저장·복원, CLI resolve 경합) | 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 대기 |
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
- 2026-10-26: Run `run_388720a5a031`. 1파 시작 — P(`ctx_f0d29dc66587`, Opus high, `ah-p`), K(`ctx_d096423ea7e1`, Codex `gpt-6.1-sol` medium, `ah-k`), F(`ctx_59c5c30a0e0d`, Codex `gpt-6.1-sol` medium, `ah-f`). `launch.effective`가 요청과 같다.
- 2026-10-26: K 완료(Codex Sol medium, `59a6448`, `89e5082`) — red 3건 뒤 green, go test·vet 통과, 소유 범위 밖 옛 문구 단언 없음. 통합(`ee93851`, `290d2bf`), 통합 HEAD `cli` go test·vet 통과(지휘자 실행). K 해제, `ah-k` 제거. R-K(Opus medium, 다른 계열 리뷰) 시작.
- 2026-10-26: F 완료(Codex Sol medium, `2b21563`) — Inspector "fix this" 안내(`use-hint` 재사용, CSS 변경 없음), Home "Selected for your agent:", panelText "Hand off… includes", projects-home e2e 정규식. red 8 뒤 green, test 2735·typecheck 통과. 통합(`18f8276`), 해당 테스트 130·typecheck 통과(지휘자 실행). F 해제, `ah-f` 제거. R-F(Opus medium, 다른 계열 리뷰) 시작.
- 2026-10-26: R-K 완료(Opus medium) — 🔴 0 · 🟡 0 · ⚪ 3. 고칠 것 없음. ⚪1(skill의 project_not_open 줄 테스트가 부분 문자열만 본다)은 기록만 한다. ⚪2(규칙 F가 모든 요청에서 남긴 댓글을 나열하게 할 수 있음)는 링크 5 실제 회차에서 본다. ⚪3(규칙 C의 굽은 따옴표를 ARCH §1에 그대로 옮긴다)은 G 브리프에 넣는다. R-K 해제, `ah-r-k` 제거.
- 2026-10-26: P 질문 — worktree 안내 데이터. 결정 로그의 해당 행을 바꿨다(git worktree 목록 2개 이상).
- 2026-10-26: R-F 완료(Opus medium) — 🔴 0 · 🟡 0 · ⚪ 2(새 테스트 앞 빈 줄 두 개, Home.test.tsx 파일 전체 TooltipContent mock). 고칠 것 없음. 다른 배치로 넘긴 것: comments-ui e2e의 Copy/Copied/Copy all open(T), PRODUCT 문구(G), `not.toContain("Copy all open")` 단언 두 곳이 무의미해짐(D 브리프). R-F 해제, `ah-r-f` 제거.
- 2026-10-26: P 완료(`3ac5fbd`, `684bedb`) — `handoff.ts`(행, 빠른 선택, Handed off 판정, `staleIds`, 요약·성공 문구, worktree 안내), `CopyScope = {comments}`와 새 `copyText`, main `parseCopyScope`와 다시 읽기 기반 `not_open` 거부(`reply.code`). red 40 뒤 green, test 2763·typecheck 통과. 계획과 다른 점(받아들임): `worktreeNotice(entry, home)`(승인한 결정), `handoffRows(comments, frames)`, `handoffCopied(n)` 추가, `handoff.ts`가 renderer의 `timeText`·`displayPath`를 가져다 쓴다(R-P에서 판정), main 읽기와 클립보드 쓰기 사이의 resolve는 복사한 내용대로 성공으로 보고한다(다음 복사가 `not_open`). 남긴 것: renderer `value()`가 `reply.code`를 읽는 일(D). 통합(`7e80e1c`, `99b87b4`), 통합 HEAD test 2769·typecheck 통과(지휘자 실행). P 해제, `ah-p` 제거. 2파 시작 — R-P(Codex `gpt-6-astra` medium), D(Opus high, `ah-d`), W(Opus high, `ah-w`).
- 2026-10-26: R-P 완료(Codex Astra medium) — 🔴 0 · 🟡 1 · ⚪ 1. 🟡: `parseCopyScope`가 빈 슬롯 배열을 통과시킨다(`every`가 빈 슬롯을 건너뜀, 재현 1건 `evidence-R-P/`). 정상 UI에서는 생기지 않고 클립보드에도 쓰지 않지만 디스크 읽기 전 거부 계약과 어긋난다. ⚪: 다른 캔버스 테스트가 실제 다른 캔버스의 열린 id를 쓰지 않는다. renderer 모듈 import는 경계 위반이 아니라고 판정했다. 수정 배치 P2(Codex `gpt-6.1-sol` medium, service.ts·테스트만, D와 겹치지 않음) 시작. R-P 해제, `ah-r-p` 제거.
- 2026-10-26: P2 완료(Codex Sol medium, `ccf94b5`, `a4a3a9c`) — 빈 슬롯을 펼친 복사본으로 검증해 디스크 읽기 전에 거부, 다른 캔버스 테스트 보강, POSTMORTEM 새 항목(허락함). red 4 뒤 green, test 2774·typecheck 통과. 통합(`062b9d5`, `78156dc`), main comments 테스트 145·typecheck 통과(지휘자 실행). 리뷰 제안을 그대로 적용한 작은 변경이라 재리뷰는 생략한다. P2 해제, `ah-p2` 제거.
- 2026-10-26: W 완료(`0b70499`, `cbca88c`) — `scenario.json`의 `worktree: {branch}`, 두 번째 worktree를 에이전트 cwd로, root와 fake app은 첫 worktree, `CheckContext.cwd`·judge diff 표시. H6(prompt가 앱 `copyText`와 같음을 테스트), R7(선택 + 달린 댓글 + "Fix this.", MCP), H7(worktree 불일치). 계획과 다른 점(R-W에서 판정): worktree 시나리오는 선택이 없어도 fake app을 띄워 `doan active`가 `project_not_open`을 돌려준다. 통합(`4cec0e9`, `fbd664f`), eval 테스트 152·self-test 19개 시나리오 PASS(지휘자 실행). W 해제, `ah-w` 제거. R-W(Codex `gpt-6-astra` medium) 시작.
- 2026-10-26: D 질문 — detached worktree의 맥락 줄. 확정 초안대로 `git.branch`가 있을 때만 '⎇ branch', detached나 git이 아닌 폴더는 폴더 이름을 쓴다(design.md 초안 확정).
- 2026-10-26: R-W 완료(Codex Astra medium) — 🔴 0 · 🟡 2 · ⚪ 0. W-1: H7 `asks_the_user`가 물음표·고정 어휘 없는 자연스러운 확인 요청을 거부한다(POSTMORTEM 2026-10-24 재발). W-2: 공유 `transcript.ts`가 `command doan active`를 호출로 보지 않아 R7이 정상 호출을 놓친다. 둘 다 재현(`evidence-R-W/`). fake app을 띄우는 계획 보완은 타당하다고 판정했다. 수정 배치 W2(Opus medium, eval만, D와 겹치지 않음) 시작. R-W 해제, `ah-r-w` 제거.
- 2026-10-26: W2 완료(`034b0cb`, `6a4636c`) — H7 자동 검사는 비어 있지 않은 마지막 답과 두 worktree 무변경만 보고(검사 id `asks_the_user` → `final_answer`), worktree 질문의 의미는 rubric(judge)이 본다. `transcript.ts`가 `command doan …`을 호출로 풀고 `command -v/-V`와 인용 텍스트는 호출로 보지 않는다. POSTMORTEM 2026-10-24 항목에 재발 줄. red 뒤 green, 리뷰 재현이 더는 재현되지 않음. 통합(`698a15d`, `3b9e01f`), eval 테스트 153·self-test 19개 PASS(지휘자 실행). 리뷰 제안을 그대로 적용해 재리뷰는 생략한다. W2 해제, `ah-w2` 제거.
- 2026-10-26: D 완료(`c383dab`, `400ffd3`, `ead61e3`, `0de7597`) — Hand off 대화상자(머리·카드·Review Done 진입점, 고정 행, All/None/Selection, 미리보기, worktree 안내, 복사 중·실패·`not_open`·성공 상태, 키보드·포커스), (root, canvas id)별 Handed off(요청 정체성으로 판정), 우선순위 체인, DESIGN.md 새 절. red 뒤 green, 가드별 변이 검사, test 2816·typecheck 통과. `/design-sync` 240쌍·14상태, 분류 안 된 차이 0(실제 상태 unchanged, 클립보드 복원). 자체 독립 리뷰(같은 계열) 🟡1 고침, ⚪1(대화상자가 정체성 변경으로 닫히면 포커스가 body)·⚪2(겹친 두 복사는 늦게 끝난 쪽이 Handed off) 기록. 계획과 다른 점(받아들임): detached 맥락 줄은 폴더 이름(결정), 단수 거부 문구 추가, 실패·거부 뒤 포커스는 대화상자에 남음, Selection은 연 시점의 선택과 앵커를 쓴다. 통합(`c8cb694`…`f905256`), 통합 HEAD test 2821·typecheck 통과(지휘자 실행). 측정 스크립트는 `.scratch/design-sync/agent-handoff/`로 옮겼다. D 해제, `ah-d` 제거. 3파 시작 — R-D(Codex `gpt-6-astra` medium, 다른 계열), T(Opus high, `ah-t`).
