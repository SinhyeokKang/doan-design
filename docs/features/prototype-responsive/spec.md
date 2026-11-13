# prototype-responsive — spec

출처: 사용자 요청("프로토타입 모드. 지금 fit 밖에 없어? 반응형 느낌을 어케 본다니", "prototype-responsive 따위로 fit 모드 반응형 모드 토글을 추가해야될 것 같음")과 진행 중 지시("모드 토글은 만약 할 수 있다면 캔버스의 툴바와 동일한 스타일 재사용"). 아래 동작은 모두 사용자가 정했다('결정'). 남은 미확인은 design.md 'PoC 의존'의 Fit 축소뿐이다.

## 사용자

- **사람**: 프로토타입 창에서 프레임을 표시된 크기로 고정해 보거나(Fit), 창 크기를 따라 바뀌는 모습을 본다(Responsive).
- **에이전트**: 바뀌는 것이 없다. 표시 `data-doan-prototype="<w>x<h>"`의 형식과 뜻(첫 viewport 크기, ARCHITECTURE §1 convention 14), guide, CLI, `doan check`는 그대로다. 그래서 이 feature에는 `/agent-eval`이 필요 없다.

## 문제 (코드에서 확인한 지금 동작)

- Play, 드로어 선택, Back/Forward는 창을 표시 크기에 맞춘다(`fitPrototypeWindow`: 콘텐츠 폭 = 표시 폭 + 16, 최소 360, 작업 영역 안; 높이 = 표시 높이 + 64, 작업 영역 높이까지). Reload와 같은 프레임의 Play는 창 크기를 유지한다.
- 그 뒤 run iframe은 콘텐츠 패널을 따른다. 높이는 늘 패널 높이이고, 폭은 패널 폭이다. 표시 폭이 344(`PROTOTYPE_NARROW_BELOW`)보다 좁을 때만 그 폭을 지키고 가운데에 놓인다(`prototypeIframeBox`). 사람이 창을 끌어 크기를 바꾸면 `ResizeObserver`가 iframe 크기를 바꾸고, `innerWidth`·`innerHeight`·media query가 따라 바뀐다.
- 그래서 반응형 동작은 지금도 창 가장자리를 끌면 보인다. 하지만 다음이 없다.
  - 모드를 고르는 컨트롤. 창은 처음에 표시 크기와 같으므로 사람은 "fit만 있다"고 읽는다.
  - 창 크기와 상관없이 표시 크기를 지키는 방법. 창을 줄이면 프레임 viewport도 줄고, 작업 영역보다 큰 표시(예: 1440×900을 작은 노트북에서)는 처음부터 표시 크기로 보이지 않는다(높이가 작업 영역에서 잘리고 `innerHeight`가 표시 높이보다 작다).

## 동작

### 두 모드

- **Responsive**: 프레임 viewport가 콘텐츠 패널 전체를 채우고 창을 따른다. 창을 끌거나 형제 feature `prototype-conversation`의 대화 패널이 폭을 가져가면 `innerWidth`·`innerHeight`·media query·container query가 따라 바뀌고 문서가 `resize`를 받는다. 표시 폭이 344보다 좁은 프레임도 패널을 채운다(결정 5).
- **Fit**: 프레임 viewport가 표시 크기(`<w>×<h>` CSS px)로 고정된다. 창 크기를 바꿔도 `innerWidth`·`innerHeight`·media query는 표시 크기 그대로다. 프레임은 콘텐츠 패널 가운데에 놓인다. 패널이 표시 크기보다 작으면 프레임 전체가 보이도록 비율을 지켜 줄인다(결정 1). 키우지는 않는다. 줄여도 viewport 크기와 media query는 바뀌지 않는다.
- 두 모드 모두 Play·드로어·Back/Forward는 지금처럼 창을 표시 크기에 맞춘다. 그래서 막 재생한 프레임은 두 모드에서 같아 보이고, 차이는 창 크기를 바꿀 때와 작업 영역보다 큰 표시에서 생긴다.

### 모드 전환

- 모드를 바꿔도 run을 다시 시작하지 않는다. 입력, 열린 모달, 스크롤, 애니메이션 상태가 남고, iframe 크기만 바뀐다(문서는 `resize`를 받는다). 창 크기도 바꾸지 않는다.
- Reload와 Retry는 모드를 유지한다. 새 Play(main 창의 Play, 드로어, Back/Forward, 형제 feature의 `doan open --prototype`)도 모드를 유지하고, 위의 창 맞춤만 한다.
- 로딩·실패·lost 화면에서도 모드를 바꿀 수 있다. 정지 이미지는 찍힌 자리와 크기를 지키고, 다음 run부터 새 모드로 보인다.
- 기본 모드는 Responsive다(결정 3). 고른 모드는 앱이 도는 동안 main 메모리에 남고, 프로토타입 창을 닫았다 열어도 유지되며, 앱을 다시 시작하면 Responsive로 돌아간다(결정 4). 기기에 저장하지 않는다.

### 모드 툴바

- 콘텐츠 패널 아래쪽 가운데에 떠 있는 툴바다(결정 2). 캔버스 툴바(PRODUCT §5 item 2 'Toolbar')와 같은 모습을 그대로 쓴다: `.doan-floating` 캡슐(50 px 높이), 40 px 버튼 두 개, 눌린 버튼의 채움, ←/→ 이동, 공유 Tooltip. 자리도 캔버스 툴바처럼 패널 아래 가장자리에서 20 위다. 헤더에는 모드 컨트롤이 없다.
- 툴바는 프레임 위에 뜬다. 창 맞춤과 iframe 크기는 툴바 자리를 빼지 않는다. 그래서 툴바는 프레임 아래쪽 가운데의 92 × 50 영역을 가리고, 그 영역의 클릭은 툴바가 받는다. 캡슐 양옆은 프레임이 그대로 받는다. 툴바는 저절로 숨지 않는다.
- 버튼은 "Fit"과 "Responsive"이고 하나만 눌린다(`aria-pressed`). 눌린 버튼을 다시 눌러도 그대로다. Fit의 tooltip은 "Fit to 390 × 844"처럼 재생 중인 프레임의 표시 크기를 붙이고, Responsive의 tooltip은 "Responsive"다(결정 6). 툴바의 접근 이름은 "Prototype viewport"다.
- 글자 단축키는 없다. 프로토타입 창의 키는 프레임 콘텐츠로 가기 때문이다(PRODUCT §5 item 2). 툴바 안에서 Esc는 열린 tooltip만 닫고, 그 밖의 일은 하지 않는다.
- Tab 순서는 Back, Forward, Reload, 프레임 이름, (형제 feature의 Export, 대화 버튼), 모드 툴바의 눌린 버튼, 프레임 콘텐츠, (대화 패널)이다. 툴바는 Tab 정지가 하나이고 ←/→로 다른 버튼에 간다.
- 형제 feature의 대화 패널이 열리면 툴바는 줄어든 콘텐츠 패널의 가운데로 옮겨 간다.
- 로딩·실패·lost 화면의 overlay 위에서도 툴바를 쓸 수 있다. overlay의 장면은 툴바와 겹치지 않게 아래쪽 여백을 둔다.
- 툴바는 view가 없는 첫 순간(Reload가 disabled인 때)만 쓸 수 없다.

## 완료 조건

- 모드 툴바가 콘텐츠 패널 아래 가장자리에서 20 위 가운데에 있고, 캡슐과 버튼의 계산된 스타일이 캔버스 툴바의 Select/Hand와 같다(50 높이, 40 × 40 버튼, 눌림 채움 `--affordance-backdrop-pressed`). 대화 패널을 열면 줄어든 콘텐츠 패널의 가운데로 옮겨 간다(`/design-sync` 측정).
- Responsive에서 창을 640에서 480으로 줄이면 프레임 문서의 `innerWidth`가 624에서 464가 된다. 표시 폭 240 프레임도 패널 폭을 채운다(단위 테스트와 실제 앱 확인).
- Fit에서 같은 창 변경 뒤에도 `innerWidth`·`innerHeight`가 표시 크기(예: 390·844)이고, 패널보다 크면 프레임 전체가 보이도록 줄어든다. 줄인 상태에서 프레임의 버튼을 누르면 그 버튼이 눌린다(실제 앱 확인).
- 모드를 바꿔도 run의 gen이 바뀌지 않고, 프레임 안의 입력 값과 열린 모달이 남는다(단위 테스트와 실제 앱 확인).
- Reload, Back/Forward, 드로어 선택 뒤에도 모드가 같고, 창을 닫았다 다시 Play해도 같다. 앱을 다시 시작하면 Responsive다(단위 테스트).
- 실패·lost 상태로 바뀌며 찍힌 정지 이미지가 Fit에서는 줄인 프레임 자리와 크기 그대로 보인다(main의 캡처 사각형이 모드별 상자를 따른다, 단위 테스트와 실제 앱 확인).
- 360 × 284 창의 실패 화면에서 장면을 끝까지 스크롤하면 Close가 툴바에 가리지 않는다(실제 앱 확인).
- 모드 툴바는 Tab 한 번으로 눌린 버튼에 오고, ←/→로 다른 버튼에 가며, Enter/Space로 바꾼다. 포커스가 있는 버튼의 눌림이 바뀌어도 같은 요소로 남는다(POSTMORTEM 2026-11-13). tooltip이 열린 채 Esc를 누르면 tooltip만 닫힌다(단위 테스트와 실제 앱 확인).
- PRODUCT §5 item 2 'Prototype window', ARCHITECTURE §3 'Prototype window'('Rendering in place', 'Timeout and kill'의 캡처, 'Fit')와 §7 'Prototype window IPC', DESIGN.md 'Frame prototype'이 새 동작을 현재 규칙으로 적는다.

## 비목표

- viewport 크기 표시(결정 7: 필요 없음).
- 폭 프리셋과 viewport 가장자리의 드래그 손잡이(결정 8). 창 가장자리가 지금도 손잡이 역할을 한다.
- viewport 크기를 숫자로 입력하기, 기기 이름 목록, 기기 프레임 그림, 터치 흉내, DPR·user agent 바꾸기.
- 확대(Fit에서 패널이 표시 크기보다 클 때 키우기)와 줌 단계 선택.
- 툴바를 옮기거나 숨기는 기능, 툴바 자리를 프레임 영역에서 빼는 배치.
- 모드를 프레임별로 기억하기, 기기에 저장하기.
- 내보낸 프로토타입 파일의 모드. 파일은 형제 feature `prototype-cli-export`의 결정 5대로 브라우저 viewport를 채운다.
- 표시 형식(`data-doan-prototype`), `doan check`, guide 변경. 최소 높이(BACKLOG.md의 별도 항목).
- 메뉴 막대 항목이나 단축키로 모드 바꾸기.
- 프로토타입 창 헤더 변경. 헤더 오른쪽 [Export][대화 버튼]과 프레임 이름 버튼의 폭은 형제 두 feature가 정한다.

## 결정 (사용자 확인)

1. **Fit에서 패널이 표시 크기보다 작을 때**: 비율을 지켜 줄인다(확대 없음). 구현 전에 PoC로 확인한다.
2. **모드 컨트롤의 자리와 모양**: 헤더가 아니라 콘텐츠 아래쪽에 뜨는 툴바다. 캔버스 툴바처럼 프레임 위에 뜨고, 그 모습(50 px 캡슐, 40 px 버튼, 눌림 채움, ←/→, tooltip)을 그대로 쓴다.
3. **기본 모드**: Responsive.
4. **모드 기억**: 앱이 도는 동안 main 메모리. 창을 닫았다 열어도 유지되고, 앱을 다시 시작하면 기본값이다.
5. **Responsive에서 표시 폭이 344보다 좁은 프레임**: 패널을 채운다. 형제 feature `prototype-conversation`의 같은 문장은 문서 승격 때 맞춘다.
6. **이름**: "Fit"과 "Responsive". Fit의 tooltip은 "Fit to 390 × 844".
7. **크기 표시**: 없다.
8. **폭 프리셋과 드래그 손잡이**: 이번에는 없다.
9. **좁은 창의 헤더**: 모드 컨트롤이 헤더에 없으므로 이 feature가 헤더에 더하는 것이 없다. 360 창에서도 이름 버튼이 들어간다(design.md '헤더').
