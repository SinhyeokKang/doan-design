# composer Markdown — design

## 영향 받는 구성 요소

- **앱의 renderer와 main 일부**가 바뀐다. main은 제목·큐 행 평문화 때문에 바뀐다(아래). CLI, skill, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`)은 바뀌지 않는다. 새 의존성은 없다.
- 입력창: `ChipField`(`app/src/renderer/chipField.ts`)의 `render()`·`misdrawn()`과 Shift+Enter 처리(`insertLineBreak`/`insertParagraph`, `chipField.ts:323`), Backspace 처리. 네 composer(`HomeComposerView.tsx`, `DockedComposer.tsx`, `CanvasConversationPanel.tsx`, `prototype/PrototypeConversation.tsx`)는 모두 `ComposerField`(`ComposerParts.tsx:137`)를 쓰므로 한곳에서 바뀐다.
- Tab 키: `ChipField`의 keydown은 요소에 직접 단 리스너(`chipField.ts:86`)라 React의 `onKeyDown`보다 먼저 돈다. 그래서 Tab은 `ChipField` 리스너가 아니라 `ComposerField`의 `onKeyDown`(`ComposerParts.tsx:195`)에서, `props.onKey`가 처리하지 않았을 때만 다룬다. `props.onKey`는 빈 입력창의 다음 메시지 제안 수락(`DockedComposer.tsx:488-495`, `homeComposer.ts:646`)과 `/` 목록의 Tab 닫기(`homeComposer.ts:804`)를 처리한다. 그 뒤 handle 메서드 `indent(dir): boolean`을 부르고, true일 때만 `preventDefault`한다. false면 포커스가 평소처럼 옮겨 간다. Ctrl+Tab·Ctrl+Shift+Tab은 목록 처리를 거치지 않고 항상 포커스를 옮긴다(macOS 텍스트 뷰 관례).
- 보낸 버블: `UserMessage`(`ConversationThread.tsx:471-494`)가 줄을 목록 블록과 일반 블록으로 나눠 그린다. react-markdown은 쓰지 않는다. 다른 Markdown 기호를 평문으로 두려면 목록만 직접 나누는 편이 단순하다. 목록은 `ul`/`ol` 요소가 아니라 `role="list"`/`role="listitem"`을 단 블록으로 그린다. Chromium은 `ul`/`ol`의 marker와 깊이 공백을 텍스트 복사에 넣지 않기 때문이다. 기호와 깊이 공백은 실제 텍스트 span으로 남기고, `- `·`* `는 입력창과 같이 CSS로 •를 그린다. 번호는 적힌 그대로 보인다.
- 전송: `composeRequest`(`homeComposer.ts:39-43`)의 trim을 앞뒤 빈 줄 제거로 바꾼다. 공백만 있는 줄도 빈 줄이다. 공백만 있는 본문은 지금처럼 빈 메시지로 다룬다.
- 제목·큐 행: 제목은 main이 대화를 만들 때 `messageLine(requestTitleText(…))`로 만들어 저장한다(`app/src/main/conversation/service.ts:432`, `:567`). 큐 행도 `messageLine`(`app/src/main/conversation/messageText.ts:73`)을 거친다(`conversationStore.ts:213`, `ProjectOverview.tsx:312/323`, `CanvasConversationPanel.tsx:585`). 그래서 `plainTitle`을 `messageLine`의 한 줄 만들기 앞에 둔다. `messageText.ts`는 타입 import만 있어 main과 renderer가 함께 쓴다. 이미 저장된 제목은 기호가 남는다(다시 쓰지 않는다).

## 입력창 목록 그리기

- 값은 그대로 `FieldSegment[]`(텍스트와 칩)이다. 목록은 그리기에만 있다. 지금 스킬 단어를 감싸는 방식(`skill-word` span, `chipField.ts:548-557`)과 같은 원칙이다(ARCHITECTURE §7 'Renderer primitives': "segments, units and the clipboard are unchanged").
- 입력창에는 내어쓰기가 없다. 인라인 span으로는 넘친 둘째 줄을 본문 시작에 맞출 수 없고, 줄마다 블록 래퍼를 두면 평평한 DOM을 전제로 한 코드(`misdrawn`의 최상위 루프 `:455-476`, 칩 앞 filler 판정 `:462-465`, 끝 `<br>` 처리 `:477-479`·`:564-566`, `render`의 `replaceChildren` `:548-569`)를 크게 고쳐야 하기 때문이다. 넘친 줄은 줄 처음부터 이어진다. 내어쓰기는 보낸 버블에만 있다.
- 목록 항목 줄의 기호와 깊이 공백은 인라인 span(`list-mark`, `list-depth`)으로 감싼다. `- `·`* ` 기호 span은 글자를 숨기고 •를 그린다(글자는 DOM 텍스트로 남아 캐럿·삭제·복사가 그대로 동작). 번호 기호는 글자 그대로 보인다. 깊이 공백 span은 깊이 단계만큼의 너비로 그린다.
- `misdrawn()`은 기대 run(스킬 단어 + 목록 기호 + 깊이 공백)과 그려진 span을 비교해 같으면 다시 그리지 않는다. 조합 중에는 다시 그리지 않고, `compositionend` 뒤의 지연 복구(`chipField.ts:421-452`)가 목록 그리기도 맞춘다.
- Shift+Enter 목록 이어 쓰기는 segment 편집으로 한다(줄바꿈 + 다음 기호 삽입, 또는 빈 항목의 내어쓰기·기호 삭제). `insertTyped`의 typing 묶음에 합쳐지지 않는 별도 history 항목으로 넣어 undo 한 번으로 되돌린다. 조합 중이면 조합이 끝난 뒤 처리한다(ARCHITECTURE §7: "model edits never run during a composition"). 조합 중 Tab도 같다.
- Backspace: 캐럿이 목록 항목 본문의 맨 앞에 있고 선택이 없으면, 깊이가 0보다 크면 한 단계 내어쓰고, 0이면 기호 전체(`- `, `12. `)를 지워 평문 줄로 만든다. undo 한 번으로 되돌린다.
- 칩이 줄 맨 앞에 오면 그 줄은 목록 항목이 아니다(기호가 텍스트로 시작해야 한다). 버블도 같다.
- 깊이: 줄 앞 공백이 바로 위 목록 항목의 본문 시작 칸 이상이면 그 항목의 하위 항목이다(CommonMark). 탭 문자는 4칸으로 센다. 들여쓰기 편집은 공백을 넣고 빼는 segment 편집이고, 하위 번호는 1부터 다시 쓴다.
- 번호 목록은 1~3자리 숫자만 인정한다. `2026. 11. 19. 회의`처럼 연도로 시작하는 줄은 목록이 아니다. 이어 쓰기로 번호가 4자리가 되면(999 다음) 그 줄은 평소 줄바꿈이 된다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `listLines(lines: string[]): ListLine[]` — 각 줄이 목록 항목인지, 종류(`ul`/`ol`), 기호, 번호, 깊이, 본문 시작 위치를 구한다. `- `, `* `, `<1~3자리 숫자>. `만 인정한다. 깊이는 위 항목의 본문 시작 칸과 줄 앞 공백으로 정한다.
2. `fieldRuns(segments, skills, commands): Run[]` — 기존 `fieldHighlightRuns`(`skillWords.ts:42`, `commands`도 받는다)에 목록 기호·깊이 공백 run을 더한다.
3. `continueList(segments, caret): Edit | null` — Shift+Enter 때 할 편집: 같은 깊이의 다음 기호 삽입(`ol`은 번호 +1), 빈 항목이면 한 단계 내어쓰기 또는 기호 삭제, 목록 줄이 아니거나 다음 번호가 4자리면 `null`(평소 줄바꿈).
4. `indentItem(segments, caret, dir: 1 | -1): Edit | null` — 항목 깊이를 한 단계 바꾸는 편집. 부모가 될 위 항목이 없거나 깊이 0에서 내어쓰면 `null`. 하위 번호 목록으로 들어가면 번호를 1로 다시 쓴다.
5. `removeMarker(segments, caret): Edit | null` — 본문 맨 앞 Backspace 편집(내어쓰기 또는 기호 삭제).
6. `bubbleBlocks(parts): Block[]` — 보낸 메시지의 텍스트와 `{{n}}` 칩을 줄 단위로 나눠, 연속된 목록 줄을 깊이에 따라 중첩된 목록 트리로 묶는다. 기호·번호는 적힌 그대로 둔다. 목록 사이 빈 줄, 들여쓴 비목록 줄, 칩으로 시작하는 줄을 다룬다.
7. `plainTitle(text: string): string` — 제목·큐 행용으로 줄 앞 목록 기호와 깊이 공백을 걷어 낸다. `messageText.ts`에 둔다.
8. `trimBlankLines(text: string): string` — 앞뒤의 빈 줄(공백만 있는 줄 포함)만 지운다.

## 형식 변경

없다. 보내는 텍스트, `parts[].userText`, 대화 기록 형식은 그대로다. `{{n}}` 번호, 32,768 code units 한도, `fromMessage` 복원(`conversationStore.ts:539`)은 trim 변경의 영향을 받지 않는다. 자동으로 넣은 기호도 한도에 센다.

## Conventions 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙을 건드리지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Composer'의 "Enter sends and Shift+Enter adds a line"에 목록 항목의 Shift+Enter 이어 쓰기, Tab·Shift+Tab 깊이, Ctrl+Tab 포커스 이동, 본문 맨 앞 Backspace를 더한다.
- PRODUCT 'Highlight'의 "The word stays ordinary text" 모델을 목록 기호에도 그대로 적용한다.
- PRODUCT 'Sending'의 "the text as typed"는 그대로 맞다. trim 범위가 바뀌는 것만 Send 규칙 문장에 반영한다.
- PRODUCT 'Sending'의 "conversation titles, queue rows and restored drafts drop the fixed lines": 제목과 큐 행은 목록 기호도 걷어 낸다. 복원된 초안은 원문 그대로다.
- PRODUCT 'Handoff'의 "never as the person's bubble or chips"는 바뀌지 않는다. 에이전트 Markdown 규칙(ARCHITECTURE §7)도 바뀌지 않는다.

## 이전 사고에서 가져온 주의점 (docs/postmortem/)

- 2026-11 'DockedComposer edit / shape layout effect'(`docs/postmortem/2026-11.md:276-280`): effect에서 도는 상태 동기화가 사람의 편집용 핸들러를 거치면 일시 상태가 지워진다. 목록 다시 그리기는 `edit` 경로가 아니라 그리기 경로에만 둔다.
- 2026-10 composer confirm dialog 재발(`docs/postmortem/2026-10.md:25`): composer 여러 곳이 같은 컴포넌트를 쓰지 않으면 한쪽만 고쳐진다. 네 composer가 `ComposerField` 하나를 쓰는지 테스트로 고정한다.
- 2026-11-14 'Closing the prototype window removed an attachment the main window's draft had taken back'(`docs/postmortem/2026-11.md:511-517`): 큐가 초안으로 돌아오는 경로가 창마다 따로 있다. 큐를 초안으로 되돌릴 때도 목록 기호를 포함한 원문이 돌아오는지 프로토타입 창까지 테스트한다.

## PoC 의존

- 숨긴 `- ` 위의 캐럿: `- `는 두 글자라 ←·→로 •를 건널 때 캐럿이 보이지 않는 칸에 멈출 수 있다. 화살표 이동이 기호 안쪽을 건너뛰게 할 수 있는지, 그리고 인라인 깊이 span이 캐럿·줄 삭제(ARCHITECTURE §7: "line deletes are computed from segments and drawn rows")를 깨지 않는지 확인되지 않았다. tasks의 첫 항목이 이를 확인한다.
- 조합 중 다시 그리지 않는 규칙이 목록 span이 늘어도 지켜지는지는 실제 앱의 macOS 한글 IME로만 확인할 수 있다. Playwright는 네이티브 IME를 입력하지 못한다. 사람이 확인하지 못하면 BACKLOG 'Not verified in the real app'에 남긴다(native IME 항목과 같은 한계).

## 초안 요청 (`/design-draft`)

- 캔버스: `.doan/canvases/composer-markdown.html`, id `composer-markdown`, `doan:width` 1600. 새 파일이다.
- 프레임(id — 내용):
  - `field-bullets` — 캔버스 대화 패널의 docked composer(박스 모양). `- ` 목록 3단 중첩, •로 그림, 깊이별 들여쓰기, 스킬 단어가 든 항목.
  - `field-ordered` — 같은 composer. 번호 목록(`1.`·`2.`), 하위 번호 목록이 1부터, `2026. 11. 19. 회의` 줄은 목록이 아님.
  - `field-wrap` — 같은 composer. 긴 항목이 넘쳐 둘째 줄이 줄 처음부터 이어짐(입력창에는 내어쓰기 없음).
  - `field-home` — Home 히어로 composer에 같은 목록(네 composer가 같은 field를 쓴다는 확인용 한 장).
  - `bubble-lists` — 캔버스 대화 패널 스레드의 보낸 버블. `ul`·`ol` 중첩, 넘친 줄 내어쓰기, 적힌 번호 그대로(`1. 1.`), 항목 안의 앵커 칩과 스킬 단어.
  - `bubble-plain` — 보낸 버블에서 목록 외 Markdown 기호(`**`, 백틱, `#`)가 평문으로 남음.
  - `title-queue` — 목록으로 시작한 메시지의 대화 제목(사이드바 행·패널 제목)과 큐 행이 기호 없는 평문으로 보임.
- 키 동작(Shift+Enter, Tab, Ctrl+Tab, Backspace)은 그릴 수 없으므로 각 프레임 옆 노트로 적는다.
- 그대로 베끼는 출하 화면: docked composer와 스레드는 `docs/design/canvas-conversation.md`, Home composer는 `docs/design/home.md`, 코드는 `ComposerParts.tsx`, `DockedComposer.tsx`, `HomeComposerView.tsx`, `ConversationThread.tsx`.

## 초안 확정

- `.doan/canvases/composer-markdown.html`(커밋 `6cfa6eb6e`)을 사용자가 앱에서 확인하고 확정했다(2026-11-19).
