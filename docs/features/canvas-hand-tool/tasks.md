# canvas-hand-tool — tasks

`/agent-eval`은 해당 없다. CLI 출력·가이드·skill·`doan check` 규칙이 바뀌지 않는다.

## D. 초안

- [x] D1. `/design-draft`: 새 초안 `.doan/canvases/canvas-hand-tool.html`에 도구모음(Select·Hand·Add to conversation; Select 눌림과 Hand 눌림), Select·Hand 툴팁(단축키 V·H), grab·grabbing 커서 표시를 그린다. 기존 `buzz-canvas.html`은 고치지 않는다. 이미 main에 있는 화면이라 `/design-draft`의 'Not for'에 해당하지만, 이 기능에 한해 사용자가 예외로 정했다(`/feature-review`). 사용자가 앱에서 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, `go run ./cli/cmd/doan ls --repo .`에 새 캔버스가 보임, 사용자 확인.

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `toolShortcut`, `escapeStep`, `parseCanvasMessage`의 Space·V·H.
  - `selection.test.ts`(또는 새 파일): `toolShortcut`이 KeyV·KeyH·Space를 `event.code`로 받는다(한글 입력에서 `key`가 "ㅍ"·"ㅗ"여도). ⌘·⌃·⌥, `isComposing`·229, `repeat`, `defaultPrevented`, 편집 대상, 캔버스 페이지 아님에서 무시한다. Space는 대화형 컨트롤(button·`a[href]`·menuitem·treeitem 등)에서 무시한다. Space keyup은 편집 대상에서도 푼다.
  - 같은 파일: `escapeStep` 순서가 픽 취소 → Hand를 Select로 → 선택 해제다. 편집 대상에서는 픽 취소만 한다.
  - `canvasMessage.test.ts`: Space down/up과 V·H를 받는다. 잘못된 값은 거른다.
  - `app/src/main/uiState.test.ts`: `canvasTool: "hand"`는 남고 다른 값은 버려진다. 필드가 없는 예전 파일도 읽힌다.
  - 검증: `npm --prefix app test` green이고, 위 케이스 이름이 테스트 출력에 있다.

── commit: `feat(canvas): hand tool rules` (그 전에 `npm --prefix app run typecheck` 통과) ──

## S. 셸·UI

- [ ] T2. `canvasScript.ts`: Space down/up과 V·H 전달(편집 대상 제외, repeat 무시), iframe 안 Space `preventDefault`, window blur 시 Space-up.
  - `canvasScript.test.ts`(기존 `fakeCanvas` 하네스, "forwards Esc outside editable elements only" 옆): "forwards Space down/up outside editable elements, ignores repeat", "prevents Space scrolling the canvas", "sends Space up on blur", "forwards V and H outside editable elements".
  - 검증: `npm --prefix app test` green.
- [ ] T3. `CanvasController.ts` 도구(`select|hand`)·별도 pick 상태, 끌기 레이어, Space·V·H·Esc, 포커스, hover. `CanvasTools.tsx` Hand 버튼·툴팁·`aria-keyshortcuts`·tabIndex·위쪽 주석. `App.tsx` 레이어 요소 위치와 픽 안내 Esc의 공용 키 변형. `styles.css` 레이어 z-index와 커서, `.doan-picking-esc.doan-kbd` 규칙 삭제. `ds/controls.css`에 `doan-kbd[data-ui-variant="on-prominent"]`와 `data-ui-size="sm"`, 키가 있는 툴팁 배치. `.doan/ds/tooltip.html`에 키가 있는 툴팁을 더한다(design '어두운 바탕의 키 표시').
  - `CanvasController.test.ts`: H로 레이어가 생긴다; V·Esc로 Select가 된다; 입력창의 Esc는 Hand를 풀지 않는다; 픽을 시작하면 레이어가 없고 픽이 끝나면 Hand로 돌아온다; 픽 중 V·H 무시; 캔버스에서 온 Space down은 iframe에 포커스가 있을 때만 레이어를 띄운다; Space up은 항상 받는다; 레이어가 뜰 때 `hover-leave`를 보낸다; Overview·빈 상태를 거쳐도 Hand가 유지된다; 보드를 그리지 않는 상태(loading·failed·noWidth·unlisted)에서는 레이어가 없다; 끄는 중 캔버스 전환·`pointercancel`·`lostpointercapture`에서 끌기가 끝나고 grabbing이 풀린다; 끄는 중 Space up·V는 pointerup 뒤에 적용된다; 끌기는 pointermove 증분으로 `panBy`를 부른다; 캔버스 클릭 뒤 포커스가 `.area`로 가고 픽 중에는 가지 않는다. 앱이 마지막으로 본 포인터가 캔버스 영역 밖이면 선택 메시지가 와도 포커스가 옮겨지지 않는다(위조 대응).
  - App 테스트(기존 ui-state 하네스, POSTMORTEM 2026-11-01의 방식): 저장된 Hand로 시작하면 Hand다; 읽기가 끝나기 전에는 저장을 보내지 않는다; 읽기 전에 V·H로 바꾸면 늦은 저장값이 덮지 않는다; Hand·Select로 바꾸면 합친 상태가 저장된다(Select는 필드 없음).
  - `CanvasTools.test.tsx`: `aria-pressed`가 도구를 따른다(지금 Select 고정을 확인하는 테스트를 바꾼다); Select·Hand onClick; 눌린 도구가 `tabIndex=0`; 툴팁에 V·H.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

## R. 확인

- [ ] T4. `/runtime-test`와 `/design-sync`(D1의 새 초안을 기준으로, 사용자가 정한 예외).
  - 끌기: 배율 1과 다른 배율에서 프레임 위를 (dx, dy)만큼 끌면 보드 translate가 정확히 (dx, dy) 옮겨진다. 끄는 중 창 밖으로 나갔다 돌아와도 이어진다.
  - 선택: Hand에서 클릭·빈 곳 클릭·끌기 전후로 선택과 `doan active`가 같다.
  - 덮지 않음: Hand·Space 상태에서 도구모음 Select, 에이전트 알림 Stop·Open, 로드 실패의 Reload를 누를 수 있다.
  - 키: 입력창에서 Space·V·H 무시, 한글 입력에서 V·H 동작, ⌘H·⌘V가 도구를 바꾸지 않음, 포커스된 버튼에서 Space는 버튼을 누름. 캔버스 클릭 뒤 Space-drag가 composer에 공백을 넣지 않음.
  - Esc 순서, 캔버스 전환 뒤 Hand 유지, 앱을 다시 켠 뒤 Hand 유지와 Select로 바꾼 뒤 다시 켜면 Select, 픽 시작 시 레이어 없음과 픽 끝난 뒤 Hand 복귀.
  - POSTMORTEM: Hand 상태에서 Tab을 누르면 도구 행의 y가 그대로다(아래쪽에 포커스 가능한 컨트롤이 있는 초안에서). ⌥-click 뒤 iframe에서 Space를 누르고 앱에서 떼는 순서와 그 반대 순서. Space만 누르고 포인터를 움직이지 않았을 때 hover 표시가 사라지고 커서가 grab이 된다.
  - 휠·⌘-휠이 레이어 위에서도 된다.
  - 포인터를 composer에 둔 채 위조 선택 메시지를 보내면 composer 포커스가 그대로다. 프레임을 실제로 클릭하면 포커스가 `.area`로 간다.
  - design.md 'T4에서 확인할 가정' 다섯 개를 각각 통과·실패로 적는다.
  - 도구 행 측정: 높이·너비, 두 도구 40px, 눌림 채움을 초안과 대조한다.
  - 검증: probe가 완료 표식과 함께 exit 0으로 끝나고 앞 항목이 모두 통과한다. real-state 확인이 실행 전후로 통과한다. 스크린샷과 측정값을 `.scratch/`에 남긴다.
- [ ] T5. `/code-review` → 고를 항목이 있으면 `/refactor`.
  - 검증: 고른 지적이 모두 반영되었거나 보류 사유가 적혀 있다.
- [ ] T6. `node .agents/skills/verify/scripts/verify.mjs` 통과.

── commit: `feat(canvas): drag to pan with the hand tool and Space` ──

## Z. 정리

- [ ] Z1. 현재 규칙으로 고친다.
  - PRODUCT §5 item 1 시작 복원(마지막 캔버스 도구). PRODUCT §5 item 2 'Toolbar'(도구·단축키·Space·Hand 클릭·캔버스 클릭 포커스), 'Notices and states'(Esc 순서), item 4(일반 클릭 선택, hover, 빈 곳 클릭 해제의 Hand 예외), item 6 픽("Pan and pinch still work", 픽 뒤 도구 복귀).
  - ARCHITECTURE §3 'Input'(끌기 레이어가 먼저 받음, Hand의 휠, 캔버스 클릭 포커스).
  - DESIGN 'Tools row' 두 행(측정값, "Select, then Add to conversation", 툴팁), 'Picking hint' 행의 Esc 설명, 공용 컴포넌트 목록의 `.doan-kbd` 설명("only the canvas picking hint's Esc key").
  - `docs/features/canvas-hand-tool/`을 지운다.
  - 검증:
    - `grep -nE "always pressed|always selects|then cancels a pick, and only then clears" docs/PRODUCT.md` 결과 없음.
    - `grep -n "Select and Add to conversation tools" docs/DESIGN.md` 결과 없음.
    - `grep -n "owns pointer events" docs/ARCHITECTURE.md`가 보여 주는 줄에 끌기 레이어가 있다.
    - `ls docs/features/canvas-hand-tool` 실패.

── commit: `docs(product): hand tool` / `docs(architecture): drag layer input` / `docs(design): canvas tools with hand` / `docs(feature): remove canvas-hand-tool` ──
