# 캔버스 칩 — spec

사이드바의 캔버스 행을 composer로 끌어다 놓으면, 그 캔버스를 가리키는 칩이 글 사이에 들어간다. 사람은 "이 캔버스를 참고해서 새 화면을 그려 줘"처럼 다른 캔버스를 메시지에 넣을 수 있다.

## 사용자

- **사람**: 새 디자인을 Home이나 Overview에서 시작하거나, 캔버스 패널에서 다른 캔버스를 참고하라고 말하는 사람이다. 캔버스 이름을 손으로 쓰지 않고, 사이드바의 행을 끌어다 놓거나 행 메뉴로 넣는다.
- **에이전트**: Doan 앱 대화의 에이전트다. 메시지의 앵커로 그 캔버스의 저장소 상대 경로와 id를 받고, 필요한 만큼 직접 읽는다. 캔버스 패널에서 이어 가는 터미널 세션(legacy external)도 지금처럼 앵커를 받는다. 터미널에서 따로 돌리는 에이전트와 안내(가이드)는 바뀌지 않는다.

## 문제

- 사람의 칩은 지금 열린 캔버스 안의 프레임, 요소, 지점만 가리킨다. Home과 Overview의 composer는 칩을 받지 않는다(PRODUCT §5 item 6 "Home's and the Overview's composers take no chips; a person's chips point only into the open canvas").
- 그래서 다른 캔버스를 참고하라고 하려면 사람이 캔버스 이름이나 경로를 글로 써야 한다. 이름이 비슷한 캔버스가 많거나 하위 폴더에 있으면, 에이전트가 다른 파일을 찾을 수 있다.
- 사이드바의 캔버스 행에는 열기와 행 메뉴만 있고, composer로 보낼 방법이 없다.

## 확정한 결정 (사용자)

- 캔버스 칩을 받는 composer는 캔버스 패널, Overview, Home이다. 칩의 root가 그 composer의 root와 같아야 한다. 같은 프로젝트라도 worktree가 다르면 root가 다르므로 받지 않는다. Home의 root는 Home에서 고른 프로젝트와 worktree다.
- 에이전트에게는 캔버스의 저장소 상대 경로와 캔버스 id를 담은 앵커로 간다. 파일 내용은 붙이지 않는다.
- 끌어다 놓기 말고도 캔버스 행 메뉴에 "Add to message"를 둔다. 키보드로도 칩을 넣을 수 있게 하기 위해서다.
- 캔버스 패널 composer에는 열린 캔버스뿐 아니라 같은 root의 어느 캔버스든 넣을 수 있다.
- 칩을 넣은 뒤 그 캔버스의 이름이 바뀌거나 옮겨져도 칩은 캔버스 id로 따라간다. 보낼 때 그 캔버스가 없으면 칩은 이름 텍스트로 바뀌어 보내진다. 큐, Send now, 돌려받은 초안도 같다.
- 보낸 칩이 지금 열린 캔버스를 가리키면, 누를 때 보드를 Fit한다.

## 완료 조건

1. **끌어다 놓기**:
   - 사이드바의 캔버스 행을 끌어 composer에 놓으면, 놓은 자리에 그 캔버스의 칩이 들어간다. 글 칸 밖(도구 줄, 카드 가장자리)에 놓으면 caret 자리에, caret이 없으면 끝에 들어간다.
   - 끄는 동안 받는 composer는 놓일 자리를 보여 준다. 받지 않는 composer는 놓기를 받지 않고, 이유를 한 줄로 보여 준다. 이유 문구는 행 메뉴의 꺼진 이유와 같다. macOS는 금지 커서를 그리지 않으므로 이 줄이 유일한 신호다.
   - 끄는 모습은 칩 모양이다(드래그 이미지).
   - 끄는 동안 캔버스 보드는 놓기를 받지 않는다. 스레드, Overview 썸네일, 사이드바, 접힌 패널도 놓을 곳이 아니다.
   - 칩을 넣은 뒤 포커스는 그 composer로 가고, caret은 칩 바로 뒤에 있다. 놓기는 undo 한 번으로 되돌아간다.
   - 파일 드롭(첨부)은 지금처럼 동작한다. 캔버스 행을 끈 것만 칩이 된다. 캔버스 끌기에는 파일 드롭 덮개("Drop to attach")를 쓰지 않는다.
   - IME 조합 중, 읽기 전용 composer, 캔버스 pick이나 캡처 중에는 받지 않는다.
2. **행 메뉴**:
   - 사이드바 캔버스 행 메뉴의 맨 위에 "Add to message"가 있다. 누르면 지금 화면의 composer caret 자리에 칩이 들어간다. 지금 화면의 composer는 캔버스 페이지면 캔버스 패널(접혀 있으면 펼친다), Overview면 Overview, Home이면 Home이다. 포커스는 그 composer로 간다.
   - 넣을 수 없으면 항목이 꺼지고, 이유가 tooltip과 접근성 설명으로 나온다. 넣을 수 없는 경우:
     - 다른 root의 캔버스(같은 프로젝트의 다른 worktree는 그 브랜치를 말한다)
     - 캔버스 id가 없거나 다른 캔버스와 겹칠 때
     - 행을 읽을 수 없을 때
     - 그 root의 목록을 아직 읽는 중이거나 문제가 있을 때
     - composer가 입력을 받지 않을 때(이유는 pick과 크기 말풍선의 Add to message가 쓰는 composer 문구를 그대로 쓴다)
     - 32곳 한도에 닿았을 때
     - composer가 없는 화면(Add Projects, Project Settings)
   - 같은 이유로 그 행은 끌 수 없다.
   - 문구는 드래프트의 `copy` 프레임에서 정한다.
3. **받는 composer**: 캔버스 패널, Overview, Home이 칩의 root와 같은 root에서 받는다. 열린 캔버스 자신도 받는다.
   - 프로토타입 창의 composer로는 놓기와 메뉴로 넣을 수 없다. 사이드바가 메인 창에만 있기 때문이다.
   - 다만 돌려받은 초안, Edit and resend, 같은 root composer에서의 붙여넣기로 들어온 캔버스 칩은 프로토타입 창에서도 남는다.
4. **칩**:
   - 칩은 캔버스 이름(파일 이름 줄기, PRODUCT §5 item 2 'Canvas names')과, 사이드바 행과 같은 아이콘을 보여 준다(`.doan/ds/`는 디자인 시스템 아이콘). tooltip은 저장소 상대 경로다. 프레임·요소 칩과 구분되는 모양은 드래프트에서 정한다.
   - 이름은 캔버스 id로 찾은 지금 이름을 따라간다.
   - 한 덩어리로 편집된다. 같은 캔버스를 두 번 넣으면 한 곳으로 센다. 기존 칩과 합쳐 32곳 한도를 함께 쓴다.
   - 복사·붙여넣기는 칩마다 판정한다.
     - 캔버스 칩은 같은 root의 composer에서는 칩으로 남고, 다른 곳에서는 이름으로 붙는다.
     - 프레임·요소·지점 칩은 지금 규칙(같은 캔버스의 composer)을 따른다.
     - 섞인 클립보드는 일부는 칩, 일부는 이름이 된다. 32곳을 넘으면 넘는 것은 이름이다.
5. **누르기**: composer 안의 캔버스 칩과 보낸 말풍선의 캔버스 칩은 같은 일을 한다.
   - 다른 캔버스면 그 캔버스를 deep link처럼 연다. 선택이 풀리고, 패널이 그 캔버스의 대화로 바뀌며, Back에 한 번 들어간다. 지금 대화를 떠난다는 것을 tooltip("Open <name>")이 말한다.
   - 지금 열린 캔버스면 보드를 Fit하고, 방문을 더하지 않는다.
   - 캔버스가 없으면 누른 뒤에 칩 옆에 "No longer in <project>"가 나온다(보낸 프레임 칩의 "not found"와 같은 방식이고, 에이전트 답 칩의 토스트와는 다르다).
   - id를 다른 캔버스와 함께 쓰거나, 목록을 읽는 중이거나 문제가 있으면 토스트를 하나 띄우고 움직이지 않는다.
   - 프로토타입 창에서는 메인 창을 앞으로 가져와 연다.
6. **에이전트가 받는 것**:
   - 메시지의 앵커 목록에 `{canvas: {path, id}}`가 들어간다. `path`는 저장소 상대 경로이고, 글 속 자리는 기존과 같이 `{{n}}`으로 가리킨다.
   - 보낼 때 main이 그 root의 목록에서 id로 캔버스를 찾아 path를 지금 경로로 바꾼다. 찾지 못하면 그 칩은 이름 텍스트가 되고 앵커에서 빠진다.
   - 프롬프트는 앵커를 지금처럼 신뢰하지 않는 데이터로 넣는다.
7. **Home**:
   - Home의 composer가 칩과 앵커를 가진다. 마지막 요청, 시작 초안, 돌려받은 초안, Edit on Home, 종료 뒤 복원된 초안에도 칩이 남는다.
   - Home에서 프로젝트나 worktree를 바꾸면, 다른 root를 가리키는 칩은 이름 텍스트로 바뀐다. 그때 상태 알림을 한 번 한다(예: "2 canvas chips became plain text"). 원래 프로젝트로 돌아와도 칩으로 돌아오지 않는다.
   - Edit on Home의 칩이 지금 Home의 root와 다르면, 같은 방식으로 이름이 된다.
8. **접근성**:
   - 행 메뉴의 "Add to message"로 키보드만으로 같은 일을 할 수 있다.
   - composer 칩의 숨은 종류 접두어는 "Canvas"다(기존 Frame, Element, Point와 같은 방식). 말풍선 칩 버튼의 이름은 "Open <name>"이다. Look Up, 복사, 붙여넣기는 보이는 이름만 쓴다.
9. **되돌림**: 캔버스 앵커가 든 대화를 이전 Doan 빌드에서 열면 그 대화는 읽을 수 없는 대화로 보인다. 다른 대화는 그대로 열린다. ARCHITECTURE §7이 `activity.result` 등에서 이미 받아들인 비용과 같다.
10. 모습은 사용자가 앱에서 확정한 드래프트와 같다(`/design-sync`로 잰다).
11. `/agent-eval` 새 시나리오에서 캔버스 칩을 받은 에이전트가 그 경로의 캔버스를 읽고, 참고만 한 캔버스는 고치지 않는다. Claude Code와 Codex 모두 통과한다.

## 바뀌는 PRODUCT와 ARCHITECTURE 문장 (승격 때)

- PRODUCT §3 In scope 2 "puts frames, elements and spots inside frames into a message as chips"
- PRODUCT §5 item 6:
  - 첫 문장 "the canvas conversation panel's composer holds anchor chips"
  - 칩 종류 "a frame, an element, or a point inside a frame"
  - 복사 규칙 "Chips copied within the same canvas's composers stay chips"
  - "Home's and the Overview's composers take no chips; a person's chips point only into the open canvas"
- PRODUCT §5 item 1 'Canvas row menu'(새 항목과 순서), Home composer(칩)
- PRODUCT §5 item 2 'Canvas names'(칩도 이름을 쓴다), 'Prototype window' 'Toward the main window'(캔버스 칩)
- ARCHITECTURE §7:
  - 앵커 형식과 `validAnchor`
  - 이벤트의 앵커와 되돌림 비용 문단
  - 'Chip field'와 'Renderer primitives'(칩이 들어오는 길: pick, 크기 말풍선, 놓기, 행 메뉴; 클립보드의 `root`)
  - 'Canvas row menu IPC'
  - 'Input and prompt'(보낼 때 경로 확인)
- ARCHITECTURE §14: 새 eval 시나리오

## 비목표

- 프레임이나 요소를 사이드바에서 끌어오기. 사이드바에는 프레임 행이 없다.
- 다른 root의 캔버스 칩.
- 에이전트 답에서 캔버스 전체를 가리키는 링크 형식(`doan:<canvas-id>` 같은 새 형식). 지금은 프레임과 요소 링크만 있다.
- composer에서 `@`로 캔버스를 고르는 피커.
- 끄는 동안 접힌 패널을 펼치는 것(spring-loading).
- 캔버스 파일 내용이나 썸네일을 첨부로 붙이는 것.
- 터미널에서 따로 돌리는 에이전트와 안내(가이드, `doan skill`)의 변경.
