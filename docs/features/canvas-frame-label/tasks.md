# 프레임 이름표 — tasks

순서: 드래프트 → 순수 함수 → 앱 overlay와 누르기 → viewer → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다.

## T1. 드래프트

- `/design-draft canvas-frame-label`로 design.md '드래프트 요청'의 프레임을 그린다. 사용자가 앱에서 확정한다.
- 검증: `doan check <드래프트 경로>`가 통과하고, `doan ls`의 프레임 id가 요청과 같다. 확정한 모습이 design.md에 적혀 있다.
- `[commit]` 드래프트와 design.md

## T2. 순수 함수

- `topFrames`, `labelPlacement`, 누르기 → `select-anchor` 변환, Picker 중 누르기 → 프레임 칩 anchor, 선택 상태 판정(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 경우: 중첩 프레임 제외, `cut` 프레임, 줌 0.25·1·2에서 같은 높이와 프레임을 따라가는 자리, 프레임 화면 폭으로 줄어드는 최대 폭, 최소 폭 아래 숨김, 모든 프레임 0 × 0(재지 않음).
- `[commit]` `test:` → `feat:`

## T3. 앱 overlay와 누르기

- `CanvasController.ts`의 overlay에 이름표 층, 팬·줌 동기 갱신, 누르기와 hover, 다시 읽기 중 유지, `styles.css`.
- 검증:
  - `CanvasController.test.ts`(또는 새 테스트): 이름표 누르기가 그 프레임의 `select-anchor`를 보내고 selection seq를 올린다. hover가 그 프레임의 hover 표시를 보인다. Picker 중에는 그 프레임의 칩이 composer에 들어간다(pick 응답과 같은 칩). Hand, Space 끌기, Capture area에서는 누르기를 받지 않는다. 이름표가 `aria-hidden`이고 Tab 순서에 없다. 팬과 줌에서 React render가 없다. reload 중 이름표가 사라지지 않는다.
  - `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 내보낸 viewer

- `cli/internal/export/viewer/`에 같은 이름표와 누르기를 더하고, 앱 TS에서 오는 부분은 `node app/scripts/viewerInspect.mjs`로 다시 만든다. 프로토타입 파일(`prototype.*`, `player.js`)에는 넣지 않는다.
- 검증: `node app/scripts/viewerInspect.mjs --check`가 통과한다. `app/src/main/exportViewer.test.ts`에 이름표가 있고 누르면 선택되는 경우, 캔버스 맨 위 프레임의 이름표가 overlay 클립에 잘리지 않는 경우, 프로토타입 파일에는 이름표가 없는 경우를 더한다. `go test ./...`가 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`: 이름표(기본·hover·선택·말줄임)를 드래프트와 computed style로 맞추고 `docs/design/canvas.md`에 적는다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`: 격리된 실제 앱에서 이름표 누르기로 선택, hover, 줌 25 %·200 %에서 크기, Hand 끌기, 에이전트 쓰기로 인한 reload 중 유지, 프로토타입 창에 없음. 내보낸 viewer를 Playwright Chromium과 WebKit에서 연다.
  - 검증: 항목마다 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
- `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
- `[commit]` `docs(design): …`, 필요하면 `fix:`·`test:`

## T6. 승격과 정리

- PRODUCT: design.md '형식, 규약, 결정에 미치는 영향'의 PRODUCT 항목을 새 규칙으로 바꾼다.
- ARCHITECTURE: §3 'Canvas view'에 이름표 층(overlay 안, 누르기를 받는 유일한 표시, `select-anchor`)을, §3 'Exported canvas and viewer'에 viewer 이름표를 적는다.
- BACKLOG: T5에서 확인하지 못한 항목을 더한다.
- `docs/features/canvas-frame-label/`를 지운다.
- 검증: 두 문서에 새 규칙이 있고 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-frame-label after promotion`
