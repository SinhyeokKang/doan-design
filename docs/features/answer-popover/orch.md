# 답 팝오버 — orch

- 원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)
- 체인: [chain-261126-1](../chain-261126-1/chain.md)의 링크 2(answer-popover). check-scope와 병렬 그룹이다.
- 시작 hash: `7e8f22f75`
- 통합 브랜치: `feat/answer-popover` (lead가 develop에서 만들었다)
- conductor: Claude Opus 5.5, worktree `answer-popover-orch`

## 결정 기록

- T1(드래프트)은 끝났다. 드래프트 `.doan/canvases/answer-popover.html`은 사용자가 확정했고 develop에 있다(chain.md). 이 링크는 T2부터 한다.
- 구현 시작 조건인 comment-trim 머지는 develop에 있다(`fa680f913`).
- T2 PoC의 방식(A·B) 선택: conductor가 design.md 기준으로 정한다(chain.md '시작 점검'). 두 방식 모두 요구 항목을 못 채우면 멈추고 사용자에게 묻는다.
- conductor's call — 문서에 '확인 필요' 항목이 없으므로 시작 전에 사용자에게 물을 것이 없다(chain.md '시작 점검').
- conductor's call — T6(PRODUCT·ARCHITECTURE·BACKLOG 승격, 기능 디렉터리 삭제)는 문서만 바꾸므로 conductor가 통합 뒤 직접 한다(`/orchestrate` §4·§5).
- conductor's call — T5 `/design-sync`와 `/runtime-test`는 코드를 고칠 수 있으므로 T3·T4를 맡은 워커(B2)가 같은 worktree에서 이어서 한다. 고치는 코드의 주인이 같아야 한다.

## 모델 계열 교차

- 사용자가 체인 '상시 권한'에서 배치 워커에 Codex `gpt-6.1-sol`, effort `high`까지를 허가했다.
- 이 링크에서 Codex를 쓴 범위: 아래 배치 표의 모델 열에 적는다. 리뷰 워커도 배치 워커로 본다.
- 시작 시점 Codex 사용률: 5h 2%, 7d 1%.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 PoC(끝 여백 A·B) | `.scratch/answer-popover/`, design.md 'PoC 결과' | 없음 | Claude Opus medium — 격리된 실제 앱에서 스크롤 따라가기를 재고 해석해야 한다 | 비교 항목마다 측정값·스크린샷이 `.scratch/`에 있다 | 대기 |
| B2a | T3 순수 함수 | `questionDraft.ts`, `conversationStore.ts`, `overviewRun.ts`, `threadMotion.ts`와 각 테스트 | 없음 | Claude Opus high — T4·T5를 이어 맡으므로 같은 워커이고, 포커스·따라가기 규칙의 판단이 크다 | `npm --prefix app test`(red → green), `typecheck` | 대기 |
| B2b | T4 팝오버, 스레드, 진입점 | `app/src/renderer/` 대화 파일 전부와 `styles.css`, 테스트 | B1, B2a | B2a와 같은 워커 | `test`, `typecheck`, `lint` | 대기 |
| B2c | T5 `/design-sync`, `/runtime-test` | `docs/design/conversation.md`, `docs/design/canvas-conversation.md`, `docs/DESIGN.md`, 고칠 코드 | B2b | B2a와 같은 워커 | 측정값이 드래프트와 같거나 차이가 기록됨, 스크린샷 | 대기 |
| R | 각 구현 배치의 `/code-review` | 보고만 | 해당 배치 | Codex Sol high — 다른 계열이 구현에 묶이지 않은 눈으로 본다 | 🔴 0 | 대기 |
| C | T6 승격과 정리 | PRODUCT, ARCHITECTURE, BACKLOG, 기능 디렉터리 삭제 | B2c | conductor | 옛 문장이 남지 않음(읽어서 확인) | 대기 |

## 겹침과 순서

- B1과 B2a는 파일이 겹치지 않으므로 병렬로 돌린다. B1은 앱 코드를 고치지 않는다(probe가 실행 중인 renderer에 DOM과 스타일을 넣어서 잰다).
- B2b는 B1의 PoC 결과와 B2a 통합 뒤에 같은 워커에게 새 Task로 보낸다.
- GUI probe(B1, B2c)는 겹치지 않게 돌린다. B2c는 B1이 끝난 뒤에만 시작한다.

## tasks 항목 → 배치

- T1 → 완료(develop)
- T2 → B1
- T3 → B2a
- T4 → B2b
- T5 → B2c
- T6 → C

## 진행 기록
