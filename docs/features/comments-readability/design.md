# comments-readability — 설계

## 영향받는 구성 요소

- **앱 renderer**: `CommentsPanel.tsx`(대상 표시, 경고, 빈 상태, 대화상자 문구, 작성기 위치), `useComments.tsx`(identity 없음 상태, 위치 표시 조건), `RightPanel.tsx`(Canvas 정보 수, 안내 위치), `CommentPins.ts`(aria 단수형, Enter 뒤 포커스), `App.tsx`·`styles.css`(오른쪽 열 배치, Updated 배경, 대상 줄 스타일).
- **CLI·MCP·skills·공유 형식**: 바뀌지 않는다.

## 동작

### 1. 대상 표시 헬퍼 (L-15)
- 새 순수 함수 `targetLabel(target, frames?)`가 `{ text, title }`을 돌려준다. 카드, 작성기 "To:", 초안 대화상자의 `targetText`를 모두 바꾼다.
  - Canvas: "Canvas"
  - Frame: "Frame · <frame title 또는 id>"
  - Element(Q1 결정): `Element · <tag> · <doanId>` 또는 `Element · <tag> “<text 발췌 40자>”`에, 프레임이 있으면 ` · in <frame title 또는 id>`를 붙인다. 예: `Element · label “Address” · in Shipping`, `Element · button · ship-next · in Shipping`. tag는 저장된 `html`의 첫 태그 이름에서 읽는다(파싱 실패 시 선택자의 마지막 단계). 텍스트가 없으면 tag만 쓴다.
  - `title`은 전체 선택자다(doan-id가 있으면 그 선택자).
- 프레임 제목은 열린 캔버스의 렌더된 프레임에서 id로 찾는다. 없으면 id를 쓴다.
- 본문과 텍스트는 React 텍스트로만 렌더한다(ARCH: body·html·text는 데이터).
- 한 줄 말줄임으로 표시하고 전체는 title로 본다.

### 2. 대상 줄 표현 (L-16 표시, P-5, P-14)
- 위치를 찾을 수 있으면 `<button className="comments-target">`에 hover 밑줄과 `title="Show on canvas"`를 준다.
- 찾을 수 없으면(캔버스 댓글, Location unavailable) `<span className="comments-target">`으로 렌더해 전역 `button:disabled { opacity: .4 }`의 영향을 받지 않게 한다. "Location unavailable" 배지에는 설명 title을 붙인다: "The target was not found in the current canvas."

### 3. 오른쪽 열 배치 (L-18, Q2 결정)
- 작성기를 `.comments-head` 바로 아래, 목록 위에 렌더한다. 패널의 자동 스크롤이 머리를 밀어내지 않는다. Inspector는 접지 않는다.
- 측정: 960×600과 1238×780에서 머리, To:, 입력란, Save의 사각형이 패널 client rect 안에 있는지 본다(POSTMORTEM 2026-10-25 "static draft's overflow match": 스타일 일치가 아니라 실제 도달 가능성을 확인한다).

### 4. 경고·오류 문구 (L-19, L-22, L-6)
- `warningText(warning, canvasId)`: 코드별 문장을 만든다.
  - `invalid_event`: "A line could not be read."
  - `unknown_version`: 기존 문장
  - `conflicting_duplicate`: "Two copies of one event differ; both were ignored."
  - `agent_not_allowed`: "An agent tried to change a comment; only resolving is allowed, so it was ignored."
  - `duplicate_create`: "A comment was created twice; the later copy was ignored."
  - `orphan_event`: "An event refers to a comment that was never created."
  - 모든 문장 뒤에 "Line N in .doan/comments/<id>.jsonl. Run doan check in a terminal."을 붙인다.
- 읽기 실패: `writeBlocked`를 identity 문제에만 쓰고, 읽기 오류는 "Couldn’t read comments" 블록 하나로 보인다.
- identity 없음(id 없음, 잘못됨, 중복): 패널은 "Comments need a canvas ID" 블록 하나와 "Add `<meta name="doan:canvas">` with a unique id, or ask your agent. Run doan check in a terminal."을 보인다. 이 상태에서는 Git 이름 확인과 로딩 표시를 렌더하지 않는다.

### 5. 렌더 문서가 없을 때의 위치 표시 (W-9 일부)
- `missingLocations`는 현재 문서의 앵커 스냅샷이 있을 때만 계산한다. 폭 없음, 로드 실패, 목록에 없는 문서에서는 빈 집합이다.

### 6. 작은 항목 (L-23)
| 항목 | 변경 |
|---|---|
| 핀 aria | "1 open comment" / "N open comments". 사이드바 배지 aria도 같은 규칙 |
| 해결 카드 안내 | 카드 본문의 "Reopen this comment before copying."을 지우고, 비활성 Copy 버튼 title로 옮긴다 |
| Git 이름 안내 | "Adding, editing, resolving, reopening and deleting stay unavailable…" |
| 빈 목록 | Open+Selection: 지금 문구. Open+Canvas: "No open comments on this canvas." Resolved: "Resolved comments appear here." |
| 저장 불확실 종료 대화상자 | "Quitting does not tell doan whether this save finished. Check the comment after you reopen doan." 결정(2026-10-25)의 의미는 유지한다 |
| Canvas 정보의 수 | Q3 결정: Canvas 정보의 COMMENTS 구역을 없앤다. 수는 Comments 필터에만 둔다 |
| Activity와 안내 | "Click an element or frame to inspect or comment on it."을 Activity 위로 올린다 |
| 카드 상태 배지 | Q3 결정: 유지한다 |
| 핀 Enter 뒤 포커스 | 걸러진 목록의 첫 카드로 옮긴다. 카드가 없으면 Comments 제목 |
| Updated 라벨 | 패널 색 배경과 패딩을 준다. 캔버스 내용과 겹쳐도 읽힌다 |
| Selection 범위 | 비활성일 때 title "Select an element or frame in the canvas". 버튼 이름은 "Comment on selection" / "Comment on canvas" |

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- `targetLabel(target, frames?)` — doanId, 텍스트 있음/없음, html 파싱 실패, 프레임 제목 있음/없음, 긴 텍스트 자르기(서로게이트 쌍 보존).
- `warningText(warning, canvasId)` — 코드 6개.
- `emptyListText(filter, counts)` — 범위·상태 조합.
- `commentsPanelState(identity, read, author)` — identity 없음이 다른 블록보다 우선하는지.
- `pinLabel(n)` — 단수·복수.

## 형식 변경

- 없음.

## 컨벤션 영향

- 없음. `doan check` 규칙은 그대로다.

## 결정 영향

- PRODUCT §5 항목 5의 "Location unavailable" 정의를 유지한다. 렌더 문서가 없을 때는 판정하지 않는다는 조건만 더한다.
- PRODUCT §7 2026-10-25 저장 불확실 종료 경고의 의미는 유지하고 문구만 바꾼다.
- DESIGN.md comments-ui 측정값(작성기 위치, 대상 줄 스타일, 핀 aria)이 바뀐다. 측정을 새로 기록한다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "A static draft's overflow match hid an unusable checklist": 배치는 실제 창에서 스크롤 없이 도달 가능한지로 검증한다.
- 2026-10-22 app-ui "styled child the table had missed": 대상 줄을 button에서 span으로 바꾸면 자식 스타일이 함께 바뀌었는지 확인한다.

## PoC 의존

- 없음.
