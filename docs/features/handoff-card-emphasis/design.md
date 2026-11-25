# 핸드오프 카드 강조 — design

## 영향 범위

- **app renderer**:
  - `handoffView.ts`: `handoffCardHead`가 문자열 하나를 낸다. 이것을 머리 행에 필요한 구조로 바꾼다.
  - `ConversationThread.tsx`: `HandoffCard`(`:621`)의 머리를 `CanvasCard`의 머리 행과 같은 마크업으로 그린다. 두 카드가 같은 머리 행 컴포넌트(또는 같은 클래스 묶음)를 쓴다.
  - `styles.css`: `.handoff-card`·`.handoff-head`(`:1304-1312`)와 `.canvas-card`(`:1316-1326`)의 바탕, 모서리, 머리 행 규칙을 하나로 합친다. B를 고르면 두 카드의 바탕이 함께 바뀐다.
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

## 바탕 (드래프트에서 결정)

- (A) 두 카드 모두 지금의 `--surface-inset`, `--radius-row`, 테두리 없음.
- (B) 두 카드 모두 흰 바탕(`--surface-panel`)에 테두리 또는 그림자. 어떤 토큰(`--border-standard`, `--shadow-*`)을 쓸지는 드래프트에서 측정해 정한다. 패널 바탕도 흰색이라, 그림자 없이 흰 바탕만으로는 카드가 보이지 않는다.
- B에서 핸드오프 카드 본문의 inline code 바탕은 지금 `--surface-panel`(흰색)이다. 그래서 카드 바탕과 구분되도록 inset으로 바꿔야 한다.
- 가장자리 색 띠는 쓰지 않는다(DESIGN.md 규칙).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `handoffCardView(source, project, listed) → { kind: "canvas" | "overview", name, status, label, open: boolean }`: 지금 `handoffCardHead`(`handoffView.ts:55`)가 하는 판단(원본 종류, 사라짐, 삭제됨)을 구조로 낸다. `canvasCardText`(`canvasCardText.ts:33`)의 `CanvasCardView` 모양과 맞춘다.
- `handoffView.test.ts`의 기존 네 경우(`:69-70`, `:112-113`)를 새 함수로 옮기고, 문구 변경을 반영한다.

## 형식, 규약, 결정에 미치는 영향

- 형식: 없다. 이벤트, 히스토리, IPC가 바뀌지 않는다.
- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향이 없다.
- 구조적 결정: 영향이 없다.
- PRODUCT §5 item 2 'Handoff'와 item 3 'Canvas cards'의 문구("handoff card, full width on the inset fill: “Handed off from <source file>” with Open …")를 새 모습으로 고쳐 쓴다(T5). B를 고르면 'Canvas cards'의 바탕 문구도 바뀐다.

## 드래프트 요청

- 캔버스: `.doan/canvases/handoff-card-emphasis.html`, id `handoff-card-emphasis`, 폭은 기존 `canvas-handoff.html`과 같은 값을 쓴다. 기존 `canvas-handoff.html`과 `canvas-drawing-cards.html`은 고치지 않는다.
- 프레임:
  - `variant-a`: 바탕 A. 받는 쪽 핸드오프 카드(캔버스 원본, 이동 직후 포커스, 짧은 본문과 그 아래 사람의 말풍선, 원본이 사라진 경우, Overview 원본, Overview 원본이 지워진 경우)와 보내는 쪽 캔버스 카드 묶음(Drawn, Handed off, Didn’t hand off, No longer in), 그리고 같은 스레드의 "Stopped" 노티스를 함께 그려 노티스와의 차이를 보여준다.
  - `variant-b`: 같은 내용을 바탕 B로 그린다.
  - `widths`: 고른 바탕으로 280과 Overview 720을 그린다. 사용자가 고르기 전에는 A·B를 나란히 그린다.
  - `copy`: 머리 상태 줄, 그룹 이름, Open 이름의 표.
- 사용자가 고르면 고르지 않은 프레임은 지우고(draft follows decisions), `/design-sync`는 남은 프레임과 `widths`를 비교한다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "handoff card", "canvas card"로 찾은 항목은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:885-888`): 공유 클래스(`.value`)를 다른 화면에서 다시 써서 조용히 레이아웃이 바뀌었다. → 두 카드가 머리 행 규칙을 공유할 때, 한쪽에서만 쓰는 규칙(핸드오프 카드의 본문 간격, 캔버스 카드 묶음의 간격)은 자기 클래스에 둔다. 두 카드 모두에 computed style 비교를 둔다(`/design-sync`).

## 읽은 design preset

- `shape`: 기존 화면의 재디자인이다. 시각 체계는 유지하고 카드의 위계만 바꾼다.
- `clarify`: 상태 줄과 접근성 이름 문구는 드래프트에서 이 프리셋으로 정한다.
