# 핸드오프 카드 강조 — tasks

순서: 드래프트(메타 결정) → 순수 함수 → UI → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다.

## T1. 드래프트와 메타 결정

- `/design-draft handoff-card-emphasis`로 design.md '드래프트 요청'의 프레임을 그린다. 메타 후보를 모두 그리고, 사용자가 앱에서 덜어낸다. 덜어낸 메타는 드래프트와 문서에서 지운다.
- 썸네일을 남기면, 캔버스 패널과 프로토타입 창에서 Overview 썸네일 캐시를 읽거나 캡처를 요청할 수 있는지 코드로 확인하고 design.md에 적는다.
- 상태 줄, 그룹 이름, Open 이름 문구를 `clarify` 프리셋으로 정해 `copy` 프레임에 둔다.
- 검증: `doan check`가 통과하고, `doan ls`의 프레임 id가 요청과 같고, 사용자가 남긴 메타와 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. 순수 함수: `handoffCardView`

- `handoffView.ts`의 `handoffCardHead`를 `handoffCardView`로 바꾼다. 캔버스 원본, 사라진 원본, Overview 원본, 지워진 Overview 원본의 네 경우가 이름, 종류, 상태, 그룹 이름, Open 여부를 낸다.
- 검증: `npm --prefix app test`에서 `handoffView.test.ts`의 네 경우가 새 문구로 통과한다.
- `[commit]` `test:` → `feat:`

## T3. UI: 공유 머리 행과 바탕

- `ConversationThread.tsx`의 `HandoffCard`와 `CanvasCard`가 같은 머리 행을 쓰게 한다. `styles.css`에서 두 카드의 바탕, 모서리, 머리 행 규칙을 합친다. 두 카드의 바탕, 보더, 크기, 메타와 본문 inline code 바탕을 바꾼다.
- 검증: `npm --prefix app test`에서 `ConversationThread.test.tsx`(두 카드의 마크업, 그룹 이름, Open 이름, Open이 숨는 경우, 이동 뒤 포커스 대상)와 `App.handoff.test.tsx`가 통과한다. `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 측정과 실기 확인

- `/design-sync`로 드래프트와 실제 앱의 computed style을 맞춘다. 대상은 받는 쪽 핸드오프 카드와 보내는 쪽 캔버스 카드 둘 다다. `docs/design/conversation.md`의 'Canvas handoff'와 'Canvas cards' 측정값을 새 값으로 고친다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`로 격리된 실제 앱에서 핸드오프로 시작된 대화와 캔버스 카드가 있는 대화를 하나씩 연다.
  - 검증: 두 카드가 같은 바탕과 머리 행으로 보이고, 이동 직후 카드에 포커스 링이 보이고, Open이 지금과 같은 곳으로 간다. 스크린샷은 `.scratch/`에 저장한다. 직접 확인하지 못한 화면(프로토타입 창 등)은 T5에서 BACKLOG에 남긴다.
- `[commit]` `docs(design):`

## T5. 승격과 정리

- `docs/PRODUCT.md` §5 item 2 'Handoff'의 핸드오프 카드 문구와 §5 item 3 'Canvas cards'의 바탕과 메타 문구를 현재 규칙으로 고쳐 쓴다.
- ARCHITECTURE: 바뀌는 구조가 없으므로 고치지 않는다.
- 미검증 화면은 `docs/BACKLOG.md`에 남긴다.
- `docs/features/handoff-card-emphasis/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(BACKLOG):`, `docs(feature):`).
