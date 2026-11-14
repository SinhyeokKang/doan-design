# 버디 변경 24시간 잠금 — tasks

1. **draft** — `/design-draft`로 `.doan/canvases/buddy-choice.html`에 확인 dialog, 잠금 overlay(움직이는 버디 크기 포함), 1시간 미만 남은 시간 frame을 추가하고 문구를 clarify preset으로 확정한다. 사용자가 앱에서 draft를 확인한다.
   - 검증: `doan check --repo .`가 통과하고, `doan ls --repo .`에 새 frame이 보인다.
   - ⟶ commit (develop, draft만)
2. **preferences 필드** — `preferences.ts`에 `buddyChangedAt`의 읽기(읽을 수 없으면 그 필드만 없음), patch(`buddy`와 함께인 유효한 ISO 문자열만), merge(`buddy`만 있는 patch는 기존 값 유지)를 추가한다. `/tdd`로 테스트를 먼저 쓴다.
   - 검증: `npm --prefix app test -- preferences`가 green이다.
3. **잠금 계산** — `buddyCooldown.ts`의 `cooldownEnd`·`cooldownRemaining`·`cooldownText`·`nextRefresh`. 미래 시각, 경계(정확히 24시간, 1시간, 1분), 단수·복수를 테스트한다.
   - 검증: `npm --prefix app test -- buddyCooldown`이 green이다.
4. **행 키 처리** — `rowFocusTarget`과 `BuddyRows`의 화살표 키(포커스만 이동, 순환), 클릭·Space·Enter의 `request(id)`. first run의 `BuddyFlow`는 바뀌지 않는다.
   - 검증: `npm --prefix app test -- BuddyPicker`가 green이고, 화살표 키 뒤 `document.activeElement`가 다음 행이며 저장이 일어나지 않음을 확인한다.
   - ⟶ commit
5. **저장 경로** — `useBuddySelection.select`가 Settings pick에서 `buddyChangedAt`을 같은 patch로 보내고, first run·buddy screen 경로는 보내지 않는다. Retry는 새 시각으로 다시 보낸다.
   - 검증: `npm --prefix app test -- buddySelection`이 green이다.
6. **Settings > General UI** — 확인 dialog(Cancel 앞·포커스, Escape, 닫힐 때 포커스 복귀, Settings 페이지 Lock), 잠금 overlay(문제 overlay 재질, 움직이는 `Buddy`, 남은 시간, 행 `inert`, 저장 성공 후 포커스, 만료 시 사라짐과 포커스), 실패 notice·Retry.
   - 검증: `npm --prefix app test -- SettingsGeneral`이 green이다(가짜 시계로 만료 확인 포함).
   - ⟶ commit
7. **실제 앱 확인** — `/runtime-test`: 격리된 앱에서 Settings > General의 클릭 → dialog → 확인 → overlay, Cancel, 화살표 키, 재실행 뒤 overlay 유지를 확인한다. 이어서 `/design-sync`로 새 frame과 실제 화면을 computed style로 비교하고 DESIGN.md에 측정값을 기록한다.
   - 검증: `/runtime-test` 스크린샷과 `/design-sync` 측정표.
8. **gate** — `/code-review` → `/refactor` → `/verify`.
   - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
   - ⟶ commit
9. **문서 승격** — PRODUCT §5 item 0 'General'(확인 dialog, 24시간 잠금, 화살표 키, overlay와 버디, 남은 시간, 시계 기준)과 'Settings page' Lock 목록, ARCHITECTURE §7 'Settings IPC' 'Preferences'(`buddyChangedAt`과 읽기 예외)와 'First-run onboarding' Buddy step 문단(Settings pick만 변경 시각을 보냄)을 현재 규칙으로 고치고, `docs/features/buddy-change-cooldown/`을 지운다.
   - 검증: `rg -n "buddyChangedAt|24 hours" docs/PRODUCT.md docs/ARCHITECTURE.md`에 새 규칙이 나오고, `rg -n "saves at once" docs/PRODUCT.md`의 General 문장이 고쳐져 있다.
   - ⟶ commit
