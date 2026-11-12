# canvas-text-copy — spec

캔버스 페이지의 Select 도구에서 캔버스 안 텍스트를 드래그로 선택하고 복사할 수 있게 한다. 목적은 복사뿐이다(사용자 결정, 2026-11-12).

## 사용자

- **사람**: 캔버스 페이지에서 초안의 문구(버튼 라벨, 안내 문장, 오류 문구 등)를 복사해 다른 곳(코드, 문서, 메신저)에 붙이려는 사람.
- **에이전트**: 바뀌는 것이 없다. `doan active`, CLI, 스킬, 가이드는 그대로다. 텍스트 선택은 앱의 선택(`doan active`)이 아니다.

## 문제

- Select에서 캔버스 안의 일반 누름은 캔버스로 가지 않는다(`canvasScript.ts` 'Input direction': "a plain primary press is selection and never reaches the canvas, so links, buttons, inputs, text selection and :focus stay inert"). 그래서 텍스트 위를 드래그해도 아무것도 선택되지 않는다.
- 지금 텍스트를 고를 수 있는 길은 ⌥를 누른 채 드래그하는 것뿐이다. ⌥ 누름은 캔버스로 그대로 가서(PRODUCT §5 item 4 "Option-click uses the canvas") 브라우저 기본 선택이 일어난다. 이 방법은 화면 어디에도 안내되지 않고, 같은 누름이 초안의 링크·버튼·스크립트도 움직인다.
- 텍스트 위에서는 커서가 I-beam으로 바뀌어 긁을 수 있어 보이지만, 실제로는 긁히지 않는다.

## 동작

- Select에서 텍스트 위를 누르고 끌면(누른 자리에서 일정 거리 이상 움직이면) 캔버스 스크립트가 누른 자리부터 포인터 자리까지 텍스트를 선택한다. 누름은 지금처럼 캔버스로 가지 않는다. 캔버스의 스크립트, 링크, 버튼, `:active`, 포커스는 아무것도 받지 않는다.
- 움직이지 않은 클릭은 지금과 같다(요소 선택, 프레임 단계).
- 텍스트 드래그는 앱의 선택(`doan active`)을 바꾸지 않는다.
- ⌘C와 메뉴 Edit > Copy는 캔버스에 텍스트 선택이 있고 앱 쪽에 다른 선택·포커스된 입력이 없을 때 그 텍스트를 일반 텍스트로 클립보드에 넣는다.

## 완료 조건

1. Select에서 캔버스 안 텍스트 위를 누르고 끌면, 누른 자리부터 포인터 자리까지 텍스트가 선택되어 보인다. 드래그 중 캔버스 문서는 `pointerdown`, `mousedown`, `click`, 포커스를 받지 않는다(캔버스 스크립트의 리스너가 불리지 않음).
2. 움직이지 않은 클릭은 지금처럼 요소나 프레임을 선택한다. 끌기 거리 기준 안에서 끝난 누름은 클릭으로 본다.
3. 텍스트 드래그로 끝난 누름은 요소 선택을 바꾸지 않고, `click`으로 요소를 선택하지도 않는다.
4. 텍스트 선택이 있을 때 ⌘C 또는 Edit > Copy를 누르면 선택된 텍스트가 클립보드에 일반 텍스트로 들어간다. 앱의 텍스트 필드나 앱의 선택 가능한 텍스트(PRODUCT §5 'Text edit menu')에 선택이 있으면 그쪽이 이긴다.
5. 텍스트 선택은 다음 때 사라진다: 캔버스 안의 다음 누름(텍스트 드래그 시작 포함), Esc(텍스트 선택이 있으면 첫 Esc는 텍스트만 지우고 요소 선택은 그대로 둔다), Hand로 전환, Space 누름, Picker 시작, Capture area 시작, 캔버스 다시 불러오기·전환·닫기.
6. Hand, Space 드래그, Picker, Capture area 중에는 텍스트 드래그가 일어나지 않는다.
7. 캔버스 CSS가 `user-select: none`을 준 텍스트, 입력 필드(`input`, `textarea`)의 값, 중첩 iframe 안 텍스트는 선택하지 않는다.
8. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.

## 비목표

- 대화에 인용(텍스트 범위를 앵커 칩으로 붙이기). 이번 목적은 복사뿐이다.
- 캔버스 iframe의 오른쪽 클릭 메뉴. PRODUCT §5 'Text edit menu'의 "Inside the canvas iframe and the thumbnail window there is no menu"는 그대로다.
- Hand 도구와 export viewer의 동작. viewer의 Select는 이미 캔버스를 그대로 쓰게 둔다(PRODUCT §5 item 3).
- 선택 범위를 Shift-클릭으로 늘리기, ⌘A로 캔버스 전체 선택.
- 더블클릭 단어 선택, 세 번 클릭 줄 선택. 더블클릭은 지금처럼 클릭 두 번이다(사용자 결정, 2026-11-12).
- 텍스트를 끌어 다른 앱에 놓기(drag and drop).
