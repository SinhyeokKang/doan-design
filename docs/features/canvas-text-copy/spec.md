# canvas-text-copy — spec

캔버스 페이지의 Select 도구에서 캔버스 안 텍스트를 드래그로 선택하고 복사할 수 있게 한다. 목적은 복사뿐이다(사용자 결정, 2026-11-12).

범위: PRODUCT §3 In scope 1 'Show'의 보조 동작이다. §5 'Text edit menu'의 "text can be selected … only where it is worth copying"을 캔버스 텍스트로 넓힌다. 캔버스 파일과 캔버스 DOM을 바꾸지 않으므로 Out of scope 7(편집)에 걸리지 않는다.

## 사용자

- **사람**: 캔버스 페이지에서 초안의 문구(버튼 라벨, 안내 문장, 오류 문구 등)를 복사해 다른 곳(코드, 문서, 메신저)에 붙이려는 사람.
- **에이전트**: 바뀌는 것이 없다. `doan active`, CLI, 스킬, 가이드는 그대로다. 텍스트 선택은 앱의 선택(`doan active`)이 아니다.

## 문제

- Select에서 캔버스 안의 일반 누름은 캔버스로 가지 않는다(`canvasScript.ts` 'Input direction': "a plain primary press is selection and never reaches the canvas, so links, buttons, inputs, text selection and :focus stay inert"). 그래서 텍스트 위를 드래그해도 아무것도 선택되지 않는다.
- 지금 텍스트를 고를 수 있는 길은 ⌥를 누른 채 드래그하는 것뿐이다. ⌥ 누름은 캔버스로 그대로 가서(PRODUCT §5 item 4 "Option-click uses the canvas") 브라우저 기본 선택이 일어난다. 이 방법은 화면 어디에도 안내되지 않고, 같은 누름이 초안의 링크·버튼·스크립트도 움직인다.
- 텍스트 위에서는 커서가 I-beam으로 바뀌어 긁을 수 있어 보이지만, 실제로는 긁히지 않는다.

## 동작

- **시작**: Select에서 수식 키 없이 주 버튼으로 텍스트 위(글자, 또는 그 텍스트를 바로 담은 요소의 padding)를 누르고 화면 기준 4px 이상 끌면 텍스트 드래그가 된다. 기준은 줌과 관계없다. 누름 계열 이벤트(`pointerdown`, `mousedown`, `mouseup`, `click`, `dblclick`)와 포커스는 지금처럼 캔버스로 가지 않는다.
- **범위**: 누른 자리부터 포인터 자리까지다. 시작점이 든 가장 안쪽 프레임 안으로 묶고, 프레임 밖에서 시작하면 그 노트 안으로 묶는다. 캔버스 CSS의 `user-select: none`은 무시한다(사용자 결정). 입력 필드(`input`, `textarea`, `select`)의 값, contenteditable 안, 중첩 iframe 안, Shadow DOM 안의 텍스트는 선택하지 않는다.
- **표시**: 앱이 선택 범위를 캔버스 위 overlay에 사람이 고른 accent 색의 반투명으로 칠한다(사용자 결정). 캔버스 문서의 선택 상태와 스타일은 바꾸지 않는다.
- **드래그 중**: 커서는 텍스트 커서로 고정된다. hover 표시는 숨고 요소 선택 표시는 그대로다. V, H, Space는 무시하고, Esc는 드래그를 끝내고 선택을 지운다. 휠 팬과 핀치는 보드를 움직이고 끝점을 포인터의 새 자리로 갱신한다. Following은 이 드래그를 'a drag'로 보고 도중에 점프하지 않는다.
- **놓기**: 놓으면 hover가 포인터 아래 대상으로 바로 돌아온다. 텍스트 드래그로 끝난 누름은 요소 선택을 바꾸지 않는다. 키보드 포커스는 클릭처럼 캔버스 영역으로 옮긴다(PRODUCT §5 item 2 "A click in the canvas … moves keyboard focus to the canvas area"와 같은 조건). 시작점으로 돌아와 범위가 빈 드래그는 선택 없음이고, 클릭으로도 보지 않는다.
- **움직이지 않은 클릭**: 지금과 같다(요소 선택, 프레임 단계). 더블클릭도 지금처럼 클릭 두 번이다.
- **복사**: ⌘C와 Edit > Copy는 마지막에 만든 선택을 복사한다(사용자 결정). 캔버스 텍스트를 끌면 앱 문서의 선택 가능한 텍스트(대화 말풍선 등)의 선택이 풀리고, 앱에서 텍스트를 새로 선택하면 캔버스 텍스트 선택이 지워진다. 그래서 보이는 선택은 늘 하나다. 일반 텍스트로만 넣는다. 성공 알림은 없다(macOS ⌘C 관례). 상한을 넘으면 앞부분만 복사하고 알리지 않는다(사용자 결정).
- **지우는 때**: 캔버스 안의 다음 주 버튼 누름(여백 클릭 포함), Esc(순서는 아래), Hand로 전환, Picker 시작, Capture area 시작, 캔버스 다시 불러오기·전환·닫기, 캔버스를 그릴 수 없는 상태, 캔버스 페이지를 떠남(Home, Overview, Settings, 모달), 앱에서 텍스트를 새로 선택함. 오른쪽·Ctrl 누름, Space, 휠 팬, 핀치, 줌은 지우지 않는다(사용자 결정: Space는 지우지 않음).
- **Esc 순서**: PRODUCT §5 item 2 'Notices and states'의 사슬에서 "Hand를 Select로" 다음, "선택 한 단계" 앞에 "캔버스 텍스트 선택 지우기"가 들어간다. 텍스트 선택이 있으면 첫 Esc는 텍스트만 지우고 요소 선택은 그대로 둔다(사용자 결정). 텍스트 필드 안의 Esc는 캔버스 텍스트를 지우지 않는다.

## 완료 조건

1. Select에서 캔버스 안 텍스트 위를 수식 키 없이 누르고 화면 4px 이상 끌면, 누른 자리부터 포인터 자리까지가 accent 반투명으로 칠해진다. 드래그 동안 캔버스 문서는 `pointerdown`, `mousedown`, `mouseup`, `click`, `dblclick`, 포커스를 받지 않는다. `pointermove`, `pointerup`, `gotpointercapture`, `lostpointercapture`는 지금처럼 캔버스에 갈 수 있다.
2. 4px 미만에서 끝난 누름은 지금처럼 요소나 프레임을 선택한다. 줌 25%와 400%에서도 기준은 화면 4px다.
3. 텍스트 드래그로 끝난 누름은 요소 선택과 `doan active`를 바꾸지 않는다.
4. 범위는 시작점의 가장 안쪽 프레임(프레임 밖이면 노트)을 넘지 않는다.
5. `user-select: none`인 텍스트도 선택된다. `input`·`textarea`·`select` 값, contenteditable, 중첩 iframe, Shadow DOM 안의 텍스트에서는 드래그가 시작되지 않는다.
6. 컴포저에 포커스가 있거나 대화 말풍선에 선택이 있는 채로 캔버스 텍스트를 끌고 ⌘C를 누르면 캔버스 텍스트가 복사된다. 그 뒤 앱 텍스트를 선택하고 ⌘C를 누르면 앱 텍스트가 복사되고 캔버스 하이라이트는 사라진다. Edit > Copy도 같다. ⌥-클릭으로 캔버스에 포커스가 들어간 뒤에도 같다.
7. 클립보드에는 일반 텍스트만 들어간다. 상한을 넘는 선택은 앞부분만 들어간다.
8. '지우는 때'의 모든 경우에 하이라이트가 사라지고 ⌘C가 캔버스 텍스트를 넣지 않는다. Space, 휠 팬, 핀치, 줌, 오른쪽·Ctrl 누름 뒤에는 남는다. 모달이 열린 상태의 ⌘C는 캔버스 텍스트를 넣지 않는다.
9. Esc가 위 순서를 따른다.
10. 드래그 중 hover 표시가 없고, 놓으면 포인터가 멈춘 채로도 hover가 바로 돌아온다. 드래그 중 V, H, Space는 무시되고, 놓은 뒤에는 지금처럼 동작한다.
11. Hand, Picker, Capture area 중에는 텍스트 드래그가 시작되지 않는다.
12. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## 비목표

- 대화에 인용(텍스트 범위를 앵커 칩으로 붙이기). 이번 목적은 복사뿐이다.
- 캔버스 iframe의 오른쪽 클릭 메뉴. PRODUCT §5 'Text edit menu'의 "Inside the canvas iframe and the thumbnail window there is no menu"는 그대로다.
- Hand 도구와 export viewer의 동작. viewer의 Select는 이미 캔버스를 그대로 쓰게 둔다(PRODUCT §5 item 3).
- 더블클릭 단어 선택, 세 번 클릭 줄 선택(사용자 결정). 더블클릭은 지금처럼 클릭 두 번이다.
- Shift-클릭으로 범위 늘리기, Shift+화살표 같은 키보드 선택, ⌘A로 캔버스 전체 선택.
- 드래그 중 가장자리 자동 스크롤. 휠 팬과 핀치로 범위를 넓힌다.
- 텍스트를 끌어 다른 앱에 놓기(drag and drop).
- 상한 초과 알림.
