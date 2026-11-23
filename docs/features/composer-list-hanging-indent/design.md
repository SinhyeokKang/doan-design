# composer 목록 hanging indent — design

이 feature는 이미 develop에 있는 composer 입력란의 목록 표시를 다시 디자인하는 standalone redesign이다(AGENTS.md 'Workflow' `/design-draft`·`/design-sync` 예외). 새 시안 파일 `.doan/canvases/composer-hanging-indent.html`을 그리고, 기존 시안 `composer-markdown.html`은 고치지 않는다. 이 feature의 브랜치가 머지될 때까지 새 시안이 입력란 목록 표시의 기준이다.

## 결정

- **구현 방식**: 목록 줄마다 블록으로 감싸고, 줄바꿈 문자는 블록 사이의 보이지 않는 span에 둔다(프로브4 방향). 글자 입력은 지금처럼 브라우저가 처리하고, 줄 경계를 넘는 삭제·교체만 입력란이 직접 처리한다(사람이 정했다). 모든 편집을 입력란이 처리하는 방식은 IME가 어차피 브라우저 몫이라 예외가 남고 범위가 커서 고르지 않았다.
- **마커 그리기**: inline-block 마커는 아래 화살표로 항목에 들어갈 때 가로 위치를 잃으므로, 마커를 inline으로 그린다. 마커 위치(깊이 0에서 20px)와 본문 시작점(32px, 깊이마다 +20px, 12px보다 넓은 번호는 그만큼 밀림)은 지금 측정값을 지킨다. 측정 계약은 새로 잰다(사람이 정했다).
- **IME 확인**: 목록 줄을 걸친 선택 위의 조합은 Chromium이 선택을 직접 지우면서 줄바꿈을 잃는다. keydown 229에서 선택을 먼저 입력란이 지우는 방식으로 막고, 실제 한글 입력기로 사람이 확인한다. conductor's call — 자동화된 입력기가 없어서 다른 확인 방법이 없다.

## DOM 구조

- 지금(`chipField.ts` `render()`): 입력란 요소의 평평한 자식들. 텍스트 노드에 `"\n"`이 그대로 들어 있고, 목록은 `span.list-depth`·`span.list-mark` inline-block이 실제 입력 문자 위에 그려진다. 끝이 `"\n"`이면 `<br>`을 붙인다.
- 바뀐 뒤:
  - 목록 항목 줄은 `span.list-line`(display:block)으로 감싼다. 안에 깊이·마커·본문이 들어가고, 블록에 `padding-inline-start`(본문 시작점)와 음수 `text-indent`를 줘서 줄바꿈된 줄이 본문 시작점에서 시작하게 한다.
  - 줄을 끝내는 `"\n"`은 블록 밖, 블록 사이의 `span.list-nl`(display:none)에 둔다. 그래서 브라우저의 위·아래 화살표가 줄바꿈된 줄을 건너뛰지 않는다.
  - 목록이 아닌 줄은 지금처럼 평평한 텍스트로 둔다. 블록과 이웃한 빈 줄에는 높이를 위한 채움(`<br>` 등)이 필요하다. 어떤 채움을 쓸지는 PoC에서 정한다.
  - 마커는 inline으로 그리고, 본문 시작점은 블록의 padding으로 맞춘다. 깊이 lead(`span.list-depth`)는 블록 padding에 흡수할 수 있다. 구체 CSS는 PoC와 시안에서 정한다.
- 읽기(`units()`, `read()`, `textOf()`, `offsetOf`, `pointAt`)는 `span.list-line`과 `span.list-nl`을 지나 실제 문자만 읽는다. 보이지 않는 `span.list-nl`의 `"\n"`도 한 unit이다.

## 편집 처리

- 글자 입력(`insertText`)과 같은 줄 안의 삭제는 지금처럼 브라우저가 처리하고, `sync()`가 읽고 `repair()`가 다시 그린다.
- 입력란이 직접 처리하는 것(`beforeinput`에서 막고 segment 편집으로):
  - 줄 경계를 넘는 모든 `delete*`(Backspace·Delete로 블록 경계의 줄바꿈 지우기, 선택 범위가 경계를 걸친 삭제, ⌘⌫·⌘⌦, 단어 삭제).
  - 선택 범위가 줄 경계를 걸친 `insertText`(선택 교체).
  - 이미 직접 처리하던 것: 줄바꿈(Shift+Enter, `continueList`), 본문 시작점 Backspace(`removeMarker`), Tab, 붙여넣기, 잘라내기, 칩 관련 편집, 실행 취소.
- IME: 선택이 줄 경계를 걸친 상태에서 keydown 229가 오면, 조합이 시작되기 전에 입력란이 선택을 segment 편집으로 지우고 커서를 둔다. 조합 중에는 지금처럼 다시 그리지 않는다.
- 커서 위치: `placeCaret`·`leavePrefix`가 블록 구조에서도 마커 안에 커서가 머물지 않게 한다. 블록 끝과 다음 줄 시작의 커서 위치(줄바꿈 앞뒤)를 구분해 둔다.
- 스크롤: composer 스크롤 수정(`revealCaret`, PR로 develop에 들어갈 예정)이 블록 구조에서도 커서를 보이게 한다.

## 영향받는 구성 요소

- **app (renderer)만** 바뀐다.
  - `chipField.ts`: `render()`, `runNode()`, 읽기 함수들, `beforeinput`의 줄 경계 판단, keydown 229 처리, `misdrawn()`, `placeCaret`, `leavePrefix`, `prefixArrow`, `lineRange`/`rowEdge`.
  - `skillWords.ts`의 `fieldRuns`(줄 단위로 묶은 run을 돌려주거나, render가 묶는다).
  - `composerLists.ts`: 줄 구조 계산에 쓰는 순수 함수(목록 줄 범위, 본문 시작 열).
  - `anchorField.ts`: 줄 경계를 넘는지 판단하는 순수 함수.
  - `styles.css`: `.list-line`, `.list-nl`, `.list-mark`, `.list-depth`. 주석 "No hanging indent in the field"를 고친다.
- CLI, 스킬, 포맷: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 텍스트를 줄 단위 그리기 단위로 나누기: 목록 줄(깊이·마커·본문 범위·본문 시작 열)과 일반 줄, 칩으로 시작하는 줄. `fieldRuns`·`fieldListItems` 위에 만든다.
- 편집 범위가 줄 경계를 넘는지 판단: unit 범위와 텍스트에서 `"\n"`을 포함하는지, 블록 경계에 닿는지.
- keydown 229 앞의 선택 삭제 결정: 선택이 줄 경계를 걸쳤는지.
- 줄 경계를 넘는 삭제·교체의 결과 segment 계산: 기존 `splice`/`replace` 위에 만든다.
- 블록 구조에서의 unit ↔ DOM 위치 대응(`offsetOf`, `pointAt`의 규칙): 순수하게 뺄 수 있는 부분만.

## 포맷 변경

없다. 보내는 텍스트, 클립보드 JSON, 대화 기록은 바뀌지 않는다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Lists'의 "the field has no hanging indent" 문장을 바꾼다(사람이 승인했다). 문서 승격 task에서 고친다.
- ARCHITECTURE §7의 chip field 설명(`:715`~`:720`, "contenteditable=false marker rejected" 포함)을 새 구조로 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에는 닿지 않는다.

## PoC 의존

- **줄 블록 + 숨긴 줄바꿈 구조 전체**: 화살표, 경계 삭제, 선택 교체, 빈 줄 채움, inline 마커의 가로 위치, ⌘⌫ 줄 단위가 실제 Electron에서 함께 동작하는지 아직 확인되지 않았다. tasks 1에서 `app/runtime/electronDom.ts`로 PoC를 먼저 하고, 안 되는 항목이 있으면 멈추고 사람에게 보고한다.
- **IME 선택 위 조합의 keydown 229 선삭제**: 실제 입력기로만 확인된다. tasks에서 사람이 확인한다.

## postmortem에서 가져온 함정

- **2026-11 'Sent anchor chips inserted line breaks into copied text'**(2026-11.md:115): 블록 구조가 복사 텍스트에 줄바꿈을 더하지 않는다. `text/plain`이 입력 텍스트와 같은지 블록·칩이 섞인 경우로 테스트한다.
- **2026-11 'Look Up named a composer chip by its screen-reader text'**(2026-11.md:1110): 블록과 숨긴 span이 Look Up·선택 텍스트에 끼어들지 않는지 확인한다.
- **2026-10 'Pin completion outlived the guarded intent'**(2026-10.md:771, 재발 :778): `placeCaret`이 포커스 없는 입력란을 포커스하지 않는 규칙을 블록 구조에서도 지킨다.

## 참고한 디자인 프리셋

- `shape`: 기존 화면(입력란)의 시각 체계는 그대로 두고, 줄바꿈된 줄의 위치와 마커 그리기만 바꾼다.
