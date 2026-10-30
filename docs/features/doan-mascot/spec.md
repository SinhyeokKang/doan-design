# doan-mascot — spec

마스코트 Doany를 Welcome과 Home에 넣고, 두 화면의 세로 배치를 바꾸고, 패키지 앱 아이콘을 Doany로 바꾼다. buzz-restyle의 리디자인 자식이다([부모 tasks C11](../buzz-restyle/tasks.md)).

- 시안: `.doan/canvases/doan-mascot.html`, 프레임 `mascot-home`(Home · Doany)과 `mascot-welcome`(Welcome · Doany). `mascot-motion` 프레임은 모션 검토용 확대본이다(비목표 참고). 이 시안은 이 자식이 머지될 때까지 두 화면의 정본이다.
- 에셋과 배치 인계: `.doan/assets/doany/README.md`(에셋·배치 인계·출처·검증), `.doan/assets/doany/study/README.md`(모션 스터디·상호작용).
- 이 feature는 PRODUCT §5 Home의 본문 구성 규칙("The body holds a greeting, the composer, … and nothing else")을 바꾼다. 사용자 요청이다. 첫 실행 Welcome의 구성(워드마크·문장·Get started)에도 Doany가 더해진다. 반영은 tasks Z1.

## 사용자

- **사람**: 첫 실행 Welcome과 Home에서 Doany를 본다. Doany는 숨 쉬고 눈을 깜빡이며, 포인터와 입력을 따라 눈을 돌리고, 누르거나 전송하면 뛴다. Finder·Dock·앱 전환기와 macOS 알림·About 패널에서 Doan 앱 아이콘이 Doany로 보인다.
- **에이전트**: 해당 없음. CLI·MCP·스킬·형식은 바뀌지 않는다.

## 문제 (관찰한 사실)

- Welcome과 Home에는 마스코트가 없다. Welcome에는 워드마크·문장·Get started만 있고, Home에는 인사 문구·입력창·추천 프롬프트만 있다.
- Home 본문은 위쪽 고정 여백 152px에서 시작한다(`.home-stage`, `app/src/renderer/styles.css`). 창 높이가 바뀌어도 그룹이 세로 중앙에 오지 않는다.
- 패키지 앱(`app/dist/mac-arm64/Doan.app`)은 Electron 기본 아이콘을 쓴다(`Contents/Info.plist`의 `CFBundleIconFile`이 `electron.icns`다). `app/package.json`의 electron-builder `build.mac`에는 아이콘 설정이 없다.

## 완료 조건

### Doany 표시
- Home 그룹 맨 위, 인사 문구 위에 Doany가 일반 흐름으로 놓인다. 그리기 영역은 114 × 114px다(쉬는 캐릭터는 참고값으로 약 64px).
- Welcome 그룹 맨 위, 워드마크 위에 Doany가 놓인다. 그리기 영역은 142.5 × 142.5px다(참고값 약 80px).
- 두 화면 모두 시안의 `mascot-home`·`mascot-welcome` 프레임과 computed style·박스가 맞는다(`/design-sync`). 아래 '배치'의 예외는 의도한 차이다.

### 모션 — 시안과 동일
앱의 Doany는 시안 스크립트 `.doan/assets/doany/motion/mascot.js`와 같은 수식·상수·연산 순서·셰이더·WebGL 설정으로 움직인다. 같은 시간·입력·난수열을 주면 같은 자세 값(squash, lift, tilt, hat, energy, look, eyeOpen)이 나온다.

- **불러오는 중**: 텍스처가 준비되기 전에는 정지 PNG가 보이고 `data-state`는 없다. 준비되면 캔버스로 바뀐다.
- **쉬는 동안**: 3.3초 주기의 숨, 가장자리 물결, 베레모의 감쇠 스프링. 첫 깜빡임은 2초에 오고, 이후에는 2.5–6초 무작위 간격으로 깜빡인다(한 번에 260ms). 포인터가 1.8초 넘게 움직이지 않으면 시선이 천천히 떠돈다.
- **포인터**: 창 안에서 포인터가 움직이면 눈이 포인터 쪽을 보고 몸이 살짝 기운다. 시안 프레임이 창 전체이므로 범위도 창 전체다.
- **입력(Home만)**: 입력창에 글자를 넣으면(IME 조합 중 입력 포함) 1.4초 동안 시선이 입력창 쪽으로 내려간다(attentive).
- **홉**: Doany를 클릭하거나, 포커스된 Doany에서 Enter·Space를 누르면 뛴다(180ms 준비 → 570ms 비행 → 600ms 안착). 키를 한 번 누르면 홉도 한 번이다. 연타나 키 반복은 시안처럼 매번 홉을 처음부터 다시 시작한다.
- **Home 전송**: 전송이 시작될 때도 뛴다. Send 버튼·전송 키·알림의 Retry가 전송을 시작하는 순간이 기준이다. 전송할 수 없어 아무 일도 일어나지 않으면 뛰지 않는다. 시안에서도 비활성 Send는 누를 수 없다. 전송이 실패하거나 거절되어 Home에 남으면 홉이 끝까지 보인다. 성공해서 Overview로 이동하면 홉은 이동과 함께 끊긴다.
- **줄인 모션**(`prefers-reduced-motion: reduce`): 쉬는 자세로 모든 움직임(숨·깜빡임·시선·베레모·물결·홉)이 멈춘다. 버튼은 남지만 눌러도 뛰지 않는다. 입력은 그대로 쓸 수 있다. 설정이 바뀌면 바로 반영한다.
- **그리지 않는 때**: 화면 밖에 있거나 창이 숨겨지거나 Doany가 가려져 있으면(첫 실행 오버레이 뒤의 Home처럼 `visibility: hidden`) 시간과 그리기를 멈춘다.
- **실패**: WebGL을 쓸 수 없거나, 셰이더를 컴파일하지 못하거나, 텍스처를 읽지 못하거나, 컨텍스트를 잃으면 정지 PNG(`transparent/doany.png`)가 보이고 `data-state="static"`이다.
- **줄인 투명도·강제 색상**: Doany는 바뀌지 않는다.
- **접근성**: Doany는 `aria-label="Make Doany hop"`인 버튼이다. 포커스 링은 공용 규칙(바깥 2px `--border-focus`, 2px 오프셋)을 따르고 반경은 `--radius-container`다. 홉은 스크린 리더에 알리지 않는다.

### 포커스 (Welcome)
- 첫 실행 오버레이의 Tab 트랩은 DOM 순서를 따른다. 포커스된 요소가 트랩 목록에 없으면(h1처럼 `tabIndex={-1}`인 경우) 그 위치에서 DOM 순서상 다음 요소로, Shift+Tab은 이전 요소로 간다. Welcome에서 h1 다음 Tab은 Get started, Shift+Tab은 Doany다. Agent·Project 단계의 heading에서도 같은 규칙을 따른다.
- Welcome을 열 때 h1이 초기 포커스를 받는다. 그 전에 Doany에 포커스 링이 보이지 않는다.

### 배치
- 그룹: Home은 Doany·인사 문구·입력창·추천 프롬프트, Welcome은 Doany·워드마크·소개 문장·Get started. 두 화면 모두 가로 중앙이다.
- 기준 영역: Home은 ContentShell 본문 패널, Welcome은 창 크롬 아래 영역.
- 오프셋: 그룹 중심을 기준 영역 중심에서 Home은 64px, Welcome은 72px 위에 둔다. 뷰포트가 아무리 높아도 이 규칙을 따른다. 고정 위쪽 여백(옛 152px)이나 고정 `margin-top`을 쓰지 않는다.
- **Home 기준 높이**: Home 그룹의 위치는 기준 상태의 그룹 높이로 정한다. 기준 상태는 빈 입력창(2줄)과 추천 프롬프트가 보이는 상태다. 입력 중에는 입력창이 움직이지 않는다.
  - 추천 프롬프트가 사라져도 그 자리를 비워 둔다.
  - 늘어나는 textarea, 이유 줄, 알림은 아래로만 자란다.
- **짧은 창**: 높이가 모자라면 오프셋이 먼저 0까지 줄어든다. 위·아래 32px만 남은 뒤에도 넘치면 스크롤한다. 위쪽 32px은 항상 닿을 수 있고, 내용 없는 빈 스크롤은 생기지 않는다. 시안과 다른 점이다(시안은 고정 아래 패딩으로 스크롤한다).
- 홉하는 동안 그리기 영역 안에서 베레모가 잘리지 않는다.
- Welcome의 Get started는 소개 문장 아래 40px에 있고 높이 48px를 유지한다.
- **측정**: 내용 높이를 적어도 세 가지로 바꿔 잰다. 최소 창 높이 600px, 시안의 780px, 1200px 이상을 포함한다.
  - 오프셋이 다 들어가는 높이에서 그룹 중심은 Home −64px, Welcome −72px다.
  - 600px에서는 위쪽 32px이 남고, 빈 스크롤이 없다.
  - 한 높이의 스크린샷만으로는 통과로 보지 않는다.

### 앱 아이콘
- `npm --prefix app run package`로 만든 `Doan.app`의 아이콘이 흰 배경 Doany(`.doan/assets/doany/white/doany.png`)에서 만든 icns다. `CFBundleIconFile`은 더 이상 `electron.icns`가 아니다.
- 이미지는 가공하지 않고 그대로 쓴다(크기만 1024px로 줄인다). Finder와 Dock에 어떻게 보이는지는 사용자가 직접 보고 확인한다.

## 비목표

- 파비콘(`simple/favicon.ico`, `simple/doany-accent.svg`). 나중에 쓰려고 에셋에 둔 것이다.
- 모션 스터디 프레임(`mascot-motion`)의 검토 컨트롤(Greet·Blink·Hop·Pause)과 420px 확대본. 앱 화면에는 이 컨트롤이 없다.
- 시안 Home 프레임의 데모 동작 중 Doany와 상관없는 것: 입력에 따른 Send 활성화, 추천 프롬프트 숨김, Send 뒤 입력 지우기. 이 동작은 기존 Home 규칙(PRODUCT §5 'Home')을 따른다.
- 전송이 성공한 뒤 Overview로 이동하는 시점은 바꾸지 않는다.
- Home·Welcome 외 화면(Agent·Project 단계, 워크스페이스, Settings > About)의 Doany.
- 개발 실행(`npm --prefix app run dev`)의 Dock 아이콘. 아이콘은 패키지 앱에만 적용한다.
- 서명·공증·dmg(#9 `dist`).
- 다크 모드. 앱은 라이트 단일이다.
