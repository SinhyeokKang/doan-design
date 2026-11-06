# model-drawer-older — tasks

0. ~~**시안**~~ — 완료. 두 안을 그려 비교했고 사용자가 같은 자리에서 펼치기를 골랐다(`.doan/canvases/model-drawer-older.html`, frame `inline`·`settings`).

1. **분류 함수** — `models.ts` `markOlder`와 `ModelOption.older`, 세 파서 적용. 실측 목록 fixture.
   - 검증: `npm --prefix app test` (models.test.ts) green.
   - 커밋 경계.

2. **메뉴 view** — `modelPickerView`·`settingsModelMenu`의 현재/이전 분리와 이전 모델 선택 상태.
   - 검증: `npm --prefix app test` (homeComposer.test.ts, newConversationSettings.test.ts) green.
   - 커밋 경계.

3. **UI** — `AgentPicker`·Settings Model 메뉴에 고른 안을 구현한다. 키보드 조작과 접근성 이름 포함.
   - 검증: `npm --prefix app test` (ComposerParts.test.tsx) green, `npm --prefix app run typecheck`.
   - 커밋 경계.

4. **실제 앱 확인** — `/design-sync`로 시안과 맞추고, `/runtime-test`로 Home·Overview·canvas 패널·docked·Settings에서 메뉴가 그려지고 이전 모델을 고르고 보낼 수 있는지 확인한다. 실제 목록은 실제 HOME 계정이 필요하므로 isolated 앱에는 바꾼 목록을 주입한다.
   - 검증: `/runtime-test` 스크린샷과 probe 결과, docs/DESIGN.md 측정값 기록.

5. **승격** — PRODUCT §5 item 1 'Agent and model picker'와 item 0 'New conversations'에 접는 규칙, ARCHITECTURE §7 'Models'에 분류 규칙과 추정이라는 한계를 현재 규칙으로 쓴다. BACKLOG에 Copilot 유료 계정 목록 미확인과 Cursor 현재 모델 25행(더 줄이는 방법 미정)을 남긴다. `docs/features/model-drawer-older/`를 지운다.
   - 검증: `/verify` (`node .agents/skills/verify/scripts/verify.mjs`) 통과.
