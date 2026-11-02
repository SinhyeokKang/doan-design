# canvas-hand-tool — spec

출처: 실사용 테스트 이슈 "셀렉트 도구 꺼져있으면, 드래그로 캔버스 포지션 이동". 결정은 대화에서 사용자가 했다.

## 사용자

- **사람**: 마우스로 캔버스를 끌어서 옮긴다. 트랙패드가 없거나 휠로 옮기기 불편할 때 쓴다.
- **에이전트**: 얻는 것이 없다. 선택·`doan active`의 규칙은 바뀌지 않는다.

## 문제

- 캔버스는 휠·트랙패드 스크롤로만 이동한다(`viewport.ts` `wheelAction`, `CanvasController.ts` `wheel`). 끌어서 옮기는 경로가 없다.
- 도구모음의 Select는 항상 눌려 있고 끌 수 없다(`CanvasTools.tsx`, PRODUCT §5 item 2 'Toolbar': "Select, always pressed"). iframe 안의 pointerdown은 주입 스크립트가 선택에 쓴다(`main/canvasScript.ts`).

## 결정 (대화에서 확정)

1. 도구모음에 Hand 도구를 더해 Select와 하나만 눌리는 도구로 만든다. 단축키는 Select V, Hand H다.
2. Select 상태에서 Space를 누르고 있는 동안은 잠시 Hand처럼 끌어서 옮긴다. 놓으면 Select로 돌아간다(Figma 관례).
3. Hand는 사람이 직접 Select로 바꿀 때(Select 버튼, V, Esc)까지 유지된다. 다른 캔버스로 가도 유지되고, 앱을 다시 켜면 Select다.

## 완료 조건

- 도구모음에 Select·Hand·Add to conversation이 있다. Select와 Hand 중 하나만 눌려 있다.
- Hand일 때 캔버스 어디서든(프레임 위 포함) 끌면 보드가 따라 움직이고, 클릭은 선택하지 않는다. 커서는 grab, 끄는 동안 grabbing이다.
- Select일 때 Space를 누르고 끌면 보드가 움직이고, Space를 놓으면 선택 클릭이 다시 된다. 입력창·텍스트 필드에 포커스가 있을 때 Space는 글자를 입력할 뿐이다.
- V·H 단축키는 입력창·텍스트 필드에 포커스가 있으면 동작하지 않는다.
- Esc 순서: 열린 메뉴·팝오버 → `/` 목록 → 픽 취소 → Hand를 Select로 → 선택 해제.
- 휠·트랙패드 이동과 확대·축소는 두 도구에서 그대로다.
- Hand로 바꿔도 선택은 그대로다. 선택·`doan active`·Add to conversation은 Hand에서도 지금처럼 동작한다.
- 캔버스 픽(Pick from canvas) 중에는 Hand와 Space 이동이 픽보다 앞서지 않는다. 픽은 지금처럼 끌어서 옮기기 없이 동작하고(PRODUCT §5 item 6 "Pan and pinch still work"는 휠·핀치), 픽을 시작하면 도구는 Select로 돌아간다.

## 비목표

- 가운데 버튼 드래그, 빈 여백 드래그로 이동.
- 관성 스크롤.
- Hand 상태의 기기 저장.
- 끌어서 범위 선택(마키 선택).
