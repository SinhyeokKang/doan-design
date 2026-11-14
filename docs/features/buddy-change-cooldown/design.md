# 버디 변경 24시간 잠금 — design

## 영향받는 구성 요소

- **app (renderer)**: `SettingsGeneral.tsx`(확인 dialog, 잠금 overlay, 남은 시간 갱신), `BuddyPicker.tsx`의 `BuddyRows`(화살표 키는 포커스만 옮김, 클릭·Space·Enter는 `request(id)`로 확인을 요청), `buddySelection.ts`(Settings에서 고른 저장에 변경 시각을 함께 보냄), 새 순수 모듈 `buddyCooldown.ts`, 스타일(`styles.css`).
- **app (main)**: `preferences.ts` — 새 선택 필드 `buddyChangedAt`의 읽기·patch·merge.
- **CLI (Go)·skill·공유 형식**: 바뀌지 않는다.

## 흐름

1. Settings > General에서 지금 버디가 아닌 행을 클릭하거나, 포커스한 행에서 Space·Enter를 누르면 `request(id)`가 호출된다. 지금 버디인 행을 누르면 아무 일도 없다.
2. 확인 dialog가 열린다. 형태는 기존 compact 확인(Cancel이 앞에 오고 포커스를 받으며, 그 뒤에 확인 버튼; PRODUCT §5 item 1 'Canvas row menu'의 Move to Trash, item 3의 Delete)을 따른다. 열려 있는 동안 행·accent·Home은 저장된 버디 그대로다. 문구는 clarify preset으로 draft에서 정한다. 초안:
   - 제목: "Switch to <Name>?"
   - 본문: "You can’t change your buddy again for 24 hours."
   - 버튼: Cancel / "Switch to <Name>"
3. Cancel·Escape를 누르면 아무것도 저장하지 않고 닫히며, 포커스는 누른 행으로 돌아간다.
4. 확인하면 dialog가 닫히고 `useBuddySelection.select(id, { changedAt })`가 기존 경로로 저장한다(고른 버디가 바로 보이고, 가장 마지막 pick의 응답만 반영한다). patch는 `{ buddy, buddyChangedAt }` 하나로 보내서 두 값이 함께 저장되거나 함께 실패한다.
5. 성공하면 snapshot의 `buddyChangedAt`으로 잠금이 계산되어 overlay가 그룹을 덮는다. 포커스는 overlay의 버디(Make <name> hop 버튼)로 옮긴다. 실패하면 지금의 실패 notice와 Retry가 보이고 잠금은 없다. Retry는 dialog 없이 같은 버디를 새 시각으로 다시 저장한다(이미 확인한 pick이다).
6. Settings 페이지 잠금: dialog가 열린 동안에는 PRODUCT §5 item 0 'Settings page' Lock 규칙(Agents의 stop 확인, MCP Connectors의 dialog)과 같이 페이지를 떠나는 모든 경로를 무시하고 비활성으로 보여준다.

## 잠금 overlay

- `.doan-settings-group`(다섯 행)만 덮는다. section 제목과 설명, preferences notice, 실패 notice는 덮지 않는다.
- 재질은 문제 overlay와 같다: `color-mix(in srgb, var(--surface-panel) 60%, transparent)`와 `--blur-sm` backdrop blur, reduced transparency에서는 불투명 `--surface-panel`에 blur 없음(DESIGN.md 'Problem overlay'). 그룹의 모서리를 따른다.
- 내용: 아이콘 자리에 지금 버디를 Home의 `Buddy` 컴포넌트(`Doany.tsx`)로 보여주고, 그 아래에 남은 시간 한 줄을 보여준다. 숨쉬기·깜빡임·시선·포인터 따라보기·누르면 hop은 Home과 같고, 입력 필드가 없으므로 typing 시선은 없다. reduced motion이면 쉬고, WebGL이나 텍스처가 없으면 정지 이미지로 대신한다(PRODUCT §5 item 1 'Buddy'). 크기는 draft에서 정한다(Home보다 작게, 그룹 높이 안에서 남은 시간 줄과 함께 들어가도록).
- 덮인 행은 `inert`로 둔다. 클릭·포커스·선택을 받지 않는다. overlay의 남은 시간 줄은 그룹의 `aria-describedby`로 연결한다.
- 남은 시간이 0이 되면 overlay가 사라지고 행이 다시 활성화된다. 포커스가 overlay 버디에 있었으면 checked 행으로 옮긴다(`focusChecked`).
- 같은 key를 형제 요소와 나누지 않는다(POSTMORTEM 2026-11-07 'Entering a problem project blanked the renderer because the overlay and the Overview shared a key').

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `buddyCooldown.ts`
  - `COOLDOWN_MS = 24h`.
  - `cooldownEnd(changedAt: number, seenAt: number): number` — `min(changedAt, seenAt) + COOLDOWN_MS`. `seenAt`은 이 renderer가 그 값을 처음 읽은 시각(snapshot을 받은 때, 또는 저장 응답을 받은 때)이다. 시계가 뒤로 가서 `changedAt`이 미래여도 끝 시각은 처음 본 때부터 24시간을 넘지 않는다. 재실행하면 `seenAt`이 새로 정해지므로 그 경우의 상한은 재실행 시점부터 24시간이다.
  - `cooldownRemaining(end, now): number | null` — 남은 ms, 끝났으면 null.
  - `cooldownText(remainingMs): string` — 1시간 이상은 시간을 올림해 "in 24 hours"/"in 1 hour", 1시간 미만은 분을 올림해 "in 59 minutes"/"in 1 minute". 문구 본문은 draft에서 clarify preset으로 확정하고 이 함수가 그 문구를 만든다.
  - `nextRefresh(remainingMs): number` — 표시되는 숫자가 바뀌는 다음 시점까지의 ms(시간 단위면 다음 시간 경계, 분 단위면 다음 분 경계, 끝나면 끝 시각).
- `BuddyRows` 키 처리: `rowFocusTarget(ids, current, key): BuddyId | null` — ArrowUp/Left·ArrowDown/Right가 순환하며 다음 행을 돌려준다. 이 함수로 native radio의 화살표 선택을 막고 포커스만 옮긴다.
- `preferences.ts`
  - 파일 읽기: `buddyChangedAt`은 ISO 8601 UTC 문자열이다. 없거나 읽을 수 없는 값은 그 필드만 없는 것으로 읽는다(`buddy`와 같은 예외; 파일 전체를 broken으로 만들지 않는다).
  - patch: `buddyChangedAt`은 유효한 ISO 문자열일 때만 받고, `buddy`와 함께일 때만 받는다. 아니면 patch 전체를 거절한다.
  - merge: `buddy`만 있는 patch(first run, buddy screen)는 기존 `buddyChangedAt`을 그대로 둔다.

## 형식 변경

- `preferences.json`은 device-local 파일이고 공유 schema가 없다(ARCHITECTURE §11 'Device-local files without shared schemas'). `v`는 1 그대로이고 fixture는 없다. `preferences.test.ts`가 schema 역할을 한다.
- 이전 빌드는 모르는 필드를 무시하고, 다음 쓰기에서 버린다. 그러면 잠금이 풀린다(spec 비목표).

## Conventions·결정 영향

- ARCHITECTURE §1 conventions와 `doan check` 규칙은 바뀌지 않는다.
- ARCHITECTURE §7 'Settings IPC' 'Preferences'에 `buddyChangedAt`과 그 읽기 예외를, 'First-run onboarding'의 Buddy step 문단에 Settings pick만 변경 시각을 보낸다는 점을 추가해야 한다(마지막 task).
- PRODUCT §5 item 0 'General'의 "A pick saves at once"와 "the arrow keys cycle as native radios"가 바뀐다. 'Settings page' Lock 목록에 버디 확인 dialog를 추가한다.

## PoC 의존

- 없다. Home의 `Buddy`를 Settings에서 두 번째 인스턴스로 그리는 것은 처음이다. Home과 Settings는 동시에 보이지 않지만, WebGL context는 각 인스턴스가 따로 만든다. context를 잃었을 때 다시 만드는 규칙(POSTMORTEM 2026-11-12 'The docked buddy stood still for good after its WebGL context was lost')은 Home 인스턴스와 같은 코드를 쓰므로 따로 확인하지 않는다.

## 관련 POSTMORTEM

- 2026-10-25 'An older install failure replaced newer feedback' — 저장 응답은 가장 마지막 pick의 것만 반영한다. 기존 `useBuddySelection`의 seq 비교를 그대로 쓴다.
- 2026-11-12 'An arrow key on the setup panel's storage radio dropped focus to the heading' — 화살표 키가 포커스만 옮기도록 바꾸므로, 키를 누른 뒤 `document.activeElement`가 다음 행인지 테스트한다. 저장 후 행이 `inert`가 되면 포커스가 `<body>`로 떨어지므로 overlay 버디로 옮긴다.
- 2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking' — 확인 dialog는 Settings 위에 modal `<dialog>`로 쌓고, Escape는 dialog가 처리한다.
- 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body' — dialog를 닫으면 포커스를 누른 행으로 돌려놓는다.

## 디자인 preset

- `clarify`를 읽었다: dialog 제목·확인 버튼은 행동과 대상을 이름으로 말하고(Yes/OK 금지), 본문은 결과(24시간 동안 다시 바꿀 수 없음)를 한 번만 말한다. 남은 시간은 숫자와 단위를 하나의 완결된 문장으로 만든다.
