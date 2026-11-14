# 버디 변경 24시간 잠금 — tasks

`/ship` 하나로 진행한다. draft는 그 전에 develop에서 그린다. commit 경계는 `/ship` 순서(`test:` → `feat:` → `refactor:`)를 따른다.

1. **draft** — `/design-draft`로 새 파일 `.doan/canvases/buddy-change-cooldown.html`을 그린다. frame은 확인 dialog, 저장 중 dialog, 잠금 overlay(`23:59:41`), 잠금 overlay(1시간 미만, `00:42:17`), 저장 실패 notice다. 버디 크기와 dialog·남은 시간 문구를 clarify preset으로 확정한다. `buddy-choice.html`은 고치지 않는다.
   - 검증: `doan check --repo .`가 통과하고, `doan ls --repo . --json`의 frame 목록이 위 다섯 상태와 같다. 사용자가 앱에서 draft를 확인했다.
   - ⟶ commit (develop, draft만)
2. **테스트 먼저 (`/tdd`)** — 아래 3–7의 테스트를 쓰고 red를 확인한다.
   - ⟶ commit #0 `test:`
3. **preferences 필드** — `preferences.ts`의 `buddyChangedAt` 읽기·patch·merge. 테스트할 경우:
   - 유효하지 않은 값은 그 필드만 없는 것으로 읽힌다.
   - 먼 미래 값도 그대로 읽힌다.
   - `buddy` 없이 온 `buddyChangedAt`, 왕복 검사에 실패한 값은 거절된다.
   - `buddy`만 있는 patch와 notifications patch 뒤에도 값이 남는다.
   - broken 파일을 옆으로 옮긴 뒤 처음 저장할 때 값이 들어간다.
   - 검증: `npm --prefix app test -- preferences`가 위 경우를 통과한다.
4. **잠금 계산** — `buddyCooldown.ts`. 테스트 이름에 경계를 적는다.
   - `cooldownEnd`: 미래 `changedAt`은 `seenAt`부터 24시간이다.
   - `cooldownRemaining`: 정확히 24시간 뒤에는 null이다.
   - `cooldownClock`: 정확히 24시간은 `24:00:00`, 1001 ms는 `00:00:02`, 1000 ms와 999 ms는 `00:00:01`, 59분 59.5초는 `01:00:00`.
   - `nextTick`: 초 경계 직전·직후, 끝 시각.
   - 검증: `npm --prefix app test -- buddyCooldown`이 위 경우를 통과한다.
5. **행 키 처리** — `rowFocusTarget`과 `BuddyRows`.
   - 화살표 키는 포커스만 옮기고 순환한다. 키를 누른 뒤 `document.activeElement`가 다음 행이다. 저장도 `request`도 일어나지 않는다.
   - 클릭·Space는 checked를 바꾸지 않고 `request(id)`를 부른다. Enter도 `request(id)`를 부른다.
   - 지금 버디 행은 `request`를 부르지 않는다.
   - first run의 `BuddyFlow`는 바뀌지 않는다.
   - 검증: `npm --prefix app test -- BuddyPicker`가 위 경우를 통과한다.
6. **저장 경로** — `useBuddySelection`.
   - Settings pick은 `{ buddy, buddyChangedAt }`를 한 patch로 보낸다.
   - first run·buddy screen 경로와 그 Retry는 `buddyChangedAt`을 보내지 않는다.
   - Settings 실패의 Retry는 새 시각으로 보낸다.
   - `seenAt`은 같은 값에 대해 한 번만 정해진다.
   - 검증: `npm --prefix app test -- buddySelection App.buddy`가 위 경우를 통과한다.
7. **Settings > General UI** — 새 `SettingsGeneral.test.tsx`를 만들고 `SettingsPage.test.tsx`·`SettingsDialog`를 쓰는 기존 테스트에 더한다. 확인할 것:
   - dialog가 열린 동안 행·accent가 바뀌지 않고, Settings 페이지 Lock이 걸린다.
   - Cancel·Escape로 닫으면 포커스가 누른 행으로 돌아간다.
   - 진행 중에는 Cancel·Escape·행이 동작하지 않는다.
   - 성공하면 dialog가 닫히고 overlay가 보이며, 포커스가 overlay 버디로 가고, 행이 `inert`다.
   - 실패하면 notice와 Retry가 보이고 포커스가 누른 행으로 간다. Retry가 성공하면 포커스가 overlay 버디로 간다.
   - 제목과 본문이 이 순서로 버디 버튼의 `aria-describedby`이고 live role이 없다.
   - 가짜 시계로 만료시키면 overlay가 사라지고 포커스가 checked 행으로 간다.
   - `visibilitychange` 때 다시 계산한다.
   - 다시 마운트하면 잠금이 유지되고, 닫힌 채 만료된 뒤 다시 마운트하면 overlay가 없다.
   - newer notice이면 overlay 없이 행이 꺼진다.
   - jsdom에서 WebGL이 없을 때 정지 이미지로 대신한다.
   - Project Settings의 Share 확인이 그대로 동작한다.
   - 검증: `npm --prefix app test -- SettingsGeneral SettingsPage App.settings ProjectSettings`가 위 경우를 통과한다.
8. **구현 (`/implement`)** — 3–7을 구현해 green으로 만든다.
   - 검증: 2에서 red였던 테스트가 모두 green이다.
   - ⟶ commit #1 `feat:`
9. **실제 앱 확인** — `/runtime-test`로 격리된 앱에서 확인한다.
   - Settings > General: 클릭 → dialog → 확인 → overlay, Cancel, 화살표 키.
   - Tab이 `inert` 행에 가지 않는다.
   - 재실행 뒤 overlay가 유지된다.
   - reduced motion 에뮬레이션에서 버디가 쉰다.
   - 이어서 `/design-sync`로 `buddy-change-cooldown.html`과 실제 화면을 computed style로 비교한다.
   - 검증: `/runtime-test` 스크린샷과 `/design-sync` 측정표.
10. **gate** — `/code-review` → `/refactor` → `/verify`.
    - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
    - ⟶ commit #2 `refactor:` (refactor가 코드를 바꿨을 때만)
11. **문서 승격** — 현재 규칙으로 고친다.
    - PRODUCT §5 item 0: 'General'(확인 dialog, 24시간 잠금과 이유, 화살표 키, overlay와 버디, 남은 시간, 시계 기준과 한계), 'Settings page' Lock 목록, 'Settings storage'.
    - PRODUCT item 1 'Buddy': Settings > General에서는 확인 뒤에 바뀐다.
    - ARCHITECTURE §7 'Settings IPC' 'Preferences': `buddyChangedAt`과 읽기 예외, 그 이유.
    - ARCHITECTURE 'First-run onboarding' Buddy step 문단: Settings pick만 변경 시각을 보낸다.
    - DESIGN.md: overlay 버디 크기, 제목·본문, Problem overlay 재질 공유, dialog 진행 상태의 측정값.
    - `docs/features/buddy-change-cooldown/`을 지운다.
    - 검증:
      - `rg -n "buddyChangedAt" docs/ARCHITECTURE.md`와 `rg -n "24 hours" docs/PRODUCT.md`에 새 규칙이 나온다.
      - `rg -n "cycle as native radios" docs/PRODUCT.md`가 0건이다.
      - PRODUCT 'General' 문장에 "A pick saves at once"가 없다.
      - `test ! -d docs/features/buddy-change-cooldown`가 통과한다.
    - ⟶ commit `docs:`
