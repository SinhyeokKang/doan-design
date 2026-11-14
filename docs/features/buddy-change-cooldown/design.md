# 버디 변경 24시간 잠금 — design

이 feature는 standalone follow-up redesign이다. Settings > General은 이미 develop에 있으므로 기존 draft `.doan/canvases/buddy-choice.html`은 고치지 않는다. 이 draft는 feature branch가 merge될 때까지 이 화면 상태의 기준이다(AGENTS.md 'Workflow' `/design-draft`·`/design-sync` 예외).

## draft 요청

- 경로: `.doan/canvases/buddy-change-cooldown.html`, canvas id `buddy-change-cooldown`, `doan:width` 2560(`buddy-choice.html`과 같다).
- frame (모두 Settings 페이지 전체 화면, `buddy-choice.html`의 `settings-general`과 같은 크기와 shell):
  - `general-confirm` — "Settings · General · confirm switch": Popo 행을 누른 뒤 확인 dialog가 열린 상태.
  - `general-confirm-saving` — "Settings · General · switching": 확인을 누른 뒤 응답을 기다리는 상태.
  - `general-locked` — "Settings · General · locked": Popo로 바꾼 직후, 남은 시간 23시간.
  - `general-locked-minutes` — "Settings · General · locked, under an hour": 남은 시간 1시간 미만(`00:42:17`, 시간 자리가 00으로 남는다).
  - `general-failed` — "Settings · General · couldn’t switch": 확인 뒤 저장에 실패해 notice와 Retry가 보이는 상태.
- draft에서 정한 값: overlay 버디는 96 px 슬롯이다(Home은 114 px). 그룹(720 × 366)의 높이 안에 제목·본문과 함께 여유 있게 들어가고, 행 카드(48 px)보다는 확실히 크다. dialog 문구는 아래 초안대로 확정했다(clarify preset 기준으로 바꿀 이유가 없었다). 잠금 overlay는 사용자 요청에 따라 문제 프로젝트 overlay의 제목·본문 구조를 따른다(아래 '잠금 overlay').

- 사용자 확인: 다섯 frame을 앱에서 보고 확정했다. 확인 dialog는 출시된 compact dialog 값(padding 32px)을 그대로 쓴다.

## 영향받는 구성 요소

- **app (renderer)**
  - `SettingsGeneral.tsx`: 확인 dialog, 잠금 overlay, 남은 시간 갱신, `onLock` 호출.
  - `SettingsPage.tsx`: 지금은 `onLock`을 Agents와 MCP Connectors에만 넘긴다. General에도 넘긴다.
  - `SettingsDialog.tsx`: 기존 compact alertdialog(Cancel이 포커스를 받고 Escape를 처리한다)를 재사용한다. 확인이 비동기일 때 쓸 진행 상태(확인 버튼 spinner, Cancel·Escape 무시)를 추가한다. Project Settings의 Share 확인은 그대로 동작해야 한다.
  - `BuddyPicker.tsx`의 `BuddyRows`: 화살표 키는 포커스만 옮기고, 클릭·Space·Enter는 `request(id)`로 확인을 요청한다. native radio의 checked 변경은 막는다. first run의 `BuddyFlow`는 바뀌지 않는다.
  - `buddySelection.ts`: Settings에서 고른 저장에 변경 시각을 같은 patch로 보낸다. 실패 기록에 Settings에서 난 실패인지 남겨 Retry가 같은 경로로 보내게 한다. `seenAt`을 이 hook 옆(App)에 둔다.
  - 새 순수 모듈 `buddyCooldown.ts`, 스타일(`styles.css`).
- **app (main)**: `preferences.ts`에 새 선택 필드 `buddyChangedAt`의 읽기·patch·merge를 추가한다.
- **CLI (Go)·skill·공유 형식**: 바뀌지 않는다.

## 흐름

1. Settings > General에서 지금 버디가 아닌 행을 클릭하거나, 포커스한 행에서 Space·Enter를 누르면 `request(id)`가 호출된다. 지금 버디인 행을 누르면 아무 일도 없다. 클릭과 Space는 `preventDefault`로 막아 radio가 잠깐 checked로 바뀌지 않게 한다.
2. `SettingsDialog`가 열린다. Cancel이 앞에 오고 포커스를 받으며, 그 뒤에 확인 버튼이 온다. 열려 있는 동안 행·accent·Home은 저장된 버디 그대로이고, `onLock(true)`로 Settings 페이지 Lock이 걸린다. 문구는 다음과 같다(draft에서 확정).
   - 제목: "Switch to <Name>?"
   - 본문: "You can’t change your buddy again for 24 hours."
   - 버튼: Cancel / "Switch to <Name>"
3. Cancel·Escape를 누르면 아무것도 저장하지 않고 닫히며, `onLock(false)`가 호출되고, 포커스는 누른 행으로 돌아간다.
4. 확인하면 dialog는 열린 채 진행 상태가 된다. 확인 버튼에 spinner가 돌고, Cancel·Escape는 무시된다(대화 Delete 확인과 같은 방식). `useBuddySelection.select(id, changedAt)`는 `{ buddy, buddyChangedAt }` 하나의 patch로 저장하므로, 두 값은 함께 저장되거나 함께 실패한다. 기존의 seq 비교(가장 마지막 pick의 응답만 반영)는 그대로 쓴다.
5. 응답이 오면 dialog가 닫히고 `onLock(false)`가 호출된다.
   - 성공하면 snapshot의 `buddyChangedAt`으로 잠금이 계산되어 overlay가 그룹을 덮는다. 포커스는 overlay의 버디 버튼("Make <name> hop")으로 옮긴다.
   - 실패하면 지금의 실패 notice와 Retry를 보여주고, 포커스는 누른 행으로 간다. 잠금은 없다.
6. Retry는 dialog 없이 같은 버디를 다시 저장한다. 이미 확인한 pick이기 때문이다. 실패 기록(`BuddyFailure`)에 Settings 경로였는지(`cooldown: true`)를 담고, 그 경우에만 새 변경 시각을 보낸다. first run과 buddy screen의 Retry는 변경 시각을 보내지 않는다. Retry가 성공하면 5의 성공과 같이 포커스를 overlay 버디로 옮긴다. 지금의 `focusChecked`는 행이 `inert`가 되어 `<body>`로 떨어지므로 쓰지 않는다.

## 잠금 overlay

- `.doan-settings-group`(다섯 행)만 덮는다. section 제목과 설명, preferences notice, 실패 notice는 덮지 않는다.
- 재질은 문제 overlay와 같다. `color-mix(in srgb, var(--surface-panel) 60%, transparent)`에 `--blur-sm` backdrop blur를 쓰고, reduced transparency에서는 불투명 `--surface-panel`에 blur를 쓰지 않는다(DESIGN.md 'Problem overlay'). 그룹의 모서리를 따른다.
- 내용: 아이콘 자리에 지금 버디를 Home의 `Buddy` 컴포넌트(`Doany.tsx`)로 보여주고, 그 아래 16 px에 문제 overlay scene의 타이포(`.ob-heading.problem-heading`)로 제목과 본문을 둔다. 제목은 heading role(24 / 26.4, 500)로 남은 시간을 `HH:mm:ss` 카운트다운으로 보여준다. 1초마다 줄어드는 숫자가 흔들리지 않게 `font-variant-numeric: tabular-nums`를 쓴다. 그 아래 12 px에 `--text-subtle` body-sm 본문 "Until you can change your buddy again. Your buddy stays for 24 hours after each change."로 설명한다. 뒤에 action이 없으므로 제목 블록의 아래 여백은 없다. 제목 블록은 문제 overlay scene처럼 최대 560 px(좌우 24 px 안쪽 여백)이고, 본문은 `text-wrap: balance`로 두 줄 길이를 맞춘다. 숨쉬기·깜빡임·시선·포인터 따라보기·누르면 hop은 Home과 같다. 입력 필드가 없으므로 typing 시선은 없다. reduced motion이면 쉬고, WebGL이나 텍스처가 없으면 정지 이미지로 대신한다(PRODUCT §5 item 1 'Buddy'). 크기는 96 px 슬롯이다(draft에서 확정, Home은 114 px).
- 덮인 행은 `inert`로 둔다. 클릭·포커스·선택을 받지 않는다.
- 접근성: 제목과 본문은 보이는 텍스트로 두고, 이 순서로 버디 버튼의 `aria-describedby`에 연결한다. 그러면 스크린 리더가 "Make Popo hop, button, 23:59:41, Until you can change your buddy again. …"처럼 포커스가 갈 때 한 번 지금 버디와 남은 시간을 함께 읽는다. 제목에는 live role을 붙이지 않는다. 붙이면 매초 읽힌다.
- 버디 버튼의 외곽선은 공유 focus ring이고, 키보드 포커스가 있을 때(`:focus-visible`)만 보인다. draft의 `general-locked`가 그리는 것은 저장 직후 포커스가 버디로 옮겨 간 상태다.
- 갱신: 잠긴 동안 다음 초 경계에 맞춰 1초마다 다시 그린다. 매번 현재 시각으로 다시 계산하므로 타이머가 밀려도 숫자는 맞다. 잠자기 중 타이머가 늦게 깨어날 수 있으므로 `visibilitychange`와 창 focus 때도 바로 다시 계산한다. 창이 숨겨진 동안에는 그리지 않아도 된다.
- 남은 시간이 0이 되면 overlay가 사라지고 행이 다시 활성화된다. 포커스가 overlay 버디에 있었으면 checked 행으로 옮긴다(`focusChecked`).
- preferences notice가 `newer`이면 `buddyChoiceOff`대로 행을 끄고 overlay는 보이지 않는다. snapshot을 받기 전에도 행이 꺼지고 overlay는 보이지 않는다. `broken`이면 `buddyChangedAt`이 없으므로 잠금이 없다.
- 같은 key를 형제 요소와 나누지 않는다(POSTMORTEM 2026-11-07 'Entering a problem project blanked the renderer because the overlay and the Overview shared a key').
- WebGL context: Home의 `Buddy`는 `screen === "home"`일 때만 마운트되고 docked buddy는 workspace에서만 돈다. Settings 페이지에서는 overlay 버디가 유일한 context다. Home의 `Buddy`는 context를 잃으면 다시 만들지 않고 정지 이미지로 남는다(다시 만드는 코드는 `dockedBuddyShell.ts`에만 있다). overlay도 같은 한계를 가진다. context를 잃으면 정지 이미지로 남고, General에 다시 들어오면 다시 그린다. 이것은 알려진 한계로 둔다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `buddyCooldown.ts`
  - `COOLDOWN_MS = 24h`.
  - `cooldownEnd(changedAt: number, seenAt: number): number`는 `min(changedAt, seenAt) + COOLDOWN_MS`를 돌려준다. `seenAt`은 이 실행에서 renderer가 그 `buddyChangedAt` 값을 처음 읽은 시각이다(snapshot을 받은 때, 또는 저장 응답을 받은 때). App이 값별로 하나씩 가지므로 General을 다시 열어도 바뀌지 않는다. 앱을 다시 실행하면 새로 정해진다.
  - `cooldownRemaining(end, now): number | null`은 남은 ms를 돌려주고, 끝났으면 null을 돌려준다.
  - `cooldownClock(remainingMs): string`: 남은 시간을 초 단위로 올림해 `HH:mm:ss`로 만든다. 시간은 두 자리로 채운다. 저장 직후는 `24:00:00`, 마지막 1초는 `00:00:01`이다. 본문은 고정 문장이다(draft에서 확정).
  - `nextTick(remainingMs): number`: 표시되는 초가 바뀌는 다음 시점까지의 ms(1–1000)를 돌려준다.
- `rowFocusTarget(ids, current, key): BuddyId | null`: ArrowUp/Left·ArrowDown/Right에 순환하는 다음 행을 돌려주고, 다른 키에는 null을 돌려준다.
- `preferences.ts`
  - 파일 읽기: `buddyChangedAt`은 ISO 8601 UTC 문자열이다. 유효하다는 것은 `new Date(s).toISOString() === s`가 성립한다는 뜻이다. 없거나 유효하지 않은 값은 그 필드만 없는 것으로 읽는다. 기본 규칙(잘못된 알려진 필드는 파일 전체를 broken으로 만든다)의 예외다. 이 값을 잃으면 잠금만 풀리지만, broken은 알림·새 대화 설정까지 기본값으로 되돌리기 때문이다.
  - patch: `buddyChangedAt`은 유효한 문자열일 때만, 그리고 `buddy`와 함께일 때만 받는다. 아니면 patch 전체를 거절한다.
  - merge: `buddyChangedAt`이 없는 patch는 기존 값을 그대로 둔다. first run·buddy screen의 `buddy`만 있는 patch, notifications·updates patch가 모두 여기에 해당한다. `mergePreferences`는 객체를 새로 만들므로 이 필드를 명시적으로 옮겨 담아야 한다.

## 형식 변경

- `preferences.json`은 device-local 파일이고 공유 schema가 없다(ARCHITECTURE §11 'Device-local files without shared schemas'). `v`는 1 그대로이고 fixture는 없다. `preferences.test.ts`가 schema 역할을 한다.
- 이전 빌드는 모르는 필드를 무시하고, 다음 쓰기에서 버린다. 그러면 잠금이 풀린다(spec 비목표).

## Conventions·결정 영향

- ARCHITECTURE §1 conventions와 `doan check` 규칙은 바뀌지 않는다.
- ARCHITECTURE §7 'Settings IPC' 'Preferences'에 `buddyChangedAt`과 그 읽기 예외(이유 포함)를 추가한다. 'First-run onboarding'의 Buddy step 문단에는 Settings pick만 변경 시각을 보낸다는 점을 추가한다(마지막 task).
- PRODUCT §5 item 0을 바꾼다. 'General'의 "A pick saves at once"와 "the arrow keys cycle as native radios"를 고치고, 'Settings page' Lock 목록에 버디 확인 dialog를 추가하고, 'Settings storage'에 변경 시각을 추가한다. item 1 'Buddy'에는 Settings > General에서는 확인 뒤에 바뀐다는 점을 추가한다.

## PoC 의존

- 없다. 잠자기 중 타이머 동작은 확인하지 않았지만, `visibilitychange`와 창 focus 때 다시 계산하므로 결과가 타이머에 의존하지 않는다.

## 관련 POSTMORTEM

- 2026-10-25 'An older install failure replaced newer feedback': 저장 응답은 가장 마지막 pick의 것만 반영한다. 기존 `useBuddySelection`의 seq 비교를 그대로 쓴다.
- 2026-11-12 'An arrow key on the setup panel's storage radio dropped focus to the heading': 화살표 키를 누른 뒤 `document.activeElement`가 다음 행인지 테스트한다. 저장 뒤 행이 `inert`가 되면 포커스가 `<body>`로 떨어지므로 overlay 버디로 옮긴다.
- 2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking': 확인 dialog는 Settings 위에 modal `<dialog>`로 쌓고, Escape는 dialog가 처리한다. 진행 중에 버튼이 비활성이 되어도 포커스가 dialog 밖으로 떨어지지 않게 확인 버튼은 `aria-disabled`로 둔다.
- 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body': dialog를 닫으면 포커스를 누른 행이나 overlay 버디로 명시적으로 옮긴다.
- 2026-11-12 'The docked buddy stood still for good after its WebGL context was lost': Home `Buddy`에는 복구가 없다. 위 'WebGL context'의 알려진 한계로 둔다.

## 디자인 preset

- `clarify`를 읽었다. dialog 제목과 확인 버튼은 행동과 대상을 이름으로 말한다(Yes·OK를 쓰지 않는다). 본문은 결과(24시간 동안 다시 바꿀 수 없음)를 한 번만 말한다. 잠금 overlay의 제목은 사람이 지금 알아야 할 한 가지(언제 바꿀 수 있는지)를 카운트다운으로 보여주고(사용자 결정), 본문이 그 숫자가 무엇인지와 규칙을 한 번씩 말한다.
