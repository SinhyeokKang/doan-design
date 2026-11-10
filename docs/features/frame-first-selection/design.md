# 프레임 우선 선택 설계

## 근거와 영향

PRODUCT §3 Let humans point 범위 안에서 §5 item 4의 직접 선택 규칙을 바꾼다. item 6 Picker는 유지한다. ARCHITECTURE §3 Selection and inspector의 단일 선택, 수명, 신뢰하지 않는 텍스트 경계를 지킨다.

대상은 `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`와 선택 표시다. 실제 선택 DOM이 프레임이면 그 프레임, 요소면 소속 프레임을 진입 기준으로 파생한다. 별도 영속 스택이나 renderer 왕복 경로 배열을 추가하지 않는다. 클릭 대상과 선택 대상의 현재 DOM 조상에서 공통 프레임을 계산한다. Picker의 대상 해석과 Select의 단계 해석을 분리하고 `doan active`에는 실제 현재 선택 하나만 보낸다.

## 순수 함수와 전이

- 현재 진입 경로·클릭 대상의 프레임 경로 → 다음 프레임/요소 선택.
- 현재 선택·진입 경로 → Esc 한 단계 결과.
- hover 대상·선택 상태 → 다음 클릭 대상 강조.
- 기존 anchor 우선순위로 복구한 실제 노드 → 현재 조상 경로 또는 선택 소실. 중복 ID에서는 기존 selector 복구를 유지한다.

이 네 판정을 `/tdd` 대상으로 삼고 spec의 상태표를 fixture로 고정한다. 선택 해제 시 파생 진입 기준도 사라진다. 노드 재부모화·프레임 속성 제거 후 과거 조상 경로를 복원하지 않는다. 메뉴·IME·입력창이 소유한 Esc는 선택 단계까지 전달하지 않는다. 서랍의 직접 프레임 선택도 같은 기준을 사용하고 Quick Open·Locate의 단순 이동과 구별한다.

## ⌘ 직접 선택

출처는 Figma 공식 [Select layers and objects — Deep select](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects)다. 공식 문서는 macOS의 Command-click으로 중첩 대상을 직접 선택하는 동작을 설명한다. Doan은 이 단축 입력만 참고하며, 일반 클릭의 단계 진입·단계별 Esc·Option 우선순위를 Figma와 동일하다고 주장하지 않는다.

실제 클릭의 `metaKey`로 직접 선택 여부를 정한다. ⌘ 눌림 상태 전달은 hover 순서 채널을 사용하고 선택 seq를 변경하지 않는다. 정지한 포인터에서도 press/release 즉시 hover를 다시 계산하며, blur·⌘Tab·앱/iframe 포커스 이동으로 modifier가 고착되지 않게 한다. 늦은 hover 응답이 실제 클릭 의도를 바꾸지 않는다.

Option·Picker·Capture·Hand·Space의 기존 우선순위를 유지한다. 직접 선택도 trusted primary click과 기존 선택 가능 DOM 범위 안에서만 동작하며 링크·버튼의 기본 동작을 막고 입력 포커스를 선택 경로로 복귀시킨다. Control-click·오른쪽 클릭이나 가려진 형제 순환 기능은 추가하지 않는다. 중첩 iframe은 기존 제약을 유지한다.

## 형식·관례·PoC

진입 상태의 새 공유 형식 없이 기존 선택 DOM에서 계산한다. ⌘hover용 앱 내부 modifier 메시지 검증만 확장하고 CLI 선택 응답과 공유 스키마 버전은 유지한다. 캔버스 속성이나 `doan check` 규칙을 추가하지 않는다. 임의 DOM과 sandbox 경계는 그대로다. 실제 클릭·hover·재로드의 이벤트 순서는 격리 앱 probe로 확인한다.

UI는 DESIGN.md의 선택 표시·도구 토큰을 따른다. 프리셋은 설치된 Doan 0.1.3의 `shape`를 읽었다. 신규 화면이 아닌 기존 Select 동작 확장이다.

## 회귀 예방 근거

- POSTMORTEM 2026-10-23 Hover commands: “keep selection and hover/modifier counters independent at both producer and consumer”. hover가 지연된 선택 응답을 폐기하지 않게 한다.
- POSTMORTEM 2026-10-23 Anchor measurement: “resolve disconnected selection before anchor identity is reported”. DOM 교체 후 선택 복구를 측정보다 먼저 한다.
- POSTMORTEM 2026-11-07 toolbar tooltip: “Compare every Esc case with and without the layer, including the `/` list and IME composition.” 단계별 Esc도 같은 검증을 받는다.
