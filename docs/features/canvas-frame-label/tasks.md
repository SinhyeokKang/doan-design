# 프레임 이름표 — tasks

순서: 드래프트 → 순수 함수 → 앱 overlay와 누르기 → viewer → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. `/agent-eval`은 필요 없다(guide, CLI 출력, `doan check`, 스킬 stub이 바뀌지 않는다). viewer markup이 바뀌므로 X1·X2 check는 `--eval` 게이트로 확인한다.

## T1. 드래프트

- `/design-draft canvas-frame-label`로 design.md '드래프트 요청'의 프레임을 그린다. 사용자가 앱에서 확정한다.
- 검증: `doan check <드래프트 경로>`가 통과하고, `doan ls`의 프레임 id가 요청과 같다. 확정한 모습이 design.md에 적혀 있다.
- `[commit]` 드래프트와 design.md

## T2. 순수 함수

- `topFrames`, `labelText`, `labelPlacement`, `labelPress`, `labelState`, 끌기 판정(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 경우:
  - 중첩 프레임 제외, 프레임 없음, 최상위 1,000개
  - `cut` 프레임, id가 같은 프레임 둘(이름표 둘, 각자 자기 index로 `pick-frame`), 빈 id와 빈 제목("<번호>. (no id)", Picker 칩 없음), 공백뿐인 제목(id로), 번호가 drawer와 같음(중첩 프레임 사이에서 건너뜀), 말줄임에서 번호 유지, Play 표시가 drawer의 Play 표시와 같은 프레임에만(prototype 없음·잘못된 표시·`cut` id는 없음), 말줄임에서 Play 아이콘 유지
  - 줌 0.05·0.25·1·2에서 같은 높이와 프레임을 따라가는 자리, 프레임 화면 폭으로 줄어드는 최대 폭, 최소 폭 아래 숨김, 화면 왼쪽이나 위로 일부 나간 프레임, 모든 프레임 0 × 0(재지 않음)
  - Select → `pick-frame {index, id}`, Picker → `{frame: {id, title}}`(MAX_STRING으로 자른 프레임 pick 응답과 같음)
  - 선택 상태: 프레임 자체 선택, 그 안의 요소 선택, 중첩 프레임 선택. hover 상태: 이름표 위, 프레임 안. 마커 상태: working-frame 마커, jump highlight, 선택과 함께일 때
  - 끌기: 4 px 이하는 누르기, 넘으면 칩 끌기. 받기 판정: 같은 캔버스의 대화 패널 composer는 받고, 다른 캔버스·Overview·Home·프로토타입 창은 받지 않으며, IME·읽기 전용·pick 중·보내는 중·32곳 한도는 이유 줄
- `[commit]` `test:` → `feat:`

## T3. 앱 overlay와 누르기

- `CanvasController.ts`의 이름표 층, jump highlight를 working-frame 마커 모습으로 통일(`styles.css`, 타이밍은 그대로), 이름표 마커 상태, 팬·줌 동기 갱신, `pick-frame` 경로(화면 이동 없음)와 reload 중 대기, 포커스, hover rect 덮어쓰기, 누르기 부수 효과, 수식키, 겹침 순서, `styles.css`(forced-colors 규칙 포함).
- 검증:
  - `CanvasController.test.ts`(또는 새 테스트):
    - 누르기가 그 프레임의 `pick-frame`을 보내고 화면을 옮기지 않는다. id가 겹치는 두 번째 프레임과 `cut` 프레임이 자기 프레임으로 선택된다.
    - reload 중 누르기는 새 layout 뒤 선택되고, 그 프레임이 없으면 선택이 그대로이며 toast가 없다.
    - Select 누르기 뒤 포커스가 `section.area`이고, Picker 중에는 composer에 남고 칩이 들어간다.
    - hover: 이름표 위에서 그 프레임의 hover 표시, 이미 선택된 프레임이면 없음, 이름표에서 iframe으로 옮기면 캔버스 hover가 돌아옴, 이름표 hover 중 reload나 프레임 사라짐에서 지워짐.
    - 수식키: ⌘·Shift = 보통 누르기, Option-click은 선택 없음, 오른쪽·Ctrl 무반응. Esc 한 번에 선택 해제.
    - 누르기가 텍스트 범위를 지우고 popover를 닫는다.
    - 끌기: 4 px 넘게 끌면 선택이 바뀌지 않고 보드가 움직이지 않는다. 대화 패널 composer에 놓으면 그 자리에 프레임 칩이 들어가고 포커스와 caret이 칩 뒤로 간다. undo 한 번으로 되돌아간다. 받지 않는 상태에서 이유 줄이 보인다. 보드나 바깥에 놓으면 아무 일도 없다. `dataTransfer`에 표식만 있고 경로·id가 없다. 사이드바 캔버스 행 끌기(canvas-chip)는 그대로 동작한다.
    - Hand, Space 끌기, Capture area에서는 누르기를 받지 않는다. 이름표가 `aria-hidden`이고 Tab 순서에 없다.
    - 팬과 줌에서 React render가 없고 DOM을 다시 만들지 않는다(최상위 1,000개 layout).
    - 반복 reload 동안 `hidden`·`display`·`className` 쓰기가 없다(spy). 첫 layout이 모두 0 × 0이면 마지막 geometry를 유지하고, 프레임이 없는 layout이면 지운다. 같은 href에서 document token이 바뀐 뒤 누르기와 hover가 동작한다. 캔버스를 바꾸면 이름표가 사라진다. `status`가 있거나 목록에 없는 캔버스에서는 그리지 않는다.
  - `forcedColors.test.ts`에 이름표 줄을 더한다.
  - `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 내보낸 viewer

- `shell.html`, `shell.css`, `shell.js`, `inspectSelection.js`, `inspectView.js`에 이름표(배율 없는 층), 새 프레임 선택 명령, hover 덮어쓰기, `[data-pan]` 규칙을 더하고, `viewerInspect.mjs`의 `viewerApp.js` 항목에 `renderer/frameLabels`를 더해 `node app/scripts/viewerInspect.mjs`로 다시 만든다. 프로토타입 파일(`prototype.*`, `player.js`)에는 넣지 않는다.
- 검증: `node app/scripts/viewerInspect.mjs --check`가 통과한다. `app/src/main/exportViewer.test.ts`에 다음을 더하고 `npm --prefix app test`가 통과한다: 이름표가 있고 누르면 그 프레임이 선택된다, id가 겹치거나 잘린 프레임, Hand에서 누르기를 받지 않는다, 캔버스 맨 위 프레임의 이름표가 overlay 클립에 잘리지 않는다, 프로토타입 파일에는 이름표가 없다, `shell.css`의 forced-colors 규칙. `go test ./...`가 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`: 이름표(기본·hover·선택·말줄임·숨김)를 드래프트와 computed style로 맞추고 `docs/design/canvas.md`에 적는다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`(격리된 실제 앱):
  - 줌 25 %와 200 %에서 이름표 높이가 같다(측정값).
  - 이름표를 누른 뒤 `doan active`(격리 `DOAN_RUNTIME`)가 그 프레임을 가리키고 화면이 움직이지 않는다.
  - Hand 끌기가 이름표 위에서도 보드를 끈다. Picker 중 누르기가 칩을 넣는다.
  - 이름표를 대화 패널 composer로 끌어 놓으면 프레임 칩이 들어간다(canvas-chip T1에서 정한 Playwright 끌기 방식, 네이티브 끌기 이미지는 짧은 구간으로 따로). 격리된 가짜 `claude`가 받은 프롬프트에 프레임 앵커가 있다.
  - 에이전트 쓰기로 인한 reload 동안 이름표가 남는다(연속 스크린샷).
  - 보드 맨 위 프레임의 이름표가 헤더나 `section.area`에 잘리지 않는다.
  - 프로토타입 창에 이름표 DOM이 없다.
  - 다크 모드와 에뮬레이션한 forced colors에서 이름표가 보인다. 선택 모습에 바깥 테두리가 있으면 1x와 2x에서 device pixel로 확인한다.
  - 내보낸 viewer를 Playwright Chromium과 WebKit에서 열어 이름표와 누르기, 맨 위 프레임 이름표가 잘리지 않음을 확인한다.
  - 검증: 항목마다 기대값과 관측값, 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
- `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다.
- `[commit]` `docs(design): …`, 필요하면 `fix:`·`test:`

## T6. 승격과 정리

- PRODUCT: design.md '형식, 규약, 결정에 미치는 영향'의 PRODUCT 항목을 새 규칙으로 바꾼다.
- ARCHITECTURE: 같은 곳의 ARCHITECTURE 항목을 고친다(프로토타입 창과 파일에 이름표가 없다는 것 포함).
- BACKLOG: T5에서 확인하지 못한 항목을 더한다.
- `docs/features/canvas-frame-label/`를 지운다.
- 검증: 두 문서에 새 규칙이 있고 기능 디렉터리가 없다(문서를 읽어 확인한다). `rg -n "canvas-frame-label" app cli`가 비어 있다(주석에 slug가 없다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-frame-label after promotion`
