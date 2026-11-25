# chain-261125-1

## 규칙

- 이 체인은 [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains 규칙을 따른다.
- 이 파일은 lead만 고친다. conductor는 시작할 때 읽기만 한다.

## 순서

이 체인은 직렬이다. 두 링크가 모두 `app/src/renderer/ConversationThread.tsx`와 `app/src/renderer/styles.css`를 바꾸기 때문이다.

1. **handoff-card-emphasis** — [spec](../handoff-card-emphasis/spec.md) · [design](../handoff-card-emphasis/design.md) · [tasks](../handoff-card-emphasis/tasks.md)
   - `/feature-review` 완료, 드래프트 `.doan/canvases/handoff-card-emphasis.html` 사용자 확정(2026-11-25).
   - 먼저 하는 이유: 카드 마크업과 CSS 구조(바탕 클래스, 머리 행 클래스)를 바꾼다. 모션 링크는 스레드 항목 위에 진입과 스크롤 동작을 얹으므로, 바뀐 카드 구조 위에서 시작하는 편이 충돌이 적다.
2. **thread-motion** — [spec](../thread-motion/spec.md) · [design](../thread-motion/design.md) · [tasks](../thread-motion/tasks.md)
   - `/feature-review` 완료, 드래프트 `.doan/canvases/thread-motion.html` 사용자 확정(2026-11-25).
   - 나중에 하는 이유: 스레드 전체의 스크롤 따라가기와 답 렌더링을 바꾸는 가장 큰 링크다.

체인 밖의 선행 작업: thread-edit-lines(`feat/thread-edit-lines`)가 독립 `/orchestrate` conductor로 진행 중이다. 이 작업도 `ConversationThread.tsx`, `styles.css`, `threadItems.ts`, `turnStatus.ts`를 바꾼다. 그래서 링크 1은 thread-edit-lines PR이 develop에 머지된 뒤 시작한다.

## 시작 점검

lead는 링크 1을 시작하기 전에 아래를 사용자와 한 번에 확인하고, 승인을 '인계 기록'에 적는다. 승인 뒤에는 conductor가 일상적인 판단을 스스로 하고, 새로운 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- thread-edit-lines PR이 develop에 머지되었다.
- handoff-card-emphasis T2(썸네일 공유와 프로토타입 창 IPC): 설계 범위(두 채널을 프로토타입 창에 열기, root 범위 제한, 인스턴스 공유)를 넘어 새 캡처 경로나 채널이 필요하면 conductor가 멈추고 묻는다. 이 결정 지점을 다시 확인한다.
- thread-motion T5의 `/runtime-test`는 실제 provider 턴 하나를 쓴다. AGENTS.md 'Real agent sign-ins'에 따라 실제 HOME의 로그인을 임시 홈에 복제해 쓰고 지운다. Codex 로그인(`~/.codex`)은 2026-11-25 15:07에 다시 로그인되어 있다. 새 로그인을 만들 필요는 없다.
- 두 링크의 기능 문서에 '확인 필요'로 남은 항목은 없다.

## 상시 권한

- lead는 각 링크의 PR을 리뷰와 gate 통과 뒤 링크 순서대로 develop에 머지하고, 다음 링크를 시작한다(체인 기본값).
- conductor와 워커의 런타임은 Claude다(lead와 같은 모델 계열). 모델 계열을 넘는 허가는 없다.

## 진행 규칙

- [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기: conductor는 `/orchestrate`의 워커 대기 루프를 쓴다. 워커가 완료 신호 없이 멈추는 경우를 잡는다.
- `/agent-eval`: 두 링크 모두 해당하지 않는다. 안내, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| handoff-card-emphasis | — | — | — | 대기 |
| thread-motion | — | — | — | 대기 |

## 인계 기록

- 2026-11-25 lead: 체인 파일을 만들었다. 링크 1은 thread-edit-lines PR 머지 뒤 시작한다. 시작 점검은 아직 사용자와 확인하지 않았다.
