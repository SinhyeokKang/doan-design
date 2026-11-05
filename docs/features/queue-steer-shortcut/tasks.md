# queue-steer-shortcut — tasks

순서: 순수 함수 → 키 연결 → 표시 → 실제 앱 확인 → 문서 승격. 한 번의 `/ship`으로 간다. 결정은 design '결정'에 있다.

## A. 순수 함수

- [ ] A1. `steerKey`(`homeComposer.ts`)와 `steerAllPlan`(`composerRules.ts`)을 `/tdd`로 먼저 테스트하고 구현한다(design '순수 함수로 뺄 부분'). `steerKey`: Control+Enter만 참, Shift·Option·Command가 섞이거나 `isComposing`·`keyCode 229`면 거짓. `steerAllPlan`: `sendNow` 거짓 → `enter`, 행·draft 조합 네 경우.
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`·`composerRules.test.ts`의 새 사례가 구현 전 red, 구현 뒤 green. `isSubmitKey`의 기존 사례도 green.

**커밋 경계 1** (테스트와 구현을 `/ship` 규칙대로 나눈다)

## B. 키 연결

- [ ] B1. `ComposerField`에 `onSteerKey`를 더하고, `DockedComposer`에 `steerAll()`과 `QueueRows`의 handle(`sendAll`, `sendNow`)을 더한다. `send()`가 최종 `DockedOutcome`을 돌려주게 하고, 성공에 `itemId`를 넣어 두 host의 `queue`가 채운다(design '동작' 1–4).
  - 검증: `npm --prefix app test`에서 `DockedComposer.queue.test.tsx`·`DockedComposer.interaction.test.tsx`의 새 사례가 green. 실제 입력란 keydown으로: (a) 행 셋이 위에서부터 `onSendQueuedNow`에 차례로 불림, (b) 이미 보내는 중인 행은 다시 불리지 않음, (c) 가운데 행의 거절은 그 행 아래에만 "Couldn’t send now. It stays queued.", (d) 입력란의 글이 queue된 뒤 그 `itemId`가 마지막으로 불림, (e) queue가 `not_running`이면 보내고 steer하지 않음, (f) `sendNow` 거짓이면 Enter와 같음, (g) 빈 입력란·빈 큐에서는 아무 호출도 없고 Stop도 불리지 않음, (h) 포커스가 입력란에 남음, (i) IME 조합 중(`isComposing`)이면 아무것도 하지 않음, (j) Home composer의 Control+Enter는 지금처럼 보냄, (k) queue 답이 오기 전에 대화를 바꾸면 그 `itemId`로 `onSendQueuedNow`가 불리지 않고 행은 원래 대화의 큐에 남음, (l) `availability`가 거짓이면 입력란의 글과 이유 줄은 남고 기존 행만 `onSendQueuedNow`로 불림.
  - 검증: `npm --prefix app run typecheck` 통과.

**커밋 경계 2**

## C. 표시

- [ ] C1. 큐 목록 아래에 `doan-kbd` "⌃↩"가 든 단축키 caption을 더한다(design 결정 3). Send now 툴팁은 바꾸지 않는다.
  - 검증: `npm --prefix app test`에서 caption이 Send now를 보이고 행이 있을 때만 보이고, Send now를 쓸 수 없거나 큐가 비면 없는 사례가 green. 실제 모양은 E1에서 스크린샷으로 본다.

**커밋 경계 3**

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`로 격리한 실제 앱에서 바뀐 동작만 짧게 본다. 로그인한 provider 연결이 필요하므로 프로필과 실제 HOME 사용 여부는 사람에게 먼저 묻는다(AGENTS.md 'Commands'의 격리 규칙).
  - 검증 (a) 순서(design 'PoC 의존'): Claude Code와 Codex 대화에서 각각 턴이 도는 동안 행 셋을 queue하고 Control+Enter → thread의 사람 메시지가 큐 순서로 보이고 agent가 그 순서로 읽는다. 어긋나면 멈추고 design으로 돌아간다.
  - 검증 (b) 실제 키: 실제 키보드 입력으로 Control+Enter가 steer를 부르고, 입력란에 줄바꿈이 생기지 않는다. 한국어 IME 조합 중 Control+Enter가 마지막 글자를 잃거나 두 번 넣지 않는다. 자동 입력으로 실제 키를 낼 수 없으면 사람에게 확인을 부탁하고, 하지 못한 것은 보고에 남긴다.
  - 검증 (c) ACP provider 대화와 턴이 없는 대화에서 Control+Enter가 Enter와 같게 움직인다(design 결정 2).
  - 증거는 `.scratch/runtime-test/queue-steer-shortcut/`에 둔다.

## Z. 승격과 정리

- [ ] Z1. PRODUCT §5 'Project conversations'의 Send now 항목에 단축키 규칙을 영어로 더한다(Control+Enter, 대상, 입력란의 글, Send now를 쓸 수 없을 때, 키가 듣는 곳, 툴팁의 키). DESIGN.md의 Queued row 항목에 caption을 적고, 'Not drawn' 문단(DESIGN.md:200)의 "`.doan-kbd` outside a button (the canvas page only …)" 문장을 docked composer의 caption까지 담도록 고친다. ARCHITECTURE는 바뀌지 않는다. `docs/features/queue-steer-shortcut/`을 지운다.
  - 검증: `rg -n "Control\+Enter|⌃↩" docs/PRODUCT.md`와 `rg -n "⌃↩" docs/DESIGN.md`가 새 규칙을 찾고, `docs/features/queue-steer-shortcut/`이 없다. 문서마다 커밋을 나눈다.
- [ ] Z2. `node .agents/skills/verify/scripts/verify.mjs`로 공유 gate를 돌린다.
  - 검증: 종료 코드 0.

**커밋 경계 4** (문서마다 한 커밋)
