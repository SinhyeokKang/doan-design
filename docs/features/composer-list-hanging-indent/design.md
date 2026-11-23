# composer 목록 hanging indent — design

이 feature는 composer 입력란을 ProseMirror 위에 다시 만들어 목록 항목에 hanging indent를 준다. 이미 develop에 있는 화면의 표시를 바꾸므로 standalone redesign이다(AGENTS.md 'Workflow' `/design-draft`·`/design-sync` 예외). 새 시안 파일 `.doan/canvases/composer-hanging-indent.html`을 그리고 기존 시안 `composer-markdown.html`은 고치지 않는다. 기존 시안의 `field-wrap` 설명("The field has no hanging indent")은 남지만, 이 feature의 브랜치가 머지될 때까지 새 시안이 기준이다.

## 결정

- **편집기**: 순수 ProseMirror(`prosemirror-model`, `-state`, `-view`, `-transform`, `-history`, `-keymap`, `-commands`) 위에 입력란을 다시 만든다(사람이 정했다). TipTap은 쓰지 않는다. 텍스트 모델을 지키는 D 모델에서 TipTap이 더하는 것이 없고(gzip 약 33KB와 꺼야 하는 기본 CSS만 더함), 구조 목록(S 모델)은 PRODUCT의 텍스트 모델을 깨기 때문이다(`.scratch/tiptap-poc/poc-result.md`).
- **문서 모델(D)**: 문서는 문단만 담고 한 줄이 한 문단이다. 문단은 `<div>`로 그린다(`<p>`면 선택 텍스트와 CDP 값에 줄마다 "\n"이 더 생긴다). 마커와 깊이 공백은 입력한 텍스트 그대로다. 목록 표시는 앱의 `listLines`/`fieldRuns` 결과로 만드는 decoration이다.
- **마커 그리기(glyph)**: 깊이 공백은 `word-spacing`으로 폭 0, 마커 문자는 16px 글자 그대로 12px 열에 맞게 padding, 글머리표는 투명 글자 위 `::before` "•"(사람이 정했다). 목록 줄 문단에 node decoration으로 `--body`(본문 시작점)를 주고 `padding-inline-start: var(--body); text-indent: calc(-1 * var(--body))`로 줄바꿈된 줄을 본문 시작점에 맞춘다. 번호 폭은 숨긴 span에서 한 번 재고 캐시한다: `--body = 20·(depth+1) + max(12, 번호 폭)`.
- **칩**: inline atom 노드(`contenteditable=false`, 선택 불가, sr-only "Frame " + 라벨). 모델에서는 지금처럼 한 unit이다.
- **깊이 상한 없음, 번호 정렬은 항목마다, 줄 시작 커서는 모든 깊이에서 마커 앞**(사람이 정했다).
- **받아들인 차이**: ⌥→의 추가 멈춤과 빈 줄마다 CDP 값에 줄바꿈 하나 추가는 두 PoC 모두에서 남았고, 사람이 알고 이 방향을 골랐다. ⌥→는 구현 중 keymap으로 지금 동작에 맞출 수 있으면 맞춘다.
- **IME 실패 시**: 사람 확인에서 걸친 선택 위 조합이 실패하면 BACKLOG 'Known defects'에 남기고 출시한다(사람이 정했다).
- **CSS만으로 하지 않는 이유**: `text-indent: hanging each-line`은 Chrome 146에 들어왔고 이 앱의 Electron(Chrome 156)에서 쓸 수 있다([blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/E8lsWfkyWVk/m/my-groups), [web-features](https://web-platform-dx.github.io/web-features-explorer/features/text-indent-hanging/)). 블록 하나에 한 값만 줄 수 있어서 평평한 입력란에서는 일반 줄까지 들여 쓰이고 깊이·마커 폭마다 값을 바꿀 수 없다.

## 입력란 구조

- **편집기 뷰**: `EditorView` 하나가 `div.composer-input`(지금의 contenteditable 자리)을 맡는다. 접근성 역할·속성(textbox/combobox, `aria-*`, `data-chip-field`)은 ProseMirror의 `attributes` prop으로 지금과 같게 둔다.
- **스키마**: `doc`(문단+), `paragraph`(`<div>`, inline*), `text`, `chip`(inline atom, attrs에 anchor). 다른 노드와 mark는 없다.
- **텍스트 ↔ 문서**: 지금 segment 모델(`FieldSegment = text | chip`)과 문서를 서로 바꾸는 순수 함수 두 개. 줄바꿈은 문단 경계, 칩은 `chip` 노드. 왕복이 바이트 단위로 같아야 한다(PoC 16개 문자열 통과).
- **decoration plugin**: 문서가 바뀔 때마다 줄마다 `fieldRuns`로 목록 줄·깊이·마커·스킬 단어를 읽어 node decoration(`--body`, 목록 클래스)과 inline decoration(깊이·마커·스킬 강조)을 만든다.
- **호스트 API**: 지금 `ChipField`의 공개 메서드와 hook을 그대로 둔다(`setValue`, `segments`, `insertChip`·`insertSkill`·`insertText`, `composing()`, `focus`, `onChange`, 조합 중 칩 대기, draft 전환, `reset`). 호스트(`ComposerParts.tsx`, 네 composer)는 바뀌지 않는다.

## 편집 처리

- **글자 입력·삭제·IME**: ProseMirror가 처리하고 DOM과 모델을 맞춘다. 줄을 넘는 삭제(Backspace·Delete·⌥⌫ 등)는 PoC에서 처리 코드 없이 맞았다. macOS 삭제 명령 전체(⌃K·⌃H·⌃D·⌃T·⌘⌫·⌘⌦), 맞춤법 제안 교체는 tasks 1에서 다시 잰다.
- **keymap**: Enter는 보내기(호스트가 처리), Shift+Enter는 `continueList`, Tab·Shift+Tab은 `indentItem`(위에 항목이 없거나 깊이 0의 Shift+Tab이면 포커스 이동), 본문 시작 Backspace는 `removeMarker`, ←/→는 마커·깊이와 칩을 한 단위로 건너뛴다. 모두 앱의 `composerLists.ts` 함수를 그대로 쓴다. 조합 중 Shift+Enter·Tab은 지금 입력란의 'press' 규칙(조합이 끝난 뒤 실행)을 그대로 옮긴다.
- **실행 취소**: `prosemirror-history`, `newGroupDelay: 1000`(지금 `TYPING_MERGE_MS`). 커서만 옮긴 transaction 뒤에는 `closeHistory`로 단계를 끊어 지금처럼 새 단계가 되게 한다. 목록 편집·붙여넣기·잘라내기·칩은 각자 한 단계다. Edit 메뉴의 `historyUndo`/`historyRedo` `beforeinput`은 `prosemirror-history`가 스스로 처리한다.
- **클립보드**: 복사·잘라내기는 지금처럼 segment에서 `text/plain`과 `application/x-doan-field+json`을 만든다(`clipboardTextSerializer`·`handleDOMEvents` 또는 `transformCopied`). 붙여넣기는 `text/plain`을 텍스트 자리에 넣고(문단 나눔 없이 줄바꿈만), 칩 JSON이 있으면 칩을 넣는다. ProseMirror 기본 붙여넣기(구조 삽입)는 쓰지 않는다.
- **끌어놓기·서식**: 지금처럼 막는다.
- **줄 시작 칩 앞 커서**: 지금은 U+200B로 메운다. ProseMirror에서도 칩 앞뒤 DOM 커서 위치가 없으므로 같은 방식(또는 ProseMirror의 gapcursor 대신 widget decoration)을 tasks 1에서 정한다.
- **스크롤**: 코드가 만든 transaction에 `scrollIntoView()`를 걸어 커서를 보이게 한다. 입력란 안에서만 스크롤한다(지금 `revealCaret`과 같은 범위). 빈 줄의 커서 위치를 다시 확인한다.
- **포커스**: 포커스 없는 입력란에 커서를 놓을 때 포커스하지 않는다(postmortem 2026-10 'Pin completion').
- **읽기 전용**: `editable` prop이 false. 선택·복사는 된다.
- **placeholder**: 입력란이 완전히 빌 때만(지금과 같음).
- **Look Up**: 문단이 `<div>`라서 `selectionText`에 줄바꿈이 더해지지 않는다. 칩 이름으로 Look Up하는 경로를 테스트로 확인한다.

## 영향받는 구성 요소

- **app (renderer)**
  - `chipField.ts`: ProseMirror 위로 다시 쓴다. 공개 API는 그대로다.
  - 새 모듈(예: `fieldSchema.ts`, `fieldDoc.ts`, `fieldDecorations.ts`): 스키마, 텍스트 ↔ 문서, decoration. 이름은 구현 때 정한다.
  - `anchorField.ts`, `composerLists.ts`, `skillWords.ts`: 그대로 쓰고, 필요한 순수 함수만 더한다.
  - `styles.css`: 목록 decoration 클래스, glyph 마커, `--body`. ProseMirror 기본 CSS 중 필요한 것(`.ProseMirror` white-space 등)을 `.composer-input` 규칙과 맞춘다. 주석 "No hanging indent in the field"를 고친다.
- **의존성**: `app/package.json`에 ProseMirror 패키지를 `npm --prefix app install --save-exact`로 런타임 의존성에 추가한다(AGENTS.md 'Commands'). 버전은 tasks 1에서 정한다(PoC가 쓴 것: view 1.43.0, model 1.25.13, state 1.4.4, transform 1.12.7, history 1.5.2, keymap 1.2.3, commands 1.7.2).
- **main**: Edit 메뉴가 `data-chip-field`에 `historyUndo`/`historyRedo`를 보내는 경로(`app/src/main/index.ts`)는 그대로다.
- CLI, 스킬, 포맷: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- segment ↔ ProseMirror 문서 변환(왕복 바이트 일치).
- 문서에서 decoration 목록 계산(줄마다 목록 여부, `--body`, 깊이·마커·스킬 범위).
- 번호 폭으로 `--body` 계산(번호 폭 측정은 주입).
- 실행 취소 단계 경계 규칙(커서만 옮긴 transaction에서 끊기, 입력 1000ms 묶기).
- 클립보드 `text/plain`과 칩 JSON 만들기·읽기: 지금 `anchorField.ts`의 함수를 그대로 쓴다.

## 포맷 변경

없다. 보내는 텍스트, 클립보드 JSON, 대화 기록은 바뀌지 않는다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Lists'의 "the field has no hanging indent" 문장을 바꾸고, 항목마다 본문 정렬과 줄 시작 커서, 받아들인 차이를 적는다(사람이 승인했다).
- ARCHITECTURE §7 'Setup'(런타임 의존성)과 chip field 설명(`:715`~`:720`)을 ProseMirror 구조로 고쳐 쓴다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에는 닿지 않는다.

## PoC 의존

- **순수 ProseMirror D 모델**: TipTap 위에서 잰 D 모델을 순수 ProseMirror로 다시 확인하고, TipTap PoC가 재지 않은 것(macOS 삭제 명령, 맞춤법 제안, 마우스 드래그·세 번 클릭, 이모지 경계, 줄 시작 칩 커서, 칩 클릭·tooltip, ⌥→ keymap 시도, `closeHistory` 실행 취소 경계, `scrollIntoView` 범위)을 잰다(tasks 1).
- **실제 한글 입력기**: 사람이 확인한다(tasks 5).

## postmortem에서 가져온 함정

- **2026-11 'Sent anchor chips inserted line breaks into copied text'**(2026-11.md:115): 복사 `text/plain`이 블록·칩이 섞인 경우에도 입력 텍스트와 같은지 테스트한다.
- **2026-11 'Look Up named a composer chip by its screen-reader text'**(2026-11.md:1110): `selectionText`가 칩 화면 읽기 텍스트를 끼워 넣지 않는지 테스트한다.
- **2026-10 'Pin completion outlived the guarded intent'**(2026-10.md:771, 재발 :778): 포커스 없는 입력란에 커서를 놓을 때 포커스하지 않는다.
- **2026-11-23 composer 스크롤**(2026-11.md 맨 위): 코드가 놓은 커서도 보이게 스크롤하고, 빈 줄의 커서 위치를 따로 확인한다.

## 참고한 디자인 프리셋

- `shape`: 입력란의 시각 체계는 그대로 두고, 줄바꿈된 줄의 위치와 마커 그리기만 바꾼다.
