# 프레임 우선 선택 설계

## 근거와 영향

PRODUCT §3 Let humans point 범위 안에서 §5 item 4의 직접 선택 규칙을 바꾼다. item 6 Picker는 유지한다. ARCHITECTURE §3 Selection and inspector의 단일 선택, 수명, 신뢰하지 않는 텍스트 경계를 지킨다.

대상은 `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`와 선택 표시다. 클릭 대상 DOM 조상에서 프레임 경로를 읽고 현재 진입 위치를 기준으로 다음 선택을 정한다. Picker의 대상 해석과 Select의 단계 해석을 분리한다. 선택된 요소와 진입한 프레임을 별개로 표현하되 `doan active`에는 실제 현재 선택 하나만 보낸다.

## 순수 함수와 전이

- 현재 진입 경로·클릭 대상의 프레임 경로 → 다음 프레임/요소 선택.
- 현재 선택·진입 경로 → Esc 한 단계 결과.
- hover 대상·선택 상태 → 다음 클릭 대상 강조.
- 재로드 후 살아 있는 식별자 → 복구 또는 선택 소실.

이 네 판정을 `/tdd` 대상으로 삼는다. 다른 프레임 전환, 중첩·형제 프레임, 프레임 밖 노트와 빈 공간, 같은 프레임 배경, Hand 전환, Picker 시작·종료를 상태표에 포함한다. 메뉴·IME·입력창이 소유한 Esc는 선택 단계까지 전달하지 않는다.

## 형식·관례·PoC

앱 내부 캔버스 메시지에 진입 상태가 필요할 수 있으나 CLI 선택 응답과 공유 스키마 버전은 유지하는 설계다. 캔버스 속성이나 `doan check` 규칙을 추가하지 않는다. 임의 DOM과 sandbox 경계는 그대로다. 실제 클릭·hover·재로드의 이벤트 순서는 격리 앱 probe로 확인한다.

UI는 DESIGN.md의 선택 표시·도구 토큰을 따른다. 프리셋은 설치된 Doan 0.1.3의 `shape`를 읽었다. 신규 화면이 아닌 기존 Select 동작 확장이다.

## 회귀 예방 근거

- POSTMORTEM 2026-10-23 Hover commands: “keep selection and hover/modifier counters independent at both producer and consumer”. hover가 지연된 선택 응답을 폐기하지 않게 한다.
- POSTMORTEM 2026-10-23 Anchor measurement: “resolve disconnected selection before anchor identity is reported”. DOM 교체 후 선택 복구를 측정보다 먼저 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip: “Compare every Esc case with and without the layer, including the `/` list and IME composition.” 단계별 Esc도 같은 검증을 받는다.
