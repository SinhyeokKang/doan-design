# 스레드 모션 — tasks

순서: 드래프트(모션 결정) → PoC → 순수 함수 → UI → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. 구현(T2 이후)은 thread-edit-lines와 handoff-card-emphasis가 develop에 머지된 뒤 시작한다.

## T1. 드래프트와 모션 결정

- `/design-draft thread-motion`으로 진입(A로 확정)과 점진 표시(B로 확정)를 재생 가능하게 그린다. 사용자가 앱에서 고른다. 고르지 않은 안은 지운다.
- 검증: `doan check`가 통과하고, `doan ls`의 프레임이 `entry`, `stream`, `reduced`이고 각 프레임에 고른 안만 남아 있고, 사용자가 고른 안이 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. PoC

- 성능: `node .scratch/thread-motion/measure.mjs`. Playwright `_electron`으로 격리된 앱을 띄우는 probe다(`/design-sync`의 measure 스크립트와 같은 방식, `app/runtime/` 격리 사용). 가짜 에이전트 스트림으로 1만 자 답(코드 블록, 표 포함)을 347 패널에 보내고, 임시 점진 표시 루프로 프레임 시간을 잰다.
- 검증: 프레임 시간 p95가 16ms 이하이고 최댓값이 50ms 이하다. 측정값(p95, 최댓값, 날짜)과 결론이 design.md 'PoC'에 적혀 있다. 기준을 넘으면 끝난 블록 memo를 강화한 뒤 다시 잰 결과도 적는다.
- `[commit]` design.md

## T3. 순수 함수

- `/tdd`로 테스트를 먼저 쓰고 red를 확인한 뒤 `entering`, `revealStep`, `revealBoundary`, `followStep`, 따라가기 상태 전이를 구현한다. 기존 `threadItems.test.ts`에 케이스를 더하고, 새 함수는 새 테스트 파일에 둔다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `entering`: 로컬 전송 표시와 맞는 항목만 진입, 히스토리·다른 창 메시지·핸드오프 카드 제외, 새 대화의 첫 메시지 진입, 큐 메시지 여러 개 함께 진입, `q` 항목과 seq 항목이 둘 다 보이는 프레임과 그 다음 프레임에서 진입 한 번
  - `revealStep`: 한 조각에 전체가 온 경우(0 → 1만 자) 400ms 안에 따라잡음, 작은 조각은 받은 만큼만, 큰 `dtMs`(숨긴 창) 따라잡음, finishing 150ms, flush 즉시, 받은 것보다 길어지지 않음
  - `revealBoundary`: 단어, 코드 블록 안의 줄, 끝의 미완성 링크(`doan:` 포함)와 표 잡아 두기
  - `followStep`: 목표가 바뀌어도 넘지 않음, 0.5px 안에서 끝남, 살아 있는 바닥으로 자름
  - 따라가기 상태 전이: 사람 입력에 `pinned` 꺼짐, wheel 뒤 100ms 관성 대기, `scrollToItem` 뒤 바닥 복귀 전까지 따라가지 않음, 선택 시 멈춤, composer 입력은 영향 없음
  - 기존 동작 고정: `message.done` 뒤의 `message.delta`는 버려짐(`threadItems.ts:254`), 턴 종료가 한 턴의 두 답을 모두 끝냄(`:192`)
- `[commit]` `test:` → `feat:`

## T4. UI

- `ConversationThread.tsx`:
  - `useFrameText`를 점진 표시로 바꾼다. 끝난 블록은 memo로 다시 그리지 않는다.
  - 사용자 메시지에 진입 모션을 단다.
  - `ThreadBody`에 rAF 루프와 ResizeObserver, `pinned` 플래그를 넣어 따라가기를 바꾼다. Jump to latest를 같은 따라가기로 넘긴다.
- `conversationStore.ts`에 로컬 전송 표시를 더하고, 바로 보내기·Send now·큐·새 대화 경로에서 남긴다.
- `styles.css`에 keyframes와 reduced motion 규칙을 넣는다.
- 시간 기반 코드의 테스트는 시계와 rAF를 hook에 주입하거나 `vi.useFakeTimers({ toFake: [..., "requestAnimationFrame"] })`를 쓴다. jsdom에는 레이아웃이 없어 `scrollHeight`가 0이므로, 스크롤 동작은 상태 전이 함수로 확인하고 실제 높이는 T5에서 확인한다.
- 검증: `npm --prefix app test`에서 `ConversationThread.test.tsx`에 더한 케이스가 통과한다.
  - 진입 클래스가 대상에만 붙음, reduced motion에서 페이드만
  - 스트림 종료·Stop·뒤에 항목이 올 때 전체 텍스트
  - 스트리밍 중 재마운트(패널 접고 펴기, 히스토리 다시 읽기, 대화 전환)가 처음부터 다시 타이핑하지 않음
  - reduced motion을 스트리밍 중에 바꾸면 다음 프레임부터 따름
  - 코드 블록 Copy가 전체 텍스트를 복사함
  - `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`:
  - 진입 모션은 computed style(`animation-name`, `animation-duration`, `animation-timing-function`, `getAnimations()[0].effect.getKeyframes()`)로 드래프트와 맞춘다.
  - 점진 표시와 스크롤은 computed style로 잴 수 없다. 상수(`MAX_LAG_MS`, 마무리 시간, τ)를 드래프트 스크립트의 값과 비교하고, 녹화로 확인한다.
  - `docs/design/conversation.md`에 측정값을 기록하고, 'Turn indicator'의 "The scroll follows `[items]` only" 계약을 새 규칙으로 고친다.
  - 검증: 측정한 값이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`: 격리된 실제 앱에서 실제 provider 턴으로 긴 답 하나를 받는다(AGENTS.md 'Real agent sign-ins'의 복제 규칙). 나머지는 가짜 스트림으로 재현한다.
  - 화면: 캔버스 패널, Overview, 프로토타입 창
  - 항목:
    - 바로 보내기, Send now, 턴 끝에 나가는 큐 메시지, 새 대화의 첫 메시지의 진입
    - 한 조각으로 온 답, 큰 조각이 올 때의 점진 표시, 코드 블록 줄 단위 펼침
    - 펼치는 동안 바닥에 붙음, 새 항목이 생길 때의 감속 스크롤
    - 펼치는 중 권한 카드가 오면 답이 즉시 끝나고 카드가 밀리지 않음
    - 감속 스크롤 중 휠·스크롤바 드래그로 즉시 멈추고 `behind`, 트랙패드 관성 뒤 다시 따라감, 질문 카드로 가는 스크롤 뒤 끌려 내려가지 않음
    - 창을 숨겼다 돌아올 때 즉시 표시, 패널 접고 펴기, 펼치는 중 대화 전환, 펼치는 중 실패, Stop
    - 펼치는 중 선택하면 즉시 전체 표시
    - reduced motion
  - 검증: 항목마다 드래프트와 같은 모습이 보이고, 녹화나 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 남긴다.
- `[commit]` `docs(design):`

## T6. 승격과 정리

- `docs/PRODUCT.md` §5 item 2 'Conversation panel'과 item 3의 스레드 규칙에 진입 모션, 점진 표시, 스크롤 따라가기, reduced motion 규칙을 현재 규칙으로 쓴다.
- ARCHITECTURE: 바뀌는 구조가 없으면 고치지 않는다. Markdown 렌더링을 블록 단위 memo로 나눴다면 §7에 그 이유를 적는다.
- 미검증 항목은 `docs/BACKLOG.md`에 남긴다.
- `docs/features/thread-motion/`을 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(design):`, `docs(BACKLOG):`, `docs(feature):`).
