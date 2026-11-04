# export-viewer-chrome — spec

`doan export`가 쓰는 HTML 파일의 viewer를 Doan 캔버스 페이지처럼 보이고 움직이게 한다. 둥근 content panel 안에 헤더와 보드를 두고, 보드 위에 Select·Hand 툴바를 띄운다.

## 사용자

- **사람(받는 사람 포함)**: 내보낸 파일을 브라우저(Chromium, Safari)로 여는 사람. Doan 앱과 같은 모양으로 캔버스를 보고, 손으로 끌어 이동한다.
- **에이전트**: `doan export`의 출력 파일 내용(viewer 부분)만 바뀐다. 명령, 플래그, JSON 응답, 거절 규칙은 바뀌지 않는다.

## 문제

- viewer는 헤더와 보드가 창 전체를 채우고, 앱의 둥근 content panel이 없다(`cli/internal/export/viewer/shell.css`, DESIGN.md 'Canvas row menu and export viewer' Viewer board 행). 앱에서 본 캔버스와 모양이 다르다.
- viewer는 스크롤과 ⌘/Ctrl-휠 확대, ⇧1(Fit)·⇧0(100%)만 된다. 앱의 Hand 도구, Space를 누른 채 끌기, 끌어서 이동이 없다(`shell.js`). 큰 캔버스를 끌어서 둘러볼 수 없다.
- PRODUCT §5 item 3 'Export and viewer'는 "no selection, tools, conversation, comments or Reload"로 viewer에 도구가 없다고 정했고, ARCHITECTURE §3 'Exported canvas and viewer'는 key forwarding을 뺐다고 적었다. 이 feature는 두 규칙을 바꾼다(사용자 요청).

## 완료 조건

1. **content panel.** 창 배경은 앱의 `--bg-app`(#f1f1f2)이고, 그 안에 흰 content panel이 8px 여백을 두고 네 모서리 `--radius-container`(24px)로 둥글게 놓인다. 헤더(캔버스 이름, Frames, 확대 컨트롤)와 보드(`--surface-inset`)는 panel 안에 있다. 앱의 캔버스 페이지에서 대화창을 접었을 때의 panel과 같은 값이다(DESIGN.md 'Canvas area and right panel' Canvas panel 행).
2. **툴바.** 보드 아래 가운데에 앱과 같은 떠 있는 툴바가 있고 Select(V)와 Hand(H) 두 도구가 있다. 하나가 눌려 있고 기본은 Select다. Select에서는 캔버스 내용을 지금처럼 누르고 스크롤한다. Hand에서는 보드 어디를 끌어도 보기가 이동하고, 일반 휠은 이동만 한다. Space를 누르고 있는 동안은 도구와 상관없이 끌어서 이동한다. Esc는 Hand를 Select로 되돌린다. V·H·Space는 키보드 위치(`code`)로 판정해 한국어 자판에서도 동작하고, 글자 입력 칸에서는 동작하지 않는다. 포커스가 캔버스 iframe 안에 있어도 동작한다. 툴바의 ←/→ 이동과 tooltip의 키 표시는 앱과 같다. 선택한 도구는 그 파일을 연 동안만 유지한다(저장하지 않는다).
3. **기존 동작 유지.** Frames, 확대 메뉴(Fit, 100%, 50%, 200%), 버튼, ⌘/Ctrl-휠, ⇧1·⇧0, 높이 측정, 5초 뒤 Fit, JavaScript 없는 대체 화면은 바뀌지 않는다. Fit과 프레임 이동은 툴바를 가리지 않는다(지금 `FIT_INSET`의 아래 80px가 툴바 자리를 이미 둔다).
4. **파일 규칙 유지.** 파일 하나, 네트워크 없음, 외부 요청 없음, 50 MiB 상한, CSP 없음, `sandbox="allow-scripts"`만, `url(`·`@import`·`https?:` 금지(`exportViewer.test.ts`의 파일 규칙)가 그대로 지켜진다. 툴바 아이콘은 inline SVG로 넣는다.
5. **Chromium·Safari.** 위 동작을 Chromium과 Safari(WebKit)에서 확인한다.

## 비목표

- 선택, hover, 픽, anchor, 대화, 댓글, Reload, inspector. viewer는 계속 이것들을 넣지 않는다. Select 도구는 "Doan의 선택"이 아니라 "캔버스 내용을 그대로 조작하는 상태"다.
- Safari의 pinch gesture(BACKLOG에 남은 미확인 항목). ⌘/Ctrl-휠 확대만 지원한다.
- ⌘0·⌘1 단축키(앱에서는 Electron 메뉴 accelerator다). viewer는 지금처럼 ⇧0·⇧1을 쓴다.
- Geist 글꼴 포함(파일 크기 때문에 지금처럼 뺀다).
- 앱의 툴바에 이 feature에서 다른 도구를 더하는 것(canvas-composer-polish가 앱 툴바의 Picker·Export를 맡는다). viewer 툴바는 Select·Hand만 둔다.
