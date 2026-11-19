# composer Markdown — design

## 영향 받는 구성 요소

- **앱(renderer)만** 바뀐다. CLI, skill, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`)은 바뀌지 않는다. 새 의존성은 없다.
- 입력창: `ChipField`(`app/src/renderer/chipField.ts`)의 `render()`·`misdrawn()`과 Shift+Enter 처리(`insertLineBreak`/`insertParagraph`, `chipField.ts:323`). 네 composer(`HomeComposerView.tsx`, `DockedComposer.tsx`, `CanvasConversationPanel.tsx`, `prototype/PrototypeConversation.tsx`)는 모두 `ComposerField`(`ComposerParts.tsx:137`)를 쓰므로 한곳에서 바뀐다.
- Tab 키: 제안 수락 Tab(`DockedComposer.tsx:491`, Home의 같은 처리)이 먼저 받고, 제안이 없을 때만 `ChipField`가 목록 항목의 Tab·Shift+Tab을 `indentItem`으로 처리한다. `indentItem`이 `null`이면 `preventDefault`하지 않아 포커스가 평소처럼 옮겨 간다(키보드 사용자가 입력창에 갇히지 않는다).
- 보낸 버블: `UserMessage`(`ConversationThread.tsx:471-494`)가 줄을 목록 블록과 일반 블록으로 나눠 그린다. react-markdown은 쓰지 않는다. 다른 Markdown 기호를 평문으로 두려면 목록만 직접 나누는 편이 단순하다.
- 전송: `composeRequest`(`homeComposer.ts:39-43`)의 trim을 앞뒤 빈 줄 제거로 바꾼다.
- 제목·큐 행: 제목과 큐 행을 만드는 곳(`threadItems.ts`의 `splitRequest` 이후)에서 목록 기호를 걷어 낸다.

## 입력창 목록 그리기

- 값은 그대로 `FieldSegment[]`(텍스트와 칩)이다. 목록은 그리기에만 있다. 지금 스킬 단어를 감싸는 방식(`skill-word` span, `chipField.ts:548-557`)과 같은 원칙이다(ARCHITECTURE §7 'Renderer primitives': "segments, units and the clipboard are unchanged").
- 목록 항목 줄은 기호 span(`list-mark`)과 깊이별 들여쓰기·내어쓰기 스타일을 받는다. `- `·`* ` 기호 span은 글자를 숨기고 •를 그린다(글자는 DOM 텍스트로 남아 캐럿·삭제·복사가 그대로 동작). 번호 기호는 글자 그대로 보인다. 줄 앞 깊이 공백도 span으로 감싸 너비 대신 깊이 단계만큼 들여쓰기로 그린다. 내어쓰기는 줄 단위 래퍼가 필요하므로, 줄 래퍼를 넣을지 기호 span의 너비와 음수 들여쓰기로 처리할지는 PoC로 정한다(아래 'PoC 의존').
- `misdrawn()`은 기대 run(스킬 단어 + 목록 기호)과 그려진 span을 비교해 같으면 다시 그리지 않는다. 조합 중에는 다시 그리지 않고, `compositionend` 뒤의 지연 복구(`chipField.ts:421-452`)가 목록 그리기도 맞춘다.
- Shift+Enter 목록 이어 쓰기는 segment 편집으로 한다(줄바꿈 + 다음 기호 삽입, 또는 빈 항목의 기호 삭제). undo 한 번으로 되돌린다. 조합 중이면 조합이 끝난 뒤 처리한다(ARCHITECTURE §7: "model edits never run during a composition").
- 칩이 줄 맨 앞에 오면 그 줄은 목록 항목이 아니다(기호가 텍스트로 시작해야 한다).
- 깊이: 줄 앞 공백이 바로 위 목록 항목의 본문 시작 칸 이상이면 그 항목의 하위 항목이다(CommonMark). 들여쓰기 편집은 공백을 넣고 빼는 segment 편집이고, 하위 번호는 1부터 다시 센다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `listLines(lines: string[]): ListLine[]` — 각 줄이 목록 항목인지, 종류(`ul`/`ol`), 기호, 번호, 깊이, 본문 시작 위치를 구한다. `- `, `* `, `<1~9자리 숫자>. `만 인정한다. 깊이는 위 항목의 본문 시작 칸과 줄 앞 공백으로 정한다.
2. `fieldRuns(segments, skills): Run[]` — 기존 `fieldHighlightRuns`(`skillWords.ts`)에 목록 기호 run을 더한다.
3. `continueList(segments, caret): Edit | null` — Shift+Enter 때 할 편집: 같은 깊이의 다음 기호 삽입(`ol`은 번호 +1), 빈 항목이면 한 단계 내어쓰기 또는 기호 삭제, 목록 줄이 아니면 `null`(평소 줄바꿈).
4. `indentItem(segments, caret, dir: 1 | -1): Edit | null` — 항목 깊이를 한 단계 바꾸는 편집. 부모가 될 위 항목이 없으면 들여쓰지 않는다(`null`). 하위 번호 목록으로 들어가면 번호를 1로 다시 쓴다.
5. `bubbleBlocks(parts): Block[]` — 보낸 메시지의 텍스트와 `{{n}}` 칩을 줄 단위로 나눠, 연속된 목록 줄을 깊이에 따라 중첩된 `ul`/`ol` 트리로 묶는다. `ol`의 시작 번호는 첫 항목 번호를 따른다.
6. `plainTitle(text: string): string` — 제목·큐 행용으로 줄 앞 목록 기호를 걷어 낸다.
7. `trimBlankLines(text: string): string` — 앞뒤의 빈 줄만 지운다.

## 형식 변경

없다. 보내는 텍스트, `parts[].userText`, 대화 기록 형식은 그대로다.

## Conventions 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙을 건드리지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Composer'의 "Enter sends and Shift+Enter adds a line"에 목록 항목의 Shift+Enter 이어 쓰기와 깊이 키를 더한다.
- PRODUCT 'Highlight'의 "The word stays ordinary text" 모델을 목록 기호에도 그대로 적용한다.
- PRODUCT 'Sending'의 "the text as typed"는 그대로 맞다. trim 범위가 바뀌는 것만 Send 규칙 문장에 반영한다.
- PRODUCT 'Handoff'의 "never as the person's bubble or chips"는 바뀌지 않는다. 에이전트 Markdown 규칙(ARCHITECTURE §7)도 바뀌지 않는다.

## 이전 사고에서 가져온 주의점 (docs/postmortem/)

- 2026-11 'DockedComposer edit / shape layout effect'(`docs/postmortem/2026-11.md:276-280`): effect에서 도는 상태 동기화가 사람의 편집용 핸들러를 거치면 일시 상태가 지워진다. 목록 다시 그리기는 `edit` 경로가 아니라 그리기 경로에만 둔다.
- 2026-10 composer confirm dialog 재발(`docs/postmortem/2026-10.md:25`): composer 여러 곳이 같은 컴포넌트를 쓰지 않으면 한쪽만 고쳐진다. 네 composer가 `ComposerField` 하나를 쓰는지 테스트로 고정한다.

## PoC 의존

- contenteditable 안에서 목록 줄의 내어쓰기(둘째 줄이 본문에 맞춰지는 것)를 줄 래퍼 없이 그릴 수 있는지, 줄 래퍼를 넣으면 Chromium의 캐럿·줄 삭제(ARCHITECTURE §7: "line deletes are computed from segments and drawn rows")가 깨지지 않는지 확인되지 않았다. tasks의 첫 항목이 이를 확인한다.
- 조합 중 다시 그리지 않는 규칙이 목록 span이 늘어도 지켜지는지는 실제 앱의 한글 IME로만 확인할 수 있다(BACKLOG 'Not verified in the real app'의 native IME 항목과 같은 한계).
