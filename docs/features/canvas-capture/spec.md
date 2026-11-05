# canvas-capture — spec

사람의 요청(원문): "캔버스 캡처 도구. 툴에서 활성화 해서 캔버스 내에서 드래그로 캡처 영역 선택. 이미지가 대화창에 들어감."

읽은 뜻: 캔버스 페이지의 도구모음에 캡처 도구를 더한다. 사람이 도구를 켜고 보드 위에서 사각형을 드래그하면, 그 영역의 이미지가 캔버스 대화 패널의 composer에 첨부로 들어간다. 해석이 갈린 점은 사람이 정했고 design '결정'에 있다.

## 범위 확인(scope gate)

- **통과.** PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다.
  - Out of scope 1 'Drawing': 캡처 사각형은 캔버스에 남지 않는 선택 표시다. 사람이 도형을 그리지 않는다.
  - Out of scope 4 'Autonomous agent wake-up': 캡처는 이미지를 composer에 넣을 뿐이고 보내지 않는다. 보내기는 사람의 Send다.
  - Out of scope 5 'Server': 이미지는 이 기기의 userData에 저장되고 업로드되지 않는다.
  - Out of scope 7 'Simultaneous human/agent file editing': 앱은 repo에 아무것도 쓰지 않는다. 이미지는 `<userData>/attachments/` 아래에 있다.
- PRODUCT §3 In scope 2 'Let humans point'에 속한다. 사람이 대화에서 가리키는 방법(칩)에 이미지 한 장을 더한다.
- PRODUCT §5 'Deferred'의 "Screenshots, ref comparison"과는 다른 기능이다. PRODUCT §5 item 3이 Overview 썸네일을 "not the deferred agent screenshot/ref-comparison feature"라고 구분하듯, 미뤄 둔 항목은 에이전트가 렌더 결과를 받는 기능이다. 이 기능은 사람이 고른 영역을 사람의 메시지에 첨부한다. 에이전트용 CLI 명령, 렌더 검사, ref 비교는 만들지 않는다(비목표).
- PRODUCT에 없는 새 규칙이 생긴다: 도구모음 구성(§5 item 2 'Toolbar'), Esc 순서(§5 item 2 'Notices and states'), 첨부 규칙(§5 item 1 'Attachments'). 마지막 task에서 PRODUCT를 고친다. 이 규칙들은 사람이 정했다(design '결정').

## 사용자

- **사람(앱 사용자)**: 캔버스 페이지에서 보이는 한 부분을 이미지로 잘라 대화에 붙인다. 칩으로 가리키기 어려운 것(여러 프레임에 걸친 영역, 프레임 밖의 여백, 렌더 결과 자체의 모양)을 보여 줄 때 쓴다.
- **에이전트**: 받는 형태가 바뀌지 않는다. 이미지는 지금의 첨부와 같은 경로 하나로 온다(ARCHITECTURE §7 'Attachments'). CLI, guide, skill stub, `doan check`는 그대로다.

## 문제(관찰한 사실)

1. 캔버스 페이지에서 사람이 보고 있는 렌더 결과를 대화에 넣으려면 macOS 스크린샷(⌘⇧4)을 찍고 composer에 붙여 넣어야 한다. 앱 안에는 이 길이 없다.
2. 칩(PRODUCT §5 item 6)은 프레임, 요소, 프레임 안의 점만 가리킨다. 프레임 밖은 가리키지 못하고("A target outside every `data-doan-frame` picks nothing"), 여러 프레임에 걸친 영역이나 겹침·잘림처럼 렌더 모양 자체에 대한 말은 칩만으로 전하기 어렵다.
3. macOS 스크린샷에는 앱이 그린 표시(선택 테두리, hover, agent glow, 도구모음, notice)가 같이 찍힌다.

## 완료 조건

용어: **캡처 도구**는 도구모음의 새 버튼, **캡처 모드**는 그 도구가 눌린 상태, **캡처 영역**은 사람이 드래그한 사각형이다.

1. **도구모음.** 캔버스 도구모음에 캡처 버튼이 하나 더 있다(이름 제안 "Capture area", 최종 문구는 `/design-draft`에서, 자리는 Picker 다음, 구분선 앞: design 결정 9). 버튼은 Picker처럼 `aria-pressed`로 캡처 모드를 보이고, 쓸 수 없을 때는 `aria-disabled`로 남아 ←/→로 닿으며, 이유를 tooltip과 accessible description으로 보인다. `CanvasTools.test.tsx`가 순서, 이름, pressed, 이유를 고정한다.
2. **켜고 끄기.** 캡처 버튼을 누르면 캡처 모드가 되고, 다시 누르거나 Esc를 누르면 아무것도 넣지 않고 끝난다. 캡처 모드가 끝나면 그 전 도구(Select 또는 Hand)가 다시 눌린다. 진행 중인 pick은 캡처 모드를 시작하면 취소되고, pick을 시작하면 캡처 모드가 끝난다. 캡처 모드에서 도구모음의 Select·Hand는 캡처 모드를 끝내고 그 도구로 바꾸며, V·H와 Space 드래그는 무시된다(pick과 같은 규칙). Hand에서 시작해도 Hand의 drag layer는 캡처 모드 동안 올라오지 않는다. 휠 패닝과 ⌘·Ctrl 휠 확대는 그대로 된다. 캡처 모드 동안 보드 아래 도구모음 옆에 안내 한 줄이 있다: Picker의 안내처럼 `role="status"`이고 Esc 표시와 "Press Escape to cancel" 같은 화면 읽기용 문장을 갖는다. 모양과 문구는 `/design-draft`가 정한다.
3. **드래그.** 캡처 모드에서 보드 위 포인터는 crosshair이고, 주 버튼 드래그가 보드 영역 안으로 잘린 사각형을 그린다. 드래그 동안 캔버스는 클릭·hover·선택을 받지 않는다(선택은 바뀌지 않는다). 너무 작은 드래그(design §2의 최소 크기 미만)나 클릭은 아무것도 넣지 않고 캡처 모드를 유지한다(design 결정 6). 같은 canvas ID의 reload가 진행 중일 때(새 문서가 아직 layout되지 않음) 포인터를 놓아도 아무것도 넣지 않고 캡처 모드를 유지한다. `pointercancel`, pointer capture를 잃음, 앱이 포커스를 잃음은 진행 중인 드래그만 버리고 캡처 모드를 유지한다.
4. **이미지.** 포인터를 놓으면 캡처 영역에 보이는 그대로의 캔버스 픽셀(그 순간의 확대율, 화면 배율)이 PNG 한 장이 된다. 이미지에는 앱이 그린 표시(선택·hover 테두리, 점프 하이라이트, agent glow와 점, 캡처 사각형 자체, 도구모음, 보드 위 notice, toast)가 없다(design 결정 1·3). 캔버스 밖 보드 바탕이 영역에 들어가면 그 색 그대로 찍힌다.
5. **composer에 들어감.** 포인터를 놓으면 캡처 모드는 바로 끝나고 그 전 도구가 다시 눌린다(design 결정 2). 이미지는 캔버스 대화 패널 composer의 지금 draft에 첨부 칩으로 들어간다. 칩은 바로 "Checking"으로 나타났다가 썸네일을 보인다. 진행은 이 칩으로만 보인다. 칩 이름은 "Canvas capture"다(design 결정 8). 접힌 패널은 펼쳐지고 포커스는 composer로 간다. 패널은 이미지가 들어갈 때 펼쳐진다(design 결정 10).
6. **첨부 규칙.** 캡처 이미지는 붙여 넣은 이미지와 같은 규칙을 따른다: main이 `<userData>/attachments/<id>/`에 PNG로 저장하고, 50 MB를 넘으면 받지 않으며, 보내기 전에 칩을 지우면 파일도 지운다. 보낸 이미지는 그 대화에 남는다. 한 요청의 첨부는 지금처럼 10개까지다.
7. **쓸 수 없을 때.** 캡처 버튼은 다음일 때 쓸 수 없고 이유를 보인다: 캔버스를 보일 수 없을 때(로딩, 실패, 너비 없음, 목록에 없는 페이지, 프로젝트 문제, App이 패널의 composer를 모를 때), composer가 입력을 받지 않을 때(그 이유 문구), composer가 Attach를 막는 상태일 때(터미널 세션을 이어 가는 대화나 레거시 외부 대화, Attach 버튼과 같은 "Files can’t be attached to a terminal session", design 결정 4), 첨부가 이미 10개일 때. page lock 동안은 포커스는 받되 아무것도 하지 않는다. 캡처 모드 중에 캔버스가 바뀌거나 닫히거나, 보드가 더 그려지지 않거나, 캔버스 페이지를 떠나면(Home, Overview, Settings, modal) 캡처 모드가 끝난다. 같은 canvas ID의 reload는 캡처 모드를 유지한다.
8. **실패.** 캡처가 실패하면(빈 이미지, 저장 실패, 50 MB 초과) 넣은 칩을 지우고 이유 한 줄을 toast로 보인다. 보드 위 notice로 보이지 않는다(POSTMORTEM 2026-11-02 'The selection-lost line never left the board'). 캔버스 대화 패널의 알림은 이미 toast로 간다(App의 `onNotice={text => toast.show(text)}`).
9. **보내기.** 보낸 메시지는 지금의 첨부와 같이 이미지 경로를 attachment descriptor로 에이전트에게 준다. 에이전트 프롬프트, 대화 event 형식, `doan active`는 바뀌지 않는다.
10. **검증.** 순수 함수 테스트가 `npm --prefix app test`에서 통과하고, 공유 gate(`node .agents/skills/verify/scripts/verify.mjs`)가 통과하며, `/runtime-test` probe가 격리된 실제 앱에서 드래그 → 칩 → 보내기까지 확인하고 이미지에 앱 표시가 없음을 스크린샷 비교로 남긴다.

## 비목표

- 에이전트가 캔버스 렌더를 받는 기능(CLI 명령, 렌더 검사, ref 비교). PRODUCT §5 'Deferred'에 그대로 남는다.
- Home과 Overview의 composer로 캡처하기. 이 두 화면에는 캔버스가 없다.
- 캡처 이미지에 표시를 그리거나 자르기·편집하기(Out of scope 1 'Drawing').
- 캡처한 영역의 위치(프레임 id, 문서 좌표)를 에이전트에게 함께 보내기(design 결정 7).
- 클립보드로 복사하기, 파일로 저장하기.
- 보이는 화면 밖(스크롤해야 보이는 부분)이나 캔버스 전체를 한 번에 캡처하기.
- 키보드 단축키(design 결정 5). 앱 메뉴 막대 항목(Edit > Pick from Canvas 같은 것)은 비목표가 아니라 아직 정하지 않았다. `/design-draft`에서 정한다(design 결정 5).
- Export viewer의 도구모음에 캡처를 더하기.
