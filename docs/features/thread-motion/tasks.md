# 스레드 모션 — tasks

순서: 드래프트(모션 결정) → PoC → 순수 함수 → UI → 실기 확인 → 승격. `[commit]`은 커밋 경계다. 구현(T2 이후)은 thread-edit-lines와 handoff-card-emphasis가 develop에 머지된 뒤 시작한다.

## T1. 드래프트와 모션 결정

- `/design-draft thread-motion`으로 진입 A·B·C와 점진 표시 A·B·C를 재생 가능하게 그린다. 사용자가 앱에서 고른다. 고르지 않은 안은 지운다.
- 검증: `doan check`가 통과하고, `doan ls`의 프레임 id가 요청과 같고, 사용자가 고른 안이 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. PoC

- 1만 자 답(코드 블록, 표 포함)의 점진 표시 프레임 시간을 격리된 실제 앱에서 측정한다. 스크립트는 `.scratch/thread-motion/`에 둔다.
- 진입 B를 골랐다면 composer → 스레드 FLIP을 세 화면에서 확인한다.
- 검증: 측정값(프레임 시간의 중앙값과 최댓값, 날짜)과 결론이 design.md 'PoC'에 적혀 있다. 측정 실행 명령은 정해져 있지 않다 — 사용자 확인 필요.
- `[commit]` design.md

## T3. 순수 함수

- `/tdd`로 테스트를 먼저 쓰고 red를 확인한 뒤 `entering`, `revealStep`, `revealBoundary`, `followStep`을 구현한다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `entering`: 첫 render, 대화 전환, 다른 창의 메시지, 핸드오프 카드 제외, Send now 키 전환에서 한 번만 진입
  - `revealStep`: 적응형 속도, `MAX_LAG_MS` 상한, 끝나면 즉시 전체, 받은 것보다 길어지지 않음
  - `revealBoundary`: 단어, `{{n}}` 칩, 링크, 코드 펜스, 표 경계
  - `followStep`: 목표가 바뀔 때 위치와 속도 유지, 목표를 넘지 않음, 정해진 시간 안에 끝남
- `[commit]` `test:` → `feat:`

## T4. UI

- `ConversationThread.tsx`에서 `useFrameText`를 점진 표시로 바꾸고, 사용자 메시지에 진입 모션을 달고, 바닥 따라가기를 감속 스크롤로 바꾼다. 감속 스크롤 중의 scroll 이벤트는 사람의 스크롤로 세지 않고, 사람의 입력이 오면 멈춘다. `styles.css`에 keyframes와 reduced motion 규칙을 넣는다.
- 검증: `npm --prefix app test`에서 `ConversationThread.test.tsx`(진입 클래스가 대상에만 붙음, reduced motion에서 없음, 스트림 종료 시 전체 텍스트)와 `threadItems.test.ts`(스크롤 판정 그대로)가 통과한다. `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`로 드래프트의 모션 값(시간, easing, 이동 거리)을 실제 앱의 computed style과 맞추고 `docs/design/conversation.md`에 기록한다.
  - 검증: 측정한 값이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`로 격리된 실제 앱에서 확인한다. 실제 provider 턴으로 긴 답 하나를 받는다(AGENTS.md 'Real agent sign-ins'의 복제 규칙).
  - 확인 항목: 바로 보내기와 Send now의 진입, 큰 조각이 올 때의 점진 표시, 새 항목이 생길 때의 감속 스크롤, 감속 스크롤 중 사람이 휠로 올릴 때 즉시 멈추고 `behind`, 질문 카드로 가는 스크롤, Stop 직후 전체 표시, reduced motion
  - 검증: 항목마다 드래프트와 같은 모습이 보이고, 녹화나 스크린샷이 `.scratch/`에 있다. 확인하지 못한 화면은 T6에서 BACKLOG에 남긴다.
- `[commit]` `docs(design):`

## T6. 승격과 정리

- `docs/PRODUCT.md` §5의 대화 스레드 규칙에 진입 모션, 점진 표시, reduced motion 규칙을 현재 규칙으로 쓴다.
- ARCHITECTURE: 바뀌는 구조가 없으면 고치지 않는다. PoC에서 Markdown 렌더링 구조를 바꿨다면 §7에 그 이유를 적는다.
- 미검증 화면은 `docs/BACKLOG.md`에 남긴다.
- `docs/features/thread-motion/`을 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(BACKLOG):`, `docs(feature):`).
