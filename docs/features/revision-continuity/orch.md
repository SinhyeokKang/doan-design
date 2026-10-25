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
| 2026-10-26 | 이 기능은 CLI·MCP·skills·공유 형식을 바꾸지 않으므로 `/agent-eval` 회차를 돌리지 않는다. 체인의 유일한 실제 회차는 링크 5다 | spec '사용자', design 'CLI·MCP·skills·공유 형식: 바뀌지 않는다', 체인 규칙 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M1 | 1 | `.scratch/revision-continuity/save-*` | — | Opus medium (스크립트는 단순하고, 격리와 원시 로그 기록이 핵심) | 원시 로그 경로와 요약, real-state 확인 결과 | 완료(커밋 없음), 해제·worktree 제거 |
| M2 | 2 | `.scratch/revision-continuity/t11*` | — | Opus medium (현재 main을 측정만 한다) | 측정 로그·스크린샷 경로, 재현 여부, real-state, exit 0 | 완료(재현, 커밋 없음), 해제·worktree 제거 |
| P | 3, 4 | 순수 함수와 그 테스트: `app/src/comments/draft.ts`, `app/src/renderer/{canvasView,selection}.ts`, `app/src/restore/{uiState,restorePlan}.ts`, `app/src/main/watch.ts`의 `createRefresher`, `classifyDesignChange`의 새 파일, `shouldGuardEscape`·`continueEnabled`·`guardsSelectionChange`의 자리 | — (`classifyDesignChange`·names 누적은 M1 결과 뒤) | Opus high (draft guard와 선택 정체성의 규칙을 정하는 함수들이다) | `npm --prefix app test` red→green, `typecheck` | 대기 |
| A | 5 | `app/src/main/{watch,shell,thumbnails,view}.ts`와 테스트 | P 통합 | Opus high (폐기된 읽기, rev 유실, 루트 삭제 등 동시성) | test(watch·shell·thumbnails), typecheck | 대기 |
| B6 | 6 | `CommentsSession.ts`, `useComments.tsx`, `CommentsPanel.tsx`, `CanvasController.ts`, `draft.ts` 연결, `styles.css`와 각 테스트 | P 통합 | Opus high (begin 펜스, guard 수명, 늦은 완료) | test, typecheck | 대기 |
| B7 | 7 | B6 파일 + `activity.ts`, `Sidebar.tsx`, `App.tsx`, `app/src/main/uiState.ts`와 테스트 | B6 통합 | Opus high (이동 따라가기의 요청 상태 판정, 진행 중 read 무효화) | test, typecheck | 대기 |
| B8 | 8 | `CanvasController.ts`, `useComments.tsx`, `CommentsPanel.tsx`, `commentAnchors.ts`와 테스트 | B7 통합, M2 결과 | Opus high (Esc 기본 동작과 범위 효과에, T-11이 재현되어 앵커 pending의 수명이 더해진다) | test, typecheck | 대기 |
| E | 9, design-sync | `app/e2e/revision-continuity.ts`, `app/e2e/runtime.ts` import, design-sync가 고칠 렌더러 CSS·마크업, `docs/DESIGN.md`, `.scratch/design-sync/revision-continuity/` | B8 통합 | Opus high (iframe 교체를 지나는 폴링, 재시작 시나리오, 실측 비교) | 모듈 단독 실행 PASS(전체 e2e는 지휘자), design-sync 완료 조건 | 대기 |
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
