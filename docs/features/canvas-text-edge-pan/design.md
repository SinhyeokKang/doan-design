# 텍스트 드래그 가장자리 이동 — design

## 영향 범위

- **앱(renderer)**: `app/src/renderer/CanvasController.ts`. 텍스트 드래그 중(`textDragging`) 포인터 위치를 보고 rAF 루프로 `panBy`를 적용하고, 매 단계 뒤 `text-point`를 보낸다(휠 팬과 같은 경로, `wheel()` 참고). 루프는 드래그가 끝나는 모든 경로(`applyText`의 종료, `clearText`, `releaseInput`, blur, reload)에서 멈춘다.
- 새 순수 모듈(예: `app/src/renderer/edgePan.ts`): 아래 '순수 함수'.
- **포인터 위치**:
  - 앱 Select: 캔버스 스크립트가 iframe 안에서 pointer capture로 잡으므로 앱 문서는 포인터 이동을 받지 못한다. main의 `pointer:get`(OS 커서, 신뢰할 수 있음, ARCHITECTURE §3 'Canvas click focus')을 권한다(PoC로 확정). 형식이 바뀌지 않고, 보드가 움직이는 중 들어오는 오래된 문서 좌표 문제도 없다. 텍스트 드래그 동안 내내 폴링한다: invoke는 한 번에 하나만, `null`이나 reject는 속도 0, 실패 로그는 프레임마다 찍지 않는다.
  - 앱 Hand: drag layer가 포인터를 잡으므로 `layerMove`의 좌표를 쓴다(`pointer:get` 불필요, 창 밖의 음수 좌표 포함).
  - viewer: main이 없으므로 frame이 포인터 좌표를 보내고 shell이 받은 시점에 page 좌표로 바꾼다(`inspectView.js`의 같은 방식). 위조의 결과는 보드 이동뿐이고, 위조된 `wheel` 메시지가 이미 보드를 움직이므로 새 위험이 아니다(근거를 ARCHITECTURE에 적는다).
  - 버튼 상태: `pointer:get`은 버튼 상태를 주지 않는다. Select 이동 중 앱 문서가 `(buttons & 1) === 0`인 포인터 이벤트를 받으면 멈춘다(OOPIF가 capture를 쥔 동안 앱 문서는 이벤트를 받지 않으므로, 받았다는 것은 버튼이 풀렸다는 뜻이다).
- **Select 드래그의 blur 종료**: 지금 `releaseInput`은 Hand 드래그에만 `text-release`를 보내고, 캔버스의 `text-release`는 remote 드래그만 끝낸다. 캔버스 쪽 `blur`는 iframe 창이 포커스를 가질 때만 발화한다. 그래서 Select 드래그가 ⌘Tab 뒤에도 남는다. Select 드래그에도 끝내는 명령(범위는 남김)을 더한다.
- **멈출 자리**: 범위가 담긴 프레임의 사각형(layout 또는 스크립트가 알려 주는 범위 시작 프레임)을 써서, 그쪽 끝이 영역 안에 들어오면 그 축의 속도를 0으로 한다. 어느 출처를 쓸지는 구현에서 정한다.
- **내보낸 viewer**(사용자 결정으로 포함): `cli/internal/export/viewer/`와 `node app/scripts/viewerInspect.mjs`.
- **형식**: 바뀌지 않는다(캔버스 스크립트 메시지는 내부 형식이고 persisted schema가 아니다, §3 'Selection'). 후보 2를 고르면 `canvasMessage.ts`의 파싱과 한도를 고친다.
- **스킬과 `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `edgePanVelocity(pointer, area, rangeFrame)`: 캔버스 영역 사각형(마지막 px 포함)과 포인터 화면 좌표(소수 가능, `null`이면 0)에서 (dx, dy). 영역 안이면 0, 변에 닿거나 넘으면 그 축의 고정 화면 px/초(넘은 거리·줌과 무관). 모서리와 창 밖은 두 축. 범위의 프레임 끝이 그쪽에서 영역 안이면 그 축은 0. 부호 규약: 포인터가 오른쪽 변에 닿으면 보드 내용이 왼쪽으로 온다.
- `clampToArea(pointer, area)`: 범위 끝으로 쓸 점(영역 변으로 자름).
- `edgePanStep(velocity, elapsed)`: 프레임 간격에 맞춘 이동량 (dx, dy)를 돌려준다(첫 프레임 0, 큰 간격은 상한). 앱은 `panBy`, viewer는 `panScroll`로 적용한다. `renderer/edgePan`을 `app/scripts/viewerInspect.mjs`의 `viewerApp.js` 항목에 더해 viewer와 같은 코드를 쓴다.
- 루프 판정은 순수 함수로 따로 빼지 않는다. 매 tick에 `textDragging && document.hasFocus()`를 확인하고(종료를 한 곳에서, postmortem 2026-11-26), 아니면 멈춘다. `dispose`에서 rAF를 취소한다. 텍스트 범위를 끌고 있을 때(4 px 문턱을 넘은 뒤)만 해당하고, 문턱 전 누르기(`textCheck`)와 텍스트가 아닌 누르기는 제외한다.

## PoC (구현 전, T1)

`.scratch/canvas-text-edge-pan/`의 짧은 probe로 격리된 실제 앱에서 확인한다.

- Select 텍스트 드래그 중 포인터가 변에 닿거나 넘을 때 위치를 얻는지, 그리고 포인터가 캔버스 영역 밖(사이드바, 대화 패널, 헤더 위, 창 밖)으로 나가도 캔버스 스크립트가 pointermove와 pointerup을 계속 받는지(OOPIF pointer capture).
- 포인터가 멈춰 있을 때 앱이 위치를 얻는 방법: `pointer:get` 폴링의 지연과 비용, 또는 스크립트 좌표.
- 보드가 움직인 뒤 `text-point`로 범위 끝이 포인터 아래 지점을 따라가는지(이미 휠에서 쓰는 경로).
- viewer: Chromium과 WebKit에서 frame 밖·창 밖으로 나간 포인터의 pointermove·pointerup을 frame이 계속 받는지, 받은 좌표를 shell이 page 좌표로 바꾸는 방법.
- 실제 ⌘Tab에서 blur와 lostpointercapture의 순서(BACKLOG: 실제 ⌘Tab은 아직 확인한 적이 없다).
- 창 밖 확인은 Playwright CDP 마우스로 OS capture를 재현하지 못하므로 네이티브 마우스(computer-use)로 하고, 창을 앞으로 가져온 단계를 보고에 적는다.
- 결과(고른 위치 출처, 측정값)를 이 문서 'PoC 결과'에 적는다.

## postmortem에서 가져온 주의점

- 2026-11-26 "After ⌘Tab away from a Hand text drag, V, H and Space did nothing and the wheel extended the range": 텍스트 드래그는 두 문서에 걸쳐 있다. 이동 루프도 `releaseInput`과 blur에서 반드시 멈춘다.
- 2026-11-23 "An export viewer text drag drew no range when the canvas focus reached the page after the moves": viewer는 실제 DOM fixture와 실제 Safari·Chromium으로 확인한다(viewer 결함을 사용자가 실제 Safari에서 처음 찾은 선례).
- BACKLOG의 알려진 문제: iframe이 화면 밖으로 완전히 밀리면 캔버스 rAF가 멈추고 하이라이트가 놓을 때까지 굳는다. 가장자리 이동으로 이 상태에 쉽게 닿으므로 T5에서 관찰한다('멈출 자리'가 대부분 막는다).

## 형식, 규약, 결정에 미치는 영향

- PRODUCT 변경(승격 때): §5 item 4 'Canvas text'의 "no edge auto-scroll"을 지우고 가장자리 이동 규칙을 적는다.
- ARCHITECTURE: §3 'Selection' 'Input'(텍스트 드래그)에 이동 루프·포인터 위치 출처·Select blur 종료를, §3 'Canvas click focus'에 `pointer:get`의 새 호출자를, §3 'Untrusted messages'에 viewer가 frame 좌표를 쓰는 근거를, §3 'Exported canvas and viewer' 'Tools'에 viewer 경로를 적는다.
- iframe 격리와 신뢰 경계는 그대로다. 캔버스 메시지를 근거로 쓰면 그 이유를 ARCHITECTURE에 적는다.

## 읽은 design preset

- 없음. 새 화면이나 문구가 없는 입력 동작이다.

## 드래프트

- 그릴 모습이 없다(보드가 움직이는 동작). `/design-draft`는 건너뛴다.
