# comments-readability — 설계

## 영향받는 구성 요소

- **공유 순수 모듈**:
  - `app/src/comments/targetLabel.ts`(새 파일). `agent-handoff`, `revision-recheck`, `project-feedback`이 같이 쓴다.
  - `app/src/comments/panelText.ts`(새 파일). 경고, 빈 목록, 패널 상태 문구를 담는다.
- **앱 renderer**:
  - `CommentsPanel.tsx`: 대상 표시, 경고, 빈 상태, 대화상자 문구, 작성기 위치, 포커스
  - `useComments.tsx`: identity 원인, 편집기 차단
  - `RightPanel.tsx`, `canvasInfo.ts`: Canvas 정보의 댓글 수 제거, 안내 위치
  - `CommentPins.ts`, `Sidebar.tsx`: aria 단수형, Enter 뒤 포커스
  - `App.tsx`, `styles.css`: sticky 제목, 작은 창 입력란 높이, Updated 배경, 대상 줄 스타일
- **앱 main**:
  - `main/comments/identity.ts`, `service.ts`: identity 거부 원인(`missing | invalid | duplicate`)을 구분해 돌려준다. 원인은 새로 받은 `ls` 행과 같은 id의 행 수로 정한다.
  - preload 타입
- **CLI·MCP·skills·공유 형식**: 바뀌지 않는다.

## 동작

### 1. 대상 표시 (L-15, Q1, C2)
- `targetLabel(target, frames)`는 `{ text, title, locatableHint }`를 돌려준다.
  - `frames`는 `ReadonlyArray<{id; title?}>`다. 호출자가 `ls` 행의 정적 프레임을 넘기고, 열린 캔버스에서는 렌더된 프레임을 넘겨도 된다.
  - Canvas는 "Canvas"다.
  - Frame은 "Frame · <title 또는 id>"다.
  - Element는 "Element · <tag> <doanId>" 또는 "Element · <tag> “<text 발췌>”"다. 프레임이 있으면 " · in <frame title 또는 id>"를 붙인다. 텍스트와 id가 모두 없으면 tag만, tag도 없으면 "Element"만 쓴다.
- tag 읽기: 저장된 `html`에 앵커가 걸린 정규식 `^<([A-Za-z][A-Za-z0-9-]{0,63})`만 쓴다. DOMParser, innerHTML, 선택자 마지막 단계 해석은 쓰지 않는다. 실패하면 tag가 없다.
- 텍스트 발췌: 공백과 줄바꿈을 하나로 합치고 trim한 뒤 40 code point로 자른다. 잘랐으면 "…"를 붙인다. 서로게이트 쌍은 나누지 않는다.
- 상한: doanId·frame id·title은 각 80 code point로 자른다. title(전체 선택자)은 1,000 code point로 자른다.
- 빈 문자열 doanId는 없음으로 다룬다.
- 모든 값은 React 텍스트로만 렌더한다(ARCH: body·html·text는 데이터).
- 한 줄 말줄임으로 보이고 전체는 title로 본다.

### 2. 대상 줄 표현 (L-16 표시, P-5, P-14)
- 위치를 찾을 수 있으면 `<button className="comments-target locatable">`을 쓴다. 색은 `--accent`, hover에서 밑줄이고 title은 `"Show on canvas\n" + 선택자`다.
- 찾을 수 없으면(캔버스 댓글, Location unavailable) `<span className="comments-target">`을 쓴다. 색은 `--text-2`, title은 선택자다. 전역 `button:disabled { opacity: .4 }`의 영향을 받지 않는다.
- "Location unavailable" 배지 옆에 짧은 텍스트 설명을 둔다(title에만 두지 않는다): "Not found in the current canvas."
- POSTMORTEM 2026-10-22(자식 스타일 누락): button을 span으로 바꿀 때 자식 스타일이 그대로인지 측정한다.

### 3. 오른쪽 열 배치 (L-18, Q2, C1)
- 작성기와 카드 편집기 모두 `.comments-head` 바로 아래, 경고 블록과 목록 위에 렌더한다.
- `.comments-head h3`는 패널 안에서 `position: sticky; top: 0`이다.
- 패널 높이가 작으면(패널 client height < 360px) 입력란 `min-height`를 104px에서 64px로 줄인다. 미디어 쿼리가 아니라 container 높이로 판단한다. 지원되지 않으면 창 높이 미디어 쿼리를 쓴다.
- 측정: 960×600과 1238×780에서 제목, To:, 입력란, Save의 사각형이 패널 client rect 안에 있는지 본다(POSTMORTEM 2026-10-25: 스타일 일치가 아니라 실제 도달 가능성).

### 4. 경고·오류 문구 (L-19, L-22, L-6)
- `warningGroups(warnings)`: 코드별로 묶고 줄 번호를 모은다.
- `warningText(code)`: 코드별 문장을 돌려준다.
  - `invalid_event`: "A line could not be read and was skipped."
  - `unknown_version`: 기존 문장 "This record was written by a newer version of Doan."
  - `conflicting_duplicate`: "Two versions of the same change disagree, so both were ignored."
  - `agent_not_allowed`: "An agent tried to add or edit a comment. Agents can only resolve, so it was ignored."
  - `duplicate_create`: "A comment was created twice; the later copy was ignored."
  - `orphan_event`: "A change refers to a comment that doesn't exist; it was ignored."
- 블록 끝에 한 번 붙는다: "In .doan/comments/<id>.jsonl. Ask your agent to run doan comments and fix the file."
- 읽기 실패: `writeBlocked`는 identity 문제에만 쓴다. 읽기 오류는 "Couldn’t read comments" 블록 하나로 보인다. 편집기는 `readError`가 있으면 별도로 막는다. 지금 `writeBlocked` 경유로 막히던 동작을 유지한다.
- identity: main이 거부 원인 `missing | invalid | duplicate`를 돌려준다. renderer는 identity가 null(id 없음)일 때와 main이 원인을 돌려줄 때 모두 `commentsPanelState`로 블록 하나를 고른다. 블록이 있으면 로딩, 작성자, 필터, 도구 줄을 렌더하지 않는다.

### 5. 작은 항목 (L-23)
| 항목 | 변경 |
|---|---|
| 핀·사이드바·"elsewhere" 문구 | `pluralComments(n)`: "1 open comment" / "N open comments" |
| 해결 카드 안내 | 카드 본문의 "Reopen this comment before copying."을 지운다. 해결 카드의 넘기기 버튼과 그 이유는 `agent-handoff`가 정한다 |
| Git 이름 안내 | "Adding, editing, resolving, reopening and deleting stay unavailable…" 기존 "Copy remains available."은 `agent-handoff`가 바꾸는 이름에 맞춘다 |
| 빈 목록 | `emptyListText(scope, status, elsewhere)`가 제목과 본문을 함께 돌려준다. Open+Selection: "No open comments on this selection" / "Comment on selection to add one." (elsewhere가 있으면 지금처럼 그 수를 안내한다). Open+Canvas: "No open comments" / "Choose Comment on canvas, or select an element or frame." Resolved+Selection: "No resolved comments on this selection" / "Resolved comments appear here." Resolved+Canvas: "No resolved comments" / "Comments you or your agent resolve appear here." |
| 저장 불확실 종료 대화상자 | "If you quit, this draft is lost. Quitting does not tell Doan whether the save finished, and restarting does not confirm it either. Check the comment after you reopen Doan." 결정(2026-10-25)의 의미를 유지한다 |
| 초안 대화상자 | 대상을 문장 안에 넣지 않고, 작성기와 같은 형식의 "To: …" 별도 줄로 보인다 |
| Canvas 정보 | COMMENTS 구역을 없앤다(Q3). `canvasInfo.ts`의 `open`·`resolved` 필드도 지운다 |
| Activity와 안내 | "Click an element or frame to inspect or comment on it."을 Activity 위로 올린다 |
| 포커스 | Save 성공 뒤에는 새·고친 카드(`article tabIndex=-1`), Cancel 뒤에는 작성기를 연 버튼으로 간다. 핀 Enter·Space·클릭 뒤에는 필터 렌더가 끝난 다음 첫 카드 article로 간다. 카드가 없으면 Comments 제목(`tabIndex=-1`)으로 간다. 초안 대화상자가 열리면 대화상자가 포커스를 가진다 |
| Updated 라벨 | 패널 색 배경과 패딩을 준다. 문구는 `revision-recheck`가 Opened·Changed로 바꾼다. 측정은 두 기능 모두에서 한다 |
| Selection 범위 | 비활성일 때 title은 "Select an element or frame in the canvas"다. 버튼 이름은 "Comment on selection" / "Comment on canvas"다 |
| 표기 | UI 문장에서 앱 이름은 "Doan"이다 |

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- `targetLabel(target, frames)`: doanId 있음·없음·빈 문자열, 텍스트 있음·공백뿐·없음, `truncated: true` html, html 정규식 실패, frame 없는 element, 프레임 제목 있음·없음·목록에 없음, 40자 경계, 서로게이트 쌍, 상한.
- `warningGroups`, `warningText`: 코드 6개, 같은 코드 여러 줄, `unknown_version` 문장 유지.
- `emptyListText(scope, status, elsewhere)`: 네 조합, 선택 없음, elsewhere 있음.
- `commentsPanelState(identityCause, read, author)`: missing·invalid·duplicate가 다른 블록보다 우선한다. 읽기 실패와 작성자 없음이 함께 있을 때, 로딩과 identity 문제가 함께 있을 때도 다룬다.
- `pluralComments(n)`: 0, 1, 2.

## 형식 변경

- 공유 형식은 바뀌지 않는다. main→renderer 댓글 응답 오류에 identity 원인 코드가 더해진다(내부 IPC).

## 컨벤션 영향

- 없다. `doan check` 규칙도 그대로다.

## 결정 영향

- PRODUCT §5 항목 5의 "Location unavailable" 정의를 유지한다(판정 조건은 `revision-continuity`가 맡는다).
- PRODUCT §7 2026-10-25 저장 불확실 종료 경고: 의미는 유지하고 문구만 바꾼다.
- PRODUCT §7 2026-10-22 app-ui 행("Path, ID, Width, Frames, Comments (Open, Resolved) and Activity"): Comments 수를 뺀다. 새 결정 행으로 대체한다.
- U-50(`docs/features/ux-audit-261025/orch.md:74`, PRODUCT에는 없음): 댓글 대상의 프레임 이름은 title을 먼저 쓴다. Inspector는 id를 유지한다. 새 결정 행으로 기록한다.
- DESIGN.md comments-ui 측정값(작성기 위치, 대상 줄 스타일, 핀 aria, 패널 구성)이 바뀐다. 새로 측정한 값을 기록한다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "A static draft's overflow match hid an unusable checklist": 배치는 실제 창에서 스크롤 없이 도달할 수 있는지로 검증한다.
- 2026-10-22 app-ui "styled child the table had missed": 대상 줄을 button에서 span으로 바꿀 때 자식 스타일이 함께 바뀌었는지 확인한다.

## PoC 의존

- 없다.
