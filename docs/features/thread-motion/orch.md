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

- 끝의 미완성 표는 머리 행과 구분 행(`|---|`)이 모두 올 때까지 잡아 두고, 그 뒤로는 완성된 행(줄) 단위로 펼친다. 마지막 행이 줄바꿈 전이면 잡아 둔다. — conductor 판단(B2 질문), 근거: design.md '경계'의 목적은 텍스트에서 표로 바뀌는 깜빡임과 큰 점프를 없애는 것이고, 표 전체를 한 번에 보이면 점프가 다시 생긴다.
- B3는 답 전체를 매 프레임 다시 그리는 구조로 시작한다. design.md '출력 점진 표시'의 "끝난 블록 memo를 기본으로" 대신 PoC 결론을 따른다. 다만 PoC의 저부하 run은 로그가 덮어써져 전사본만 남았고 다른 run은 기계 부하로 기준을 넘었으므로, spec 완료 조건 8은 B3가 실제 구현으로 부하가 낮을 때 다시 재서 판정한다. 넘으면 그때 블록 단위로 나눈다. — conductor 판단, 근거: design.md 'PoC 결과', `.scratch/thread-motion/results-quiet-1005.txt`.
- R2 리뷰의 결정 후보 3개는 conductor가 정했다. 근거: 셋 모두 design이 정한 동작 안의 구현 선택이다.
  - 끝의 미완성 링크·표·코드 줄은 스트리밍 중에는 나이 상한 없이 잡아 둔다(design '경계'). spec 완료 조건 2의 400ms 상한은 그 밖의 텍스트에 적용하고, 승격할 때 PRODUCT에 이 예외를 적는다. `message.done` 뒤(텍스트가 끝남)에는 잡지 않는다. 잘못 잡는 경우(코드 스팬 안의 `[`, 링크가 될 수 없는 `[`)는 고친다.
  - 공백이 없는 언어(중국어·일본어)도 단어 단위로 펼친다. `Intl.Segmenter`를 쓰고 의존성은 늘지 않는다. design의 "단어 경계"를 모든 언어에 적용한 것이다.
  - 큐가 나갈 때의 로컬 전송 표시는 main이 보내는 합친 메시지 하나와 같은 텍스트 하나다. UI 배치가 `combineQueued`(main의 순수 함수)로 만든다.
- `scrollToItem` 뒤의 `held`는 사람의 입력 말고도, 스크롤해 간 카드가 더 이상 기다리지 않을 때(답함·사라짐) 풀린다. — conductor 판단(R2 🟡1), 근거: spec 완료 조건 5의 목적은 카드로 가는 스크롤을 지키는 것이고, 카드가 끝난 뒤에도 따라가지 않으면 바닥에 있는 사람이 Jump to latest를 보게 된다.
- 실제 Codex 턴: Doan은 Codex 자격 증명을 `CODEX_HOME`에 묶인 Keychain 항목으로 읽으므로 `auth.json` 복사만으로는 부족했다(B3 질문). 그래서 실제 `~/.codex/auth.json`(읽기만)으로 임시 `CODEX_HOME`용 임시 Keychain 항목 하나를 만들고, Doan의 계정 기록은 임시 userData 안에서 앱의 상태 확인으로만 만든다. 끝나면 항목·임시 홈·userData를 지우고 삭제를 확인한다. 로그인 흐름이 필요하면 멈추고 묻는다. — conductor 판단, 근거: AGENTS.md 'Real agent sign-ins'(임시 홈용 임시 Keychain 항목 허용), 체인 시작 점검 승인.
- `message.done` 없이 `turn.done`으로 끝난 답은 즉시가 아니라 150ms에 걸쳐 마저 보인다(spec 완료 조건 3과 다름). PRODUCT에 이 규칙으로 적는다. — conductor 판단(R3 결정 항목), 근거: 차이가 150ms 이하이고, UI가 두 끝을 구별하려면 히스토리 항목에 필드를 더해야 한다. 실패·interrupt·Stop은 즉시 보인다.
- 사람이 Keychain 창을 보지 않도록, 이후의 실제 provider probe는 실제 login keychain 대신 임시 HOME 안의 일회용 keychain 파일을 기본 keychain으로 쓴다. — 사용자 요청. 이번 실제 Codex 턴은 그 전에 실제 keychain 링크로 끝났다(사용자가 창을 허용).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 PoC(성능) | `.scratch/thread-motion/`, `docs/features/thread-motion/design.md` 'PoC' 절만. 임시 루프는 워커 worktree에서만 쓰고 커밋하지 않는다 | 없음 | Opus medium — 격리된 앱에 가짜 스트림을 넣고 프레임 시간을 재는 harness다. 판단은 중간, 틀리면 B3 구조 선택이 흔들린다 | p95 ≤ 16ms, 최댓값 ≤ 50ms 측정값이 design.md에 있음 | 통합 `5bf31d405`. worktree 정리, 브랜치 `SinhyeokKang/tm-b1` 유지 |
| B2 | T3 순수 함수 | `renderer/threadMotion.ts`(새), `renderer/threadMotion.test.ts`(새), `renderer/threadItems.test.ts`(케이스 추가만) | 없음 | Opus medium — `revealBoundary`의 Markdown 경계와 따라가기 상태 전이는 경우가 많고, 틀리면 UI 전체가 어긋난다 | `npm --prefix app test`, typecheck, lint | 통합 `def4e1740`~`953f03a4c`(수정 2라운드). worktree 정리, 브랜치 `SinhyeokKang/tm-b2` 유지 |
| B3 | T4 UI + T5 `/design-sync`·`/runtime-test` | `ConversationThread.tsx`, `conversationStore.ts`, `styles.css`, 보내기 경로의 composer 파일(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, Home, 프로토타입 창), 각 테스트, `docs/design/conversation.md` | B1, B2 통합 | Opus high — rAF·ResizeObserver 따라가기, 매 프레임 렌더 성능, 세 화면과 실제 provider 턴까지 판단이 많다 | `npm --prefix app test`, typecheck, lint, `/design-sync`, `/runtime-test` | 진행 중(worktree `tm-b3`) |
| R2 | B2 리뷰 | 보고만 | B2 | Opus medium — 순수 함수지만 경계 규칙이 미묘하다 | `/code-review` 보고서 | 완료: 1차 🔴2·🟡4·🟢4, 재확인 🔴0·🟡2·🟢2. B2 2라운드 수정 뒤 conductor가 두 테스트 파일(126)과 typecheck를 확인했다 |
| R3 | B3 리뷰 | 보고만 | B3 | Opus high — 스크롤 상태 기계와 렌더 성능, 사람 입력 판정 | `/code-review` 보고서 | 대기 |

B1은 코드를 커밋하지 않으므로 리뷰 워커 대신 conductor가 측정 스크립트와 값을 직접 확인한다.

conductor 몫(T6): PRODUCT §5 item 2·3, ARCHITECTURE(블록 단위 memo로 나눴다면 §7), BACKLOG 미검증 항목, 기능 디렉터리 삭제, 최종 `/verify`.

## 파일 겹침과 순서

- B1과 B2는 커밋하는 파일이 겹치지 않아 병렬로 돈다.
- B3는 B2의 함수와 B1의 성능 결론(끝난 블록 memo를 어디까지 나눌지)에 기대므로, 둘을 통합한 뒤 시작한다.
- tasks 항목 대응: T1 완료, T2→B1, T3→B2, T4·T5→B3, T6→B3(`docs/design/conversation.md`)·conductor(나머지). 주인 없는 항목은 없다.

## 리뷰·검증 기록

- B1: 저부하 run의 숫자는 로그 전사본(`.scratch/thread-motion/results-quiet-1005.txt`)으로만 남았다. 부하가 높은 run은 기준을 넘었다. 최종 판정은 B3의 실제 구현 측정으로 한다.
- R2: 보고서 `.scratch/review-R2.md`(1차와 재확인). 남은 🟢: 이미지 링크(`[![a](b)](…`)와 라벨 안 코드의 `[`는 미완성인 채 보일 수 있다. 에이전트 답에서 드물어 그대로 둔다.
- B2 전체 테스트: 워커가 2라운드 뒤 528 files, 15737 tests 통과를 보고했다. 1차의 `src/main/watch.test.ts` 실패는 부하 중 fs 타이밍이었고 단독 실행에서 통과했다.
