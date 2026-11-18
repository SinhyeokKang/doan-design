# 캔버스 거리 측정 — design

## 관찰 기록

2026-11-18, figma.com 웹 에디터(Ego Lite, 로그인한 보기 권한, 줌 100%)에서 직접 관찰했다. 관찰용 파일은 DAY1_UX/UI DESIGN 팀 Drafts의 `Doan measure observation (scratch)`(`QRfNvQYNRCgnXp5aKGmOaD`)이다. 캡처 원본은 `.scratch/canvas-measure/`에 있다(커밋하지 않는다). 선 위치는 2배 캡처에서 픽셀로 쟀다.

공식 문서로 확인한 것은 트리거(선택 → Option → hover), 빨간 선, 가로·세로 거리, ⌘+Option 중첩 측정, bounding box 기준 측정뿐이다(help.figma.com 'Measure distances between layers'). 나머지는 아래 관찰에서 나왔다.

도형(캔버스 좌표 x, y, w, h): Parent(100,100,700,560) 프레임, 그 안에 A(200,200,120,80) · B(400,220,100,60) · C(560,400,80,60) · D(270,240,100,90) · E(220,360,90,50) · Box(400,440,220,180) 프레임, Box 안에 F(440.5,490,80,60).

선 표기: `H a→b @y = 값`은 y 위치의 가로 실선, `V a→b @x = 값`은 x 위치의 세로 실선이다. `점선`은 연장선이다.

| # | 선택 | 키 · 포인터 | 결과 |
|---|---|---|---|
| 00 | A | 키 없음 · B | 측정 없음, B에 hover 외곽선 |
| 01 | A | ⌥ · B | `H 320→400 @240 = 80`. 위쪽 변 차이(20)는 표시하지 않음 |
| 02 | A | ⌥ · C | `H 320→560 @240 = 240` + 점선 x=560, y 240→400. `V 280→400 @260 = 120` + 점선 y=400, x 260→560 |
| 03 | A | ⌥ · D (교차) | `H 200→270 @260 = 70`, `H 320→370 @260 = 50`, `V 200→240 @295 = 40`, `V 280→330 @295 = 50` |
| 04 | A | ⌥ · E (아래, 가로 범위가 A 안) | `V 280→360 @260 = 80`. `H 200→220 @240 = 20` + 점선 x=220, `H 310→320 @240 = 10` + 점선 x=310 (둘 다 E 위쪽 변까지) |
| 05 | A | ⌥ · Parent 빈 곳 (포함) | `V 100→200 @260 = 100`, `H 100→200 @240 = 100`, `H 320→800 @240 = 480`, `V 280→660 @260 = 380`. Parent에 빨간 외곽선 |
| 06 | A | ⌥ · 모든 프레임 밖 | 측정 없음 |
| 07 | A | ⌥ · A 자신 | 측정 없음 |
| 08 | 없음 | ⌥ · A | 측정 없음, A에 hover 외곽선 |
| 09 | 없음 | ⌥ · F | 측정 없음, Box에 hover 외곽선 |
| 10 | Box | ⌥ · F | 측정 없음 (Figma에서 F 위의 대상은 Box 자신) |
| 11 | Box | ⌘⌥ · F | `V 440→490 @480.5 = 50`, `H 400→440.5 @520 = 40.5`, `H 520.5→620 @520 = 99.5`, `V 550→620 @480.5 = 70` |
| 12 | F (⌘-click) | ⌥ · Box | 11과 같은 네 선 |
| 13 | E | ⌘⌥ · F | `H 310→440.5 @385 = 130.5` + 점선 x=440.5, y 385→490. `V 410→490 @265 = 80` + 점선 y=490, x 265→440.5 |
| 14 | E | ⌥ · Box | `H 310→400 @385 = 90` + 점선 x=400, y 385→440. `V 410→440 @265 = 30` + 점선 y=440, x 265→400. 라벨 30이 크기 말풍선과 겹쳐도 그대로 그림 |
| 15 | C | ⌥ · Box (교차) | `H 400→560 @450 = 160`, `H 620→640 @450 = 20`, `V 400→440 @590 = 40`, `V 460→620 @590 = 160` |
| 16 | E | ⌥ · D (위, 가로 일부 겹침) | `V 330→360 @265 = 30`. `H 310→370 @385 = 60` + 점선 x=370, y 330→385. 왼쪽 변 차이(50)는 표시하지 않음 |
| 17 | B | ⌥ · A (왼쪽) | `H 320→400 @250 = 80`. `V 200→220 @450 = 20` + 점선 y=200, x 320→500 |
| 18 | A | ⌥ · B 뒤 ⌥ 뗌 | 측정이 바로 사라지고 B의 hover 외곽선만 남음 |

모양 관찰값(줌 100%):
- 선과 라벨 배경은 `rgb(227, 76, 44)` = `#E34C2C`다. 실선과 점선 모두 1px다.
- 라벨은 높이 약 17px pill이다. 숫자 두 자리 기준 너비는 약 22px, 모서리 반경은 약 2px, 글자는 흰색 약 11px다.
- 가로선 라벨은 선 아래 6px에서 시작하고 선의 가운데에 맞춘다. 세로선 라벨은 선 오른쪽 6px에서 시작하고 선의 가운데에 맞춘다.
- 측정 중에는 선택과 대상 모두 바깥 1px 파란 외곽선 안쪽에 빨간 1px 선이 붙는다. 측정이 아닐 때 hover 외곽선은 파란 2px다.
- 선택이 있으면 Option과 관계없이 선택에서 부모 프레임 위·왼쪽 변까지 파란 점선이 나온다(00에도 있음). 이 점선은 측정이 아니라 Figma의 다른 표시이므로 이번 범위에 넣지 않는다.

확인하지 않은 것: 줌 100%가 아닐 때의 선 두께·라벨 크기, 라벨이 화면 밖으로 나갈 때의 위치, 매우 짧은 선(라벨보다 짧은 간격)에서 라벨 위치.

## 미확정 규칙

한 축은 떨어지고 다른 축은 겹칠 때, 겹치는 축의 같은 쪽 변 차이를 언제 표시하는지 관찰로 아직 정하지 못했다.

- 04: 대상(E)의 가로 범위가 선택(A) 안에 있다. 양쪽(20, 10) 모두 표시했다.
- 01: 대상(B)의 세로 범위가 선택(A) 안에 있다. 위쪽(20)을 표시하지 않았다.
- 17: 01과 선택·대상을 바꾼 것이다. 위쪽(20)을 표시했다.
- 16: 범위가 일부만 겹친다. 대상 변이 선택 범위 밖인 오른쪽(60)만 표시했다.

01과 04는 같은 포함 관계인데 결과가 다르다. 01에서는 아래쪽 변이 같은 위치(차이 0)라는 점이 다르다. 후보 규칙은 두 가지다. (a) 차이 0인 변이 하나라도 있으면 그 축의 변 차이를 그리지 않는다. 다만 17에도 0인 변이 있어서 맞지 않는다. (b) 선택의 중심선과 대상 변의 위치 관계로 정한다. tasks.md 1번에서 Figma를 더 관찰해 규칙을 확정하고, 이 절을 확정한 규칙으로 바꾼다.

## 영향받는 구성 요소

- **앱(렌더러)만 바뀐다.** CLI, 스킬, 포맷(`.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지, `sessions.v1`)은 바뀌지 않는다.
- **캔버스 스크립트** (`app/src/main/canvasScript.ts`): `postHover`는 지금 `alt`가 눌려 있으면 대상을 `null`로 보낸다(`:523`). 측정에는 Option을 누른 동안의 대상 rect가 필요하다. Option 상태에서도 대상을 계산해 보내되, 메시지에 그 hover가 Option 상태에서 나온 것인지 표시한다. 대상 규칙은 지금 hover와 같다. `selectTarget(over, meta)`가 ⌘이면 가장 안쪽 대상을, 아니면 다음 클릭의 대상을 고른다. 대상이 선택 자신이면 `null`이다.
- **CanvasController** (`app/src/renderer/CanvasController.ts`): `drawMarks`는 지금 `altHeld`면 hover 표시를 숨긴다(`:2058`). 측정은 `altHeld && selectedRect && hoverRect`일 때만 그린다. 선과 라벨은 overlay(`pointer-events: none`, board transform 밖) 안의 별도 요소에 그린다. 그래서 줌과 관계없이 화면 1px 선과 같은 크기의 라벨이 된다. 측정 중에는 대상의 hover 표시를 측정용 외곽선으로 바꾼다.
- **메시지 검증** (`app/src/renderer/canvasMessage.ts`): `hover` 메시지에 Option 여부를 실을 필드를 더하고 파서를 넓힌다. 이 메시지는 앱 내부 postMessage 계약이고, ARCHITECTURE §11 'Shared formats'의 JSON Schema 대상이 아니다.
- **스타일과 토큰** (`styles.css`, `tokens.css`): 측정 색 `#E34C2C` 토큰 하나와 측정 선·점선·라벨 클래스를 더한다. 색은 버디 accent를 따르지 않고 고정한다. Figma도 바꿀 수 없는 빨강으로 고정한다(공식 문서: "It's not currently possible to change the weight or color of the red measurement line"). 대비와 forced-colors 처리는 `/design-draft`와 `/design-sync`에서 정한다.

## 순수 함수로 뺄 부분 (/tdd 대상)

- `measureLines(selected: CanvasRect, target: CanvasRect): MeasureLine[]` (새 파일 `app/src/renderer/measure.ts`). 두 board rect를 받아 실선과 점선 연장선, 각 선의 값을 board 좌표로 돌려준다. '관찰 기록'의 01–05, 11–17이 테스트 사례다. '미확정 규칙'이 정해질 때까지 01·04·16·17은 관찰 결과 그대로 고정한다.
- `measureLabel(value: number): string`. `sizeLabel`(`selection.ts:107`)과 같은 반올림을 쓴다. 측정과 크기 말풍선이 같은 숫자를 보이도록 같은 헬퍼를 공유한다.
- `measureLabelPlace(line, screen)`. 화면 좌표의 선을 받아 라벨 상자 위치를 돌려준다(가로선은 아래 6px, 세로선은 오른쪽 6px, 가운데 맞춤).
- 좌표 변환은 기존 `boardRectToScreen`과 `boardToScreen`(`viewport.ts:63-71`)을 그대로 쓴다.

## 포맷 변경

없다. JSON Schema, 포맷 버전 `v`, TS·Go 공용 fixture는 바뀌지 않는다.

## 규약 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 캔버스 작성자에게 새로 요구하는 것이 없다.

## 결정 영향

- **PRODUCT §5 item 4 'Selection'이 바뀐다.** 지금은 "Hover highlights what the next click would select"와 "Option-click uses the canvas without changing the selection"만 있다. 지금 코드는 Option을 누르면 hover 표시를 숨긴다. 이번 기능으로 Option을 누른 동안 hover가 측정 대상 표시로 바뀐다. Option-click 동작은 그대로 둔다(2026-11-18 사용자 결정: 측정과 Option-click을 둘 다 유지). 마지막 task에서 PRODUCT를 고친다.
- **Figma와 다른 점 하나.** Doan의 hover 대상은 "다음 클릭이 선택할 대상"이다. 그래서 프레임을 선택한 채 그 안의 요소에 Option-hover하면, Figma(사례 10, 측정 없음)와 달리 그 요소와 프레임 사이를 잰다. 다음 클릭이 그 요소로 한 단계 들어가기 때문이다. 2026-11-18에 사용자가 이 차이를 받아들이고, 측정 대상을 Doan의 hover 대상과 같게 하기로 정했다. 그래서 hover 표시와 측정 대상이 어긋나는 경우가 없다.
- ARCHITECTURE §3 'Selection'의 sandbox iframe, 메시지 순서(`seq`의 selection·hover 두 채널), Option-click 링크 처리는 그대로다. 측정은 hover 채널만 쓰고, selection 채널에는 아무것도 보내지 않는다.

## 관련 postmortem

- **2026-10-23 'Hover stayed hidden across direct reentry and Alt focus transfer'** (`docs/postmortem/2026-10.md`): Alt를 누르고 떼는 일이 서로 다른 문서(앱과 캔버스 iframe)에서 일어날 수 있다. 렌더러가 자기 Alt 플래그를 따로 들고 있다가 hover가 사라졌다. 측정도 같은 `altHeld`를 쓰므로, Option을 캔버스 안에서 떼는 경우 측정이 남지 않는지 같은 실제 입력 검사(포커스를 옮기는 키 순서, 포인터 한 번에 이동)로 확인한다.
- **2026-10-23 'Hover commands discarded pending selection replies'**: selection과 hover/modifier의 순서 카운터를 섞지 않는다. 측정용 필드는 hover 메시지와 `hoverSeq`에만 싣고, selection 응답을 기다리는 중에 Option을 눌러도 selection 바닥값이 움직이지 않아야 한다.

## 읽은 디자인 preset

`shape`(`doan design-skill shape --json`). 기존 화면(캔버스 overlay)에 기능을 더하는 경우라서, 시각 체계는 그대로 두고 새 상태와 상호작용만 정했다. 측정 색은 Figma와 같게 하려는 사용자 요구에 따라 accent 대신 고정 빨강을 쓴다.

## PoC 의존

- '미확정 규칙'(한 축만 겹칠 때의 변 차이)은 관찰이 더 필요하다. tasks.md 1번이다.
- 줌 100%가 아닐 때의 선·라벨 크기도 확인하지 않았다. 같은 관찰에서 확인한다.
