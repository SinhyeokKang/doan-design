# thread-polish — 오케스트레이션

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 해시: `8bc9a88ec` (origin/develop, answer-popover 머지 `69e7d71df` 포함)
- 통합 브랜치: `feat/thread-polish` (lead가 만듦, PR은 develop 대상)
- 모델 교차: 사용자 허락 "Codex Sol High까지 사용" → Codex 워커는 `gpt-6.1-sol`, effort는 high까지. Astra는 허락받지 않았다.

## 결정 기록

- tasks 2(design.md 이름 대조): 지휘자가 했다. 24px 사용처가 `nextFollow` `frame`, `followResize`, `onScroll`로 바뀌었고 끝 여백 이름(`inset`, `--ap-inset`)과 `ENTRY_FOCUS`·`scrollToItem` 위치를 design.md에 고쳤다.
- 배치 나누기: 지휘자 판단 — 4·5·6이 모두 `ConversationThread.tsx`를 고치고 5·6은 `styles.css`도 함께 고친다. 병렬로 돌리지 않고 A → B → C 순서로 돌린다. tasks 3의 `/tdd`는 각 배치의 `/deliver bypass` 안에서 그 배치 몫만 쓴다.
- 리뷰: 각 구현 배치는 Codex `gpt-6.1-sol` 리뷰 워커가 `/code-review`로 본다(다른 계열의 눈).

## 배치

| 배치 | 항목 | 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| A 따라가기 | tasks 3(따라가기 몫: `followBand`, `nextFollow`, `followResize`, `scrollFollow`, 포인터 눌림), 4 | `threadMotion.ts`, `threadItems.ts`, `ConversationThread.tsx`(따라가기 부분), 해당 테스트 | 없음 | Claude Opus high — 시간·입력 상태 기계이고 따라가기 회귀가 postmortem에 여러 번 있다 | test·typecheck·lint, `FOLLOW_DISTANCE` grep | 대기 |
| A 리뷰 | A diff | 읽기만 | A | Codex Sol high — 판단이 많은 diff | 🔴 0 | 대기 |
| B 받은 handoff 버블 | tasks 3(버블 markup, `messageCommand`, `handoffView` 메타 뷰), 5 | `handoffView.ts`, `ConversationThread.tsx`(`HandoffCard`, `ENTRY_FOCUS`, `scrollToItem`, `cardBanners`), `styles.css`, 해당 테스트 | A 통합 | Claude Opus medium — 접근성·CSS container·잘림 순서 판단, 테스트 다시 쓰기가 많다 | test·typecheck·lint | 대기 |
| B 리뷰 | B diff | 읽기만 | B | Codex Sol high — 접근성·CSS 규칙 판단 | 🔴 0 | 대기 |
| C Open·Copy 토스트 | tasks 3(`cc-open` subtle, `onCopy` 토스트), 6 | `ConversationThread.tsx`(`cc-open`, `copied`), `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, `styles.css`(`.cc-open`), 해당 테스트 | B 통합 | Codex Sol medium — 정해진 바꾸기, 판단이 적다 | test·typecheck·lint | 대기 |
| C 리뷰 | C diff | 읽기만 | C | Codex Sol medium — 작은 diff | 🔴 0 | 대기 |
| D design-sync | tasks 7 | 위 구현 파일(측정 뒤 고침), `docs/design/conversation.md`, `.scratch/design-sync/` | C 통합 | Claude Opus medium — 실제 앱 측정과 고침 판단 | measure.mjs가 드래프트와 맞음 | 대기 |
| E runtime-test | tasks 8 | `.scratch/runtime-test/thread-polish/`만 | D 통합 | Claude Opus medium — 격리 실수 비용이 크고 판단이 필요하다 | 항목별 결과·스크린샷 | 대기 |
| 지휘자 | tasks 2(완료), 9, 10 | `docs/` | E | — | verify 통과, tasks 10 grep | 대기 |

## 파일 겹침과 순서

- A·B·C가 `ConversationThread.tsx`를 함께 고치고 B·C가 `styles.css`를 함께 고친다 → A → B → C 직렬.
- D와 E는 실제 앱을 띄우므로 겹치지 않게 직렬로 돌린다.
