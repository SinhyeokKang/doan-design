# text-edit-menu — design

main이 메인 창의 `context-menu` 이벤트를 받아 native 메뉴(`Menu.popup`)를 연다. 어떤 항목을 넣을지는 Electron 없는 순수 함수가 정하고, `index.ts`는 그 결과를 Electron template으로 바꿔 띄우기만 한다. renderer는 앱 chrome 텍스트를 선택되지 않게 하는 CSS와 URL 필드의 `spellCheck={false}`만 바뀐다. preload, IPC, 형식은 바뀌지 않는다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main 순수 함수 | 새 `app/src/main/editMenu.ts`, `editMenu.test.ts` | `context-menu` params로 메뉴 항목 목록을 만든다(§2) |
| app main shell | `app/src/main/index.ts`, `index.test.ts`, `canvasFrame.ts` | `createWindow`에서 `window.webContents.on("context-menu", …)` 등록, template 변환, `popup`. `canvasFrame.ts`의 `isTopFrame`을 export해 main frame 판정에 쓴다 |
| renderer CSS | `app/src/renderer/styles.css` | 앱 chrome 텍스트에 `user-select: none`, thread 본문과 입력 필드만 선택 가능(§4) |
| renderer 필드 | `SettingsMcpConnectors.tsx`(서버 URL), `Onboarding.tsx`(GitHub URL, `PasteDialog`) | `spellCheck={false}` |
| CLI, skills, guide | 없음 | |
| 형식 | 없음 | comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지 모두 그대로 |

`chipField.ts`와 composer host의 clipboard 처리는 바꾸지 않고 그대로 쓴다(§3 'composer와의 관계').

## 2. 순수 함수로 뽑을 부분 (`/tdd` 대상)

`app/src/main/editMenu.ts`. `menuState.ts`처럼 Electron을 import하지 않는다.

- `editMenuItems(input) → EditMenuItem[]`
  - 입력: `{ mainFrame: boolean; editable: boolean; password: boolean; selection: string; flags: { canCut; canCopy; canPaste; canSelectAll }; misspelled: string; suggestions: readonly string[] }`. shell이 이벤트 때 `ContextMenuParams`에서 채운다: `isEditable`, `formControlType === "input-password"`, `selectionText`, `editFlags`, `misspelledWord`, `dictionarySuggestions`, `frame`.
  - 출력: `{ kind: "suggestion"; word } | { kind: "role"; role: "cut" | "copy" | "paste" | "selectAll"; enabled } | { kind: "lookUp"; label } | { kind: "separator" }`의 배열. 빈 배열이면 메뉴를 띄우지 않는다.
  - 순서(예상, T1 시작 때 확인): [제안들 · 구분선] · [Look Up · 구분선] · Cut · Copy · Paste · 구분선 · Select All. macOS 순서를 따른다는 결정이다. 구현을 시작할 때 선택이 있는 `NSTextView`의 `menu(for:)`를 Swift probe로 출력해 Look Up의 자리를 확인하고, 다르면 실제 순서에 맞춘다. 결과는 T1 commit 메시지에 적는다.
  - 규칙:
    - `mainFrame`이 false면 빈 배열(캔버스 iframe, 결정할 점 6).
    - 편집 가능: 위 순서 전체. 각 role의 `enabled`는 `flags`를 그대로 옮긴다.
    - 편집 불가, 선택 있음: [Look Up · 구분선] · Copy(`flags.canCopy`).
    - 편집 불가, 선택 없음: 빈 배열.
    - password: 제안과 Look Up을 넣지 않는다. Cut·Copy의 `enabled`는 `flags`를 따른다(Chromium은 password 필드에서 이 둘을 끄는 것으로 예상하고, T4에서 확인한다).
    - 제안은 `misspelled`가 있고 `editable`이며 `password`가 아닐 때만, Electron이 준 순서 그대로 넣는다. 제안이 없으면 제안 칸과 그 구분선을 넣지 않는다("No Guesses Found" 없음).
    - Look Up은 공백만이 아닌 선택이 있고 `password`가 아닐 때만 넣는다.
    - 연속 구분선, 맨 앞·맨 뒤 구분선은 생기지 않는다.
- `lookUpLabel(selection) → string`: `Look Up “<text>”`. 줄바꿈과 연속 공백을 공백 하나로 접고 앞뒤를 자른 뒤, 30자(code point)를 넘으면 30자에서 자르고 `…`를 붙인다. 30자는 Doan이 정한 값이고 macOS의 실제 자르기 규칙을 잰 것이 아니다. surrogate pair를 가르지 않는다.
- 테스트 사례: 위 세 경우, 각 flag false, password(선택 있음, 틀린 단어 있음: 제안·Look Up 없음), 제안 0·1·여러 개, `misspelled`는 있는데 `editable`이 false, 선택이 공백만, 긴 선택·이모지가 30자 경계에 걸린 선택, `mainFrame` false.

## 3. shell (`index.ts`)

- 등록: `createWindow`에서 메인 창의 `webContents`에만 등록한다. thumbnail 창(`thumbnailWindow.ts`)에는 등록하지 않는다.
- main frame 판정: 이벤트 때 `params.frame`을 읽고, `params.frame !== null && params.frame.parent === null`이면 main frame이다. `canvasFrame.ts`의 `isTopFrame`을 export해 쓴다. `window.webContents.mainFrame`과 같은 객체인지는 비교하지 않는다. 캔버스는 cross-site OOPIF라 `parent`가 있다.
- template 변환:
  - 편집 항목(cut, copy, paste, selectAll) → `{ label, enabled, click }`. role 항목이 아니라 click 항목이다. click은 아래 '필드 확인'을 통과한 뒤 `contents.cut()`·`copy()`·`paste()`·`selectAll()`을 부른다. 이 method는 Edit 메뉴 role과 같은 Chromium 편집 명령을 실행하므로, 메뉴 Paste와 ⌘V가 같은 DOM `paste` 이벤트를 일으킨다(T4에서 확인한다). `enabled`는 `editFlags`를 그대로 옮기고, 화면에도 그대로 보인다. label은 macOS 메뉴와 같은 `Cut`, `Copy`, `Paste`, `Select All`이다.
  - `suggestion` → `{ label: word, click }`. 필드 확인 뒤 `contents.replaceMisspelling(word)`.
  - `lookUp` → `{ label, click: () => contents.showDefinitionForSelection() }`.
  - `separator` → `{ type: "separator" }`.
- 필드 확인(완료 조건 9): role 항목과 `replaceMisspelling`은 고르는 순간 focus된 필드에 작용한다. 그래서 메뉴가 열린 사이 원래 필드가 사라지고 focus가 다른 필드로 옮겨지면, 그 필드의 단어가 바뀌거나 그 필드에 붙여넣어진다(T4가 실제 앱에서 재현했다). 편집 가능한 메뉴의 항목은 실행 직전에 main이 `contents.executeJavaScript`로 "지금 focus된 요소가 메뉴를 연 자리(`params.x`, `params.y`)의 요소이거나 그 요소를 담는가"를 확인하고, 아니면 아무것도 하지 않는다. Edit > Undo·Redo가 이미 같은 방식으로 focus된 chip field를 확인한다(`index.ts` `editHistory`). 확인 script는 고정 문자열이고 좌표만 숫자로 넣는다. renderer가 정한 문자열을 main이 실행하거나 쓰지 않는다. 편집할 수 없는 메뉴(thread 텍스트의 Look Up, Copy)는 아무것도 쓰지 않으므로 확인하지 않는다. 앱은 page zoom을 쓰지 않으므로 `params.x`·`y`를 그대로 CSS px로 쓴다.
- 띄우기: `Menu.buildFromTemplate(template).popup({ window })`. `frame`은 넘기지 않는다. Electron 45 `PopupOptions`(`electron.d.ts`)는 `frame`을 "Writing Tools 같은 OS 기능"에 쓰라고 한다. 넘기지 않으면 메뉴는 정한 항목만 담는다(사용자 결정). macOS가 그래도 항목을 더하는지는 T4에서 본다.
- 이벤트를 막지 않는다: renderer가 DOM `contextmenu`를 `preventDefault`하면 Chromium이 메뉴 요청을 보내지 않는다. 지금 `app/src`(renderer, main, 캔버스 script)에는 `contextmenu`나 `context-menu`를 다루는 코드가 없다(2026-11-07 grep, 테스트 제외). 새로 다루는 코드가 생기면 이 메뉴가 사라진다.
- 테스트 사례(`editMenu.test.ts`, `index.test.ts`): main frame과 subframe(subframe은 popup 없음), 편집 항목 → `{ label, enabled, click }`와 `contents.cut()` 등, suggestion → `replaceMisspelling(word)`, 필드 확인이 true일 때만 실행·false·거절·destroyed·좌표가 유한수가 아니면 실행 안 함, 편집할 수 없는 메뉴는 확인 없음, lookUp → `showDefinitionForSelection()`, `popup`에 `frame` 없음, thumbnail 창에 등록하지 않음.

### composer와의 관계

- chip field는 clipboard를 DOM `copy`/`cut`/`paste` 이벤트에서 처리한다(`chipField.ts` `onCopy`, `paste`). native 편집(`insertFromPaste`, `deleteByCut`)은 `beforeinput`에서 막는다. host는 `onPaste`에서 파일을 먼저 가져가고, 남은 텍스트를 field가 붙인다(`ComposerParts.tsx`). Edit 메뉴의 role이 이 이벤트를 일으키고, context menu의 `contents.cut()`·`copy()`·`paste()`도 같은 Chromium 편집 명령이라 같은 길을 탄다. composer 쪽 새 코드는 필요 없다.
- 맞춤법 제안의 `replaceMisspelling`은 `insertReplacementText` 입력으로 들어온다. `onBeforeInput`은 `insertReplacementText`를 막지 않으므로, 브라우저가 DOM을 바꾸고 field가 값을 다시 읽는다. chip 바로 옆 단어, 자체 undo 기록에 어떻게 남는지는 확인하지 않았다 → T4.

## 4. 앱 chrome 텍스트 선택 끄기 (renderer CSS)

- 사용자 결정: 앱 chrome 텍스트는 선택되지 않는다. 대화 thread 본문과 텍스트 입력만 선택된다. 그래서 편집 불가 메뉴(Look Up, Copy)는 thread 텍스트에서만 열린다.
- `styles.css`:
  - `body { user-select: none; }` — 사이드바, 헤더, 제목, 버튼, Settings·첫 실행·Add Projects 안내 문구, dialog, toast, notice가 모두 여기서 꺼진다.
  - 다시 켜는 곳: `.conversation-thread .bubble`, `.conversation-thread .msg-agent`(이미 `user-select: text`), `input`, `textarea`, `.composer-input`(쓸 수 없는 composer의 draft도 선택돼야 한다, DESIGN 'Unavailable composer').
  - `user-select: none`은 상속되므로, 입력 필드가 다시 켜는 규칙 없이도 선택되는지에 기대지 않고 명시한다.
  - `input:disabled`, `textarea:disabled`는 `user-select: none`이다(완료 조건 4). T4에서 disabled 입력의 텍스트가 더블클릭으로 선택되고 Look Up·Copy 메뉴가 열렸다. macOS의 비활성 텍스트 필드처럼 선택되지 않게 한다. 비활성이 되기 전에 만든 선택은 남을 수 있고, 이때는 읽기 전용처럼 Look Up·Copy가 열린다.
- 캔버스 iframe은 다른 문서라 영향이 없다. thumbnail 창은 자기 data URL host page를 쓰고 `styles.css`를 읽지 않는다(`thumbnailWindow.ts` `hostPage`).
- 테스트: `ds/controls.test.ts`처럼 CSS 규칙을 읽는 테스트로 `body`의 `none`과 다시 켜는 선택자 다섯 개를 고정한다. 실제 동작(사이드바 이름 오른쪽 클릭 → 메뉴 없음, thread 단어 오른쪽 클릭 → 선택과 Look Up·Copy)은 T4에서 본다.

## 5. 형식 변경

없다. JSON Schema 정본(ARCHITECTURE §11)을 건드리지 않고, `v`도 그대로다.

## 6. Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 그대로다.

## 7. 결정 영향

- **보안 기본값과 IPC 경계**(ARCHITECTURE §7 'Setup', 'Settings IPC'): 새 IPC channel과 preload method가 없다. 메뉴는 main이 Chromium의 이벤트에서 직접 만들고, clipboard 내용을 main이 읽거나 renderer가 지정한 문자열을 쓰지 않는다(ARCHITECTURE §7: "main never writes a renderer-named string"). role은 Chromium의 편집 명령을 실행할 뿐이다.
- **권한 거부**: async Clipboard API는 지금처럼 거부된다. native 경로는 그 API를 쓰지 않는다.
- **sandbox iframe**: 캔버스 iframe에는 메뉴를 띄우지 않는다(결정할 점 6). 캔버스 script와 serving 범위는 그대로다.
- **App menu**: Edit 메뉴의 Undo/Redo click 항목(`editHistory`), role 항목, 단축키는 그대로다.

## 8. PoC 의존

새 PoC task는 두지 않는다. 다음은 아직 확인하지 않은 가정이고, 구현 뒤 T4 `/runtime-test`에서 확인한다. 하나라도 틀리면 그 결정할 점으로 돌아간다.

- context menu의 `paste` role이 composer에 `clipboardData.files`가 든 DOM `paste` 이벤트를 일으킨다(Finder 파일, 경로 없는 이미지). BACKLOG는 실제 앱의 native ⌘V도 확인하지 않았다고 적고 있다("Home surfaces not verified in the real app … native Cmd+V").
- `replaceMisspelling`이 chip field의 draft와 undo를 깨지 않는다.
- password 필드에서 `editFlags.canCopy`·`canCut`이 false이고, `selectionText`가 무엇으로 오는지(T4가 기록).
- `params.frame.parent`로 캔버스 iframe을 가를 수 있다.
- `frame` 없이 띄운 메뉴에 macOS가 항목을 더하지 않는다.
- `body`의 `user-select: none` 아래에서도 thread 단어의 오른쪽 클릭이 단어를 선택한다.

## 9. POSTMORTEM에서 가져온 함정

`docs/POSTMORTEM.md`를 paste, clipboard, composer, context menu, menu, undo로 grep했다.

- **2026-10-25 'Calling the Quit menu item's JS click did not quit macOS Electron'**: "this native macOS menu role did not execute through the JS click path used for the app's custom commands." → runtime-test가 role 항목을 `MenuItem.click`으로 불러 통과를 주장하면 안 된다. 실제 오른쪽 클릭과 native 입력으로 확인하고, 어느 쪽으로 확인했는지 적는다.
- **2026-10-30 'Renaming the bundle to Doan left "About/Hide/Quit doan" in the menu'**: "Electron's `about`, `hide` and `quit` role labels are computed from `app.name`." → 이 메뉴의 role(cut, copy, paste, selectAll)에는 이름이 들어가지 않지만, label은 `Menu`가 아니라 화면 screenshot으로 확인한다.
- **2026-10-27 'Runtime clipboard capture constructed an item with no MIME types'**: probe는 `app/runtime/clipboard.ts`로 사용자 clipboard를 저장하고 `finally`에서 되돌린다. 직접 `new ClipboardItem`을 만들지 않고, Electron이 드러내지 않는 형식이 있는지 먼저 본다.
- **2026-10-23 'Comment copy reported success before the clipboard committed'**: native role은 main의 `clipboard.writeText`를 쓰지 않으므로 해당 없다. renderer가 그리는 메뉴(결정할 점 1의 B)를 고르면 이 함정이 다시 생긴다.
- **ARCHITECTURE §7 App menu 'Undo/Redo are click items, not roles'**(POSTMORTEM 항목은 아니지만 같은 종류의 함정): chip field는 Chromium undo stack을 쓰지 않아 `editFlags.canUndo`가 실제와 다르다. 결정할 점 2에서 Undo/Redo를 빼는 이유 중 하나다.

## 10. 디자인 preset

`doan design-skill --json`으로 목록을 보고 `clarify`와 `harden`만 읽었다.

- `clarify`: 새 문구는 Look Up label 하나다. macOS가 쓰는 형식(`Look Up “…”`)을 따르고, 나머지 label은 Electron role의 label이라 Doan이 쓰지 않는다. "Labels describe what will happen, not the gesture"에 맞는다.
- `harden`: 상태를 나눴다. 편집 가능·읽기 전용·비활성·password, 선택 있음·없음, 긴 선택(Look Up label 자르기), 맞춤법 제안 0개, IME 조합 중, 메뉴가 열린 사이 사라진 필드, 캔버스 iframe.
- 그리는 화면이 없으므로 다른 preset은 읽지 않았다.

## 결정할 점

모두 정해졌다. 1~7은 추천대로 정했고, 2026-11-07 `/feature-review` 뒤 사용자가 세 가지를 더 정했다(8~10). T4 뒤 사용자가 두 가지를 더 정했다(11~12). 각 결정은 위 절과 spec에 반영했다.

1. **native 메뉴인가, renderer가 그리는 메뉴인가** → **native**(`Menu.popup` + role).
   - 이유: Edit 메뉴 role과 같은 Chromium 편집 명령(`webContents.cut()` 등)을 쓰므로 composer의 clipboard 처리를 그대로 탄다. Look Up과 맞춤법은 native API로 된다. macOS가 그리므로 VoiceOver와 시스템 모양이 따라온다.
   - 버린 안: renderer가 그리는 메뉴(radix-ui `ContextMenu`). main은 모든 권한 요청을 거부해 async Clipboard API가 안 되고(ARCHITECTURE §7), 웹 페이지의 `execCommand("paste")`도 Chromium이 막는 것으로 알려져 있다(확인 안 함). 그래서 결국 main에 paste IPC가 필요하다. Look Up, Services는 그릴 수 없다.
2. **어떤 항목을 넣나** → Cut · Copy · Paste · Select All, 해당될 때 맞춤법 제안과 Look Up “…”.
   - 이유: 이 Mac에서 `NSTextView.defaultMenu`를 출력해 보니(2026-11-07, Swift) 첫 묶음이 Cut, Copy, Paste, Paste and Match Style이고 Undo/Redo는 없었다. Undo/Redo는 `editFlags.canUndo`가 chip field의 자체 기록을 모른다. Paste and Match Style은 Doan의 모든 필드가 이미 plain text로 붙이므로 Paste와 같고, composer에 파일이 든 `paste` 이벤트를 주는지 확인하지 않았다. Services가 context menu에서 되는지는 `electron.d.ts`가 말하지 않는다. Select All은 NSTextView 기본 메뉴에 없지만 Edit 메뉴에 있고 비용이 없어 넣는다.
3. **맞춤법을 어디까지 넣나** → 제안만(`dictionarySuggestions` → `replaceMisspelling`).
   - 이유: 밑줄만 있고 고칠 방법이 없는 지금 상태를 해결한다. Learn Spelling(`addWordToSpellCheckerDictionary`)은 "On macOS and Windows, this word will be written to the OS custom dictionary as well."(`electron.d.ts`)이라 Doan 밖의 사용자 사전을 바꾼다.
4. **composer에서 메뉴 Paste가 첨부 처리를 유지하나** → 유지한다. ⌘V와 같다.
   - 이유: 같은 role이 같은 `paste` 이벤트를 일으키므로 새 코드가 없고, 두 Paste가 다르게 동작하는 것이 더 놀랍다. 이벤트에 파일이 실리는지는 T4에서 확인한다.
5. **편집할 수 없는 선택 텍스트에도 메뉴를 여나** → 연다(Look Up, Copy). 결정 8에 따라 대상은 대화 thread 본문뿐이다.
6. **캔버스 iframe의 필드를 넣나** → 넣지 않는다.
   - 이유: 사람은 캔버스를 직접 편집하지 않는다(PRODUCT §3 Out of scope 7). 캔버스 script가 Select에서 누르기를 막아(`canvasScript.ts`) 캔버스 안의 필드는 ⌥-클릭으로만 닿는다. cross-site sandbox frame에서 편집 명령을 실행하는 경로를 새로 열 이유가 없다.
7. **`/design-draft`가 필요한가** → 그리지 않는다. `/design-sync`도 하지 않는다.
   - 이유: macOS가 그리는 메뉴라 Doan 토큰이나 레이아웃이 없고, 순서와 상태는 spec 완료 조건과 §2 테스트가 정한다. 초안이 native 모양을 흉내 내면 실제와 다른 기준이 하나 더 생긴다.
8. **앱 chrome 텍스트를 선택할 수 있나** → 없다. 사이드바, 제목, 버튼, Settings·첫 실행 문구는 `user-select: none`이고, thread 본문과 텍스트 입력만 선택된다(§4).
9. **macOS가 더하는 항목(Writing Tools 등)을 허용하나** → 막는다. `popup`에 `frame`을 넘기지 않고, 메뉴는 정한 항목만 담는다(§3).
10. **Look Up의 자리** → macOS 순서를 따른다. 예상 순서는 [제안 · 구분선] · Look Up · 구분선 · Cut · Copy · Paste · 구분선 · Select All이고, 구현을 시작할 때 Swift probe로 확인해 맞춘다(§2). T4는 Look Up이나 Translate가 두 번 나오지 않는지 본다.
11. **메뉴가 열린 사이 필드가 바뀌면** → main이 실행 직전에 focus된 요소를 확인하고, 다르면 아무것도 하지 않는다(§3 '필드 확인'). 그래서 편집 항목을 role 대신 click 항목으로 둔다. T4가 실제 앱에서 결함을 재현한 뒤 사용자가 정했다.
12. **disabled 입력의 선택** → `input:disabled`, `textarea:disabled`를 `user-select: none`으로 둔다(§4). T4 결과를 보고 사용자가 정했다.
