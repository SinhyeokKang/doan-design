# revision-continuity — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `f44f0f5`(main)
- 통합 브랜치: `feat-revision-continuity`(main에서 만듦)
- 지휘: Claude Code(Opus). review-loop 체인 링크 1(`.scratch/handoff/review-loop-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/revision-continuity/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-25 | 작업자와 리뷰어는 모두 Opus다. effort는 high 이하다. 독립 리뷰는 구현하지 않은 별도 Opus 작업자가 `/code-review`로 한다 | 사용자(체인 규칙) |
| 2026-10-25 | 이 링크의 PR은 통합과 `/verify` 통과 뒤 main에 병합한다(`/orchestrate`의 병합 금지를 이 체인에서만 대체) | 사용자(체인 규칙, "링크마다 메인에 병합하면서 간다") |
| 2026-10-26 | tasks 1 측정: 작업자가 `.scratch/revision-continuity/save-watch.mjs`를 만든다. /tmp 임시 git 저장소의 `design/`에 recursive `fs.watch`를 걸고 (watch path, event, filename) 원시 로그를 남긴다. `claude -p --allowedTools Write Edit`, `codex exec`(apply_patch), `mv`, `git checkout`, 임시 파일 뒤 rename으로 HTML을 바꾼다. 에이전트는 eval처럼 실제 설정을 물려받아 인증하고, 전후로 `real-state.ts`가 실제 상태를 확인한다. **이 측정 한 번에 한해 Codex 실행(모델 경계 넘기)을 허락한다** | 사용자 답변(권장안) |
| 2026-10-26 | tasks 2 측정: 작업자가 `.scratch/revision-continuity/t11.mjs`(Playwright `_electron`, 격리된 HOME·SHELL·userData, `DOAN_CLI`, `DOAN_RUNTIME`)를 만든다. 0/100/300/800ms 샘플을 5회 반복하고 `real-state.ts`로 확인한 뒤 exit 0으로 끝낸다 | 사용자 답변(권장안) |
| 2026-10-26 | tasks 11 남은 참조 검사: `git grep -n -e 'revision-continuity' -e 'features/revision-continuity' -- . ':!docs/features/*' ':!design/*'` | 사용자 답변(권장안) |
| 2026-10-26 | 새 표면(`continue-draft`, `selection-gone`, `duplicate-id`의 새 요소)은 확정 초안 `design/revision-continuity.html`에 대고 `/design-sync`를 돌린다. tasks.md에 따로 항목이 없으므로 배치 E가 tasks 9와 함께 맡는다 | 지휘자 판단 — 체인 규칙("새 표면은 design-sync"), design.md '초안 요청'의 비교 대상 |
| 2026-10-26 | 측정 결과(tasks 1·2)는 작업자가 인계 문서에 적고, 지휘자가 tasks.md 해당 항목 아래에 옮긴다 | 지휘자 판단 — 두 측정 배치가 같은 파일을 동시에 고치지 않게 한다 |
| 2026-10-26 | **사용자 확인 질문을 하지 않고 권장안대로 진행한다.** 결정 지점에서는 지휘자가 권장안을 골라 이 로그에 근거와 함께 적는다. 실제 사용자 상태를 바꾸는 일처럼 되돌리기 어려운 일은 예외로 묻는다 | 사용자 지시("이 루프 링크는 가능한 내 허가 없이 추천안대로 쭉 진행해") |
| 2026-10-26 | Codex를 적당히 섞어 쓴다. 구현 배치는 Claude Opus가 맡고, 독립 리뷰 일부(R-P, R-A, R-B7, R-E)는 Codex Astra medium이 다른 계열로 읽는다. 첫 줄의 'Opus 단일' 규칙을 대체한다. 쓸 때마다 이 로그에 적는다 | 사용자 지시("모델 경계도 필요하다면 넘어도 괜찮아. Codex 허가할게", "Codex 적당히 섞어 써도 괜찮아. 주 업무는 클로드 코드가 진행하되 적당히 섞어 사용해") |
| 2026-10-26 | M1 측정에서 Claude Code 저장에 임시 이름이 섞였다. design 2절에 '임시 형제 규칙'(대상 `.html`이 같은 집합에 있을 때 `<대상>.tmp…`·`.<대상>.tmp…`를 판정에서 뺌)을 더하고, Q1은 유지한다 | 지휘자 판단(위임) — 측정 근거 `save-watch-summary.md`. 판정이 틀리면 리로드가 한 번 더 일어날 뿐이고, 대상이 없으면 지금처럼 bump한다. 측정한 패턴만 다룬다 |
| 2026-10-26 | T-11이 재현됐으므로 design 7절의 리로드 부분(새 문서의 앵커가 응답할 때까지 이전 배지·Selection 목록 유지)을 B8이 구현한다. B8과 R-B8을 high로 올린다. 스크린샷을 찍을 때만 보인 150px 정지는 B8·E가 재현하면 보고하게 한다 | tasks 2 재현 기준(한 샘플이라도), M2 결과 |
| 2026-10-26 | P를 리뷰 전에 통합하고 A·B6를 바로 시작한다. R-P의 지적은 그 파일을 지금 가진 배치(main → A, draft·renderer → B6, restore → B7)로 보낸다 | 지휘자 판단 — 순수 함수라 테스트 2189개와 typecheck가 통과한 상태에서 통합해도 위험이 낮고, 2파를 리뷰 뒤로 미루면 대기만 길어진다. 이전 체인의 '늦은 리뷰 지적은 지금 소유한 배치로' 규칙 |
| 2026-10-26 | B7을 R-B6과 병렬로 시작한다. R-B6의 지적 중 B7이 가진 파일의 것은 B7 통합 뒤 새 수정 작업자에게 보낸다 | 지휘자 판단 — B6 test 2239·typecheck 통과, B7은 B6 파일을 이어 받으므로 리뷰를 기다리면 직렬 대기만 길어진다 |
| 2026-10-26 | R-B7 🟡 3건(이동 뒤 검토 확인 무응답 → 검토·복구 중 카드는 R2대로 이동 차단, 접힌 트리 행이 이동 뒤 펼쳐짐 → 이동에서는 새 조상만 펼침, Activity가 경로 키라 이전 id 기록이 섞임 → (root, canvas id) 키)은 B8 통합 뒤 새 작업자 B7fix(Opus high)가 고친다 | 지휘자 판단 — 세 수정이 B8이 지금 가진 `CommentsSession.ts`·`CanvasController.ts`와 겹친다. 고칠 방향은 design 3절과 키 원칙이 이미 정했다 |
| 2026-10-26 | E를 둘로 나눈다. E1은 지금 e2e 모듈만 쓰고 모듈 단독 실행(`npm --prefix app run build` 뒤 `node app/e2e/revision-continuity.ts`)으로 확인한다. E2는 B8·B7fix 통합 뒤 모듈을 다시 돌리고 `/design-sync`를 한다 | 지휘자 판단 — e2e 파일만 고치므로 B8과 겹치지 않는다. 모듈 단독 실행은 전체 묶음이 아니라서 '전체 e2e는 지휘자만' 규칙과 맞는다. 작업자는 완료 뒤 후속 지시를 놓치기 쉬우므로 2단계는 새 작업자가 맡는다 |
| 2026-10-26 | 리로드 뒤 iframe이 150px에 멈추는 현상(M2: 스크린샷을 찍을 때 2/10, B8: 찍지 않아도 1/20)은 조사 배치 S(Opus high, 코드 수정 없음)가 원인을 찾고, 고침은 결과를 보고 정한다 | 지휘자 판단 — 핀이 사라지고 Reload로만 돌아오므로 리뷰 흐름을 끊는 결함이다. 기존부터 있었는지 먼저 확인해야 범위를 정할 수 있다 |
| 2026-10-26 | 이 기능은 CLI·MCP·skills·공유 형식을 바꾸지 않으므로 `/agent-eval` 회차를 돌리지 않는다. 체인의 유일한 실제 회차는 링크 5다 | spec '사용자', design 'CLI·MCP·skills·공유 형식: 바뀌지 않는다', 체인 규칙 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M1 | 1 | `.scratch/revision-continuity/save-*` | — | Opus medium (스크립트는 단순하고, 격리와 원시 로그 기록이 핵심) | 원시 로그 경로와 요약, real-state 확인 결과 | 완료(커밋 없음), 해제·worktree 제거 |
| M2 | 2 | `.scratch/revision-continuity/t11*` | — | Opus medium (현재 main을 측정만 한다) | 측정 로그·스크린샷 경로, 재현 여부, real-state, exit 0 | 완료(재현, 커밋 없음), 해제·worktree 제거 |
| P | 3, 4 | 순수 함수와 그 테스트: `app/src/comments/draft.ts`, `app/src/renderer/{canvasView,selection}.ts`, `app/src/restore/{uiState,restorePlan}.ts`, `app/src/main/watch.ts`의 `createRefresher`, `classifyDesignChange`의 새 파일, `shouldGuardEscape`·`continueEnabled`·`guardsSelectionChange`의 자리 | — (`classifyDesignChange`·names 누적은 M1 결과 뒤) | Opus high (draft guard와 선택 정체성의 규칙을 정하는 함수들이다) | `npm --prefix app test` red→green, `typecheck` | 통합 47c8573, 1be53c7, 6089517 · 리뷰 R-P 진행 |
| A | 5 | `app/src/main/{watch,shell,thumbnails,view}.ts`와 테스트 | P 통합 | Opus high (폐기된 읽기, rev 유실, 루트 삭제 등 동시성) | test(watch·shell·thumbnails), typecheck | 통합 1046d17 · 리뷰 R-A 진행 |
| B6 | 6 | `CommentsSession.ts`, `useComments.tsx`, `CommentsPanel.tsx`, `CanvasController.ts`, `draft.ts` 연결, `styles.css`와 각 테스트 | P 통합 | Opus high (begin 펜스, guard 수명, 늦은 완료) | test, typecheck | 통합 03bf480 · 리뷰 R-B6 진행 |
| B7 | 7 | B6 파일 + `activity.ts`, `Sidebar.tsx`, `App.tsx`, `app/src/main/uiState.ts`와 테스트 | B6 통합 | Opus high (이동 따라가기의 요청 상태 판정, 진행 중 read 무효화) | test, typecheck | 통합 5b02787 · 리뷰 R-B7 진행 |
| B8 | 8 | `CanvasController.ts`, `useComments.tsx`, `CommentsPanel.tsx`, `commentAnchors.ts`와 테스트 | B7 통합, M2 결과 | Opus high (Esc 기본 동작과 범위 효과에, T-11이 재현되어 앵커 pending의 수명이 더해진다) | test, typecheck | 통합 2ad0fff · 리뷰 R-B8 진행 |
| E1·E2 | 9, design-sync | `app/e2e/revision-continuity.ts`, `app/e2e/runtime.ts` import, design-sync가 고칠 렌더러 CSS·마크업, `docs/DESIGN.md`, `.scratch/design-sync/revision-continuity/` | B8 통합 | Opus high (iframe 교체를 지나는 폴링, 재시작 시나리오, 실측 비교) | 모듈 단독 실행 PASS(전체 e2e는 지휘자), design-sync 완료 조건 | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | R-P·R-A·R-B7·R-E: Codex Astra medium (다른 계열의 읽기). R-B6·R-B8: Opus high | `/code-review`, 🔴 0 | — |
| 지휘자 | 10 | — | 전부 통합 | — | `node .agents/skills/verify/scripts/verify.mjs --runtime` 최종 PASS, exit 0 | 대기 |
| G | 11 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`(E가 쓴 것 외), 이 디렉터리 삭제 | 10 | Opus medium (승격 위치가 tasks 11에 다 나와 있다) | 문서 diff 검토, 위 git grep 결과 없음 | 대기 |

tasks.md의 1~11은 모두 위 배치 중 하나에 속한다.

## 순서와 파일 겹침

- 1파: M1 ∥ M2 ∥ P. P는 `classifyDesignChange`와 refresher names 누적을 마지막에 하고, 시작 전에 M1 결과를 지휘자에게 묻는다. 임시 이름이 섞이면 design 2절과 Q1을 사용자에게 다시 묻는다.
- 2파: A ∥ B6(P 통합 뒤). A는 main만, B6는 renderer만 고친다.
- 3파: B7(B6 통합 뒤). `app/src/main/uiState.ts`는 A가 건드리지 않는다.
- 4파: B8(B7 통합 뒤, M2 결과 반영).
- 5파: E(B8 통합 뒤). 그 뒤 지휘자 `/verify --runtime`, G, PR, 병합.
- 각 배치는 `--worktree new-child --base-branch feat-revision-continuity`로 만든 자기 worktree에서 돈다.

## 진행 기록

- 2026-10-26: Run `run_bcc4b8f353c5`. 1파 시작 — M1(`ctx_9253d68c30ac`, Opus medium, `rc-m1`), M2(`ctx_1f3cf5ba5a8d`, Opus medium, `rc-m2`), P(`ctx_161ede35bc9f`, Opus high, `rc-p`). `launch.effective`가 요청과 같다.
- 2026-10-26: M1 완료. Claude Code Write·Edit는 임시 이름 뒤 rename, Codex apply_patch는 제자리 변경이다(Codex 실행 1회, 사용자 허락). 실제 상태는 바뀌지 않았다. design 2절에 임시 형제 규칙을 더했다. M1 해제, `rc-m1` 제거.
- 2026-10-26: M2 완료. T-11이 재현됐다(리로드마다 Selection 목록이 비고 핀이 15–45ms 사라짐, Canvas 범위에서 6~7/10은 Location unavailable). 실제 상태는 바뀌지 않았다. M2 해제, `rc-m2` 제거.
- 2026-10-26: P 완료(`c26eb63`, `e8e8a9b`, `61c60af`) — red 63건 확인 뒤 green. 통합(`47c8573`, `1be53c7`, `6089517`), 통합 HEAD test 2189·typecheck 통과(지휘자 실행). `classifyDesignChange`는 새 파일 `app/src/main/designChange.ts`. B7 전까지 옮겨진 캔버스는 옛 경로에 머무는 중간 상태다(P 인계). P 해제, `rc-p` 제거.
- 2026-10-26: 2파 시작 — A(`ctx_1b45994c9f6f`, Opus high, `rc-a`), B6(`ctx_80a1f9aeb851`, Opus high, `rc-b6`), R-P(`ctx_1b37ed41c5e9`, Codex `gpt-6-astra` medium, `rc-r-p`). `launch.effective`가 요청과 같다.
- 2026-10-26: B6 질문 — 같은 캔버스 클릭과 Alt-클릭 링크 이동이 같은 transition-intent로 온다. 결정: `canvasScript.ts`의 transition-intent에 `kind: selection | navigation`을 더한다(B6 소유로 추가). 링크 이동의 가드를 유지하기 위해서다.
- 2026-10-26: R-P 완료(Codex Astra medium) — 🔴 0 · 🟡 0 · ⚪ 1(같은 갱신에서 id 변경과 servedRev 변경이 함께 올 때의 우선순위 테스트 공백, 변형 검사로 확인). ⚪은 `canvasView.ts`를 연결하는 B7에 보낸다. 근거: `evidence-R-P/`. R-P 해제, `rc-r-p` 제거.
- 2026-10-26: B6 질문 2 — 로딩 중이면 identity와 관계없이 `reloaded`로 두는 P의 규칙은 id가 바뀐 다른 캔버스에서도 이어 쓰기를 허용한다. 결정: identity를 알고 origin과 root·id가 다르면 로딩 중에도 `unavailable`이다. design 1절의 '로딩 중 일단 reloaded'는 새 문서를 아직 모를 때만 적용한다.
- 2026-10-26: A 완료(`f2dd832`) — red(watch 5·shell 3·thumbnails 1) 뒤 green. 통합(`1046d17`), 통합 HEAD test 2198·typecheck 통과(지휘자 실행). 열린 캔버스 자신의 저장은 이제 servedRev가 아니라 행 rev로 리로드된다(e2e C7이 이 경로에 기댄다 — 최종 e2e에서 확인). 심볼릭 링크 `design`은 served 대상으로 남아 전과 같이 bump한다. A 해제, `rc-a` 제거. R-A(`ctx_a699ea35f964`, Codex `gpt-6-astra` medium, `rc-r-a`) 시작.
- 2026-10-26: B6 완료(`9b5ba7b`) — red 뒤 green. 승인한 확장 2건(transition-intent `kind`, `loss()` 규칙). 통합(`03bf480`), 통합 HEAD test 2239·typecheck 통과(지휘자 실행). "Continues on …" 미리보기는 지금의 `targetText`를 쓴다(더 풍부한 라벨은 comments-readability 범위). B6 해제, `rc-b6` 제거.
- 2026-10-26: B7(`ctx_56974e4965ee`, Opus high, `rc-b7`)과 R-B6(`ctx_309fc869ea48`, Opus high, `rc-r-b6`) 시작. B7에 R-P ⚪(id 변경과 servedRev 동시 변경 테스트)와 B6의 요청(이동 중 begin 무효화)을 넣었다.
- 2026-10-26: R-A 완료(Codex Astra medium) — 🔴 0 · 🟡 0 · ⚪ 0. 승격(G) 주의: ARCH §3의 'Signatures are computed once per root/servedRev'는 여전히 사실이므로 지우지 말고 행 rev 기반 선택적 재확인을 더한다. 실행 중 놓친 이벤트가 썸네일을 바로 고치지 못하는 한계는 이전부터 있던 것이다. R-A 해제, `rc-r-a` 제거.
- 2026-10-26: B7 질문 — 중복 id 띠가 초안대로 `.ov` 안 첫 자식이 되려면 `ProjectOverview.tsx`에 선택적 `notice` prop이 필요하다. 허락했다(B7 소유로 추가).
- 2026-10-26: B7 질문 — Activity Moved 행은 `RightPanel.tsx`에 있다. 허락했다. 이후 B7이 필요로 하는 renderer 파일은 묻지 않고 가져가되 인계에 적게 했다(지금 renderer에서 도는 다른 배치가 없다).
- 2026-10-26: R-B6 완료(Opus high) — 🔴 0 · 🟡 1 · ⚪ 5. 🟡: 같은 경로에서 canvas id가 사라진 채 리로드되면 identity가 null이라 `loss()`가 `reloaded`를 돌려주고, 눌러도 아무 일도 없는 Continue가 활성으로 보인다(세션·훅 테스트로 재현). design 1절("identity가 없으면 unavailable")대로 고친다. 결정: 🟡와 ⚪4(render 중 `canvasOffered` 쓰기), ⚪5(`useId`, 선택 변경 빠른 반환의 가정 테스트)는 B7 뒤 같은 파일을 이어 받는 B8에 넣는다. ⚪3(실패 뒤 포커스, 중첩 iframe blur)은 E의 실제 앱 확인에 넣는다. ⚪1(리로드 없이 선택만 사라져도 'reloaded' 문구)과 ⚪2(쓰기 차단·작성자 미준비 때 Continue 상태)는 spec의 비활성 이유 목록 밖이라 고치지 않고 승격 때 알려진 한계로 적는다. 근거: `evidence-R-B6/`. R-B6 해제, `rc-r-b6` 제거.
- 2026-10-26: B7 완료(`7963c80`) — red 23건 뒤 green. 승인한 확장 2건(`ProjectOverview.tsx` notice, `RightPanel.tsx` Moved 행). 계획과 다른 점: `canFollow`는 진행 중·불확실한 카드 상태만 막는다(끝난 `cardPending` 항목이 영원히 막는 것을 피함), Moved 행은 이동을 본 시점에 남긴다, `rename`이 `copies`도 비운다, 한 커밋. `App.tsx` 연결은 typecheck만 거쳤고 E의 e2e가 확인한다. 통합(`5b02787`), 통합 HEAD test 2267·typecheck 통과(지휘자 실행). B7 해제, `rc-b7` 제거.
- 2026-10-26: B8(`ctx_697cf7c49852`, Opus high, `rc-b8`)과 R-B7(`ctx_605ba2093612`, Codex `gpt-6-astra` medium, `rc-r-b7`) 시작.
- 2026-10-26: R-B7 완료(Codex Astra medium) — 🔴 0 · 🟡 3 · ⚪ 0, 세 가지 모두 재현 테스트로 확인(`evidence-R-B7/`). B7fix로 보낸다(결정 로그). R-B7 해제, `rc-r-b7` 제거.
- 2026-10-26: E1(`ctx_71bd48a94dde`, Opus high, `rc-e1`) 시작.
- 2026-10-26: B8 완료(`d99345c`) — red 14건 뒤 green. t11 재측정: 빈 Selection 목록 20/20→0/20, Location unavailable 6/10→0/10, Canvas 범위 유지 10/10. 핀은 설계대로 새 layout 뒤 다시 그린다. 150px 정지 1/20이 스크린샷 없이도 나왔다. 통합(`2ad0fff`), 통합 HEAD test 2282·typecheck 통과(지휘자 실행). B8 해제, `rc-b8` 제거.
- 2026-10-26: B7fix(`ctx_21a2e85acf67`, Opus high, `rc-b7fix`), S(`ctx_3e19e22189e5`, Opus high, `rc-s`), R-B8(`ctx_d1233d7cc313`, Opus high, `rc-r-b8`) 시작.
- 2026-10-26: E1 완료(`1f2393a`) — 모듈 단독 실행(B8 전 기준)에서 1·2·2c·4·8 통과, 3(이동 뒤 접은 행이 펼쳐짐 = R-B7 🟡2)·5·6·7(B8 범위) 실패로 예상과 같다. 실패한 이어 쓰기 뒤 포커스는 다시 활성이 된 버튼에 남는다(R-B6 ⚪3 확인). T-11 간격은 기록만 한다. 통합(`2501505`), typecheck 통과. 근거: `evidence-E1/`. E1 해제, `rc-e1` 제거.
- 2026-10-26: B7fix 완료(`faf851a`, `ff89231`, `c7b5a90`) — 지적마다 red 뒤 green. 카드 판정은 보이는 상태(`mutations`) 기준으로 끝나지 않은 상태를 모두 막고, 이동에서는 새 조상만 펼치며, Activity는 (root, canvas id)로 묶는다(`moveActivity` 제거). 통합(`f79472c`, `81c0db9`, `79d12f1`), 통합 HEAD test 2293·typecheck 통과(지휘자 실행). B7fix 해제, `rc-b7fix` 제거. 재리뷰 R-B7fix(Codex `gpt-6-astra` medium) 시작.
