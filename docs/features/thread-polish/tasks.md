# thread-polish — 작업

시작 조건: chain-261126-1 answer-popover가 develop에 머지된 뒤.

1. 드래프트 `.doan/canvases/thread-polish.html`을 그리고 `handoff-received.html`을 지운다. 사용자가 앱에서 확정한다.
   - 확인: `doan check --json --repo .` 새 error 없음, `doan ls --json --repo .`의 frame id가 `card-open`, `copy-toast`, `agent-bubble`, `follow`.
   - 커밋 경계: `docs(design): thread-polish draft`.
2. `/tdd`: `followBand`, `nextFollow` frame 경우, `followResize`의 `behind`, 에이전트 입력 메타 뷰 테스트를 쓰고 red를 본다.
   - 확인: `npm --prefix app test` 해당 테스트 red.
3. 따라가기 거리 구현(`threadMotion.ts`, `ConversationThread.tsx` 따라가기 루프, 포인터 눌림 동안 붙지 않음).
   - 확인: `npm --prefix app test` green.
   - 커밋 경계.
4. 에이전트 입력 버블(`handoffView.ts`, `ConversationThread.tsx`, `styles.css`, forced colors 가장자리, 메타 줄 nowrap 규칙 테스트).
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`.
   - 커밋 경계.
5. 캔버스 카드 Open `subtle`, Copy code 성공 토스트(캔버스 패널, Overview, 프로토타입 창).
   - 확인: `npm --prefix app test` green.
   - 커밋 경계.
6. `/design-sync`: 드래프트와 구현을 실제 앱에서 비교한다.
   - 확인: `node .scratch/design-sync/<screen>/measure.mjs` 측정이 드래프트와 맞음, `docs/design/conversation.md` 갱신.
7. `/runtime-test`: 따라가기(휠 살짝, 트랙패드 관성, 스크롤바 드래그, 드러나는 중 새 내용), handoff 직후 포커스, Copy 토스트.
   - 확인: 격리된 실제 앱 probe와 스크린샷.
8. `/verify`.
   - 확인: `node .agents/skills/verify/scripts/verify.mjs` 통과.
9. 결론을 `docs/PRODUCT.md`(§5 'Follow', 'Canvas cards', 'Handoff card', Copy code)와 `docs/design/conversation.md`에 현재 규칙으로 옮기고 `docs/features/thread-polish/`를 지운다.
   - 확인: `grep -rn "thread-polish" docs/ app/src` 에 남은 참조 없음.
