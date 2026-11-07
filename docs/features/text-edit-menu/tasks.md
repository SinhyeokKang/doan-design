# text-edit-menu — tasks

순서: 순수 함수 → shell(`index.ts`) → renderer(CSS, URL 필드) → runtime-test → 승격. 형식 변경과 UI 초안은 없다(design §5, 결정할 점 7).

## T1. 순수 함수 `editMenuItems`, `lookUpLabel`

- 시작 전에 Swift probe(`.scratch/text-edit-menu/`)로 선택이 있는 `NSTextView`의 `menu(for:)`를 출력해 Look Up의 자리를 확인한다(design §2, 결정할 점 10). 예상과 다르면 실제 순서로 design §2와 테스트를 고친다.
- 새 `app/src/main/editMenu.ts`(Electron import 없음)와 `editMenu.test.ts`. design §2의 규칙과 테스트 사례 전부: 편집 가능·편집 불가+선택·편집 불가+선택 없음, flag별 `enabled`, password(제안·Look Up 없음, Cut·Copy는 flag를 따름), 제안 0·1·여러 개, 편집 불가인데 `misspelled`가 있음, 공백만 선택, 구분선이 연속·맨 앞·맨 뒤에 오지 않음, `mainFrame` false, Look Up label의 공백 접기·30자 자르기·surrogate pair.
- `/tdd`가 테스트를 먼저 쓰고 red를 확인한다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): rules for the text edit menu`(probe가 확인한 macOS 순서를 메시지에 적는다)

## T2. shell: `context-menu`에서 native 메뉴 띄우기

- `canvasFrame.ts`의 `isTopFrame`을 export한다.
- `index.ts` `createWindow`에서 메인 창 `webContents`의 `context-menu`를 등록한다. 이벤트 때 `params.frame`을 읽어 `params.frame !== null && isTopFrame(params.frame)`으로 판정, `formControlType === "input-password"`를 `password`로, `ContextMenuParams` → T1 입력, T1 출력 → template(role, `replaceMisspelling`, `showDefinitionForSelection`, separator), `popup({ window })`(`frame` 없음, design §3). thumbnail 창에는 등록하지 않는다.
- 편집 항목과 맞춤법 제안은 click 항목이고, 실행 직전 필드 확인(design §3)을 통과해야 한다.
- 판정과 변환이 순수 함수 밖에 남으면 T1 테스트로 옮길 수 있는지 먼저 본다. `index.ts`에는 이벤트 등록과 Electron 호출만 남긴다.
- `index.test.ts` 사례: main frame과 subframe(subframe은 popup 없음), role 매핑, suggestion → `replaceMisspelling`, lookUp → `showDefinitionForSelection`, `popup`에 `frame` 없음, thumbnail 창 미등록.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공.
- **commit 경계**: `feat(app): right-click edit menu on text fields`

## T3. renderer: 앱 chrome 텍스트 선택 끄기, URL 필드 맞춤법 끄기

- `styles.css`: `body { user-select: none; }`, 다시 켜는 `.conversation-thread .bubble`, `.conversation-thread .msg-agent`, `input`, `textarea`, `.composer-input`(design §4).
- `input:disabled`, `textarea:disabled`에 `user-select: none`(design §4).
- `spellCheck={false}`: MCP 서버 URL(`SettingsMcpConnectors.tsx`), GitHub 저장소 URL과 `PasteDialog`의 Antigravity 주소(`Onboarding.tsx`).
- 테스트: CSS를 읽는 테스트(`ds/controls.test.ts` 방식)로 `body`의 `none`과 다시 켜는 다섯 선택자를 고정한다. 세 URL 필드의 static markup에 `spellcheck="false"`가 있는지 기존 component 테스트(`SettingsMcpConnectors.test.tsx`, `Onboarding.test.tsx`)에 더한다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공.
- **commit 경계**: `feat(app): only conversation text and fields are selectable`

## T4. `/runtime-test`: 실제 앱의 native 메뉴

- 격리: `app/runtime/environment.ts`의 임시 userData·HOME·SHELL, 임시 repo와 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`, `DOAN_CLI`). probe는 `.scratch/runtime-test/text-edit-menu/`에 둔다.
- clipboard: `app/runtime/clipboard.ts`로 저장하고 `finally`에서 되돌린다. 시작 전에 Electron이 드러내지 않는 형식이 clipboard에 있는지 먼저 보고, 있으면 되돌릴 수 없다고 보고하고 멈춘다(POSTMORTEM 2026-10-27). Finder 파일은 `osascript`로 Finder에서 복사해 clipboard에 올린다.
- 입력과 관찰: Playwright는 NSMenu를 보지 못하므로 실제 오른쪽 클릭과 Control-클릭은 native 입력(`orca computer` 또는 같은 수단)으로 보내고, 메뉴는 OS 수준 screenshot(`screencapture`)으로 남긴다. `app/runtime/desktop.ts`로 잠금 해제를 먼저 확인하고, 잠겨 있으면 native 부분을 미검증으로 보고한다. 메뉴는 native Esc로 닫고, `finally`에서 `closePopup()`을 부른다. main에서 모든 `context-menu` 이벤트(params의 `isEditable`, `selectionText`, `formControlType`, `misspelledWord`, `frame.parent` 유무)를 기록하고, "메뉴 없음"을 주장하기 전에 이벤트가 왔는지와 template이 비었는지를 먼저 본다.
- 사용 가능 여부: role 항목의 `enabled`는 macOS에서 참고값이므로(design §3) 화면 screenshot으로 판정한다.
- 확인할 곳과 것:
  - Home composer: 빈 필드, 선택, chip 포함 선택, chip 위 오른쪽 클릭. 실제 context menu에서 Paste를 한 번 골라 결과와 caret 자리를 ⌘V와 비교한다.
  - composer Copy/Cut → 같은 캔버스 composer에 Paste하면 chip, Home composer에 Paste하면 이름 텍스트. Cut, Paste 뒤 ⌘Z가 되돌린다.
  - clipboard에 경로 없는 PNG → 붙여넣은 이미지 chip. `osascript`로 복사한 Finder 파일 → 경로 첨부.
  - 틀린 단어: 비동기 맞춤법 marker가 생길 때까지 기다린 뒤 오른쪽 클릭, 제안이 맨 위, 고르면 draft 값이 바뀜, chip 바로 옆 단어. 제안이 없는 단어에는 맞춤법 항목이 없음.
  - Look Up 자리가 T1 순서와 같고, Look Up이나 Translate가 두 번 나오지 않으며, Writing Tools 등 macOS가 더한 항목이 없다.
  - 쓸 수 없는 composer, `readOnly` 입력(첫 실행 Project 단계의 GitHub URL), `disabled` 입력(busy `PasteDialog`: 메뉴 없음), 질문 카드의 password 답(받은 `selectionText`를 기록, Cut·Copy 꺼짐, Look Up·제안 없음), Quick Open, MCP 서버 URL dialog(맞춤법 밑줄 없음).
  - 메뉴를 Esc나 다른 곳 클릭으로 닫으면 필드의 focus와 선택이 남고, 감싼 dialog가 닫히지 않는다.
  - 메뉴가 열린 사이 필드가 사라짐(예: 질문 카드가 답해져 사라짐): 고른 항목이 아무것도 하지 않고, `replaceMisspelling`이 다른 필드에 들어가지 않는다.
  - IME 조합 중 오른쪽 클릭: 일어난 일을 기록한다. native IME 입력을 보낼 수 없으면 BACKLOG에 미검증으로 넘긴다.
  - 사이드바 이름, 제목, Settings 문구 오른쪽 클릭: 선택되지 않고 메뉴가 없다. thread 단어 오른쪽 클릭: 단어가 선택되는지(macOS가 실제로 하는 일을 기록)와 Look Up·Copy 메뉴.
  - 캔버스 iframe 안 오른쪽 클릭: 메뉴 없음.
- 검증: probe exit 0과 완료 marker, screenshot, `real-state.ts` 지문이 그대로. 실패하거나 design §8의 가정이 틀리면 해당 결정할 점으로 돌아간다.
- **commit 경계**: 없음(`.scratch/`는 커밋하지 않는다). 관찰은 T5의 BACKLOG 판단에 쓴다.

## T5. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`(영문): §5 'App (Mac)'의 맨 앞(item 0 앞)에 앱 전체 규칙 bullet을 새로 둔다. 어떤 필드와 텍스트에서 메뉴가 열리는지, 항목과 순서, password·읽기 전용·비활성 필드, 맞춤법 제안, composer Paste가 ⌘V와 같다는 것, 앱 chrome 텍스트는 선택되지 않는다는 것, 캔버스 iframe에는 없다는 것. 근거는 commit 메시지에 쓴다.
- `docs/ARCHITECTURE.md`(영문): §7 'Setup'의 'App menu' 묶음에 context menu bullet을 더한다. `editMenu.ts`(순수)와 `index.ts`(등록), `isTopFrame` 판정, role을 쓰는 이유(Edit 메뉴와 같은 편집 명령이라 chip field의 clipboard 처리를 탐), `frame`을 넘기지 않는 이유, Undo/Redo를 넣지 않는 이유, role `enabled`가 macOS에서 참고값이라는 것, renderer의 DOM `contextmenu` `preventDefault`가 메뉴를 없앤다는 제약, `body`의 `user-select: none`과 다시 켜는 선택자.
- `docs/BACKLOG.md`: 'Known defects'의 "Text fields have no right-click edit menu (Cut, Copy, Paste). It is app-wide, so buzz-home left it out; no feature owns it." 줄을 지운다. T4가 메뉴 Paste로 파일 첨부를 확인했으면 'Home surfaces not verified in the real app' 줄의 native Cmd+V 부분을 확인한 범위에 맞게 고친다. T4에서 확인하지 못한 것(native IME 등)은 'not verified in the real app' 줄로 더한다.
- `docs/DESIGN.md`: Doan이 그리는 표면이 없으므로 바꾸지 않는다.
- `docs/features/text-edit-menu/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과(코드가 함께 merge되는 branch에서). 문서 전용 확인으로 `git diff`에서 PRODUCT·ARCHITECTURE·BACKLOG의 바뀐 줄이 위 목록과 맞는지 보고, `rg -n "text-edit-menu" docs app cli .agents eval AGENTS.md` 결과가 없는지 본다(`rg`는 AGENTS.md 'Commands'에 없는 대상 확인용 명령이다).
- **commit 경계**: 문서마다 하나씩(`docs(product): …`, `docs(architecture): …`, `docs(backlog): …`), 마지막에 `docs(feature): remove finished text-edit-menu documents`.
