# text-edit-menu — spec

앱 안의 텍스트 필드를 오른쪽 클릭(또는 Control-클릭)하면 편집 메뉴(Cut, Copy, Paste 등)가 열린다. 출처: `docs/BACKLOG.md` 'Known defects'의 "Text fields have no right-click edit menu (Cut, Copy, Paste). It is app-wide, so buzz-home left it out; no feature owns it."

## 사용자

- **사람(앱 사용자)**: composer, 검색 필드, 질문 카드의 답 필드, Settings와 첫 실행의 입력 필드에서 macOS 앱에서처럼 오른쪽 클릭으로 잘라내기·복사·붙여넣기를 한다. 대화 thread처럼 편집할 수 없는 텍스트를 선택했을 때는 복사한다(design 결정할 점 5).
- **에이전트**: 바뀌는 것이 없다. CLI, guide, 형식은 그대로다.

## 문제 (관찰된 사실)

- 앱의 어느 텍스트 필드에서도 오른쪽 클릭에 메뉴가 열리지 않는다(BACKLOG). main은 `webContents.on("context-menu")`를 등록하지 않고(`app/src/main/index.ts`), renderer도 `contextmenu`를 다루지 않는다. Electron은 기본 context menu를 주지 않는다(Electron 45 `docs/tutorial/spellchecker.md`: `context-menu` 이벤트는 메뉴를 만들 데이터만 준다).
- 지금 잘라내기·복사·붙여넣기는 단축키(⌘X/⌘C/⌘V)와 메뉴 막대의 Edit 메뉴로만 된다. Edit 메뉴는 `cut`/`copy`/`paste` role을 쓴다(`index.ts` `setMenu`).
- 맞춤법 검사는 켜져 있을 것이다(`webPreferences.spellcheck`의 기본값이 `true`, `electron.d.ts`; `index.ts`는 이 값을 정하지 않는다). 하지만 고칠 단어를 고를 메뉴가 없다. 실제 앱에서 밑줄이 보이는지는 확인하지 않았다.

## 텍스트 필드 목록 (`app/src/renderer`, 2026-11-07 기준)

| 필드 | 파일 | 비고 |
|---|---|---|
| composer 입력(Home, docked, 캔버스 패널) | `ComposerParts.tsx` `ComposerField` → `chipField.ts` | contenteditable. chip, 자체 undo, 자체 clipboard 형식, IME 처리. 쓸 수 없는 composer는 `contentEditable=false`라 선택만 된다 |
| preset·skill 검색 | `ComposerParts.tsx` `SearchField` | `/` 목록에서는 `readOnly`, `tabIndex=-1` |
| Quick Open 검색 | `QuickOpenDialog.tsx` | `spellCheck={false}` |
| 질문 카드의 답 | `ConversationThread.tsx` | secret 질문이면 `type="password"` |
| Antigravity 주소 붙여넣기 dialog(첫 실행, Settings > Agents) | `Onboarding.tsx` `PasteDialog` | busy면 `disabled` |
| GitHub 저장소 URL(첫 실행 Project 단계, Add Projects) | `Onboarding.tsx` | `readOnly`일 수 있다 |
| MCP 서버 URL dialog | `SettingsMcpConnectors.tsx` | |

편집할 수 없지만 선택할 수 있는 텍스트: 대화 thread의 bubble과 agent 메시지(`styles.css`의 `user-select: text`).

캔버스 iframe(sandbox, cross-site)의 필드는 이 목록에 넣지 않는다(design 결정할 점 6).

## 완료 조건

결정할 점의 추천안 기준이다. 답이 바뀌면 이 절을 고친다.

1. 위 목록의 편집 가능한 필드에서 오른쪽 클릭하면 native 메뉴가 열리고, 항목은 위에서부터 [맞춤법 제안] · Cut · Copy · Paste · Select All · [Look Up “…”] 순서다. 제안과 Look Up은 해당될 때만 나온다.
2. 각 항목의 사용 가능 여부는 Chromium이 보고한 값(`params.editFlags`)을 따른다. 선택이 없으면 Cut과 Copy가 비활성이고, password 필드에서는 Cut과 Copy가 비활성이다(Chromium이 그렇게 보고하는 것을 runtime-test에서 확인한다).
3. 메뉴의 Cut, Copy, Paste는 ⌘X, ⌘C, ⌘V와 같은 결과를 낸다. composer에서:
   - Copy와 Cut은 chip을 지금처럼 다룬다. 같은 캔버스의 composer끼리는 chip으로, 그 밖에서는 이름 텍스트로 붙는다(PRODUCT §5 item 6).
   - Paste는 Finder 파일을 경로로 첨부하고, 경로 없는 이미지를 붙여넣은 이미지로 첨부하며, 텍스트는 텍스트로 붙인다(`HomeComposerView.tsx` `pasteAction`, PRODUCT §5 item 1 'Attachments'). 첨부 한도와 오류 toast도 ⌘V와 같다.
   - IME 조합 중에는 ⌘V처럼 아무것도 붙지 않는다(`chipField.ts` `paste`).
   - Cut, Paste 뒤 ⌘Z가 composer 자체 undo로 되돌린다.
4. 쓸 수 없는 composer(읽기 전용)와 `readOnly`·`disabled` 필드에서는 선택이 있을 때 Copy(와 Look Up)만 있는 메뉴가 열리고, 선택이 없으면 아무 메뉴도 열리지 않는다.
5. 대화 thread처럼 편집할 수 없는 텍스트를 선택하고 오른쪽 클릭하면 Copy와 Look Up “…”만 있는 메뉴가 열린다. 선택 없이 편집할 수 없는 곳을 오른쪽 클릭하면 지금처럼 아무 메뉴도 열리지 않는다.
6. 맞춤법 검사가 틀렸다고 표시한 단어를 오른쪽 클릭하면 Electron이 준 제안이 메뉴 맨 위에 나오고, 고르면 그 단어가 바뀐다. composer에서도 바뀐 값이 draft에 남는다.
7. Look Up “…”은 선택한 텍스트로 macOS 사전 panel을 연다(`webContents.showDefinitionForSelection()`).
8. 캔버스 iframe 안에서 오른쪽 클릭하면 지금처럼 아무 메뉴도 열리지 않는다. thumbnail 창에는 메뉴가 없다.
9. 메뉴 막대의 Edit 메뉴와 그 단축키는 그대로다.

## 비목표

- 링크·이미지용 항목(Open Link, Copy Link, Copy Image 등)과 일반 영역의 메뉴(사이드바 행, 캔버스).
- Undo/Redo, Paste and Match Style, Delete, Speech, Services, Learn/Ignore Spelling 항목(design 결정할 점 2·3). Speech와 Undo/Redo는 Edit 메뉴에 그대로 있고, Services는 Doan 메뉴에 그대로 있다.
- 캔버스 iframe의 필드(design 결정할 점 6).
- renderer가 그리는 메뉴와 Doan 스타일의 메뉴 디자인(design 결정할 점 1).
- 맞춤법 검사 켜고 끄기 설정, 언어 설정(macOS는 언어를 자동으로 고른다, Electron `spellchecker.md`).
