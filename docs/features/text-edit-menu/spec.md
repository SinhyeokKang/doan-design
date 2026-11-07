# text-edit-menu — spec

앱 안의 텍스트 필드를 오른쪽 클릭(또는 Control-클릭)하면 편집 메뉴(Cut, Copy, Paste 등)가 열린다. 출처: `docs/BACKLOG.md` 'Known defects'의 "Text fields have no right-click edit menu (Cut, Copy, Paste). It is app-wide, so buzz-home left it out; no feature owns it."

## 사용자

- **사람(앱 사용자)**: composer, 검색 필드, 질문 카드의 답 필드, Settings와 첫 실행의 입력 필드에서 macOS 앱에서처럼 오른쪽 클릭으로 잘라내기·복사·붙여넣기를 한다. 대화 thread의 본문 텍스트는 선택해 복사하거나 Look Up으로 찾아볼 수 있다. 사이드바, 제목, 버튼, Settings와 첫 실행의 안내 문구 같은 앱 chrome 텍스트는 선택되지 않는다.
- **에이전트**: 바뀌는 것이 없다. CLI, guide, 형식은 그대로다.

## 문제 (관찰된 사실)

- 앱의 어느 텍스트 필드에서도 오른쪽 클릭에 메뉴가 열리지 않는다(BACKLOG). main은 `webContents.on("context-menu")`를 등록하지 않고(`app/src/main/index.ts`), renderer도 `contextmenu`를 다루지 않는다. Electron은 `context-menu` 이벤트로 메뉴를 만들 데이터만 주고, 메뉴를 그리는 것은 앱이 한다(`app/node_modules/electron/electron.d.ts`: "Emitted when there is a new context menu that needs to be handled.").
- 지금 잘라내기·복사·붙여넣기는 단축키(⌘X/⌘C/⌘V)와 메뉴 막대의 Edit 메뉴로만 된다. Edit 메뉴는 `cut`/`copy`/`paste` role을 쓴다(`index.ts` `setMenu`).
- 맞춤법 검사는 켜져 있을 것이다(`webPreferences.spellcheck`의 기본값이 `true`, `electron.d.ts`; `index.ts`는 이 값을 정하지 않는다). 하지만 고칠 단어를 고를 메뉴가 없다. 실제 앱에서 밑줄이 보이는지는 확인하지 않았다.
- 앱 chrome 텍스트도 지금은 선택된다. `user-select: none`은 메뉴 행(`ds/surfaces.css` `.doan-menu-item`)과 Quick Open 행(`.qo-item`)에만 있다.

## 텍스트 필드 목록 (`app/src/renderer`, 2026-11-07 기준)

| 필드 | 파일 | 비고 |
|---|---|---|
| composer 입력(Home, docked, 캔버스 패널) | `ComposerParts.tsx` `ComposerField` → `chipField.ts` | contenteditable. chip, 자체 undo, 자체 clipboard 형식, IME 처리. 쓸 수 없는 composer는 `contentEditable=false`라 선택만 된다 |
| preset·skill 검색 | `ComposerParts.tsx` `SearchField` | `/` 목록에서는 `readOnly`, `tabIndex=-1` |
| Quick Open 검색 | `QuickOpenDialog.tsx` | `spellCheck={false}` |
| 질문 카드의 답 | `ConversationThread.tsx` | secret 질문이면 `type="password"` |
| Antigravity 주소 붙여넣기 dialog(첫 실행, Settings > Agents) | `Onboarding.tsx` `PasteDialog` | busy면 `disabled`. 이 feature에서 `spellCheck={false}` |
| GitHub 저장소 URL(첫 실행 Project 단계, Add Projects) | `Onboarding.tsx` | `readOnly`일 수 있다. 이 feature에서 `spellCheck={false}` |
| MCP 서버 URL dialog | `SettingsMcpConnectors.tsx` | 이 feature에서 `spellCheck={false}` |

편집할 수 없지만 선택할 수 있는 텍스트는 대화 thread의 bubble과 agent 메시지(`styles.css`의 `user-select: text`)만 남는다.

캔버스 iframe(sandbox, cross-site)의 필드는 이 목록에 넣지 않는다(design 결정할 점 6).

## 완료 조건

1. 위 목록의 편집 가능한 필드에서 오른쪽 클릭하면 native 메뉴가 열린다. 항목과 구분선은 design §2의 순서를 따른다: [맞춤법 제안 · 구분선] · [Look Up “…” · 구분선] · Cut · Copy · Paste · 구분선 · Select All. 제안과 Look Up은 해당될 때만 나온다. macOS가 스스로 더하는 항목(Writing Tools 등)은 없다.
2. Cut과 Copy는 선택이 없으면 비활성으로 보인다. password 필드에서는 Cut과 Copy가 꺼져 있고, Look Up과 맞춤법 제안이 나오지 않는다. 화면에 보이는 사용 가능 여부는 macOS가 정하므로 runtime-test가 화면으로 판정한다.
3. 메뉴의 Cut, Copy, Paste는 ⌘X, ⌘C, ⌘V와 같은 결과를 낸다. composer에서:
   - Copy와 Cut은 chip을 지금처럼 다룬다. 같은 캔버스의 composer끼리는 chip으로, 그 밖에서는 이름 텍스트로 붙는다(PRODUCT §5 item 6).
   - Paste는 Finder 파일을 경로로 첨부하고, 경로 없는 이미지를 붙여넣은 이미지로 첨부하며, 텍스트는 텍스트로 붙인다(`HomeComposerView.tsx` `pasteAction`, PRODUCT §5 item 1 'Attachments'). 첨부 한도와 오류 toast도 ⌘V와 같다.
   - 메뉴 Paste 뒤 caret은 ⌘V 뒤와 같은 자리에 있다.
   - IME 조합 중에는 ⌘V처럼 아무것도 붙지 않는다(`chipField.ts` `paste`).
   - Cut, Paste 뒤 ⌘Z가 composer 자체 undo로 되돌린다.
4. 쓸 수 없는 composer(읽기 전용)와 `readOnly` 필드에서는 선택이 있을 때 Look Up과 Copy만 있는 메뉴가 열리고, 선택이 없으면 아무 메뉴도 열리지 않는다. `disabled` 필드는 텍스트가 선택되지 않아 메뉴가 열리지 않는다. 비활성이 되기 전에 만든 선택이 남아 있으면 읽기 전용처럼 Look Up과 Copy만 열린다.
5. 대화 thread의 본문 텍스트를 오른쪽 클릭하면 Look Up과 Copy만 있는 메뉴가 열린다. 선택 없이 단어를 오른쪽 클릭했을 때 macOS가 그 단어를 선택하는지는 runtime-test가 관찰한 대로 적는다. 사이드바 이름, 제목, 버튼, Settings·첫 실행 안내 문구는 선택되지 않고, 오른쪽 클릭해도 메뉴가 열리지 않는다.
6. 맞춤법 검사가 틀렸다고 표시한 단어를 오른쪽 클릭하면 Electron이 준 제안이 메뉴 맨 위에 나오고, 고르면 그 단어가 바뀐다. composer에서도 바뀐 값이 draft에 남는다. 제안이 없는 단어에는 맞춤법 항목을 넣지 않는다("No Guesses Found"를 일부러 보이지 않는다).
7. Look Up “…”은 선택한 텍스트로 macOS 사전 panel을 연다(`webContents.showDefinitionForSelection()`).
8. 메뉴를 닫으면(Esc, 다른 곳 클릭) 필드의 focus와 선택이 그대로이고, 필드를 감싼 dialog가 닫히지 않는다.
9. 메뉴가 열린 사이 필드가 사라지거나 focus가 다른 필드로 옮겨지면, 고른 항목은 아무것도 하지 않는다. 맞춤법 제안과 Paste가 다른 필드에 들어가지 않는다.
10. URL 필드(MCP 서버 URL, GitHub 저장소 URL, Antigravity 주소)에는 맞춤법 밑줄과 제안이 없다.
11. 캔버스 iframe 안에서 오른쪽 클릭하면 지금처럼 아무 메뉴도 열리지 않는다. thumbnail 창에는 메뉴가 없다.
12. 메뉴 막대의 Edit 메뉴와 그 단축키는 그대로다.

## 비목표

- 링크·이미지용 항목(Open Link, Copy Link, Copy Image 등)과 일반 영역의 메뉴(사이드바 행, 캔버스).
- Undo/Redo, Paste and Match Style, Delete, Speech, Services, Learn/Ignore Spelling 항목(design 결정할 점 2·3). Speech와 Undo/Redo는 Edit 메뉴에 그대로 있고, Services는 Doan 메뉴에 그대로 있다.
- Writing Tools와 macOS가 context menu에 더하는 다른 항목. `popup`에 `frame`을 넘기지 않아 막는다(design §3).
- 캔버스 iframe의 필드(design 결정할 점 6).
- renderer가 그리는 메뉴와 Doan 스타일의 메뉴 디자인(design 결정할 점 1).
- 앱 chrome 텍스트의 복사. Settings의 명령처럼 복사할 값은 지금 있는 Copy 버튼으로 복사한다.
- 맞춤법 검사 켜고 끄기 설정, 언어 설정(`electron.d.ts` `setSpellCheckerLanguages`: "On macOS, the OS spellchecker is used and will detect your language automatically. This API is a no-op on macOS.").
