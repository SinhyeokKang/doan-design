# text-edit-menu — tasks

순서: 순수 함수 → shell(`index.ts`) → runtime-test → 승격. 형식 변경과 UI 초안은 없다(design §4, 결정할 점 7). 결정할 점의 답이 추천과 다르면 T1 규칙부터 고친다.

## T1. 순수 함수 `editMenuItems`, `lookUpLabel`

- 새 `app/src/main/editMenu.ts`(Electron import 없음)와 `editMenu.test.ts`. design §2의 규칙과 테스트 사례 전부: 편집 가능·편집 불가+선택·편집 불가+선택 없음, flag별 `enabled`, password처럼 Cut·Copy false, 제안 0·1·여러 개, 편집 불가인데 `misspelled`가 있음, 공백만 선택, 구분선이 연속·맨 앞·맨 뒤에 오지 않음, `mainFrame` false, Look Up label의 공백 접기·30자 자르기·surrogate pair.
- `/tdd`가 테스트를 먼저 쓰고 red를 확인한다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): rules for the text edit menu`

## T2. shell: `context-menu`에서 native 메뉴 띄우기

- `index.ts` `createWindow`에서 메인 창 `webContents`의 `context-menu`를 등록한다. main frame 판정, `ContextMenuParams` → T1 입력, T1 출력 → template(role, `replaceMisspelling`, `showDefinitionForSelection`, separator), `popup({ window, frame: params.frame })`(design §3). thumbnail 창에는 등록하지 않는다.
- 판정과 변환이 순수 함수 밖에 남으면 T1 테스트로 옮길 수 있는지 먼저 본다. `index.ts`에는 이벤트 등록과 Electron 호출만 남긴다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공.
- **commit 경계**: `feat(app): right-click edit menu on text fields`

## T3. `/runtime-test`: 실제 앱의 native 메뉴

- 격리: `app/runtime/environment.ts`의 임시 userData·HOME·SHELL, 임시 repo와 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`, `DOAN_CLI`). 사용자 clipboard는 `app/runtime/clipboard.ts`로 저장하고 끝에 되돌린다. probe는 `.scratch/runtime-test/text-edit-menu/`에 둔다.
- 메뉴 내용: Playwright로 오른쪽 클릭(`button: "right"`)을 보내고, probe 안에서만 main의 `Menu.prototype.popup`을 감싸 띄워진 template(label, role, enabled)을 기록한다. 확인할 곳: Home composer(빈 필드, 선택, chip 포함 선택), 쓸 수 없는 composer, Quick Open, 질문 카드의 password 답(fake 질문이 필요하면 `/runtime-test`가 방법을 정한다), MCP 서버 URL dialog, thread의 선택 텍스트, 선택 없는 thread, 캔버스 iframe 안. 이 오른쪽 클릭이 `context-menu` 이벤트를 일으키는지부터 기록한다.
- 동작: role 항목은 `MenuItem.click`이 아니라 native action(`Menu.sendActionToFirstResponder("cut:")`, `"copy:"`, `"paste:"`, `"selectAll:"`)으로 실행한다(POSTMORTEM 2026-10-25). 확인할 것:
  - composer Copy/Cut → 같은 캔버스 composer에 Paste하면 chip, Home composer에 Paste하면 이름 텍스트.
  - clipboard에 경로 없는 PNG → composer Paste가 붙여넣은 이미지 chip을 만든다. Finder 파일 URL을 clipboard에 쓸 수 있으면 → 경로 첨부. 쓸 수 없으면 그 경우를 미검증으로 적는다.
  - Cut, Paste 뒤 ⌘Z(Edit > Undo click)가 되돌린다.
  - 틀린 단어의 제안이 template에 있고, `replaceMisspelling` 뒤 draft 값이 바뀐다. chip 바로 옆 단어도 본다.
  - Look Up label과 `showDefinitionForSelection` 호출(사전 panel이 보이는지는 화면으로만 알 수 있다).
- 화면: `app/runtime/desktop.ts`로 잠금 해제를 확인한 때만 감싸지 않은 실제 `popup`을 한 번 띄워 screenshot을 남기고, macOS가 더한 항목(Writing Tools 등)을 적는다. 잠겨 있으면 native 모양과 사람의 실제 오른쪽 클릭을 미검증으로 보고한다.
- 검증: probe exit 0과 완료 marker, screenshot, `real-state.ts` 지문이 그대로. 실패하거나 design §7의 가정이 틀리면 해당 결정할 점으로 돌아간다.
- **commit 경계**: 없음(`.scratch/`는 커밋하지 않는다). 관찰은 T4의 BACKLOG·DESIGN 판단에 쓴다.

## T4. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`(영문): §5 'App (Mac)'에 앱 전체의 텍스트 편집 메뉴 규칙을 현재 규칙으로 적는다. 어떤 필드와 선택 텍스트에서 열리는지, 항목과 순서, 맞춤법 제안, composer Paste가 ⌘V와 같다는 것, 캔버스 iframe에는 없다는 것. 근거는 commit 메시지에 쓴다.
- `docs/ARCHITECTURE.md`(영문): §7 'Setup'의 App menu 묶음 옆에 context menu 규칙을 적는다. `editMenu.ts`(순수)와 `index.ts`(등록), main frame 판정, role을 쓰는 이유(Edit 메뉴와 같은 편집 명령이라 chip field의 clipboard 처리를 탐), Undo/Redo를 넣지 않는 이유, renderer의 DOM `contextmenu` `preventDefault`가 메뉴를 없앤다는 제약.
- `docs/BACKLOG.md`: 'Known defects'의 "Text fields have no right-click edit menu (Cut, Copy, Paste). It is app-wide, so buzz-home left it out; no feature owns it." 줄을 지운다. T3에서 확인하지 못한 것(사람의 실제 오른쪽 클릭, native 모양, Finder 파일 Paste 등)은 'not verified in the real app' 줄로 더한다.
- `docs/DESIGN.md`: Doan이 그리는 표면이 없으므로 바꾸지 않는다. T3가 native 메뉴를 화면으로 확인하지 못했으면 그 사실은 BACKLOG에만 적는다.
- `docs/features/text-edit-menu/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과(코드가 함께 merge되는 branch에서). 고친 문서는 `/doc-check`로 확인한다. 디렉터리 삭제 뒤 `test ! -e docs/features/text-edit-menu`, `grep -rn 'features/text-edit-menu' docs AGENTS.md README.md`가 결과 없음(다른 feature의 승격 task와 같은 확인).
- **commit 경계**: 문서마다 하나씩(`docs(product): …`, `docs(architecture): …`, `docs(backlog): …`), 마지막에 `docs(feature): remove finished text-edit-menu documents`.
