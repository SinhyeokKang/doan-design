# 캔버스 거리 측정 — tasks

1. **Figma 추가 관찰. (2026-11-18 완료: 사례 19–26, 변 차이 규칙 확정)** 다음을 관찰해 design.md '관찰 기록' 표에 사례 행으로 더한다.
   - '미확정 규칙'을 정할 사례: 한 축만 겹칠 때 변 차이 0이 있는 경우와 없는 경우, 선택과 대상을 바꾼 경우, 대상 범위가 선택의 안·밖·일부인 경우.
   - 줌 50%·200%의 선 두께와 라벨 크기.
   - 라벨보다 짧은 간격, 라벨끼리 겹치는 경우, 라벨이 화면 밖으로 나가는 경우.
   - 관찰 결과를 사용자에게 보여주고 '미확정 규칙'을 사용자와 정한다. 하나로 설명되지 않아도 임의로 고르지 않는다.
   - 검증: 새 사례가 좌표와 결과를 갖춘 행으로 관찰 표에 있다. '미확정 규칙' 절이 사용자가 정한 규칙으로 바뀌었다.
   - 커밋 경계: `docs(feature): canvas-measure settle measurement rules`
2. **`/design-draft`.** `.doan/canvases/`에 측정 초안을 그린다. 떨어짐, 대각선, 교차, 포함, ⌘⌥ 중첩, 측정 중 외곽선(안쪽 빨간 선, 대상 실선), 크기 말풍선 위의 라벨, forced-colors 모습을 넣는다. 측정 색 토큰과 그 docs/DESIGN.md 줄을 더한다.
   - 검증: `doan check --repo .`와 `doan ls --repo .`에 오류가 없다. 측정 색과 흰 글자의 대비 값이 `contrastPairs` 검사로 기록된다. 사용자가 앱에서 초안을 확인한다.
   - 커밋 경계: `docs(design): canvas-measure draft`
3. **테스트 먼저(`/tdd`).** `measure.ts`에 시그니처만 있는 stub을 두고, 아래 테스트가 import 실패가 아니라 단언 실패로 red인지 확인한다.
   - `measureLines`: 관찰 사례 01–05, 11–17, 19–25(19–24는 양방향).
   - `canvasPx`: `selection.test.ts`의 `describe("sizeLabel")`과 같은 입력에 같은 출력.
   - `canvasScript.test.ts`: Option을 누른 동안에도 hover rect가 온다. 다음 기존 테스트의 기대값을 "⌥ 중에도 rect가 온다"로 바꾼다. "hides when the pointer leaves, ⌥ is held, the wheel turns or over body"(:1400), "an Alt keydown hides the hover until the next move without ⌥"(:1420), "reports Alt release in the canvas at the app's modifier sequence without losing selection"(:1386). seq 순서 단언(stale `hover-alt` 거부, selection seq 불변, :1449 "hover commands cannot supersede selection commands…")은 그대로 둔다. 캔버스 `blur`가 Option도 놓는다.
   - `CanvasController.test.ts`: 측정이 그려지고 사라지는 조건을 테스트 이름 단위로 고정한다.
     - Option keyup(앱)과 캔버스의 Alt `key` 메시지로 측정이 사라진다("takes Alt release from the canvas…"(:780)과 같은 패턴).
     - `appBlur`로 측정이 사라진다(⌘Tab).
     - Option을 누른 동안 Esc, reload 재탐색 실패, 다른 캔버스 열기로 선택이 사라지면 측정이 사라진다.
     - 대상 rect가 `null`이 되거나 `hover-leave`, `pointerOnApp`이면 측정이 사라진다.
     - Picker, Hand, Capture area, 텍스트 드래그, Space 드래그, 캔버스를 덮은 모달·메뉴 중에는 그리지 않는다.
     - 측정이 없으면 Option 중 hover를 숨긴다(spec 4). 기존 "draws the hover mark and hides it on Alt or a wheel"(:828)은 선택이 없는 경우로 유지한다.
     - 사례 10: Box 선택 + ⌥ hover F → F와 Box 사이를 잰다.
     - selection 응답을 기다리는 중 Option을 눌러도 selection seq가 오르지 않는다.
     - 측정 중에도 크기 말풍선 내용과 선택이 바뀌지 않는다.
   - 검증: `npm --prefix app test`에서 새 테스트와 바뀐 테스트가 단언 실패로 red다.
   - 커밋 경계: `test(app): pin canvas distance measurement against observed Figma cases`
4. **순수 함수 구현.** `measureLines`를 구현하고, `selection.ts`의 `px`를 `canvasPx`로 export한다.
   - 검증: `measure.test.ts`와 `selection.test.ts`가 통과한다(`npm --prefix app test`). `npm --prefix app run typecheck`가 통과한다.
   - 커밋 경계: `feat(app): compute distance measurement lines between two rects`
5. **캔버스 스크립트.** `postHover`의 null 조건에서 `alt`를 빼고, 캔버스 `blur`가 Option도 놓게 한다. hover 메시지 형식과 selection 채널은 건드리지 않는다.
   - 검증: `canvasScript.test.ts`가 통과한다(`npm --prefix app test`).
   - 커밋 경계: `feat(app): keep the hover target while Option is held in the canvas`
6. **overlay 그리기.** `appBlur`가 `altHeld`를 놓게 하고, `drawMarks`가 design.md의 조건일 때 측정 선·점선·라벨과 측정 중 외곽선을 그린다.
   - 검증: `CanvasController.test.ts`가 통과한다(`npm --prefix app test`). `npm --prefix app run typecheck`와 `npm --prefix app run lint`가 통과한다.
   - 커밋 경계: `feat(app): measure distances between the selection and the hovered target with Option`
7. **`/design-sync`와 `/runtime-test`.** `.scratch/canvas-measure/fixture.html`(관찰 도형과 같은 좌표의 캔버스)로 실제 앱에서 사례 01·02·03·05·10·11·14를 재현해 초안과 computed style을 맞춘다. 다음도 확인한다.
   - Option을 캔버스 안에서 떼는 포커스 이동 경우, ⌘Tab 경우, 포인터가 캔버스 밖으로 나가는 경우.
   - Option-click 동작이 그대로인지.
   - 측정 중 휠 이동, pinch, 대화 패널·사이드바 크기 변경에 선이 따라오는지.
   - 크기 말풍선과 라벨이 겹치는 경우(사례 14).
   - 줌 50·100·200%의 선 두께와 라벨 크기.
   - 중첩 iframe이나 Shadow DOM 안에서는 지금 hover 규칙대로 동작하는지.
   - 측정 중 메뉴·대화상자·problem overlay가 열리고 닫힐 때 포인터가 멈춰 있어도 측정이 숨고 다시 나오는지. reload로 선택을 다시 찾은 뒤 포인터가 멈춰 있어도 측정이 다시 나오는지.
   - 맞닿은 두 요소(간격 0)의 측정이 Figma 관찰로 정한 규칙대로인지.
   - 검증: 측정값과 화면 기록이 `docs/design/canvas.md`에 남는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
8. **문서 승격과 정리.**
   - PRODUCT §3 In scope 1 'Show'에 거리 측정을 더한다. §5 item 4 'Selection'에 Option-hover 측정 규칙(그리는 조건, Option 중 hover 숨김, 사례 10의 차이)을 현재 규칙으로 쓴다.
   - ARCHITECTURE §3 'Selection'에 측정이 hover 채널만 쓰고 Option 상태의 근거는 `altHeld` 하나라는 점, blur가 Option을 놓는 점을 쓴다.
   - `docs/design/canvas.md`에 측정 모양과 'Overlay marks'의 측정 중 예외를 쓴다. 새 절이면 DESIGN.md의 화면 절 색인도 고친다.
   - 확인하지 못한 것이 있으면 `docs/BACKLOG.md`에 남긴다.
   - `docs/features/canvas-measure/`를 지운다. 관찰용 Figma 파일을 지울지 사용자에게 묻는다.
   - 검증: `grep -rn "docs/features/canvas-measure" docs AGENTS.md .agents app/src` 결과가 비어 있다(초안 `.doan/canvases/canvas-measure.html`은 남으므로 그 이름은 남아도 된다). `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
   - 커밋 경계: 문서별로 나눈다(`docs(PRODUCT): ...`, `docs(ARCHITECTURE): ...`, `docs(design): ...`, `docs(backlog): ...`).
