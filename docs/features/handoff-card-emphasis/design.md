# 핸드오프 카드 강조 — design

## 영향 범위

- **app renderer**:
  - `handoffView.ts`: `handoffCardHead`(`:55`)가 문자열 하나를 낸다. 이것을 머리 행에 필요한 구조로 바꾼다.
  - `canvasCardText.ts`: 캔버스 카드 view(`:33`)에 메타를 더한다.
  - `ConversationThread.tsx`:
    - `HandoffCard`(`:621`)의 머리를 `CanvasCard`의 머리 행과 같은 마크업으로 그린다. 이름의 가운데 자르기는 `CardName`(`:596-617`, `middleCut`은 `canvasCardText.ts:65-70`)을 그대로 쓴다.
    - 두 카드는 메타를 그리기 위해 해당 캔버스의 `CanvasRow`와 썸네일 상태를 받아야 한다. 지금 `HandoffCard`는 `canvasListed`/`conversationListed` 불리언만 받는다. 캔버스 패널(`CanvasConversationPanel.tsx`), Overview(`ProjectOverview.tsx`), 프로토타입 창이 같은 prop을 넘기도록 바꾼다.
    - `ThreadEntry`의 memo deps(`:926-929`, 지금은 `[project, listed, !!onOpenHandoff]`)에 새 메타(`mtimeMs`, `frames`, 썸네일 상태)와 분 단위로 바뀌는 `now`를 더한다. 빠뜨리면 메타가 갱신되지 않는다.
    - 포커스 선택자 `ENTRY_FOCUS`(`:121`)와 `scrollIntoView` 선택자(`:875`)는 `.handoff-card` 클래스에 의존한다. 그래서 이 클래스 이름은 유지한다.
  - `styles.css`: 아래 'CSS 구조'를 따른다.
  - `thumbnails.ts`: `useThumbnails`와 `ThumbnailRequests`(`:24-113`)는 root마다 하나이고, 경로마다 보이는 상태를 알린다. 패널에서 두 번째 인스턴스를 만들면 Overview 인스턴스와 `thumbs.visible`을 서로 덮어쓰고, 자기 Blob URL을 회수한다. 그래서 root마다 한 인스턴스를 App으로 올려 공유한다.
- **main과 preload (썸네일, 사용자 결정 '모든 창')**:
  - `thumbnails:get`과 `thumbnails:visible`은 지금 main 창 전용이다(`app/src/main/senderAllowed.ts:15`). `preload/prototype.ts`에는 썸네일 호출이 없다.
  - 프로토타입 창에도 썸네일을 보여주려면 두 채널을 프로토타입 창에 열고, 그 창이 재생 중인 캔버스의 root 안 경로만 요청하도록 범위를 제한한다(`main/prototype/conversationScope.ts`의 범위 규칙과 같은 방식).
  - 이것은 ARCHITECTURE §7의 프로토타입 창 IPC 경계를 바꾸는 결정이다. 사용자가 승인했다(2026-11-25). T5에서 ARCHITECTURE를 고쳐 쓴다.
- **형식, CLI, 스킬**: 바뀌지 않는다. 핸드오프 이벤트와 `origin`은 그대로다.
- **`/agent-eval`**: 해당하지 않는다. 안내, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않는다.
- **표시 위치**: 받는 쪽 핸드오프 카드는 캔버스 대화에만 생긴다. 핸드오프는 늘 캔버스를 대상으로 하기 때문이다. 그래서 캔버스 패널과 프로토타입 창에만 나온다. 캔버스 카드는 세 곳(캔버스 패널, Overview, 프로토타입 창) 모두에 나온다. 원본은 늘 같은 root에 있다(`handoff.ts:23` `root_mismatch` 거부).
- **테마**: 앱은 라이트 전용이다(DESIGN.md 'Design system'). 다크 모드 작업은 없다.

## 머리 행

- 구성은 캔버스 카드와 같다(`docs/design/conversation.md` 'Canvas cards'): grid `auto minmax(0, 1fr) auto`, 상태 아이콘, 이름 줄(종류 아이콘과 굵은 이름) 위에 상태 줄, Open.
- 상태 아이콘은 `forward`다(보내는 쪽 카드의 "Handed off"와 같은 아이콘).
- 이름:
  - 캔버스 원본: `panels-top-left` 아이콘과 파일 이름. 긴 이름은 가운데를 자르고, 잘리면 툴팁에 전체 이름을 보여준다.
  - Overview 원본: Overview의 아이콘과 "Overview". 아이콘은 드래프트에서 정한다(사이드바나 머리에서 Overview가 쓰는 아이콘을 옮긴다).
- 상태 줄: 받는 쪽에서 본 사실 한 줄이다. 두 카드가 같은 모양이라, 보내는 쪽 카드의 굵은 이름은 대상이고 받는 쪽 카드의 굵은 이름은 원본이다. 이 방향은 상태 줄만 알려주므로, 문구에 방향이 남아야 한다. 후보는 "Handed off to this conversation"이다. "Handed off"처럼 줄이면 안 된다. `clarify` 프리셋으로 드래프트에서 정한다. 원본이 사라지면 " · No longer in <project>", 원본 대화가 지워지면 " · Conversation deleted"를 더하고 Open을 숨긴다(지금 규칙 그대로).
- Open: 캔버스 카드와 같은 sm `trigger` 버튼이고, 목적지는 지금과 같다.
- 클릭 대상은 Open뿐이다. 카드는 `group`이고 버튼이 아니다. 썸네일은 장식(`aria-hidden`, 기본 커서)이다. 핸드오프 카드의 본문은 선택할 수 있는 Markdown이라, 카드 전체를 버튼으로 만들면 텍스트 선택과 부딪힌다. macOS에서도 선택할 수 있는 텍스트는 버튼이 아니다.
- 접근성:
  - 두 카드의 그룹 이름을 같은 방식으로 맞춘다. 캔버스 카드처럼 `aria-label`에 "<이름>, <상태>"를 둔다(예: "drafts.html, Handed off to this conversation"). 지금 핸드오프 카드는 `aria-labelledby={headId}`(`:627`)라서 방식이 다르다.
  - 메타는 그룹 이름에 넣지 않는다. 시각처럼 바뀌는 값이 이름에 들어가면 다시 읽힌다. 메타는 읽기 순서 그대로 둔다.
  - Open의 이름은 "Open drafts.html" 형식이다. 이동 뒤 Tab 순서는 카드(포커스 대상) → Open이고, 다른 것은 포커스를 받지 않는다.

## 바탕과 크기 (사용자 결정)

- 두 카드 모두 흰 바탕(`--surface-panel`)에 1 px 회색 보더(`--border-standard` 후보), 모서리는 `--radius-row`다. 그림자는 쓰지 않는다. 패널 바탕도 흰색이라 보더가 카드의 경계를 만든다.
- 글자는 스레드의 크기 체계를 따른다(사용자 결정, 드래프트 2차): 이름은 body-sm 굵게, 상태 줄과 메타는 caption, 아이콘은 14 px로 출시된 캔버스 카드와 같다. 카드가 커지는 것은 배너, 넓은 안쪽 여백(12 / 12 / 12 / 16), 보더가 맡는다. 완료 조건의 "크게"는 확정된 드래프트의 배너와 여백이 기준이다.
- 핸드오프 카드 본문의 inline code 바탕은 지금 `--surface-panel`(흰색)이다. 카드 바탕과 같아지므로 inset으로 바꾼다.
- 가장자리 색 띠는 쓰지 않는다(DESIGN.md 규칙).

## 레이아웃 (사용자 결정, 드래프트 1차)

- 모든 카드는 위쪽 배너(캔버스 위쪽을 자른 썸네일, 카드 폭의 16:6) 아래에 머리 행을 둔다. 카드 수와 상관없이 같은 모양이다. 카드 수에 따라 모양을 바꾸면, 턴 중간에 카드가 늘거나 턴이 끝날 때 카드 높이가 바뀌어 스레드가 흔들리기 때문이다.
- 비교하고 버린 안: 썸네일 없는 큰 행(A), 왼쪽 썸네일 행(B, 347과 280에서 이름 자리가 모자랐다).
- 배너 상태: Drawing 중이거나 캡처를 기다리는 동안 inset 바탕 가운데에 출시된 스피너를 둔다. 캡처 실패와 사라진 캔버스는 빈 inset 바탕이다(끝없이 도는 스피너와 남은 캐시 이미지를 피한다). 배너 높이는 모든 상태에서 같다.
- Overview 원본의 핸드오프 카드는 캔버스가 아니므로 배너가 없다.
- 카드의 최대 너비는 400이고, 에이전트 글과 같은 시작선에 왼쪽 정렬한다(사용자 결정, 드래프트 3차). 배너가 카드 폭에 비례하므로, Overview 720 열을 채우면 배너만 270 높이가 되기 때문이다. 400으로 막으면 배너는 최대 150이다. 값은 컴포넌트 상수다(맞는 토큰이 없다).
- 5장 묶음은 347에서 약 1,090 높이다. 한 턴에 캔버스를 여러 개 만드는 경우가 드물어 받아들인다.

## 메타 (드래프트에 모두 그리고 사용자가 덜어낸다)

- 메타는 지금의 캔버스를 보여준다. 핸드오프나 그리기 당시의 값은 저장되어 있지 않다. 그래서 PRODUCT 'Canvas cards'의 "reload나 restart 뒤에도 같은 모습" 규칙은 "상태와 이름은 같고, 메타는 현재 캔버스를 따른다"로 고쳐 쓴다(T5).
- 후보:
  - 캔버스 썸네일: Overview 대화 행이 쓰는 썸네일(PRODUCT §5 'Overview', ARCHITECTURE §3의 지연 캡처와 기기 로컬 캐시)을 쓴다. 모든 창에 보인다(위 'main과 preload'). 캡처 전, 캡처 실패, 원본이 사라진 경우의 모습을 그린다. 사라진 캔버스의 캐시가 남아 있어도 썸네일을 보이지 않는다. 캔버스가 바뀌어 다시 캡처하면 같은 크기 그대로 자리에서 바꾼다.
  - 프레임 수와 앞쪽 프레임 제목: `CanvasRow.frames`(`app/src/main/view.ts:18`), 1,000개를 넘으면 `framesTruncated`.
  - 마지막 수정 시각: `CanvasRow.mtimeMs`(`view.ts:16`). 상대 시각은 `shortAgo`(`renderer/overviewConversation.ts:18`)를 다시 쓴다. `<time>` 요소에 절대 시각을 툴팁으로 두고, 1분에 한 번만 갱신한다. `mtimeMs`가 없으면 보이지 않는다.
  - 폴더 경로: `CanvasRow`에 없으므로 `path`에서 root 기준 상대 디렉터리를 뽑는다. `.doan/canvases/`가 아닐 때만 보인다. 카드마다 높이가 달라지지 않게 자리를 고정하거나, 드래프트에서 빼기로 정한다.
  - 핸드오프 카드만: 핸드오프 시각(그 `user.message` 이벤트의 `at`).
  - 보낸 쪽 대화의 제목과 provider는 넣지 않는다(사용자 결정). 프로토타입 창은 그 대화가 있는지만 안다(`conversationScope.ts:226-237`).
- Drawing 중인 캔버스 카드에는 프레임 수를 보이지 않고, 배너에는 스피너를 둔다. Drawn이 되면 프레임 수가 보이고 썸네일을 캡처한다. 카드 높이는 Drawn과 같다.

## CSS 구조

2026-10 postmortem(`docs/postmortem/2026-10.md:888-889`, 공유 클래스 `.value`가 다른 화면의 레이아웃을 조용히 바꿨다)을 따른다.

- 바탕 클래스(새 이름, 예: `.card-surface`): 흰 바탕, 보더, 모서리, 안쪽 여백. 두 카드가 함께 쓴다.
- 머리 행 클래스(새 이름, 예: `.card-head`): grid와 `.cc-*` 자식 규칙. `.cc-*` 규칙은 이 클래스 아래로 범위를 좁힌다. 지금 `.canvas-card`가 grid 전체라(`styles.css:1318`), 핸드오프 카드가 그대로 쓰면 Markdown 본문이 grid 칸이 된다.
- `.handoff-head`(`:1308-1311`)는 지운다. `.handoff-head svg`가 새 종류 아이콘과 spinner의 크기를 바꾸기 때문이다.
- 한쪽만 쓰는 규칙은 자기 클래스에 둔다. 핸드오프 카드의 본문 간격과 inline code 바탕은 `.handoff-card`, 카드 묶음 간격은 `.canvas-cards`에 둔다.
- `/design-sync`는 두 카드 모두에서 `.cc-name`, `.cc-kind`까지 자식 단위로 computed style을 비교한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `handoffCardView(source, project, listed) → { kind: "canvas" | "overview", name, status, label, open: boolean }`: 지금 `handoffCardHead`(`handoffView.ts:55`)가 하는 판단(원본 종류, 사라짐, 삭제됨)을 구조로 낸다. `canvasCardText`의 `CanvasCardView` 모양과 맞춘다. `handoffView.test.ts`의 기존 네 경우(`:69-70`, `:112-113`)를 새 함수로 옮기고 문구 변경을 반영한다.
- `canvasCardMeta(row, thumbnail, now, root) → { thumb, frames, edited, folder }`: 두 카드가 함께 쓴다. `row`가 없을 때(사라짐), `mtimeMs` 없음, 프레임 없음, `framesTruncated`, 폴더가 `.doan/canvases/`인 경우와 아닌 경우, 썸네일 상태(없음, 캡처 전, 실패, 있음), Drawing 중(썸네일과 프레임 수 없음)을 고정한다.

## 형식, 규약, 결정에 미치는 영향

- 형식: 없다. 이벤트와 히스토리가 바뀌지 않는다.
- IPC: 썸네일 두 채널을 프로토타입 창에 연다(위 'main과 preload'). ARCHITECTURE §7의 프로토타입 창 IPC 경계와 §3의 썸네일 규칙(캡처 대상과 큐 우선순위, 캐시를 읽는 창)을 고친다(T5).
- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향이 없다.
- PRODUCT를 고친다(T5).
  - §5 item 2 'Handoff'의 핸드오프 카드 문구("handoff card, full width on the inset fill: “Handed off from <source file>” with Open …")
  - §5 item 3 'Canvas cards'의 바탕, 메타, 다시 열었을 때의 규칙
  - §5 'Overview'의 썸네일 규칙("Overview thumbnails are captured lazily for the listed rows")에 스레드 카드도 추가한다. 썸네일은 여전히 사람이 보는 미리보기이고, 미뤄 둔 에이전트 스크린샷 기능과는 다르다.

## 드래프트 요청

- 캔버스: `.doan/canvases/handoff-card-emphasis.html`, id `handoff-card-emphasis`, 폭은 기존 `canvas-handoff.html`과 같은 값을 쓴다. `/design-sync`는 `handoff`, `canvas-cards`, `stacks`, `widths`를 비교한다. 기존 `canvas-handoff.html`과 `canvas-drawing-cards.html`은 고치지 않는다.
- 프레임(레이아웃 결정 뒤): `handoff`(받는 쪽 카드의 상태와 배너 상태), `canvas-cards`(캔버스 카드의 모든 상태와 배너 상태), `stacks`(5장 묶음 347·280), `widths`(280, Overview 720, 프로토타입 창), `copy`. 레이아웃 비교 프레임 `variants`는 결정 뒤 지웠다.
- 메타 후보는 모두 그린다. 사용자가 덜어낸 뒤 남은 것만 드래프트와 문서에 남긴다(draft follows decisions).

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "handoff card", "canvas card"로 찾은 항목은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:888-889`): 위 'CSS 구조'에 반영했다.

## 읽은 design preset

- `shape`: 기존 화면의 재디자인이다. 시각 체계는 유지하고 카드의 위계만 바꾼다.
- `clarify`: 상태 줄과 접근성 이름 문구는 드래프트에서 이 프리셋으로 정한다.
