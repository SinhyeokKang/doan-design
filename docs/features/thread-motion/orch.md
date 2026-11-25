# 스레드 모션 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261125-1](../chain-261125-1/chain.md)의 링크 2(마지막 링크)다.
- 시작 해시: `7ca65fbb6` (origin/develop. thread-edit-lines #391 `46f91b070`, handoff-card-emphasis #392 `9d4559e59` 포함. 그 뒤 develop에는 체인 파일 커밋 `2c28aed0c`만 있다)
- 통합 브랜치: `feat/thread-motion`
- 런타임: conductor와 워커 모두 Claude. 모델 계열을 넘지 않는다.

## 결정 기록

- T1(드래프트와 모션 결정)은 끝났다. 드래프트 `.doan/canvases/thread-motion.html`(프레임 `entry`, `stream`, `scroll`, `reduced`)을 사용자가 2026-11-25에 확정했고, 토큰 `--time-thread-enter`(400ms)는 이미 `tokens.css`와 DESIGN.md에 있다. — conductor 판단, 근거: 체인 파일 '순서' 2, design.md '드래프트 요청'.
- 기능 문서는 #391, #392 머지 전에 쓰였다. 줄 번호 참조는 맞지 않을 수 있으므로 워커는 이름으로 찾고, #392의 새 카드 구조(`.card-surface`, `.card-layout`, `.card-head`, `.cc-banner`, `.cc-meta`), `ConversationThread`의 `now`·`thumbnails` prop, `CardThumbnails`의 IntersectionObserver 위에서 시작한다. — conductor 판단, 근거: PR #392 'For link 2'.
- 스레드를 다시 마운트하거나 늦추는 모션은 썸네일 hub의 `LEAVE_MS`(2초) 창을 넘기지 않는다. 진입과 점진 표시는 스레드를 다시 마운트하지 않는다. — conductor 판단, 근거: PR #392 'Hub timing'.
- T2 PoC의 임시 점진 표시 루프는 커밋하지 않는다. 측정 스크립트는 `.scratch/thread-motion/`에, 측정값과 결론은 design.md 'PoC'에 남긴다. — conductor 판단, 근거: AGENTS.md 'Commit conventions'(PoC 코드는 `.scratch/`).
- 새 순수 함수(`entering`, `revealStep`, `revealBoundary`, `followStep`, 따라가기 상태 전이)는 새 파일 `app/src/renderer/threadMotion.ts`와 `threadMotion.test.ts`에 둔다. 기존 동작 고정 케이스는 `threadItems.test.ts`에 더한다. — conductor 판단, 근거: tasks T3("새 함수는 새 테스트 파일").
- T5 `/runtime-test`의 실제 provider 턴은 Codex로 한다. 실제 `~/.codex/auth.json`을 임시 `CODEX_HOME`에 복사해 격리된 앱에서 한 턴만 돌리고, 끝나면(실패해도) 임시 홈을 지운다. 새 로그인은 만들지 않는다. — 체인 시작 점검에서 사용자 승인. Codex를 고른 근거: 자격 증명이 파일 하나라 Keychain 복제 없이 임시 홈에 격리된다(공유 provider 프로필 복사는 Claude Code·Codex를 로그아웃 상태로 보이게 한다는 lead 메모).
- T6의 PRODUCT, ARCHITECTURE, BACKLOG 승격과 기능 디렉터리 삭제는 conductor가 문서별 커밋으로 한다. `docs/design/conversation.md`는 `/design-sync`를 하는 UI 워커(B3)가 고친다. — conductor 판단, 근거: `/orchestrate` §4·§5.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 PoC(성능) | `.scratch/thread-motion/`, `docs/features/thread-motion/design.md` 'PoC' 절만. 임시 루프는 워커 worktree에서만 쓰고 커밋하지 않는다 | 없음 | Opus medium — 격리된 앱에 가짜 스트림을 넣고 프레임 시간을 재는 harness다. 판단은 중간, 틀리면 B3 구조 선택이 흔들린다 | p95 ≤ 16ms, 최댓값 ≤ 50ms 측정값이 design.md에 있음 | 대기 |
| B2 | T3 순수 함수 | `renderer/threadMotion.ts`(새), `renderer/threadMotion.test.ts`(새), `renderer/threadItems.test.ts`(케이스 추가만) | 없음 | Opus medium — `revealBoundary`의 Markdown 경계와 따라가기 상태 전이는 경우가 많고, 틀리면 UI 전체가 어긋난다 | `npm --prefix app test`, typecheck, lint | 대기 |
| B3 | T4 UI + T5 `/design-sync`·`/runtime-test` | `ConversationThread.tsx`, `conversationStore.ts`, `styles.css`, 보내기 경로의 composer 파일(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, Home, 프로토타입 창), 각 테스트, `docs/design/conversation.md` | B1, B2 통합 | Opus high — rAF·ResizeObserver 따라가기, 매 프레임 렌더 성능, 세 화면과 실제 provider 턴까지 판단이 많다 | `npm --prefix app test`, typecheck, lint, `/design-sync`, `/runtime-test` | 대기 |
| R2 | B2 리뷰 | 보고만 | B2 | Opus medium — 순수 함수지만 경계 규칙이 미묘하다 | `/code-review` 보고서 | 대기 |
| R3 | B3 리뷰 | 보고만 | B3 | Opus high — 스크롤 상태 기계와 렌더 성능, 사람 입력 판정 | `/code-review` 보고서 | 대기 |

B1은 코드를 커밋하지 않으므로 리뷰 워커 대신 conductor가 측정 스크립트와 값을 직접 확인한다.

conductor 몫(T6): PRODUCT §5 item 2·3, ARCHITECTURE(블록 단위 memo로 나눴다면 §7), BACKLOG 미검증 항목, 기능 디렉터리 삭제, 최종 `/verify`.

## 파일 겹침과 순서

- B1과 B2는 커밋하는 파일이 겹치지 않아 병렬로 돈다.
- B3는 B2의 함수와 B1의 성능 결론(끝난 블록 memo를 어디까지 나눌지)에 기대므로, 둘을 통합한 뒤 시작한다.
- tasks 항목 대응: T1 완료, T2→B1, T3→B2, T4·T5→B3, T6→B3(`docs/design/conversation.md`)·conductor(나머지). 주인 없는 항목은 없다.

## 리뷰·검증 기록

(진행하며 적는다)
