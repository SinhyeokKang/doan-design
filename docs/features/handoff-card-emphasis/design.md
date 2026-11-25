# 핸드오프 카드 강조 — design

## 영향 범위

- **app renderer**:
  - `handoffView.ts`: `handoffCardHead`가 문자열 하나를 낸다. 이것을 머리 행에 필요한 구조로 바꾼다.
  - `ConversationThread.tsx`: `HandoffCard`(`:621`)의 머리를 `CanvasCard`의 머리 행과 같은 마크업으로 그린다. 두 카드가 같은 머리 행 컴포넌트(또는 같은 클래스 묶음)를 쓴다.
  - `styles.css`: `.handoff-card`·`.handoff-head`(`:1304-1312`)와 `.canvas-card`(`:1316-1326`)의 바탕, 보더, 모서리, 머리 행 규칙을 하나로 합친다.
  - 캔버스 패널, Overview, 프로토타입 창이 같은 스레드 컴포넌트를 쓰므로 세 곳에 함께 적용된다.
- **main, CLI, 스킬, 형식**: 바뀌지 않는다. 핸드오프 이벤트와 `origin`은 그대로다.
- **`/agent-eval`**: 해당하지 않는다. 안내, CLI 출력, `doan check` 규칙, 스킬 stub이 바뀌지 않는다.

## 머리 행

- 구성은 캔버스 카드와 같다(`docs/design/conversation.md` 'Canvas cards'): grid `auto minmax(0, 1fr) auto`, 상태 아이콘, 이름 줄(종류 아이콘과 굵은 이름) 위에 상태 줄, Open.
- 상태 아이콘은 `forward`다(보내는 쪽 카드의 "Handed off"와 같은 아이콘).
- 이름:
  - 캔버스 원본: `panels-top-left` 아이콘과 파일 이름. 긴 이름은 캔버스 카드처럼 가운데를 자르고(`middleCut`, `ConversationThread.tsx:574-583`), 잘리면 툴팁에 전체 이름을 보여준다.
  - Overview 원본: Overview의 아이콘과 "Overview". 아이콘은 드래프트에서 정한다(사이드바나 머리에서 Overview가 쓰는 아이콘을 옮긴다).
- 상태 줄: 받는 쪽에서 본 사실 한 줄이다. 문구 후보는 "Handed off to this conversation"이고, `clarify` 프리셋으로 드래프트에서 정한다. 원본이 사라지면 " · No longer in <project>", 원본 대화가 지워지면 " · Conversation deleted"를 더하고 Open을 숨긴다(지금 규칙 그대로).
- Open: 캔버스 카드와 같은 sm `trigger` 버튼이고, 목적지는 지금과 같다.
- 접근성: 카드는 `role="group"`이다. 이름은 캔버스 카드처럼 "<이름>, <상태>"로 바꾸는 것이 후보다(예: "drafts.html, Handed off to this conversation"). Open의 이름은 "Open drafts.html" 같은 형식이다. 정확한 문구는 드래프트에서 정한다.

## 바탕과 크기 (사용자 결정)

- 두 카드 모두 흰 바탕(`--surface-panel`)에 1 px 회색 보더(`--border-standard` 후보), 모서리는 `--radius-row`다. 그림자는 쓰지 않는다. 패널 바탕도 흰색이라 보더가 카드의 경계를 만든다.
- 지금보다 크게 그린다. 이름은 body-sm보다 한 단계 큰 type role, 안쪽 여백도 넓힌다. 정확한 값은 드래프트에서 정한다.
- 핸드오프 카드 본문의 inline code 바탕은 지금 `--surface-panel`(흰색)이다. 카드 바탕과 같아지므로 inset으로 바꾼다.
- 가장자리 색 띠는 쓰지 않는다(DESIGN.md 규칙).

## 메타 후보 (드래프트에 모두 그리고 사용자가 덜어낸다)

모두 렌더러가 이미 가진 데이터이거나 이미 있는 장치로 얻는 값이다. 새 파일 읽기나 새 이벤트는 없다.

- 캔버스 썸네일: Overview 대화 행이 쓰는 썸네일(PRODUCT §5 'Overview', ARCHITECTURE §3의 지연 캡처와 기기 로컬 캐시)을 쓴다. 캔버스 패널과 프로토타입 창에서 이 캐시를 읽을 수 있는지, 캡처를 새로 요청해야 하는지는 T2 전에 확인한다. 캡처 전에는 자리표시 모습이다.
- 프레임 수와 앞쪽 프레임 제목: `CanvasRow.frames`(`app/src/main/view.ts:18`).
- 마지막 수정 시각: `CanvasRow.mtimeMs`(`view.ts:16`), 상대 시각("2m ago")으로 보인다.
- 폴더 경로: 파일 이름 앞의 디렉터리(`.doan/canvases/`가 아닌 경우에만 의미가 있다).
- 핸드오프 카드만: 보낸 쪽 대화의 provider 로고와 제목, 핸드오프 시각(이벤트의 `at`). 보낸 쪽 대화 제목은 대화 목록에서 읽는다(지금 `conversationListed`로 존재만 확인한다).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `handoffCardView(source, project, listed) → { kind: "canvas" | "overview", name, status, label, open: boolean }`: 지금 `handoffCardHead`(`handoffView.ts:55`)가 하는 판단(원본 종류, 사라짐, 삭제됨)을 구조로 낸다. `canvasCardText`(`canvasCardText.ts:33`)의 `CanvasCardView` 모양과 맞춘다.
- `handoffView.test.ts`의 기존 네 경우(`:69-70`, `:112-113`)를 새 함수로 옮기고, 문구 변경을 반영한다.

## 형식, 규약, 결정에 미치는 영향

- 형식: 없다. 이벤트, 히스토리, IPC가 바뀌지 않는다.
- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향이 없다.
- 구조적 결정: 영향이 없다.
- PRODUCT §5 item 2 'Handoff'와 item 3 'Canvas cards'의 문구("handoff card, full width on the inset fill: “Handed off from <source file>” with Open …")를 새 모습으로 고쳐 쓴다(T5). 'Canvas cards'의 바탕과 메타 문구도 바뀐다.

## 드래프트 요청

- 캔버스: `.doan/canvases/handoff-card-emphasis.html`, id `handoff-card-emphasis`, 폭은 기존 `canvas-handoff.html`과 같은 값을 쓴다. `/design-sync`는 `handoff`, `canvas-cards`, `widths`를 비교한다. 기존 `canvas-handoff.html`과 `canvas-drawing-cards.html`은 고치지 않는다.
- 프레임:
  - `handoff`: 받는 쪽 핸드오프 카드. 캔버스 원본, 이동 직후 포커스, 짧은 본문과 그 아래 사람의 말풍선, 원본이 사라진 경우, Overview 원본, Overview 원본이 지워진 경우, 썸네일 캡처 전. 같은 스레드의 "Stopped" 노티스를 함께 그려 노티스와의 차이를 보여준다.
  - `canvas-cards`: 보내는 쪽 캔버스 카드 묶음. Drawing, Drawn, Hands off when this turn ends, Handed off, Didn’t hand off, No longer in, 썸네일 캡처 전, 프레임 없음.
  - `widths`: 280과 Overview 720.
  - `copy`: 머리 상태 줄, 메타 줄, 그룹 이름, Open 이름의 표.
- 메타 후보는 모두 그린다. 사용자가 덜어낸 뒤 남은 것만 드래프트와 문서에 남긴다(draft follows decisions).

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "handoff card", "canvas card"로 찾은 항목은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:885-888`): 공유 클래스(`.value`)를 다른 화면에서 다시 써서 조용히 레이아웃이 바뀌었다. → 두 카드가 머리 행 규칙을 공유할 때, 한쪽에서만 쓰는 규칙(핸드오프 카드의 본문 간격, 캔버스 카드 묶음의 간격)은 자기 클래스에 둔다. 두 카드 모두에 computed style 비교를 둔다(`/design-sync`).

## 읽은 design preset

- `shape`: 기존 화면의 재디자인이다. 시각 체계는 유지하고 카드의 위계만 바꾼다.
- `clarify`: 상태 줄과 접근성 이름 문구는 드래프트에서 이 프리셋으로 정한다.
