# canvas-text-copy — tasks

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다.

1. [ ] **PoC (design.md 'PoC 의존' 1–4).** `.scratch/canvas-text-copy/`에 probe를 두고 격리 앱으로 확인한다. 커밋하지 않는다.
   - 실행: `go build -o <tmp>/doan ./cli/cmd/doan` 후 `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<tmp>`. AGENTS.md의 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME` 격리를 적용한다. 클립보드는 `app/runtime/clipboard.ts`로 저장하고 되돌린다.
   - 결과(날짜, 스크린숏 경로, 선택 색, 복사 성공 여부)를 design.md 'PoC 의존' 아래에 적는다. PoC 1이 실패하면 멈추고 사용자에게 묻는다.
   - 확인: 네 항목 각각의 관찰이 design.md에 있다.
   - **커밋 경계**: `docs(feature): record canvas-text-copy PoC result` (design.md만).
2. [ ] **테스트 (`/tdd`).** design.md '순수 함수' 1–5와 `canvasMessage` 파싱.
   - `textDragState`: 기준 거리 미만은 클릭, 이상은 드래그(경계값 포함).
   - `textCopy`: 앱 선택·포커스된 필드·`defaultPrevented`가 이긴다, 캔버스 페이지가 아니면 `null`, 빈 텍스트는 `null`.
   - `escapeIntent`: 텍스트가 있으면 텍스트 지우기, 없으면 지금 단계.
   - 지우기 전이: Hand, Space down, Picker 시작, Capture area 시작, 캔버스 전환·닫기에서 `clear-text`.
   - 메시지: 상한 초과는 버림(자르지 않음), 잘못된 타입은 거부.
   - 확인: `npm --prefix app test`에서 새 사례가 빨간색.
   - **커밋 경계**: `test: pin canvas text drag, copy and clearing`.
3. [ ] **구현 (`/implement`).** `canvasScript.ts`(드래그 선택, 메시지, `clear-text`), `canvasMessage.ts`, `CanvasController.ts`, renderer `copy` 리스너. 'Input direction' 주석을 고친다.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
   - **커밋 경계**: `feat: select and copy canvas text by dragging in Select`.
4. [ ] **실제 앱 확인 (`/runtime-test`).** 격리 앱에서 짧은 probe로 본다.
   - 텍스트 드래그로 선택이 보이고, 그 사이 초안의 `pointerdown`·`click` 리스너가 불리지 않는다(probe 캔버스에 카운터를 둔다).
   - 움직이지 않은 클릭은 지금처럼 요소를 선택한다. 드래그 뒤 요소 선택은 그대로다.
   - ⌘C와 Edit > Copy가 선택 텍스트를 클립보드에 넣는다. 컴포저에 선택이 있으면 컴포저 쪽이 복사된다.
   - Esc, Hand, Space, Picker, Capture area, 캔버스 전환에서 선택이 사라진다. Capture area 이미지에 하이라이트가 없다.
   - 드래그 뒤 hover가 돌아오고, V·H·Space·Tab이 그대로다(POSTMORTEM 2026-10-23, 2026-11-02).
   - 확인: `/runtime-test` 보고서와 스크린숏, 클립보드 복원 확인.
5. [ ] **승격과 정리.**
   - PRODUCT §5 item 4에 Select 텍스트 드래그와 복사, 지우는 때를 쓴다. §5 'Text edit menu'의 선택 가능한 곳 목록에 캔버스 텍스트를 더한다. §5 item 2 'Toolbar'·Capture area에 지우는 때를 더한다.
   - ARCHITECTURE §3 'Selection and inspector'의 'Input'에 스크립트가 그리는 텍스트 선택과 복사 경로를, 'Caps'에 텍스트 상한을 쓴다.
   - BACKLOG에 남는 미검증 항목(예: 자동 스크롤 없음, 더블클릭 단어 선택 없음)을 적는다.
   - `docs/features/canvas-text-copy/`를 지운다.
   - 확인: 문서만 바뀌므로 대상만 확인한다. `grep -n "text" docs/PRODUCT.md`로 바뀐 §5 item 4 문장을 찾고, `grep -n -i "drag" docs/ARCHITECTURE.md`가 'Input' 문장을 출력한다.
   - **커밋 경계**: 문서마다 따로 (`docs(product): …`, `docs(architecture): …`, `docs(backlog): …`, `docs(feature): remove canvas-text-copy`).
