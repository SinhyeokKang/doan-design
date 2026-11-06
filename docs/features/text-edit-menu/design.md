# text-edit-menu — design

main이 메인 창의 `context-menu` 이벤트를 받아 native 메뉴(`Menu.popup`)를 연다. 어떤 항목을 넣을지는 Electron 없는 순수 함수가 정하고, `index.ts`는 그 결과를 Electron template으로 바꿔 띄우기만 한다. renderer, preload, IPC, 형식은 바뀌지 않는다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app main 순수 함수 | 새 `app/src/main/editMenu.ts`, `editMenu.test.ts` | `context-menu` params로 메뉴 항목 목록을 만든다(§2) |
| app main shell | `app/src/main/index.ts` | `createWindow`에서 `window.webContents.on("context-menu", …)` 등록, template 변환, `popup` |
| renderer | 없음 | `chipField.ts`·composer host의 clipboard 처리는 그대로 쓴다(§3) |
| CLI, skills, guide | 없음 | |
| 형식 | 없음 | comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지 모두 그대로 |

## 2. 순수 함수로 뽑을 부분 (`/tdd` 대상)

`app/src/main/editMenu.ts`. `menuState.ts`처럼 Electron을 import하지 않는다.

- `editMenuItems(input) → EditMenuItem[]`
  - 입력: `{ mainFrame: boolean; editable: boolean; selection: string; flags: { canCut; canCopy; canPaste; canSelectAll }; misspelled: string; suggestions: readonly string[] }`. shell이 `ContextMenuParams`(`isEditable`, `selectionText`, `editFlags`, `misspelledWord`, `dictionarySuggestions`, `frame`)에서 채운다.
  - 출력: `{ kind: "suggestion"; word } | { kind: "role"; role: "cut" | "copy" | "paste" | "selectAll"; enabled } | { kind: "lookUp"; label } | { kind: "separator" }`의 배열. 빈 배열이면 메뉴를 띄우지 않는다.
  - 규칙:
    - `mainFrame`이 false면 빈 배열(캔버스 iframe, 결정할 점 6).
    - 편집 가능: [제안들, 구분선] · Cut · Copy · Paste · 구분선 · Select All · [구분선, Look Up]. 각 role의 `enabled`는 `flags`를 그대로 옮긴다.
    - 편집 불가, 선택 있음: Copy(`flags.canCopy`) · [구분선, Look Up].
    - 편집 불가, 선택 없음: 빈 배열.
    - 제안은 `misspelled`가 있고 `editable`일 때만, Electron이 준 순서 그대로 넣는다. 제안이 없으면 제안 칸과 그 구분선을 넣지 않는다.
    - Look Up은 공백만이 아닌 선택이 있을 때만 넣는다.
    - 연속 구분선, 맨 앞·맨 뒤 구분선은 생기지 않는다.
- `lookUpLabel(selection) → string`: `Look Up “<text>”`. 줄바꿈과 연속 공백을 공백 하나로 접고 앞뒤를 자른 뒤, 30자(code point)를 넘으면 30자에서 자르고 `…`를 붙인다. 30자는 Doan이 정한 값이고 macOS의 실제 자르기 규칙을 잰 것이 아니다. surrogate pair를 가르지 않는다.
- 테스트 사례: 위 세 경우, 각 flag false, password 필드처럼 `canCopy`·`canCut`이 false, 제안 0·1·여러 개, `misspelled`는 있는데 `editable`이 false, 선택이 공백만, 긴 선택·이모지가 30자 경계에 걸린 선택, `mainFrame` false.

## 3. shell (`index.ts`)

- 등록: `createWindow`에서 메인 창의 `webContents`에만 등록한다. thumbnail 창(`thumbnailWindow.ts`)에는 등록하지 않는다.
- main frame 판정: `params.frame`이 null이 아니고 `parent === null`이며 `window.webContents.mainFrame`과 같은 frame이어야 한다(§7 'Settings IPC' 'Boundary'가 IPC sender를 가리는 방식과 같은 기준). 캔버스는 cross-site OOPIF라 `parent`가 있다.
- template 변환:
  - `role` 항목 → `{ role, enabled }`. Electron role이라 macOS가 붙이는 label과 단축키 표시를 쓴다. Edit 메뉴와 같은 role이므로 메뉴 Paste와 ⌘V는 같은 편집 명령(Chromium의 Paste)을 실행한다.
  - `suggestion` → `{ label: word, click: () => contents.replaceMisspelling(word) }`.
  - `lookUp` → `{ label, click: () => contents.showDefinitionForSelection() }`.
  - `separator` → `{ type: "separator" }`.
- 띄우기: `Menu.buildFromTemplate(template).popup({ window, frame: params.frame })`. `frame`은 Electron 45 `PopupOptions`가 "Writing Tools 같은 OS 기능"에 쓰라고 하는 값이다. 이 값을 주면 macOS가 메뉴에 항목을 더할 수 있다. 무엇이 더해지는지는 runtime-test에서 기록하고, 더해진 항목은 막지 않는다.
- 이벤트를 막지 않는다: renderer가 DOM `contextmenu`를 `preventDefault`하면 Chromium이 메뉴 요청을 보내지 않는다. 지금 `app/src`(renderer, main, 캔버스 script)에는 `contextmenu`나 `context-menu`를 다루는 코드가 없다(2026-11-07 grep, 테스트 제외). 새로 다루는 코드가 생기면 이 메뉴가 사라진다.

### composer와의 관계

- chip field는 clipboard를 DOM `copy`/`cut`/`paste` 이벤트에서 처리한다(`chipField.ts` `onCopy`, `paste`). native 편집(`insertFromPaste`, `deleteByCut`)은 `beforeinput`에서 막는다. host는 `onPaste`에서 파일을 먼저 가져가고, 남은 텍스트를 field가 붙인다(`ComposerParts.tsx`). Edit 메뉴의 role이 이 이벤트를 일으키므로, 같은 role을 쓰는 context menu도 같은 길을 탄다. 새 코드는 필요 없다.
- 맞춤법 제안의 `replaceMisspelling`은 `insertReplacementText` 입력으로 들어온다. chip field는 이 입력을 막지 않고 DOM에서 값을 다시 읽는다(`onBeforeInput`이 막는 것은 history, `insertFrom*`, `deleteByDrag`, `deleteByCut`뿐이다). chip 바로 옆 단어, 자체 undo 기록에 어떻게 남는지는 확인하지 않았다 → runtime-test.
- macOS의 Chromium은 선택 없이 단어를 오른쪽 클릭하면 그 단어를 선택한다고 알려져 있다(확인 안 함). 그러면 메뉴 Paste가 그 단어를 바꾼다. macOS 텍스트 필드의 동작과 같으므로 막지 않는다. runtime-test에서 관찰한 대로 적는다.

## 4. 형식 변경

없다. JSON Schema 정본(ARCHITECTURE §11)을 건드리지 않고, `v`도 그대로다.

## 5. Conventions 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 그대로다.

## 6. 결정 영향

- **보안 기본값과 IPC 경계**(ARCHITECTURE §7 'Setup', 'Settings IPC'): 새 IPC channel과 preload method가 없다. 메뉴는 main이 Chromium의 이벤트에서 직접 만들고, clipboard 내용을 main이 읽거나 renderer가 지정한 문자열을 쓰지 않는다(ARCHITECTURE §7: "main never writes a renderer-named string"). role은 Chromium의 편집 명령을 실행할 뿐이다.
- **권한 거부**: async Clipboard API는 지금처럼 거부된다. native 경로는 그 API를 쓰지 않는다.
- **sandbox iframe**: 캔버스 iframe에는 메뉴를 띄우지 않는다(결정할 점 6). 캔버스 script와 serving 범위는 그대로다.
- **App menu**: Edit 메뉴의 Undo/Redo click 항목(`editHistory`), role 항목, 단축키는 그대로다.

## 7. PoC 의존

새 PoC task는 두지 않는다. 다음은 아직 확인하지 않은 가정이고, 구현 뒤 `/runtime-test`(tasks T3)에서 확인한다. 하나라도 틀리면 그 결정할 점으로 돌아간다.

- context menu의 `paste` role이 composer에 `clipboardData.files`가 든 DOM `paste` 이벤트를 일으킨다(Finder 파일, 경로 없는 이미지). BACKLOG는 실제 앱의 native ⌘V도 확인하지 않았다고 적고 있다("Home surfaces not verified in the real app … native Cmd+V").
- `replaceMisspelling`이 chip field의 draft와 undo를 깨지 않는다.
- password 필드에서 `editFlags.canCopy`·`canCut`이 false다.
- `params.frame`으로 캔버스 iframe을 가를 수 있다.

## 8. POSTMORTEM에서 가져온 함정

`docs/POSTMORTEM.md`를 paste, clipboard, composer, context menu, menu, undo로 grep했다.

- **2026-10-25 'Calling the Quit menu item's JS click did not quit macOS Electron'**: "this native macOS menu role did not execute through the JS click path used for the app's custom commands." → runtime-test가 role 항목을 `MenuItem.click`으로 불러 통과를 주장하면 안 된다. native action(`Menu.sendActionToFirstResponder("paste:")` 등)으로 보내거나 실제 오른쪽 클릭으로 확인하고, 어느 쪽으로 확인했는지 적는다.
- **2026-10-30 'Renaming the bundle to Doan left "About/Hide/Quit doan" in the menu'**: "Electron's `about`, `hide` and `quit` role labels are computed from `app.name`." → 이 메뉴의 role(cut, copy, paste, selectAll)에는 이름이 들어가지 않지만, macOS가 더하는 항목의 label은 runtime-test에서 `Menu`가 아니라 화면으로 확인한다.
- **2026-10-27 'Runtime clipboard capture constructed an item with no MIME types'**: probe는 `app/runtime/clipboard.ts`로 사용자 clipboard를 저장하고 되돌린다. 직접 `new ClipboardItem`을 만들지 않는다.
- **2026-10-23 'Comment copy reported success before the clipboard committed'**: native role은 main의 `clipboard.writeText`를 쓰지 않으므로 해당 없다. renderer가 그리는 메뉴(결정할 점 1의 B)를 고르면 이 함정이 다시 생긴다.
- **ARCHITECTURE §7 App menu 'Undo/Redo are click items, not roles'**(POSTMORTEM 항목은 아니지만 같은 종류의 함정): chip field는 Chromium undo stack을 쓰지 않아 `editFlags.canUndo`가 실제와 다르다. 결정할 점 2에서 Undo/Redo를 빼는 이유 중 하나다.

## 9. 디자인 preset

`doan design-skill --json`으로 목록을 보고 `clarify`와 `harden`만 읽었다.

- `clarify`: 새 문구는 Look Up label 하나다. macOS가 쓰는 형식(`Look Up “…”`)을 따르고, 나머지 label은 Electron role의 label이라 Doan이 쓰지 않는다. "Labels describe what will happen, not the gesture"에 맞는다.
- `harden`: 상태를 나눴다. 편집 가능·읽기 전용·비활성·password, 선택 있음·없음, 긴 선택(Look Up label 자르기), 맞춤법 제안 0개, IME 조합 중, 캔버스 iframe.
- 그리는 화면이 없으므로 다른 preset은 읽지 않았다.

## 결정 (사용자, 2026-11-07: 일곱 개 모두 추천안)

1. **native 메뉴인가, renderer가 그리는 메뉴인가**
   - A. native(`Menu.popup` + role). Edit 메뉴와 같은 role이라 composer의 clipboard 처리를 그대로 탄다. Look Up과 맞춤법은 native API로 된다. macOS가 그리므로 VoiceOver와 시스템 모양이 따라온다.
   - B. renderer가 그리는 메뉴(radix-ui `ContextMenu`, Doan 메뉴 스타일). Paste가 막힌다: main은 모든 권한 요청을 거부해 async Clipboard API가 안 되고(ARCHITECTURE §7), 웹 페이지의 `execCommand("paste")`도 Chromium이 막는 것으로 알려져 있다(확인 안 함). 그래서 결국 main에 paste IPC가 필요하다. Look Up, Services, Writing Tools는 그릴 수 없다.
   - **결정: A.** B를 골라도 붙여넣기는 main을 거쳐야 하고, macOS 기능은 native에만 있다.
2. **어떤 항목을 넣나**
   - A. Cut · Copy · Paste만.
   - B. Cut · Copy · Paste · Select All, 해당될 때 맞춤법 제안과 Look Up “…”.
   - C. B에 Undo/Redo, Paste and Match Style, Speech, Services를 더한 Chrome식 전체 메뉴.
   - **결정: B.** 이 Mac에서 `NSTextView.defaultMenu`를 출력해 보니(2026-11-07, Swift) 첫 묶음이 Cut, Copy, Paste, Paste and Match Style이고 Undo/Redo는 없었다. Undo/Redo는 `editFlags.canUndo`가 chip field의 자체 기록을 모른다. Paste and Match Style은 Doan의 모든 필드가 이미 plain text로 붙이므로 Paste와 같고, 이 명령이 composer에 파일이 든 `paste` 이벤트를 주는지 확인하지 않았다. Services는 Electron 문서가 context menu에서 되는지 말하지 않는다(menu-item.md v45). Select All은 NSTextView 기본 메뉴에 없지만 Edit 메뉴에 있고 비용이 없어 넣는다.
3. **맞춤법을 어디까지 넣나**
   - A. 넣지 않는다.
   - B. 제안만(`dictionarySuggestions` → `replaceMisspelling`).
   - C. 제안과 Learn Spelling(`session.addWordToSpellCheckerDictionary`), Ignore Spelling.
   - **결정: B.** 밑줄만 있고 고칠 방법이 없는 지금 상태를 해결한다. macOS에서 Electron은 native spellchecker를 쓰므로(`spellchecker.md`) Learn Spelling이 Doan 밖의 사용자 사전에 쓸 수 있고, 이는 확인하지 않았다.
4. **composer에서 메뉴 Paste가 첨부 처리를 유지하나**
   - A. 유지한다. ⌘V와 같다: 파일은 첨부, 이미지는 붙여넣은 이미지, 텍스트는 텍스트, chip clipboard는 같은 캔버스에서만 chip.
   - B. 메뉴 Paste는 텍스트만 붙인다.
   - **결정: A.** 같은 role이 같은 `paste` 이벤트를 일으키므로 새 코드가 없고, 두 Paste가 다르게 동작하는 것이 더 놀랍다. 이벤트에 파일이 실리는지는 T3에서 확인한다.
5. **편집할 수 없는 선택 텍스트(대화 thread 등)에도 메뉴를 여나**
   - A. 연다: Copy와 Look Up.
   - B. 텍스트 필드에서만 연다(BACKLOG 문장 그대로).
   - **결정: A.** thread 텍스트는 일부러 선택 가능하게 둔 곳이고(`user-select: text`), 같은 순수 함수에 분기 하나가 더해질 뿐이다.
6. **캔버스 iframe의 필드를 넣나**
   - A. 넣지 않는다. 캔버스 iframe 안의 오른쪽 클릭에는 메뉴가 없다.
   - B. 넣는다.
   - **결정: A.** 사람은 캔버스를 직접 편집하지 않는다(PRODUCT §3 Out of scope 7). 캔버스 script가 Select에서 누르기를 막아(`canvasScript.ts`) 캔버스 안의 필드는 ⌥-클릭으로만 닿는다. cross-site sandbox frame에서 편집 명령을 실행하는 경로를 새로 열 이유가 없다.
7. **`/design-draft`가 필요한가**
   - A. 그리지 않는다. `/design-sync`도 하지 않는다.
   - B. 메뉴 항목 순서와 상태를 보여 주는 참고 초안을 그린다.
   - **결정: A.** macOS가 그리는 메뉴라 Doan 토큰이나 레이아웃이 없고, 순서와 상태는 spec 완료 조건과 §2 테스트가 정한다. 초안이 native 모양을 흉내 내면 실제와 다른 기준이 하나 더 생긴다.
