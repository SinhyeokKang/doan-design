# project-feedback — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `9099d86`(main)
- 통합 브랜치: `feat-project-feedback`(main에서 만듦)
- 지휘: Claude Code(Opus). review-loop 체인 링크 5, 마지막 링크(`.scratch/handoff/review-loop-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/project-feedback/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-26 | 사용자 확인 질문을 하지 않고 권장안대로 진행한다. 결정 지점에서는 지휘자가 권장안을 골라 이 로그에 근거와 함께 적는다. 실제 사용자 상태를 바꾸는 일은 예외로 묻는다 | 사용자(체인 규칙, "이 루프 링크는 가능한 내 허가 없이 추천안대로 쭉 진행해", "링크 5까지 전부 다") |
| 2026-10-26 | 구현은 Claude Opus가 맡고 Codex를 적당히 섞는다. 배치 S(skill과 H8)는 Codex `gpt-6-astra` medium, 독립 리뷰 일부는 Codex `gpt-6-astra` medium이 다른 계열로 읽는다. 쓸 때마다 진행 기록에 적는다 | 사용자(체인 규칙, "Codex 적당히 섞어 써도 괜찮아. 주 업무는 클로드 코드가 진행하되 적당히 섞어 사용해") |
| 2026-10-26 | 이 링크의 PR은 통합과 `/verify` 통과 뒤 main에 병합한다(`/orchestrate`의 병합 금지를 이 체인에서만 대체). 병합 뒤 main에서 `/doc-check`를 한 번 돌리고 문서별로 커밋해 main에 push한다 | 사용자(체인 규칙, "링크마다 메인에 병합하면서 간다"), 체인 문서 '링크 5' |
| 2026-10-26 | tasks 2와 4의 `/tdd`는 따로 배치를 두지 않는다. 각 구현 배치가 자기 범위의 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다(`/ship`의 tdd 단계) | 지휘자 판단 — 링크 1~4와 같은 방식 |
| 2026-10-26 | tasks 1 측정 명령: `node .scratch/project-feedback/measure.mjs`(Playwright `_electron`, `app/e2e/runtime.ts`와 같은 격리). 1단계(배치 M, 지금): 기존 `comments:project` 읽기·fold 시간과 연속 저장 중 무효화·다시 읽기 빈도. 2단계(배치 V1 끝): 같은 스크립트로 Feedback 첫 렌더 시간. 1단계가 기준을 넘으면 배치 N을 멈추고 지휘자가 설계를 정한다 | 지휘자 판단 — tasks 1의 'command undecided'. Feedback 패널은 V1 전에는 없으므로 첫 렌더는 그 뒤에만 잴 수 있다. `/design-sync`의 `measure.mjs` 형식을 따른다 |
| 2026-10-26 | tasks 8 실제 `/agent-eval` 회차는 배치 A(Opus medium)가 자기 worktree에서 S 통합 뒤 돌린다. 실제 에이전트 두 종과 다른 계열 judge를 쓰는 것은 상설 예외다 | 체인 규칙(유일한 실제 회차), AGENTS.md 'Runtime differences' 상설 예외 |
| 2026-10-26 | tasks 9의 런타임 시나리오는 새 모듈 `app/e2e/project-feedback.ts`에 둔다(tasks 9 그대로) | tasks 9 |
| 2026-10-26 | tasks 11 남은 참조 검사: `git grep -n -e 'No canvas open' -e 'docs/features/project-feedback' -- . ':!docs/features/*' ':!design/*'`. 결과 중 제품 문구가 아닌 것은 내용을 보고 판정한다 | 지휘자 판단 — 링크 1~4와 같은 git grep 형식. design-nav의 "No canvas open"이 Overview에서 Feedback으로 바뀐다(캔버스 화면의 다른 쓰임은 남을 수 있다) |
| 2026-10-26 | 체인 마무리: G가 `docs/features/ux-audit-261025-2/report.md`의 L-·N- 항목을 병합된 다섯 기능과 대조하고, 덮이지 않은 항목은 PRODUCT §8 열린 질문이나 후속 메모로 옮긴 뒤 그 디렉터리를 지운다(사본은 `.scratch/orch/project-feedback/`) | 체인 문서 '링크 5' |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M | 1(1단계) | `.scratch/project-feedback/` 스크립트, 이 디렉터리 `tasks.md` 1의 결과 줄 | — | Opus medium (격리된 실제 앱 실행, 판단은 적음) | 스크립트 exit 0, real-state 무변경, 결과 기록 | 대기 |
| C | 2·3 | `cli/internal/cli/read.go`, `cli/internal/check/check.go`, `cli/internal/repo/`, `cli/internal/cli/mcp.go`, Go 테스트(`TestMCPEnvelopeParity` 포함) | — | Opus high (`ls` 계약 변경, 부분 실패 경계, symlink·권한) | `go test ./...` red→green, `go vet ./...` | 대기 |
| T4 | 4 | 새 순수 모듈(`feedbackGroups`·`idChangeNotice`·`homeSummary`·`orphanWriteAllowed`·`feedbackFocusAfterRemoval`), `app/src/main/view.ts`, `folderState.ts`, `app/src/main/cli.ts`의 `FolderView` 타입, 각 테스트 | — | Opus high (묶음·정렬 규칙과 쓰기 권한 판정) | test red→green, typecheck | 대기 |
| N | 5 | `app/src/main/projectComments.ts`, `app/src/main/comments/{service,identity,files}.ts`, `senderAllowed.ts`, `index.ts`, `app/src/preload/index.ts`, 각 테스트 | T4 통합, M 결과 | Opus high (쓰기 권한 확장, 만들지 않는 append, 판정과 쓰기 사이 경합) | test red→green, typecheck | 대기 |
| S | 7 | `cli/internal/cli/skill.md`, `skill_test.go`, 새 `eval/scenarios/H8/`, eval 단위 테스트 | C 통합 | Codex `gpt-6-astra` medium (skill 문구는 정해져 있고, H8 fail fixture 판정에 판단이 든다) | `go test ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS | 대기 |
| V2 | 6(트리·Home·Overview 카드 오류) | `Sidebar.tsx`, `Home.tsx`, `homeCards.ts`, `ProjectOverview.tsx`, 행 오류일 때 Comments 패널의 "Couldn’t read comments"에 필요한 범위, `styles.css`, 각 테스트 | T4 통합 | Opus medium (확정 초안 `tree-errors`, `home-summary`의 표시 변경) | test, typecheck | 대기 |
| V1 | 6(Feedback 패널, 고아 카드, id 변경 안내), `/design-sync`, 1(2단계) | 새 `FeedbackPanel.tsx`, `RightPanel.tsx`, `CommentsPanel.tsx`, `CommentsSession.ts`, `useComments.tsx`, `CanvasController.ts`(이전 id 기억), `App.tsx`, `styles.css`, 각 테스트, `docs/DESIGN.md`(이 표면), `.scratch/design-sync/project-feedback/` | N·V2 통합 | Opus high (tree 키보드와 포커스, 초안 가드, 고아 쓰기 상태, 늦은 응답 버리기) | test, typecheck, `/design-sync` 측정 일치, 첫 렌더 1초 이내 | 대기 |
| A | 8 | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/<round>/` | S 통합 | Opus medium (`/agent-eval` 절차 실행과 기록) | 새 시나리오 두 에이전트 2/2, R1·R2b 이전보다 나쁘지 않음 | 대기 |
| E | 9 | 새 `app/e2e/project-feedback.ts`, `runtime.ts` 가져오기, 낡은 단언이 생긴 다른 e2e 모듈 | V1 통합 | Opus high (실제 창, chmod 읽기 불가, 판정 뒤 캔버스 복원 경합) | 모듈 단독 실행 PASS(전체 e2e는 지휘자) | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | Codex `gpt-6-astra` medium과 Opus를 번갈아 쓴다(배치별로 진행 기록에 적는다) | `/code-review`, 🔴 0 | — |
| 지휘자 | 10 | — | 전부 통합 | — | `node .agents/skills/verify/scripts/verify.mjs --runtime --eval` 최종 PASS, exit 0 | 대기 |
| G | 11, 체인 마무리 1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/USABILITY-EVAL.md`, `docs/DIRECTORY.md`, `docs/features/project-feedback/`·`docs/features/ux-audit-261025-2/` 삭제 | 10, A | Opus medium (승격 위치가 tasks 11에 다 나와 있다) | 문서 diff 검토, 위 git grep 결과 판정 | 대기 |

tasks.md의 1~11은 모두 위 배치 중 하나에 속한다(2·4의 tdd는 각 배치 안, 10은 지휘자).

## 순서와 파일 겹침

- 1파: M ∥ C ∥ T4. M은 `.scratch`와 tasks 1 결과 줄만, C는 Go만, T4는 새 순수 모듈과 main의 `view.ts`·`folderState.ts`·`cli.ts` 타입만 고친다.
- 2파: N(T4·M 뒤) ∥ S(C 뒤) ∥ V2(T4 뒤). N은 main·preload, S는 skill·eval, V2는 renderer의 트리·Home·Overview만 고친다.
- 3파: V1(N·V2 뒤) ∥ A(S 뒤). V1은 V2와 `styles.css`·Comments 패널을 나눠 쓰므로 V2 뒤에 돈다.
- 4파: E(V1 뒤). 그 뒤 지휘자 `/verify --runtime --eval`, G, PR, 병합, main에서 `/doc-check`.
- 각 배치는 `--worktree new-child --base-branch feat-project-feedback`로 만든 자기 worktree에서 돈다.
- 링크 1~4에서 남은 일: 화면 잠금 때문에 전체 runtime 묶음이 comments-ui 08에서 멈췄다. 이 링크의 `verify --runtime` 전에 `ioreg -n Root -d1`로 잠금 상태를 확인한다. 풀려 있으면 이 실행이 링크 1~4도 덮는다. 잠겨 있으면 통과로 세지 않고 그대로 보고하고, 나머지 모듈을 단독으로 돌린다.

## 진행 기록

- 2026-10-26: 시작. 이전 지휘 터미널을 닫았다. 화면 잠금 상태 `CGSSessionScreenIsLocked = Yes`.
