# composer 목록 hanging indent — design

이 feature는 이미 develop에 있는 composer 입력란의 목록 표시를 다시 디자인하는 standalone redesign이다(AGENTS.md 'Workflow' `/design-draft`·`/design-sync` 예외). 새 시안 파일 `.doan/canvases/composer-hanging-indent.html`을 그리고, 기존 시안 `composer-markdown.html`은 고치지 않는다. 기존 시안의 `field-wrap` 설명("The field has no hanging indent")은 그대로 남지만, 이 feature의 브랜치가 머지될 때까지 새 시안이 입력란 목록 표시의 기준이다.

## 결정

- **구현 방식**: 목록 줄을 블록으로 감싸고, 줄바꿈 문자는 블록 사이의 보이지 않는 span에 둔다. 글자 입력은 지금처럼 브라우저가 처리하고, 줄바꿈 문자를 지우거나 바꾸는 편집만 입력란이 직접 처리한다(사람이 정했다). 모든 편집을 입력란이 처리하는 방식은 IME가 어차피 브라우저 몫이라 예외가 남고 범위가 커서 고르지 않았다.
- **마커 그리기**: inline-block 마커는 ↓로 항목에 들어갈 때 가로 위치를 잃으므로 마커를 inline-block으로 두지 않는다. 마커 위치와 본문 시작점은 지금 측정값을 지킨다. 측정 계약은 새로 잰다(사람이 정했다).
- **깊이 상한 없음**: 깊이마다 본문 시작점이 20px씩 밀린다. 말풍선의 4단계 상한을 입력란에 들여오지 않는다(사람이 정했다).
- **번호 정렬**: 항목마다 자기 본문 시작점에 맞춘다. 말풍선처럼 목록 단위로 맞추지 않는다(사람이 정했다).
- **줄 시작 커서**: 모든 깊이에서 마커 앞에 그린다(사람이 정했다).
- **IME 실패 시**: 걸친 선택 위 조합이 사람 확인에서 실패하면 선삭제 코드를 빼고 BACKLOG 'Known defects'에 남긴 채 출시한다(사람이 정했다).
- **CSS만으로 하지 않는 이유**: `text-indent: hanging each-line`은 Chrome 146에 들어왔고 이 앱의 Electron(Chrome 156)에서 쓸 수 있다([blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/E8lsWfkyWVk/m/my-groups), [web-features](https://web-platform-dx.github.io/web-features-explorer/features/text-indent-hanging/), 리뷰어가 확인). 하지만 블록 하나에 한 값만 줄 수 있어서, 평평한 입력란에 쓰면 일반 줄까지 들여 쓰이고 깊이와 마커 폭에 따라 값을 바꿀 수 없다.

## DOM 구조

- 지금(`chipField.ts` `render()`): 입력란 요소의 평평한 자식들. 텍스트 노드에 `"\n"`이 그대로 들어 있고, 목록은 `span.list-depth`·`span.list-mark` inline-block이 실제 입력 문자 위에 그려진다. 끝이 `"\n"`이면 `<br>`을 붙인다.
- 바뀐 뒤(블록 구조 후보 둘을 PoC로 비교한다, tasks 1):
  - **후보 A — 목록 줄만 블록**: 목록 항목 줄은 `span.list-line`(display:block)으로 감싼다. 일반 줄은 평평한 텍스트로 둔다.
  - **후보 B — 모든 줄 블록**: 모든 줄을 블록으로 감싼다. 일반 줄과 목록 줄의 경계 처리가 사라지는 대신 빈 줄마다 채움이 필요하다. 고르면 클래스 이름은 종류 속성을 가진 중립 이름(`field-line`)으로 한다.
  - PoC에서 특수 처리가 적은 쪽을 고르고 design.md에 이유와 함께 적는다.
- 두 후보 공통 규칙:
  - **줄바꿈 위치**: 목록 줄(B에서는 모든 블록 줄)을 끝내거나 그 앞에 오는 모든 `"\n"`은 블록 밖의 `span.list-nl`(display:none)에 둔다. 각 `span.list-nl`은 정확히 하나의 텍스트 노드 `"\n"`만 갖는다. 두 `span.list-nl` 사이의 빈 줄은 `<br>` 채움으로 높이를 갖는다. 블록 끝에 `"\n"`이 남는 모양은 ↑가 줄바꿈된 줄을 건너뛰게 하므로(프로브) 만들지 않는다.
  - **커서는 숨긴 span 안에 놓이지 않는다**: `pointAt`이 `span.list-nl` 안의 위치를 돌려주지 않는다. 줄 끝은 그 블록 마지막 텍스트의 끝, 텍스트가 없는 줄 시작은 (부모, 채움 `<br>`의 index)로 대응한다. 숨긴 노드 안의 위치는 Chromium이 앞 줄 끝으로 해석해서, 입력이 앞 줄에 들어간다.
  - **마커·깊이 그리기**: 깊이 공백과 마커 문자는 폭 0으로 두고, 기호(•, 번호)는 블록의 pseudo-element(min-width를 가질 수 있는 inline-block pseudo)로 그린다. `render()`가 줄마다 본문 시작점에 맞는 `padding-inline-start`와 음수 `text-indent`를 준다. 번호의 실제 폭은 CSS로 알 수 없으므로 render가 재거나 그 값을 줄 방법을 PoC에서 정한다. PoC에서 이 방식이 12px 열, 깊이 폭, 줄 시작 커서 위치를 지키는지 확인한다.
- 읽기(`units()`, `read()`, `textOf()`, `offsetOf`)는 블록과 `span.list-nl`을 지나 실제 문자만 읽는다. `span.list-nl`의 `"\n"`도 한 unit이다.
- `misdrawn()`은 블록 구조를 엄격히 확인한다: 예상한 블록·`span.list-nl`·채움 배치, 각 `span.list-nl`이 `"\n"` 하나만 가짐, 계획한 곳에만 `<br>`. 숨긴 span에 글자가 들어가거나 Chromium이 줄을 합치며 스타일 span을 만들면 다시 그린다. 그 밖의 입력마다 다시 그리지 않는다.

## 편집 처리

- **규칙(텍스트 기준)**: 조합 중이 아닌 `beforeinput` 중 범위가 `"\n"` unit을 포함하는 것은 모두 입력란이 처리한다. 범위는 접히지 않은 선택이면 선택, 아니면 `getTargetRanges()`를 `offsetOf`로 바꾼 것, 그것도 없으면 커서가 줄 시작(뒤로 지우기)이나 줄 끝(앞으로 지우기)일 때 이웃 unit이다. 이 규칙은 DOM 모양이나 대상 범위에 숨긴 노드가 포함되는지와 관계없이 동작한다.
- **해당하는 편집**: Backspace·Delete, ⌥⌫·⌥⌦, ⌃K·⌃H·⌃D, 선택 위의 `insertText`·`insertReplacementText`, `insertTranspose`(⌃T, 줄 경계에서), ⌘⌫·⌘⌦. 두 일반 줄 사이의 `"\n"` 삭제도 같은 규칙을 따른다.
- **실행 취소 단위**: 입력란이 처리하는 줄 경계 삭제·교체 중 칩이 없는 것은 `"typing"`으로 commit해서 앞뒤 글자 입력과 지금처럼 한 단계로 묶는다. 칩이 걸리거나 목록 편집(Shift+Enter, Tab, 본문 시작 Backspace)은 지금처럼 각자 한 단계다.
- **이미 처리하던 것**: 줄바꿈(Shift+Enter, `continueList`), 본문 시작점 Backspace(`removeMarker`, 한 단계 내어쓰기와 깊이 0의 마커 삭제), Tab, 붙여넣기, 잘라내기, 끌어놓기 막기, 칩 관련 편집, 실행 취소.
- **브라우저가 처리하는 것**: 줄바꿈을 포함하지 않는 글자 입력과 삭제, 줄 안의 맞춤법 제안 교체, 조합. `sync()`가 읽고 `repair()`가 필요할 때만 다시 그린다.
- **IME 선삭제**: keydown 229에서 선택이 줄바꿈을 걸쳤으면 그 선택을 기억만 한다. 실제로 조합이 시작될 때(`compositionstart`가 이어질 때) 입력란이 선택을 segment 편집으로 지우고 commit한다. 이어지는 조합의 commit은 원래 선택을 시작점으로 그 단계에 합친다. 229 뒤에 조합이 오지 않으면(⌘C, Shift+화살표, Esc) 아무것도 지우지 않는다. 처리 위치는 keydown의 조합 조기 반환(`:323`) 앞이며, `!composingNow`·`!discarding`·`!readOnly`일 때만 한다. Chromium이 조합 시작 때 선택을 직접 지우기 전에 끼어들 수 있는지는 PoC에서 순서를 확인한다(ARCHITECTURE:720이 기록한 macOS 순서: keydown 229가 `compositionstart`보다 먼저).
- **IME 선삭제의 한계**(BACKLOG에 기록한다): 글자를 만들지 않는 IME 키(한자 변환), 선택한 글자가 필요한 일본어 재변환에도 선택을 지운다. 받아쓰기와 길게 눌러 악센트 입력은 앞선 229 없이 조합을 시작할 수 있어 여전히 줄바꿈을 잃을 수 있다.
- **커서**: `placeCaret`·`leavePrefix`·`prefixArrow`가 블록 구조에서도 마커 안이나 숨긴 span 안에 커서를 두지 않는다. `placeCaret`은 지금처럼 포커스 없는 입력란을 포커스하지 않는다.
- **스크롤**: `revealCaret`·`caretRect`(develop의 composer 스크롤 수정)가 블록 구조에서 커서와 빈 줄 채움을 기준으로 동작한다. 지금 `caretRect`는 줄 끝의 `"\n"`이나 마지막 `<br>`을 기준으로 삼으므로 블록 구조에 맞게 고친다.
- **Look Up**: Electron의 `params.selectionText`는 블록 경계마다 `"\n"`이 생기고 숨긴 `"\n"`은 빠진다. `lookUpLabel`이 공백을 접어서 결과는 같아 보이지만, 칩 이름으로 Look Up하는 경로를 테스트로 확인한다.

## 영향받는 구성 요소

- **app (renderer)만** 바뀐다.
  - `chipField.ts`: `render()`, `runNode()`, 읽기 함수들, `pointAt`, `beforeinput`의 줄바꿈 판단, keydown 229와 `compositionstart`의 선삭제, `misdrawn()`, `placeCaret`, `leavePrefix`, `prefixArrow`, `lineRange`/`rowEdge`, `revealCaret`/`caretRect`.
  - `skillWords.ts`의 `fieldRuns`(줄 단위로 묶은 run을 돌려주거나, render가 묶는다).
  - `composerLists.ts`: 줄 구조 계산에 쓰는 순수 함수.
  - `anchorField.ts`: 범위가 줄바꿈을 포함하는지 판단하는 순수 함수. 결과 segment 계산은 기존 `spliceUnits`를 쓴다.
  - `styles.css`: 블록, `.list-nl`, 마커 pseudo-element, 깊이. 주석 "No hanging indent in the field"를 고친다.
- CLI, 스킬, 포맷: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 텍스트를 줄 단위 그리기 단위로 나누기: 목록 줄(깊이·마커·본문 범위·본문 시작 열)과 일반 줄, 칩으로 시작하는 줄, `"\n"`이 어느 `span.list-nl`에 들어가는지, 빈 줄 채움 위치. `fieldRuns`·`fieldListItems` 위에 만든다.
- 편집 범위가 `"\n"`을 포함하는지 판단: unit 범위와 텍스트로. 같은 판단을 IME 선삭제 결정에도 쓴다.
- unit ↔ DOM 위치 대응 규칙 중 순수하게 뺄 수 있는 부분: 줄 끝과 텍스트 없는 줄 시작이 숨긴 span이 아닌 위치로 대응하는 규칙.

## 포맷 변경

없다. 보내는 텍스트, 클립보드 JSON, 대화 기록은 바뀌지 않는다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Lists'의 "the field has no hanging indent" 문장을 바꾼다(사람이 승인했다). 문서 승격 task에서 고친다.
- ARCHITECTURE §7의 chip field 설명(`:715`~`:720`)을 새 구조로 고친다. "line deletes computed from segments"를 줄 경계를 넘는 삭제·교체까지 넓히고, IME 선삭제 규칙을 더하고, "contenteditable=false marker rejected"는 새 마커 방식에 맞게 고친다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에는 닿지 않는다.

## PoC 의존

- **줄 블록 구조 전체**(tasks 1): 실제 Electron에서 함께 동작하는지 아직 확인되지 않았다. 안 되는 항목이 있으면 멈추고 사람에게 보고한다.
- **IME 선삭제의 이벤트 순서**: 합성 이벤트로 순서만 PoC에서 확인하고, 실제 입력기 동작은 사람이 확인한다(tasks 5).

## postmortem에서 가져온 함정

- **2026-11 'Sent anchor chips inserted line breaks into copied text'**(2026-11.md:115): 말풍선 복사의 일이지만, composer의 `text/plain`도 블록·칩이 섞인 경우로 입력 텍스트와 같은지 테스트한다(composer는 segment에서 만들어서 블록이 바꿀 수 없다).
- **2026-11 'Look Up named a composer chip by its screen-reader text'**(2026-11.md:1110): 블록 구조에서 `selectionText`가 칩 화면 읽기 텍스트를 끼워 넣지 않는지 테스트한다.
- **2026-10 'Pin completion outlived the guarded intent'**(2026-10.md:771, 재발 :778): `placeCaret`이 포커스 없는 입력란을 포커스하지 않는 규칙을 블록 구조에서도 지킨다.
- **2026-11-23 composer 스크롤**(2026-11.md 맨 위): 코드가 커서를 놓는 편집은 스스로 스크롤해야 하고, 빈 줄에서의 커서 위치를 따로 재야 한다. 블록 구조에서 빈 줄 채움 기준으로 다시 확인한다.

## 참고한 디자인 프리셋

- `shape`: 기존 화면(입력란)의 시각 체계는 그대로 두고, 줄바꿈된 줄의 위치와 마커 그리기만 바꾼다.
