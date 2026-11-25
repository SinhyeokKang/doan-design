# 핸드오프 카드 강조 — tasks

순서: 드래프트(메타 결정) → 썸네일 공유 확인 → 순수 함수 → UI → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다.

## T1. 드래프트와 메타 결정

- `/design-draft handoff-card-emphasis`로 design.md '드래프트 요청'의 프레임을 그린다. 메타 후보를 모두 그리고, 사용자가 앱에서 덜어낸다. 묶음에서 썸네일을 둘지도 고른다. 덜어낸 메타는 드래프트와 문서에서 지운다.
- 상태 줄, 메타 줄, 그룹 이름, Open 이름 문구를 `clarify` 프리셋으로 정해 `copy` 프레임에 둔다. 상태 줄은 방향을 말해야 한다.
- 검증: `doan check`가 통과하고, `doan ls`의 프레임 id가 요청과 같고, 사용자가 남긴 메타와 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. 썸네일 공유와 프로토타입 창 IPC (썸네일이 남은 경우)

- `useThumbnails`/`ThumbnailRequests`를 root마다 하나로 App에 올리고, Overview와 캔버스 패널이 같은 인스턴스를 쓴다.
- `thumbnails:get`과 `thumbnails:visible`을 프로토타입 창에 열고(`senderAllowed.ts`, `preload/prototype.ts`), 재생 중인 root 안의 경로만 받는다.
- 결정 지점: 이 작업이 design.md에 적은 범위(두 채널을 여는 것, root 범위 제한, 인스턴스 공유)를 넘어 새 캡처 경로나 새 채널이 필요하면, 멈추고 사용자에게 묻는다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `senderAllowed.test.ts`: 프로토타입 창이 두 채널을 쓸 수 있고, 다른 root의 경로는 거부된다.
  - `preload/prototype.test.ts`: 노출된 API
  - `thumbnails.test.ts`, `thumbnailVisibility.test.ts`: 두 화면이 한 인스턴스를 공유해도 보이는 상태와 Blob URL을 서로 덮어쓰지 않는다.
- `[commit]` `test:` → `feat:`

## T3. 순수 함수: `handoffCardView`와 `canvasCardMeta`

- `/tdd`로 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다.
- `handoffView.ts`의 `handoffCardHead`를 `handoffCardView`로 바꾼다.
- `canvasCardText.ts`에 `canvasCardMeta`를 더하고, 두 카드가 같이 쓴다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `handoffView.test.ts`: 네 경우(캔버스 원본, 사라진 원본, Overview 원본, 지워진 Overview 원본)가 새 문구로 통과한다.
  - `canvasCardText.test.ts`: `canvasCardMeta`의 사라진 캔버스, `mtimeMs` 없음, 프레임 없음, `framesTruncated`, 상대 시각 경계(`shortAgo`), 폴더 표시 여부, 썸네일 네 상태, Drawing 중 숨김
- `[commit]` `test:` → `feat:`

## T4. UI: 공유 클래스, 머리 행, 메타

- `ConversationThread.tsx`:
  - `HandoffCard`와 `CanvasCard`가 같은 바탕 클래스와 머리 행 클래스를 쓰게 한다. `.handoff-card` 클래스는 유지한다(포커스 선택자 `:121`, `:875`).
  - 두 카드에 `CanvasRow`와 썸네일 상태를 넘긴다. 캔버스 패널, Overview, 프로토타입 창의 prop을 바꾼다.
  - memo deps에 새 메타와 분 단위 `now`를 더한다.
- `styles.css`: design.md 'CSS 구조'대로 나눈다. `.handoff-head`를 지운다.
- 검증: `npm --prefix app test`에서 다음이 통과한다.
  - `ConversationThread.test.tsx`: 두 카드의 마크업, 그룹 이름(메타 제외), Open 이름, Open이 숨는 경우, 카드 턴이 끝났을 때 Edit and resend 없음, 썸네일 `aria-hidden`
  - `ConversationThread.focus.test.tsx`, `CanvasConversationPanel.hooks.test.tsx`: 이동 뒤 카드 포커스
  - `App.handoff.test.tsx`
  - `npm --prefix app run typecheck`와 `npm --prefix app run lint`도 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`로 드래프트와 실제 앱의 computed style을 맞춘다.
  - 대상은 받는 쪽 핸드오프 카드와 보내는 쪽 캔버스 카드 둘 다이고, `.cc-name`과 `.cc-kind`까지 자식 단위로 비교한다.
  - `docs/design/conversation.md`의 'Canvas handoff', 'Several handoffs in one turn', 'Canvas cards'(프로젝트 대화 핸드오프 문단 포함) 측정값과 'Regression pointers'를 새 값으로 고친다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`로 격리된 실제 앱에서 확인한다. 핸드오프는 이전 확인처럼 main에서 `conversation:handoff`를 심어 재현한다. 실제 provider 턴으로 하는 핸드오프는 확인하지 않는다(BACKLOG에 이미 있다).
  - probe:
    - 캔버스 원본 카드와 이동 직후 포커스 링
    - Overview 원본 카드, 사라진 원본 캔버스, 지워진 원본 대화
    - 캔버스 카드 5장 묶음(347, 280), Overview 720의 캔버스 카드
    - 280에서 긴 이름
    - 본문 inline code 바탕, 같은 스레드의 "Stopped" 노티스와 나란히
    - 프로토타입 창의 썸네일
  - 검증: probe마다 드래프트와 같은 모습이 보이고, Open이 지금과 같은 곳으로 간다. 스크린샷은 `.scratch/`에 저장한다. 직접 확인하지 못한 항목은 T6에서 BACKLOG에 남긴다.
- `[commit]` `docs(design):`

## T6. 승격과 정리

- `docs/PRODUCT.md`를 현재 규칙으로 고쳐 쓴다.
  - §5 item 2 'Handoff'의 핸드오프 카드 문구
  - §5 item 3 'Canvas cards'의 바탕, 메타, "다시 열어도 같은 모습" 규칙(상태와 이름은 같고, 메타는 현재 캔버스를 따른다)
  - 썸네일이 남았다면 §5 'Overview'의 썸네일 규칙에 스레드 카드를 더한다
- 썸네일이 남았다면 `docs/ARCHITECTURE.md` §3(썸네일 캡처 대상과 캐시를 읽는 창)과 §7(프로토타입 창 IPC 경계)을 고친다.
- `.doan/canvases/readme-features.html`의 `handoff-card`/`canvas-card` 표시를 새 모습으로 고치고 `docs/assets/readme/`로 다시 내보낸다(AGENTS.md 'Documents' README 행). 바꾼 장면이 README 이미지에 없으면 그 사실을 PR 본문에 적는다.
- 미검증 화면은 `docs/BACKLOG.md`에 남긴다.
- 최종 `styles.css`에서 한쪽만 쓰는 규칙이 자기 클래스에 있는지 확인한다(design.md 'CSS 구조').
- `docs/features/handoff-card-emphasis/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과하고, PRODUCT와 ARCHITECTURE 본문에 `docs/features/` 참조가 없다.
- `[commit]` 문서마다 따로(`docs(PRODUCT):`, `docs(ARCHITECTURE):`, `docs(BACKLOG):`, `docs(design):`, `docs(feature):`).
