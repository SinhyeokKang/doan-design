# 텍스트 드래그 가장자리 이동 — design

## 영향 범위

- **앱(renderer)**: `app/src/renderer/CanvasController.ts`. 텍스트 드래그 중(`textDragging`) 포인터 위치를 보고 rAF 루프로 `panBy`를 적용하고, 매 단계 뒤 `text-point`를 보낸다(휠 팬과 같은 경로, `wheel()` 참고). 루프는 드래그가 끝나는 모든 경로(`applyText`의 종료, `clearText`, `releaseInput`, blur, reload)에서 멈춘다.
- 새 순수 모듈(예: `app/src/renderer/edgePan.ts`): 아래 '순수 함수'.
- **포인터 위치**: Select의 텍스트 드래그는 캔버스 스크립트가 iframe 안에서 pointer capture로 잡으므로, 앱 문서는 포인터 이동을 받지 못한다. Hand에서는 앱의 drag layer가 포인터를 잡으므로 앱이 직접 받는다. Select에서 쓸 위치의 출처는 PoC로 정한다:
  - 후보 1: main의 `pointer:get`(OS 커서, 이미 있는 채널, ARCHITECTURE §3 'Canvas click focus'). 신뢰할 수 있다.
  - 후보 2: 캔버스 스크립트가 드래그 메시지에 포인터 좌표를 싣는다. 캔버스가 위조할 수 있다(§3 'Untrusted messages'). 위조의 결과가 보드 이동뿐이어도 출처로 쓰려면 근거가 필요하다.
- **내보낸 viewer**(사용자 결정으로 포함): `cli/internal/export/viewer/`와 `node app/scripts/viewerInspect.mjs`.
- **형식**: 바뀌지 않는다(캔버스 스크립트 메시지는 내부 형식이고 persisted schema가 아니다, §3 'Selection'). 후보 2를 고르면 `canvasMessage.ts`의 파싱과 한도를 고친다.
- **스킬과 `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `edgePanVelocity(pointer, area)`: 캔버스 영역 사각형과 포인터 화면 좌표에서 (dx, dy) 방향. 영역 안이면 0, 변에 닿거나 넘으면 그 축의 고정 속도(넘은 거리와 무관). 모서리와 창 밖은 두 축.
- `edgePanStep(view, velocity, elapsed)`: 프레임 간격에 맞춘 이동량(프레임률과 무관한 속도).
- 루프 시작과 멈춤 판정: 텍스트 범위를 끌고 있을 때(`textDragging`, 4 px 문턱을 넘은 뒤)이고 속도가 0이 아닐 때만 돈다. 버튼이 눌려 있다는 것만으로는 돌지 않는다 — 아직 문턱 전인 누르기(`textCheck`)와 텍스트가 아닌 누르기는 제외한다.

## PoC (구현 전, T1)

`.scratch/canvas-text-edge-pan/`의 짧은 probe로 격리된 실제 앱에서 확인한다.

- Select 텍스트 드래그 중 포인터가 변에 닿거나 넘을 때 위치를 얻는지, 그리고 포인터가 캔버스 영역 밖(사이드바, 대화 패널, 헤더 위, 창 밖)으로 나가도 캔버스 스크립트가 pointermove와 pointerup을 계속 받는지(OOPIF pointer capture).
- 포인터가 멈춰 있을 때 앱이 위치를 얻는 방법: `pointer:get` 폴링의 지연과 비용, 또는 스크립트 좌표.
- 보드가 움직인 뒤 `text-point`로 범위 끝이 포인터 아래 지점을 따라가는지(이미 휠에서 쓰는 경로).
- 결과(고른 위치 출처, 측정값)를 이 문서 'PoC 결과'에 적는다.

## postmortem에서 가져온 주의점

- 2026-11-26 "After ⌘Tab away from a Hand text drag, V, H and Space did nothing and the wheel extended the range": 텍스트 드래그는 두 문서에 걸쳐 있다. 이동 루프도 `releaseInput`과 blur에서 반드시 멈춘다.
- 2026-11-23 "An export viewer text drag drew no range when the canvas focus reached the page after the moves": viewer를 포함하면 viewer의 실제 DOM fixture로 확인한다.

## 형식, 규약, 결정에 미치는 영향

- PRODUCT 변경(승격 때): §5 item 4 'Canvas text'의 "no edge auto-scroll"을 지우고 가장자리 이동 규칙을 적는다.
- ARCHITECTURE: §3 'Selection' 'Input'(텍스트 드래그)에 이동 루프와 포인터 위치 출처를 적는다.
- iframe 격리와 신뢰 경계는 그대로다. 캔버스 메시지를 근거로 쓰면 그 이유를 ARCHITECTURE에 적는다.

## 읽은 design preset

- 없음. 새 화면이나 문구가 없는 입력 동작이다.

## 드래프트

- 그릴 모습이 없다(보드가 움직이는 동작). `/design-draft`는 건너뛴다.
