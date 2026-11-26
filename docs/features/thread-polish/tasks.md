# thread-polish — 작업

시작 조건: `git log origin/develop`에 answer-popover PR의 머지 커밋이 있고, `docs/features/answer-popover/`가 develop에서 지워졌다.

`/agent-eval` 해당 없음: 안내, CLI 출력, `doan check`, 스킬이 바뀌지 않는다.

1. (완료, `ea44c9787`·`cf3be347c`, 2026-11-26 확정) 드래프트 `.doan/canvases/thread-polish.html`을 그리고 `handoff-received.html`을 지운다.
   - 확인: `doan check --json --repo .` 새 error 없음, `doan ls --json --repo .`의 frame id가 `card-open`, `copy-toast`, `agent-bubble`, `follow`.
2. answer-popover 머지 뒤 design.md를 다시 확인한다. '따라가기'의 이름(`FollowState`, `nextFollow`, `followResize`, `scrollFollow`, 끝 여백), '받은 handoff 버블'의 선택자(`ENTRY_FOCUS`, `scrollToItem`)를 머지된 코드와 맞추고, 달라진 것을 design.md에 고친다.
   - 확인: design.md가 언급한 이름마다 `grep -rn <name> app/src/renderer`가 결과를 낸다. 고친 내용은 같은 커밋에 있다.
3. `/tdd`: design '순수 함수'의 표 테스트를 쓰고 red를 본다. 다음 UI 규칙도 함께 고정한다.
   - `cc-open`의 `data-ui-variant="subtle"`
   - 호스트 `onCopy` 성공 시 `onNotice("Copied code")`, 실패 시 토스트 없음
   - 받은 handoff 버블의 markup: 그룹 이름 "Handoff from <name>", `aria-describedby` 시각, 화면 시각 `aria-hidden`, Open의 `panel` 변형과 이름
   - `messageCommand`가 `origin`이 있는 메시지를 명령으로 읽지 않는다
   - 포인터 눌림 중 다시 붙지 않는다
   - 확인: `npm --prefix app test`에서 새 테스트가 red.
4. 따라가기 구현: `threadMotion.ts`(`FollowState`, `nextFollow`, `followBand`), `threadItems.ts`(`FOLLOW_DISTANCE`, `scrollFollow`), `ConversationThread.tsx`(따라가기 루프, `followResize`, `resized`, `onScroll`, `window` pointerup/cancel/blur).
   - 다시 쓸 기존 테스트: `threadMotion.test.ts`의 `frame`, `ConversationThread.motion.test.tsx`, `threadItems.test.ts`의 `scrollFollow`.
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`. `grep -rn FOLLOW_DISTANCE app/src` 결과가 없거나, 남은 곳과 이유가 커밋 메시지에 있다.
   - 커밋 경계.
5. 받은 handoff 버블: `handoffView.ts`, `ConversationThread.tsx`(`HandoffCard`, `ENTRY_FOCUS`, `scrollToItem`, `cardBanners`), `styles.css`(버블 본문 `white-space`, 메타 줄, 구분선, container 규칙, 실패 안내 위치, focus ring).
   - 다시 쓸 기존 테스트: `handoffView.test.ts`, `ConversationThread.test.tsx`(markup, 그룹·Open 이름, Edit and resend 없음), `ConversationThread.focus.test.tsx`, `App.handoff.test.tsx`, `CanvasConversationPanel.hooks.test.tsx`, `threadItems.test.ts`(handoff 항목, 시각), `PrototypeConversation*.test.tsx`, `forcedColors.test.ts`(새 경우 추가).
   - 새로 고정할 것
     - 메타 줄 `nowrap`과 잘림 순서: 이름 3em, 그다음 이유
     - 275px 이하에서 시각 숨김 CSS 규칙
     - 시각이 숨은 동안 이름 tooltip이 늘 열림
     - 사라진 캔버스·지운 대화(프로토타입 창의 null 포함)에서 Open 숨김
     - reduced motion과 진입 모션 없음
     - 옮겨 온 직후 포커스가 버블 그룹에 가고 `block: "start"`로 스크롤
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
6. 캔버스 카드 Open `subtle`, Copy code 성공 토스트(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`의 `onCopy`), 스레드의 sr-only "Copied"(`copied`, `COPIED_MS`) 제거.
   - 다시 쓸 기존 테스트: `ConversationThread.copy.test.tsx`, `PrototypeWindow.test.tsx`의 토스트 경우.
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
7. `/design-sync`: frame `card-open`, `copy-toast`, `agent-bubble`를 캔버스 패널 347과 280, Overview, 프로토타입 창 280에서 잰다. `follow`는 설명 그림이라 재지 않는다.
   - 확인: `node .scratch/design-sync/<screen>/measure.mjs`의 측정이 드래프트와 맞는다. 다른 점은 `docs/design/conversation.md`에 documented deviation으로 남는다.
8. `/runtime-test`: 격리된 실제 앱에서 짧게 확인한다.
   - 따라가기
     - 휠 살짝(48px 이하), 마우스 휠 노치, 트랙패드 관성
     - 스크롤바 드래그와 창 밖에서 놓기
     - 키보드 스크롤 키(방향키, PageUp, Space)를 답이 드러나는 중에
     - 선택 중 새 내용
     - band 밖으로 올라갔다 다시 들어오기
     - 내용이 위에서 자랄 때
     - 대화를 다시 열 때 바닥에서 시작
     - 패널 280과 Overview 높이에서 확인
   - handoff 직후 포커스와 스크롤
   - Copy 토스트: 패널, Overview, 프로토타입 창, 모달이 열린 동안
   - 실패 경로
   - forced colors 에뮬레이션
   - 확인: 각 항목의 결과와 스크린샷이 `.scratch/runtime-test/thread-polish/`에 있다.
9. `/verify`.
   - 확인: `node .agents/skills/verify/scripts/verify.mjs` 통과.
10. 결론을 현재 규칙으로 옮기고 `docs/features/thread-polish/`를 지운다.
    - PRODUCT
      - §5 item 2 'Handoff'(받은 쪽 첫 메시지와 썸네일)
      - item 3 'Canvas cards'(Look의 handoff 공유 문장, Open)
      - 'Follow'
      - Copy code 문장
      - 'Canvas names'의 "a handoff's card"
      - 썸네일 캡처 문장
    - ARCHITECTURE: handoff 카드를 말하는 곳(`.md selectable`, 프로젝트 대화 출처, `handoffView.ts`).
    - `docs/design/conversation.md`: handoff card 줄들(canvas-handoff, handoff-card-emphasis 참조)을 새 규칙으로 바꾸고, Reference에 `thread-polish.html`을 적는다.
    - 확인: `test ! -d docs/features/thread-polish`, `grep -rn "docs/features/thread-polish" docs/ app/src .agents` 결과 없음, `grep -n "handoff card\|handoff-card\|within 24 px" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design/*.md` 결과가 받는 쪽 카드나 옛 24px 규칙을 가리키지 않는다.
